import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toWire, defaultFilter } from '@/lib/filter'

const feedAll = vi.fn(async (..._a: unknown[]) => [])
const expensePaged = vi.fn(async (..._a: unknown[]) => [])
const feedAllSummaries = vi.fn(async (..._a: unknown[]) => [])
const expenseSummaries = vi.fn(async (..._a: unknown[]) => [])
const incomeSummaries = vi.fn(async (..._a: unknown[]) => [])

vi.mock('@/lib/auth/viewer', () => ({ requireViewer: async () => ({ user: { id: 'me' } }) }))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: async () => ({ id: 'me' }) }))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/db/queries/epoch', () => ({
  resolveViewerEpochContext: async () => ({
    group: { id: 'g1', memberA: 'me', memberB: 'you', createdAt: new Date('2026-01-01') },
    window: { startedAt: new Date(0), endedAt: null, epochId: 'e', isPast: false },
  }),
  lockOpenChapterForWrite: vi.fn(),
  // #1604 — live chapter: the viewed pair is the group row.
  resolveViewedPair: async (ctx: { group: { memberA: string; memberB: string | null } }) =>
    ({ memberA: ctx.group.memberA, memberB: ctx.group.memberB }),
}))
vi.mock('@/lib/db/queries/transactions', () => ({
  listFeedAllPaged: (...a: unknown[]) => feedAll(...a),
  listTransactionsPaged: (...a: unknown[]) => expensePaged(...a),
  listFeedAllMonthSummaries: (...a: unknown[]) => feedAllSummaries(...a),
  listTransactionsMonthSummaries: (...a: unknown[]) => expenseSummaries(...a),
  listDescriptionSuggestions: vi.fn(),
  getGroupCreationMonthKey: async () => '2026-01',
}))
vi.mock('@/lib/db/queries/incomes', () => ({
  listIncomesMonthSummaries: (...a: unknown[]) => incomeSummaries(...a),
  listIncomesPaged: vi.fn(async () => []),
}))
vi.mock('@/lib/db/queries/asset', () => ({
  listFilterAssetsForGroup: async () => [],
  getDrillAssetName: async () => null,
  listTransactionsPagedForAsset: vi.fn(),
}))
vi.mock('@/lib/db/queries/balance', () => ({ recalcGroupBalance: vi.fn() }))
vi.mock('@/lib/db/queries/group', () => ({ getActiveGroupForUser: vi.fn() }))
vi.mock('@/lib/db/queries/currencyRates', () => ({ listRatesForGroup: vi.fn() }))
vi.mock('@/lib/analytics/server', () => ({ captureServer: vi.fn(), isUserFirstNonDeletedRecord: vi.fn() }))
vi.mock('@/app/(dashboard)/records/_components/RecordsList', () => ({ RecordsList: () => null }))
vi.mock('@/app/(dashboard)/records/_components/MonthlyStatsSection', () => ({ MonthlyStatsSection: () => null }))

import {
  loadMoreFeedAll,
  loadMoreTransactions,
  loadRecordsMonthSummaries,
} from '@/actions/transaction'
import RecordsPage from '@/app/(dashboard)/records/page'

const wire = toWire({ ...defaultFilter(), text: 'foo' })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('text-only wire reaches every query path (loaders)', () => {
  it('loadMoreFeedAll', async () => {
    await loadMoreFeedAll(null, 20, '2026-05', undefined, wire)
    expect((feedAll.mock.calls[0]![0] as { filter: { text: string } }).filter.text).toBe('foo')
  })
  it('loadMoreTransactions', async () => {
    await loadMoreTransactions(null, 20, wire, '2026-05')
    expect((expensePaged.mock.calls[0]![0] as { filter: { text: string } }).filter.text).toBe('foo')
  })
  it('loadRecordsMonthSummaries: all, expense and income tabs', async () => {
    await loadRecordsMonthSummaries('all', '2026-05', undefined, wire)
    await loadRecordsMonthSummaries('expense', '2026-05', undefined, wire)
    await loadRecordsMonthSummaries('income', '2026-05', undefined, wire)
    expect((feedAllSummaries.mock.calls[0]![0] as { filter: { text: string } }).filter.text).toBe('foo')
    expect((expenseSummaries.mock.calls[0]![0] as { filter: { text: string } }).filter.text).toBe('foo')
    expect((incomeSummaries.mock.calls[0]![3] as { text: string }).text).toBe('foo')
  })
})

describe('page-level resolve with only ?q=foo', () => {
  it('passes the text to listFeedAllPaged and to MonthlyStatsSection', async () => {
    const el = (await RecordsPage({ searchParams: Promise.resolve({ q: 'foo', search: '1' } as never) })) as {
      props: { statsSlot: { props: { filter?: { text?: string }; incomeFilter?: { text?: string } } } }
    }
    expect((feedAll.mock.calls[0]![0] as { filter: { text: string } }).filter.text).toBe('foo')
    expect((feedAllSummaries.mock.calls[0]![0] as { filter: { text: string } }).filter.text).toBe('foo')
    const stats = el.props.statsSlot.props
    expect(stats.filter?.text).toBe('foo')
    expect(stats.incomeFilter?.text).toBe('foo')
  })

  it('without q nothing is resolved (queries skip the filter)', async () => {
    await RecordsPage({ searchParams: Promise.resolve({ search: '1' } as never) })
    expect((feedAll.mock.calls[0]![0] as { filter?: unknown }).filter).toBeUndefined()
  })
})
