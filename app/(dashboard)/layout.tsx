import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups, profiles } from '@/lib/db/schema'
import { eq, or, inArray } from 'drizzle-orm'
import { ViewerProvider } from './_components/ViewerProvider'
import type { MemberContextValue } from './_components/MemberContext'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) redirect('/setup')

  const memberIds = [group.memberA, group.memberB].filter((x): x is string => !!x)
  const profilesRows = await db.select().from(profiles).where(inArray(profiles.id, memberIds))

  const viewerProfile = profilesRows.find(p => p.id === user.id)
  if (!viewerProfile) redirect('/sign-in')

  const partnerId = group.memberA === user.id ? group.memberB : group.memberA
  const partnerProfile = partnerId ? profilesRows.find(p => p.id === partnerId) : undefined

  const viewerIsA = group.memberA === user.id

  const value: MemberContextValue = {
    group: { id: group.id, name: group.name },
    viewer: {
      id: viewerProfile.id,
      displayName: viewerProfile.displayName,
      initial: (viewerProfile.displayName[0] ?? '?').toUpperCase(),
      who: 'M',
    },
    partner: partnerProfile ? {
      id: partnerProfile.id,
      displayName: partnerProfile.displayName,
      initial: (partnerProfile.displayName[0] ?? '?').toUpperCase(),
      who: 'T',
    } : null,
    viewerIsA,
  }

  return (
    <ViewerProvider value={value}>
      <div className="relative max-w-md mx-auto min-h-screen" style={{ background: 'var(--bg)' }}>
        {children}
      </div>
    </ViewerProvider>
  )
}
