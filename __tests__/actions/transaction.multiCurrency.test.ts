import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Integration test for createTransaction multi-currency + trip wiring ────
//
// Tests that createTransaction:
//  - Converts foreign currency to base (TWD) and snapshots the rate
//  - Leaves original_currency / original_amount / rate_snapshot NULL for TWD input
//  - Throws when no rate exists for the requested conversion
//  - Validates trip ownership before inserting
//  - Correctly tags the tripId on the row
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

// next/headers cookies() is called by resolveViewerEpochContext (for locale/pin).
// Mock it to return a stub that satisfies the interface without a real request scope.
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
const { createTransaction } = await import('@/actions/transaction')
const { eq, inArray, isNull, and } = await import('drizzle-orm')

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
  txIds: string[]
  tripIds: string[]
  rateIds: string[]
}

async function seedGroup(): Promise<SeedRefs> {
  const userId = randomUUID()
  const epochStartedAt = new Date('2026-05-14T00:00:00Z')

  await db.insert(profiles).values({ id: userId, displayName: 'TEST_MC_user' })

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_MC_group',
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
    rateIds: [],
  }
}

async function cleanup(refs: SeedRefs) {
  if (refs.txIds.length) {
    await db.delete(cashTransactions).where(inArray(cashTransactions.id, refs.txIds))
  }
  if (refs.tripIds.length) {
    await db.delete(trips).where(inArray(trips.id, refs.tripIds))
  }
  // Delete all currency rates for this group (no stable id to track)
  await db.delete(currencyRates).where(eq(currencyRates.groupId, refs.groupId))
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.groupId))
  await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.groupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
  await db.delete(profiles).where(eq(profiles.id, refs.userId))
}

describe('createTransaction — multi-currency + trip wiring (#68 #42)', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('TWD → TWD (native base): leaves originalCurrency/originalAmount/rateSnapshot NULL', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const result = await createTransaction({
      amount: 200,
      description: 'TWD test',
      category: 'dining',
      splitType: 'all_mine',
      payerId: refs.userId,
      transactedAt: new Date('2026-05-14T01:00:00Z'),
    })
    refs.txIds.push(result.id)

    const [row] = await db
      .select({
        amount: cashTransactions.amount,
        originalCurrency: cashTransactions.originalCurrency,
        originalAmount: cashTransactions.originalAmount,
        rateSnapshot: cashTransactions.rateSnapshot,
      })
      .from(cashTransactions)
      .where(eq(cashTransactions.id, result.id))
      .limit(1)

    expect(row.amount).toBe(200)
    expect(row.originalCurrency).toBeNull()
    expect(row.originalAmount).toBeNull()
    expect(row.rateSnapshot).toBeNull()
  })

  it('USD → TWD with rate set: converts amount, stores originalCurrency/originalAmount/rateSnapshot', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    // Set USD → TWD rate: 1 USD = 32 TWD (so 1250 cents USD = $12.50 → 400 TWD)
    // But since input is integer and USD precision=2, 1250 cents input:
    // fromDisplay = 1250 / 100 = 12.50, toDisplay = 12.50 * 32 = 400, toStorage = 400
    await db.insert(currencyRates).values({
      groupId: refs.groupId,
      fromCurrency: 'usd',
      toCurrency: 'twd',
      rate: '32.000',
    })

    const result = await createTransaction({
      amount: 1250,  // 1250 cents = $12.50 USD
      currency: 'usd',
      description: 'USD test',
      category: 'dining',
      splitType: 'all_mine',
      payerId: refs.userId,
      transactedAt: new Date('2026-05-14T01:00:00Z'),
    })
    refs.txIds.push(result.id)

    const [row] = await db
      .select({
        amount: cashTransactions.amount,
        originalCurrency: cashTransactions.originalCurrency,
        originalAmount: cashTransactions.originalAmount,
        rateSnapshot: cashTransactions.rateSnapshot,
      })
      .from(cashTransactions)
      .where(eq(cashTransactions.id, result.id))
      .limit(1)

    expect(row.amount).toBe(400)  // 12.50 * 32 = 400 TWD
    expect(row.originalCurrency).toBe('usd')
    expect(row.originalAmount).toBe(1250)
    expect(row.rateSnapshot).toBe('32.000')
  })

  it('JPY → TWD with rate 0.220: 500 JPY → 110 TWD', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    await db.insert(currencyRates).values({
      groupId: refs.groupId,
      fromCurrency: 'jpy',
      toCurrency: 'twd',
      rate: '0.220',
    })

    const result = await createTransaction({
      amount: 500,
      currency: 'jpy',
      description: 'JPY test',
      category: 'dining',
      splitType: 'all_mine',
      payerId: refs.userId,
      transactedAt: new Date('2026-05-14T01:00:00Z'),
    })
    refs.txIds.push(result.id)

    const [row] = await db
      .select({
        amount: cashTransactions.amount,
        originalCurrency: cashTransactions.originalCurrency,
        originalAmount: cashTransactions.originalAmount,
        rateSnapshot: cashTransactions.rateSnapshot,
      })
      .from(cashTransactions)
      .where(eq(cashTransactions.id, result.id))
      .limit(1)

    expect(row.amount).toBe(110)  // 500 * 0.220 = 110 TWD
    expect(row.originalCurrency).toBe('jpy')
    expect(row.originalAmount).toBe(500)
    expect(row.rateSnapshot).toBe('0.220')
  })

  it('Missing rate: throws when currency ≠ base and no CurrencyRates row exists', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId
    // No rate seeded for JPY → TWD

    await expect(createTransaction({
      amount: 500,
      currency: 'jpy',
      description: 'missing rate test',
      category: 'dining',
      splitType: 'all_mine',
      payerId: refs.userId,
      transactedAt: new Date('2026-05-14T01:00:00Z'),
    })).rejects.toThrow()
  })

  it('tripId provided + valid: insert sets tripId correctly', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const [trip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Test Trip',
      startDate: '2026-05-14',
      status: 'active',
    }).returning({ id: trips.id })
    refs.tripIds.push(trip.id)

    const result = await createTransaction({
      amount: 300,
      description: 'trip expense',
      category: 'dining',
      splitType: 'all_mine',
      payerId: refs.userId,
      transactedAt: new Date('2026-05-14T01:00:00Z'),
      tripId: trip.id,
    })
    refs.txIds.push(result.id)

    const [row] = await db
      .select({ tripId: cashTransactions.tripId })
      .from(cashTransactions)
      .where(eq(cashTransactions.id, result.id))
      .limit(1)

    expect(row.tripId).toBe(trip.id)
  })

  it('tripId provided but trip belongs to another group: rejects', async () => {
    const refs = await seedGroup()
    activeRefs = refs
    mockUserId = refs.userId

    // Create a second group and trip in it
    const userId2 = randomUUID()
    await db.insert(profiles).values({ id: userId2, displayName: 'TEST_MC_user2' })
    const [group2] = await db.insert(oikosGroups).values({
      name: 'TEST_MC_group2',
      memberA: userId2,
      currentEpochStartedAt: new Date('2026-05-14T00:00:00Z'),
    }).returning({ id: oikosGroups.id })
    await db.insert(groupBalance).values({ groupId: group2.id, balance: 0, version: 0 })
    const [epoch2] = await db.insert(groupEpochs).values({
      groupId: group2.id,
      startedAt: new Date('2026-05-14T00:00:00Z'),
      memberAId: userId2,
    }).returning({ id: groupEpochs.id })
    const [trip2] = await db.insert(trips).values({
      groupId: group2.id,
      epochId: epoch2.id,
      name: 'Other Group Trip',
      startDate: '2026-05-14',
      status: 'active',
    }).returning({ id: trips.id })

    let err: Error | null = null
    try {
      await createTransaction({
        amount: 100,
        description: 'wrong group trip',
        category: 'dining',
        splitType: 'all_mine',
        payerId: refs.userId,
        transactedAt: new Date('2026-05-14T01:00:00Z'),
        tripId: trip2.id,
      })
    } catch (e) {
      err = e as Error
    }

    // Cleanup the second group
    await db.delete(trips).where(eq(trips.id, trip2.id))
    await db.delete(groupEpochs).where(eq(groupEpochs.groupId, group2.id))
    await db.delete(groupBalance).where(eq(groupBalance.groupId, group2.id))
    await db.delete(oikosGroups).where(eq(oikosGroups.id, group2.id))
    await db.delete(profiles).where(eq(profiles.id, userId2))

    expect(err).not.toBeNull()
    expect(err!.message).toMatch(/旅行/)
  })
})
