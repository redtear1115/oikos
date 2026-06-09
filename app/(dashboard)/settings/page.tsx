import pkg from '@/package.json'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { KofiWidget } from '@/components/KofiWidget'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { getGroupBalance } from '@/lib/db/queries/balance'
import { getTripSummary } from '@/lib/db/queries/trips'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import {
  SettingsContent,
  type PartnerInfo,
  type ViewerInfo,
} from './_components/SettingsContent'
import type { PendingSwap } from './_components/DangerZone'

export default async function SettingsPage() {
  const [{ user, group }, currentLocale, t] = await Promise.all([
    requireViewerGroupOrRedirect(),
    getLocale(),
    getTranslations(),
  ])

  const partnerId = group.memberA === user.id ? group.memberB : group.memberA
  const viewerIsMemberA = group.memberA === user.id
  const profileIds: string[] = partnerId ? [user.id, partnerId] : [user.id]

  // Fetch viewer + partner profiles in one round-trip, in parallel with the
  // balance + trip-summary queries (which only need group.id).
  const [fetchedProfiles, groupBalance, tripSummary] = await Promise.all([
    db.select().from(profiles).where(inArray(profiles.id, profileIds)),
    getGroupBalance(group.id),
    getTripSummary(group.id),
  ])

  const viewerProfile = fetchedProfiles.find(p => p.id === user.id)
  const partnerProfile = partnerId
    ? (fetchedProfiles.find(p => p.id === partnerId) ?? null)
    : null

  const viewer: ViewerInfo = {
    id: user.id,
    displayName: viewerProfile?.displayName ?? '?',
    email: user.email ?? '',
    avatarUrl: viewerProfile?.avatarUrl ?? null,
  }
  const partner: PartnerInfo | null = partnerProfile
    ? {
        id: partnerProfile.id,
        displayName: partnerProfile.displayName,
        email: null,
        avatarUrl: partnerProfile.avatarUrl ?? null,
      }
    : null

  const pendingSwap: PendingSwap | null = group.pendingSwapProposedBy && group.pendingSwapExpiresAt
    ? {
        by: group.pendingSwapProposedBy === user.id ? 'self' : 'partner',
        expiresAt: group.pendingSwapExpiresAt,
      }
    : null

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      <SettingsContent
        viewer={viewer}
        partner={partner}
        appVersion={pkg.version}
        currentLocale={currentLocale}
        viewerIsMemberA={viewerIsMemberA}
        groupBalance={groupBalance}
        pendingSwap={pendingSwap}
        tripSummary={tripSummary}
      />
      <BottomNavSkeleton />
      <KofiWidget buttonText={t.support.buttonText} />
    </div>
  )
}
