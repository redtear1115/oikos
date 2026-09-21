// Pure helpers shared between server actions, queries, and UI for the
// monthly-review feature. Kept dependency-free so they're trivially unit
// testable.

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
 * not chapter-scoped: compute_monthly_review_snapshot (drizzle/0061) sums every
 * group row whose transacted_at falls in the calendar month and stores the
 * largest expense's payer name, so a straddling month mixes both chapters.
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
