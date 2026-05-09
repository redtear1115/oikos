import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { listFeedAllPaged, getGroupCreationMonthKey } from '@/lib/db/queries/transactions'
import { RecordsList } from './_components/RecordsList'
import { MonthlyStatsSection } from './_components/MonthlyStatsSection'
import { isMonthKey, currentMonthKey, clampMonthKey, monthKeyOf } from '@/lib/monthKey'
import type { BreakdownView } from './_components/StatsBreakdownToggle'

const PAGE_SIZE = 20

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const [{ month: rawMonth, view: rawView }, [group]] = await Promise.all([
    searchParams,
    db
      .select()
      .from(oikosGroups)
      .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
      .limit(1),
  ])
  if (!group) throw new Error('No group')

  // Stats bounds need the group's creation month (Asia/Taipei). Run with the feed
  // and DB-truth conversion in parallel; fall back to JS-side if the helper is
  // null (shouldn't happen but the type allows it).
  const [feedRows, creationMonthFromDb] = await Promise.all([
    listFeedAllPaged(group.id, null, PAGE_SIZE),
    getGroupCreationMonthKey(group.id),
  ])

  const initial = feedRows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.splitType,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    kind: r.kind,
    assetId: r.assetId,
    fuelLogId: r.fuelLogId ?? null,
    notes: r.notes,
  }))

  // Per spec: clamp ?month to [creationMonth, currentMonth]. Bounds are also fed
  // to MonthSwitcher so the prev/next buttons disable at the edges.
  const minMonthKey = creationMonthFromDb ?? monthKeyOf(group.createdAt)
  const maxMonthKey = currentMonthKey()
  const requestedMonth = isMonthKey(rawMonth) ? rawMonth : maxMonthKey
  const monthKey = clampMonthKey(requestedMonth, minMonthKey, maxMonthKey)
  const view: BreakdownView = rawView === 'asset' ? 'asset' : 'category'

  return (
    <RecordsList
      initial={initial}
      pageSize={PAGE_SIZE}
      statsSlot={
        <MonthlyStatsSection
          groupId={group.id}
          monthKey={monthKey}
          minMonthKey={minMonthKey}
          maxMonthKey={maxMonthKey}
          view={view}
        />
      }
    />
  )
}
