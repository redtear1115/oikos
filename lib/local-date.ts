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
