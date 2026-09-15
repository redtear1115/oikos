/** Today as YYYY-MM-DD in the runtime's LOCAL timezone (not UTC). */
export function localTodayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Convert a YYYY-MM-DD string to a Date stored at UTC noon.
 * UTC noon means the calendar date is stable across all timezones from UTC-12 to UTC+12 —
 * `dt.getDate()` and `dt.toISOString().slice(0,10)` both return the same date everywhere.
 */
export function ymdToUTCNoon(ymd: string): Date {
  return new Date(ymd + 'T12:00:00.000Z')
}

/**
 * The calendar day before `ymd`, as another YYYY-MM-DD string.
 *
 * Goes through `ymdToUTCNoon` rather than `new Date(ymd)` or month/day
 * arithmetic: pinning to UTC noon leaves 12 hours of slack on both sides, so
 * subtracting one day lands on the intended calendar date in every timezone
 * from UTC-12 to UTC+12, and month and year rollovers (and leap days) come
 * from the Date implementation instead of from hand-written branches.
 *
 * **失效的樣子**: nothing throws and nothing looks wrong. A naive
 * `new Date(ymd)` parses as UTC midnight, `getDate() - 1` then reads in the
 * runtime's local zone, and west of UTC the result is off by one day — which
 * surfaces months later as a single record filed under the wrong date. This
 * repo has been bitten twice by that shape (#1130, #1262).
 */
export function previousDay(ymd: string): string {
  const DAY_MS = 86400000
  return new Date(ymdToUTCNoon(ymd).getTime() - DAY_MS).toISOString().slice(0, 10)
}

/**
 * Today as a Date pinned to midnight in the runtime's LOCAL timezone. Useful
 * as a stable reference for day-count diffs ("how many days until X") where
 * we want to ignore the current time-of-day.
 */
export function todayLocalDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/**
 * Number of full days from `a` to `b` (b - a). Both should already be pinned
 * to midnight (use `todayLocalDate()` / `parseLocalDate()`) for stable counts;
 * passing times mid-day will round down to the nearest full day boundary.
 */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000)
}

/**
 * Parse a YYYY-MM-DD string into a Date at midnight in the LOCAL timezone.
 * Returns null for null/empty input or unparseable strings — callers can chain
 * onto `daysBetween` / `todayLocalDate` for day-count math without sprinkling
 * inline `new Date(${s}T00:00:00)` calls.
 */
export function parseLocalDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

