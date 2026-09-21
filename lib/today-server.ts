// Server-only: uses next/headers `cookies()`, which throws in Client Components.
import { cache } from 'react'
import { cookies } from 'next/headers'
import { DEFAULT_TIME_ZONE, TZ_COOKIE, isValidTimeZone, todayYMDIn } from './today'

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
  const cookieStore = await cookies()
  // getAll, not get: a sibling site's `Domain=.southern-light.dev` cookie can
  // share the name (see readTimeZoneCookie). First valid one wins, matching
  // the client.
  const valid = cookieStore.getAll(TZ_COOKIE).map(c => c.value).find(isValidTimeZone)
  return valid ?? DEFAULT_TIME_ZONE
})

/** Today as 'YYYY-MM-DD' in the device's zone (see getTimeZone). */
export const getTodayYMD = cache(async (): Promise<string> => {
  return todayYMDIn(await getTimeZone())
})
