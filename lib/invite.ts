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

export type AcceptResult =
  | { ok: true }
  | { ok: false; error: string }

export function validateInviteAcceptance(
  invite: Invite | null,
  group: Group | null,
  userId: string,
  now: Date = new Date()
): AcceptResult {
  if (!invite) return { ok: false, error: '邀請連結無效或已過期' }
  if (invite.acceptedAt) return { ok: false, error: '邀請連結已被使用' }
  if (invite.expiresAt < now) return { ok: false, error: '邀請連結已過期' }
  if (!group) return { ok: false, error: '找不到群組' }
  if (group.memberB !== null) return { ok: false, error: '此帳本已有兩位成員' }
  if (group.memberA === userId || group.memberB === userId) return { ok: false, error: '你已經是此帳本的成員' }
  return { ok: true }
}
