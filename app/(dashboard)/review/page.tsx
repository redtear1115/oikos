import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { listMonthlyReviewMonths } from '@/lib/db/queries/monthlyReview'
import { formatYearMonth } from '@/lib/monthlyReview'
import { ReviewIndex } from './_components/ReviewIndex'

/**
 * /review — every month that has a review, newest first (#1364).
 *
 * Exists so the dashboard's 月回顧 cell always has somewhere to go, including
 * before the first review (a gentle empty state) and after the latest one has
 * been seen. Pin-aware like /review/[month], and chapter-scoped (#1380): it
 * lists only the months that lie wholly inside the chapter being viewed.
 */
export default async function ReviewIndexPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  const context = await resolveViewerEpochContext(user.id)
  if (!context) redirect('/onboarding')

  const months = await listMonthlyReviewMonths(context.group.id, context.window)
  return <ReviewIndex monthKeys={months.map(formatYearMonth)} />
}
