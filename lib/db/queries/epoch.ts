import { cache } from 'react'
import { db } from '@/lib/db/client'
import {
  cashTransactions,
  groupEpochs,
  incomeTransactions,
  oikosGroups,
  outings,
  profiles,
  settlements,
} from '@/lib/db/schema'
import { and, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { epochClause } from '@/lib/db/queries/_predicates'

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
 * Does the group's CURRENT chapter contain any ledger record — cash, income,
 * or settlement — that hasn't been soft-deleted?
 *
 * The one question behind the base-currency lock (#68), asked from both sides:
 * `actions/currency.ts#setBaseCurrency` enforces it, and the currency settings
 * page renders the selector disabled from the same answer. Those used to be two
 * independent implementations, which is exactly how they drifted apart — #1106
 * fixed the timestamp in the action while the page kept counting by event date.
 * Callers get a boolean, not three counts, so there is nothing left to
 * re-derive (or re-derive differently) at either call site.
 *
 * Chapter membership is `created_at`, never the event dates (`transacted_at` /
 * `occurred_at` / `settled_at`) — see the docstring atop
 * `lib/db/queries/balance.ts`. A CSV import of last year's receipts lands rows
 * whose event dates predate the chapter but which were *recorded* inside it;
 * they show up in /records, stats and balance, so they lock the currency too.
 * Counting by event date reported 0 records for exactly that ledger and let the
 * base currency change, silently re-reading every stored integer amount as a
 * different currency.
 *
 * Always the current chapter, never the pinned one: a viewer time-travelling
 * through 過去的時光 still can't edit history, and the lock is about what the
 * live chapter already holds.
 *
 * An ACTIVE 出遊 counts too (#943), even one with no expenses yet. An outing
 * stores its amounts as integers in the base currency it was opened with, and
 * ending it folds the couple's share into GroupBalance as those integers.
 * Change the base currency underneath it and the fold writes NT$1500 as ¥1500,
 * with nothing on screen to say so. Ended outings have already folded and no
 * longer care. setBaseCurrency runs this check under the group-row lock that
 * createOuting also takes, so an outing cannot be opened in a base that is
 * about to change; endOuting's refusal on a mismatch is only a defensive guard.
 */
export async function currentEpochHasRecords(
  group: Pick<typeof oikosGroups.$inferSelect, 'id' | 'currentEpochStartedAt'>,
  /** setBaseCurrency passes its transaction so the check reads what is
   *  committed after it has locked the group row (#943). */
  tx: typeof db | DbTransaction = db,
): Promise<boolean> {
  const window: EpochWindow = {
    startedAt: group.currentEpochStartedAt,
    // The current chapter is open by definition — no upper bound.
    endedAt: null,
    epochId: null,
    isPast: false,
  }

  const [cashRow, incomeRow, settlementRow, outingRow] = await Promise.all([
    tx.select({ n: count() }).from(cashTransactions).where(and(
      eq(cashTransactions.groupId, group.id),
      epochClause(cashTransactions.createdAt, window),
      isNull(cashTransactions.deletedAt),
    )),
    tx.select({ n: count() }).from(incomeTransactions).where(and(
      eq(incomeTransactions.groupId, group.id),
      epochClause(incomeTransactions.createdAt, window),
      isNull(incomeTransactions.deletedAt),
    )),
    tx.select({ n: count() }).from(settlements).where(and(
      eq(settlements.groupId, group.id),
      epochClause(settlements.createdAt, window),
      isNull(settlements.deletedAt),
    )),
    tx.select({ n: count() }).from(outings).where(and(
      eq(outings.groupId, group.id),
      epochClause(outings.createdAt, window),
      eq(outings.status, 'active'),
      isNull(outings.deletedAt),
    )),
  ])

  return Number(cashRow[0].n) + Number(incomeRow[0].n) + Number(settlementRow[0].n)
    + Number(outingRow[0].n) > 0
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
export const resolveViewerEpochContext = cache(async (
  userId: string,
): Promise<ViewerEpochContext | null> => {
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
})

/**
 * The two people of a chapter, as recorded on its GroupEpochs row (#1384).
 * A closed chapter's members are not the group's current members: after a
 * leave, the group row names the stayer and whoever joined next, while the
 * epoch row still names the pair who lived that chapter. Anything rendering a
 * chapter — names, avatars, "whose message" — must read these.
 */
export async function getEpochMembers(
  epochId: string,
): Promise<{ memberAId: string; memberBId: string | null } | null> {
  const [row] = await db
    .select({ memberAId: groupEpochs.memberAId, memberBId: groupEpochs.memberBId })
    .from(groupEpochs)
    .where(eq(groupEpochs.id, epochId))
    .limit(1)
  return row ?? null
}

export interface EpochCloseLock {
  /** The locked group rows, by id. A missing id means the group does not exist. */
  groups: Map<string, { memberA: string; memberB: string | null }>
  /** The locked open chapter row of each group, by group id (absent: none open). */
  openEpochs: Map<string, { id: string; memberAId: string; memberBId: string | null }>
  /**
   * The chapter boundary: `clock_timestamp()` read after every lock above is
   * held, as Postgres text. Write it back with {@link boundarySql}; never parse
   * it into a JS `Date`.
   */
  boundary: string
}

/**
 * The first statements of every transaction that ends a chapter (leaveGroup,
 * removePartner, acceptInvite). Locks, per group in ascending id order:
 *
 *   1. `OikosGroups … FOR NO KEY UPDATE`
 *   2. the open `GroupEpochs` row `… FOR NO KEY UPDATE`
 *
 * and only then reads the boundary from the DB clock.
 *
 * - NO KEY UPDATE, never plain FOR UPDATE, on the group row. Every insert of a
 *   row that references a group (cash, income, settlements) takes FOR KEY
 *   SHARE on that group for its foreign-key check, and FOR KEY SHARE conflicts
 *   only with FOR UPDATE. A writer that holds the open chapter row FOR SHARE
 *   and then inserts a money row would otherwise wait on the closer's group
 *   lock while the closer waits on the chapter row. The symptom is Postgres
 *   aborting one side with 40P01 (deadlock detected), which reaches the user
 *   as a generic error.
 * - Ascending group id, so two closers that touch the same two groups (two
 *   accepts in opposite roles) queue instead of deadlocking.
 * - The boundary is read after the locks: a writer that held the chapter row
 *   has committed by then, so every row it wrote has `created_at` < boundary.
 *   A boundary fixed earlier (`new Date()` before the transaction, or the
 *   transaction-start `now()`) can predate such a row, and the row silently
 *   shows up in the next chapter instead of the one it was written in.
 * - The boundary stays text. A JS `Date` keeps milliseconds only; Postgres
 *   keeps microseconds, so a round-tripped boundary can land before a
 *   `created_at` in the same millisecond, with nothing erroring.
 *
 * The same lock order is used by the account-deletion processor.
 */
export async function lockForEpochClose(
  tx: DbTransaction,
  groupIds: string[],
): Promise<EpochCloseLock> {
  const ordered = Array.from(new Set(groupIds.map((id) => id.toLowerCase()))).sort()

  const groups: EpochCloseLock['groups'] = new Map()
  for (const id of ordered) {
    const [row] = await tx
      .select({ memberA: oikosGroups.memberA, memberB: oikosGroups.memberB })
      .from(oikosGroups)
      .where(eq(oikosGroups.id, id))
      .for('no key update')
    if (row) groups.set(id, row)
  }

  const openEpochs: EpochCloseLock['openEpochs'] = new Map()
  for (const id of ordered) {
    const [row] = await tx
      .select({ id: groupEpochs.id, memberAId: groupEpochs.memberAId, memberBId: groupEpochs.memberBId })
      .from(groupEpochs)
      .where(and(eq(groupEpochs.groupId, id), isNull(groupEpochs.endedAt)))
      .for('no key update')
    if (row) openEpochs.set(id, row)
  }

  const [{ boundary }] = await tx.execute<{ boundary: string }>(
    sql`SELECT clock_timestamp()::text AS boundary`,
  )
  return { groups, openEpochs, boundary }
}

/**
 * The first statement of a transaction that edits or deletes an existing money
 * row (expense, income, settlement, fuel log): take the group's open chapter
 * row `FOR SHARE`, then re-read the group's two members. Returns `null` when
 * the group has no open chapter; callers fail closed with their own not-found
 * code.
 *
 * Why FOR SHARE on the chapter row: every closer ({@link lockForEpochClose})
 * must take that same row FOR NO KEY UPDATE, which conflicts with FOR SHARE.
 * So a closer either
 *   - finished first: the row read here is the new chapter, and the target
 *     row's `created_at` check (`openChapterCreatedClause`) sees the new start; or
 *   - waits for this transaction: it reads its boundary after this commit, so
 *     the row an edit re-inserts (`created_at` = this transaction's `now()`)
 *     stays in the chapter it was edited in.
 * Without the lock, an edit committing while a closer runs can re-insert its
 * row after the boundary was fixed, and the row silently moves to the next
 * chapter's balance.
 *
 * Lock order: this chapter row, then the money rows the caller updates and
 * inserts. The inserts take FOR KEY SHARE on OikosGroups for their foreign key;
 * closers hold that row FOR NO KEY UPDATE, which does not conflict, so the two
 * cannot deadlock. Do not add a lock on OikosGroups here: FOR SHARE or
 * stronger would wait on a closer that is itself waiting on this chapter row,
 * and Postgres aborts one side with 40P01.
 *
 * The members are read in the same transaction, after the lock, so an edit's
 * payer / recipient check sees the membership of the chapter it writes into,
 * not the one resolved before the transaction began.
 */
export async function lockOpenChapterForWrite(
  tx: DbTransaction,
  groupId: string,
): Promise<{ epochId: string; group: { memberA: string; memberB: string | null } } | null> {
  const epoch = await lockOpenEpochForWrite(tx, groupId)
  if (!epoch) return null

  const [group] = await tx
    .select({ memberA: oikosGroups.memberA, memberB: oikosGroups.memberB })
    .from(oikosGroups)
    .where(eq(oikosGroups.id, groupId))
  if (!group) return null

  return { epochId: epoch.id, group }
}

/** A boundary from {@link lockForEpochClose}, as a timestamptz value for a write. */
export function boundarySql(boundary: string) {
  return sql`${boundary}::timestamptz`
}

/**
 * The writer side of {@link lockForEpochClose}: take the group's open chapter
 * row `FOR SHARE` and return its id, or `null` when no chapter is open.
 *
 * Used by writes that must land in the chapter they checked (ending a trip and
 * writing its summary rows, editing a trip or its expenses). Call it after any
 * lock on the entity row itself (entity row → chapter row, never the reverse),
 * then compare the returned id with the entity's chapter and fail closed when
 * they differ or the result is `null`.
 *
 * - While this lock is held, a closer cannot take the chapter row (its FOR NO
 *   KEY UPDATE waits), so it reads its boundary only after this transaction
 *   commits: every row written here has `created_at` < that boundary.
 * - If a closer holds the row first, this waits; once the closer commits, the
 *   row no longer matches `ended_at IS NULL` and the next chapter's row is not
 *   visible to this statement, so the result is `null`. Without this lock
 *   nothing errors: the write commits after the close, and rows written by it
 *   silently show up in the next chapter.
 */
export async function lockOpenEpochForWrite(
  tx: DbTransaction,
  groupId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: groupEpochs.id })
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, groupId), isNull(groupEpochs.endedAt)))
    .for('share')
  return row ?? null
}
