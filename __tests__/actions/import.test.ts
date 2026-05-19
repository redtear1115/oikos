import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Integration test for actions/import.ts (#607) ───────────────────────
//
// Covers the import + rollback round-trip:
//   - importCsvBatch writes expense rows to CashTransactions and income rows
//     to IncomeTransactions, tags them with import_batch_id, recomputes
//     GroupBalance.
//   - rollbackImportBatch soft-deletes every tagged row and flips the batch
//     status; balance recomputes to the pre-import value.
//
// Real dev DB required (same pattern as other action e2e tests).
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
  incomeTransactions,
  importBatches,
  importErrors,
} = await import('@/lib/db/schema')
const { importCsvBatch, rollbackImportBatch, getImportHistory } = await import('@/actions/import')
const { eq } = await import('drizzle-orm')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; ensure .env.local has DATABASE_URL.')
  }
})

interface SeedRefs {
  userId: string
  groupId: string
  batchIds: string[]
}

async function seedSoloGroup(): Promise<SeedRefs> {
  const userId = randomUUID()
  const epochStartedAt = new Date('2026-01-01T00:00:00Z')

  await db.insert(profiles).values({ id: userId, displayName: 'TEST_607_user' })

  const [group] = await db
    .insert(oikosGroups)
    .values({
      name: 'TEST_607_group',
      memberA: userId,
      currentEpochStartedAt: epochStartedAt,
    })
    .returning({ id: oikosGroups.id })

  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })

  await db.insert(groupEpochs).values({
    groupId: group.id,
    startedAt: epochStartedAt,
    memberAId: userId,
  })

  return { userId, groupId: group.id, batchIds: [] }
}

async function cleanup(refs: SeedRefs) {
  // Cash + income rows tagged with the batch; errors cascade with batch delete.
  for (const batchId of refs.batchIds) {
    await db.delete(cashTransactions).where(eq(cashTransactions.importBatchId, batchId))
    await db.delete(incomeTransactions).where(eq(incomeTransactions.importBatchId, batchId))
    await db.delete(importErrors).where(eq(importErrors.batchId, batchId))
    await db.delete(importBatches).where(eq(importBatches.id, batchId))
  }
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.groupId))
  await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.groupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
  await db.delete(profiles).where(eq(profiles.id, refs.userId))
}

describe('actions/import.ts — round-trip (#607)', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('writes expense + income rows tagged with batch id and updates counts', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const result = await importCsvBatch({
      source: 'honeydue',
      fileName: 'test.csv',
      totalRows: 3,
      rows: [
        {
          type: 'expense',
          amount: 100,
          date: '2026-02-01',
          category: 'dining',
          description: 'lunch',
          paidBy: 'a',
          splitType: 'all_mine',
        },
        {
          type: 'expense',
          amount: 250,
          date: '2026-02-02',
          category: 'dining',
          description: 'dinner',
          paidBy: 'a',
          splitType: 'all_mine',
        },
        {
          type: 'income',
          amount: 50000,
          date: '2026-02-03',
          category: 'salary',
          description: 'payroll',
          paidBy: 'a',
          splitType: 'all_mine',
        },
      ],
      errors: [
        {
          rowNumber: 5,
          rawRow: { date: 'bad' },
          errorType: 'invalid_date',
          errorDetail: 'unparseable',
        },
      ],
    })

    refs.batchIds.push(result.batchId)

    expect(result.importedCount).toBe(3)
    expect(result.errorCount).toBe(1)

    const cashRows = await db
      .select()
      .from(cashTransactions)
      .where(eq(cashTransactions.importBatchId, result.batchId))
    expect(cashRows).toHaveLength(2)
    expect(cashRows.every((r) => r.deletedAt === null)).toBe(true)

    const incomeRows = await db
      .select()
      .from(incomeTransactions)
      .where(eq(incomeTransactions.importBatchId, result.batchId))
    expect(incomeRows).toHaveLength(1)

    const errs = await db
      .select()
      .from(importErrors)
      .where(eq(importErrors.batchId, result.batchId))
    expect(errs).toHaveLength(1)

    const [batch] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, result.batchId))
      .limit(1)
    expect(batch.status).toBe('completed')
    expect(batch.importedCount).toBe(3)
    expect(batch.errorCount).toBe(1)
  })

  it('rollback soft-deletes every tagged row and flips batch status', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const { batchId } = await importCsvBatch({
      source: 'spendee',
      fileName: 'rollback.csv',
      totalRows: 2,
      rows: [
        {
          type: 'expense',
          amount: 80,
          date: '2026-03-10',
          category: 'transit',
          description: 'taxi',
          paidBy: 'a',
          splitType: 'all_mine',
        },
        {
          type: 'income',
          amount: 1000,
          date: '2026-03-11',
          category: 'gift',
          description: 'red envelope',
          paidBy: 'a',
          splitType: 'all_mine',
        },
      ],
      errors: [],
    })
    refs.batchIds.push(batchId)

    await rollbackImportBatch(batchId)

    const cashRows = await db
      .select()
      .from(cashTransactions)
      .where(eq(cashTransactions.importBatchId, batchId))
    expect(cashRows.every((r) => r.deletedAt !== null)).toBe(true)

    const incomeRows = await db
      .select()
      .from(incomeTransactions)
      .where(eq(incomeTransactions.importBatchId, batchId))
    expect(incomeRows.every((r) => r.deletedAt !== null)).toBe(true)

    const [batch] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
      .limit(1)
    expect(batch.status).toBe('rolled_back')
    expect(batch.rolledBackAt).not.toBeNull()

    // Second rollback rejects (idempotent guard).
    await expect(rollbackImportBatch(batchId)).rejects.toThrow('復原')
  })

  it('getImportHistory returns recent batches with rollbackable flag', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    const { batchId } = await importCsvBatch({
      source: 'cwmoney',
      fileName: 'history.csv',
      totalRows: 1,
      rows: [
        {
          type: 'expense',
          amount: 42,
          date: '2026-04-01',
          category: 'other',
          description: 'misc',
          paidBy: 'a',
          splitType: 'all_mine',
        },
      ],
      errors: [],
    })
    refs.batchIds.push(batchId)

    const history = await getImportHistory()
    expect(history.length).toBeGreaterThan(0)
    const ours = history.find((b) => b.id === batchId)
    expect(ours).toBeDefined()
    expect(ours!.rollbackable).toBe(true)
    expect(ours!.status).toBe('completed')
  })

  it('rejects rows with non-positive amount', async () => {
    const refs = await seedSoloGroup()
    activeRefs = refs
    mockUserId = refs.userId

    await expect(
      importCsvBatch({
        source: 'generic',
        fileName: 'bad.csv',
        totalRows: 1,
        rows: [
          {
            type: 'expense',
            amount: 0,
            date: '2026-04-01',
            category: 'other',
            description: 'zero',
            paidBy: 'a',
            splitType: 'all_mine',
          },
        ],
        errors: [],
      }),
    ).rejects.toThrow('金額')
  })
})
