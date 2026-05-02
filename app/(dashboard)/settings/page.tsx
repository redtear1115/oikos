import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles, oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { SettingsContent, type PartnerInfo, type ViewerInfo } from './_components/SettingsContent'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [viewerProfile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('No group')

  const partnerId = group.memberA === user.id ? group.memberB : group.memberA
  let partnerProfile: typeof viewerProfile | null = null
  if (partnerId) {
    const [p] = await db.select().from(profiles).where(eq(profiles.id, partnerId)).limit(1)
    partnerProfile = p ?? null
  }

  const viewer: ViewerInfo = {
    id: user.id,
    displayName: viewerProfile?.displayName ?? '?',
    email: user.email ?? '',
  }
  const partner: PartnerInfo | null = partnerProfile
    ? {
        id: partnerProfile.id,
        displayName: partnerProfile.displayName,
        email: null,
      }
    : null

  return (
    <div className="relative min-h-screen pb-[92px]">
      <SettingsContent
        viewer={viewer}
        partner={partner}
        groupName={group.name}
      />
      <BottomNavSkeleton />
    </div>
  )
}
