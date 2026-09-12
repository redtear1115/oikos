import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeAvgEcon, computeOverallEcon, singleEcon } from '@/lib/fuelEcon'

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

describe('computeOverallEcon (hero card — 總距離 / 總公升)', () => {
  it('returns null with empty input', () => {
    expect(computeOverallEcon([])).toBeNull()
  })

  it('returns null with single entry (no baseline to measure from)', () => {
    expect(computeOverallEcon(
      [{ liters: 30, odometer: 86000, loggedAt: now }],
    )).toBeNull()
  })

  it('with exactly 2 entries, excludes the earliest entry liters', () => {
    const logs: FuelLog[] = [
      { liters: 99, odometer: 85000, loggedAt: new Date('2026-04-01') }, // baseline: liters ignored
      { liters: 30, odometer: 85450, loggedAt: new Date('2026-04-15') },
    ]
    // 450 km / 30 L — the baseline 99 L must NOT be in the denominator.
    expect(computeOverallEcon(logs)).toBeCloseTo(15.0)
  })

  it('weights by liters across the whole range (ratio of totals)', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') }, // baseline
      { liters: 20, odometer: 85300, loggedAt: new Date('2026-04-15') },
      { liters: 50, odometer: 85800, loggedAt: new Date('2026-05-01') },
    ]
    // 800 km / (20 + 50) L
    expect(computeOverallEcon(logs)).toBeCloseTo(800 / 70)
  })

  it('handles unsorted input (sorts internally)', () => {
    const logs: FuelLog[] = [
      { liters: 50, odometer: 85800, loggedAt: new Date('2026-05-01') },
      { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') },
      { liters: 20, odometer: 85300, loggedAt: new Date('2026-04-15') },
    ]
    expect(computeOverallEcon(logs)).toBeCloseTo(800 / 70)
  })

  it('does not mutate the caller array (query layer reuses the rows)', () => {
    const logs: FuelLog[] = [
      { liters: 50, odometer: 85800, loggedAt: new Date('2026-05-01') },
      { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') },
    ]
    const before = logs.map(l => l.odometer)
    computeOverallEcon(logs)
    expect(logs.map(l => l.odometer)).toEqual(before)
  })

  it('handles string liters (Drizzle numeric returns string)', () => {
    const logs: FuelLog[] = [
      { liters: '30.0', odometer: 85000, loggedAt: new Date('2026-04-01') },
      { liters: '30.0', odometer: 85450, loggedAt: new Date('2026-04-15') },
    ]
    expect(computeOverallEcon(logs)).toBeCloseTo(15.0)
  })

  it('returns null when total distance is non-positive (odometer entered backwards)', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 86000, loggedAt: new Date('2026-04-01') },
      { liters: 30, odometer: 85900, loggedAt: new Date('2026-04-15') },
    ]
    expect(computeOverallEcon(logs)).toBeNull()
  })

  it('returns null when the non-baseline liters sum to zero', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') },
      { liters: 0, odometer: 85450, loggedAt: new Date('2026-04-15') },
    ]
    expect(computeOverallEcon(logs)).toBeNull()
  })

  it('applies NO time window (unlike computeAvgEcon)', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 80000, loggedAt: new Date('2020-01-01') }, // ancient baseline
      { liters: 30, odometer: 80450, loggedAt: new Date('2020-02-01') },
    ]
    expect(computeOverallEcon(logs)).toBeCloseTo(15.0)
    // Same input through the detail-page path: everything is outside 180 days.
    expect(computeAvgEcon(logs, now)).toBeNull()
  })
})

/**
 * #1089 pinned these two averages together. They are NOT the same number, and
 * that is currently unresolved — `car-fuellog-design.md` Q12 says the window
 * should be 近 6 個月, which only `computeAvgEcon` honours.
 *
 * These tests exist so the gap cannot be closed by accident: whoever unifies
 * the formulas has to delete or rewrite them deliberately.
 */
describe('兩種平均法的差異（#1089 — 尚未收斂）', () => {
  const logs: FuelLog[] = [
    { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') }, // baseline
    { liters: 20, odometer: 85300, loggedAt: new Date('2026-04-15') }, // 300/20 = 15
    { liters: 50, odometer: 85800, loggedAt: new Date('2026-05-01') }, // 500/50 = 10
  ]

  it('detail page averages per-fill ratios → 12.5', () => {
    expect(computeAvgEcon(logs, now)).toBeCloseTo(12.5)
  })

  it('hero card divides totals → ~11.43', () => {
    expect(computeOverallEcon(logs)).toBeCloseTo(800 / 70)
  })

  it('the two disagree on identical input', () => {
    const detail = computeAvgEcon(logs, now)!
    const hero = computeOverallEcon(logs)!
    expect(Math.abs(detail - hero)).toBeGreaterThan(1)
  })

  it('they agree when every fill has equal liters and sits inside the window', () => {
    const even: FuelLog[] = [
      { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') },
      { liters: 30, odometer: 85450, loggedAt: new Date('2026-04-15') },
      { liters: 30, odometer: 85900, loggedAt: new Date('2026-05-01') },
    ]
    expect(computeAvgEcon(even, now)).toBeCloseTo(computeOverallEcon(even)!)
  })
})

/**
 * Structural guard for #1089: the query layer must fetch rows and delegate the
 * km/L math here. Without this, the next person to touch the hero card can
 * quietly re-inline the formula and we are back to two implementations that
 * drift silently — nothing at runtime would complain.
 */
describe('#1089 — 油耗計算只留一份實作', () => {
  const querySrc = readFileSync(
    resolve(__dirname, '../lib/db/queries/fuelLog.ts'),
    'utf-8',
  )

  it('getCarHeroStats delegates to lib/fuelEcon instead of computing inline', () => {
    expect(querySrc).toContain("from '@/lib/fuelEcon'")
    expect(querySrc).toContain('computeOverallEcon(logs)')
  })

  it('the query layer holds no km/L arithmetic of its own', () => {
    // The old inline implementation summed liters and divided by distance here.
    expect(querySrc).not.toContain('litersSum')
    expect(querySrc).not.toMatch(/parseFloat\(\s*l\.liters\s*\)/)
  })
})
