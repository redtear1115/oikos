'use server'

import { db } from '@/lib/db/client'
import { groupInvites, oikosGroups, profiles } from '@/lib/db/schema'
import {
  generateToken,
  getInviteUrl,
  validateInviteAcceptance,
  type InviteAcceptError,
} from '@/lib/invite'
import { createClient } from '@/lib/supabase/server'
import { and, eq, isNull } from 'drizzle-orm'

export type InvitePreview =
  | { ok: true; groupName: string; inviterName: string }
  | { ok: false; error: InviteAcceptError }

export async function createInvite(groupId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.insert(groupInvites).values({
    groupId,
    invitedBy: user.id,
    token,
    expiresAt,
  })

  return getInviteUrl(token)
}

/**
 * Validate an invite token without committing membership.
 * Used for the bilateral trust confirmation step on the invitee side: we want
 * to surface "is this invite still good?" + the inviter's name *before* the
 * invitee clicks the confirm CTA.
 */
export async function previewInvite(token: string): Promise<InvitePreview> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [invite] = await db
    .select()
    .from(groupInvites)
    .where(eq(groupInvites.token, token))
    .limit(1)

  const [group] = invite
    ? await db.select().from(oikosGroups).where(eq(oikosGroups.id, invite.groupId)).limit(1)
    : []

  const result = validateInviteAcceptance(invite ?? null, group ?? null, user.id)
  if (!result.ok) return { ok: false, error: result.error }

  const [inviter] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, invite.invitedBy))
    .limit(1)

  return {
    ok: true,
    groupName: group.name,
    inviterName: inviter?.displayName ?? '',
  }
}

export async function acceptInvite(token: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [invite] = await db
    .select()
    .from(groupInvites)
    .where(eq(groupInvites.token, token))
    .limit(1)

  const [group] = invite
    ? await db.select().from(oikosGroups).where(eq(oikosGroups.id, invite.groupId)).limit(1)
    : []

  const result = validateInviteAcceptance(invite ?? null, group ?? null, user.id)
  if (!result.ok) throw new Error(result.error)

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(oikosGroups)
      .set({ memberB: user.id })
      .where(and(eq(oikosGroups.id, invite.groupId), isNull(oikosGroups.memberB)))
      .returning()

    if (updated.length === 0) throw new Error('group_full')

    await tx
      .update(groupInvites)
      .set({ acceptedAt: new Date() })
      .where(and(eq(groupInvites.token, token), isNull(groupInvites.acceptedAt)))
  })

  return invite.groupId
}
