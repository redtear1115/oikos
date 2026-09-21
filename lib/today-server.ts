// Server-only: uses next/headers `headers()`, which throws in Client Components.
import { cache } from 'react'
import { headers } from 'next/headers'
import { timeZoneFromCookieHeader, todayYMDIn } from './today'

/**
 * The device's IANA zone from the `tz` cookie (#1360), or Asia/Taipei when
 * the cookie is missing or not a zone Intl accepts.
 *
 * The cookie is client-controlled. Its value is only ever passed to the
 * `Intl.DateTimeFormat` constructor — first to validate it (an unknown zone
 * throws RangeError and we fall back), then to format today's date. It never
 * reaches SQL, a response header, or a log line. Keep it that way: if a
 * future use needs it anywhere else, it needs its own validation there.
 */
export const getTimeZone = cache(async (): Promise<string> => {
  // The raw header, not `cookies()`: a sibling site's
  // `Domain=.southern-light.dev` cookie can share the name, and Next's
  // RequestCookies keys by name — a later duplicate overwrites an earlier
  // one, so `getAll('tz')` returns at most one entry, the *last* one. The
  // client takes the *first valid* one; parsing the header with the client's
  // own function is what makes the two agree.
  //
  // **失效的樣子** if they disagree: no error anywhere. The server renders
  // one zone's today, hydration succeeds, then useToday() swaps in the
  // device's day — a number that jumps once on load, on every load, for as
  // long as the duplicate cookie exists.
  return timeZoneFromCookieHeader((await headers()).get('cookie'))
})

/** Today as 'YYYY-MM-DD' in the device's zone (see getTimeZone). */
export const getTodayYMD = cache(async (): Promise<string> => {
  return todayYMDIn(await getTimeZone())
})
