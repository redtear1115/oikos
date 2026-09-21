/**
 * "Today" as a calendar date that the server and the client agree on (#1360).
 *
 * The dashboard is server-rendered on Vercel, which runs in UTC; the browser
 * runs in the device's zone. Anything a client component renders from
 * `todayLocalDate()` / `localTodayISO()` — an age, a day count, a 今天/昨天
 * label — is therefore computed twice from two different calendars, and
 * between 00:00 and 08:00 Taipei time the two disagree by a day.
 *
 * **失效的樣子**: nothing looks wrong in the browser — after hydration the
 * client's number is the one on screen, and it's right. What breaks is
 * hydration itself: React logs #418 (text mismatch) in Sentry, throws the
 * server HTML away and re-renders the tree on the client. It only happens in
 * the eight hours after Taipei midnight, so it reads as a flaky error, not a
 * bug.
 *
 * The fix: the server computes today in the *device's* zone (reported by the
 * client in the `tz` cookie, see `syncTimeZoneCookie`) and hands it down via
 * `TodayProvider`; `useToday()` uses that value while hydrating and the
 * client's own clock afterwards.
 *
 * Safe to import from both server and client modules.
 */

/** Device IANA zone, written by the client, read by the server. */
export const TZ_COOKIE = 'tz'

/**
 * Used when there's no (valid) cookie yet: the first request from a device.
 * The product's home zone, and the zone the SQL month buckets already use
 * (`AT TIME ZONE 'Asia/Taipei'`, lib/db/queries/_predicates.ts).
 */
export const DEFAULT_TIME_ZONE = 'Asia/Taipei'

/** True when `tz` is an IANA zone this runtime's Intl accepts. */
export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    // RangeError: Invalid time zone specified
    return false
  }
}

/**
 * Today as 'YYYY-MM-DD' in `timeZone`, independent of the runtime's own zone.
 * `en-CA` formats dates as YYYY-MM-DD.
 */
export function todayYMDIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** The device's IANA zone, or null where Intl can't say (very old engines). */
export function deviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimeZone(tz) ? tz : null
  } catch {
    return null
  }
}

/**
 * The first *valid* `tz` value in a `document.cookie` string, or null.
 *
 * Invalid entries — undecodable (`%E0%A4%A`), or not a zone Intl knows —
 * are skipped as if absent. There can be more than one: southern-light.dev
 * hosts sibling sites, and a cookie set with `Domain=.southern-light.dev`
 * shows up here next to ours under the same name.
 *
 * **失效的樣子** if this ever throws: it runs in TodayProvider's effect, so
 * the whole dashboard unmounts to the global error page — on every load,
 * because the throw comes before the cookie could be rewritten (#1360).
 */
export function readTimeZoneCookie(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k !== TZ_COOKIE) continue
    let value: string
    try {
      value = decodeURIComponent(v.join('='))
    } catch {
      continue // URIError: malformed percent-encoding
    }
    if (isValidTimeZone(value)) return value
  }
  return null
}

/**
 * The zone a raw Cookie header resolves to: the first valid `tz` value, else
 * Asia/Taipei. The server calls this on the request's `Cookie` header, and it
 * is the same `readTimeZoneCookie` the client runs on `document.cookie` — one
 * rule on both sides by construction. Browsers list cookies in the same order
 * in both places (RFC 6265 §5.4: longer path first, then oldest first).
 */
export function timeZoneFromCookieHeader(cookieHeader: string | null | undefined): string {
  return readTimeZoneCookie(cookieHeader ?? '') ?? DEFAULT_TIME_ZONE
}

/**
 * Write the device zone into the `tz` cookie when it differs from what's
 * stored. Client-only; no-op on the server. Returns whether it wrote.
 *
 * `max-age` matters: without it this is a session cookie, and a native
 * WebView drops session cookies when the app is killed — every cold start
 * would then be a "first visit" again.
 */
export function syncTimeZoneCookie(): boolean {
  if (typeof document === 'undefined') return false
  // Never throws: a display preference must not be able to take the
  // dashboard down (see readTimeZoneCookie). Reading or writing
  // document.cookie can itself throw (SecurityError in sandboxed frames).
  try {
    const tz = deviceTimeZone()
    if (!tz) return false
    if (readTimeZoneCookie(document.cookie) === tz) return false
    // Site-wide, 1-year, Lax — a per-device display preference, not sensitive.
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; SameSite=Lax`
    return true
  } catch {
    return false
  }
}
