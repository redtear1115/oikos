import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Integration tests for actions/trip.ts ────────────────────────────────
//
// Uses the real dev DB because the actions hit Drizzle/Postgres directly.
// ──────────────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = resolve(__dirname, '../../.env.local')
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

let mockUserId: string = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }),
    },
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}))

const { db } = await import('@/lib/db/client')
const {
  profiles,
  oikosGroups,
  groupBalance,
  groupEpochs,
  trips,
} = await import('@/lib/db/schema')
const { createTrip, endTrip, updateTrip, softDeleteTrip } = await import('@/actions/trip')
const { getTripById } = await import('@/lib/db/queries/trips')
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
  epochStartedAt: Date
  tripIds: string[]
}

async function seedGroup(): Promise<SeedRefs> {
  const userId = randomUUID()
  const epochStartedAt = new Date('2026-05-10T00:00:00Z')

  await db.insert(profiles).values({ id: userId, displayName: 'TEST_TRIP_ACTION_user' })

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_TRIP_ACTION_group',
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
    epochStartedAt,
    tripIds: [],
  }
}

async function cleanup(refs: SeedRefs) {
  if (refs.tripIds.length) {
    await db.delete(trips).where(inArray(trips.id, refs.tripIds))
  }
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.groupId))
  await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.groupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
  await db.delete(profiles).where(eq(profiles.id, refs.userId))
}

describe('createTrip', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('succeeds with startDate >= currentEpochStartedAt; trip has correct epochId and status=active', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const result = await createTrip({
      name: '東京之旅',
      startDate: '2026-05-10',
    })
    refs.tripIds.push(result.id)

    expect(result.epochId).toBe(refs.epochId)
    expect(result.status).toBe('active')
    expect(result.name).toBe('東京之旅')
  })

  it('rejects with "不可建在過去章節" when startDate < currentEpochStartedAt', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    await expect(createTrip({
      name: 'Past trip',
      startDate: '2026-05-09',  // before epoch started 2026-05-10
    })).rejects.toThrow('不可建在過去章節')
  })

  it('rejects when name is empty', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    await expect(createTrip({
      name: '',
      startDate: '2026-05-10',
    })).rejects.toThrow('旅行名稱為空')
  })

  it('rejects when name is whitespace only', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    await expect(createTrip({
      name: '   ',
      startDate: '2026-05-10',
    })).rejects.toThrow('旅行名稱為空')
  })

  it('rejects when endDate < startDate', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    await expect(createTrip({
      name: '倒退旅行',
      startDate: '2026-05-15',
      endDate: '2026-05-14',
    })).rejects.toThrow('結束日期不可早於起始日')
  })
})

describe('endTrip', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('flips status to ended, stamps endedAt, and sets endDate', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const created = await createTrip({
      name: 'End me',
      startDate: '2026-05-10',
    })
    refs.tripIds.push(created.id)

    const result = await endTrip({ tripId: created.id, endDate: '2026-05-20' })
    expect(result.status).toBe('ended')
    expect(result.endDate).toBe('2026-05-20')
    expect(result.endedAt).not.toBeNull()
  })
})

describe('updateTrip', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('rejects when startDate is earlier than currentEpochStartedAt', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const created = await createTrip({
      name: 'Update me',
      startDate: '2026-05-10',
    })
    refs.tripIds.push(created.id)

    await expect(updateTrip({
      tripId: created.id,
      startDate: '2026-05-09',  // before epoch started 2026-05-10
    })).rejects.toThrow('不可移動至過去章節')
  })

  it('succeeds when startDate is on or after currentEpochStartedAt', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const created = await createTrip({
      name: 'Update me',
      startDate: '2026-05-10',
    })
    refs.tripIds.push(created.id)

    const result = await updateTrip({
      tripId: created.id,
      name: 'Updated name',
      startDate: '2026-05-12',
    })
    expect(result.name).toBe('Updated name')
    expect(result.startDate).toBe('2026-05-12')
  })
})

describe('softDeleteTrip', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('sets deletedAt so trip disappears from getTripById', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const created = await createTrip({
      name: 'Delete me',
      startDate: '2026-05-10',
    })
    refs.tripIds.push(created.id)

    // Verify it exists first
    const before = await getTripById(created.id)
    expect(before).not.toBeNull()

    await softDeleteTrip({ tripId: created.id })

    // Now it should be gone from getTripById
    const after = await getTripById(created.id)
    expect(after).toBeNull()
  })
})
