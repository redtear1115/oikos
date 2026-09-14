import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Integration test for setBaseCurrency lock rule (#68) ─────────────────
//
// The lock rule: setBaseCurrency rejects if the current epoch has any
// non-deleted CashTransactions, IncomeTransactions, or Settlements.
// Chapter membership is decided by `created_at` (#1106) — a row whose event
// date (transactedAt / occurredAt / settledAt) predates the epoch start still
// belongs to the current chapter when it was RECORDED during it, e.g. a CSV
// import of last year's receipts. Only `createdAt < currentEpochStartedAt`
// puts a row outside. Soft-deleted records must NOT block the change.
//
// This suite uses the real dev DB because the logic involves counting rows
// from Postgres; mocking the DB would not exercise the Drizzle query path.
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
  cashTransactions,
  incomeTransactions,
  settlements,
} = await import('@/lib/db/schema')
const { setBaseCurrency } = await import('@/actions/currency')
const { currentEpochHasRecords } = await import('@/lib/db/queries/epoch')
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
  cashTxIds: string[]
  incomeTxIds: string[]
  settlementIds: string[]
}

async function seedSoloGroup(): Promise<SeedRefs> {
  const userId = randomUUID()
  const epochStartedAt = new Date('2026-05-14T00:00:00Z')

  await db.insert(profiles).values({ id: userId, displayName: 'TEST_68_user' })

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_68_group',
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
    cashTxIds: [],
    incomeTxIds: [],
    settlementIds: [],
  }
}

async function cleanup(refs: SeedRefs) {
  if (refs.settlementIds.length) {
    await db.delete(settlements).where(inArray(settlements.id, refs.settlementIds))
  }
  if (refs.cashTxIds.length) {
    await db.delete(cashTransactions).where(inArray(cashTransactions.id, refs.cashTxIds))
  }
  if (refs.incomeTxIds.length) {
    await db.delete(incomeTransactions).where(inArray(incomeTransactions.id, refs.incomeTxIds))
  }
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.groupId))
  await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.groupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
  await db.delete(profiles).where(eq(profiles.id, refs.userId))
}

describe('setBaseCurrency — lock rule (#68)', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('changes base_currency when current epoch has zero records', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    await expect(setBaseCurrency({ currency: 'jpy' })).resolves.not.toThrow()

    const [updated] = await db.select().from(oikosGroups)
      .where(eq(oikosGroups.id, refs.groupId)).limit(1)
    expect(updated.baseCurrency).toBe('jpy')
  })

  it('rejects when current epoch has at least one cash transaction', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const [tx] = await db.insert(cashTransactions).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 100,
      splitType: 'all_mine',
      description: 'TEST_68 cash',
      category: 'food',
      transactedAt: new Date('2026-05-14T01:00:00Z'),
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(tx.id)

    await expect(setBaseCurrency({ currency: 'usd' })).rejects.toThrow('base_currency_locked')
  })

  it('rejects when current epoch has at least one income transaction', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const [tx] = await db.insert(incomeTransactions).values({
      groupId: refs.groupId,
      recipientId: refs.userId,
      amount: 50000,
      category: 'salary',
      occurredAt: '2026-05-14',
    }).returning({ id: incomeTransactions.id })
    refs.incomeTxIds.push(tx.id)

    await expect(setBaseCurrency({ currency: 'usd' })).rejects.toThrow('base_currency_locked')
  })

  it('rejects when current epoch has at least one settlement', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const [s] = await db.insert(settlements).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 500,
      settledAt: new Date('2026-05-14T02:00:00Z'),
    }).returning({ id: settlements.id })
    refs.settlementIds.push(s.id)

    await expect(setBaseCurrency({ currency: 'usd' })).rejects.toThrow('base_currency_locked')
  })

  it('records OUTSIDE current epoch do not block change', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    // Insert a cash transaction RECORDED before the epoch start — createdAt is
    // what decides chapter membership (#1106), so this row belongs to the
    // previous chapter.
    const [tx] = await db.insert(cashTransactions).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 100,
      splitType: 'all_mine',
      description: 'TEST_68 past cash',
      category: 'food',
      transactedAt: new Date('2026-05-13T23:59:59Z'), // before epoch start 2026-05-14T00:00:00Z
      createdAt: new Date('2026-05-13T23:59:59Z'),
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(tx.id)

    // Should NOT be blocked
    await expect(setBaseCurrency({ currency: 'cny' })).resolves.not.toThrow()

    const [updated] = await db.select().from(oikosGroups)
      .where(eq(oikosGroups.id, refs.groupId)).limit(1)
    expect(updated.baseCurrency).toBe('cny')
  })

  it('soft-deleted records do not block change', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    // Insert a cash transaction in epoch but soft-deleted
    const [tx] = await db.insert(cashTransactions).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 100,
      splitType: 'all_mine',
      description: 'TEST_68 deleted cash',
      category: 'food',
      transactedAt: new Date('2026-05-14T01:00:00Z'),
      deletedAt: new Date(), // soft-deleted
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(tx.id)

    // Should NOT be blocked
    await expect(setBaseCurrency({ currency: 'jpy' })).resolves.not.toThrow()

    const [updated] = await db.select().from(oikosGroups)
      .where(eq(oikosGroups.id, refs.groupId)).limit(1)
    expect(updated.baseCurrency).toBe('jpy')
  })
})

// ─── Regression for #1106: backdated rows must still lock the currency ─────
//
// The guard used to count by event date (transactedAt / occurredAt /
// settledAt). A ledger seeded by CSV import — every event date last year,
// every createdAt now — therefore counted 0 records and let the base currency
// change, silently re-reading every stored integer as a different currency
// (TWD 1000 → JPY 1000). Chapter membership is `created_at`; these rows show
// up in /records, stats and balance, so they must block the change.
// ──────────────────────────────────────────────────────────────────────────
describe('setBaseCurrency — backdated records still lock (#1106)', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  // A year before the epoch start (2026-05-14), recorded now.
  const BACKDATED = new Date('2025-05-14T03:00:00Z')

  it('rejects for a cash transaction backdated before the epoch start', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const [tx] = await db.insert(cashTransactions).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 100,
      splitType: 'all_mine',
      description: 'TEST_1106 imported cash',
      category: 'food',
      transactedAt: BACKDATED,
      // createdAt left to defaultNow() — recorded during the current chapter.
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(tx.id)

    await expect(setBaseCurrency({ currency: 'usd' })).rejects.toThrow('base_currency_locked')

    const [after] = await db.select().from(oikosGroups)
      .where(eq(oikosGroups.id, refs.groupId)).limit(1)
    expect(after.baseCurrency).toBe('twd')
  })

  it('rejects for an income transaction backdated before the epoch start', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const [tx] = await db.insert(incomeTransactions).values({
      groupId: refs.groupId,
      recipientId: refs.userId,
      amount: 50000,
      category: 'salary',
      occurredAt: '2025-05-14',
    }).returning({ id: incomeTransactions.id })
    refs.incomeTxIds.push(tx.id)

    await expect(setBaseCurrency({ currency: 'usd' })).rejects.toThrow('base_currency_locked')

    const [after] = await db.select().from(oikosGroups)
      .where(eq(oikosGroups.id, refs.groupId)).limit(1)
    expect(after.baseCurrency).toBe('twd')
  })

  it('rejects for a settlement backdated before the epoch start', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const [s] = await db.insert(settlements).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 500,
      settledAt: BACKDATED,
    }).returning({ id: settlements.id })
    refs.settlementIds.push(s.id)

    await expect(setBaseCurrency({ currency: 'usd' })).rejects.toThrow('base_currency_locked')

    const [after] = await db.select().from(oikosGroups)
      .where(eq(oikosGroups.id, refs.groupId)).limit(1)
    expect(after.baseCurrency).toBe('twd')
  })
})

// ─── The display side of the same guard (#1106) ────────────────────────────
//
// `app/(dashboard)/settings/currency/page.tsx` renders
// `canChangeBase={!hasRecords}` straight off `currentEpochHasRecords(group)`,
// so the helper IS the page's answer — exercising it here covers the disabled
// selector without rendering an async server component. The page holds no other
// logic between the two: one call, one negation, one prop.
//
// This half used to count by event date independently of the action, which is
// how the two drifted: after the action was fixed, an imported ledger would
// still show an enabled selector that errored on click.
// ──────────────────────────────────────────────────────────────────────────
describe('currentEpochHasRecords — backs canChangeBase on the settings page', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  const BACKDATED = new Date('2025-05-14T03:00:00Z')

  function groupRef(refs: SeedRefs) {
    return { id: refs.groupId, currentEpochStartedAt: refs.epochStartedAt }
  }

  it('is false for an empty chapter (selector enabled)', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    expect(await currentEpochHasRecords(groupRef(refs))).toBe(false)
  })

  it('is true after importing a backdated cash transaction (selector disabled)', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs

    const [tx] = await db.insert(cashTransactions).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 100,
      splitType: 'all_mine',
      description: 'TEST_1106 imported cash',
      category: 'food',
      transactedAt: BACKDATED,
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(tx.id)

    expect(await currentEpochHasRecords(groupRef(refs))).toBe(true)
  })

  it('is true after importing a backdated income transaction', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs

    const [tx] = await db.insert(incomeTransactions).values({
      groupId: refs.groupId,
      recipientId: refs.userId,
      amount: 50000,
      category: 'salary',
      occurredAt: '2025-05-14',
    }).returning({ id: incomeTransactions.id })
    refs.incomeTxIds.push(tx.id)

    expect(await currentEpochHasRecords(groupRef(refs))).toBe(true)
  })

  it('is true after importing a backdated settlement', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs

    const [s] = await db.insert(settlements).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 500,
      settledAt: BACKDATED,
    }).returning({ id: settlements.id })
    refs.settlementIds.push(s.id)

    expect(await currentEpochHasRecords(groupRef(refs))).toBe(true)
  })

  it('is false for a row recorded in the PREVIOUS chapter', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs

    const [tx] = await db.insert(cashTransactions).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 100,
      splitType: 'all_mine',
      description: 'TEST_1106 previous chapter',
      category: 'food',
      transactedAt: new Date('2026-05-13T23:59:59Z'),
      createdAt: new Date('2026-05-13T23:59:59Z'),
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(tx.id)

    expect(await currentEpochHasRecords(groupRef(refs))).toBe(false)
  })

  it('is false when the only in-chapter row is soft-deleted', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs

    const [tx] = await db.insert(cashTransactions).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 100,
      splitType: 'all_mine',
      description: 'TEST_1106 deleted cash',
      category: 'food',
      transactedAt: BACKDATED,
      deletedAt: new Date(),
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(tx.id)

    expect(await currentEpochHasRecords(groupRef(refs))).toBe(false)
  })
})
