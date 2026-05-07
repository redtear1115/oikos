import pkg from '@/package.json'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles, oikosGroups, invoiceCredentials } from '@/lib/db/schema'
import { and, eq, isNull, or } from 'drizzle-orm'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import {
  SettingsContent,
  type PartnerInfo,
  type ViewerInfo,
  type InvoiceCredentialRow,
} from './_components/SettingsContent'

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

  // Cloud-invoice carriers owned by the viewer (not the partner; RLS-mirrored).
  const credentialRows = await db
    .select({
      id: invoiceCredentials.id,
      barcode: invoiceCredentials.barcode,
      nickname: invoiceCredentials.nickname,
      status: invoiceCredentials.status,
      lastSyncedAt: invoiceCredentials.lastSyncedAt,
    })
    .from(invoiceCredentials)
    .where(and(
      eq(invoiceCredentials.groupId, group.id),
      eq(invoiceCredentials.userId, user.id),
      isNull(invoiceCredentials.deletedAt),
    ))
  const invoiceCreds: InvoiceCredentialRow[] = credentialRows.map((r) => ({
    id: r.id,
    barcode: r.barcode,
    nickname: r.nickname,
    status: r.status,
    lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
  }))

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

  return (
    <div className="relative min-h-dvh pb-[92px]">
      <SettingsContent
        viewer={viewer}
        partner={partner}
        groupId={group.id}
        groupName={group.name}
        appVersion={pkg.version}
        invoiceCredentials={invoiceCreds}
      />
      <BottomNavSkeleton />
    </div>
  )
}
