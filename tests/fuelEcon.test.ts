import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeAvgEcon, singleEcon } from '@/lib/fuelEcon'

// Fuel log shape — match production type (subset relevant for econ calc)
type FuelLog = { liters: string | number; odometer: number; loggedAt: Date; createdAt?: Date }

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

describe('computeAvgEcon — 距離加權 × 近 180 天（#1095）', () => {
  it('returns null with empty input', () => {
    expect(computeAvgEcon([], now)).toBeNull()
  })

  it('returns null with single entry (no baseline to measure from)', () => {
    expect(computeAvgEcon(
      [{ liters: 30, odometer: 86000, loggedAt: now }],
      now,
    )).toBeNull()
  })

  it('with exactly 2 entries, excludes the earliest entry liters', () => {
    const logs: FuelLog[] = [
      { liters: 99, odometer: 85000, loggedAt: new Date('2026-04-01') }, // baseline: liters ignored
      { liters: 30, odometer: 85450, loggedAt: new Date('2026-04-15') },
    ]
    // 450 km / 30 L — the baseline 99 L must NOT be in the denominator.
    expect(computeAvgEcon(logs, now)).toBeCloseTo(15.0)
  })

  it('weights by distance across the window (ratio of totals, NOT mean of per-fill ratios)', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') }, // baseline
      { liters: 20, odometer: 85300, loggedAt: new Date('2026-04-15') }, // 300/20 = 15
      { liters: 50, odometer: 85800, loggedAt: new Date('2026-05-01') }, // 500/50 = 10
    ]
    // 800 km / (20 + 50) L ≈ 11.43. The arithmetic mean of the two legs is
    // 12.5 — that was the pre-#1095 detail-page number, and it overstates
    // economy because it weights a 20 L leg the same as a 50 L one.
    expect(computeAvgEcon(logs, now)).toBeCloseTo(800 / 70)
    expect(computeAvgEcon(logs, now)).not.toBeCloseTo(12.5)
  })

  it('handles unsorted input (sorts internally)', () => {
    const logs: FuelLog[] = [
      { liters: 50, odometer: 85800, loggedAt: new Date('2026-05-01') },
      { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') },
      { liters: 20, odometer: 85300, loggedAt: new Date('2026-04-15') },
    ]
    expect(computeAvgEcon(logs, now)).toBeCloseTo(800 / 70)
  })

  it('does not mutate the caller array (query layer reuses the rows)', () => {
    const logs: FuelLog[] = [
      { liters: 50, odometer: 85800, loggedAt: new Date('2026-05-01') },
      { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') },
    ]
    const before = logs.map(l => l.odometer)
    computeAvgEcon(logs, now)
    expect(logs.map(l => l.odometer)).toEqual(before)
  })

  it('handles string liters (Drizzle numeric returns string)', () => {
    const logs: FuelLog[] = [
      { liters: '30.0', odometer: 85000, loggedAt: new Date('2026-04-01') },
      { liters: '30.0', odometer: 85450, loggedAt: new Date('2026-04-15') },
    ]
    expect(computeAvgEcon(logs, now)).toBeCloseTo(15.0)
  })

  it('returns null when total distance is non-positive (odometer entered backwards)', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 86000, loggedAt: new Date('2026-04-01') },
      { liters: 30, odometer: 85900, loggedAt: new Date('2026-04-15') },
    ]
    expect(computeAvgEcon(logs, now)).toBeNull()
  })

  it('returns null when the non-baseline liters sum to zero', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 85000, loggedAt: new Date('2026-04-01') },
      { liters: 0, odometer: 85450, loggedAt: new Date('2026-04-15') },
    ]
    expect(computeAvgEcon(logs, now)).toBeNull()
  })
})

/**
 * The window is anchored to `now`, not to the newest fill. That is the whole
 * point: 「平均油耗」means recent economy, so a car nobody has refuelled in half
 * a year has no average rather than a stale one (#1095). If this suite ever
 * goes green with a number here, the anchor has drifted to the data.
 */
describe('computeAvgEcon — 180 天窗的基準點是 now，不是最後一筆加油', () => {
  it('a car with plenty of fills, all older than 180 days, has no average', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 80000, loggedAt: new Date('2020-01-01') },
      { liters: 30, odometer: 80450, loggedAt: new Date('2020-02-01') },
      { liters: 30, odometer: 80900, loggedAt: new Date('2020-03-01') },
    ]
    // Anchored to the last fill these three would average a healthy 15 km/L.
    expect(computeAvgEcon(logs, now)).toBeNull()
  })

  it('drops out-of-window entries before measuring, leaving a 1-entry window → null', () => {
    const logs: FuelLog[] = [
      { liters: 30, odometer: 80000, loggedAt: new Date('2025-09-01') }, // > 180d, excluded
      { liters: 30, odometer: 85450, loggedAt: new Date('2026-04-15') }, // only 1 in window
    ]
    expect(computeAvgEcon(logs, now)).toBeNull()
  })

  it('the excluded baseline is the earliest fill IN the window, not all-time', () => {
    const logs: FuelLog[] = [
      { liters: 99, odometer: 70000, loggedAt: new Date('2024-01-01') }, // ancient, dropped entirely
      { liters: 99, odometer: 85000, loggedAt: new Date('2026-04-01') }, // in-window baseline
      { liters: 30, odometer: 85450, loggedAt: new Date('2026-04-15') },
    ]
    // 450 km / 30 L — neither 99 L row is in the denominator, and the ancient
    // row's odometer does not anchor the distance either.
    expect(computeAvgEcon(logs, now)).toBeCloseTo(15.0)
  })

  it('boundary: exactly 180 days old is inside the window', () => {
    const at180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
    const logs: FuelLog[] = [
      { liters: 99, odometer: 85000, loggedAt: at180 },
      { liters: 30, odometer: 85450, loggedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    ]
    expect(computeAvgEcon(logs, now)).toBeCloseTo(15.0)
  })

  it('boundary: 181 days old falls out, taking the pair with it', () => {
    const at181 = new Date(now.getTime() - 181 * 24 * 60 * 60 * 1000)
    const logs: FuelLog[] = [
      { liters: 99, odometer: 85000, loggedAt: at181 },
      { liters: 30, odometer: 85450, loggedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    ]
    expect(computeAvgEcon(logs, now)).toBeNull()
  })

  it('boundary: one millisecond older than 180 days falls out', () => {
    const justOut = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000 - 1)
    const logs: FuelLog[] = [
      { liters: 99, odometer: 85000, loggedAt: justOut },
      { liters: 30, odometer: 85450, loggedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    ]
    expect(computeAvgEcon(logs, now)).toBeNull()
  })
})

/**
 * Same-day fills used to make the answer depend on fetch order, because the
 * earliest row's liters are excluded and "earliest" was undefined for a tie.
 * Nothing errored — the number just moved between identical requests (#1095).
 */
describe('computeAvgEcon — 同日多筆加油的 tie-break', () => {
  const day = new Date('2026-04-15T00:00:00Z')
  // Two fills on the same calendar day: the 10 L one was written down first.
  const first: FuelLog = { liters: 10, odometer: 85100, loggedAt: day, createdAt: new Date('2026-04-15T09:00:00Z') }
  const second: FuelLog = { liters: 40, odometer: 85400, loggedAt: day, createdAt: new Date('2026-04-15T20:00:00Z') }
  const baseline: FuelLog = { liters: 99, odometer: 85000, loggedAt: new Date('2026-04-01'), createdAt: new Date('2026-04-01') }

  // baseline excluded → 400 km / (10 + 40) L
  const expected = 400 / 50

  it('is stable regardless of the order the caller supplies the same-day rows in', () => {
    expect(computeAvgEcon([baseline, first, second], now)).toBeCloseTo(expected)
    expect(computeAvgEcon([baseline, second, first], now)).toBeCloseTo(expected)
    expect(computeAvgEcon([second, first, baseline], now)).toBeCloseTo(expected)
    expect(computeAvgEcon([second, baseline, first], now)).toBeCloseTo(expected)
  })

  it('when the tie IS the baseline, createdAt decides which liters are dropped', () => {
    // Both fills share loggedAt AND are the oldest rows; the earlier-written one
    // (10 L, odometer 85100) is the baseline, so only 40 L stays in the divisor.
    const logs: FuelLog[] = [second, first]
    expect(computeAvgEcon(logs, now)).toBeCloseTo(300 / 40)
    expect(computeAvgEcon([first, second], now)).toBeCloseTo(300 / 40)
  })
})

/**
 * Structural guard for #1089 / #1095: the query layer must fetch rows and
 * delegate the km/L math here, using the *same* function as the detail page.
 * Without this, the next person to touch the hero card can quietly re-inline a
 * formula and we are back to two implementations that drift silently — nothing
 * at runtime would complain, the two screens would just disagree.
 */
describe('#1089 / #1095 — 油耗計算只留一份實作、兩個 surface 共用', () => {
  const querySrc = readFileSync(
    resolve(__dirname, '../lib/db/queries/fuelLog.ts'),
    'utf-8',
  )
  const detailSrc = readFileSync(
    resolve(__dirname, '../app/(dashboard)/assets/[id]/page.tsx'),
    'utf-8',
  )
  const econSrc = readFileSync(
    resolve(__dirname, '../lib/fuelEcon.ts'),
    'utf-8',
  )

  it('getCarHeroStats delegates to lib/fuelEcon instead of computing inline', () => {
    expect(querySrc).toContain("from '@/lib/fuelEcon'")
    expect(querySrc).toContain('computeAvgEcon(logs)')
  })

  it('the asset detail page calls the same function', () => {
    expect(detailSrc).toContain("from '@/lib/fuelEcon'")
    expect(detailSrc).toContain('computeAvgEcon(')
  })

  it('the query layer holds no km/L arithmetic of its own', () => {
    // The old inline implementation summed liters and divided by distance here.
    expect(querySrc).not.toContain('litersSum')
    expect(querySrc).not.toMatch(/parseFloat\(\s*l\.liters\s*\)/)
  })

  it('the second, unwindowed average is gone (not merely unused)', () => {
    expect(econSrc).not.toContain('computeOverallEcon')
  })

  it('listFuelLogsForAsset orders with the created_at tie-break', () => {
    expect(querySrc).toContain('desc(fuelLogs.loggedAt), desc(fuelLogs.createdAt)')
    // …and listFuelLogsWithPrev still agrees with it.
    expect(querySrc).toContain('ORDER BY logged_at DESC, created_at DESC')
  })
})
