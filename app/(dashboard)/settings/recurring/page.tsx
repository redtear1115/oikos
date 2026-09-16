import { listActiveRules as listIncomeRules } from '@/lib/db/queries/recurringIncome'
import { listActiveRules as listExpenseRules } from '@/lib/db/queries/recurringExpense'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { getInsuranceAssets } from '@/actions/income'
import { RecurringSettingsContent } from './_components/RecurringSettingsContent'
import { unwrapAction } from '@/lib/action-errors'

export default async function RecurringSettingsPage() {
  const { group } = await requireViewerGroupOrRedirect()

  const [incomeRules, expenseRules, insuranceAssets] = await Promise.all([
    listIncomeRules(group.id),
    listExpenseRules(group.id),
    getInsuranceAssets().then(unwrapAction),
  ])

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      <RecurringSettingsContent
        incomeRules={incomeRules}
        expenseRules={expenseRules}
        insuranceAssets={insuranceAssets}
        groupDefaultRatioA={group.defaultSplitRatioA ?? null}
      />
    </div>
  )
}
