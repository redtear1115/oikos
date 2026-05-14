import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Integration tests for lib/db/queries/trips.ts ────────────────────────
//
// Uses the real dev DB because the query helpers use Drizzle against Postgres.
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
  profiles,
  oikosGroups,
  groupBalance,
  groupEpochs,
  trips,
  cashTransactions,
} = await import('@/lib/db/schema')
const {
  listActiveTrips,
  listAllTrips,
  getTripById,
  hasActiveTrip,
  listTripRecords,
} = await import('@/lib/db/queries/trips')
const { eq, inArray } = await import('drizzle-orm')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.',
    )
  }
})

interface SeedRefs {
  userId: string
  groupId: string
  epochId: string
  tripIds: string[]
  cashTxIds: string[]
}

async function seedGroup(): Promise<SeedRefs> {
  const userId = randomUUID()
  const epochStartedAt = new Date('2026-05-01T00:00:00Z')

  await db.insert(profiles).values({ id: userId, displayName: 'TEST_TRIPS_user' })

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_TRIPS_group',
    memberA: userId,
    currentEpochStartedAt: epochStartedAt,
  }).returning({ id: oikosGroups.id })

  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })

  const [epoch] = await db.insert(groupEpochs).values({
    groupId: group.id,
    startedAt: epochStartedAt,
    memberAId: userId,
  }).returning({ id: groupEpochs.id })

  return {
    userId,
    groupId: group.id,
    epochId: epoch.id,
    tripIds: [],
    cashTxIds: [],
  }
}

async function cleanup(refs: SeedRefs) {
  if (refs.cashTxIds.length) {
    await db.delete(cashTransactions).where(inArray(cashTransactions.id, refs.cashTxIds))
  }
  if (refs.tripIds.length) {
    await db.delete(trips).where(inArray(trips.id, refs.tripIds))
  }
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.groupId))
  await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.groupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
  await db.delete(profiles).where(eq(profiles.id, refs.userId))
}

describe('trips query helpers', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('listActiveTrips returns only active non-deleted trips for the given group + epoch', async () => {
    const refs = await seedGroup()
    activeRefs = refs

    const [activeTrip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Active trip',
      startDate: '2026-05-10',
      status: 'active',
    }).returning({ id: trips.id })
    refs.tripIds.push(activeTrip.id)

    const [endedTrip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Ended trip',
      startDate: '2026-05-02',
      endDate: '2026-05-05',
      status: 'ended',
      endedAt: new Date(),
    }).returning({ id: trips.id })
    refs.tripIds.push(endedTrip.id)

    const [deletedTrip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Deleted trip',
      startDate: '2026-05-03',
      status: 'active',
      deletedAt: new Date(),
    }).returning({ id: trips.id })
    refs.tripIds.push(deletedTrip.id)

    const result = await listActiveTrips(refs.groupId, refs.epochId)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(activeTrip.id)
    expect(result[0].status).toBe('active')
  })

  it('listAllTrips returns active + ended (not deleted) ordered by start_date DESC', async () => {
    const refs = await seedGroup()
    activeRefs = refs

    const [trip1] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Earlier trip',
      startDate: '2026-05-02',
      endDate: '2026-05-04',
      status: 'ended',
      endedAt: new Date(),
    }).returning({ id: trips.id })
    refs.tripIds.push(trip1.id)

    const [trip2] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Later trip',
      startDate: '2026-05-10',
      status: 'active',
    }).returning({ id: trips.id })
    refs.tripIds.push(trip2.id)

    const [deletedTrip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Deleted trip',
      startDate: '2026-05-08',
      status: 'active',
      deletedAt: new Date(),
    }).returning({ id: trips.id })
    refs.tripIds.push(deletedTrip.id)

    const result = await listAllTrips(refs.groupId, refs.epochId)
    expect(result).toHaveLength(2)
    // ordered start_date DESC: trip2 (05-10) before trip1 (05-02)
    expect(result[0].id).toBe(trip2.id)
    expect(result[1].id).toBe(trip1.id)
  })

  it('getTripById returns trip when not deleted', async () => {
    const refs = await seedGroup()
    activeRefs = refs

    const [trip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Find me',
      startDate: '2026-05-10',
      status: 'active',
    }).returning({ id: trips.id })
    refs.tripIds.push(trip.id)

    const found = await getTripById(trip.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(trip.id)
  })

  it('getTripById returns null when deleted', async () => {
    const refs = await seedGroup()
    activeRefs = refs

    const [trip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Deleted',
      startDate: '2026-05-10',
      status: 'active',
      deletedAt: new Date(),
    }).returning({ id: trips.id })
    refs.tripIds.push(trip.id)

    const found = await getTripById(trip.id)
    expect(found).toBeNull()
  })

  it('getTripById returns null for unknown id', async () => {
    const refs = await seedGroup()
    activeRefs = refs

    const found = await getTripById(randomUUID())
    expect(found).toBeNull()
  })

  it('hasActiveTrip returns true when an active trip exists', async () => {
    const refs = await seedGroup()
    activeRefs = refs

    const [trip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Active',
      startDate: '2026-05-10',
      status: 'active',
    }).returning({ id: trips.id })
    refs.tripIds.push(trip.id)

    const result = await hasActiveTrip(refs.groupId, refs.epochId)
    expect(result).toBe(true)
  })

  it('hasActiveTrip returns false when no active trip exists', async () => {
    const refs = await seedGroup()
    activeRefs = refs

    const [trip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Ended',
      startDate: '2026-05-02',
      endDate: '2026-05-04',
      status: 'ended',
      endedAt: new Date(),
    }).returning({ id: trips.id })
    refs.tripIds.push(trip.id)

    const result = await hasActiveTrip(refs.groupId, refs.epochId)
    expect(result).toBe(false)
  })

  it('listTripRecords returns non-deleted records for that trip ordered by transactedAt DESC', async () => {
    const refs = await seedGroup()
    activeRefs = refs

    const [trip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Trip with records',
      startDate: '2026-05-10',
      status: 'active',
    }).returning({ id: trips.id })
    refs.tripIds.push(trip.id)

    const [tx1] = await db.insert(cashTransactions).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 500,
      splitType: 'all_mine',
      description: 'Earlier tx',
      category: 'food',
      transactedAt: new Date('2026-05-10T10:00:00Z'),
      tripId: trip.id,
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(tx1.id)

    const [tx2] = await db.insert(cashTransactions).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 1000,
      splitType: 'all_mine',
      description: 'Later tx',
      category: 'transport',
      transactedAt: new Date('2026-05-10T14:00:00Z'),
      tripId: trip.id,
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(tx2.id)

    // Soft-deleted record — should be excluded
    const [tx3] = await db.insert(cashTransactions).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 200,
      splitType: 'all_mine',
      description: 'Deleted tx',
      category: 'food',
      transactedAt: new Date('2026-05-10T12:00:00Z'),
      tripId: trip.id,
      deletedAt: new Date(),
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(tx3.id)

    const records = await listTripRecords(trip.id)
    expect(records).toHaveLength(2)
    // ordered transactedAt DESC: tx2 (14:00) before tx1 (10:00)
    expect(records[0].id).toBe(tx2.id)
    expect(records[1].id).toBe(tx1.id)
  })
})
