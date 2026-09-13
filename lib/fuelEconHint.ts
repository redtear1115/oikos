/**
 * Which subtitle the asset-detail 平均油耗 block should show (#1097).
 *
 * `computeAvgEcon` returns null for two materially different reasons, and the
 * detail page used to collapse them into one sentence. A car with five fill-ups
 * that simply has not been driven since spring was told 「需要至少 2 次加油記錄」
 * while those five rows sat listed further down the same page.
 *
 * The failure mode is silent: nothing errors, the number just reads 「—」 under a
 * sentence that contradicts the list below it. So the split lives here, as a
 * pure function with its own test, rather than inline in the JSX.
 */
import { SIX_MONTHS_DAYS } from './fuelEcon'

export type AvgEconHint = 'recent' | 'noLog' | 'stale' | 'needMore'

const WINDOW_MS = SIX_MONTHS_DAYS * 24 * 60 * 60 * 1000

/**
 * @param avgEcon    `computeAvgEcon` output — non-null means the window held a
 *                   usable pair, so nothing else needs deciding.
 * @param lastFuelAt Newest fuel log's `loggedAt` in the current chapter, or
 *                   null when the chapter has no logs at all. This single value
 *                   carries both facts the split needs: whether any log exists,
 *                   and whether any log falls inside the window (it is the max
 *                   `loggedAt`, so `lastFuelAt < cutoff` ⟺ zero logs in window).
 * @param now        Injectable for tests.
 *
 * `avgEcon` is computed server-side and `now` here is the client clock, so the
 * two can disagree by the render delay. Checking `avgEcon !== null` first makes
 * that harmless: a skewed clock can only ever pick between the two null-shaped
 * hints, never contradict a number that was successfully computed.
 */
export function avgEconHint(
  avgEcon: number | null,
  lastFuelAt: Date | null,
  now: Date = new Date(),
): AvgEconHint {
  if (avgEcon !== null) return 'recent'
  if (lastFuelAt === null) return 'noLog'
  // Mirrors `computeAvgEcon`'s in-window test (`loggedAt >= cutoff`), so the
  // boundary lands on the same side in both places.
  const cutoff = new Date(now.getTime() - WINDOW_MS)
  return lastFuelAt < cutoff ? 'stale' : 'needMore'
}
