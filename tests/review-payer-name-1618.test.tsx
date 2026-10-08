// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { resolveReviewPayerName } from '@/lib/monthlyReview'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'

// #1618 — the monthly review's card 2 (largest expense) stores WHO paid (an
// id), and the page resolves the name only against the two people of the
// chapter being viewed. The id never reaches the client.
//
//   chapter 1  A + B   2026-03-01 → 2026-06-15 (Taipei), epoch e1, closed
//   chapter 2  A + C   2026-06-15 → open,                epoch e2
//   group row today: member_a A, member_b C
//
// Failure this guards: nothing errors; the next partner (C) reads the previous
// partner's (B's) name on card 2 of a month in C's own chapter, or a deleted
// account's real name stays on the other person's past months.
// The same scenarios against the real dev database:
// __tests__/actions/reviewPayerName1618.test.ts.

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const X = '00000000-0000-4000-8000-0000000000ff'

describe('resolveReviewPayerName', () => {
  const closed = { memberAId: A, memberBId: B, memberAName: 'A at close', memberBName: 'B at close' }
  const members = [{ id: A, displayName: 'A live' }, { id: C, displayName: 'C live' }]

  it('a chapter member gets the chapter name (frozen for a closed chapter), including the viewer', () => {
    expect(resolveReviewPayerName(B, closed, members)).toBe('B at close')
    expect(resolveReviewPayerName(A, closed, members)).toBe('A at close')
  })

  it('anyone outside the chapter is unknown — never looked up elsewhere', () => {
    expect(resolveReviewPayerName(C, closed, members)).toBeNull() // C is in `members`, but not in this chapter
    expect(resolveReviewPayerName(X, closed, members)).toBeNull()
  })

  it('a solo chapter never matches a null member B', () => {
    expect(resolveReviewPayerName(X, { memberAId: A, memberBId: null, memberAName: 'A', memberBName: null }, [])).toBeNull()
  })

  it('no chapter row: only the page\'s member rows; no payer id → null', () => {
    expect(resolveReviewPayerName(C, null, members)).toBe('C live')
    expect(resolveReviewPayerName(B, null, members)).toBeNull()
    expect(resolveReviewPayerName(null, closed, members)).toBeNull()
  })
})

describe('card2BodyNoName copy (4 locales)', () => {
  it('exists, keeps {description}/{amount}, and has no name slot or dangling payer verb', () => {
    for (const [loc, t] of [['zh-TW', zhTW], ['zh-CN', zhCN], ['en', en], ['ja', ja]] as const) {
      const s = t.monthlyReview.card2BodyNoName
      expect(s, loc).toContain('{description}')
      expect(s, loc).toContain('{amount}')
      expect(s, loc).not.toContain('{name}')
      expect(s, loc).not.toMatch(/付的|paid|さんが/)
    }
    expect(zhTW.monthlyReview.card2BodyNoName).toBe('最大一筆：「{description}」，{amount}')
    expect(zhCN.monthlyReview.card2BodyNoName).toBe('最大一笔：「{description}」，{amount}')
    expect(en.monthlyReview.card2BodyNoName).toBe('Largest: "{description}", {amount}')
    expect(ja.monthlyReview.card2BodyNoName).toBe('いちばん：「{description}」、{amount}')
  })
})

// ─── the page: resolution and what crosses to the client ──────────────────────

const TPE = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000)
const CH1 = { startedAt: TPE(2026, 3, 1), endedAt: TPE(2026, 6, 15), epochId: 'e1', isPast: true }
const CH2 = { startedAt: TPE(2026, 6, 15), endedAt: null, epochId: 'e2', isPast: false }
const GROUP = { id: 'g1', memberA: A, memberB: C }
const EPOCH_MEMBERS: Record<string, {
  memberAId: string; memberBId: string | null; memberAName: string | null; memberBName: string | null
}> = {
  e1: { memberAId: A, memberBId: B, memberAName: 'A at close', memberBName: 'B at close' },
  e2: { memberAId: A, memberBId: C, memberAName: 'A', memberBName: 'C' },
}
// Live profiles carry later names; B's profile row exists (the leak would read it).
const PROFILES = [
  { id: A, displayName: 'A renamed later', avatarUrl: null },
  { id: B, displayName: 'B LIVE NAME', avatarUrl: null },
  { id: C, displayName: 'C', avatarUrl: null },
]

let viewer = A
let window: typeof CH1 | typeof CH2 = CH1
let payer: string | null = B
let requestedIds: string[] = []

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) },
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: async () => ({ id: viewer }) }))
vi.mock('@/lib/db/queries/epoch', () => ({
  getEpochMembers: async (id: string) => EPOCH_MEMBERS[id] ?? null,
  resolveViewerEpochContext: async () => ({ group: GROUP, window }),
}))
vi.mock('drizzle-orm', async (orig) => ({
  ...(await orig<typeof import('drizzle-orm')>()),
  inArray: (_col: unknown, ids: string[]) => { requestedIds = ids; return ids },
}))
vi.mock('@/lib/db/client', () => ({
  db: { select: () => ({ from: () => ({ where: async () => PROFILES.filter((p) => requestedIds.includes(p.id)) }) }) },
}))
vi.mock('@/lib/db/queries/monthlyReview', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/queries/monthlyReview')>()),
  loadMonthlyReviewSnapshot: async () => ({
    id: 's1', groupId: 'g1', year: 2026, month: 4, computedAt: new Date(),
    topCategory: 'dining', topCategoryTotal: 100,
    largestExpenseAmount: 900, largestExpenseDescription: 'TEST_1618', largestExpenseCategory: 'dining',
    largestExpensePaidBy: payer,
    recurringEvents: [], recurringTotalIncome: 0, recurringTotalExpense: 0, assetBreakdown: [],
    bannerDismissedByMemberAAt: null, bannerDismissedByMemberBAt: null,
  }),
  loadMonthlyReviewMessages: async () => [],
}))
vi.mock('@/lib/db/queries/partnerQuiz', () => ({
  loadPartnerQuizSessionByGroup: async () => null,
  loadPartnerQuizAnswers: async () => [],
}))
vi.mock('@/lib/monthlyReview', async (orig) => ({
  ...(await orig<typeof import('@/lib/monthlyReview')>()),
  currentYearMonthInTaipei: () => ({ year: 2026, month: 9 }),
}))

const { default: MonthlyReviewPage } = await import('@/app/(dashboard)/review/[month]/page')

type Props = { snapshot: Record<string, unknown> | null; payerName: string | null } & Record<string, unknown>
async function open(month: string): Promise<Props> {
  const el = (await MonthlyReviewPage({ params: Promise.resolve({ month }) })) as ReactElement<Props>
  return el.props
}

/** Serialize with React's production Flight encoder (tests/_helpers/rsc-production-wire.mjs). */
function encodeProduction(value: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--conditions=react-server', join(process.cwd(), 'tests/_helpers/rsc-production-wire.mjs')],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => { out += c })
    child.stderr.on('data', (c) => { err += c })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`encoder exited ${code}: ${err}`))
      try { resolve((JSON.parse(out) as string[])[0]) } catch (e) { reject(e) }
    })
    child.stdin.end(JSON.stringify([{ kind: 'value', value }]))
  })
}

const PAYER_ID_KEY = /paidBy|payerId/i

beforeEach(() => { viewer = A; window = CH1; payer = B })

describe('review page: card 2 payer (#1618)', () => {
  it("closed chapter: B is shown under B's frozen chapter name, never the live one", async () => {
    const p = await open('2026-04')
    expect(p.payerName).toBe('B at close')
  })

  it("the viewer as payer gets the viewer's chapter name (frozen in a closed chapter)", async () => {
    payer = A
    const p = await open('2026-04')
    expect(p.payerName).toBe('A at close')
    expect((p.viewer as { displayName: string }).displayName).toBe('A renamed later') // the live profile is not used for the card
  })

  it('cross-chapter: B (removed) paid the largest in an A+C month → C sees no name', async () => {
    viewer = C; window = CH2; payer = B
    const p = await open('2026-07')
    expect(p.payerName).toBeNull()
    expect(requestedIds).not.toContain(B) // B's profile is never read
  })

  it('payload (a): the cross-chapter payer id is nowhere in the serialized props (production Flight)', async () => {
    viewer = C; window = CH2; payer = B
    const p = await open('2026-07')
    const payload = await encodeProduction(JSON.parse(JSON.stringify(p)))
    expect(payload.length).toBeGreaterThan(0)
    expect(payload).toContain(C) // control: the viewer's own id is there, so the check reads real ids
    expect(payload).not.toContain(B)
    expect(payload).not.toContain('B LIVE NAME')
  })

  it('payload (b): the snapshot prop has no largestExpensePaidBy key and no other payer-id field', async () => {
    for (const [v, w, pay, month] of [[A, CH1, B, '2026-04'], [C, CH2, B, '2026-07'], [C, CH2, C, '2026-07']] as const) {
      viewer = v; window = w; payer = pay
      const p = await open(month)
      expect(p.snapshot).not.toBeNull()
      expect(Object.keys(p.snapshot!)).not.toContain('largestExpensePaidBy')
      expect(Object.keys(p.snapshot!).filter((k) => PAYER_ID_KEY.test(k))).toEqual([])
      expect(Object.values(p.snapshot!)).not.toContain(pay)
    }
  })

  it('no payer id on the snapshot → no name', async () => {
    payer = null
    expect((await open('2026-04')).payerName).toBeNull()
  })
})
