import { listActiveRules } from '@/lib/db/queries/recurringExpense'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { RecurringExpenseContent } from './_components/RecurringExpenseContent'

export default async function RecurringExpenseSettingsPage() {
  const { group } = await requireViewerGroupOrRedirect()

  const rules = await listActiveRules(group.id)

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      <RecurringExpenseContent rules={rules} groupDefaultRatioA={group.defaultSplitRatioA ?? null} />
      <BottomNavSkeleton />
    </div>
  )
}
