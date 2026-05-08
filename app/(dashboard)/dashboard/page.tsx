import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getGroupBalance } from '@/lib/db/queries/balance'
import { listTransactionsPaged } from '@/lib/db/queries/transactions'
import { listIncomeMonthSummary, listIncomesPaged } from '@/lib/db/queries/incomes'
import { listActivePendings } from '@/lib/db/queries/recurringIncome'
import { getIncomeCategory } from '@/lib/incomeCategories'
import { incomeToFeedRow } from '@/lib/incomeFeedRow'
import type { PagedTxnRow } from '@/actions/transaction'
import { Dashboard } from './_components/Dashboard'

const PAGE_SIZE = 20

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('No group')

  const now = new Date()
  const yyyymm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Fast path — what hero/banner needs to paint immediately. Awaited so
  // BalanceHero / SoloBanner / ModeTogglePlaceholder render with real data.
  // The latest income (limit 1) covers the hero label without pulling the full feed.
  const [balance, incomeSummary, pendings, latestIncomes] = await Promise.all([
    getGroupBalance(group.id),
    listIncomeMonthSummary(group.id, yyyymm),
    listActivePendings(group.id),
    listIncomesPaged(group.id, null, 1),
  ])

  const recentIncomeLabel = latestIncomes.length > 0
    ? (() => {
        const r = latestIncomes[0]
        const d = new Date(r.occurredAt + 'T00:00:00')
        const dateStr = `${d.getMonth() + 1}/${d.getDate()}`
        return `${dateStr} · ${r.source ?? getIncomeCategory(r.category).label}`
      })()
    : null

  // Slow path — passed as a Promise so the client can wrap it in <Suspense>
  // and stream the feed in after the hero paints. Both queries kick off here
  // (not awaited) and stream over the same RSC payload.
  const feedDataPromise = Promise.all([
    listTransactionsPaged(group.id, null, PAGE_SIZE),
    listIncomesPaged(group.id, null, PAGE_SIZE),
  ]).then(([rows, incomeRows]) => {
    const recent: PagedTxnRow[] = rows.map((r) => ({
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
    }))

    const recentIncomeFeed: PagedTxnRow[] = incomeRows.map((r) =>
      incomeToFeedRow({
        id: r.id,
        amount: r.amount,
        category: r.category,
        source: r.source,
        recipientId: r.recipientId,
        assetId: r.assetId,
        occurredAt: r.occurredAt,
        createdAt: r.createdAt.toISOString(),
        kind: 'income',
      })
    )

    return { recent, recentIncomeFeed }
  })

  return (
    <Dashboard
      balance={balance}
      pageSize={PAGE_SIZE}
      incomeMonthTotal={incomeSummary.total}
      incomeMonthCount={incomeSummary.count}
      recentIncomeLabel={recentIncomeLabel}
      pendings={pendings}
      feedDataPromise={feedDataPromise}
    />
  )
}
