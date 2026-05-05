import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getGroupBalance } from '@/lib/db/queries/balance'
import { listTransactionsPaged } from '@/lib/db/queries/transactions'
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

  const [balance, rows] = await Promise.all([
    getGroupBalance(group.id),
    listTransactionsPaged(group.id, null, PAGE_SIZE),
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

  return <Dashboard balance={balance} recent={recent} pageSize={PAGE_SIZE} />
}
