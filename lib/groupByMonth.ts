export interface MonthGroup<T> {
  monthKey: string  // 'YYYY-MM'
  items: T[]
}

/**
 * Bucket items by `YYYY-MM` derived from a getter on each item.
 * Output groups are in input order (caller is responsible for desc sort).
 * Items within each group also preserve input order.
 */
export function groupByMonth<T>(
  items: T[],
  getISODate: (item: T) => string,
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = []
  let current: MonthGroup<T> | null = null
  for (const item of items) {
    const monthKey = getISODate(item).slice(0, 7) // 'YYYY-MM'
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
