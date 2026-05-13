import { requireViewerOrRedirect } from '@/lib/auth/viewer'
import { listEpochsForViewer } from '@/lib/db/queries/epoch'
import { getPinnedEpochId } from '@/actions/epoch-view'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { PastTimesList } from './_components/PastTimesList'

/**
 * Read-only timeline of every chapter the viewer has lived through — across
 * all groups, not just the currently-active one. Each row is a click-to-enter
 * into that chapter's view (cookie-pinned via `enterPastEpoch`).
 *
 * 過去的時光 是「個人的」(see PR #138 discussion / issue #141): a user who has
 * gone through leave + rejoin should see BOTH the duo chapter and any solo
 * left behind on a different `OikosGroups` row.
 */
export default async function PastTimesPage() {
  const { user } = await requireViewerOrRedirect()

  const [epochs, pinnedId, locale, t] = await Promise.all([
    listEpochsForViewer(user.id),
    getPinnedEpochId(),
    getLocale(),
    getTranslations(),
  ])

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      <PastTimesList
        epochs={epochs.map((e) => ({
          id: e.id,
          startedAt: e.startedAt.toISOString(),
          endedAt: e.endedAt?.toISOString() ?? null,
          memberAName: e.memberAName,
          memberBName: e.memberBName,
          memberAId: e.memberAId,
          memberBId: e.memberBId,
        }))}
        pinnedEpochId={pinnedId}
        viewerId={user.id}
        locale={locale}
        t={t.pastTimes}
        backLabel={t.pastTimes.back}
      />
      <BottomNavSkeleton />
    </div>
  )
}
