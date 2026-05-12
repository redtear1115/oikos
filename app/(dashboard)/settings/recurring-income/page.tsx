import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { listActiveRules } from '@/lib/db/queries/recurringIncome'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { getInsuranceAssets } from '@/actions/income'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { RecurringIncomeContent } from './_components/RecurringIncomeContent'

interface PageProps {
  searchParams: Promise<{ assetId?: string }>
}

export default async function RecurringIncomeSettingsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const group = await getActiveGroupForUser(user.id)
  if (!group) redirect('/setup')

  const [rules, insuranceAssets, params] = await Promise.all([
    listActiveRules(group.id),
    getInsuranceAssets(),
    searchParams,
  ])

  // #166 — When SavingsView links here with ?assetId=<insurance>, auto-open the
  // create sheet with that asset preselected. Validate against the known asset
  // list to avoid leaking arbitrary user input into the form state.
  const prefilledAssetId =
    params.assetId && insuranceAssets.some((a) => a.id === params.assetId)
      ? params.assetId
      : null

  return (
    <div className="relative min-h-dvh pb-[92px]">
      <RecurringIncomeContent
        rules={rules}
        insuranceAssets={insuranceAssets}
        prefilledAssetId={prefilledAssetId}
      />
      <BottomNavSkeleton />
    </div>
  )
}
