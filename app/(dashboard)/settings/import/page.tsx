import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { getImportHistory } from '@/actions/import'
import { ImportContent } from './_components/ImportContent'

export default async function ImportPage() {
  const { user, group } = await requireViewerGroupOrRedirect()

  const [viewerProfile] = await db
    .select({ id: profiles.id, displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1)

  let partnerProfile: { id: string; displayName: string } | null = null
  const partnerId = group.memberA === user.id ? group.memberB : group.memberA
  if (partnerId) {
    const [p] = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, partnerId))
      .limit(1)
    partnerProfile = p ?? null
  }

  const history = await getImportHistory()

  const viewerIsMemberA = group.memberA === user.id

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      <ImportContent
        viewer={{
          id: user.id,
          displayName: viewerProfile?.displayName ?? '?',
        }}
        partner={partnerProfile}
        viewerIsMemberA={viewerIsMemberA}
        history={history}
      />
      <BottomNavSkeleton hideFab />
    </div>
  )
}
