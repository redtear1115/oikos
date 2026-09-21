import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'

// ─── Integration test: rollbackImportBatch scoping ────────────────────────
//
// rollbackImportBatch may only touch what the viewer's current chapter owns:
//   (a) rows tagged with the batch that now live in another group are left
//       alone — the row UPDATEs are filtered by the viewer's group;
//   (b) the 24h rollback window is enforced by the server, not only by the
//       hidden button;
//   (c) a batch recorded in a closed chapter can't be rolled back;
//   (e) two rollbacks of the same batch racing each other: exactly one wins.
// Plus the positive control: a fresh batch in the open chapter rolls back.
//
// Real Postgres required (same pattern as the other action integration tests).
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
const { importCsvBatch, rollbackImportBatch } = await import('@/actions/import')
const { and, eq, inArray, isNull, sql } = await import('drizzle-orm')
const { unwrapAction } = await import('@/lib/action-errors')

// A second, independent connection used to hold row locks while the actions
// run, so the concurrency case interleaves deterministically (no sleeps on
// the action side — we poll pg_stat_activity until both actions are waiting).
let holder: ReturnType<typeof postgres> | null = null

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; ensure .env.local has DATABASE_URL.')
  }
  holder = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 })
})

afterAll(async () => {
  await holder?.end({ timeout: 5 })
})

interface Seeded {
  userIds: string[]
  groupIds: string[]
  batchIds: string[]
}

async function seedSoloGroup(refs: Seeded, label: string): Promise<{ userId: string; groupId: string }> {
  const userId = randomUUID()
  const epochStartedAt = new Date('2026-01-01T00:00:00Z')

  await db.insert(profiles).values({ id: userId, displayName: `TEST_rollback_${label}` })
  refs.userIds.push(userId)

  const [group] = await db
    .insert(oikosGroups)
    .values({ name: `TEST_rollback_${label}`, memberA: userId, currentEpochStartedAt: epochStartedAt })
    .returning({ id: oikosGroups.id })
  refs.groupIds.push(group.id)

  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: group.id, startedAt: epochStartedAt, memberAId: userId })

  return { userId, groupId: group.id }
}

async function cleanup(refs: Seeded) {
  for (const batchId of refs.batchIds) {
    await db.delete(cashTransactions).where(eq(cashTransactions.importBatchId, batchId))
    await db.delete(incomeTransactions).where(eq(incomeTransactions.importBatchId, batchId))
    await db.delete(importErrors).where(eq(importErrors.batchId, batchId))
    await db.delete(importBatches).where(eq(importBatches.id, batchId))
  }
  for (const groupId of refs.groupIds) {
    await db.delete(groupEpochs).where(eq(groupEpochs.groupId, groupId))
    await db.delete(groupBalance).where(eq(groupBalance.groupId, groupId))
    await db.delete(oikosGroups).where(eq(oikosGroups.id, groupId))
  }
  for (const userId of refs.userIds) {
    await db.delete(profiles).where(eq(profiles.id, userId))
  }
}

/** Imports 2 expense rows + 1 income row as the current mock user. */
async function importThree(refs: Seeded): Promise<string> {
  const { batchId } = unwrapAction(await importCsvBatch({
    source: 'generic',
    fileName: 'rollback-scope.csv',
    totalRows: 3,
    rows: [
      { type: 'expense', amount: 120, date: '2026-05-01', category: 'dining', description: 'r1', paidBy: 'a', splitType: 'all_mine' },
      { type: 'expense', amount: 340, date: '2026-05-02', category: 'dining', description: 'r2', paidBy: 'a', splitType: 'all_mine' },
      { type: 'income', amount: 5000, date: '2026-05-03', category: 'salary', description: 'r3', paidBy: 'a', splitType: 'all_mine' },
    ],
    errors: [],
  }))
  refs.batchIds.push(batchId)
  return batchId
}

async function cashRows(batchId: string) {
  return db.select().from(cashTransactions).where(eq(cashTransactions.importBatchId, batchId))
}
async function incomeRows(batchId: string) {
  return db.select().from(incomeTransactions).where(eq(incomeTransactions.importBatchId, batchId))
}
async function batchRow(batchId: string) {
  const [b] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1)
  return b
}

async function expectAllRowsLive(batchId: string) {
  const cash = await cashRows(batchId)
  const income = await incomeRows(batchId)
  expect(cash).toHaveLength(2)
  expect(income).toHaveLength(1)
  expect(cash.every((r) => r.deletedAt === null)).toBe(true)
  expect(income.every((r) => r.deletedAt === null)).toBe(true)
  const batch = await batchRow(batchId)
  expect(batch.status).toBe('completed')
  expect(batch.rolledBackAt).toBeNull()
}

async function waitForLockWaiters(n: number, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const [{ count }] = await holder!<{ count: number }[]>`
      SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`
    if (count >= n) return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error(`timed out waiting for ${n} lock waiter(s)`)
}

describe('rollbackImportBatch — scoped to the viewer’s open chapter and group', () => {
  let refs: Seeded = { userIds: [], groupIds: [], batchIds: [] }

  afterEach(async () => {
    try { await cleanup(refs) } catch (e) { console.error('cleanup failed', e) }
    refs = { userIds: [], groupIds: [], batchIds: [] }
  })

  it('positive control: a fresh batch in the open chapter rolls back', async () => {
    const a = await seedSoloGroup(refs, 'pos')
    mockUserId = a.userId
    const batchId = await importThree(refs)

    expect(await rollbackImportBatch(batchId)).toEqual({ ok: true, data: undefined })

    expect((await cashRows(batchId)).every((r) => r.deletedAt !== null)).toBe(true)
    expect((await incomeRows(batchId)).every((r) => r.deletedAt !== null)).toBe(true)
    expect((await batchRow(batchId)).status).toBe('rolled_back')
  })

  it('(a) rows moved to another group keep deleted_at NULL after rollback', async () => {
    const a = await seedSoloGroup(refs, 'a_src')
    const b = await seedSoloGroup(refs, 'a_dst')
    mockUserId = a.userId
    const batchId = await importThree(refs)

    // Move one expense row and the income row to B's group, keeping
    // import_batch_id. The batch itself stays in A's group, in A's open
    // chapter.
    const [movedCash] = await cashRows(batchId)
    const [movedIncome] = await incomeRows(batchId)
    await db.update(cashTransactions).set({ groupId: b.groupId }).where(eq(cashTransactions.id, movedCash.id))
    await db.update(incomeTransactions).set({ groupId: b.groupId }).where(eq(incomeTransactions.id, movedIncome.id))

    unwrapAction(await rollbackImportBatch(batchId))

    const cash = await cashRows(batchId)
    const income = await incomeRows(batchId)
    // Moved rows untouched.
    expect(cash.find((r) => r.id === movedCash.id)!.deletedAt).toBeNull()
    expect(income.find((r) => r.id === movedIncome.id)!.deletedAt).toBeNull()
    // The row still in A's group was rolled back.
    const stayed = cash.filter((r) => r.id !== movedCash.id)
    expect(stayed).toHaveLength(1)
    expect(stayed[0].deletedAt).not.toBeNull()
    expect((await batchRow(batchId)).status).toBe('rolled_back')
  })

  it('(b) a batch older than 24h is refused and its rows stay live', async () => {
    const a = await seedSoloGroup(refs, 'b')
    mockUserId = a.userId
    const batchId = await importThree(refs)

    await db
      .update(importBatches)
      .set({ createdAt: sql`now() - interval '25 hours'` })
      .where(eq(importBatches.id, batchId))

    expect(await rollbackImportBatch(batchId)).toEqual({ ok: false, code: 'import_rollback_forbidden' })
    await expectAllRowsLive(batchId)
  })

  it('(c) a batch from a closed chapter is refused even within 24h', async () => {
    const a = await seedSoloGroup(refs, 'c')
    mockUserId = a.userId
    const batchId = await importThree(refs)

    // Close the chapter the batch was recorded in and open a new one, as a
    // membership change does. The viewer is still in the same group.
    await db.transaction(async (tx) => {
      await tx
        .update(groupEpochs)
        .set({ endedAt: sql`clock_timestamp()` })
        .where(and(eq(groupEpochs.groupId, a.groupId), isNull(groupEpochs.endedAt)))
      await tx.insert(groupEpochs).values({ groupId: a.groupId, startedAt: sql`clock_timestamp()`, memberAId: a.userId })
      await tx
        .update(oikosGroups)
        .set({ currentEpochStartedAt: sql`clock_timestamp()` })
        .where(eq(oikosGroups.id, a.groupId))
    })

    expect(await rollbackImportBatch(batchId)).toEqual({ ok: false, code: 'import_rollback_forbidden' })
    await expectAllRowsLive(batchId)
  })

  it('(e) two concurrent rollbacks of the same batch: exactly one succeeds', async () => {
    const a = await seedSoloGroup(refs, 'e')
    mockUserId = a.userId
    const batchId = await importThree(refs)
    const cashIds = (await cashRows(batchId)).map((r) => r.id)

    // Hold a lock on the batch's cash rows so both rollbacks are in flight
    // at once, then release and let them race to commit.
    let release!: () => void
    const released = new Promise<void>((r) => { release = r })
    let locked!: () => void
    const isLocked = new Promise<void>((r) => { locked = r })
    const holding = holder!.begin(async (s) => {
      await s`SELECT id FROM "CashTransactions" WHERE id IN ${s(cashIds)} FOR UPDATE`
      locked()
      await released
    })
    await isLocked

    const first = rollbackImportBatch(batchId)
    const second = rollbackImportBatch(batchId)
    try {
      await waitForLockWaiters(2)
    } finally {
      release()
      await holding
    }
    const results = await Promise.all([first, second])

    const wins = results.filter((r) => r.ok)
    const losses = results.filter((r) => !r.ok)
    expect(wins).toHaveLength(1)
    expect(losses).toEqual([{ ok: false, code: 'import_already_rolled_back' }])

    const batch = await batchRow(batchId)
    expect(batch.status).toBe('rolled_back')
    const cash = await db
      .select()
      .from(cashTransactions)
      .where(inArray(cashTransactions.id, cashIds))
    expect(cash.every((r) => r.deletedAt !== null)).toBe(true)
  })
})
