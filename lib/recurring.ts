// Pure date helpers shared by recurring income + recurring expense rules.
// No DB / server imports — safe for client bundles.

import { previousDay } from '@/lib/local-date'

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

/**
 * #1483 — the next occurrence dates the rule form previews under the
 * day-of-month field. Mirrors what `createRule` / `updateRule` settle on for
 * the first date (create keeps today, edit does not — see the long comment in
 * `actions/recurringExpense.ts › createRule`), then walks the series with
 * `computeNextOccurrence`, stopping past `endsOn`.
 *
 * `today` is the device's local day, while the actions use UTC "today", so the
 * first date can differ by one day around UTC midnight. The save toast shows
 * the authoritative server date.
 */
export function previewNextDates(opts: {
  startsOn: IsoDate
  endsOn: IsoDate | null
  intervalMonths: number
  dayOfMonth: number
  today: IsoDate
  isEdit: boolean
  count?: number
}): IsoDate[] {
  const { startsOn, endsOn, intervalMonths, dayOfMonth, today, isEdit, count = 3 } = opts
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return []
  const anchor = firstAnchorFromStart(startsOn, dayOfMonth, intervalMonths)
  let curr: IsoDate
  if (isEdit) {
    curr = anchor > today ? anchor : snapToFuture(anchor, intervalMonths, dayOfMonth, today)
  } else {
    curr = anchor >= today ? anchor : snapToFuture(anchor, intervalMonths, dayOfMonth, previousDay(today))
  }
  const out: IsoDate[] = []
  while (out.length < count && (!endsOn || curr <= endsOn)) {
    out.push(curr)
    curr = computeNextOccurrence(curr, intervalMonths, dayOfMonth)
  }
  return out
}
