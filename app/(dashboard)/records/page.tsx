import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { listFeedAllPaged, getGroupCreationMonthKey } from '@/lib/db/queries/transactions'
import { RecordsList } from './_components/RecordsList'
import { MonthlyStatsSection } from './_components/MonthlyStatsSection'
import { isMonthKey, currentMonthKey, monthKeyOf } from '@/lib/monthKey'
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

  // Resolve month scope. Decision: allow scrolling earlier than group creation
  // (those months render forced-compact, no breakdown). Only future is blocked.
  const nowKey = currentMonthKey()
  const requestedMonth = isMonthKey(rawMonth) ? rawMonth : nowKey
  const monthKey = requestedMonth > nowKey ? nowKey : requestedMonth
  const view: BreakdownView = rawView === 'asset' ? 'asset' : 'category'

  const creationMonthFromDb = await getGroupCreationMonthKey(group.id)
  const creationMonthKey = creationMonthFromDb ?? monthKeyOf(group.createdAt)
  const forceCompact = monthKey < creationMonthKey

  // Feed and creation-month metadata in parallel; feed is now scoped to the
  // selected month so list and stats share one time window.
  const feedRows = await listFeedAllPaged(group.id, null, PAGE_SIZE, monthKey)

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
  }))

  return (
    <RecordsList
      initial={initial}
      pageSize={PAGE_SIZE}
      monthKey={monthKey}
      maxMonthKey={nowKey}
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
