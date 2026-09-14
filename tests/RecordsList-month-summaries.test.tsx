import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import type { FeedMonthSummary } from '@/lib/db/queries/feedMonthSummary'
import type { DateRange } from '@/lib/filter'

// Feed-header summaries must belong to the view they are shown on (#1208
// follow-up, #1169/#1170 slice). Two failure shapes this guards:
//  1. After a tab switch, the previous tab's numbers sat on the new tab's
//     headers until the fetch resolved — and forever if it failed (offline).
//  2. Switching back to 全部 restored the page-load SSR prop, discarding
//     numbers realtime had corrected in the meantime.

let currentParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => currentParams,
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/app/(dashboard)/records/_components/MonthSwitcher', () => ({ MonthSwitcher: () => null }))
vi.mock('@/app/(dashboard)/records/_components/DateRangeChip', () => ({ DateRangeChip: () => null }))
vi.mock('@/app/(dashboard)/records/_components/DrillFilterChip', () => ({ DrillFilterChip: () => null }))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/lib/incomeFeedRow', () => ({ makeIncomeLoader: () => async () => [], incomeToFeedRow: (r: unknown) => r }))

type Deferred = { resolve: (v: FeedMonthSummary[]) => void; reject: (e: unknown) => void }
const pending: Deferred[] = []
const loadRecordsMonthSummaries = vi.fn(
  () => new Promise<FeedMonthSummary[]>((resolve, reject) => { pending.push({ resolve, reject }) }),
)
vi.mock('@/actions/transaction', () => ({
  loadMoreFeedAll: vi.fn(async () => []),
  loadMoreTransactions: vi.fn(async () => []),
  loadRecordsMonthSummaries: (...args: unknown[]) => (loadRecordsMonthSummaries as (...a: unknown[]) => unknown)(...args),
}))

let lastByMonth: Record<string, FeedMonthSummary> = {}
vi.mock('@/app/(dashboard)/_components/TransactionFeed', () => ({
  TransactionFeed: ({ monthSummaries }: { monthSummaries?: { byMonth: Record<string, FeedMonthSummary> } }) => {
    lastByMonth = monthSummaries?.byMonth ?? {}
    return <div data-testid="feed" />
  },
}))

import { RecordsList } from '@/app/(dashboard)/records/_components/RecordsList'

const member: MemberContextValue = {
  group: { id: 'g1', name: '我們家' },
  viewer: { id: 'u-me', initial: '我', displayName: '小明', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
  partner: { id: 'u-you', initial: '對', displayName: '小華', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
  viewerIsA: true,
  isSolo: false,
  isPast: false,
  canAccessGuardian: false,
  epochStartedAt: '2026-01-01T00:00:00.000Z',
  epochEndedAt: null,
}

const monthRange: DateRange = { kind: 'month', monthKey: '2026-05' }
const summary = (count: number, expenseTotal: number, incomeTotal = 0): FeedMonthSummary[] => [
  { monthKey: '2026-05', count, expenseTotal, incomeTotal },
]

function tree(monthSummaries: FeedMonthSummary[]) {
  return (
    <I18nWrapper>
      <MemberProvider value={member}>
        <RecordsList
          initial={[]}
          pageSize={20}
          monthSummaries={monthSummaries}
          monthKey="2026-05"
          maxMonthKey="2026-05"
          dateRange={monthRange}
          assets={[]}
        />
      </MemberProvider>
    </I18nWrapper>
  )
}

const countShown = () => lastByMonth['2026-05']?.count

beforeEach(() => {
  currentParams = new URLSearchParams()
  lastByMonth = {}
  pending.length = 0
  loadRecordsMonthSummaries.mockClear()
})

describe('RecordsList — feed-header summaries follow the active view', () => {
  it('uses the SSR prop on the 全部 tab without fetching', () => {
    render(tree(summary(5, 800, 300)))
    expect(countShown()).toBe(5)
    expect(loadRecordsMonthSummaries).not.toHaveBeenCalled()
  })

  it('never shows the previous tab’s numbers while the new tab’s fetch is pending or failed', async () => {
    render(tree(summary(5, 800, 300)))

    // Deselect 收入 → 支出 tab.
    fireEvent.click(screen.getByRole('button', { name: '收入' }))
    expect(loadRecordsMonthSummaries).toHaveBeenCalledTimes(1)
    expect(loadRecordsMonthSummaries.mock.calls[0]).toContain('expense')
    // Fetch in flight: headers fall back (empty map), not 全部's 5.
    expect(countShown()).toBeUndefined()

    // Offline: the fetch fails. Still no wrong-tab numbers.
    await act(async () => { pending[0].reject(new Error('offline')) })
    expect(countShown()).toBeUndefined()
  })

  it('adopts the fetched summaries once they resolve for the current tab', async () => {
    render(tree(summary(5, 800, 300)))
    fireEvent.click(screen.getByRole('button', { name: '收入' }))
    await act(async () => { pending[0].resolve(summary(3, 800)) })
    expect(countShown()).toBe(3)
  })

  it('refetches instead of restoring the stale SSR prop when switching back to 全部', async () => {
    const ssr = summary(5, 800, 300)
    render(tree(ssr))

    fireEvent.click(screen.getByRole('button', { name: '收入' }))
    await act(async () => { pending[0].resolve(summary(3, 800)) })

    // Re-select 收入 → back to 全部. Same SSR prop reference as page load.
    fireEvent.click(screen.getByRole('button', { name: '收入' }))
    expect(loadRecordsMonthSummaries).toHaveBeenCalledTimes(2)
    expect(loadRecordsMonthSummaries.mock.calls[1]).toContain('all')
    // Not the page-load 5 while waiting…
    expect(countShown()).toBeUndefined()
    // …and the fresh 全部 numbers once they arrive.
    await act(async () => { pending[1].resolve(summary(6, 900, 300)) })
    expect(countShown()).toBe(6)
  })

  it('adopts a refreshed SSR prop on the 全部 tab without an extra fetch', () => {
    const { rerender } = render(tree(summary(5, 800, 300)))
    rerender(tree(summary(7, 1000, 300)))
    expect(countShown()).toBe(7)
    expect(loadRecordsMonthSummaries).not.toHaveBeenCalled()
  })
})
