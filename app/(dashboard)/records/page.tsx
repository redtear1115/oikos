import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups, assets } from '@/lib/db/schema'
import { and, eq, or } from 'drizzle-orm'
import { listFeedAllPaged, getGroupCreationMonthKey } from '@/lib/db/queries/transactions'
import { RecordsList } from './_components/RecordsList'
import { MonthlyStatsSection } from './_components/MonthlyStatsSection'
import { isMonthKey, currentMonthKey, monthKeyOf } from '@/lib/monthKey'
import type { BreakdownView } from './_components/StatsBreakdownToggle'
import { parseDrillFromRecord } from '@/lib/drill'

const PAGE_SIZE = 20

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string
    view?: string
    drillCategory?: string
    drillAsset?: string
    drillIncomeCategory?: string
  }>
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const [resolvedParams, [group]] = await Promise.all([
    searchParams,
    db
      .select()
      .from(oikosGroups)
      .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
      .limit(1),
  ])
  if (!group) throw new Error('No group')
  const { month: rawMonth, view: rawView } = resolvedParams

  // Resolve month scope. Decision: allow scrolling earlier than group creation
  // (those months render forced-compact, no breakdown). Only future is blocked.
  const nowKey = currentMonthKey()
  const requestedMonth = isMonthKey(rawMonth) ? rawMonth : nowKey
  const monthKey = requestedMonth > nowKey ? nowKey : requestedMonth
  const view: BreakdownView = rawView === 'asset' ? 'asset' : 'category'

  // Drill-down filter — set when the user taps a detail bar in the stats card.
  // Applied to the SSR feed so the initial paint is already filtered (no flash
  // of unfiltered rows). The client (RecordsList) re-reads the same params via
  // useSearchParams to keep its loaders + chip in sync.
  const drill = parseDrillFromRecord(resolvedParams)

  const creationMonthFromDb = await getGroupCreationMonthKey(group.id)
  const creationMonthKey = creationMonthFromDb ?? monthKeyOf(group.createdAt)
  const forceCompact = monthKey < creationMonthKey

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

  // Feed and creation-month metadata in parallel; feed is now scoped to the
  // selected month so list and stats share one time window.
  const feedRows = await listFeedAllPaged(group.id, null, PAGE_SIZE, monthKey, drill)

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
  }))

  return (
    <RecordsList
      initial={initial}
      pageSize={PAGE_SIZE}
      monthKey={monthKey}
      maxMonthKey={nowKey}
      drillAssetName={drillAssetName}
      statsSlot={
        <MonthlyStatsSection
          userId={user.id}
          groupId={group.id}
          monthKey={monthKey}
          view={view}
          forceCompact={forceCompact}
        />
      }
    />
  )
}
