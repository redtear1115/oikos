import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { or, eq } from 'drizzle-orm'
import { listActiveRules } from '@/lib/db/queries/recurringIncome'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { getInsuranceAssets } from '@/actions/income'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { RecurringIncomeContent } from './_components/RecurringIncomeContent'

export default async function RecurringIncomeSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const group = await getActiveGroupForUser(user.id)
  if (!group) redirect('/setup')

  const [rules, insuranceAssets] = await Promise.all([
    listActiveRules(group.id),
    getInsuranceAssets(),
  ])

  return (
    <div className="relative min-h-dvh pb-[92px]">
      <RecurringIncomeContent
        rules={rules}
        insuranceAssets={insuranceAssets}
      />
      <BottomNavSkeleton />
    </div>
  )
}
