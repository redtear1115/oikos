import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseActionError } from '@/lib/action-errors'
import { MAX_AMOUNT } from '@/lib/validators'
import { splitEqual } from '@/lib/outing/split'
import { coupleNetFromOuting } from '@/lib/outing/foldback'
import {
  OUTING_PARTICIPANT_CAP,
  foldNoteName,
  foldSettlementFor,
  memberParticipantName,
  normalizeCategory,
  normalizeDescription,
  normalizeOutingName,
  normalizeParticipantName,
  normalizeShareIds,
  validateOutingAmount,
} from '@/lib/outing/validate'

/** The action-error code a call throws, or 'no-throw'. */
function codeOf(fn: () => unknown): string {
  try {
    fn()
    return 'no-throw'
  } catch (e) {
    return parseActionError(e)?.code ?? `non-code: ${String(e)}`
  }
}

describe('validateOutingAmount (#943 S-C, F5)', () => {
  it.each([
    [0, 'amount_not_positive'],
    [-1, 'amount_not_positive'],
    [1.5, 'amount_invalid'],
    [Number.NaN, 'amount_invalid'],
    [Number.POSITIVE_INFINITY, 'amount_invalid'],
    ['100', 'amount_invalid'],
    [null, 'amount_invalid'],
    [undefined, 'amount_invalid'],
    [MAX_AMOUNT + 1, 'amount_too_large'],
  ])('rejects %p with %s', (amount, code) => {
    expect(codeOf(() => validateOutingAmount(amount))).toBe(code)
  })

  it('accepts 1 and MAX_AMOUNT', () => {
    expect(validateOutingAmount(1)).toBe(1)
    expect(validateOutingAmount(MAX_AMOUNT)).toBe(MAX_AMOUNT)
  })
})

describe('names (#943 S-C, F6) — limits match the 0066 CHECKs, counted in code points', () => {
  it('outing name: trimmed, 1..100', () => {
    expect(normalizeOutingName('  宜蘭  ')).toBe('宜蘭')
    expect(codeOf(() => normalizeOutingName('   '))).toBe('outing_name_empty')
    expect(codeOf(() => normalizeOutingName(42))).toBe('outing_name_empty')
    expect(normalizeOutingName('名'.repeat(100))).toHaveLength(100)
    expect(codeOf(() => normalizeOutingName('名'.repeat(101)))).toBe('outing_name_too_long')
  })

  it('participant name: 1..40; emoji count as one character, like Postgres char_length', () => {
    expect(normalizeParticipantName('阿傑')).toBe('阿傑')
    expect(codeOf(() => normalizeParticipantName(''))).toBe('outing_participant_name_empty')
    expect(codeOf(() => normalizeParticipantName('x'.repeat(41)))).toBe('outing_participant_name_too_long')
    // 40 emoji = 80 UTF-16 units but 40 characters: allowed.
    expect(codeOf(() => normalizeParticipantName('🍜'.repeat(40)))).toBe('no-throw')
  })

  it('member name from a 60-character OAuth display_name is truncated to 40, not rejected', () => {
    const oauthName = 'A'.repeat(20) + '很長的名字'.repeat(8) // 20 + 40 = 60 characters
    expect(Array.from(oauthName)).toHaveLength(60)
    const name = memberParticipantName(oauthName, '成員')
    expect(Array.from(name)).toHaveLength(40)
    expect(oauthName.startsWith(name)).toBe(true)
  })

  it('member name never splits a surrogate pair and falls back when blank', () => {
    expect(Array.from(memberParticipantName('🍜'.repeat(50), 'x'))).toHaveLength(40)
    expect(memberParticipantName('   ', '成員')).toBe('成員')
    expect(memberParticipantName(null, '成員')).toBe('成員')
  })

  it('description ≤100 or null; category is dropped when unusable', () => {
    expect(normalizeDescription(undefined)).toBeNull()
    expect(normalizeDescription('   ')).toBeNull()
    expect(normalizeDescription(' 午餐 ')).toBe('午餐')
    expect(codeOf(() => normalizeDescription('x'.repeat(101)))).toBe('outing_description_too_long')
    expect(normalizeCategory('food')).toBe('food')
    expect(normalizeCategory('x'.repeat(33))).toBeNull()
    expect(normalizeCategory(7)).toBeNull()
  })

  it('fold note keeps at most 40 characters of the outing name', () => {
    expect(Array.from(foldNoteName('名'.repeat(100)))).toHaveLength(40)
  })
})

describe('share ids (#943 S-C, F5) — server-computed split', () => {
  it('dedupes', () => {
    expect(normalizeShareIds(['a', 'b', 'a', 'b'])).toEqual(['a', 'b'])
  })

  it('rejects empty, non-array and non-string entries', () => {
    expect(codeOf(() => normalizeShareIds([]))).toBe('outing_share_empty')
    expect(codeOf(() => normalizeShareIds('a'))).toBe('outing_share_empty')
    expect(codeOf(() => normalizeShareIds(['a', 3]))).toBe('outing_participant_not_found')
    expect(codeOf(() => normalizeShareIds(['a', '']))).toBe('outing_participant_not_found')
  })

  it('more distinct ids than the cap cannot all be participants', () => {
    const ids = Array.from({ length: OUTING_PARTICIPANT_CAP + 1 }, (_, i) => `p${i}`)
    expect(codeOf(() => normalizeShareIds(ids))).toBe('outing_participant_not_found')
  })

  it('100 over 3 → 34 / 33 / 33, summing to the amount', () => {
    const shares = splitEqual(100, normalizeShareIds(['c', 'a', 'b']))
    expect(shares.map((s) => s.shareAmount)).toEqual([34, 33, 33])
    expect(shares.reduce((n, s) => n + s.shareAmount, 0)).toBe(100)
  })
})

/**
 * The fold must move GroupBalance by exactly the couple's mutual debt.
 * Expected values here are derived independently of coupleNetFromOuting and
 * of foldSettlementFor: the balance delta of a Settlement is +amount when
 * member_a paid and −amount when member_b paid (lib/db/queries/balance.ts),
 * and GroupBalance > 0 means member_b owes member_a.
 */
describe('foldSettlementFor — sign mapping (#943 S-D)', () => {
  const settlementDelta = (s: { paidBy: string; amount: number } | null, memberA: string) =>
    s === null ? 0 : s.paidBy === memberA ? s.amount : -s.amount

  it.each([
    // [scenario, coupleNet, expected balance delta]
    ['B owes A 120', 120, 120],
    ['A owes B 75', -75, -75],
    ['even', 0, 0],
  ])('%s → balance moves by %i', (_label, net, expected) => {
    const fold = foldSettlementFor(net as number, 'user-a', 'user-b')
    expect(settlementDelta(fold, 'user-a')).toBe(expected)
    if (fold) expect(fold.amount).toBeGreaterThan(0)
  })

  it('writes nothing for a solo group, whatever the net', () => {
    expect(foldSettlementFor(500, 'user-a', null)).toBeNull()
  })

  it('end to end on a real outing shape: A pays 300 for A/B/friend, friend repays A', () => {
    // A pays 300 split three ways (100 each); B pays 60 split A/B (30 each);
    // the friend pays A back 100 inside the outing.
    // By hand: B owes A 100 (B's share of A's 300) − 30 (A's share of B's 60) = 70.
    // The friend's 100 is between the friend and A only; it must not fold.
    const expenses = [
      { paidByParticipantId: 'pA', amount: 300, shares: [
        { participantId: 'pA', shareAmount: 100 },
        { participantId: 'pB', shareAmount: 100 },
        { participantId: 'pF', shareAmount: 100 },
      ] },
      { paidByParticipantId: 'pB', amount: 60, shares: [
        { participantId: 'pA', shareAmount: 30 },
        { participantId: 'pB', shareAmount: 30 },
      ] },
    ]
    const settlements = [{ fromParticipantId: 'pF', toParticipantId: 'pA', amount: 100 }]
    const net = coupleNetFromOuting('pA', 'pB', expenses, settlements)
    expect(net).toBe(70)
    expect(settlementDelta(foldSettlementFor(net, 'user-a', 'user-b'), 'user-a')).toBe(70)
  })

  it('member participants passed in the wrong order flip the sign — which is why endOuting resolves them by profile id', () => {
    const expenses = [{ paidByParticipantId: 'pA', amount: 100, shares: [
      { participantId: 'pA', shareAmount: 50 },
      { participantId: 'pB', shareAmount: 50 },
    ] }]
    expect(coupleNetFromOuting('pA', 'pB', expenses, [])).toBe(50)
    expect(coupleNetFromOuting('pB', 'pA', expenses, [])).toBe(-50)
  })
})

describe('telemetry carries no names (#943 S-C, F13)', () => {
  it('actions/outing.ts sends no name / description to captureServer or Sentry', () => {
    const src = readFileSync(join(process.cwd(), 'actions/outing.ts'), 'utf8')
    const calls = src.match(/(captureServer|captureException|captureMessage)\([^)]*\)/g) ?? []
    for (const call of calls) {
      expect(call).not.toMatch(/name|displayName|description|note/i)
    }
    // actionError params are sent to the client and may reach logs: none carry text.
    const params = src.match(/actionError\([^)]*,[^)]*\)/g) ?? []
    expect(params).toEqual([])
  })
})
