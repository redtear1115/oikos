import { db } from '@/lib/db/client'
import { groupEpochs, oikosGroups, profiles } from '@/lib/db/schema'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { getActiveGroupForUser } from '@/lib/db/queries/group'

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
 * Latest closed epoch on a group, or null. Used by the post-leave card on the
 * stayer's dashboard: when the current epoch is solo and the latest closed
 * epoch had a memberB, that memberB just left and we surface a one-shot card.
 */
export async function getLatestPriorClosedEpoch(groupId: string) {
  const [row] = await db
    .select()
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, groupId), sql`${groupEpochs.endedAt} IS NOT NULL`))
    .orderBy(desc(groupEpochs.endedAt))
    .limit(1)
  return row ?? null
}

/**
 * List the epochs on a group that the viewer was a member of, newest first,
 * with the partner profile names inlined for the past-times page UI.
 *
 * Filtering by viewer membership is what makes 過去的時光「個人的」: chapters
 * the viewer wasn't part of (e.g. the stayer's solo period between a partner
 * leaving and re-joining) shouldn't surface on the leaver's timeline. Issue
 * #141 extends this further with a cross-group variant; this only covers
 * the active group.
 */
export async function listEpochs(
  groupId: string,
  viewerId: string,
): Promise<EpochListItem[]> {
  const rows = await db
    .select()
    .from(groupEpochs)
    .where(and(
      eq(groupEpochs.groupId, groupId),
      or(eq(groupEpochs.memberAId, viewerId), eq(groupEpochs.memberBId, viewerId)),
    ))
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

export interface CrossGroupEpochListItem extends EpochListItem {
  /** The group the epoch lives on — may differ from the viewer's current
   *  active group (e.g. a solo Y left behind after leave + rejoin into X). */
  groupId: string
}

/**
 * Cross-group variant of `listEpochs`: surfaces every chapter the viewer was
 * ever a member of, regardless of which group it lived on. Newest first.
 *
 * Why this exists (issue #141): after a leave + rejoin cycle, a user's life
 * chapters span multiple `OikosGroups` rows. `listEpochs(groupId)` only sees
 * one group at a time, hiding chapters that lived on a now-archived solo
 * group. Past-times is「個人的」— filter by viewer membership, not by group.
 *
 * Each row carries its own `groupId` so the click-to-enter flow can scope
 * downstream queries to the correct group (see `resolveViewerEpochContext`).
 */
export async function listEpochsForViewer(
  viewerId: string,
): Promise<CrossGroupEpochListItem[]> {
  const rows = await db
    .select()
    .from(groupEpochs)
    .where(or(eq(groupEpochs.memberAId, viewerId), eq(groupEpochs.memberBId, viewerId)))
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
    groupId: r.groupId,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    memberAId: r.memberAId,
    memberBId: r.memberBId,
    memberAName: nameById.get(r.memberAId) ?? null,
    memberBName: r.memberBId ? (nameById.get(r.memberBId) ?? null) : null,
  }))
}

export interface ViewerEpochContext {
  group: typeof oikosGroups.$inferSelect
  window: EpochWindow
}

/**
 * Resolve the viewer's currently-scoped (group, epoch window) pair for the
 * dashboard / records / assets read paths.
 *
 * When the past-epoch cookie is set AND points at an epoch the viewer was a
 * member of, the resolved group follows the pin — even if it lives on a
 * different `OikosGroups` row than the viewer's most-recent active group.
 * This is what makes cross-group time-travel (#141) actually work: a leaver
 * pinning into their old solo Y gets Y's group context and Y's window, not
 * X's. Without this, the dashboard would silently query X.id with Y's
 * (rejected) pin falling back to X's current epoch.
 *
 * Returns `null` only when the viewer has no group at all AND no valid pin —
 * pages should treat that as「未進入家計簿」(redirect to /onboarding).
 */
export async function resolveViewerEpochContext(
  userId: string,
): Promise<ViewerEpochContext | null> {
  const jar = await cookies()
  const pinId = jar.get(PAST_EPOCH_COOKIE)?.value ?? null

  if (pinId) {
    const [pinned] = await db
      .select()
      .from(groupEpochs)
      .where(eq(groupEpochs.id, pinId))
      .limit(1)

    // Defence in depth: a hostile / stale cookie value falls through to the
    // active-group path rather than leaking a chapter the viewer wasn't on.
    if (pinned && (pinned.memberAId === userId || pinned.memberBId === userId)) {
      const [group] = await db
        .select()
        .from(oikosGroups)
        .where(eq(oikosGroups.id, pinned.groupId))
        .limit(1)
      if (group) {
        return {
          group,
          window: {
            startedAt: pinned.startedAt,
            endedAt: pinned.endedAt,
            epochId: pinned.id,
            isPast: pinned.endedAt !== null,
          },
        }
      }
    }
  }

  const group = await getActiveGroupForUser(userId)
  if (!group) return null

  const [current] = await db
    .select()
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, group.id), isNull(groupEpochs.endedAt)))
    .limit(1)

  return {
    group,
    window: current
      ? {
          startedAt: current.startedAt,
          endedAt: null,
          epochId: current.id,
          isPast: false,
        }
      : { startedAt: new Date(0), endedAt: null, epochId: null, isPast: false },
  }
}
