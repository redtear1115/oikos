import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── E2E golden path: multi-currency × trip (refs #68 #42) ───────────────
//
// 1. Create a trip (Tokyo, JPY)
// 2. Set a JPY → TWD exchange rate (0.220)
// 3. Record a 500 JPY expense tagged to the trip
// 4. Verify DB row: amount=110 TWD, originalCurrency='jpy', originalAmount=500,
//    rateSnapshot='0.220', tripId matches
// 5. Verify GroupBalance updated (all_mine split → no balance change)
// 6. End the trip
// 7. Confirm hasActiveTrip → false
// 8. softDeleteTrip → getTripById returns null
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

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => null,
    getAll: () => [],
    has: () => false,
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
  cashTransactions,
  currencyRates,
  trips,
} = await import('@/lib/db/schema')
const { createTrip, endTrip, softDeleteTrip } = await import('@/actions/trip')
const { setRate } = await import('@/actions/currency')
const { createTransaction } = await import('@/actions/transaction')
const { getTripById, hasActiveTrip } = await import('@/lib/db/queries/trips')
const { eq, inArray, isNull } = await import('drizzle-orm')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.',
    )
  }
})

interface E2ERefs {
  userId: string
  groupId: string
  epochId: string
  txIds: string[]
  tripIds: string[]
}

async function seedGroup(): Promise<E2ERefs> {
  const userId = randomUUID()
  const epochStartedAt = new Date('2026-05-14T00:00:00Z')

  await db.insert(profiles).values({ id: userId, displayName: 'TEST_E2E_MC_user' })

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_E2E_MC_group',
    memberA: userId,
    currentEpochStartedAt: epochStartedAt,
    baseCurrency: 'twd',
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
    txIds: [],
    tripIds: [],
  }
}

async function cleanup(refs: E2ERefs) {
  if (refs.txIds.length) {
    await db.delete(cashTransactions).where(inArray(cashTransactions.id, refs.txIds))
  }
  if (refs.tripIds.length) {
    // Force-delete even soft-deleted trips so cleanup is idempotent
    await db.delete(trips).where(inArray(trips.id, refs.tripIds))
  }
  await db.delete(currencyRates).where(eq(currencyRates.groupId, refs.groupId))
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.groupId))
  await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.groupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
  await db.delete(profiles).where(eq(profiles.id, refs.userId))
}

describe('E2E golden path: multi-currency × trip (#68 #42)', () => {
  let activeRefs: E2ERefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('E2E cleanup failed', e) }
      activeRefs = null
    }
  })

  it('Tokyo trip: create → set rate → record → verify → end → leave-check → soft-delete', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    // 1. Create a trip
    const tripResult = await createTrip({
      name: 'Tokyo',
      startDate: '2026-05-14',
      defaultCurrency: 'jpy',
    })
    expect(tripResult.id).toBeTruthy()
    refs.tripIds.push(tripResult.id)

    // Confirm trip is 'active'
    const trip = await getTripById(tripResult.id)
    expect(trip?.status).toBe('active')
    // v0.17.4 #410: trip default_currency is stored uppercase (free-text since the
    // column moved off the currency_code enum).
    expect(trip?.defaultCurrency).toBe('JPY')

    // 2. Set JPY → TWD rate
    await setRate({ fromCurrency: 'jpy', toCurrency: 'twd', rate: '0.220' })

    // Verify rate was stored
    const [storedRate] = await db
      .select()
      .from(currencyRates)
      .where(eq(currencyRates.groupId, refs.groupId))
      .limit(1)
    expect(storedRate).toBeTruthy()
    expect(storedRate.fromCurrency).toBe('jpy')
    expect(storedRate.rate).toBe('0.220')

    // 3. Record a 500 JPY expense tagged to the trip
    const txResult = await createTransaction({
      amount: 500,
      currency: 'jpy',
      tripId: tripResult.id,
      description: 'Tokyo ramen',
      category: 'dining',
      splitType: 'all_mine',
      payerId: refs.userId,
      transactedAt: new Date('2026-05-14T12:00:00Z'),
    })
    expect(txResult.id).toBeTruthy()
    refs.txIds.push(txResult.id)

    // 4. Verify DB row
    const [row] = await db
      .select({
        amount: cashTransactions.amount,
        originalCurrency: cashTransactions.originalCurrency,
        originalAmount: cashTransactions.originalAmount,
        rateSnapshot: cashTransactions.rateSnapshot,
        tripId: cashTransactions.tripId,
      })
      .from(cashTransactions)
      .where(eq(cashTransactions.id, txResult.id))
      .limit(1)

    expect(row.amount).toBe(110)                 // 500 JPY × 0.220 = 110 TWD
    expect(row.originalCurrency).toBe('jpy')
    expect(row.originalAmount).toBe(500)
    expect(row.rateSnapshot).toBe('0.220')
    expect(row.tripId).toBe(tripResult.id)

    // 5. GroupBalance: all_mine means no balance owed between members;
    //    balance stays 0 (solo group: only memberA, so balance is always 0)
    const [bal] = await db
      .select({ balance: groupBalance.balance })
      .from(groupBalance)
      .where(eq(groupBalance.groupId, refs.groupId))
      .limit(1)
    expect(bal.balance).toBe(0)

    // 6. End the trip
    const today = '2026-05-14'
    await endTrip({ tripId: tripResult.id, endDate: today })

    const endedTrip = await getTripById(tripResult.id)
    expect(endedTrip?.status).toBe('ended')

    // 7. Confirm hasActiveTrip → false (leaveGroup would now succeed)
    const stillActive = await hasActiveTrip(refs.groupId, refs.epochId)
    expect(stillActive).toBe(false)

    // 8. softDeleteTrip → getTripById returns null
    await softDeleteTrip({ tripId: tripResult.id })
    const deleted = await getTripById(tripResult.id)
    expect(deleted).toBeNull()
  })
})
