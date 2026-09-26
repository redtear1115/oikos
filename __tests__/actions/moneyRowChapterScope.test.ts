import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1290 — per-row edits and deletes of money rows ─────────────────────
//
// Editing or deleting an expense, income, settlement or fuel log is limited to
// rows of the chapter that is open now, in the viewer's group, and runs under
// the chapter lock:
//
// - the transaction's first statement takes the open GroupEpochs row FOR SHARE
//   (no open chapter → the action's own not-found code);
// - the target row must have `created_at >=` that chapter's `started_at`;
// - an edit re-checks the payer / recipient against the group row read in the
//   same transaction;
// - a fuel log's linked expense is looked up and updated within the viewer's
//   group only; an edit whose linked expense is missing is refused.
//
// A closed chapter is read-only. An edit is a soft-delete plus a re-insert, and
// the re-inserted row takes `created_at = now()`: without the chapter check, an
// edit of a closed chapter's row would move it into the current chapter's
// balance, and a delete would remove it from the read-only past.
//
// The second half drives a real edit against leaveGroup / removePartner /
// acceptInvite with the interleaving forced through pg_stat_activity, as in
// epochCloser.lockOrder.test.ts: the edit holds the chapter row, the closer
// waits for it, the edit's insert (FK → OikosGroups KEY SHARE) goes through,
// and the edited row stays in the chapter it was edited in.
//
// Local throwaway database only; refuses to run against anything that is not
// localhost. Start one with:
//   docker run -d --name pg-1290s1 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55530:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55530/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55530/postgres npx vitest run __tests__/actions/moneyRowChapterScope.test.ts
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

const { AsyncLocalStorage } = await import('node:async_hooks')
const viewerStore = new AsyncLocalStorage<string>()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: viewerStore.getStore() ?? '' } }, error: null }),
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))

const { db } = await import('@/lib/db/client')
const {
  profiles, oikosGroups, groupBalance, groupEpochs, groupInvites,
  cashTransactions, incomeTransactions, settlements, assets, carDetails, fuelLogs,
} = await import('@/lib/db/schema')
const { editTransaction, softDeleteTransaction } = await import('@/actions/transaction')
const { editIncome, softDeleteIncome } = await import('@/actions/income')
const { editSettlement, softDeleteSettlement } = await import('@/actions/settlement')
const { editFuelLog, softDeleteFuelLog } = await import('@/actions/fuelLog')
const { acceptInvite } = await import('@/actions/invite')
const { leaveGroup, removePartner } = await import('@/actions/membership')
const { generateToken, INVITE_TTL_MS } = await import('@/lib/invite')
const { eq, inArray, or } = await import('drizzle-orm')
const postgres = (await import('postgres')).default
type Sql = ReturnType<typeof postgres>

const as = <T>(userId: string, fn: () => Promise<T>) => viewerStore.run(userId, fn)

const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
  } catch {
    return false
  }
})()

let holderConn: Sql
let monitor: Sql

beforeAll(() => {
  if (!isLocalDb) return
  holderConn = postgres(databaseUrl, { max: 1, prepare: false })
  monitor = postgres(databaseUrl, { max: 1, prepare: false })
})

afterAll(async () => {
  await holderConn?.end()
  await monitor?.end()
})

const created = { profiles: [] as string[], groups: [] as string[] }

afterEach(async () => {
  if (!isLocalDb) return
  const groupIds = [...created.groups]
  if (created.profiles.length) {
    const extra = await db
      .select({ id: oikosGroups.id })
      .from(oikosGroups)
      .where(or(inArray(oikosGroups.memberA, created.profiles), inArray(oikosGroups.memberB, created.profiles)))
    for (const g of extra) if (!groupIds.includes(g.id)) groupIds.push(g.id)
  }
  if (groupIds.length) {
    const carIds = (await db.select({ id: assets.id }).from(assets).where(inArray(assets.groupId, groupIds)))
      .map((r) => r.id)
    await db.delete(cashTransactions).where(inArray(cashTransactions.groupId, groupIds))
    await db.delete(incomeTransactions).where(inArray(incomeTransactions.groupId, groupIds))
    await db.delete(settlements).where(inArray(settlements.groupId, groupIds))
    if (carIds.length) {
      await db.delete(fuelLogs).where(inArray(fuelLogs.assetId, carIds))
      await db.delete(carDetails).where(inArray(carDetails.assetId, carIds))
      await db.delete(assets).where(inArray(assets.id, carIds))
    }
    await db.delete(groupInvites).where(inArray(groupInvites.groupId, groupIds))
    await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, groupIds))
    await db.delete(groupBalance).where(inArray(groupBalance.groupId, groupIds))
    await db.delete(oikosGroups).where(inArray(oikosGroups.id, groupIds))
  }
  if (created.profiles.length) {
    await db.delete(profiles).where(inArray(profiles.id, created.profiles))
  }
  created.profiles = []
  created.groups = []
})

// ─── fixtures ─────────────────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR)

async function person(label: string): Promise<string> {
  const id = randomUUID()
  await db.insert(profiles).values({ id, displayName: `TEST_1290_S1_${label}` })
  created.profiles.push(id)
  return id
}

/** A group whose current chapter began `openSince` hours ago. */
async function group(memberA: string, memberB: string | null, openSince = 72): Promise<string> {
  const startedAt = hoursAgo(openSince)
  const [g] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1290_S1_group', memberA, memberB, currentEpochStartedAt: startedAt })
    .returning({ id: oikosGroups.id })
  created.groups.push(g.id)
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: g.id, startedAt, memberAId: memberA, memberBId: memberB })
  return g.id
}

/**
 * A group with a closed chapter [72h ago, 24h ago) and an open one since 24h
 * ago, same two members (as after a leave and a re-join).
 */
async function groupWithClosedChapter(memberA: string, memberB: string): Promise<string> {
  const closedFrom = hoursAgo(72)
  const boundary = hoursAgo(24)
  const [g] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1290_S1_group', memberA, memberB, currentEpochStartedAt: boundary })
    .returning({ id: oikosGroups.id })
  created.groups.push(g.id)
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values([
    { groupId: g.id, startedAt: closedFrom, endedAt: boundary, memberAId: memberA, memberBId: memberB },
    { groupId: g.id, startedAt: boundary, memberAId: memberA, memberBId: memberB },
  ])
  return g.id
}

const IN_CLOSED_CHAPTER = () => hoursAgo(48)

async function cashRow(groupId: string, paidBy: string, createdAt?: Date) {
  const [r] = await db.insert(cashTransactions).values({
    groupId, paidBy, amount: 100, splitType: 'all_mine', description: 'TEST_1290_S1',
    category: 'food', transactedAt: new Date(), ...(createdAt ? { createdAt } : {}),
  }).returning({ id: cashTransactions.id })
  return r.id
}

async function incomeRow(groupId: string, recipientId: string, createdAt?: Date) {
  const [r] = await db.insert(incomeTransactions).values({
    groupId, recipientId, amount: 100, category: 'salary', occurredAt: '2026-01-15',
    ...(createdAt ? { createdAt } : {}),
  }).returning({ id: incomeTransactions.id })
  return r.id
}

async function settlementRow(groupId: string, paidBy: string, createdAt?: Date) {
  const [r] = await db.insert(settlements).values({
    groupId, paidBy, amount: 100, settledAt: new Date(), ...(createdAt ? { createdAt } : {}),
  }).returning({ id: settlements.id })
  return r.id
}

async function car(groupId: string) {
  const [a] = await db.insert(assets).values({ groupId, type: 'car', name: 'TEST_1290_S1_car' })
    .returning({ id: assets.id })
  await db.insert(carDetails).values({ assetId: a.id, fuelType: '95' })
  return a.id
}

/** A fuel log and its linked expense, both recorded at `createdAt` (default now). */
async function fuelRow(groupId: string, carId: string, paidBy: string, createdAt?: Date) {
  const at = createdAt ? { createdAt } : {}
  const [log] = await db.insert(fuelLogs).values({
    assetId: carId, liters: '40.00', fuelType: '95', odometer: 12000,
    station: 'TEST_1290_S1', loggedAt: new Date('2026-01-15T10:00:00Z'), ...at,
  }).returning({ id: fuelLogs.id })
  const [txn] = await db.insert(cashTransactions).values({
    groupId, assetId: carId, fuelLogId: log.id, paidBy, amount: 1600, splitType: 'all_mine',
    category: 'transit', description: '加油', transactedAt: new Date('2026-01-15T10:00:00Z'), ...at,
  }).returning({ id: cashTransactions.id })
  return { logId: log.id, txnId: txn.id }
}

const cashInput = (oldId: string, payerId: string) => ({
  oldId, amount: 250, description: 'TEST_1290_S1_edited', category: 'food',
  splitType: 'all_mine' as const, payerId, transactedAt: '2026-01-20',
})
const incomeInput = (oldId: string, recipientId: string) => ({
  oldId, amount: 250, category: 'salary', recipientId, occurredAt: '2026-01-20',
})
const settlementInput = (oldId: string, payerId: string) => ({
  oldId, amount: 250, payerId, settledAt: '2026-01-20',
})
const fuelInput = (id: string, assetId: string, paidBy: string) => ({
  id, assetId, liters: 30, odometer: 12500, cost: 900, fuelType: '95',
  loggedAt: '2026-01-20', station: 'TEST_1290_S1_edited', paidBy, splitType: 'all_mine' as const,
})

async function counts(groupId: string) {
  const [r] = await monitor`
    SELECT
      (SELECT count(*)::int FROM "CashTransactions" WHERE group_id = ${groupId}) AS cash,
      (SELECT count(*)::int FROM "IncomeTransactions" WHERE group_id = ${groupId}) AS income,
      (SELECT count(*)::int FROM "Settlements" WHERE group_id = ${groupId}) AS settlements`
  return r as { cash: number; income: number; settlements: number }
}

async function deletedAt(table: 'CashTransactions' | 'IncomeTransactions' | 'Settlements' | 'FuelLogs', id: string) {
  const [r] = await monitor.unsafe(`SELECT deleted_at FROM "${table}" WHERE id = $1`, [id])
  return r.deleted_at as Date | null
}

// ─── chapter scope ────────────────────────────────────────────────────────

describe.skipIf(!isLocalDb)('money-row edits and deletes are limited to the current chapter (#1290)', () => {
  it('expenses: a closed chapter\'s row is refused with record_not_found and nothing is written', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await groupWithClosedChapter(a, b)
    const old = await cashRow(g, a, IN_CLOSED_CHAPTER())
    const before = await counts(g)

    expect(await as(a, () => editTransaction(cashInput(old, a)))).toEqual({ ok: false, code: 'record_not_found' })
    expect(await as(a, () => softDeleteTransaction(old))).toEqual({ ok: false, code: 'record_not_found' })

    expect(await deletedAt('CashTransactions', old)).toBeNull()
    expect(await counts(g)).toEqual(before)
  })

  it('expenses: the current chapter\'s row can still be edited and deleted', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await groupWithClosedChapter(a, b)
    const cur = await cashRow(g, a)

    const edited = await as(a, () => editTransaction(cashInput(cur, a)))
    expect(edited).toMatchObject({ ok: true })
    expect(await deletedAt('CashTransactions', cur)).not.toBeNull()
    const newId = (edited as { ok: true; data: { id: string } }).data.id
    expect(await as(a, () => softDeleteTransaction(newId))).toEqual({ ok: true, data: undefined })
    expect(await deletedAt('CashTransactions', newId)).not.toBeNull()
  })

  it('incomes: a closed chapter\'s row is refused with income_not_found and nothing is written', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await groupWithClosedChapter(a, b)
    const old = await incomeRow(g, a, IN_CLOSED_CHAPTER())
    const before = await counts(g)

    expect(await as(a, () => editIncome(incomeInput(old, a)))).toEqual({ ok: false, code: 'income_not_found' })
    expect(await as(a, () => softDeleteIncome(old))).toEqual({ ok: false, code: 'income_not_found' })

    expect(await deletedAt('IncomeTransactions', old)).toBeNull()
    expect(await counts(g)).toEqual(before)
  })

  it('incomes: the current chapter\'s row can still be edited and deleted', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await groupWithClosedChapter(a, b)
    const cur = await incomeRow(g, a)

    const edited = await as(a, () => editIncome(incomeInput(cur, a)))
    expect(edited).toMatchObject({ ok: true })
    const newId = (edited as { ok: true; data: { id: string } }).data.id
    expect(await as(a, () => softDeleteIncome(newId))).toEqual({ ok: true, data: undefined })
    expect(await deletedAt('IncomeTransactions', newId)).not.toBeNull()
  })

  it('incomes: deleting another group\'s row is refused and leaves it alone', async () => {
    const a = await person('a')
    const b = await person('b')
    const c = await person('c')
    await group(a, b)
    const other = await group(c, null)
    const foreign = await incomeRow(other, c)

    expect(await as(a, () => softDeleteIncome(foreign))).toEqual({ ok: false, code: 'income_not_found' })
    expect(await deletedAt('IncomeTransactions', foreign)).toBeNull()
  })

  it('settlements: a closed chapter\'s row is refused with record_not_found and nothing is written', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await groupWithClosedChapter(a, b)
    const old = await settlementRow(g, a, IN_CLOSED_CHAPTER())
    const before = await counts(g)

    expect(await as(a, () => editSettlement(settlementInput(old, a)))).toEqual({ ok: false, code: 'record_not_found' })
    expect(await as(a, () => softDeleteSettlement(old))).toEqual({ ok: false, code: 'record_not_found' })

    expect(await deletedAt('Settlements', old)).toBeNull()
    expect(await counts(g)).toEqual(before)
  })

  it('settlements: the current chapter\'s row can still be edited and deleted', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await groupWithClosedChapter(a, b)
    const cur = await settlementRow(g, a)

    const edited = await as(a, () => editSettlement(settlementInput(cur, a)))
    expect(edited).toMatchObject({ ok: true })
    const newId = (edited as { ok: true; data: { id: string } }).data.id
    expect(await as(a, () => softDeleteSettlement(newId))).toEqual({ ok: true, data: undefined })
    expect(await deletedAt('Settlements', newId)).not.toBeNull()
  })

  it('fuel logs: a closed chapter\'s log is refused with fuel_log_deleted_or_missing and nothing is written', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await groupWithClosedChapter(a, b)
    const carId = await car(g)
    const old = await fuelRow(g, carId, a, IN_CLOSED_CHAPTER())
    const before = await counts(g)

    expect(await as(a, () => editFuelLog(fuelInput(old.logId, carId, a))))
      .toEqual({ ok: false, code: 'fuel_log_deleted_or_missing' })
    expect(await as(a, () => softDeleteFuelLog(old.logId)))
      .toEqual({ ok: false, code: 'fuel_log_deleted_or_missing' })

    expect(await deletedAt('FuelLogs', old.logId)).toBeNull()
    expect(await deletedAt('CashTransactions', old.txnId)).toBeNull()
    expect(await counts(g)).toEqual(before)
    const [log] = await db.select().from(fuelLogs).where(eq(fuelLogs.id, old.logId))
    expect(log.station).toBe('TEST_1290_S1')
  })

  it('fuel logs: the current chapter\'s log can still be edited and deleted', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await groupWithClosedChapter(a, b)
    const carId = await car(g)
    const cur = await fuelRow(g, carId, a)

    expect(await as(a, () => editFuelLog(fuelInput(cur.logId, carId, a)))).toEqual({ ok: true, data: { id: cur.logId } })
    expect(await deletedAt('CashTransactions', cur.txnId)).not.toBeNull()
    expect(await as(a, () => softDeleteFuelLog(cur.logId))).toEqual({ ok: true, data: undefined })
    const live = await monitor`
      SELECT count(*)::int AS n FROM "CashTransactions" WHERE fuel_log_id = ${cur.logId} AND deleted_at IS NULL`
    expect(live[0].n).toBe(0)
  })

  it('fuel logs: when the car now belongs to the viewer\'s group but the linked expense is in another group, the edit is refused and the other group is untouched', async () => {
    const a = await person('a')
    const b = await person('b')
    const c = await person('c')
    const mine = await group(a, b)
    const other = await group(c, null)
    const carId = await car(other)
    const log = await fuelRow(other, carId, c)
    // The car is re-parented to the viewer's group; its history stays behind.
    await db.update(assets).set({ groupId: mine }).where(eq(assets.id, carId))
    const beforeMine = await counts(mine)
    const beforeOther = await counts(other)

    expect(await as(a, () => editFuelLog(fuelInput(log.logId, carId, a))))
      .toEqual({ ok: false, code: 'fuel_transaction_not_found' })
    expect(await deletedAt('CashTransactions', log.txnId)).toBeNull()
    expect(await counts(mine)).toEqual(beforeMine)
    expect(await counts(other)).toEqual(beforeOther)
    const [row] = await db.select().from(fuelLogs).where(eq(fuelLogs.id, log.logId))
    expect(row.station).toBe('TEST_1290_S1')

    // Deleting the log does not reach the other group's expense either.
    await as(a, () => softDeleteFuelLog(log.logId))
    expect(await deletedAt('CashTransactions', log.txnId)).toBeNull()
  })

  it('a group with no open chapter fails closed', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await group(a, b)
    const cur = await cashRow(g, a)
    const inc = await incomeRow(g, a)
    await db.update(groupEpochs).set({ endedAt: new Date() }).where(eq(groupEpochs.groupId, g))

    expect(await as(a, () => softDeleteTransaction(cur))).toEqual({ ok: false, code: 'record_not_found' })
    expect(await as(a, () => softDeleteIncome(inc))).toEqual({ ok: false, code: 'income_not_found' })
    expect(await deletedAt('CashTransactions', cur)).toBeNull()
    expect(await deletedAt('IncomeTransactions', inc)).toBeNull()
  })
})

// ─── an edit racing a chapter closer ─────────────────────────────────────

type Step = { fn: (t: Sql) => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }

async function openTx(conn: Sql) {
  const queue: Step[] = []
  let wake: (() => void) | null = null
  let finished = false
  let setPid!: (pid: number) => void
  const pidP = new Promise<number>((r) => { setPid = r })
  const done = conn.begin(async (t) => {
    const [{ pid }] = await t`SELECT pg_backend_pid() AS pid`
    setPid(pid as number)
    for (;;) {
      while (queue.length === 0 && !finished) await new Promise<void>((r) => { wake = r })
      const step = queue.shift()
      if (!step) return
      try {
        step.resolve(await step.fn(t as unknown as Sql))
      } catch (e) {
        step.reject(e)
        throw e
      }
    }
  })
  done.catch(() => {})
  const pid = await pidP
  const poke = () => { const w = wake; wake = null; w?.() }
  return {
    pid,
    run<T>(fn: (t: Sql) => Promise<T>): Promise<T> {
      const p = new Promise<T>((resolve, reject) => {
        queue.push({ fn, resolve: resolve as (v: unknown) => void, reject })
      })
      poke()
      return p
    },
    async commit() {
      finished = true
      poke()
      await done
    },
  }
}

async function waitBlockedBy(blockerPid: number, n = 1): Promise<number[]> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const rows = await monitor`
      SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND ${blockerPid} = ANY(pg_blocking_pids(pid))`
    if (rows.length >= n) return rows.map((r) => r.pid as number)
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`timed out waiting for ${n} backend(s) blocked by ${blockerPid}`)
}

function sqlstate(e: unknown): string | undefined {
  let cur: unknown = e
  for (let d = 0; cur && d < 4; d++) {
    const code = (cur as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
    cur = (cur as { cause?: unknown }).cause
  }
  return undefined
}

function describeSettled(r: PromiseSettledResult<unknown>): unknown {
  return r.status === 'fulfilled' ? r.value : { rejected: sqlstate(r.reason) ?? String(r.reason) }
}

/**
 * 1. A holder locks the row being edited, so the edit — once it holds the
 *    chapter row — waits on its soft-delete.
 * 2. The closer starts and must wait for the edit (on the chapter row).
 * 3. The holder lets go; the edit soft-deletes, re-inserts (FK → the group row,
 *    KEY SHARE, while the closer holds it NO KEY UPDATE) and commits; the
 *    closer then finishes.
 */
async function editAgainstCloser<T>(
  groupId: string,
  editor: string,
  oldCashId: string,
  startCloser: () => Promise<T>,
) {
  const holder = await openTx(holderConn)
  const inFlight: Promise<unknown>[] = []
  let released = false
  try {
    await holder.run((t) => t`SELECT id FROM "CashTransactions" WHERE id = ${oldCashId} FOR UPDATE`)

    const edit = as(editor, () => editTransaction(cashInput(oldCashId, editor)))
    edit.catch(() => {})
    inFlight.push(edit)
    const [editPid] = await waitBlockedBy(holder.pid)

    const closer = startCloser()
    closer.catch(() => {})
    inFlight.push(closer)
    await waitBlockedBy(editPid)

    await holder.commit()
    released = true
    const [e, c] = await Promise.allSettled([edit, closer])
    return { edit: e, closer: c, groupId }
  } finally {
    // On a failed interleaving, let everything finish before cleanup runs.
    if (!released) {
      await holder.commit().catch(() => {})
      await Promise.allSettled(inFlight)
    }
  }
}

async function editedRowBeforeOpenChapter(edit: PromiseSettledResult<unknown>, groupId: string) {
  const newId = (edit as PromiseFulfilledResult<{ ok: true; data: { id: string } }>).value.data.id
  const [r] = await monitor`
    SELECT c.created_at < e.started_at AS before, c.group_id AS group_id
    FROM "CashTransactions" c, "GroupEpochs" e
    WHERE c.id = ${newId} AND e.group_id = ${groupId} AND e.ended_at IS NULL`
  return r.before as boolean
}

describe.skipIf(!isLocalDb)('an edit holding the chapter row against a chapter closer (#1290)', { timeout: 30_000 }, () => {
  it('leaveGroup waits for the edit; no 40P01, and the edited row stays in the chapter it was edited in', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await group(a, b)
    const old = await cashRow(g, a)

    const out = await editAgainstCloser(g, a, old, () => as(b, () => leaveGroup()))
    expect({ edit: describeSettled(out.edit), closer: describeSettled(out.closer) })
      .toMatchObject({ edit: { ok: true }, closer: { ok: true } })
    created.groups.push((out.closer as PromiseFulfilledResult<{ ok: true; data: { groupId: string } }>).value.data.groupId)
    expect(await deletedAt('CashTransactions', old)).not.toBeNull()
    expect(await editedRowBeforeOpenChapter(out.edit, g)).toBe(true)
  })

  it('removePartner waits for the edit; no 40P01, and the edited row stays in the chapter it was edited in', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await group(a, b)
    const old = await cashRow(g, a)

    const out = await editAgainstCloser(g, a, old, () => as(a, () => removePartner()))
    expect({ edit: describeSettled(out.edit), closer: describeSettled(out.closer) })
      .toMatchObject({ edit: { ok: true }, closer: { ok: true } })
    expect(await editedRowBeforeOpenChapter(out.edit, g)).toBe(true)
  })

  it('acceptInvite waits for the edit; no 40P01, and the edited row stays in the chapter it was edited in', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    await group(joiner, null)
    const token = generateToken()
    await db.insert(groupInvites).values({
      groupId: g, invitedBy: inviter, token, expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    const old = await cashRow(g, inviter)

    const out = await editAgainstCloser(g, inviter, old, () => as(joiner, () => acceptInvite(token)))
    expect({ edit: describeSettled(out.edit), closer: describeSettled(out.closer) })
      .toMatchObject({ edit: { ok: true }, closer: { ok: true, data: g } })
    expect(await editedRowBeforeOpenChapter(out.edit, g)).toBe(true)
  })
})
