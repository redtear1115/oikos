import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups, profiles } from '@/lib/db/schema'
import { eq, or, inArray } from 'drizzle-orm'
import { ViewerProvider } from './_components/ViewerProvider'
import { RealtimeProvider } from './_components/RealtimeProvider'
import type { MemberContextValue } from './_components/MemberContext'
import { getTranslations } from '@/lib/i18n/t'
import { TranslationsProvider } from '@/lib/i18n/client'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) redirect('/setup')

  const memberIds = [group.memberA, group.memberB].filter((x): x is string => !!x)
  const [profilesRows, t] = await Promise.all([
    db.select().from(profiles).where(inArray(profiles.id, memberIds)),
    getTranslations(),
  ])

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
      avatarUrl: viewerProfile.avatarUrl ?? null,
      defaultSplitType: viewerProfile.defaultSplitType,
      who: 'M',
    },
    partner: partnerProfile ? {
      id: partnerProfile.id,
      displayName: partnerProfile.displayName,
      initial: (partnerProfile.displayName[0] ?? '?').toUpperCase(),
      avatarUrl: partnerProfile.avatarUrl ?? null,
      defaultSplitType: partnerProfile.defaultSplitType,
      who: 'T',
    } : null,
    viewerIsA,
    isSolo: !partnerProfile,
  }

  return (
    <TranslationsProvider value={t}>
      <ViewerProvider value={value}>
        <RealtimeProvider groupId={group.id}>
          <div className="relative max-w-md mx-auto min-h-dvh" style={{ background: 'var(--bg)' }}>
            {children}
          </div>
        </RealtimeProvider>
      </ViewerProvider>
    </TranslationsProvider>
  )
}
