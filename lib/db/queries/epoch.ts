import { db } from '@/lib/db/client'
import { groupEpochs, profiles } from '@/lib/db/schema'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'

/** Cookie key the past-times feature uses to pin the viewer to a prior epoch. */
export const PAST_EPOCH_COOKIE = 'futari_past_epoch'

/**
 * One-shot combo for server components: read the past-epoch cookie and resolve
 * it to a window for `groupId`. Server actions called from client (pagination,
 * etc.) MUST use this helper too so cursor pages match the initial render.
 */
export async function resolveViewerEpochWindow(groupId: string): Promise<EpochWindow> {
  const jar = await cookies()
  const pinned = jar.get(PAST_EPOCH_COOKIE)?.value ?? null
  return getActiveEpochWindow(groupId, pinned)
}

export interface EpochWindow {
  /** Inclusive lower bound on `created_at`. */
  startedAt: Date
  /** Exclusive upper bound on `created_at`, or null for the current chapter. */
  endedAt: Date | null
  /** The matching GroupEpochs row id (null when no rows exist — shouldn't happen post-migration). */
  epochId: string | null
  /** True when the window refers to a closed historical chapter. */
  isPast: boolean
}

export interface EpochListItem {
  id: string
  startedAt: Date
  endedAt: Date | null
  memberAId: string
  memberBId: string | null
  memberAName: string | null
  memberBName: string | null
}

/**
 * Resolve the viewer's currently-active epoch window for a given group.
 *
 * If `pinnedEpochId` is set (from the past-times cookie) AND the id belongs
 * to this group, returns that historical window. Otherwise returns the
 * current (open) epoch. Falls back gracefully — an unknown id is treated
 * as "no pin", so a stale cookie pointing at the wrong group degrades to
 * the current chapter.
 */
export async function getActiveEpochWindow(
  groupId: string,
  pinnedEpochId: string | null,
): Promise<EpochWindow> {
  if (pinnedEpochId) {
    const [pinned] = await db
      .select()
      .from(groupEpochs)
      .where(and(eq(groupEpochs.id, pinnedEpochId), eq(groupEpochs.groupId, groupId)))
      .limit(1)
    if (pinned) {
      return {
        startedAt: pinned.startedAt,
        endedAt: pinned.endedAt,
        epochId: pinned.id,
        isPast: pinned.endedAt !== null,
      }
    }
  }

  const [current] = await db
    .select()
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, groupId), isNull(groupEpochs.endedAt)))
    .limit(1)

  if (current) {
    return {
      startedAt: current.startedAt,
      endedAt: null,
      epochId: current.id,
      isPast: false,
    }
  }

  // Defensive fallback: no epoch rows at all (e.g. tests, or a group that
  // somehow escaped backfill). Treat as "show everything" with a sentinel
  // far-past startedAt so the filter never excludes anything.
  return { startedAt: new Date(0), endedAt: null, epochId: null, isPast: false }
}

/**
 * List all epochs on a group, newest first, with the partner profile names
 * inlined for the past-times page UI.
 */
export async function listEpochs(groupId: string): Promise<EpochListItem[]> {
  const rows = await db
    .select()
    .from(groupEpochs)
    .where(eq(groupEpochs.groupId, groupId))
    .orderBy(desc(groupEpochs.startedAt))

  if (rows.length === 0) return []

  const profileIds = Array.from(new Set(
    rows.flatMap((r) => [r.memberAId, r.memberBId].filter((x): x is string => x !== null)),
  ))

  const profileRows = profileIds.length === 0
    ? []
    : await db
        .select({ id: profiles.id, displayName: profiles.displayName })
        .from(profiles)
        .where(inArray(profiles.id, profileIds))

  const nameById = new Map(profileRows.map((p) => [p.id, p.displayName]))

  return rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    memberAId: r.memberAId,
    memberBId: r.memberBId,
    memberAName: nameById.get(r.memberAId) ?? null,
    memberBName: r.memberBId ? (nameById.get(r.memberBId) ?? null) : null,
  }))
}
