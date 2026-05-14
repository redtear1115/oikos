import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Integration test for setBaseCurrency lock rule (#68) ─────────────────
//
// The lock rule: setBaseCurrency rejects if the current epoch has any
// non-deleted CashTransactions, IncomeTransactions, or Settlements.
// Records outside the current epoch (transactedAt < currentEpochStartedAt)
// must NOT block the change. Soft-deleted records must NOT block the change.
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

    await expect(setBaseCurrency({ currency: 'usd' })).rejects.toThrow('紀錄')
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

    await expect(setBaseCurrency({ currency: 'usd' })).rejects.toThrow('紀錄')
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

    await expect(setBaseCurrency({ currency: 'usd' })).rejects.toThrow('紀錄')
  })

  it('records OUTSIDE current epoch do not block change', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    // Insert a cash transaction BEFORE the epoch start
    const [tx] = await db.insert(cashTransactions).values({
      groupId: refs.groupId,
      paidBy: refs.userId,
      amount: 100,
      splitType: 'all_mine',
      description: 'TEST_68 past cash',
      category: 'food',
      transactedAt: new Date('2026-05-13T23:59:59Z'), // before epoch start 2026-05-14T00:00:00Z
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
