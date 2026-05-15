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
  tripExpenses,
  cashTransactions,
} = await import('@/lib/db/schema')
const { createTrip, endTrip, updateTrip, softDeleteTrip } = await import('@/actions/trip')
const { createTripExpense } = await import('@/actions/tripExpense')
const { getTripById } = await import('@/lib/db/queries/trips')
const { eq, inArray, and } = await import('drizzle-orm')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.',
    )
  }
})

interface SeedRefs {
  userId: string
  partnerId?: string
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
    // Summary CashTransactions and TripExpenses both reference Trips —
    // drop them before the trips themselves to keep FK happy.
    await db.delete(cashTransactions).where(inArray(cashTransactions.tripId, refs.tripIds))
    await db.delete(tripExpenses).where(inArray(tripExpenses.tripId, refs.tripIds))
    await db.delete(trips).where(inArray(trips.id, refs.tripIds))
  }
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.groupId))
  await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.groupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
  const profileIds = refs.partnerId ? [refs.userId, refs.partnerId] : [refs.userId]
  await db.delete(profiles).where(inArray(profiles.id, profileIds))
}

interface DuoSeedRefs extends SeedRefs {
  partnerId: string
}

async function seedDuoGroup(): Promise<DuoSeedRefs> {
  const userId = randomUUID()
  const partnerId = randomUUID()
  const epochStartedAt = new Date('2026-05-10T00:00:00Z')

  await db.insert(profiles).values([
    { id: userId, displayName: 'TEST_TRIP_END_user' },
    { id: partnerId, displayName: 'TEST_TRIP_END_partner' },
  ])

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_TRIP_END_group',
    memberA: userId,
    memberB: partnerId,
    currentEpochStartedAt: epochStartedAt,
    baseCurrency: 'twd',
  }).returning({ id: oikosGroups.id })

  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })

  const [epoch] = await db.insert(groupEpochs).values({
    groupId: group.id,
    startedAt: epochStartedAt,
    memberAId: userId,
    memberBId: partnerId,
  }).returning({ id: groupEpochs.id })

  return { userId, partnerId, groupId: group.id, epochId: epoch.id, epochStartedAt, tripIds: [] }
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

describe('endTrip — summary writes (v0.17.2 phase 4)', () => {
  let activeRefs: DuoSeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  async function listSummaryRows(groupId: string, tripId: string) {
    return db
      .select()
      .from(cashTransactions)
      .where(and(
        eq(cashTransactions.groupId, groupId),
        eq(cashTransactions.tripId, tripId),
      ))
  }

  async function readBalance(groupId: string): Promise<number> {
    const [row] = await db
      .select({ balance: groupBalance.balance })
      .from(groupBalance)
      .where(eq(groupBalance.groupId, groupId))
    return row.balance
  }

  it('writes no summary rows when the trip has no expenses', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({ name: 'Empty', startDate: '2026-05-10' })
    refs.tripIds.push(trip.id)

    await endTrip({ tripId: trip.id, endDate: '2026-05-12' })

    expect(await listSummaryRows(refs.groupId, trip.id)).toHaveLength(0)
    expect(await readBalance(refs.groupId)).toBe(0)
  })

  it('writes 1 summary when only one member paid', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({ name: 'A-only', startDate: '2026-05-10' })
    refs.tripIds.push(trip.id)

    await createTripExpense({
      tripId: trip.id, paidBy: refs.userId, amount: 1000, category: '食', splitType: 'half',
    })

    await endTrip({ tripId: trip.id, endDate: '2026-05-12' })

    const rows = await listSummaryRows(refs.groupId, trip.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].paidBy).toBe(refs.userId)
    expect(rows[0].amount).toBe(1000)
    expect(rows[0].category).toBe('entertainment')
    expect(rows[0].description).toBe('A-only 結算')
    // Balance: A paid 1000 half → B owes A 500 → positive 500 (B owes A).
    expect(await readBalance(refs.groupId)).toBe(500)
  })

  it('writes 2 summaries when both members paid', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({ name: 'Both', startDate: '2026-05-10' })
    refs.tripIds.push(trip.id)

    await createTripExpense({
      tripId: trip.id, paidBy: refs.userId, amount: 1000, category: '食', splitType: 'half',
    })
    await createTripExpense({
      tripId: trip.id, paidBy: refs.partnerId, amount: 600, category: '食', splitType: 'half',
    })

    await endTrip({ tripId: trip.id, endDate: '2026-05-12' })

    const rows = await listSummaryRows(refs.groupId, trip.id)
    expect(rows).toHaveLength(2)
    const paidByList = rows.map(r => r.paidBy).sort()
    expect(paidByList).toEqual([refs.userId, refs.partnerId].sort())
    // Net: A overpaid 200 (A paid 1000, share 500+300=800; B paid 600, share 800).
    // Balance positive = B owes A. Expect ~+200 (small drift OK).
    const balance = await readBalance(refs.groupId)
    expect(Math.abs(balance - 200)).toBeLessThanOrEqual(2)
  })

  it('handles weighted split with B as payer (splitRatio is payer share; splitRatioA on summary is A share)', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({ name: 'Weighted', startDate: '2026-05-10' })
    refs.tripIds.push(trip.id)

    // B paid 1000, B's share = 70%, so A's share = 30%.
    await createTripExpense({
      tripId: trip.id, paidBy: refs.partnerId, amount: 1000,
      category: '食', splitType: 'weighted', splitRatio: 70,
    })

    await endTrip({ tripId: trip.id, endDate: '2026-05-12' })

    const rows = await listSummaryRows(refs.groupId, trip.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].paidBy).toBe(refs.partnerId)
    expect(rows[0].splitType).toBe('weighted')
    // The summary's splitRatioA = A's share % = 30.
    expect(rows[0].splitRatioA).toBe(30)
    // Balance: B paid 1000 with A's share = 30% = 300 → A owes B 300 → -300.
    expect(await readBalance(refs.groupId)).toBe(-300)
  })

  it('is idempotent: a second endTrip on the same trip throws and writes no extra rows', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({ name: 'Idempotent', startDate: '2026-05-10' })
    refs.tripIds.push(trip.id)
    await createTripExpense({
      tripId: trip.id, paidBy: refs.userId, amount: 500, category: '食', splitType: 'half',
    })

    await endTrip({ tripId: trip.id, endDate: '2026-05-12' })
    const beforeRows = await listSummaryRows(refs.groupId, trip.id)
    const beforeBalance = await readBalance(refs.groupId)

    await expect(endTrip({ tripId: trip.id, endDate: '2026-05-12' }))
      .rejects.toThrow('找不到進行中的旅行')

    const afterRows = await listSummaryRows(refs.groupId, trip.id)
    expect(afterRows).toHaveLength(beforeRows.length)
    expect(await readBalance(refs.groupId)).toBe(beforeBalance)
  })
})

describe('endTrip — solo group', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('writes a 1-row all_mine summary for a solo group with expenses', async () => {
    const refs = await seedGroup()  // solo (memberB = null)
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({ name: 'Solo', startDate: '2026-05-10' })
    refs.tripIds.push(trip.id)
    await createTripExpense({
      tripId: trip.id, paidBy: refs.userId, amount: 800, category: '食', splitType: 'all_mine',
    })

    await endTrip({ tripId: trip.id, endDate: '2026-05-12' })

    const [row] = await db
      .select()
      .from(cashTransactions)
      .where(and(
        eq(cashTransactions.groupId, refs.groupId),
        eq(cashTransactions.tripId, trip.id),
      ))
    expect(row).toBeTruthy()
    expect(row.paidBy).toBe(refs.userId)
    expect(row.amount).toBe(800)
    expect(row.splitType).toBe('all_mine')
    // Solo balance is structurally 0 (recalcGroupBalance solo guard).
    const [balRow] = await db
      .select({ balance: groupBalance.balance })
      .from(groupBalance)
      .where(eq(groupBalance.groupId, refs.groupId))
    expect(balRow.balance).toBe(0)
  })
})

describe('updateTrip — currencies + edit lock (#410)', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('persists a fresh multi-currency snapshot when no expenses exist', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({
      name: 'Tokyo',
      startDate: '2026-05-10',
      currencies: {
        default: 'TWD',
        entries: [{ code: 'TWD', label: null, rate: 1 }],
      },
    })
    refs.tripIds.push(trip.id)

    await updateTrip({
      tripId: trip.id,
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0.22 },
          { code: 'VND', label: '越南盾', rate: 0.0013 },
        ],
      },
    })

    const after = await getTripById(trip.id)
    const snap = after!.rateSnapshot as { default: string; entries: Array<{ code: string; rate: number }> }
    expect(snap.default).toBe('TWD')
    expect(snap.entries).toHaveLength(3)
    expect(after!.defaultCurrency).toBe('TWD')
  })

  it('rejects when a used-currency rate is changed', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({
      name: 'Tokyo',
      startDate: '2026-05-10',
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0.22 },
        ],
      },
    })
    refs.tripIds.push(trip.id)

    await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 1000,
      currency: 'JPY',
      category: '食',
      splitType: 'all_mine',
    })

    await expect(updateTrip({
      tripId: trip.id,
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0.25 },  // changed
        ],
      },
    })).rejects.toThrow(/JPY 已有支出紀錄/)
  })

  it('rejects when a used currency is removed', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({
      name: 'Tokyo',
      startDate: '2026-05-10',
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0.22 },
        ],
      },
    })
    refs.tripIds.push(trip.id)

    await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 1000,
      currency: 'JPY',
      category: '食',
      splitType: 'all_mine',
    })

    await expect(updateTrip({
      tripId: trip.id,
      currencies: {
        default: 'TWD',
        entries: [{ code: 'TWD', label: null, rate: 1 }],
      },
    })).rejects.toThrow(/JPY 已有支出紀錄/)
  })

  it('rejects when default is reassigned while default has expenses', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({
      name: 'Tokyo',
      startDate: '2026-05-10',
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0.22 },
        ],
      },
    })
    refs.tripIds.push(trip.id)

    // Expense in default (no `currency` field) → original_currency NULL.
    await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 100,
      category: '食',
      splitType: 'all_mine',
    })

    await expect(updateTrip({
      tripId: trip.id,
      currencies: {
        default: 'JPY',
        entries: [
          { code: 'TWD', label: null, rate: 4.5 },
          { code: 'JPY', label: null, rate: 1 },
        ],
      },
    })).rejects.toThrow('預設幣別已有支出紀錄')
  })

  it('allows adding a new currency to a trip with existing expenses', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({
      name: 'Tokyo',
      startDate: '2026-05-10',
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0.22 },
        ],
      },
    })
    refs.tripIds.push(trip.id)

    await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 1000,
      currency: 'JPY',
      category: '食',
      splitType: 'all_mine',
    })

    // Add VND — should succeed; JPY rate untouched.
    await updateTrip({
      tripId: trip.id,
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0.22 },
          { code: 'VND', label: '越南盾', rate: 0.0013 },
        ],
      },
    })

    const after = await getTripById(trip.id)
    const snap = after!.rateSnapshot as { default: string; entries: Array<{ code: string }> }
    expect(snap.entries.map(e => e.code).sort()).toEqual(['JPY', 'TWD', 'VND'])
  })

  it('allows removing an unused currency', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const trip = await createTrip({
      name: 'Tokyo',
      startDate: '2026-05-10',
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0.22 },
          { code: 'USD', label: null, rate: 32 },
        ],
      },
    })
    refs.tripIds.push(trip.id)

    // Use JPY but not USD.
    await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 1000,
      currency: 'JPY',
      category: '食',
      splitType: 'all_mine',
    })

    await updateTrip({
      tripId: trip.id,
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0.22 },
        ],
      },
    })

    const after = await getTripById(trip.id)
    const snap = after!.rateSnapshot as { default: string; entries: Array<{ code: string }> }
    expect(snap.entries.map(e => e.code).sort()).toEqual(['JPY', 'TWD'])
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
