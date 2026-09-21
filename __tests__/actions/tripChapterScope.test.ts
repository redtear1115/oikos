import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Integration: trip writes stay inside the current chapter ────────────────
//
// A trip belongs to the chapter (GroupEpochs row) it was created in. Once that
// chapter closes, the trip and its sub-ledger are part of a read-only past:
// ending it, editing it, deleting it, writing its expenses or tagging new
// records with it must all be refused — with the existing error codes, and
// without touching CashTransactions or GroupBalance.
//
// What it looks like when this regresses: nothing errors. The write simply
// succeeds, and whatever it produces (summary rows, balance) lands in the
// current chapter.
//
// Uses a real Postgres (DATABASE_URL) like the other __tests__/actions files.
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

let mockUserId = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))

// resolveViewerEpochContext (via getViewerWriteContext) reads the past-chapter
// pin cookie; controlled per test.
const cookieStore = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (key: string) => {
      const value = cookieStore.get(key)
      return value === undefined ? undefined : { value }
    },
    getAll: () => [],
    has: (key: string) => cookieStore.has(key),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(),
}))

const { db } = await import('@/lib/db/client')
const {
  profiles,
  oikosGroups,
  groupBalance,
  groupEpochs,
  groupInvites,
  trips,
  tripExpenses,
  cashTransactions,
} = await import('@/lib/db/schema')
const { createTrip, endTrip, updateTrip, softDeleteTrip } = await import('@/actions/trip')
const {
  createTripExpense,
  editTripExpense,
  softDeleteTripExpense,
} = await import('@/actions/tripExpense')
const { createTransaction, editTransaction } = await import('@/actions/transaction')
const { acceptInvite } = await import('@/actions/invite')
const { PAST_EPOCH_COOKIE } = await import('@/lib/db/queries/epoch')
const { unwrapAction } = await import('@/lib/action-errors')
const { eq, and, isNull, inArray } = await import('drizzle-orm')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.')
  }
})

const EPOCH_START = new Date('2026-05-10T00:00:00Z')
const TRIP_START = '2026-05-10'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Refs {
  groupId: string
  people: string[]
}

let active: Refs | null = null

afterEach(async () => {
  cookieStore.clear()
  if (!active) return
  const { groupId, people } = active
  active = null
  try {
    await db.delete(cashTransactions).where(eq(cashTransactions.groupId, groupId))
    const tripRows = await db.select({ id: trips.id }).from(trips).where(eq(trips.groupId, groupId))
    const tripIds = tripRows.map((t) => t.id)
    if (tripIds.length) {
      await db.delete(tripExpenses).where(inArray(tripExpenses.tripId, tripIds))
      await db.delete(trips).where(inArray(trips.id, tripIds))
    }
    await db.delete(groupInvites).where(eq(groupInvites.groupId, groupId))
    await db.delete(groupEpochs).where(eq(groupEpochs.groupId, groupId))
    await db.delete(groupBalance).where(eq(groupBalance.groupId, groupId))
    await db.delete(oikosGroups).where(eq(oikosGroups.id, groupId))
    await db.delete(profiles).where(inArray(profiles.id, people))
  } catch (e) {
    console.error('cleanup failed', e)
  }
})

/**
 * Solo owner A with an active trip carrying one half-split expense A paid,
 * then C accepts A's invite — the solo chapter closes and an A+C chapter opens.
 * Everything goes through the real actions (createTrip / createTripExpense /
 * acceptInvite), so the chapter boundary is the one production writes.
 */
async function seedSoloTripThenAccept() {
  const ownerId = randomUUID()
  const joinerId = randomUUID()
  await db.insert(profiles).values([
    { id: ownerId, displayName: 'TEST_TRIP_CHAPTER_owner' },
    { id: joinerId, displayName: 'TEST_TRIP_CHAPTER_joiner' },
  ])
  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_TRIP_CHAPTER_group',
    memberA: ownerId,
    currentEpochStartedAt: EPOCH_START,
  }).returning({ id: oikosGroups.id })
  active = { groupId: group.id, people: [ownerId, joinerId] }
  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })
  const [soloEpoch] = await db.insert(groupEpochs).values({
    groupId: group.id,
    startedAt: EPOCH_START,
    memberAId: ownerId,
  }).returning({ id: groupEpochs.id })

  mockUserId = ownerId
  const trip = unwrapAction(await createTrip({ name: 'Solo trip', startDate: TRIP_START }))
  expect(trip.epochId).toBe(soloEpoch.id)
  const expense = unwrapAction(await createTripExpense({
    tripId: trip.id,
    paidBy: ownerId,
    amount: 1000,
    category: '食',
    splitType: 'half',
  }))

  const token = 'TEST_TRIP_CHAPTER_' + randomUUID()
  await db.insert(groupInvites).values({
    groupId: group.id,
    invitedBy: ownerId,
    token,
    expiresAt: new Date(Date.now() + 86_400_000),
  })
  mockUserId = joinerId
  unwrapAction(await acceptInvite(token))

  const [closed] = await db.select().from(groupEpochs).where(eq(groupEpochs.id, soloEpoch.id))
  expect(closed.endedAt).not.toBeNull()

  mockUserId = ownerId
  return { ownerId, joinerId, groupId: group.id, soloEpochId: soloEpoch.id, trip, expense }
}

async function readBalance(groupId: string) {
  const [row] = await db
    .select({ balance: groupBalance.balance, version: groupBalance.version })
    .from(groupBalance)
    .where(eq(groupBalance.groupId, groupId))
  return row
}

async function tripRow(tripId: string) {
  const [row] = await db.select().from(trips).where(eq(trips.id, tripId))
  return row
}

async function liveExpenses(tripId: string) {
  return db
    .select({ id: tripExpenses.id, amount: tripExpenses.amount })
    .from(tripExpenses)
    .where(and(eq(tripExpenses.tripId, tripId), isNull(tripExpenses.deletedAt)))
}

describe('trip in a closed chapter', () => {
  it('endTrip is refused after the chapter closes; no summary rows, balance unchanged', async () => {
    const { groupId, trip } = await seedSoloTripThenAccept()
    const balanceBefore = await readBalance(groupId)

    expect(await endTrip({ tripId: trip.id, endDate: todayIso() }))
      .toEqual({ ok: false, code: 'active_trip_not_found' })

    const summaries = await db
      .select({ id: cashTransactions.id })
      .from(cashTransactions)
      .where(eq(cashTransactions.tripId, trip.id))
    expect(summaries).toHaveLength(0)
    expect(await readBalance(groupId)).toEqual(balanceBefore)
    const after = await tripRow(trip.id)
    expect(after.status).toBe('active')
    expect(after.endedAt).toBeNull()
  })

  it('updateTrip is refused with trip_not_found and writes nothing', async () => {
    const { trip } = await seedSoloTripThenAccept()

    expect(await updateTrip({ tripId: trip.id, name: 'renamed' }))
      .toEqual({ ok: false, code: 'trip_not_found' })
    expect((await tripRow(trip.id)).name).toBe('Solo trip')
  })

  it('softDeleteTrip is refused with trip_not_found and the trip stays', async () => {
    const { trip } = await seedSoloTripThenAccept()

    expect(await softDeleteTrip({ tripId: trip.id }))
      .toEqual({ ok: false, code: 'trip_not_found' })
    expect((await tripRow(trip.id)).deletedAt).toBeNull()
  })

  it('trip-expense create / edit / delete are refused with trip_not_found', async () => {
    const { ownerId, trip, expense } = await seedSoloTripThenAccept()

    expect(await createTripExpense({
      tripId: trip.id, paidBy: ownerId, amount: 500, category: '食', splitType: 'all_mine',
    })).toEqual({ ok: false, code: 'trip_not_found' })

    expect(await editTripExpense({
      id: expense.id, tripId: trip.id, paidBy: ownerId, amount: 9999, category: '食', splitType: 'half',
    })).toEqual({ ok: false, code: 'trip_not_found' })

    expect(await softDeleteTripExpense({ id: expense.id, tripId: trip.id }))
      .toEqual({ ok: false, code: 'trip_not_found' })

    const rows = await liveExpenses(trip.id)
    expect(rows).toEqual([{ id: expense.id, amount: 1000 }])
  })

  it('tagging a record with the closed-chapter trip is refused with trip_missing', async () => {
    const { ownerId, groupId, trip } = await seedSoloTripThenAccept()
    const base = {
      amount: 300,
      description: 'lunch',
      category: 'dining',
      splitType: 'half' as const,
      payerId: ownerId,
      transactedAt: todayIso(),
    }

    expect(await createTransaction({ ...base, tripId: trip.id }))
      .toEqual({ ok: false, code: 'trip_missing' })

    const { id } = unwrapAction(await createTransaction(base))
    expect(await editTransaction({ ...base, oldId: id, tripId: trip.id }))
      .toEqual({ ok: false, code: 'trip_missing' })

    const rows = await db
      .select({ id: cashTransactions.id, tripId: cashTransactions.tripId, deletedAt: cashTransactions.deletedAt })
      .from(cashTransactions)
      .where(eq(cashTransactions.groupId, groupId))
    expect(rows).toEqual([{ id, tripId: null, deletedAt: null }])
  })

  it('positive control: a trip created in the new chapter can be written, tagged and ended', async () => {
    const { ownerId, joinerId, groupId } = await seedSoloTripThenAccept()

    const trip = unwrapAction(await createTrip({ name: 'Duo trip', startDate: todayIso() }))
    const updated = unwrapAction(await updateTrip({ tripId: trip.id, name: 'Duo trip 2' }))
    expect(updated.name).toBe('Duo trip 2')

    const exp = unwrapAction(await createTripExpense({
      tripId: trip.id, paidBy: ownerId, amount: 1000, category: '食', splitType: 'half',
    }))
    const edited = unwrapAction(await editTripExpense({
      id: exp.id, tripId: trip.id, paidBy: ownerId, amount: 1200, category: '食', splitType: 'half',
    }))
    const extra = unwrapAction(await createTripExpense({
      tripId: trip.id, paidBy: joinerId, amount: 100, category: '食', splitType: 'all_mine',
    }))
    unwrapAction(await softDeleteTripExpense({ id: extra.id, tripId: trip.id }))
    expect(await liveExpenses(trip.id)).toEqual([{ id: edited.id, amount: 1200 }])

    const tagged = unwrapAction(await createTransaction({
      amount: 300,
      description: 'tagged',
      category: 'dining',
      splitType: 'half',
      payerId: ownerId,
      transactedAt: todayIso(),
      tripId: trip.id,
    }))
    expect(tagged.id).toBeTruthy()

    const ended = unwrapAction(await endTrip({ tripId: trip.id, endDate: todayIso() }))
    expect(ended.status).toBe('ended')
    const summaries = await db
      .select({ paidBy: cashTransactions.paidBy, amount: cashTransactions.amount })
      .from(cashTransactions)
      .where(and(
        eq(cashTransactions.groupId, groupId),
        eq(cashTransactions.tripId, trip.id),
        eq(cashTransactions.description, 'Duo trip 2 結算'),
      ))
    expect(summaries).toEqual([{ paidBy: ownerId, amount: 1200 }])

    const second = unwrapAction(await createTrip({ name: 'Delete me', startDate: todayIso() }))
    unwrapAction(await softDeleteTrip({ tripId: second.id }))
    expect((await tripRow(second.id)).deletedAt).not.toBeNull()
  })

  it('tagging a soft-deleted current-chapter trip is refused with trip_missing', async () => {
    const { ownerId, groupId } = await seedSoloTripThenAccept()
    const trip = unwrapAction(await createTrip({ name: 'Gone', startDate: todayIso() }))
    await db.update(trips).set({ deletedAt: new Date() }).where(eq(trips.id, trip.id))

    expect(await createTransaction({
      amount: 300,
      description: 'lunch',
      category: 'dining',
      splitType: 'half',
      payerId: ownerId,
      transactedAt: todayIso(),
      tripId: trip.id,
    })).toEqual({ ok: false, code: 'trip_missing' })
    const rows = await db.select({ id: cashTransactions.id }).from(cashTransactions)
      .where(eq(cashTransactions.groupId, groupId))
    expect(rows).toHaveLength(0)
  })
})

describe('trip writes while pinned to a past chapter', () => {
  /** Duo A+B: a closed chapter E0 and the open chapter E1 with an active trip. */
  async function seedDuoWithPastChapter() {
    const a = randomUUID()
    const b = randomUUID()
    await db.insert(profiles).values([
      { id: a, displayName: 'TEST_TRIP_PIN_a' },
      { id: b, displayName: 'TEST_TRIP_PIN_b' },
    ])
    const [group] = await db.insert(oikosGroups).values({
      name: 'TEST_TRIP_PIN_group',
      memberA: a,
      memberB: b,
      currentEpochStartedAt: EPOCH_START,
    }).returning({ id: oikosGroups.id })
    active = { groupId: group.id, people: [a, b] }
    await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })
    const [past] = await db.insert(groupEpochs).values({
      groupId: group.id,
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endedAt: EPOCH_START,
      memberAId: a,
      memberBId: b,
    }).returning({ id: groupEpochs.id })
    await db.insert(groupEpochs).values({
      groupId: group.id,
      startedAt: EPOCH_START,
      memberAId: a,
      memberBId: b,
    })
    mockUserId = a
    const trip = unwrapAction(await createTrip({ name: 'Current trip', startDate: TRIP_START }))
    const expense = unwrapAction(await createTripExpense({
      tripId: trip.id, paidBy: a, amount: 1000, category: '食', splitType: 'half',
    }))
    return { a, groupId: group.id, pastEpochId: past.id, trip, expense }
  }

  it('refuses endTrip / updateTrip / softDeleteTrip / trip-expense writes and writes nothing', async () => {
    const { a, groupId, pastEpochId, trip, expense } = await seedDuoWithPastChapter()
    const balanceBefore = await readBalance(groupId)
    cookieStore.set(PAST_EPOCH_COOKIE, pastEpochId)

    await expect(endTrip({ tripId: trip.id, endDate: todayIso() })).rejects.toThrow()
    await expect(updateTrip({ tripId: trip.id, name: 'renamed' })).rejects.toThrow()
    await expect(softDeleteTrip({ tripId: trip.id })).rejects.toThrow()
    await expect(createTripExpense({
      tripId: trip.id, paidBy: a, amount: 500, category: '食', splitType: 'all_mine',
    })).rejects.toThrow()
    await expect(editTripExpense({
      id: expense.id, tripId: trip.id, paidBy: a, amount: 9999, category: '食', splitType: 'half',
    })).rejects.toThrow()
    await expect(softDeleteTripExpense({ id: expense.id, tripId: trip.id })).rejects.toThrow()

    const row = await tripRow(trip.id)
    expect(row.status).toBe('active')
    expect(row.name).toBe('Current trip')
    expect(row.deletedAt).toBeNull()
    expect(await liveExpenses(trip.id)).toEqual([{ id: expense.id, amount: 1000 }])
    const summaries = await db.select({ id: cashTransactions.id }).from(cashTransactions)
      .where(eq(cashTransactions.tripId, trip.id))
    expect(summaries).toHaveLength(0)
    expect(await readBalance(groupId)).toEqual(balanceBefore)

    // Control: without the pin the same trip ends normally.
    cookieStore.clear()
    expect(unwrapAction(await endTrip({ tripId: trip.id, endDate: todayIso() })).status).toBe('ended')
  })
})
