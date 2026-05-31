import { Noto_Sans_TC } from 'next/font/google'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import { ViewerProvider } from './_components/ViewerProvider'
import { RealtimeProvider } from './_components/RealtimeProvider'
import { OfflineLifecycle } from './_components/OfflineLifecycle'
import { ReconnectRefresh } from './_components/ReconnectRefresh'
import { PartnerActivityToast } from './_components/PartnerActivityToast'
import type { MemberContextValue } from './_components/MemberContext'
import { getTranslations, getLocale } from '@/lib/i18n/t'
import { TranslationsProvider } from '@/lib/i18n/client'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { canAccessGuardian } from '@/lib/guardian'
import { AvatarMenuProvider, type AvatarMenuData } from './_components/AvatarMenuProvider'
import { PushTokenRegistrar } from './_components/PushTokenRegistrar'

// CJK font note: `subsets: ['latin']` is honored for the @font-face metadata,
// but Google Fonts still serves Noto Sans TC as ~100 unicode-range split files
// per weight (render-blocking CSS grew ~100KB per extra weight). Each weight
// added back here is a perf cost — verify build output (`grep '@font-face'
// .next/static/css/*.css | wc -l`) before adding more. (issue #289)
//
// `preload: false` keeps the @font-face definitions but skips the <link
// rel="preload"> storm for ~11 unicode-range woff2 chunks. Initial CJK glyphs
// render instantly via the PingFang TC / Microsoft JhengHei / Noto Sans CJK TC
// fallback chain (see globals.css `--font-sans`); Noto Sans TC loads async and
// swaps in via `display: swap`. Trades a tiny FOUT for ~700ms off the critical
// path on mobile. (issues #318 / #319)
//
// Scoped to dashboard layout (not root) so the landing page is freed from the
// ~190KB @font-face CSS chunk. Onboarding (`app/onboarding/`) still falls back
// to system-ui via inline styles — accepted minor regression for first-visit
// perf. (issue #572)
const notoTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-noto-tc',
  display: 'swap',
  preload: false,
})

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
    epochStartedAt: epochWindow.startedAt.toISOString(),
    epochEndedAt: epochWindow.endedAt ? epochWindow.endedAt.toISOString() : null,
    hadPartner: group.memberB !== null,
  }

  const avatarMenuData: AvatarMenuData = {
    viewerEmail: user.email ?? '',
    groupDefaultRatioA: group.defaultSplitRatioA ?? null,
    guardianBetaEnabled: group.guardianBetaEnabled,
    currentLocale: locale,
  }

  return (
    <TranslationsProvider value={t} locale={locale}>
      <ViewerProvider value={value}>
        <RealtimeProvider groupId={group.id}>
          <PushTokenRegistrar userId={user.id} groupId={group.id} />
          <OfflineLifecycle />
          <ReconnectRefresh />
          <PartnerActivityToast />
          <AvatarMenuProvider data={avatarMenuData}>
            <div className={`relative max-w-md mx-auto min-h-dvh ${notoTC.variable}`} style={{ background: 'var(--bg)' }}>
              {children}
            </div>
          </AvatarMenuProvider>
        </RealtimeProvider>
      </ViewerProvider>
    </TranslationsProvider>
  )
}
