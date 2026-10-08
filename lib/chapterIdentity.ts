import type { ChapterIdentity } from '@/app/(dashboard)/_components/MemberContext'

/** The shape `getEpochMembers` returns (kept structural so this stays pure). */
export interface ChapterMembers {
  memberAId: string
  memberBId: string | null
  memberAName: string | null
  memberBName: string | null
}

/**
 * #1604 — the chapter identity the dashboard layout puts in MemberContext when
 * the viewer is pinned to a past chapter: the OTHER person named on that
 * chapter's GroupEpochs row, with the name `getEpochMembers` returned and no
 * avatar. Never today's group row.
 *
 * - `members` null (chapter row unreadable) → solo, no partner: fail closed
 *   rather than fall back to the live partner.
 * - A missing profile name falls back to `fallbackName` (the generic 「對方」),
 *   the same fallback CompactRow already uses. A deleted account is not this
 *   case: its tombstone row reads 「已離開的夥伴」 and comes through as a name.
 */
export function buildChapterIdentity(
  members: ChapterMembers | null,
  viewerId: string,
  fallbackName: string,
): ChapterIdentity {
  if (!members) return { partner: null, isSolo: true }
  const viewerIsChapterA = members.memberAId === viewerId
  const partnerId = viewerIsChapterA ? members.memberBId : members.memberAId
  if (!partnerId) return { partner: null, isSolo: true }
  const name = (viewerIsChapterA ? members.memberBName : members.memberAName) ?? fallbackName
  return {
    partner: {
      id: partnerId,
      displayName: name,
      initial: (name[0] ?? '?').toUpperCase(),
      avatarUrl: null,
    },
    isSolo: false,
  }
}
