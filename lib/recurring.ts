// Pure date helpers shared by recurring income + recurring expense rules.
// No DB / server imports — safe for client bundles.

export type IsoDate = string

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function parseIso(d: IsoDate): { y: number; m: number; d: number } {
  const [y, m, day] = d.split('-').map(Number)
  return { y, m: m - 1, d: day }
}

function formatIso(y: number, monthIndex: number, day: number): IsoDate {
  const mm = String(monthIndex + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

export function computeNextOccurrence(
  currDate: IsoDate,
  intervalMonths: number,
  dayOfMonth: number,
): IsoDate {
  const { y, m } = parseIso(currDate)
  const totalMonths = m + intervalMonths
  const targetYear = y + Math.floor(totalMonths / 12)
  const targetMonth = ((totalMonths % 12) + 12) % 12
  const clamped = Math.min(dayOfMonth, lastDayOfMonth(targetYear, targetMonth))
  return formatIso(targetYear, targetMonth, clamped)
}

export function snapToFuture(
  nextOccurrence: IsoDate,
  intervalMonths: number,
  dayOfMonth: number,
  today: IsoDate,
): IsoDate {
  let curr = nextOccurrence
  while (curr <= today) {
    curr = computeNextOccurrence(curr, intervalMonths, dayOfMonth)
  }
  return curr
}

/**
 * Returns the first anchor date on or after `startsOn` at `dayOfMonth`
 * (clamped to the month's last day). If `startsOn`'s own month already
 * passed the day, advances by one interval.
 */
export function firstAnchorFromStart(
  startsOn: IsoDate,
  dayOfMonth: number,
  intervalMonths: number,
): IsoDate {
  const [y, m] = startsOn.split('-').map(Number)
  const lastThis = new Date(y, m, 0).getDate()
  const candThis = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(dayOfMonth, lastThis)).padStart(2, '0')}`
  if (candThis >= startsOn) return candThis
  return computeNextOccurrence(candThis, intervalMonths, dayOfMonth)
}
