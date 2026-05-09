import { randomBytes } from 'crypto'
import type { groupInvites, oikosGroups } from '@/lib/db/schema'

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function getInviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}/invite/${token}`
}

type Invite = typeof groupInvites.$inferSelect
type Group = typeof oikosGroups.$inferSelect

export type InviteAcceptError =
  | 'invalid_or_expired'
  | 'already_used'
  | 'expired'
  | 'group_not_found'
  | 'group_full'
  | 'already_member'

export type AcceptResult =
  | { ok: true }
  | { ok: false; error: InviteAcceptError }

export function validateInviteAcceptance(
  invite: Invite | null,
  group: Group | null,
  userId: string,
  now: Date = new Date()
): AcceptResult {
  if (!invite) return { ok: false, error: 'invalid_or_expired' }
  if (invite.acceptedAt) return { ok: false, error: 'already_used' }
  if (invite.expiresAt < now) return { ok: false, error: 'expired' }
  if (!group) return { ok: false, error: 'group_not_found' }
  if (group.memberB !== null) return { ok: false, error: 'group_full' }
  if (group.memberA === userId || group.memberB === userId) return { ok: false, error: 'already_member' }
  return { ok: true }
}
