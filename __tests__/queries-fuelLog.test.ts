import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Integration tests for lib/db/queries/fuelLog.ts (#1095) ──────────────
//
// Uses the real dev DB because the thing under test is partly SQL: the
// `logged_at DESC, created_at DESC` tie-break cannot be observed through a
// mocked query builder, and neither can "both surfaces agree", since the two
// surfaces reach the shared math through *different* queries.
//
// What is pinned here:
//   1. hero card (getCarHeroStats) and asset detail page (listFuelLogsWithPrev
//      → computeAvgEcon) return the same number for the same car.
//   2. same-day fills come back in a deterministic order from BOTH list
//      queries, and in the same order as each other.
//   3. a car with no fill-up inside 180 days has no average, while its
//      odometer / last-fuel date survive.
// ──────────────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = resolve(__dirname, '../.env.local')
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf-8')
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadEnvLocal()

const { db } = await import('@/lib/db/client')
const {
  profiles, oikosGroups, groupBalance, groupEpochs, assets, carDetails, fuelLogs,
} = await import('@/lib/db/schema')
const {
  listFuelLogsForAsset, listFuelLogsWithPrev, getCarHeroStats,
} = await import('@/lib/db/queries/fuelLog')
const { computeAvgEcon } = await import('@/lib/fuelEcon')
const { inArray } = await import('drizzle-orm')

const DAY = 24 * 60 * 60 * 1000
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY)
}

/** The chapter window these fixtures live in — wide enough to hold every row. */
const epochWindow = {
  startedAt: daysAgo(800),
  endedAt: null,
  epochId: null,
  isPast: false,
}

/** Detail page composition: listFuelLogsWithPrev → computeAvgEcon. */
async function detailPageAvgEcon(assetId: string): Promise<number | null> {
  const rows = await listFuelLogsWithPrev(assetId, epochWindow)
  return computeAvgEcon(rows.map(f => ({
    liters: f.liters,
    odometer: f.odometer,
    loggedAt: f.loggedAt,
    createdAt: f.createdAt,
  })))
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.')
  }
})

const ids = {
  user: '',
  group: '',
  recentCar: '',
  sameDayCar: '',
  dormantCar: '',
}

beforeAll(async () => {
  ids.user = randomUUID()
  await db.insert(profiles).values({ id: ids.user, displayName: 'TEST_1095_user' })

  const [group] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1095_group', memberA: ids.user })
    .returning({ id: oikosGroups.id })
  ids.group = group.id
  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({
    groupId: group.id, startedAt: epochWindow.startedAt, memberAId: ids.user, memberBId: null,
  })

  async function newCar(name: string): Promise<string> {
    const [car] = await db.insert(assets)
      .values({ groupId: group.id, type: 'car', name })
      .returning({ id: assets.id })
    await db.insert(carDetails).values({ assetId: car.id, fuelType: '95' })
    return car.id
  }

  ids.recentCar = await newCar('TEST_1095_recent')
  ids.sameDayCar = await newCar('TEST_1095_sameday')
  ids.dormantCar = await newCar('TEST_1095_dormant')

  // ── recent car: three in-window fills, deliberately uneven liters so the
  // distance-weighted answer differs from the mean of per-fill ratios
  // (800/70 ≈ 11.43 vs 12.5 — the pre-#1095 split).
  await db.insert(fuelLogs).values([
    { assetId: ids.recentCar, liters: '30.00', fuelType: '95', odometer: 85000, loggedAt: daysAgo(40), createdAt: daysAgo(40) },
    { assetId: ids.recentCar, liters: '20.00', fuelType: '95', odometer: 85300, loggedAt: daysAgo(20), createdAt: daysAgo(20) },
    { assetId: ids.recentCar, liters: '50.00', fuelType: '95', odometer: 85800, loggedAt: daysAgo(10), createdAt: daysAgo(10) },
  ])

  // ── same-day car: two fills sharing logged_at, distinct created_at.
  // Inserted oldest-created first *on purpose*: without an ORDER BY tie-break
  // Postgres hands back a small table in physical order, which would then be
  // the wrong (ascending) order — so the ordering assertion below genuinely
  // fails if the `created_at` tie-break is dropped, rather than passing by
  // accident on whatever the heap happened to look like.
  const sharedDay = daysAgo(20)
  await db.insert(fuelLogs).values([
    { assetId: ids.sameDayCar, liters: '10.00', fuelType: '95', odometer: 85100, loggedAt: sharedDay, createdAt: sharedDay, station: 'TEST_1095_first' },
    { assetId: ids.sameDayCar, liters: '40.00', fuelType: '95', odometer: 85400, loggedAt: sharedDay, createdAt: new Date(sharedDay.getTime() + 6 * 60 * 60 * 1000), station: 'TEST_1095_second' },
  ])
  await db.insert(fuelLogs).values({
    assetId: ids.sameDayCar, liters: '99.00', fuelType: '95', odometer: 85000, loggedAt: daysAgo(40), createdAt: daysAgo(40), station: 'TEST_1095_baseline',
  })

  // ── dormant car: plenty of fills, none inside 180 days.
  await db.insert(fuelLogs).values([
    { assetId: ids.dormantCar, liters: '30.00', fuelType: '95', odometer: 70000, loggedAt: daysAgo(400), createdAt: daysAgo(400) },
    { assetId: ids.dormantCar, liters: '30.00', fuelType: '95', odometer: 70450, loggedAt: daysAgo(380), createdAt: daysAgo(380) },
  ])
})

afterAll(async () => {
  try {
    const carIds = [ids.recentCar, ids.sameDayCar, ids.dormantCar].filter(Boolean)
    if (carIds.length) {
      await db.delete(fuelLogs).where(inArray(fuelLogs.assetId, carIds))
      await db.delete(carDetails).where(inArray(carDetails.assetId, carIds))
      await db.delete(assets).where(inArray(assets.id, carIds))
    }
    if (ids.group) {
      await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, [ids.group]))
      await db.delete(groupBalance).where(inArray(groupBalance.groupId, [ids.group]))
      await db.delete(oikosGroups).where(inArray(oikosGroups.id, [ids.group]))
    }
    if (ids.user) await db.delete(profiles).where(inArray(profiles.id, [ids.user]))
  } catch (e) {
    console.error('cleanup failed', e)
  }
})

describe('#1095 — 兩個 surface 同一批資料回同一個數字', () => {
  it('hero card and detail page agree, and both are distance-weighted', async () => {
    const hero = await getCarHeroStats(ids.recentCar, null, epochWindow)
    const detail = await detailPageAvgEcon(ids.recentCar)

    // 800 km / (20 + 50) L — the 30 L baseline fill is excluded from the divisor.
    expect(hero.avgFuelEcon).toBeCloseTo(800 / 70, 6)
    expect(detail).toBeCloseTo(800 / 70, 6)
    expect(detail).toBeCloseTo(hero.avgFuelEcon!, 10)

    // Guard against both surfaces drifting back to the arithmetic mean together.
    expect(hero.avgFuelEcon).not.toBeCloseTo(12.5, 1)
  })

  it('agrees on the same-day car too (where the two used to be order-dependent)', async () => {
    const hero = await getCarHeroStats(ids.sameDayCar, null, epochWindow)
    const detail = await detailPageAvgEcon(ids.sameDayCar)
    // 85400 - 85000 = 400 km over (10 + 40) L; the 99 L baseline is excluded.
    expect(hero.avgFuelEcon).toBeCloseTo(400 / 50, 6)
    expect(detail).toBeCloseTo(hero.avgFuelEcon!, 10)
  })
})

describe('#1095 — listFuelLogsForAsset 的 created_at tie-break', () => {
  it('orders same-day fills by created_at desc, matching listFuelLogsWithPrev', async () => {
    const plain = await listFuelLogsForAsset(ids.sameDayCar, epochWindow)
    const withPrev = await listFuelLogsWithPrev(ids.sameDayCar, epochWindow)

    expect(plain.map(r => r.station)).toEqual(['TEST_1095_second', 'TEST_1095_first', 'TEST_1095_baseline'])
    expect(withPrev.map(r => r.station)).toEqual(plain.map(r => r.station))
  })

  // Weaker than it looks: Postgres is deterministic for a table this small even
  // without an ORDER BY, so this passes with the tie-break removed. It is here
  // to catch *introduced* nondeterminism, not a missing tie-break — the two
  // assertions around it are what pin that.
  it('repeated calls return the identical order', async () => {
    const runs = await Promise.all(
      [0, 1, 2, 3, 4].map(() => listFuelLogsForAsset(ids.sameDayCar, epochWindow)),
    )
    const first = runs[0].map(r => r.id)
    for (const run of runs) expect(run.map(r => r.id)).toEqual(first)
  })

  it('rows[0] is the later-written of the two same-day fills', async () => {
    const hero = await getCarHeroStats(ids.sameDayCar, null, epochWindow)
    expect(hero.latestOdometer).toBe(85400)
  })
})

describe('#1095 — 很久沒加油的車：預期會變成無資料', () => {
  it('has no average, but keeps its odometer and last-fuel date', async () => {
    const hero = await getCarHeroStats(ids.dormantCar, 12345, epochWindow)
    // Both fills are outside 180 days. Pre-#1095 the hero card had no window
    // and would have reported 15.0 km/L from 2023-era data.
    expect(hero.avgFuelEcon).toBeNull()
    expect(hero.latestOdometer).toBe(70450)
    expect(hero.lastFuelDate).not.toBeNull()
  })

  it('the detail page says the same thing', async () => {
    expect(await detailPageAvgEcon(ids.dormantCar)).toBeNull()
  })
})
