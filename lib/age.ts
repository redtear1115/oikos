import { daysBetween, parseLocalDate, todayLocalDate } from './local-date'

export interface Age {
  years: number
  months: number
}

/**
 * Compute age in years + remaining months from a 'YYYY-MM-DD' string to today.
 * Returns null if birthday is null, invalid, or after today.
 *
 * Lives here rather than next to one component because two surfaces show the
 * same age: the 愛物 list cards and the 愛物 detail pages (#1339). They used to
 * carry two implementations, and the detail page's one parsed with
 * `new Date(birth)` — UTC — while comparing against a local `new Date()`.
 *
 * **失效的樣子**: nothing throws. A due date typed in ahead of the birth reads
 * as 「-1 歲」 on the detail page while the list correctly shows no age at all,
 * and on the days around a month boundary the two surfaces quietly disagree by
 * one month.
 */
export function computeAge(birthday: string | null | undefined): Age | null {
  if (!birthday) return null
  const today = todayLocalDate()
  const [y, m, d] = birthday.split('-').map(Number)
  if (!y || !m || !d || m > 12 || d > 31) return null
  let years = today.getFullYear() - y
  let months = today.getMonth() + 1 - m
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (today.getDate() < d && months > 0) {
    months -= 1
  } else if (today.getDate() < d && months === 0) {
    years -= 1
    months = 11
  }
  // A birthday after today (typo, or a due date) has no age yet. Clamping it
  // to 0 used to keep the leftover month count, so 2027-01-01 read as 8 個月.
  if (years < 0) return null
  return { years, months }
}

/**
 * Whole days from a 'YYYY-MM-DD' start date to today, in local calendar days.
 * Returns null if the date is null, invalid, or after today — the day-count
 * counterpart of `computeAge`, with the same future-date guard (#1347).
 *
 * Serves the plant 陪伴天數 and the house 住了幾天 heroes, and the plant list
 * card. The detail heroes used to parse `new Date(ymd)` (UTC) against
 * `Date.now()` and clamp with `Math.max(0, …)`.
 *
 * **失效的樣子**: nothing throws and nothing goes negative. A sprout date or
 * move-in date typed in ahead of time reads as 「0 天」 on the first screen —
 * a plausible-looking number for something that hasn't started yet — and in
 * UTC+8 a date entered as today counts from 08:00, not midnight.
 */
export function daysSince(ymd: string | null | undefined): number | null {
  const start = parseLocalDate(ymd)
  if (!start) return null
  const days = daysBetween(start, todayLocalDate())
  return days < 0 ? null : days
}
