import { listActiveRules } from '@/lib/db/queries/recurringIncome'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { getInsuranceAssets } from '@/actions/income'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { RecurringIncomeContent } from './_components/RecurringIncomeContent'

export default async function RecurringIncomeSettingsPage() {
  const { group } = await requireViewerGroupOrRedirect()

  const [rules, insuranceAssets] = await Promise.all([
    listActiveRules(group.id),
    getInsuranceAssets(),
  ])

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      <RecurringIncomeContent
        rules={rules}
        insuranceAssets={insuranceAssets}
      />
      <BottomNavSkeleton />
    </div>
  )
}
