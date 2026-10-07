import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Integration tests for actions/tripExpense.ts + rate_snapshot wiring ──
//
// Uses the real dev DB because the actions hit Drizzle/Postgres directly
// (jsonb defaults, FK constraints, CHECK constraints all need a real DB).
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

// Trip writes resolve the viewer through getViewerWriteContext, which reads
// the past-chapter pin cookie via next/headers. No pin in these tests.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(),
}))

const { PICKABLE_CATEGORIES } = await import('@/lib/categories')
const { db } = await import('@/lib/db/client')
const {
  profiles,
  oikosGroups,
  groupBalance,
  groupEpochs,
  trips,
  tripExpenses,
  currencyRates,
} = await import('@/lib/db/schema')
const { createTrip, endTrip } = await import('@/actions/trip')
const {
  createTripExpense,
  editTripExpense,
  softDeleteTripExpense,
} = await import('@/actions/tripExpense')
const { listTripExpenses, getTripExpenseById } = await import('@/lib/db/queries/tripExpense')
const { eq, inArray } = await import('drizzle-orm')
const { unwrapAction } = await import('@/lib/action-errors')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; ensure .env.local has DATABASE_URL.')
  }
})

interface SeedRefs {
  userId: string
  partnerId: string
  groupId: string
  epochId: string
  epochStartedAt: Date
  tripIds: string[]
}

async function seedDuoGroup(): Promise<SeedRefs> {
  const userId = randomUUID()
  const partnerId = randomUUID()
  const epochStartedAt = new Date('2026-05-10T00:00:00Z')

  await db.insert(profiles).values([
    { id: userId, displayName: 'TEST_TE_user' },
    { id: partnerId, displayName: 'TEST_TE_partner' },
  ])

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_TE_group',
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

  await db.insert(currencyRates).values([
    { groupId: group.id, fromCurrency: 'twd', toCurrency: 'jpy', rate: '5.000' },
    { groupId: group.id, fromCurrency: 'jpy', toCurrency: 'twd', rate: '0.200' },
    { groupId: group.id, fromCurrency: 'usd', toCurrency: 'twd', rate: '32.000' },
    { groupId: group.id, fromCurrency: 'twd', toCurrency: 'usd', rate: '0.031' },
  ])

  return { userId, partnerId, groupId: group.id, epochId: epoch.id, epochStartedAt, tripIds: [] }
}

async function cleanup(refs: SeedRefs) {
  if (refs.tripIds.length) {
    await db.delete(tripExpenses).where(inArray(tripExpenses.tripId, refs.tripIds))
    await db.delete(trips).where(inArray(trips.id, refs.tripIds))
  }
  await db.delete(currencyRates).where(eq(currencyRates.groupId, refs.groupId))
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.groupId))
  await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.groupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
  await db.delete(profiles).where(inArray(profiles.id, [refs.userId, refs.partnerId]))
}

describe('createTrip — rate_snapshot population', () => {
  let activeRefs: SeedRefs | null = null
  afterEach(async () => {
    if (activeRefs) { try { await cleanup(activeRefs) } catch (e) { console.error(e) }; activeRefs = null }
  })

  it('defaults to single-entry snapshot when currencies omitted', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const created = unwrapAction(await createTrip({ name: '單一幣別', startDate: '2026-05-10' }))
    refs.tripIds.push(created.id)

    const snapshot = created.rateSnapshot as { default: string; entries: Array<{ code: string; rate: number; label: string | null }> }
    expect(snapshot.default).toBe('TWD')
    expect(snapshot.entries).toEqual([{ code: 'TWD', label: null, rate: 1 }])
  })

  it('accepts explicit currencies payload with self-defined codes', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const created = unwrapAction(await createTrip({
      name: '越南之旅',
      startDate: '2026-05-10',
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'VND', label: '越南盾', rate: 0.0013 },
        ],
      },
    }))
    refs.tripIds.push(created.id)

    const snapshot = created.rateSnapshot as { default: string; entries: Array<{ code: string; label: string | null; rate: number }> }
    expect(snapshot.default).toBe('TWD')
    expect(snapshot.entries).toHaveLength(2)
    const vnd = snapshot.entries.find(e => e.code === 'VND')
    expect(vnd?.rate).toBe(0.0013)
    expect(vnd?.label).toBe('越南盾')
  })
})

describe('createTripExpense — happy paths', () => {
  let activeRefs: SeedRefs | null = null
  afterEach(async () => {
    if (activeRefs) { try { await cleanup(activeRefs) } catch (e) { console.error(e) }; activeRefs = null }
  })

  it('writes a native base-currency record (originalCurrency null)', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    const expense = unwrapAction(await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 1500,
      category: 'dining',
      splitType: 'half',
    }))

    expect(expense.amount).toBe(1500)
    expect(expense.originalCurrency).toBeNull()
    expect(expense.originalAmount).toBeNull()
    expect(expense.splitType).toBe('half')
    expect(expense.splitRatio).toBeNull()
  })

  it('converts foreign-currency amount via trip rate_snapshot to base', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({
      name: 'JP',
      startDate: '2026-05-10',
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0.2 },
        ],
      },
    }))
    refs.tripIds.push(trip.id)

    // 10000 JPY → JPY rate 0.200 → 2000 TWD
    const expense = unwrapAction(await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 10000,
      currency: 'jpy',
      category: 'dining',
      splitType: 'half',
    }))

    expect(expense.amount).toBe(2000)
    expect(expense.originalCurrency).toBe('JPY')
    expect(expense.originalAmount).toBe(10000)
  })

  it('TWD base: USD $45 @32 stores 1440 whole units, originalAmount 45 (#1582)', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({
      name: 'US', startDate: '2026-05-10',
      currencies: { default: 'TWD', entries: [{ code: 'TWD', label: null, rate: 1 }, { code: 'USD', label: null, rate: 32 }] },
    }))
    refs.tripIds.push(trip.id)
    const e = unwrapAction(await createTripExpense({
      tripId: trip.id, paidBy: refs.userId, amount: 45, currency: 'usd', category: '食', splitType: 'half',
    }))
    expect(e.amount).toBe(1440)
    expect(e.originalCurrency).toBe('USD')
    expect(e.originalAmount).toBe(45)
  })

  it('USD base: JPY 1000 @0.0067 stores 7; tiny amounts store 1 on create and edit (#1582)', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    await db.update(oikosGroups).set({ baseCurrency: 'usd' }).where(eq(oikosGroups.id, refs.groupId))
    const trip = unwrapAction(await createTrip({
      name: 'JP-USD', startDate: '2026-05-10',
      currencies: { default: 'USD', entries: [
        { code: 'USD', label: null, rate: 1 }, { code: 'JPY', label: null, rate: 0.0067 }, { code: 'TWD', label: null, rate: 0.031 },
      ] },
    }))
    refs.tripIds.push(trip.id)
    const mk = (amount: number, currency: string) => createTripExpense({
      tripId: trip.id, paidBy: refs.userId, amount, currency, category: '食', splitType: 'half',
    })
    expect(unwrapAction(await mk(1000, 'jpy')).amount).toBe(7)
    const tiny1 = unwrapAction(await mk(50, 'jpy'))
    const tiny2 = unwrapAction(await mk(15, 'twd'))
    expect(tiny1.amount).toBe(1)
    expect(tiny2.amount).toBe(1)
    const edited = unwrapAction(await editTripExpense({
      id: tiny1.id, tripId: trip.id, paidBy: refs.userId, amount: 15, currency: 'twd', category: '食', splitType: 'half',
    }))
    expect(edited.amount).toBe(1)
    const edited2 = unwrapAction(await editTripExpense({
      id: tiny2.id, tripId: trip.id, paidBy: refs.userId, amount: 50, currency: 'jpy', category: '食', splitType: 'half',
    }))
    expect(edited2.amount).toBe(1)
  })

  it('accepts weighted split with splitRatio in [0,100]', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    const expense = unwrapAction(await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 3000,
      category: 'housing',
      splitType: 'weighted',
      splitRatio: 70,
    }))

    expect(expense.splitType).toBe('weighted')
    expect(expense.splitRatio).toBe(70)
  })
})

describe('createTripExpense — rejections', () => {
  let activeRefs: SeedRefs | null = null
  afterEach(async () => {
    if (activeRefs) { try { await cleanup(activeRefs) } catch (e) { console.error(e) }; activeRefs = null }
  })

  it('rejects when trip is in a different group', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    // Switch viewer to a fresh user not in this group
    mockUserId = randomUUID()
    await expect(createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 100,
      category: 'dining',
      splitType: 'half',
    })).rejects.toThrow()
  })

  it('rejects when trip status is ended', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)
    unwrapAction(await endTrip({ tripId: trip.id, endDate: '2026-05-12' }))

    expect(await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 100,
      category: 'dining',
      splitType: 'half',
    })).toEqual({ ok: false, code: 'trip_ended' })
  })

  it('rejects when paidBy is not a group member', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    expect(await createTripExpense({
      tripId: trip.id,
      paidBy: randomUUID(),
      amount: 100,
      category: 'dining',
      splitType: 'half',
    })).toEqual({ ok: false, code: 'payer_not_in_trip_ledger' })
  })

  it('rejects when amount <= 0', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    expect(await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 0,
      category: 'dining',
      splitType: 'half',
    })).toEqual({ ok: false, code: 'amount_not_positive' })
  })

  it('rejects weighted without splitRatio', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    expect(await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 100,
      category: 'dining',
      splitType: 'weighted',
    })).toEqual({ ok: false, code: 'split_ratio_required' })
  })

  it('rejects splitRatio on non-weighted split', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    expect(await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 100,
      category: 'dining',
      splitType: 'half',
      splitRatio: 60,
    })).toEqual({ ok: false, code: 'split_ratio_not_applicable' })
  })

  it('rejects splitRatio outside [0,100]', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    expect(await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 100,
      category: 'dining',
      splitType: 'weighted',
      splitRatio: 150,
    })).toEqual({ ok: false, code: 'split_ratio_out_of_range' })
  })
})

describe('trip expense category allowlist (#1541)', () => {
  let activeRefs: SeedRefs | null = null
  afterEach(async () => {
    if (activeRefs) { try { await cleanup(activeRefs) } catch (e) { console.error(e) }; activeRefs = null }
  })

  it.each(['settle', 'food', 'constructor', '', '   '])('create rejects %j', async (category) => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    const out = await createTripExpense({
      tripId: trip.id, paidBy: refs.userId, amount: 100, category, splitType: 'half',
    })
    expect(out).toEqual({ ok: false, code: category.trim() ? 'category_invalid' : 'category_empty' })
  })

  it('edit rejects settle and keeps the old row', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)
    const original = unwrapAction(await createTripExpense({
      tripId: trip.id, paidBy: refs.userId, amount: 100, category: 'dining', splitType: 'half',
    }))

    expect(await editTripExpense({
      id: original.id, tripId: trip.id, paidBy: refs.userId, amount: 100, category: 'settle', splitType: 'half',
    })).toEqual({ ok: false, code: 'category_invalid' })
    expect(await listTripExpenses(trip.id)).toHaveLength(1)
  })

  it('accepts every pickable id, trimmed', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    for (const id of PICKABLE_CATEGORIES.map((c) => c.id)) {
      const row = unwrapAction(await createTripExpense({
        tripId: trip.id, paidBy: refs.userId, amount: 100, category: ` ${id} `, splitType: 'half',
      }))
      expect(row.category).toBe(id)
    }
  }, 30_000)
})

describe('editTripExpense', () => {
  let activeRefs: SeedRefs | null = null
  afterEach(async () => {
    if (activeRefs) { try { await cleanup(activeRefs) } catch (e) { console.error(e) }; activeRefs = null }
  })

  it('soft-deletes the old row and inserts a new one atomically', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    const original = unwrapAction(await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 500,
      category: 'dining',
      splitType: 'half',
    }))

    const edited = unwrapAction(await editTripExpense({
      id: original.id,
      tripId: trip.id,
      paidBy: refs.partnerId,
      amount: 800,
      category: 'housing',
      splitType: 'half',
    }))

    expect(edited.id).not.toBe(original.id)
    expect(edited.amount).toBe(800)
    expect(edited.paidBy).toBe(refs.partnerId)

    // Old row is soft-deleted; list only returns the new one
    const live = await listTripExpenses(trip.id)
    expect(live).toHaveLength(1)
    expect(live[0].id).toBe(edited.id)
  })

  it('rejects editing a row that is already soft-deleted', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    const original = unwrapAction(await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 500,
      category: 'dining',
      splitType: 'half',
    }))
    unwrapAction(await softDeleteTripExpense({ id: original.id, tripId: trip.id }))

    expect(await editTripExpense({
      id: original.id,
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 999,
      category: 'dining',
      splitType: 'half',
    })).toEqual({ ok: false, code: 'record_deleted_or_missing' })
  })
})

describe('softDeleteTripExpense', () => {
  let activeRefs: SeedRefs | null = null
  afterEach(async () => {
    if (activeRefs) { try { await cleanup(activeRefs) } catch (e) { console.error(e) }; activeRefs = null }
  })

  it('sets deletedAt and removes the row from listTripExpenses', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userId
    const trip = unwrapAction(await createTrip({ name: 'JP', startDate: '2026-05-10' }))
    refs.tripIds.push(trip.id)

    const expense = unwrapAction(await createTripExpense({
      tripId: trip.id,
      paidBy: refs.userId,
      amount: 200,
      category: 'dining',
      splitType: 'half',
    }))

    unwrapAction(await softDeleteTripExpense({ id: expense.id, tripId: trip.id }))

    expect(await getTripExpenseById(expense.id)).toBeNull()
    expect(await listTripExpenses(trip.id)).toHaveLength(0)
  })
})
