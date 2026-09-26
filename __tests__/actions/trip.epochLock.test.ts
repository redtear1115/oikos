import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1290 — trip writes against a chapter close ──────────────────────────
//
// endTrip, updateTrip, softDeleteTrip and the trip-expense writes take the
// group's open chapter row (GroupEpochs) FOR SHARE after the trip row, and
// fail closed when that row is gone or is not the trip's chapter. A closer
// (here acceptInvite) takes the same row FOR NO KEY UPDATE and reads its
// boundary afterwards, so the two serialize:
//
// - trip write first: it commits before the closer reads its boundary, so the
//   summary rows it wrote are in the old chapter;
// - closer first: the trip write waits, then finds the chapter closed and is
//   refused. Without the lock it commits after the boundary, and its summary
//   rows show up in the next chapter — nothing errors.
//
// acceptInvite also refuses while the accepter has an active trip in a
// ledger whose chapter the join would end, checked under the closer's locks.
//
// The interleavings are forced with extra connections and pg_stat_activity /
// pg_blocking_pids polling — no sleeps.
//
// Local throwaway database only; refuses to run against anything that is not
// localhost. See the PR for the exact commands:
//   docker run -d --name pg-1290s2b -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55540:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55540/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55540/postgres npx vitest run __tests__/actions/trip.epochLock.test.ts
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
  profiles, oikosGroups, groupBalance, groupEpochs, groupInvites, cashTransactions, trips, tripExpenses,
} = await import('@/lib/db/schema')
const { acceptInvite } = await import('@/actions/invite')
const { endTrip, updateTrip, softDeleteTrip } = await import('@/actions/trip')
const { createTripExpense, editTripExpense, softDeleteTripExpense } = await import('@/actions/tripExpense')
const { generateToken, INVITE_TTL_MS } = await import('@/lib/invite')
const { eq, inArray, or, and, isNull } = await import('drizzle-orm')
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

// holder runs one scripted transaction; monitor polls pg_stat_activity from
// outside any transaction (its view is frozen inside one).
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
    const tripRows = await db.select({ id: trips.id }).from(trips).where(inArray(trips.groupId, groupIds))
    if (tripRows.length) {
      const tripIds = tripRows.map((t) => t.id)
      await db.delete(tripExpenses).where(inArray(tripExpenses.tripId, tripIds))
      await db.delete(trips).where(inArray(trips.id, tripIds))
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
const longAgo = () => new Date(Date.now() - 48 * HOUR)
const today = () => new Date().toISOString().slice(0, 10)

async function person(label: string): Promise<string> {
  const id = randomUUID()
  await db.insert(profiles).values({ id, displayName: `TEST_1290_S2B_${label}` })
  created.profiles.push(id)
  return id
}

async function group(memberA: string, memberB: string | null): Promise<{ id: string; epochId: string }> {
  const startedAt = longAgo()
  const [g] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1290_S2B_group', memberA, memberB, currentEpochStartedAt: startedAt })
    .returning({ id: oikosGroups.id })
  created.groups.push(g.id)
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  const [e] = await db.insert(groupEpochs)
    .values({ groupId: g.id, startedAt, memberAId: memberA, memberBId: memberB })
    .returning({ id: groupEpochs.id })
  return { id: g.id, epochId: e.id }
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

/** An active trip with one expense, in the group's open chapter. */
async function seedTrip(
  g: { id: string; epochId: string },
  paidBy: string,
  status: 'active' | 'ended' = 'active',
  deleted = false,
) {
  const [t] = await db.insert(trips).values({
    groupId: g.id,
    epochId: g.epochId,
    name: 'TEST_1290_S2B_trip',
    startDate: longAgo().toISOString().slice(0, 10),
    defaultCurrency: 'TWD',
    status,
    endedAt: status === 'ended' ? new Date() : null,
    deletedAt: deleted ? new Date() : null,
    rateSnapshot: { default: 'TWD', entries: [{ code: 'TWD', label: null, rate: 1 }] },
  }).returning({ id: trips.id })
  const [x] = await db.insert(tripExpenses).values({
    tripId: t.id,
    paidBy,
    amount: 1200,
    category: 'food',
    splitType: 'all_mine',
  }).returning({ id: tripExpenses.id })
  return { tripId: t.id, expenseId: x.id }
}

// ─── scripted transactions ────────────────────────────────────────────────

type Step = { fn: (t: Sql) => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }

/** One transaction on `conn`, driven statement by statement. */
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

/** Resolve once `n` backends are blocked (directly) by `blockerPid`. */
async function waitBlockedBy(blockerPid: number, n = 1): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const rows = await monitor`
      SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND ${blockerPid} = ANY(pg_blocking_pids(pid))`
    if (rows.length >= n) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`timed out waiting for ${n} backend(s) blocked by ${blockerPid}`)
}

/**
 * Resolve once `n` backends of this database wait on a heavyweight lock, or
 * once `settled` resolves (the action under test did not wait at all).
 * Returns which of the two happened.
 */
async function waitLockWaitersOr(n: number, settled: Promise<unknown>): Promise<'waiting' | 'settled'> {
  let isSettled = false
  settled.then(() => { isSettled = true }, () => { isSettled = true })
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (isSettled) return 'settled'
    const [r] = await monitor`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`
    if ((r.n as number) >= n) return 'waiting'
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`timed out waiting for ${n} lock waiter(s)`)
}

/** Summary rows of a trip and whether each is before the group's open chapter start (µs, in SQL). */
async function summariesVsOpenChapter(groupId: string, tripId: string) {
  return await monitor`
    SELECT c.created_at < e.started_at AS before_open_chapter
    FROM "CashTransactions" c
    JOIN "GroupEpochs" e ON e.group_id = c.group_id AND e.ended_at IS NULL
    WHERE c.group_id = ${groupId} AND c.trip_id = ${tripId}`
}

/**
 * acceptInvite, paused after it holds the chapter locks and read its boundary:
 * something else holds the invite row, so its claim (the UPDATE right after
 * the locks) waits. `release` lets it finish.
 */
async function acceptPausedAfterLocks(joiner: string, invite: { id: string; token: string }) {
  const holder = await openTx(holderConn)
  await holder.run((t) => t`SELECT id FROM "GroupInvites" WHERE id = ${invite.id} FOR SHARE`)
  const accept = as(joiner, () => acceptInvite(invite.token))
  accept.catch(() => {})
  await waitBlockedBy(holder.pid)
  return { accept, release: () => holder.commit() }
}

// ─── tests ────────────────────────────────────────────────────────────────

describe.skipIf(!isLocalDb)('endTrip vs a chapter close (#1290)', () => {
  it('endTrip holds the chapter row, accept waits: the summary rows stay in the old chapter', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const { tripId } = await seedTrip(g, inviter)
    const invite = await seedInvite(g.id, inviter)

    // Pause endTrip after its summary insert: something else holds the
    // group's balance row, which endTrip updates last.
    const holder = await openTx(holderConn)
    await holder.run((t) => t`SELECT group_id FROM "GroupBalance" WHERE group_id = ${g.id} FOR UPDATE`)
    const ending = as(inviter, () => endTrip({ tripId, endDate: today() }))
    ending.catch(() => {})
    await waitBlockedBy(holder.pid)

    // accept starts while endTrip is open; with the lock it queues behind endTrip.
    const accept = as(joiner, () => acceptInvite(invite.token))
    accept.catch(() => {})
    await waitLockWaitersOr(2, accept)
    await holder.commit()

    expect(await ending).toMatchObject({ ok: true })
    expect(await accept).toEqual({ ok: true, data: g.id })
    const rows = await summariesVsOpenChapter(g.id, tripId)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.before_open_chapter === true)).toBe(true)
  })

  it('accept holds the chapter row, endTrip waits: endTrip is refused and writes nothing', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const { tripId } = await seedTrip(g, inviter)
    const invite = await seedInvite(g.id, inviter)

    const { accept, release } = await acceptPausedAfterLocks(joiner, invite)

    // endTrip begins after accept read its boundary.
    const ending = as(inviter, () => endTrip({ tripId, endDate: today() }))
    ending.catch(() => {})
    await waitLockWaitersOr(2, ending)
    await release()

    expect(await accept).toEqual({ ok: true, data: g.id })
    const res = await ending
    // Never a summary in the new chapter.
    const rows = await summariesVsOpenChapter(g.id, tripId)
    expect(rows.filter((r) => r.before_open_chapter !== true)).toEqual([])
    expect(res).toEqual({ ok: false, code: 'active_trip_not_found' })
    expect(rows).toHaveLength(0)
    const [trip] = await db.select({ status: trips.status }).from(trips).where(eq(trips.id, tripId))
    expect(trip.status).toBe('active')
  })
})

describe.skipIf(!isLocalDb)('trip edits vs a chapter close (#1290)', () => {
  async function setup() {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const seeded = await seedTrip(g, inviter)
    const invite = await seedInvite(g.id, inviter)
    return { inviter, joiner, g, invite, ...seeded }
  }

  /** Run `write` after accept holds the chapter row; release; return its result. */
  async function raceAfterAccept<T>(
    s: Awaited<ReturnType<typeof setup>>,
    write: () => Promise<T>,
  ): Promise<T> {
    const { accept, release } = await acceptPausedAfterLocks(s.joiner, s.invite)
    const w = as(s.inviter, write)
    w.catch(() => {})
    await waitLockWaitersOr(2, w)
    await release()
    expect(await accept).toEqual({ ok: true, data: s.g.id })
    return await w
  }

  it('updateTrip is refused and the trip is unchanged', async () => {
    const s = await setup()
    const res = await raceAfterAccept(s, () => updateTrip({ tripId: s.tripId, name: 'renamed' }))
    expect(res).toEqual({ ok: false, code: 'trip_not_found' })
    const [trip] = await db.select({ name: trips.name }).from(trips).where(eq(trips.id, s.tripId))
    expect(trip.name).toBe('TEST_1290_S2B_trip')
  })

  it('softDeleteTrip is refused and the trip is not deleted', async () => {
    const s = await setup()
    const res = await raceAfterAccept(s, () => softDeleteTrip({ tripId: s.tripId }))
    expect(res).toEqual({ ok: false, code: 'trip_not_found' })
    const [trip] = await db.select({ deletedAt: trips.deletedAt }).from(trips).where(eq(trips.id, s.tripId))
    expect(trip.deletedAt).toBeNull()
  })

  it('createTripExpense is refused and adds no row', async () => {
    const s = await setup()
    const res = await raceAfterAccept(s, () => createTripExpense({
      tripId: s.tripId, paidBy: s.inviter, amount: 300, category: 'food', splitType: 'all_mine',
    }))
    expect(res).toEqual({ ok: false, code: 'trip_not_found' })
    const rows = await db.select().from(tripExpenses).where(eq(tripExpenses.tripId, s.tripId))
    expect(rows).toHaveLength(1)
  })

  it('editTripExpense is refused and the expense is unchanged', async () => {
    const s = await setup()
    const res = await raceAfterAccept(s, () => editTripExpense({
      id: s.expenseId, tripId: s.tripId, paidBy: s.inviter, amount: 999, category: 'food', splitType: 'all_mine',
    }))
    expect(res).toEqual({ ok: false, code: 'trip_not_found' })
    const rows = await db.select().from(tripExpenses)
      .where(and(eq(tripExpenses.tripId, s.tripId), isNull(tripExpenses.deletedAt)))
    expect(rows.map((r) => [r.id, r.amount])).toEqual([[s.expenseId, 1200]])
  })

  it('softDeleteTripExpense is refused and the expense stays', async () => {
    const s = await setup()
    const res = await raceAfterAccept(s, () => softDeleteTripExpense({ id: s.expenseId, tripId: s.tripId }))
    expect(res).toEqual({ ok: false, code: 'trip_not_found' })
    const [row] = await db.select().from(tripExpenses).where(eq(tripExpenses.id, s.expenseId))
    expect(row.deletedAt).toBeNull()
  })

  it('positive control: with no close in flight, the same writes go through', async () => {
    const s = await setup()
    await as(s.inviter, async () => {
      expect(await createTripExpense({
        tripId: s.tripId, paidBy: s.inviter, amount: 300, category: 'food', splitType: 'all_mine',
      })).toMatchObject({ ok: true })
      expect(await editTripExpense({
        id: s.expenseId, tripId: s.tripId, paidBy: s.inviter, amount: 999, category: 'food', splitType: 'all_mine',
      })).toMatchObject({ ok: true })
      expect(await updateTrip({ tripId: s.tripId, name: 'renamed' })).toMatchObject({ ok: true })
      expect(await endTrip({ tripId: s.tripId, endDate: today() })).toMatchObject({ ok: true })
    })
    const rows = await summariesVsOpenChapter(s.g.id, s.tripId)
    expect(rows.length).toBeGreaterThan(0)
  })
})

describe.skipIf(!isLocalDb)('acceptInvite refuses while the accepter has an active trip (#1290)', () => {
  it('an active trip in the accepter\'s own ledger: refused, nothing changes', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const solo = await group(joiner, null)
    await seedTrip(solo, joiner)
    const invite = await seedInvite(g.id, inviter)

    expect(await as(joiner, () => acceptInvite(invite.token)))
      .toEqual({ ok: false, code: 'accept_active_trip' })

    const [grp] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, g.id))
    expect(grp.memberB).toBeNull()
    const [inv] = await db.select().from(groupInvites).where(eq(groupInvites.id, invite.id))
    expect(inv.acceptedAt).toBeNull()
    const open = await db.select().from(groupEpochs)
      .where(and(eq(groupEpochs.groupId, solo.id), isNull(groupEpochs.endedAt)))
    expect(open.map((e) => e.id)).toEqual([solo.epochId])
  })

  it('checked under the locks: a trip that starts while accept waits for them still refuses it', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const solo = await group(joiner, null)
    const invite = await seedInvite(g.id, inviter)

    // Hold the accepter's own ledger row: accept passes its checks and waits
    // on its first lock.
    const holder = await openTx(holderConn)
    await holder.run((t) => t`SELECT id FROM "OikosGroups" WHERE id = ${solo.id} FOR SHARE`)
    const accept = as(joiner, () => acceptInvite(invite.token))
    accept.catch(() => {})
    await waitBlockedBy(holder.pid)

    // A trip starts in the accepter's ledger meanwhile.
    await seedTrip(solo, joiner)
    await holder.commit()

    expect(await accept).toEqual({ ok: false, code: 'accept_active_trip' })
    const [grp] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, g.id))
    expect(grp.memberB).toBeNull()
  })

  it('ended or deleted trips do not block the join', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const solo = await group(joiner, null)
    await seedTrip(solo, joiner, 'ended')
    await seedTrip(solo, joiner, 'active', true)
    const invite = await seedInvite(g.id, inviter)

    expect(await as(joiner, () => acceptInvite(invite.token))).toEqual({ ok: true, data: g.id })
  })

  it('an active trip in a past chapter of the accepter\'s ledger does not block the join', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const solo = await group(joiner, null)
    await seedTrip(solo, joiner)
    // That chapter closed; a new one is open.
    await db.update(groupEpochs).set({ endedAt: new Date(Date.now() - HOUR) }).where(eq(groupEpochs.id, solo.epochId))
    await db.insert(groupEpochs).values({
      groupId: solo.id, startedAt: new Date(Date.now() - HOUR), memberAId: joiner, memberBId: null,
    })
    const invite = await seedInvite(g.id, inviter)

    expect(await as(joiner, () => acceptInvite(invite.token))).toEqual({ ok: true, data: g.id })
  })
})
