import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { or, eq } from 'drizzle-orm'
import { listActiveRules } from '@/lib/db/queries/recurringExpense'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { RecurringExpenseContent } from './_components/RecurringExpenseContent'

export default async function RecurringExpenseSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const group = await getActiveGroupForUser(user.id)
  if (!group) redirect('/setup')

  const rules = await listActiveRules(group.id)

  return (
    <div className="relative min-h-dvh pb-[92px]">
      <RecurringExpenseContent rules={rules} groupDefaultRatioA={group.defaultSplitRatioA ?? null} />
      <BottomNavSkeleton />
    </div>
  )
}
