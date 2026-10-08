// Pure helpers shared between server actions, queries, and UI for the
// monthly-review feature. Kept dependency-free so they're trivially unit
// testable.

import type { ClientReviewSnapshot, MonthlyReviewSnapshotRow } from '@/lib/db/queries/monthlyReview'

export const MONTHLY_REVIEW_MESSAGE_MAX_CODEPOINTS = 200

/**
 * Counts user-perceived codepoints — `[...str].length` correctly handles
 * surrogate pairs (most emoji are 2 UTF-16 code units → 1 codepoint).
 *
 * Note: ZWJ-joined emoji (e.g. 👨‍👩‍👧) consist of multiple codepoints and
 * will count as such. The spec accepts this trade-off (see implementation
 * risk #7 in monthly-review-design.md).
 */
export function codepointLength(s: string): number {
  return [...s].length
}

/** Truncate a string to N codepoints. */
export function truncateCodepoints(s: string, max: number): string {
  return [...s].slice(0, max).join('')
}

const MONTH_PATH_RE = /^(\d{4})-(\d{2})$/

export interface YearMonth { year: number; month: number }

/**
 * Parses a YYYY-MM string into {year, month}. Returns null on bad shape or
 * out-of-range month. Used by /review/[month] route segments.
 */
export function parseYearMonth(input: string | null | undefined): YearMonth | null {
  if (!input) return null
  const m = MONTH_PATH_RE.exec(input)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (year < 2000 || year > 2999) return null
  if (month < 1 || month > 12) return null
  return { year, month }
}

export function formatYearMonth({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Returns the previous month given a YearMonth (handles year boundary). */
export function previousMonth({ year, month }: YearMonth): YearMonth {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

/** Returns the next month given a YearMonth (handles year boundary). */
export function nextMonth({ year, month }: YearMonth): YearMonth {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

/**
 * Returns the YearMonth corresponding to "now" interpreted in Asia/Taipei.
 * The dashboard banner uses this to find the previous month's snapshot;
 * routes use it to validate that the URL doesn't address the future.
 */
export function currentYearMonthInTaipei(now: Date = new Date()): YearMonth {
  // 'sv-SE' formats as YYYY-MM-DD HH:mm:ss — easiest stable parse.
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
  })
  const parts = fmt.formatToParts(now)
  const y = Number(parts.find(p => p.type === 'year')?.value)
  const m = Number(parts.find(p => p.type === 'month')?.value)
  return { year: y, month: m }
}

/** First instant of a calendar month in Asia/Taipei (UTC+8, no DST). */
export function taipeiMonthStart({ year, month }: YearMonth): Date {
  return new Date(Date.UTC(year, month - 1, 1) - 8 * 60 * 60 * 1000)
}

/**
 * Does month `ym` belong to a chapter (#1380)? Reviews follow the chapter, not
 * the group (user decision 2026-09-21): a new partner must not see the months
 * a previous partner shared.
 *
 * A month belongs only if it lies ENTIRELY inside the chapter window —
 * `[startedAt, endedAt)`, endedAt null for the open chapter. A month that
 * straddles a chapter boundary belongs to no chapter, because its snapshot is
 * not chapter-scoped: compute_monthly_review_snapshot (drizzle/0089) sums every
 * group row whose transacted_at falls in the calendar month and stores the
 * largest expense's payer id, so a straddling month mixes both chapters. (The
 * payer's name is resolved per chapter at read time, see
 * resolveReviewPayerName; the amounts and descriptions are not.)
 * Hiding it everywhere is the only rule that never shows one partner's month to
 * the next. What it costs: the partial month in which a chapter starts (or
 * ends) has no review page in either chapter.
 *
 * Failure looks like: no error anywhere — just a month from the previous
 * partner appearing in the new partner's list, banner or 月回顧 cell.
 */
export function isMonthInChapter(ym: YearMonth, chapter: { startedAt: Date; endedAt: Date | null }): boolean {
  const start = taipeiMonthStart(ym).getTime()
  const end = taipeiMonthStart(nextMonth(ym)).getTime()
  return start >= chapter.startedAt.getTime()
    && (chapter.endedAt === null || end <= chapter.endedAt.getTime())
}

/**
 * #1618 — the name card 2 (largest expense) shows for its payer, resolved on
 * the server and only against the two people of the chapter being viewed.
 *
 * - `chapter` (from getEpochMembers): the payer must be one of its two member
 *   ids, and the name is that chapter's name for them — frozen at the close
 *   for a closed chapter (「已離開的夥伴」 once the account is deleted), live for
 *   the open one. This applies to the viewer too.
 * - No chapter row (legacy group without epochs): `members` — the page's
 *   Profiles rows, which only ever hold the chapter's member ids.
 * - Anyone else (e.g. a former partner whose future-dated row is the largest
 *   in a later chapter's month) → null: the card shows no name.
 *
 * Never look a payer up in Profiles by id: that is the cross-chapter leak.
 * Failure looks like: nothing errors; the next partner reads the previous
 * partner's current name on card 2.
 */
export function resolveReviewPayerName(
  payerId: string | null,
  chapter: {
    memberAId: string
    memberBId: string | null
    memberAName: string | null
    memberBName: string | null
  } | null,
  members: { id: string; displayName: string }[],
): string | null {
  if (!payerId) return null
  if (chapter) {
    if (payerId === chapter.memberAId) return chapter.memberAName ?? null
    if (chapter.memberBId && payerId === chapter.memberBId) return chapter.memberBName ?? null
    return null
  }
  return members.find((m) => m.id === payerId)?.displayName ?? null
}

/**
 * #1618 — drop the payer id before the snapshot crosses to the client. The id
 * can be a former partner's (a removed member's future-dated row can be the
 * largest of a later chapter's month), and the client only ever needs the
 * name the server resolved. Failure looks like: nothing breaks; the id shows
 * up in the page's RSC payload.
 */
export function toClientReviewSnapshot(row: MonthlyReviewSnapshotRow): ClientReviewSnapshot {
  const { largestExpensePaidBy: _payerId, ...rest } = row
  return rest
}

/** True if `a` is strictly after `b` (later year, or same year & later month). */
export function isAfter(a: YearMonth, b: YearMonth): boolean {
  if (a.year !== b.year) return a.year > b.year
  return a.month > b.month
}

export function validateMessageBody(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('留言內容格式錯誤')
  }
  // Trim trailing whitespace only — leading whitespace can be intentional
  // (indented lines, leading emoji etc.) but trailing whitespace is almost
  // always accidental.
  const cleaned = input.replace(/\s+$/, '')
  const len = codepointLength(cleaned)
  if (len === 0) {
    throw new Error('留言不能為空')
  }
  if (len > MONTHLY_REVIEW_MESSAGE_MAX_CODEPOINTS) {
    throw new Error(`留言最長 ${MONTHLY_REVIEW_MESSAGE_MAX_CODEPOINTS} 字`)
  }
  return cleaned
}
