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
  const value = cookieStore.get(TZ_COOKIE)?.value
  return isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE
})

/** Today as 'YYYY-MM-DD' in the device's zone (see getTimeZone). */
export const getTodayYMD = cache(async (): Promise<string> => {
  return todayYMDIn(await getTimeZone())
})
