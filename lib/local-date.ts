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

