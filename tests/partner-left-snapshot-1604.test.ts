// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

// #1604 part 2 — the stayer's PartnerLeftCard names the partner who just left
// as they were when that chapter closed: the closed chapter's snapshot, read
// through getEpochMembers (the one chapter-name source). Never the leaver's
// live profile, which they may rename the next minute.
//
//   chapter e1  A + B   closed (B left); snapshot names 'B at close'
//   chapter e2  A       open, solo
//
// Failure this guards: nothing errors; the card says 「B renamed later 離開了」
// with a name from after the chapter ended. `db` is an empty object here, so a
// page that still read `Profiles` itself would throw instead of passing.

const ME = 'a0a0a0a0-me00-4000-8000-0000000000a0'
const EX = 'b0b0b0b0-ex00-4000-8000-0000000000b0'
const CH2 = { startedAt: new Date('2026-06-01T00:00:00Z'), endedAt: null, epochId: 'e2', isPast: false }
const SOLO = { id: 'g1', memberA: ME, memberB: null, guardianBetaEnabled: false, defaultSplitRatioA: null, baseCurrency: 'twd' }
const PRIOR = {
  id: 'e1', groupId: 'g1', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-06-01T00:00:00Z'),
  memberAId: ME, memberBId: EX as string | null, memberAName: 'A at close', memberBName: 'B at close',
}

let prior: typeof PRIOR | null = PRIOR
const getEpochMembers = vi.fn(async (id: string) => (id === 'e1'
  ? { memberAId: ME, memberBId: EX, memberAName: 'A at close', memberBName: 'B at close' }
  : null))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) },
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: async () => ({ id: ME }) }))
vi.mock('@/lib/db/queries/epoch', () => ({
  resolveViewerEpochContext: async () => ({ group: SOLO, window: CH2 }),
  getLatestPriorClosedEpoch: async () => prior,
  getEpochMembers,
}))
vi.mock('@/lib/db/queries/insuranceView', () => ({ loadMemberLinkScope: async () => ({ memberA: ME, memberB: null }) }))
vi.mock('@/lib/db/queries/recurringView', () => ({
  listIncomePendingsForViewer: async () => [],
  listExpensePendingsForViewer: async () => [],
}))
vi.mock('@/lib/i18n/t', () => ({ getTranslations: async () => ({}), getLocale: async () => 'zh-TW' }))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/db/queries/balance', () => ({ getGroupBalance: async () => 0, getGroupPendingBalanceDelta: async () => 0 }))
vi.mock('@/lib/db/queries/transactions', () => ({ listTransactionsPaged: async () => [], monthlyStatsByCategory: async () => [] }))
vi.mock('@/lib/db/queries/incomes', () => ({
  listIncomeMonthSummary: async () => ({ total: 0, count: 0 }),
  listIncomesPaged: async () => [],
}))
vi.mock('@/lib/db/queries/trips', () => ({ listActiveTrips: async () => [] }))
vi.mock('@/lib/db/queries/currencyRates', () => ({ listRatesForGroup: async () => [] }))
vi.mock('@/lib/db/queries/monthlyReview', () => ({
  loadMonthlyReviewSnapshot: async () => null,
  listMonthlyReviewMonths: async () => [],
  loadMonthlyReviewMessages: async () => [],
}))
vi.mock('@/lib/today-server', () => ({ getTodayYMD: async () => '2026-10-07' }))
vi.mock('@/app/(dashboard)/dashboard/_components/Dashboard', () => ({ Dashboard: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/PartnerLeftCard', () => ({ PartnerLeftCard: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/WelcomeSoloCard', () => ({ WelcomeSoloCard: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/MonthlyReviewBanner', () => ({ MonthlyReviewBanner: () => null }))

const { default: DashboardPage } = await import('@/app/(dashboard)/dashboard/page')
const { PartnerLeftCard } = await import('@/app/(dashboard)/dashboard/_components/PartnerLeftCard')

async function partnerLeftCard(): Promise<ReactElement<{ partnerName: string; currentEpochId: string }> | undefined> {
  const frag = (await DashboardPage()) as ReactElement<{ children: unknown[] }>
  const kids = (frag.props.children as unknown[]).flat().filter(Boolean) as ReactElement<{ partnerName: string; currentEpochId: string }>[]
  return kids.find((k) => k.type === PartnerLeftCard)
}

beforeEach(() => { prior = PRIOR; getEpochMembers.mockClear() })

describe('PartnerLeftCard name (#1604 part 2)', () => {
  it("names the leaver with the closed chapter's snapshot, via getEpochMembers", async () => {
    const card = await partnerLeftCard()
    expect(card?.props).toEqual({ partnerName: 'B at close', currentEpochId: 'e2' })
    expect(getEpochMembers).toHaveBeenCalledWith('e1')
  })

  it('no prior duo chapter → no card and no name lookup', async () => {
    prior = { ...PRIOR, memberBId: null, memberBName: null as unknown as string }
    expect(await partnerLeftCard()).toBeUndefined()
    expect(getEpochMembers).not.toHaveBeenCalled()
  })
})
