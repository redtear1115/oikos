import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getGroupBalance } from '@/lib/db/queries/balance'
import { listRecentTransactions } from '@/lib/db/queries/transactions'
import { Dashboard } from './_components/Dashboard'

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

  const [balance, recent] = await Promise.all([
    getGroupBalance(group.id),
    listRecentTransactions(group.id, 5),
  ])

  // Serialize Date → string for client component
  const recentSerializable = recent.map(t => ({ ...t, transactedAt: t.transactedAt.toISOString() }))

  return <Dashboard balance={balance} recent={recentSerializable} />
}
