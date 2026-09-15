/**
 * Today's date as YYYY-MM-DD in Asia/Taipei wall-clock.
 *
 * #1262 — `notify-recurring-push` is scheduled at '10 16 * * *', which pg_cron
 * reads as UTC, i.e. 00:10 Asia/Taipei of the *next* day. The previous
 * `new Date().toISOString().slice(0, 10)` therefore returned yesterday in
 * Taipei terms, and the `proposed_date <= today` filter skipped exactly the
 * cards the generators had produced ten minutes earlier — the push went out a
 * day late, with no error anywhere.
 *
 * Formatted through the named zone rather than a hardcoded +8 offset, so this
 * resolves the same zone the cron SQL does with `AT TIME ZONE 'Asia/Taipei'`.
 * `formatToParts` rather than `format` so the output shape does not depend on
 * the locale's date-ordering conventions.
 *
 * Lives in its own module (imported by index.ts) because the Deno entrypoint
 * cannot be loaded under vitest, and this is the part worth testing.
 */
export function taipeiDateISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((p) => p.type === type)?.value
    // A runtime without full ICU data would silently drop parts and hand the
    // caller a malformed date string that the `lte` filter would then match
    // nothing against. Fail loudly instead.
    if (!value) throw new Error(`taipeiDateISO: missing "${type}" part`)
    return value
  }

  return `${get('year')}-${get('month')}-${get('day')}`
}
