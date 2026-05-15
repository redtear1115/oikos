import pkg from '@/package.json'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { getLocale } from '@/lib/i18n/t'
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
  const [{ user, group }, currentLocale] = await Promise.all([
    requireViewerGroupOrRedirect(),
    getLocale(),
  ])

  const [viewerProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1)

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
    avatarUrl: viewerProfile?.avatarUrl ?? null,
    defaultSplitType: viewerProfile?.defaultSplitType ?? 'half',
  }
  const partner: PartnerInfo | null = partnerProfile
    ? {
        id: partnerProfile.id,
        displayName: partnerProfile.displayName,
        email: null,
        avatarUrl: partnerProfile.avatarUrl ?? null,
      }
    : null

  const viewerIsMemberA = group.memberA === user.id
  const [groupBalance, tripSummary] = await Promise.all([
    getGroupBalance(group.id),
    getTripSummary(group.id),
  ])

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
        groupId={group.id}
        groupName={group.name}
        appVersion={pkg.version}
        currentLocale={currentLocale}
        groupDefaultRatioA={group?.defaultSplitRatioA ?? null}
        viewerIsMemberA={viewerIsMemberA}
        groupBalance={groupBalance}
        pendingSwap={pendingSwap}
        guardianBetaEnabled={group.guardianBetaEnabled}
        tripSummary={tripSummary}
      />
      <BottomNavSkeleton />
    </div>
  )
}
