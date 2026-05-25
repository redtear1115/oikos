// Helpers for working with `YYYY-MM` keys anchored to Asia/Taipei (TW-only product).
// Used by /records stats section and the monthly query helpers.

const TZ = 'Asia/Taipei'

/** Format a Date as 'YYYY-MM' in Asia/Taipei. */
export function monthKeyOf(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  return `${year}-${month}`
}

/** Current local-Taipei month key. */
export function currentMonthKey(): string {
  return monthKeyOf(new Date())
}

/** Add `delta` months to a 'YYYY-MM' key (delta may be negative). */
export function addMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  // Convert (year, month) → absolute month index, add delta, convert back.
  // Math.floor handles negatives correctly when delta crosses year boundaries.
  const idx = y * 12 + (m - 1) + delta
  const ny = Math.floor(idx / 12)
  const nm = ((idx % 12) + 12) % 12 + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/**
 * Local-Taipei naive timestamps for [startOfMonth, startOfNextMonth).
 * Suitable for SQL comparison after `(transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp`.
 */
export function monthRangeIso(monthKey: string): { startIso: string; endIso: string } {
  const next = addMonths(monthKey, 1)
  return {
    startIso: `${monthKey}-01 00:00:00`,
    endIso: `${next}-01 00:00:00`,
  }
}

/**
 * Number of calendar days in a 'YYYY-MM' month (handles leap Februarys).
 * Day 0 of the *next* month rolls back to the last day of this one. UTC
 * arithmetic — we only care about the day count, not any instant.
 */
export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Validate 'YYYY-MM' shape. */
export function isMonthKey(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

/** Clamp a month key to [min, max] inclusive (lexicographic compare works for 'YYYY-MM'). */
export function clampMonthKey(monthKey: string, min: string, max: string): string {
  if (monthKey < min) return min
  if (monthKey > max) return max
  return monthKey
}
