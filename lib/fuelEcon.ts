/**
 * Fuel economy (km/L) computation helpers. Per spec C1, we never persist
 * computed econ — always recompute at query time.
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
