import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { listEpochs } from '@/lib/db/queries/epoch'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { getPinnedEpochId } from '@/actions/epoch-view'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { PastTimesList } from './_components/PastTimesList'

/**
 * Read-only timeline of every chapter the ledger has lived through. Each row
 * is a click-to-enter into that chapter's view (cookie-pinned via
 * `enterPastEpoch`). The current open chapter is rendered too — but disabled,
 * since you're already in it (or, if pinned to a past one, the row's CTA
 * becomes "回到現在").
 */
export default async function PastTimesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const group = await getActiveGroupForUser(user.id)
  if (!group) redirect('/setup')

  const [epochs, pinnedId, locale, t] = await Promise.all([
    listEpochs(group.id),
    getPinnedEpochId(),
    getLocale(),
    getTranslations(),
  ])

  return (
    <div className="relative min-h-dvh pb-[92px]">
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
