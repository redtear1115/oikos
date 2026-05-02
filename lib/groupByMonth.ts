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

const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月',
]

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${year}`
}
