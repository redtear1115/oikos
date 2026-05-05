import { describe, it, expect } from 'vitest'
import { computeAvgEcon, singleEcon } from '@/lib/fuelEcon'

// Fuel log shape — match production type (subset relevant for econ calc)
type FuelLog = { liters: string | number; odometer: number; loggedAt: Date }

const now = new Date('2026-05-05T12:00:00Z')

describe('singleEcon', () => {
  it('returns null when no previous entry', () => {
    const curr: FuelLog = { liters: 30, odometer: 86000, loggedAt: now }
    expect(singleEcon(curr, null)).toBeNull()
  })

  it('returns km/L when previous entry exists', () => {
    const prev: FuelLog = { liters: 28, odometer: 85500, loggedAt: now }
    const curr: FuelLog = { liters: 30, odometer: 85950, loggedAt: now }
    expect(singleEcon(curr, prev)).toBeCloseTo(15.0)  // 450 km / 30 L
  })

  it('returns null when distance is non-positive (odometer error)', () => {
    const prev: FuelLog = { liters: 28, odometer: 86000, loggedAt: now }
    const curr: FuelLog = { liters: 30, odometer: 85900, loggedAt: now }
    expect(singleEcon(curr, prev)).toBeNull()
  })

  it('handles string liters (Drizzle numeric returns string)', () => {
    const prev: FuelLog = { liters: '28.0', odometer: 85500, loggedAt: now }
    const curr: FuelLog = { liters: '30.0', odometer: 85950, loggedAt: now }
    expect(singleEcon(curr, prev)).toBeCloseTo(15.0)
  })
})

describe('computeAvgEcon (近 6 個月)', () => {
  it('returns null with empty input', () => {
    expect(computeAvgEcon([], now)).toBeNull()
  })

  it('returns null with single entry (no pair)', () => {
    expect(computeAvgEcon(
      [{ liters: 30, odometer: 86000, loggedAt: now }],
      now,
    )).toBeNull()
  })

  it('averages pairs in last 180 days', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') }, // baseline
      { liters: 30, odometer: 85450, loggedAt: new Date('2026-04-15') }, // 450/30 = 15
      { liters: 30, odometer: 85900, loggedAt: new Date('2026-05-01') }, // 450/30 = 15
    ]
    expect(computeAvgEcon(logs, now)).toBeCloseTo(15.0)
  })

  it('excludes entries older than 180 days', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 80000, loggedAt: new Date('2025-09-01') }, // > 180d, excluded
      { liters: 30, odometer: 85450, loggedAt: new Date('2026-04-15') }, // baseline (only 1 in window)
    ]
    // After filtering: only 2026-04-15 remains. With only 1 entry in window → null.
    expect(computeAvgEcon(logs, now)).toBeNull()
  })

  it('handles unsorted input (sorts internally)', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 85900, loggedAt: new Date('2026-05-01') },
      { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') },
      { liters: 30, odometer: 85450, loggedAt: new Date('2026-04-15') },
    ]
    expect(computeAvgEcon(logs, now)).toBeCloseTo(15.0)
  })
})
