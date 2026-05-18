import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { assets } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { listFeedAllPaged, getGroupCreationMonthKey, type ResolvedTxnFilter } from '@/lib/db/queries/transactions'
import type { ResolvedIncomeFilter } from '@/lib/db/queries/incomes'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { RecordsList } from './_components/RecordsList'
import { MonthlyStatsSection } from './_components/MonthlyStatsSection'
import { currentMonthKey, monthKeyOf } from '@/lib/monthKey'
import type { BreakdownView } from './_components/StatsBreakdownToggle'
import { parseDrillFromRecord } from '@/lib/drill'
import {
  cutsExpense,
  cutsIncome,
  parseDateRangeFromRecord,
  parseFilterFromRecord,
  hidesSettlements,
  splitFilterToTypes,
  type DateRange,
} from '@/lib/filter'

const PAGE_SIZE = 20

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string
    from?: string
    to?: string
    range?: string
    view?: string
    drillCategory?: string
    drillAsset?: string
    drillIncomeCategory?: string
    fPayer?: string
    fSplit?: string
    fCats?: string
    fIncCats?: string
    fAssets?: string
    fAmtMin?: string
    fAmtMax?: string
    fStatus?: string
  }>
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const [resolvedParams, context] = await Promise.all([
    searchParams,
    resolveViewerEpochContext(user.id),
  ])
  if (!context) redirect('/onboarding')
  const { group, window: epochWindow } = context
  const { view: rawView } = resolvedParams

  // Resolve date scope. Custom range / "all" override the legacy single-month
  // mode; otherwise we fall back to the current Taipei month. Months in the
  // future get clamped to current (preserves the existing MonthSwitcher rule).
  const nowKey = currentMonthKey()
  const dateRange = clampDateRangeToNow(
    parseDateRangeFromRecord(resolvedParams, nowKey),
    nowKey,
  )
  const monthKey = dateRange.kind === 'month' ? dateRange.monthKey : nowKey
  const view: BreakdownView = rawView === 'asset' ? 'asset' : 'category'

  // Drill-down filter — set when the user taps a detail bar in the stats card.
  // Applied to the SSR feed so the initial paint is already filtered (no flash
  // of unfiltered rows). The client (RecordsList) re-reads the same params via
  // useSearchParams to keep its loaders + chip in sync.
  const drill = parseDrillFromRecord(resolvedParams)

  // Structured filter (URL-synced, shareable). Resolved server-side here so
  // the initial SSR feed and stats card are both filtered; the client
  // mirrors via useSearchParams. The income variant is the same shape minus
  // the dims that don't apply to income rows (split / expense-cat → cutAll).
  const filter = parseFilterFromRecord(resolvedParams)
  const filterIsActive = filter.payer !== 'all'
    || filter.split !== 'all'
    || filter.categories.size > 0
    || filter.incomeCategories.size > 0
    || filter.assetIds.size > 0
    || filter.amountMin !== null
    || filter.amountMax !== null
    || filter.status !== 'all'
  const partnerId = group.memberA === user.id ? group.memberB : group.memberA
  const resolvedPaidBy =
    filter.payer === 'mine'
      ? user.id
      : filter.payer === 'theirs'
        ? partnerId ?? '00000000-0000-0000-0000-000000000000'
        : null
  const resolved: ResolvedTxnFilter | undefined = filterIsActive
    ? {
        paidBy: resolvedPaidBy,
        splitTypes: splitFilterToTypes(filter.split),
        categories: Array.from(filter.categories),
        incomeCategories: Array.from(filter.incomeCategories),
        assetIds: Array.from(filter.assetIds),
        amountMin: filter.amountMin,
        amountMax: filter.amountMax,
        status: filter.status === 'all' ? null : filter.status,
        excludeSettlements: hidesSettlements(filter),
        cutAll: cutsExpense(filter),
      }
    : undefined
  const resolvedIncome: ResolvedIncomeFilter | undefined = filterIsActive
    ? {
        recipientId: resolvedPaidBy,
        assetIds: Array.from(filter.assetIds),
        incomeCategories: Array.from(filter.incomeCategories),
        amountMin: filter.amountMin,
        amountMax: filter.amountMax,
        cutAll: cutsIncome(filter),
      }
    : undefined

  const creationMonthFromDb = await getGroupCreationMonthKey(group.id)
  const creationMonthKey = creationMonthFromDb ?? monthKeyOf(group.createdAt)
  const forceCompact = dateRange.kind === 'month' && monthKey < creationMonthKey

  // For an asset drill, resolve the asset name so the chip can display it
  // without a second client round-trip. We don't filter by deletedAt — a
  // soft-deleted asset still keeps its original name in stats, and the chip
  // should match that. `null` assetId is the「其他支出」(no-asset) bar; we
  // use a sentinel name so the chip / RecordsList prop type stays simple.
  let drillAssetName: string | null = null
  if (drill?.kind === 'asset' && drill.assetId !== null) {
    const [a] = await db
      .select({ name: assets.name })
      .from(assets)
      .where(and(eq(assets.id, drill.assetId), eq(assets.groupId, group.id)))
      .limit(1)
    drillAssetName = a?.name ?? null
  }

  // Asset list for the FilterSheet's 愛物 multi-select. Active assets only —
  // a deleted asset shouldn't appear as a fresh filter option (existing
  // selections that reference a deleted asset still survive via the
  // `__none__`-style sentinel handling on the server, but the UI doesn't
  // surface them).
  const filterAssets = await db
    .select({ id: assets.id, name: assets.name, type: assets.type })
    .from(assets)
    .where(and(eq(assets.groupId, group.id), isNull(assets.deletedAt)))
    .orderBy(assets.createdAt)

  // Feed and creation-month metadata in parallel; feed is now scoped to the
  // selected date range and structured filter.
  const feedMonthKey = dateRange.kind === 'month' ? monthKey : undefined
  const feedDateRange = dateRange.kind === 'month' ? null : dateRange
  const feedRows = await listFeedAllPaged({
    groupId: group.id,
    cursor: null,
    limit: PAGE_SIZE,
    filter: resolved,
    monthKey: feedMonthKey,
    drill,
    dateRange: feedDateRange,
    epochWindow,
  })

  const initial = feedRows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.splitType,
    splitRatioA: r.splitRatioA ?? null,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    kind: r.kind,
    assetId: r.assetId,
    fuelLogId: r.fuelLogId ?? null,
    notes: r.notes,
    status: r.status ?? 'settled',
    originalCurrency: r.originalCurrency ?? null,
    originalAmount: r.originalAmount ?? null,
    rateSnapshot: r.rateSnapshot ?? null,
    tripId: r.tripId ?? null,
  }))

  return (
    <RecordsList
      initial={initial}
      pageSize={PAGE_SIZE}
      monthKey={monthKey}
      maxMonthKey={nowKey}
      dateRange={dateRange}
      drillAssetName={drillAssetName}
      assets={filterAssets}
      statsSlot={
        <MonthlyStatsSection
          userId={user.id}
          groupId={group.id}
          epochWindow={epochWindow}
          monthKey={monthKey}
          view={view}
          forceCompact={forceCompact}
          dateRange={dateRange}
          filter={resolved}
          incomeFilter={resolvedIncome}
        />
      }
    />
  )
}

/**
 * Clamp a future-month-range to "now" so a tampered ?month=2099-01 or
 * ?from=2099-01-01 falls back to the current Taipei month instead of
 * rendering an empty page (or worse, looking like data was lost).
 */
function clampDateRangeToNow(r: DateRange, nowMonthKey: string): DateRange {
  if (r.kind === 'month' && r.monthKey > nowMonthKey) {
    return { kind: 'month', monthKey: nowMonthKey }
  }
  return r
}
