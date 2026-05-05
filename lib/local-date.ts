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

/** Format an ISO date string as "YYYY 年 M 月 D 日" in Chinese. */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y} 年 ${m} 月 ${d} 日`
}

/** Return Chinese weekday label for an ISO date string (uses local time). */
export function weekday(iso: string): string {
  const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
  return days[new Date(iso + 'T00:00:00').getDay()]
}
