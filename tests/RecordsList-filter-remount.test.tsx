import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import type { PagedTxnRow } from '@/actions/transaction'
import type { DateRange } from '@/lib/filter'

// ── Controllable URL state ──────────────────────────────────────────────────
// RecordsList derives its filter from useSearchParams; we drive that here so we
// can simulate "user applied the payer filter" (which in the app is a
// router.replace → SSR re-render → new searchParams + new SSR-filtered initial).
let currentParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => currentParams,
}))

// Collapse all dynamic() sheets (AddSheet / SettlementSheet / IncomeSheet /
// FilterSheet) to no-ops so we don't pull their trees into jsdom.
vi.mock('next/dynamic', () => ({ default: () => () => null }))

// Header chips render in the sticky header; null them to keep the test focused.
vi.mock('@/app/(dashboard)/records/_components/MonthSwitcher', () => ({ MonthSwitcher: () => null }))
vi.mock('@/app/(dashboard)/records/_components/DateRangeChip', () => ({ DateRangeChip: () => null }))
vi.mock('@/app/(dashboard)/records/_components/DrillFilterChip', () => ({ DrillFilterChip: () => null }))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/lib/incomeFeedRow', () => ({ makeIncomeLoader: () => async () => [], incomeToFeedRow: (r: unknown) => r }))
vi.mock('@/actions/transaction', () => ({
  loadMoreFeedAll: vi.fn(async () => []),
  loadMoreTransactions: vi.fn(async () => []),
}))

// Spy TransactionFeed: count mounts and expose the `initial` it received.
// `key` changes (filter participating in the key) manifest here as a remount.
let mountCount = 0
let lastInitialDescs: string[] = []
vi.mock('@/app/(dashboard)/_components/TransactionFeed', () => ({
  TransactionFeed: ({ initial }: { initial: PagedTxnRow[] }) => {
    useEffect(() => {
      mountCount++
    }, [])
    lastInitialDescs = initial.map((r) => r.description)
    return (
      <div data-testid="feed">
        {initial.map((r) => (
          <div key={r.id}>{r.description}</div>
        ))}
      </div>
    )
  },
}))

import { RecordsList } from '@/app/(dashboard)/records/_components/RecordsList'

const VIEWER_ID = 'u-me'
const PARTNER_ID = 'u-you'

const member: MemberContextValue = {
  group: { id: 'g1', name: '我們家' },
  viewer: { id: VIEWER_ID, initial: '我', displayName: '小明', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
  partner: { id: PARTNER_ID, initial: '對', displayName: '小華', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
  viewerIsA: true,
  isSolo: false,
  isPast: false,
  canAccessGuardian: false,
  epochStartedAt: '2026-01-01T00:00:00.000Z',
  epochEndedAt: null,
  hadPartner: false,
}

function row(id: string, desc: string, paidBy: string): PagedTxnRow {
  return {
    id,
    amount: 100,
    splitType: 'half',
    splitRatioA: null,
    description: desc,
    category: 'dining',
    paidBy,
    transactedAt: '2026-05-10T00:00:00.000Z',
    createdAt: '2026-05-10T00:30:00.000Z',
    kind: 'transaction',
    assetId: null,
    fuelLogId: null,
    notes: null,
    status: 'settled',
    originalCurrency: null,
    originalAmount: null,
    rateSnapshot: null,
    tripId: null,
  }
}

const ALL_ROWS = [row('t1', '我的午餐', VIEWER_ID), row('t2', '對方的晚餐', PARTNER_ID)]
const MINE_ROWS = ALL_ROWS.filter((r) => r.paidBy === VIEWER_ID)
const monthRange: DateRange = { kind: 'month', monthKey: '2026-05' }

function renderRecords(initial: PagedTxnRow[]) {
  return render(
    <I18nWrapper>
      <MemberProvider value={member}>
        <RecordsList
          initial={initial}
          pageSize={20}
          monthKey="2026-05"
          maxMonthKey="2026-05"
          dateRange={monthRange}
          assets={[]}
          statsSlot={<div data-testid="stats" />}
        />
      </MemberProvider>
    </I18nWrapper>,
  )
}

beforeEach(() => {
  currentParams = new URLSearchParams()
  mountCount = 0
  lastInitialDescs = []
})

describe('RecordsList — payer filter syncs the list (#745)', () => {
  it('remounts the feed onto the SSR-filtered initial when the payer filter changes', () => {
    // 1. Land with no filter: feed shows both rows.
    const { rerender } = renderRecords(ALL_ROWS)
    expect(mountCount).toBe(1)
    expect(lastInitialDescs).toEqual(['我的午餐', '對方的晚餐'])

    // 2. User applies「我付的」: app sets ?fPayer=mine and the SSR re-render
    //    delivers the already-filtered initial. Mirror both here.
    currentParams = new URLSearchParams('fPayer=mine')
    rerender(
      <I18nWrapper>
        <MemberProvider value={member}>
          <RecordsList
            initial={MINE_ROWS}
            pageSize={20}
            monthKey="2026-05"
            maxMonthKey="2026-05"
            dateRange={monthRange}
            assets={[]}
            statsSlot={<div data-testid="stats" />}
          />
        </MemberProvider>
      </I18nWrapper>,
    )

    // The feed must REMOUNT (filter participates in its key) so it adopts the
    // filtered initial — not keep the stale instance whose items only update
    // via the async client refetch.
    expect(mountCount).toBe(2)
    expect(lastInitialDescs).toEqual(['我的午餐'])
    expect(screen.queryByText('對方的晚餐')).toBeNull()
  })
})
