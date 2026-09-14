import { monthKeyOf } from '@/lib/monthKey'

export interface MonthGroup<T> {
  monthKey: string  // 'YYYY-MM', Asia/Taipei
  items: T[]
}

/**
 * Bucket items by Asia/Taipei calendar month, derived from an ISO-timestamp
 * getter on each item. Output groups are in input order (caller is
 * responsible for desc sort). Items within each group also preserve input
 * order.
 *
 * Uses `monthKeyOf` (Taipei-local), not a bare `.slice(0, 7)` on the ISO
 * string — the whole product (and every SQL month-scoping query) is
 * Asia/Taipei, and slicing the UTC string instead would bucket a row at
 * Taipei 00:00–08:00 on the 1st into the *previous* month's group (#1208).
 */
export function groupByMonth<T>(
  items: T[],
  getISODate: (item: T) => string,
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = []
  let current: MonthGroup<T> | null = null
  for (const item of items) {
    const monthKey = monthKeyOf(new Date(getISODate(item)))
    if (!current || current.monthKey !== monthKey) {
      current = { monthKey, items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}

export function monthLabel(monthKey: string, locale: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' })
    .format(new Date(year, month - 1, 1))
}
