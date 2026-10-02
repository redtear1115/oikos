import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { seedAuthUsers, deleteAuthUsers } from './_authUser'

// ─── #1432 — acceptInvite vs the same user's createGroup (two tabs) ───────
//
// acceptInvite ends the accepter's other open solo chapters. It used to find
// those ledgers once, before taking any lock; a createGroup by the same user
// that committed after that read left its new solo ledger's chapter open next
// to the new duo chapter. Nothing errored: the person simply had two open
// chapters, and a later leave / account deletion computed boundaries from the
// wrong one.
//
// The fix: both actions take the accepter's Profiles row FOR NO KEY UPDATE
// (acceptInvite after its group / chapter locks, createGroup first), and
// acceptInvite re-reads the solo ledgers under that lock. A ledger that
// appeared in between makes the accept start over, so it is found and locked
// in id order on the next pass.
//
// Interleavings are forced with a holder connection and pg_blocking_pids
// polling — no sleeps. Local throwaway database only:
//   docker run -d --name pg-1432 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55660:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55660/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55660/postgres npx vitest run __tests__/actions/acceptInvite.createGroupRace.test.ts
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
const { createGroup } = await import('@/actions/group')
const { generateToken, INVITE_TTL_MS } = await import('@/lib/invite')
const { inArray, or } = await import('drizzle-orm')
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
    await db.delete(cashTransactions).where(inArray(cashTransactions.groupId, groupIds))
    await db.delete(groupInvites).where(inArray(groupInvites.groupId, groupIds))
    await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, groupIds))
    await db.delete(groupBalance).where(inArray(groupBalance.groupId, groupIds))
    await db.delete(oikosGroups).where(inArray(oikosGroups.id, groupIds))
  }
  if (created.profiles.length) {
    await deleteAuthUsers(created.profiles)
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
  await db.insert(profiles).values({ id, displayName: `TEST_1432_${label}` })
  await seedAuthUsers([{ id, displayName: `TEST_1432_${label}` }])
  created.profiles.push(id)
  return id
}

async function group(memberA: string, memberB: string | null): Promise<string> {
  const startedAt = longAgo()
  const [g] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1432_group', memberA, memberB, currentEpochStartedAt: startedAt })
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


/** Open chapters (GroupEpochs with ended_at NULL) that include `userId`. */
async function openChapters(userId: string) {
  return monitor`
    SELECT group_id, member_b_id FROM "GroupEpochs"
    WHERE ended_at IS NULL AND (member_a_id = ${userId} OR member_b_id = ${userId})`
}

describe.skipIf(!isLocalDb)('acceptInvite vs createGroup by the same user (#1432)', () => {
  it('createGroup commits while the accept waits for its locks: the new solo chapter is closed too', { timeout: 20_000 }, async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner') // no ledger yet
    const g = await group(inviter, null)
    const invite = await seedInvite(g, inviter)

    // Hold the invite's group row so the accept reads "no other solo ledger",
    // then waits on its first lock.
    const holder = await openTx(holderConn)
    await holder.run((t) => t`SELECT id FROM "OikosGroups" WHERE id = ${g} FOR SHARE`)
    const accept = as(joiner, () => acceptInvite(invite.token))
    accept.catch(() => {})
    let soloId: string
    try {
      await waitBlockedBy(holder.pid)

      // Second tab: the same person creates their own ledger, and it commits.
      const created1 = await as(joiner, () => createGroup('TEST_1432_second_tab'))
      expect(created1).toMatchObject({ ok: true })
      soloId = (created1 as { ok: true; data: { id: string } }).data.id
      created.groups.push(soloId)
      expect(soloId).not.toBe(g)
    } finally {
      await holder.commit()
    }
    expect(await accept).toEqual({ ok: true, data: g })

    // Exactly one open chapter: the duo one.
    const open = await openChapters(joiner)
    expect(open.map((r) => r.group_id)).toEqual([g])
    expect(open[0].member_b_id).toBe(joiner)

    // The solo ledger's chapter ended at the accept's boundary.
    const [r] = await monitor`
      SELECT
        (SELECT ended_at::text FROM "GroupEpochs" WHERE group_id = ${soloId}) AS solo_ended,
        (SELECT started_at::text FROM "GroupEpochs" WHERE group_id = ${g} AND ended_at IS NULL) AS duo_started`
    expect(r.solo_ended).not.toBeNull()
    expect(r.solo_ended).toBe(r.duo_started)
  })

  it('createGroup arriving while the accept holds the profile lock waits, then returns the duo ledger', { timeout: 20_000 }, async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const invite = await seedInvite(g, inviter)

    // Hold the invite row: the accept takes all its locks (groups, chapters,
    // the accepter's profile) and then waits on its claim of this row.
    const holder = await openTx(holderConn)
    await holder.run((t) => t`SELECT id FROM "GroupInvites" WHERE id = ${invite.id} FOR UPDATE`)
    const accept = as(joiner, () => acceptInvite(invite.token))
    accept.catch(() => {})
    let create: ReturnType<typeof createGroup> | undefined
    try {
      const [acceptPid] = await waitBlockedBy(holder.pid)

      // Second tab: createGroup queues behind the accept on the profile row.
      create = as(joiner, () => createGroup('TEST_1432_second_tab'))
      create.catch(() => {})
      await waitBlockedBy(acceptPid)
    } finally {
      await holder.commit()
    }
    expect(await accept).toEqual({ ok: true, data: g })
    // Idempotent return (#911): the ledger the person is now in, no new one.
    expect(await create!).toMatchObject({ ok: true, data: { id: g } })

    const open = await openChapters(joiner)
    expect(open.map((r) => r.group_id)).toEqual([g])
    const owned = await monitor`SELECT id FROM "OikosGroups" WHERE member_a = ${joiner}`
    for (const o of owned) created.groups.push(o.id as string)
    expect(owned).toHaveLength(0)
  })

  it('two createGroup calls by the same user: one ledger', { timeout: 20_000 }, async () => {
    const joiner = await person('joiner')

    // Hold the profile row so both calls pass the unlocked idempotency check
    // and queue on the lock.
    const holder = await openTx(holderConn)
    await holder.run((t) => t`SELECT id FROM "Profiles" WHERE id = ${joiner} FOR NO KEY UPDATE`)
    const c1 = as(joiner, () => createGroup('TEST_1432_tab1'))
    const c2 = as(joiner, () => createGroup('TEST_1432_tab2'))
    c1.catch(() => {})
    c2.catch(() => {})
    try {
      await waitLockWaiters(2)
    } finally {
      await holder.commit()
    }

    const [r1, r2] = await Promise.all([c1, c2])
    expect(r1).toMatchObject({ ok: true })
    expect(r2).toMatchObject({ ok: true })
    const id1 = (r1 as { ok: true; data: { id: string } }).data.id
    const id2 = (r2 as { ok: true; data: { id: string } }).data.id
    created.groups.push(id1)
    expect(id2).toBe(id1)
    const owned = await monitor`SELECT id FROM "OikosGroups" WHERE member_a = ${joiner}`
    for (const o of owned) created.groups.push(o.id as string)
    expect(owned).toHaveLength(1)
    expect(await openChapters(joiner)).toHaveLength(1)
  })
})
