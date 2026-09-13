/**
 * Fuel economy (km/L) computation helpers. Per spec C1, we never persist
 * computed econ — always recompute at query time.
 *
 * This module is the single home for fuel-econ math. `lib/db/queries/fuelLog.ts`
 * only fetches rows and delegates here — see #1089, which was filed because the
 * hero-card average was a second, independent implementation living in the
 * query layer under the name `avgFuelEcon`.
 *
 * ⚠️ There are currently TWO averages, and they are NOT interchangeable:
 *
 *   - `computeAvgEcon`     — mean of per-fill km/L, last 180 days only.
 *                            Used by the asset detail page.
 *   - `computeOverallEcon` — total distance / total liters, no time window.
 *                            Used by the assets-list car hero card.
 *
 * They agree only when every fill has the same liters AND everything is inside
 * the 180-day window; otherwise they return different numbers for the same car
 * (see `tests/fuelEcon.test.ts` › "兩種平均法的差異"). Collapsing them into one
 * is a product decision, not a refactor — `car-fuellog-design.md` Q12 says the
 * window should be 近 6 個月, which `computeOverallEcon` does not honour.
 */

interface FuelLogLike {
  liters: string | number
  odometer: number
  loggedAt: Date
}

const SIX_MONTHS_DAYS = 180

function toLiters(v: string | number): number {
  return typeof v === 'string' ? parseFloat(v) : v
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
 * Average km/L over the last 180 days. Returns null when fewer than 2 entries
 * fall in the window (no pair to compute).
 */
export function computeAvgEcon(logs: FuelLogLike[], now: Date = new Date()): number | null {
  const cutoff = new Date(now.getTime() - SIX_MONTHS_DAYS * 24 * 60 * 60 * 1000)
  const inWindow = logs
    .filter(l => l.loggedAt >= cutoff)
    .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())  // ascending

  if (inWindow.length < 2) return null

  const econs: number[] = []
  for (let i = 1; i < inWindow.length; i++) {
    const e = singleEcon(inWindow[i], inWindow[i - 1])
    if (e !== null) econs.push(e)
  }
  if (econs.length === 0) return null
  return econs.reduce((a, b) => a + b, 0) / econs.length
}

/**
 * Overall km/L across the whole input set: total distance / total liters,
 * excluding the earliest entry's liters.
 *
 * The earliest entry establishes the starting odometer, but the fuel it put in
 * was burned *before* the measured distance began — so its liters must not be
 * counted against that distance. Its odometer still anchors the range.
 *
 * Unlike `computeAvgEcon` this applies **no time window**, and it weights each
 * fill by its liters (one ratio of totals) instead of averaging the per-fill
 * ratios. A single mid-series odometer rollback does not void the result here,
 * whereas `computeAvgEcon` drops just that pair.
 *
 * Returns null when fewer than 2 entries, or when distance / liters sum to a
 * non-positive value (odometer entered backwards, zero-liter rows).
 *
 * Ordering: sorted by `loggedAt` descending before use. The sort is stable, so
 * entries sharing a `loggedAt` keep the caller's order — callers that need a
 * deterministic tie-break (e.g. `created_at`) must pre-sort.
 */
export function computeOverallEcon(logs: FuelLogLike[]): number | null {
  if (logs.length < 2) return null
  const desc = [...logs].sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime())

  const latest = desc[0]
  const earliest = desc[desc.length - 1]
  const distance = latest.odometer - earliest.odometer
  // Skip the earliest entry's liters (it is the baseline fill-up).
  const litersSum = desc
    .slice(0, desc.length - 1)
    .reduce((acc, l) => acc + toLiters(l.liters), 0)

  if (distance <= 0 || litersSum <= 0) return null
  return distance / litersSum
}
