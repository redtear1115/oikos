import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import { ViewerProvider } from './_components/ViewerProvider'
import { RealtimeProvider } from './_components/RealtimeProvider'
import { OfflineLifecycle } from './_components/OfflineLifecycle'
import { OfflineBanner } from './_components/OfflineBanner'
import { ReconnectRefresh } from './_components/ReconnectRefresh'
import { PastEpochBanner } from './_components/PastEpochBanner'
import type { MemberContextValue } from './_components/MemberContext'
import { getTranslations, getLocale } from '@/lib/i18n/t'
import { TranslationsProvider } from '@/lib/i18n/client'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { canAccessGuardian } from '@/lib/guardian'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  // Pin-aware context: when the viewer is pinned to a past epoch (possibly
  // on a different group, see #141), the group + window follow the pin.
  const context = await resolveViewerEpochContext(user.id)
  if (!context) redirect('/onboarding')
  const { group, window: epochWindow } = context

  const memberIds = [group.memberA, group.memberB].filter((x): x is string => !!x)
  const [profilesRows, t, locale] = await Promise.all([
    db.select().from(profiles).where(inArray(profiles.id, memberIds)),
    getTranslations(),
    getLocale(),
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
    isPast: epochWindow.isPast,
    canAccessGuardian: canAccessGuardian(group),
  }

  return (
    <TranslationsProvider value={t} locale={locale}>
      <ViewerProvider value={value}>
        <RealtimeProvider groupId={group.id}>
          <OfflineLifecycle />
          <OfflineBanner />
          <ReconnectRefresh />
          {epochWindow.isPast && epochWindow.endedAt && (
            <PastEpochBanner
              startedAt={epochWindow.startedAt.toISOString()}
              endedAt={epochWindow.endedAt.toISOString()}
              locale={locale}
            />
          )}
          <div className="relative max-w-md mx-auto min-h-dvh" style={{ background: 'var(--bg)' }}>
            {children}
          </div>
        </RealtimeProvider>
      </ViewerProvider>
    </TranslationsProvider>
  )
}
