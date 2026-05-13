import { localTodayISO } from './local-date'

/**
 * Parse "YYYY-MM-DD" or a full ISO timestamp into a local-time Date.
 * Date-only strings anchor at local noon so getDate()/getFullYear() are stable
 * everywhere from UTC-12 to UTC+12.
 */
function parseLocal(iso: string): Date {
  if (iso.length === 10) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0)
  }
  return new Date(iso)
}

function calendarDayDiff(target: Date, ref: Date): number {
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const b = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

/**
 * Records / dashboard list rows.
 * Diff 0/-1/…/-30 → relative ("today" / "yesterday" / "N days ago"); locale-aware
 * via Intl.RelativeTimeFormat. Older / future → short absolute date (with year
 * only when it differs from today's).
 */
export function formatDateRelative(iso: string, locale: string): string {
  const d = parseLocal(iso)
  const now = new Date()
  const diff = calendarDayDiff(d, now)
  if (diff <= 0 && diff >= -30) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(diff, 'day')
  }
  return formatDateShort(iso, locale, { withYear: d.getFullYear() !== now.getFullYear() })
}

/** Detail pages — full absolute date with weekday, e.g. "2026年5月13日（週三）". */
export function formatDateFull(iso: string, locale: string): string {
  const d = parseLocal(iso)
  const abs = new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(d)
  const wd = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)
  return locale === 'en' ? `${abs} (${wd})` : `${abs}（${wd}）`
}

/** Forms / 建立時間 — full absolute date without weekday. */
export function formatDateAbsolute(iso: string, locale: string): string {
  const d = parseLocal(iso)
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(d)
}

/** Charts / compact contexts — short M/D form (year optional). */
export function formatDateShort(
  iso: string,
  locale: string,
  opts: { withYear?: boolean } = {},
): string {
  const d = parseLocal(iso)
  const fmt: Intl.DateTimeFormatOptions = opts.withYear
    ? { year: 'numeric', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric' }
  return new Intl.DateTimeFormat(locale, fmt).format(d)
}

/** Chart month-axis label, e.g. "5月" / "May". */
export function formatMonthShort(iso: string, locale: string): string {
  const d = parseLocal(iso)
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(d)
}

/**
 * Subtitle under a picked date in form fields — "today" when iso is today,
 * else the short weekday. Locale-aware via Intl.RelativeTimeFormat.
 */
export function formatPickerSubtitle(iso: string, locale: string): string {
  if (iso === localTodayISO()) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'day')
  }
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(parseLocal(iso))
}
