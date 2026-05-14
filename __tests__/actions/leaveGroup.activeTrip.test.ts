import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Tests for leaveGroup active-trip guard ──────────────────────────────
//
// leaveGroup must reject with "請先結束旅行" if any active trip exists in the
// current epoch. Ended trips and soft-deleted trips must NOT block the leave.
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
const { leaveGroup } = await import('@/actions/membership')
const { eq, inArray } = await import('drizzle-orm')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.',
    )
  }
})

interface SeedRefs {
  userAId: string
  userBId: string
  oldGroupId: string
  oldEpochId: string
  tripIds: string[]
  newGroupId?: string
}

async function seedDuoGroup(): Promise<SeedRefs> {
  const userAId = randomUUID()
  const userBId = randomUUID()
  const epochStartedAt = new Date('2026-05-10T00:00:00Z')

  await db.insert(profiles).values([
    { id: userAId, displayName: 'TEST_TRIP_LEAVE_userA' },
    { id: userBId, displayName: 'TEST_TRIP_LEAVE_userB' },
  ])

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_TRIP_LEAVE_duo',
    memberA: userAId,
    memberB: userBId,
    currentEpochStartedAt: epochStartedAt,
  }).returning({ id: oikosGroups.id })

  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })

  const [epoch] = await db.insert(groupEpochs).values({
    groupId: group.id,
    startedAt: epochStartedAt,
    memberAId: userAId,
    memberBId: userBId,
  }).returning({ id: groupEpochs.id })

  return {
    userAId,
    userBId,
    oldGroupId: group.id,
    oldEpochId: epoch.id,
    tripIds: [],
  }
}

async function cleanup(refs: SeedRefs) {
  if (refs.tripIds.length) {
    await db.delete(trips).where(inArray(trips.id, refs.tripIds))
  }
  if (refs.newGroupId) {
    await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.newGroupId))
    await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.newGroupId))
    await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.newGroupId))
  }
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.oldGroupId))
  await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.oldGroupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.oldGroupId))
  await db.delete(profiles).where(inArray(profiles.id, [refs.userAId, refs.userBId]))
}

describe('leaveGroup — active-trip guard', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('rejects with "請先結束旅行" when group has at least one active trip in current epoch', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userBId  // member B is the leaver

    const [trip] = await db.insert(trips).values({
      groupId: refs.oldGroupId,
      epochId: refs.oldEpochId,
      name: 'Blocking trip',
      startDate: '2026-05-10',
      status: 'active',
    }).returning({ id: trips.id })
    refs.tripIds.push(trip.id)

    await expect(leaveGroup()).rejects.toThrow('請先結束旅行')
  })

  it('succeeds when all trips are ended (no active trips)', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userBId

    const [trip] = await db.insert(trips).values({
      groupId: refs.oldGroupId,
      epochId: refs.oldEpochId,
      name: 'Ended trip',
      startDate: '2026-05-10',
      endDate: '2026-05-15',
      status: 'ended',
      endedAt: new Date(),
    }).returning({ id: trips.id })
    refs.tripIds.push(trip.id)

    const result = await leaveGroup()
    refs.newGroupId = result.groupId
    expect(result.groupId).toBeTruthy()
  })

  it('succeeds when no trips exist at all', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userBId

    const result = await leaveGroup()
    refs.newGroupId = result.groupId
    expect(result.groupId).toBeTruthy()
  })

  it('soft-deleted active trips do not block leaveGroup', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userBId

    const [trip] = await db.insert(trips).values({
      groupId: refs.oldGroupId,
      epochId: refs.oldEpochId,
      name: 'Soft-deleted trip',
      startDate: '2026-05-10',
      status: 'active',
      deletedAt: new Date(),  // soft-deleted — should NOT block
    }).returning({ id: trips.id })
    refs.tripIds.push(trip.id)

    const result = await leaveGroup()
    refs.newGroupId = result.groupId
    expect(result.groupId).toBeTruthy()
  })
})
