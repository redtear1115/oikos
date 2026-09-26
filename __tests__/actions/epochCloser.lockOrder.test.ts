import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1290 — chapter closers: lock order and the DB-clock boundary ────────
//
// leaveGroup, removePartner and acceptInvite close a chapter (GroupEpochs row)
// and open the next one. They must:
//
// 1. Lock OikosGroups FOR NO KEY UPDATE, then the open GroupEpochs row FOR NO
//    KEY UPDATE (several groups: ascending id). A plain FOR UPDATE on the group
//    conflicts with the FOR KEY SHARE that any insert referencing the group
//    takes for its foreign-key check, so a writer holding the open chapter row
//    FOR SHARE and then inserting a money row would deadlock (40P01) with a
//    closer that holds the group and waits for the chapter row.
// 2. Read the boundary (`clock_timestamp()`) only after those locks, and use
//    that one value for ended_at / started_at / current_epoch_started_at /
//    accepted_at / revoked_at. A boundary fixed earlier (the app server's
//    `new Date()`, or the transaction-start `now()`) can predate a row that a
//    writer committed while the closer waited, putting that row in the new
//    chapter.
//
// The interleavings are forced with extra connections and pg_stat_activity /
// pg_blocking_pids polling — no sleeps.
//
// Local throwaway database only. These tests hold row locks across several
// connections; they refuse to run against anything that is not localhost.
// Start one with (see the PR for the exact commands):
//   docker run -d --name pg-1290s0 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55440:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55440/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55440/postgres npx vitest run __tests__/actions/epochCloser.lockOrder.test.ts
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
  profiles, oikosGroups, groupBalance, groupEpochs, groupInvites, cashTransactions,
} = await import('@/lib/db/schema')
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

// holder / writer / closer each run one scripted transaction; monitor polls
// pg_stat_activity from outside any transaction (its view is frozen inside one).
let holderConn: Sql
let writerConn: Sql
let closerConn: Sql
let monitor: Sql

beforeAll(() => {
  if (!isLocalDb) return
  holderConn = postgres(databaseUrl, { max: 1, prepare: false })
  writerConn = postgres(databaseUrl, { max: 1, prepare: false })
  closerConn = postgres(databaseUrl, { max: 1, prepare: false })
  monitor = postgres(databaseUrl, { max: 1, prepare: false })
})

afterAll(async () => {
  await holderConn?.end()
  await writerConn?.end()
  await closerConn?.end()
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
    await db.delete(cashTransactions).where(inArray(cashTransactions.groupId, groupIds))
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
const longAgo = () => new Date(Date.now() - 48 * HOUR)

async function person(label: string): Promise<string> {
  const id = randomUUID()
  await db.insert(profiles).values({ id, displayName: `TEST_1290_S0_${label}` })
  created.profiles.push(id)
  return id
}

async function group(memberA: string, memberB: string | null): Promise<string> {
  const startedAt = longAgo()
  const [g] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1290_S0_group', memberA, memberB, currentEpochStartedAt: startedAt })
    .returning({ id: oikosGroups.id })
  created.groups.push(g.id)
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: g.id, startedAt, memberAId: memberA, memberBId: memberB })
  return g.id
}

async function seedInvite(groupId: string, invitedBy: string) {
  const token = generateToken()
  const [row] = await db.insert(groupInvites).values({
    groupId,
    invitedBy,
    token,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  }).returning({ id: groupInvites.id })
  return { id: row.id, token }
}

// ─── scripted transactions ────────────────────────────────────────────────

type Step = { fn: (t: Sql) => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }

/**
 * One transaction on `conn` driven step by step. `run` queues a statement and
 * resolves with its result; `commit` ends the transaction. A failing step
 * rolls the transaction back (and rejects `done`).
 */
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
    done,
  }
}

/** pid of a backend currently blocked (directly) by `blockerPid`. */
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

/** Wait until `n` backends of this database are waiting on a heavyweight lock. */
async function waitLockWaiters(n: number): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const [r] = await monitor`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`
    if ((r.n as number) >= n) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`timed out waiting for ${n} lock waiter(s)`)
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
 * The writer: begins after the closer, holds the open chapter row FOR SHARE
 * (as a guarded edit would), and later inserts a CashTransaction for the same
 * group — whose FK check takes FOR KEY SHARE on the OikosGroups row.
 */
async function startWriter(groupId: string) {
  const writer = await openTx(writerConn)
  const rows = await writer.run((t) => t`
    SELECT id FROM "GroupEpochs" WHERE group_id = ${groupId} AND ended_at IS NULL FOR SHARE`)
  expect(rows).toHaveLength(1)
  return writer
}

async function writerInsertAndCommit(
  writer: Awaited<ReturnType<typeof openTx>>,
  groupId: string,
  paidBy: string,
): Promise<string> {
  const [row] = await writer.run((t) => t`
    INSERT INTO "CashTransactions" (group_id, paid_by, amount, split_type, description, category, transacted_at)
    VALUES (${groupId}, ${paidBy}, 100, 'half', 'TEST_1290_S0', 'food', now())
    RETURNING id`)
  await writer.commit()
  return row.id as string
}

/** created_at of the writer's row < the given timestamp column, compared in SQL (µs). */
async function writerRowBefore(cashId: string, boundaryText: string): Promise<boolean> {
  const [r] = await monitor`
    SELECT created_at < ${boundaryText}::timestamptz AS before
    FROM "CashTransactions" WHERE id = ${cashId}`
  return r.before as boolean
}

/**
 * Drive one closer through the forced interleaving and return the settled
 * outcomes. `groupId` is the group whose chapter the closer ends.
 */
async function interleave<T>(groupId: string, writerPaidBy: string, startCloser: () => Promise<T>) {
  // 1. Something else holds the group row FOR SHARE, so the closer's first lock waits.
  const holder = await openTx(holderConn)
  await holder.run((t) => t`SELECT id FROM "OikosGroups" WHERE id = ${groupId} FOR SHARE`)

  // 2. The closer starts (its transaction begins) and waits on the group row.
  const closer = startCloser()
  closer.catch(() => {})
  await waitBlockedBy(holder.pid)

  // 3. The writer begins after the closer and takes the open chapter row FOR SHARE.
  const writer = await startWriter(groupId)

  // 4. Release the group row; the closer moves on and waits on the writer.
  await holder.commit()
  await waitBlockedBy(writer.pid)

  // 5. The writer inserts a money row for the group (FK → group KEY SHARE) and commits.
  const writerResult = writerInsertAndCommit(writer, groupId, writerPaidBy)

  const [c, w] = await Promise.allSettled([closer, writerResult])
  return { closer: c, writer: w }
}

// ─── tests ────────────────────────────────────────────────────────────────

describe.skipIf(!isLocalDb)('chapter closers: lock order and DB-clock boundary (#1290)', () => {
  it('leaveGroup: no 40P01 against a writer holding the chapter row, and the writer\'s row stays in the old chapter', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await group(a, b)
    const invite = await seedInvite(g, a)

    const out = await interleave(g, a, () => as(b, () => leaveGroup()))
    expect({ closer: describeSettled(out.closer), writer: describeSettled(out.writer) })
      .toMatchObject({ closer: { ok: true }, writer: expect.any(String) })

    const cashId = (out.writer as PromiseFulfilledResult<string>).value
    const res = (out.closer as PromiseFulfilledResult<{ ok: true; data: { groupId: string; epochId: string } }>).value
    const newGroupId = res.data.groupId
    created.groups.push(newGroupId)

    // One boundary everywhere, to the microsecond.
    const [r] = await monitor`
      SELECT
        (SELECT ended_at::text FROM "GroupEpochs" WHERE group_id = ${g} AND ended_at IS NOT NULL) AS old_ended,
        (SELECT started_at::text FROM "GroupEpochs" WHERE group_id = ${g} AND ended_at IS NULL) AS stay_started,
        (SELECT current_epoch_started_at::text FROM "OikosGroups" WHERE id = ${g}) AS old_group_cur,
        (SELECT current_epoch_started_at::text FROM "OikosGroups" WHERE id = ${newGroupId}) AS new_group_cur,
        (SELECT started_at::text FROM "GroupEpochs" WHERE group_id = ${newGroupId} AND ended_at IS NULL) AS new_started,
        (SELECT revoked_at::text FROM "GroupInvites" WHERE id = ${invite.id}) AS revoked`
    expect(new Set([r.old_ended, r.stay_started, r.old_group_cur, r.new_group_cur, r.new_started, r.revoked]).size).toBe(1)
    expect(r.old_ended).not.toBeNull()
    expect(await writerRowBefore(cashId, r.stay_started as string)).toBe(true)
  })

  it('removePartner: no 40P01 against a writer holding the chapter row, and the writer\'s row stays in the old chapter', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await group(a, b)
    const invite = await seedInvite(g, a)

    const out = await interleave(g, a, () => as(a, () => removePartner()))
    expect({ closer: describeSettled(out.closer), writer: describeSettled(out.writer) })
      .toMatchObject({ closer: { ok: true }, writer: expect.any(String) })
    const cashId = (out.writer as PromiseFulfilledResult<string>).value

    const [r] = await monitor`
      SELECT
        (SELECT ended_at::text FROM "GroupEpochs" WHERE group_id = ${g} AND ended_at IS NOT NULL) AS old_ended,
        (SELECT started_at::text FROM "GroupEpochs" WHERE group_id = ${g} AND ended_at IS NULL) AS new_started,
        (SELECT current_epoch_started_at::text FROM "OikosGroups" WHERE id = ${g}) AS group_cur,
        (SELECT revoked_at::text FROM "GroupInvites" WHERE id = ${invite.id}) AS revoked`
    expect(new Set([r.old_ended, r.new_started, r.group_cur, r.revoked]).size).toBe(1)
    expect(r.old_ended).not.toBeNull()
    expect(await writerRowBefore(cashId, r.new_started as string)).toBe(true)
  })

  it('acceptInvite: no 40P01 against a writer holding the chapter row, and the writer\'s row stays in the old chapter', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const joinerSolo = await group(joiner, null)
    const invite = await seedInvite(g, inviter)

    const out = await interleave(g, inviter, () => as(joiner, () => acceptInvite(invite.token)))
    expect({ closer: describeSettled(out.closer), writer: describeSettled(out.writer) })
      .toMatchObject({ closer: { ok: true, data: g }, writer: expect.any(String) })
    const cashId = (out.writer as PromiseFulfilledResult<string>).value

    const [r] = await monitor`
      SELECT
        (SELECT ended_at::text FROM "GroupEpochs" WHERE group_id = ${g} AND ended_at IS NOT NULL) AS old_ended,
        (SELECT started_at::text FROM "GroupEpochs" WHERE group_id = ${g} AND ended_at IS NULL) AS new_started,
        (SELECT current_epoch_started_at::text FROM "OikosGroups" WHERE id = ${g}) AS group_cur,
        (SELECT accepted_at::text FROM "GroupInvites" WHERE id = ${invite.id}) AS accepted,
        (SELECT ended_at::text FROM "GroupEpochs" WHERE group_id = ${joinerSolo}) AS solo_ended`
    expect(new Set([r.old_ended, r.new_started, r.group_cur, r.accepted, r.solo_ended]).size).toBe(1)
    expect(r.old_ended).not.toBeNull()
    expect(await writerRowBefore(cashId, r.new_started as string)).toBe(true)
  })

  it('two accepts in opposite roles on the same two groups: one joins, the other gets a domain error, no 40P01', async () => {
    const x = await person('x')
    const y = await person('y')
    const gx = await group(x, null)
    const gy = await group(y, null)
    const inviteX = await seedInvite(gx, x) // Y would accept this one
    const inviteY = await seedInvite(gy, y) // X would accept this one

    // Hold both group rows so both accepts pass validation and queue up.
    const holder = await openTx(holderConn)
    await holder.run((t) => t`SELECT id FROM "OikosGroups" WHERE id IN (${gx}, ${gy}) FOR SHARE`)
    const xAccepts = as(x, () => acceptInvite(inviteY.token))
    const yAccepts = as(y, () => acceptInvite(inviteX.token))
    xAccepts.catch(() => {})
    yAccepts.catch(() => {})
    // The first waits on the holder, the second queues behind the first.
    await waitLockWaiters(2)
    await holder.commit()

    const settled = (await Promise.allSettled([xAccepts, yAccepts])).map(describeSettled)
    expect(settled.every((s) => typeof s === 'object' && s !== null && 'ok' in s)).toBe(true) // nothing threw (no 40P01)
    const oks = settled.filter((s) => (s as { ok: boolean }).ok)
    expect(oks).toHaveLength(1)
    const failure = settled.find((s) => !(s as { ok: boolean }).ok) as { ok: false; code: string }
    expect(failure.code).toBe('already_in_duo')

    // One of the two groups is paired.
    const duos = await db.select().from(oikosGroups).where(inArray(oikosGroups.id, [gx, gy]))
    expect(duos.filter((d) => d.memberB !== null)).toHaveLength(1)
    // Exactly one open chapter per person.
    for (const p of [x, y]) {
      const open = await monitor`
        SELECT count(*)::int AS n FROM "GroupEpochs"
        WHERE ended_at IS NULL AND (member_a_id = ${p} OR member_b_id = ${p})`
      expect(open[0].n).toBe(1)
    }
  })
})

describe.skipIf(!isLocalDb)('chapter closers: the boundary is read after a writer that held the chapter row (#1290)', () => {
  // Same interleaving without the money-row insert, so there is no FK lock and
  // no deadlock on any version: this isolates the clock. The writer's `now()`
  // is the `created_at` any row it wrote would carry.
  async function writerNowVsBoundary<T>(groupId: string, startCloser: () => Promise<T>) {
    const holder = await openTx(holderConn)
    await holder.run((t) => t`SELECT id FROM "OikosGroups" WHERE id = ${groupId} FOR SHARE`)
    const closer = startCloser()
    closer.catch(() => {})
    await waitBlockedBy(holder.pid)

    const writer = await startWriter(groupId)
    const [{ now }] = await writer.run((t) => t`SELECT now()::text AS now`)
    await holder.commit()
    await waitBlockedBy(writer.pid)
    await writer.commit()

    const res = await closer
    const [r] = await monitor`
      SELECT ${now as string}::timestamptz < started_at AS before, started_at::text AS started
      FROM "GroupEpochs" WHERE group_id = ${groupId} AND ended_at IS NULL`
    return { res, before: r.before as boolean }
  }

  it('leaveGroup', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await group(a, b)
    const { res, before } = await writerNowVsBoundary(g, () => as(b, () => leaveGroup()))
    expect(res).toMatchObject({ ok: true })
    expect(before).toBe(true)
  })

  it('removePartner', async () => {
    const a = await person('a')
    const b = await person('b')
    const g = await group(a, b)
    const { res, before } = await writerNowVsBoundary(g, () => as(a, () => removePartner()))
    expect(res).toMatchObject({ ok: true })
    expect(before).toBe(true)
  })

  it('acceptInvite', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const invite = await seedInvite(g, inviter)
    const { res, before } = await writerNowVsBoundary(g, () => as(joiner, () => acceptInvite(invite.token)))
    expect(res).toMatchObject({ ok: true, data: g })
    expect(before).toBe(true)
  })
})

describe.skipIf(!isLocalDb)('acceptInvite re-checks membership under the lock (#1290)', () => {
  it('accepting retires the accepter\'s other open links', async () => {
    const x = await person('x')
    const z = await person('z')
    const w = await person('w')
    const gx = await group(x, null)
    const gz = await group(z, null)
    const xLink = await seedInvite(gx, x)
    const zLink = await seedInvite(gz, z)

    expect(await as(x, () => acceptInvite(zLink.token))).toEqual({ ok: true, data: gz })

    // The retired link reads as revoked.
    const res = await as(w, () => acceptInvite(xLink.token))
    expect(res).toMatchObject({ ok: false, code: 'revoked' })
    const [row] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, gx))
    expect(row.memberB).toBeNull()
  })

  it('accept re-reads the issuer\'s membership under the lock', async () => {
    // Defensive: the issuer's membership is re-read under the lock.
    const x = await person('x')
    const z = await person('z')
    const w = await person('w')
    const gx = await group(x, null)
    await group(z, x)
    const xLink = await seedInvite(gx, x)

    const res = await as(w, () => acceptInvite(xLink.token))
    expect(res).toMatchObject({ ok: false, code: 'inviter_not_member' })
    const [row] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, gx))
    expect(row.memberB).toBeNull()
    const [inv] = await db.select().from(groupInvites).where(eq(groupInvites.id, xLink.id))
    expect(inv.acceptedAt).toBeNull()
  })
})

describe.skipIf(!isLocalDb)('negative control: the same interleaving in raw SQL (#1290)', () => {
  async function rawCloser(groupId: string, groupLock: 'FOR UPDATE' | 'FOR NO KEY UPDATE', paidBy: string) {
    const closer = await openTx(closerConn)
    await closer.run((t) => t.unsafe(`SELECT id FROM "OikosGroups" WHERE id = $1 ${groupLock}`, [groupId]))
    const writer = await startWriter(groupId)
    const epochLock = closer.run((t) => t`
      SELECT id FROM "GroupEpochs" WHERE group_id = ${groupId} AND ended_at IS NULL FOR NO KEY UPDATE`)
    epochLock.catch(() => {})
    await waitBlockedBy(writer.pid)
    const writerResult = writerInsertAndCommit(writer, groupId, paidBy)
    const settledWriter = await Promise.allSettled([writerResult])
    const settledEpoch = await Promise.allSettled([epochLock])
    await closer.commit().catch(() => {})
    return [...settledWriter, ...settledEpoch].map((s) => (s.status === 'rejected' ? sqlstate(s.reason) : 'ok'))
  }

  it('group FOR UPDATE, then the chapter row: the writer\'s FK check closes a cycle → 40P01', async () => {
    const a = await person('a')
    const g = await group(a, null)
    expect(await rawCloser(g, 'FOR UPDATE', a)).toContain('40P01')
  })

  it('group FOR NO KEY UPDATE, then the chapter row: no cycle', async () => {
    const a = await person('a')
    const g = await group(a, null)
    expect(await rawCloser(g, 'FOR NO KEY UPDATE', a)).toEqual(['ok', 'ok'])
  })
})
