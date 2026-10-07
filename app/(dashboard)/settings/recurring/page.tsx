import { listExpenseRulesForViewer, listIncomeRulesForViewer } from '@/lib/db/queries/recurringView'
import { memberLinkScope } from '@/lib/insuranceMemberLink'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { getInsuranceAssets } from '@/actions/income'
import { RecurringSettingsContent } from './_components/RecurringSettingsContent'
import { unwrapAction } from '@/lib/action-errors'

export default async function RecurringSettingsPage() {
  const { user, group } = await requireViewerGroupOrRedirect()

  // #1588 — the viewer's own (active) group, so the allowed set is its current
  // members and a dropped person is a former partner. A rule whose recipient /
  // payer left comes back with no id (see lib/recurringMemberLink.ts).
  const scope = memberLinkScope([group.memberA, group.memberB], user.id, true)

  const [incomeRules, expenseRules, insuranceAssets] = await Promise.all([
    listIncomeRulesForViewer(group.id, scope),
    listExpenseRulesForViewer(group.id, scope),
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
