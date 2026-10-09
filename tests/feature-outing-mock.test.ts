import { describe, it, expect } from 'vitest'
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales-meta'
import { splitEqual } from '@/lib/outing/split'
import { minimalTransfers } from '@/lib/outing/settle'
import {
  OUTING_MOCK,
  deriveOutingMock,
  formatMockAmount,
} from '@/app/[locale]/features/outing/_components/mock'

/**
 * #1633 — the example on /features/outing must be arithmetic the product would
 * really produce. Failure looks like nothing: the page renders fine and teaches
 * a settlement that the app would not suggest (or that leaves someone out of
 * pocket by the wrong amount).
 */
describe('feature-outing mock data', () => {
  it('covers every supported locale', () => {
    expect(Object.keys(OUTING_MOCK).sort()).toEqual([...SUPPORTED_LOCALES].sort())
  })

  it('zh-TW matches the approved example exactly', () => {
    const def = OUTING_MOCK['zh-TW']
    const { nets, transfers } = deriveOutingMock(def)
    expect(Object.fromEntries(nets)).toEqual({ p1: 4800, p2: 800, p3: -2400, p4: -3200 })
    expect(transfers.map((t) => `${def.names[t.from]}>${def.names[t.to]}:${t.amount}`)).toEqual([
      '阿哲>你:3200',
      '小安>你:1600',
      '小安>阿青:800',
    ])
  })

  it.each(SUPPORTED_LOCALES)('%s: scene-4 transfers are the product suggestion, valid and fair', (locale) => {
    const def = OUTING_MOCK[locale]
    const ids = [...def.participantIds]
    const { expenses, nets, transfers } = deriveOutingMock(def)

    // 1. shares come from splitEqual and add up
    for (const [i, e] of def.expenses.entries()) {
      expect(expenses[i].shares).toEqual(splitEqual(e.amount, ids))
      expect(expenses[i].shares.reduce((a, s) => a + s.shareAmount, 0)).toBe(e.amount)
    }
    // 2. the displayed list is exactly minimalTransfers, at most n-1 long
    expect(transfers).toEqual(minimalTransfers(nets))
    expect(transfers.length).toBeLessThanOrEqual(ids.length - 1)
    expect(transfers.length).toBeGreaterThan(0)
    // 3. nothing between the two ledger members (their part folds back, #1634)
    const [m1, m2] = def.members
    for (const t of transfers) {
      const memberToMember = [m1, m2].includes(t.from) && [m1, m2].includes(t.to)
      expect(memberToMember).toBe(false)
      expect(t.amount).toBeGreaterThan(0)
      expect(ids).toContain(t.from)
      expect(ids).toContain(t.to)
    }
    // 4. after applying every transfer, each person's out-of-pocket equals their total share
    for (const id of ids) {
      const paid = def.expenses.filter((e) => e.paidBy === id).reduce((a, e) => a + e.amount, 0)
      const share = expenses.reduce(
        (a, e) => a + (e.shares.find((s) => s.participantId === id)?.shareAmount ?? 0),
        0,
      )
      const sent = transfers.filter((t) => t.from === id).reduce((a, t) => a + t.amount, 0)
      const received = transfers.filter((t) => t.to === id).reduce((a, t) => a + t.amount, 0)
      expect(paid - received + sent).toBe(share)
    }
  })

  it('formats amounts with thousands separators', () => {
    expect(formatMockAmount(OUTING_MOCK['zh-TW'], 8000)).toBe('NT$8,000')
    expect(formatMockAmount(OUTING_MOCK.en, 80)).toBe('$80')
    expect(formatMockAmount(OUTING_MOCK.ja, 32000)).toBe('¥32,000')
  })
})
