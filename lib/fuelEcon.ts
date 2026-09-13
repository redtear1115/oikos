/**
 * Fuel economy (km/L) computation helpers. Per spec C1, we never persist
 * computed econ — always recompute at query time.
 *
 * This module is the single home for fuel-econ math. `lib/db/queries/fuelLog.ts`
 * only fetches rows and delegates here — see #1089, which was filed because the
 * hero-card average was a second, independent implementation living in the
 * query layer under the name `avgFuelEcon`.
 *
 * ## One average, distance-weighted, 180-day window (#1095)
 *
 * There used to be two averages — a mean of per-fill ratios on the detail page
 * and a ratio of totals on the hero card — and the same car showed two numbers.
 * #1095 collapsed them into `computeAvgEcon`:
 *
 *   - **Distance-weighted** (total distance ÷ total liters), not the mean of
 *     per-fill km/L. The arithmetic mean systematically overstates economy: it
 *     gives a 20 L thrifty leg the same weight as a 50 L thirsty one, but the
 *     driver paid for the 50 L. Totals answer the question actually being
 *     asked — "over this period, how far did we get on how much fuel".
 *   - **Window = last 180 days, measured from `now`, not from the last fill.**
 *     「平均油耗」means *recent* economy. Anchoring to the last fill would make
 *     a car parked for two years still report a number, which is precisely the
 *     reading the window exists to prevent. Consequence (intended, see #1095):
 *     a car with no fill-up in the last 180 days has **no** average and the
 *     callers must render their existing null state.
 *
 * Failure mode to recognise: if this ever silently returns a number for a car
 * that has not been refuelled in half a year, the window anchor has drifted to
 * the data instead of the clock.
 */

interface FuelLogLike {
  liters: string | number
  odometer: number
  loggedAt: Date
  /**
   * Optional tie-break for same-day fills — "which one was written down first".
   * Not the chapter/epoch predicate (that is a query-layer concern); purely an
   * ordering key so two fills sharing a `loggedAt` sort deterministically.
   * Callers that omit it get the input array order for ties.
   */
  createdAt?: Date
}

/**
 * The detail-page econ window, in days. Exported so the UI layer can tell the
 * two shapes of `computeAvgEcon(...) === null` apart (a car with plenty of
 * history that simply has not been refuelled inside this window vs. a car that
 * genuinely lacks logs) without hard-coding a second copy of 180 — see #1097
 * and `lib/fuelEconHint.ts`. Read-only for callers; the math below owns it.
 */
export const SIX_MONTHS_DAYS = 180

function toLiters(v: string | number): number {
  return typeof v === 'string' ? parseFloat(v) : v
}

/**
 * Oldest → newest. Ties on `loggedAt` break on `createdAt` when present, so the
 * result does not depend on the order the caller happened to fetch rows in.
 */
function ascending(a: FuelLogLike, b: FuelLogLike): number {
  const byLogged = a.loggedAt.getTime() - b.loggedAt.getTime()
  if (byLogged !== 0) return byLogged
  if (a.createdAt && b.createdAt) return a.createdAt.getTime() - b.createdAt.getTime()
  return 0
}

/**
 * Single fueling km/L = (curr.odometer - prev.odometer) / curr.liters.
 * Returns null when no prev, dist ≤ 0, or liters ≤ 0.
 */
export function singleEcon(curr: FuelLogLike, prev: FuelLogLike | null): number | null {
  if (!prev) return null
  const dist = curr.odometer - prev.odometer
  const liters = toLiters(curr.liters)
  if (dist <= 0 || liters <= 0) return null
  return dist / liters
}

/**
 * Average km/L over the last 180 days: total distance ÷ total liters.
 *
 * The earliest in-window entry establishes the starting odometer, but the fuel
 * it put in was burned *before* the measured distance began — so its liters
 * must not be counted against that distance. Its odometer still anchors the
 * range.
 *
 * Returns null when fewer than 2 entries fall in the window (nothing to measure
 * between), or when the distance / liters totals are non-positive (odometer
 * entered backwards, zero-liter rows).
 *
 * Because this is a ratio of totals rather than a mean of pairs, one mis-keyed
 * mid-series odometer no longer voids just its own pair — it shifts the whole
 * result. Only a first/last reversal makes it null.
 *
 * `now` is injectable for tests; production callers use the real clock.
 */
export function computeAvgEcon(logs: FuelLogLike[], now: Date = new Date()): number | null {
  const cutoff = new Date(now.getTime() - SIX_MONTHS_DAYS * 24 * 60 * 60 * 1000)
  const inWindow = [...logs].filter(l => l.loggedAt >= cutoff).sort(ascending)

  if (inWindow.length < 2) return null

  const earliest = inWindow[0]
  const latest = inWindow[inWindow.length - 1]
  const distance = latest.odometer - earliest.odometer
  // Skip the earliest entry's liters (it is the baseline fill-up).
  const litersSum = inWindow
    .slice(1)
    .reduce((acc, l) => acc + toLiters(l.liters), 0)

  if (distance <= 0 || litersSum <= 0) return null
  return distance / litersSum
}
