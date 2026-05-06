import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getGroupBalance } from '@/lib/db/queries/balance'
import { listTransactionsPaged } from '@/lib/db/queries/transactions'
import { listIncomeMonthSummary, listIncomesPaged } from '@/lib/db/queries/incomes'
import { getIncomeCategory } from '@/lib/incomeCategories'
import { Dashboard } from './_components/Dashboard'

const PAGE_SIZE = 20

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('No group')

  const now = new Date()
  const yyyymm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [balance, rows, incomeSummary, recentIncomes] = await Promise.all([
    getGroupBalance(group.id),
    listTransactionsPaged(group.id, null, PAGE_SIZE),
    listIncomeMonthSummary(group.id, yyyymm),
    listIncomesPaged(group.id, null, 1),
  ])

  // Serialize Date → ISO string for the client component
  const recent = rows.map((r) => ({
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

  const recentIncomeLabel = recentIncomes.length > 0
    ? (() => {
        const r = recentIncomes[0]
        const d = new Date(r.occurredAt + 'T00:00:00')
        const dateStr = `${d.getMonth() + 1}/${d.getDate()}`
        return `${dateStr} · ${r.source ?? getIncomeCategory(r.category).label}`
      })()
    : null

  return (
    <Dashboard
      balance={balance}
      recent={recent}
      pageSize={PAGE_SIZE}
      incomeMonthTotal={incomeSummary.total}
      incomeMonthCount={incomeSummary.count}
      recentIncomeLabel={recentIncomeLabel}
    />
  )
}
