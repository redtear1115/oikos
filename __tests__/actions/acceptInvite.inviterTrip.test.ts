import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { seedAuthUsers, deleteAuthUsers } from './_authUser'

// ─── #1438 — accepting an invite ends the INVITER's active trip ───────────
//
// The inviter's solo chapter closes when the partner accepts. A trip still
// active in that chapter used to be left there: "end trip" then answered
// `active_trip_not_found`, new trip expenses `trip_not_found`, and the trip's
// spending never reached the ledger — with nothing in any log.
//
// Decision (b): acceptInvite ends that trip in the same transaction, as if the
// inviter had pressed "end trip" just before inviting. The summary rows are
// written with `created_at` = boundary − 1µs, so they are in the solo chapter
// being closed by construction; the balance is recalculated before the close.
// The accepter-side refusal (`accept_active_trip`, #1436 D6) is unchanged.
//
// Lock order. Trip writers (endTrip, updateTrip, softDeleteTrip, trip-expense
// writes) take the trip row, then the open chapter row FOR SHARE. acceptInvite
// takes groups → chapter rows → accepter profile → boundary, and only then
// the trip rows — the reverse order. It takes them NOWAIT: once accept holds
// the chapter row, anyone holding a trip row of that chapter is a writer
// waiting (or about to wait) for that chapter row, so waiting for it would be
// a guaranteed deadlock (40P01). Instead accept rolls back, the writer goes
// first, and accept runs again and sees the writer's result.
//
// Each interleaving is tested in both orders: the writer holding its locks
// before accept starts, accept holding everything (trip rows included) before
// the writer starts, and the reverse-order case — accept holding the chapter
// row but not yet the trip row while the writer holds the trip row.
//
// Local throwaway database only; refuses to run against anything that is not
// localhost:
//   docker run -d --name pg-1438 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55830:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55830/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55830/postgres npx vitest run __tests__/actions/acceptInvite.inviterTrip.test.ts
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

const captured: Array<{ distinctId: string; event: string; props: Record<string, unknown> }> = []
vi.mock('@/lib/analytics/server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/analytics/server')>('@/lib/analytics/server')
  return {
    ...actual,
    captureServer: async (distinctId: string, event: string, props: Record<string, unknown> = {}) => {
      captured.push({ distinctId, event, props })
    },
  }
})

const { db } = await import('@/lib/db/client')
const {
  profiles, oikosGroups, groupBalance, groupEpochs, groupInvites, cashTransactions, trips, tripExpenses,
} = await import('@/lib/db/schema')
const { acceptInvite } = await import('@/actions/invite')
const { createTrip, endTrip, updateTrip } = await import('@/actions/trip')
const { createTripExpense } = await import('@/actions/tripExpense')
const { unwrapAction } = await import('@/lib/action-errors')
const { generateToken, hashToken, INVITE_TTL_MS } = await import('@/lib/invite')
const { eq, inArray, or, and, isNull } = await import('drizzle-orm')
const postgres = (await import('postgres')).default
type Sql = ReturnType<typeof postgres>
const {
  openTx, waitBlockedBy, waitLockWaiters, waitLockWaitersOr, retryOnClockStep, getClockStepRetryStats,
} = await import('./_lockHarness')

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
  const stats = getClockStepRetryStats()
  console.warn(`[retryOnClockStep] acceptInvite.inviterTrip.test.ts: ${stats.retries} retr${stats.retries === 1 ? 'y' : 'ies'} out of ${stats.attempts} attempt(s)`)
})

const created = { profiles: [] as string[], groups: [] as string[] }

async function cleanup() {
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
    await deleteAuthUsers(created.profiles)
    await db.delete(profiles).where(inArray(profiles.id, created.profiles))
  }
  created.profiles = []
  created.groups = []
  captured.length = 0
}

afterEach(async () => {
  if (!isLocalDb) return
  await cleanup()
})

// ─── fixtures ─────────────────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000
const longAgo = () => new Date(Date.now() - 48 * HOUR)
const today = () => new Date().toISOString().slice(0, 10)

async function person(label: string): Promise<string> {
  const id = randomUUID()
  await db.insert(profiles).values({ id, displayName: `TEST_1438_${label}` })
  await seedAuthUsers([{ id, displayName: `TEST_1438_${label}` }])
  created.profiles.push(id)
  return id
}

async function group(memberA: string, memberB: string | null): Promise<{ id: string; epochId: string }> {
  const startedAt = longAgo()
  const [g] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1438_group', memberA, memberB, currentEpochStartedAt: startedAt })
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
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  }).returning({ id: groupInvites.id })
  return { id: row.id, token }
}

/** A trip in the group's open chapter, with `amounts.length` all_mine expenses by `paidBy`. */
async function seedTrip(
  g: { id: string; epochId: string },
  paidBy: string,
  amounts: number[] = [1200],
  opts: { status?: 'active' | 'ended'; deleted?: boolean; epochId?: string; name?: string } = {},
) {
  const status = opts.status ?? 'active'
  const [t] = await db.insert(trips).values({
    groupId: g.id,
    epochId: opts.epochId ?? g.epochId,
    name: opts.name ?? 'TEST_1438_trip',
    startDate: longAgo().toISOString().slice(0, 10),
    defaultCurrency: 'TWD',
    status,
    endedAt: status === 'ended' ? new Date() : null,
    deletedAt: opts.deleted ? new Date() : null,
    rateSnapshot: { default: 'TWD', entries: [{ code: 'TWD', label: null, rate: 1 }] },
  }).returning({ id: trips.id })
  const expenseIds: string[] = []
  for (const amount of amounts) {
    const [x] = await db.insert(tripExpenses).values({
      tripId: t.id,
      paidBy,
      amount,
      category: 'food',
      splitType: 'all_mine',
    }).returning({ id: tripExpenses.id })
    expenseIds.push(x.id)
  }
  return { tripId: t.id, expenseIds }
}

/** The usual setup: a solo inviter with an active trip, a joiner, a live invite. */
async function soloInviterWithTrip(amounts: number[] = [1200]) {
  const inviter = await person('inviter')
  const joiner = await person('joiner')
  const g = await group(inviter, null)
  const seeded = await seedTrip(g, inviter, amounts)
  const invite = await seedInvite(g.id, inviter)
  return { inviter, joiner, g, invite, ...seeded }
}

/**
 * Summary rows of a trip, each with whether it lies inside the trip's own
 * chapter ([started_at, ended_at)) and before the group's open chapter.
 */
async function summaries(groupId: string, tripId: string) {
  return await monitor`
    SELECT c.amount, c.description, c.paid_by, c.split_type,
           (c.created_at >= te.started_at AND te.ended_at IS NOT NULL AND c.created_at < te.ended_at) AS in_trip_chapter,
           c.created_at < oe.started_at AS before_open_chapter
    FROM "CashTransactions" c
    JOIN "Trips" t ON t.id = c.trip_id
    JOIN "GroupEpochs" te ON te.id = t.epoch_id
    JOIN "GroupEpochs" oe ON oe.group_id = c.group_id AND oe.ended_at IS NULL
    WHERE c.group_id = ${groupId} AND c.trip_id = ${tripId} AND c.deleted_at IS NULL`
}

async function tripRow(tripId: string) {
  const [row] = await monitor`
    SELECT t.status, t.name, t.end_date::text AS end_date, t.epoch_id,
           t.ended_at IS NOT NULL AND t.ended_at < e.ended_at AS ended_before_close
    FROM "Trips" t JOIN "GroupEpochs" e ON e.id = t.epoch_id
    WHERE t.id = ${tripId}`
  return row
}

async function openEpochOf(groupId: string) {
  const [row] = await db.select().from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, groupId), isNull(groupEpochs.endedAt)))
  return row
}

/** Nothing about the trip leaked into the new chapter. */
async function expectNothingInNewChapter(groupId: string) {
  const open = await openEpochOf(groupId)
  const tripsInNew = await db.select({ id: trips.id }).from(trips).where(eq(trips.epochId, open.id))
  expect(tripsInNew).toEqual([])
  const [{ n }] = await monitor`
    SELECT count(*)::int AS n FROM "CashTransactions" c
    JOIN "GroupEpochs" oe ON oe.group_id = c.group_id AND oe.ended_at IS NULL
    WHERE c.group_id = ${groupId} AND c.created_at >= oe.started_at`
  expect(n).toBe(0)
}

function tripEndedEvents() {
  return captured.filter((c) => c.event === 'trip_ended')
}

/**
 * Never a deadlock. A 40P01 is an unexpected error, so the action rejects and
 * the `await` in the test throws; this also catches it if it ever comes back
 * as a code instead.
 */
function expectNoDeadlock(...results: unknown[]) {
  for (const r of results) {
    const code = (r as { ok?: boolean; code?: string })?.code
    expect(code).not.toBe('40P01')
  }
}

// ─── accept paused at two points ──────────────────────────────────────────

/**
 * acceptInvite paused after it holds every lock — groups, chapter rows,
 * profile, boundary and the inviter's trip rows: something else holds the
 * invite row, so its claim waits.
 */
async function acceptPausedAtClaim(joiner: string, invite: { id: string; token: string }) {
  const holder = await openTx(holderConn)
  await holder.run((t) => t`SELECT id FROM "GroupInvites" WHERE id = ${invite.id} FOR SHARE`)
  const accept = as(joiner, () => acceptInvite(invite.token))
  accept.catch(() => {})
  await waitBlockedBy(monitor, holder.pid)
  return { accept, release: () => holder.commit() }
}

/**
 * acceptInvite paused while it holds the group and chapter rows but not yet
 * the trip rows: something else holds the accepter's Profiles row, which
 * lockForEpochClose takes after the chapter rows. A trip writer started now
 * can take the trip row and then wait for the chapter row — the reverse of
 * the order accept takes them in.
 */
async function acceptPausedHoldingChapter(joiner: string, invite: { id: string; token: string }) {
  const holder = await openTx(holderConn)
  await holder.run((t) => t`SELECT id FROM "Profiles" WHERE id = ${joiner} FOR SHARE`)
  const accept = as(joiner, () => acceptInvite(invite.token))
  accept.catch(() => {})
  await waitBlockedBy(monitor, holder.pid)
  return { accept, release: () => holder.commit() }
}

// ─── tests ────────────────────────────────────────────────────────────────

describe.skipIf(!isLocalDb)('acceptInvite ends the inviter\'s active trip (#1438)', () => {
  it('single currency: accept succeeds, the trip is ended and folded into the closing solo chapter', async () => {
    const s = await soloInviterWithTrip([1200, 800])
    const [before] = await db.select().from(groupBalance).where(eq(groupBalance.groupId, s.g.id))

    expect(await as(s.joiner, () => acceptInvite(s.invite.token))).toEqual({ ok: true, data: s.g.id })

    const trip = await tripRow(s.tripId)
    expect(trip.status).toBe('ended')
    expect(trip.epoch_id).toBe(s.g.epochId)
    expect(trip.ended_before_close).toBe(true)
    expect(trip.end_date).toBe(today())

    // One all_mine summary (solo), for the whole trip, inside the old chapter.
    // created_at is boundary − 1µs: exact, no clock comparison involved.
    const rows = await summaries(s.g.id, s.tripId)
    expect(rows.map((r) => [r.amount, r.paid_by, r.split_type, r.description])).toEqual([
      [2000, s.inviter, 'all_mine', 'TEST_1438_trip 結算'],
    ])
    expect(rows.every((r) => r.in_trip_chapter === true && r.before_open_chapter === true)).toBe(true)

    // The solo chapter closed and the pair chapter opened at the boundary.
    const [old] = await db.select().from(groupEpochs).where(eq(groupEpochs.id, s.g.epochId))
    const open = await openEpochOf(s.g.id)
    expect(old.endedAt).not.toBeNull()
    expect(open.memberBId).toBe(s.joiner)
    await expectNothingInNewChapter(s.g.id)

    // Balance recalculated before the close (solo → structurally 0).
    const [after] = await db.select().from(groupBalance).where(eq(groupBalance.groupId, s.g.id))
    expect(after.balance).toBe(0)
    expect(after.version).toBeGreaterThan(before.version)

    // Same event endTrip sends, keyed on the inviter, marked as ended by the accept.
    expect(tripEndedEvents()).toEqual([{
      distinctId: s.inviter,
      event: 'trip_ended',
      props: { default_currency: 'TWD', expense_count: 2, duration_days: 2, ended_by: 'invite_accept' },
    }])
    expect(captured.find((c) => c.event === 'first_record_created')).toEqual({
      distinctId: s.inviter, event: 'first_record_created', props: { via: 'trip_summary' },
    })
    expect(captured.filter((c) => c.event === 'partner_joined')).toHaveLength(1)

    // Back in the new chapter the trip is read-only, as any past trip.
    expect(await as(s.inviter, () => endTrip({ tripId: s.tripId, endDate: today() })))
      .toEqual({ ok: false, code: 'active_trip_not_found' })
  })

  it('multi-currency: the summary is the sum of the base-currency amounts', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const trip = await as(inviter, async () => unwrapAction(await createTrip({
      name: 'TEST_1438_jp',
      startDate: longAgo().toISOString().slice(0, 10),
      currencies: {
        default: 'TWD',
        entries: [
          { code: 'TWD', label: null, rate: 1 },
          { code: 'JPY', label: null, rate: 0.2 },
        ],
      },
    })))
    await as(inviter, async () => {
      unwrapAction(await createTripExpense({
        tripId: trip.id, paidBy: inviter, amount: 10000, currency: 'JPY', category: 'food', splitType: 'all_mine',
      }))
      unwrapAction(await createTripExpense({
        tripId: trip.id, paidBy: inviter, amount: 555, category: 'food', splitType: 'all_mine',
      }))
    })
    const expenseRows = await db.select().from(tripExpenses).where(eq(tripExpenses.tripId, trip.id))
    expect(expenseRows.map((e) => e.originalCurrency).sort()).toEqual(['JPY', null].sort())
    const baseTotal = expenseRows.reduce((sum, e) => sum + e.amount, 0)
    expect(baseTotal).toBe(2000 + 555)
    const invite = await seedInvite(g.id, inviter)

    expect(await as(joiner, () => acceptInvite(invite.token))).toEqual({ ok: true, data: g.id })

    expect((await tripRow(trip.id)).status).toBe('ended')
    const rows = await summaries(g.id, trip.id)
    expect(rows.map((r) => r.amount)).toEqual([baseTotal])
    expect(rows.every((r) => r.in_trip_chapter === true)).toBe(true)
    await expectNothingInNewChapter(g.id)
    expect(tripEndedEvents().map((e) => e.props)).toEqual([
      { default_currency: 'TWD', expense_count: 2, duration_days: 2, ended_by: 'invite_accept' },
    ])
  })

  it('a trip with no expenses is ended and writes no summary', async () => {
    const s = await soloInviterWithTrip([])
    expect(await as(s.joiner, () => acceptInvite(s.invite.token))).toEqual({ ok: true, data: s.g.id })
    expect((await tripRow(s.tripId)).status).toBe('ended')
    expect(await summaries(s.g.id, s.tripId)).toHaveLength(0)
    await expectNothingInNewChapter(s.g.id)
    expect(tripEndedEvents().map((e) => e.props.expense_count)).toEqual([0])
    expect(captured.find((c) => c.event === 'first_record_created')).toBeUndefined()
  })

  it('a planned end date is kept; one after the accept is brought back to the accept day', async () => {
    const s = await soloInviterWithTrip([100])
    const planned = new Date(Date.now() - 24 * HOUR).toISOString().slice(0, 10)
    const other = await seedTrip(s.g, s.inviter, [100], { name: 'TEST_1438_future' })
    await db.update(trips).set({ endDate: planned }).where(eq(trips.id, s.tripId))
    await db.update(trips).set({ endDate: '2999-01-01' }).where(eq(trips.id, other.tripId))

    expect(await as(s.joiner, () => acceptInvite(s.invite.token))).toEqual({ ok: true, data: s.g.id })

    expect((await tripRow(s.tripId)).end_date).toBe(planned)
    expect((await tripRow(other.tripId)).end_date).toBe(today())
    expect((await summaries(s.g.id, other.tripId)).map((r) => r.in_trip_chapter)).toEqual([true])
    expect(tripEndedEvents()).toHaveLength(2)
  })

  it('ended, deleted and past-chapter trips are left alone', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const g = await group(inviter, null)
    const ended = await seedTrip(g, inviter, [100], { status: 'ended' })
    const deleted = await seedTrip(g, inviter, [100], { deleted: true })
    // A chapter of this group that closed earlier, with a trip still marked active.
    const [past] = await db.insert(groupEpochs).values({
      groupId: g.id, startedAt: new Date(Date.now() - 96 * HOUR), endedAt: longAgo(), memberAId: inviter, memberBId: null,
    }).returning({ id: groupEpochs.id })
    const stale = await seedTrip(g, inviter, [100], { epochId: past.id })
    const invite = await seedInvite(g.id, inviter)

    expect(await as(joiner, () => acceptInvite(invite.token))).toEqual({ ok: true, data: g.id })

    expect((await tripRow(ended.tripId)).status).toBe('ended')
    const [del] = await db.select().from(trips).where(eq(trips.id, deleted.tripId))
    expect(del.status).toBe('active')
    expect((await tripRow(stale.tripId)).status).toBe('active')
    const cash = await db.select().from(cashTransactions).where(eq(cashTransactions.groupId, g.id))
    expect(cash).toEqual([])
    expect(tripEndedEvents()).toEqual([])
  })

  it('an accept that fails rolls the trip ending back with it', async () => {
    const s = await soloInviterWithTrip([1200])
    await db.update(groupInvites).set({ revokedAt: new Date() }).where(eq(groupInvites.id, s.invite.id))

    const res = await as(s.joiner, () => acceptInvite(s.invite.token))
    expect(res).toMatchObject({ ok: false })

    expect((await tripRow(s.tripId)).status).toBe('active')
    expect(await summaries(s.g.id, s.tripId)).toHaveLength(0)
    expect(tripEndedEvents()).toEqual([])
  })

  it('the accepter-side refusal stays: an accepter with an active trip is refused, the inviter\'s trip untouched', async () => {
    const s = await soloInviterWithTrip([1200])
    const solo = await group(s.joiner, null)
    await seedTrip(solo, s.joiner, [300])

    expect(await as(s.joiner, () => acceptInvite(s.invite.token)))
      .toEqual({ ok: false, code: 'accept_active_trip' })

    expect((await tripRow(s.tripId)).status).toBe('active')
    expect(await summaries(s.g.id, s.tripId)).toHaveLength(0)
    const [grp] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, s.g.id))
    expect(grp.memberB).toBeNull()
    expect(tripEndedEvents()).toEqual([])
  })
})

describe.skipIf(!isLocalDb)('acceptInvite vs endTrip (#1438)', () => {
  it('endTrip first: accept waits, finds the trip ended and adds no second summary', async () => {
    await retryOnClockStep(databaseUrl, async () => {
      await cleanup()
      const s = await soloInviterWithTrip([1200])

      // Pause endTrip after its summary insert: something else holds the
      // group's balance row, which endTrip updates last.
      const holder = await openTx(holderConn)
      await holder.run((t) => t`SELECT group_id FROM "GroupBalance" WHERE group_id = ${s.g.id} FOR UPDATE`)
      const ending = as(s.inviter, () => endTrip({ tripId: s.tripId, endDate: today() }))
      ending.catch(() => {})
      await waitBlockedBy(monitor, holder.pid)

      const accept = as(s.joiner, () => acceptInvite(s.invite.token))
      accept.catch(() => {})
      await waitLockWaitersOr(monitor, 2, accept)
      await holder.commit()

      const [e, a] = [await ending, await accept]
      expectNoDeadlock(e, a)
      expect(e).toMatchObject({ ok: true })
      expect(a).toEqual({ ok: true, data: s.g.id })
      // Exactly one summary set — endTrip's — and it is in the old chapter.
      // endTrip's now() vs accept's later boundary: clock-step sensitive.
      const rows = await summaries(s.g.id, s.tripId)
      expect(rows).toHaveLength(1)
      expect(rows.every((r) => r.in_trip_chapter === true && r.before_open_chapter === true)).toBe(true)
      expect(tripEndedEvents().filter((ev) => ev.props.ended_by === 'invite_accept')).toEqual([])
      await expectNothingInNewChapter(s.g.id)
    })
  })

  it('accept first (holding the trip row): endTrip waits on it and is refused; one summary', async () => {
    const s = await soloInviterWithTrip([1200])
    const { accept, release } = await acceptPausedAtClaim(s.joiner, s.invite)

    const ending = as(s.inviter, () => endTrip({ tripId: s.tripId, endDate: today() }))
    ending.catch(() => {})
    // endTrip waits on the trip row, which accept already holds.
    await waitLockWaitersOr(monitor, 2, ending)
    await release()

    const [a, e] = [await accept, await ending]
    expectNoDeadlock(a, e)
    expect(a).toEqual({ ok: true, data: s.g.id })
    expect(e).toEqual({ ok: false, code: 'active_trip_not_found' })
    const rows = await summaries(s.g.id, s.tripId)
    expect(rows.map((r) => r.amount)).toEqual([1200])
    expect(rows.every((r) => r.in_trip_chapter === true)).toBe(true)
    expect((await tripRow(s.tripId)).status).toBe('ended')
    await expectNothingInNewChapter(s.g.id)
  })

  it('reverse order: endTrip holds the trip row while accept holds the chapter — no 40P01, one summary', async () => {
    await retryOnClockStep(databaseUrl, async () => {
      await cleanup()
      const s = await soloInviterWithTrip([1200])
      const { accept, release } = await acceptPausedHoldingChapter(s.joiner, s.invite)

      // endTrip takes the trip row, then waits for the chapter row accept holds.
      const ending = as(s.inviter, () => endTrip({ tripId: s.tripId, endDate: today() }))
      ending.catch(() => {})
      await waitLockWaiters(monitor, 2)
      await release()

      const [a, e] = [await accept, await ending]
      expectNoDeadlock(a, e)
      // accept backed off, endTrip went first, accept ran again and found the trip ended.
      expect(e).toMatchObject({ ok: true })
      expect(a).toEqual({ ok: true, data: s.g.id })
      const rows = await summaries(s.g.id, s.tripId)
      expect(rows).toHaveLength(1)
      expect(rows.every((r) => r.in_trip_chapter === true && r.before_open_chapter === true)).toBe(true)
      expect((await tripRow(s.tripId)).status).toBe('ended')
      await expectNothingInNewChapter(s.g.id)
    })
  })
})

describe.skipIf(!isLocalDb)('acceptInvite vs createTripExpense (#1438)', () => {
  it('expense first: accept waits for it and folds it in', async () => {
    const s = await soloInviterWithTrip([1200])

    // Pause createTripExpense after its trip + chapter locks: its insert's
    // foreign-key check on the payer's profile waits on this holder.
    const holder = await openTx(holderConn)
    await holder.run((t) => t`SELECT id FROM "Profiles" WHERE id = ${s.inviter} FOR UPDATE`)
    const write = as(s.inviter, () => createTripExpense({
      tripId: s.tripId, paidBy: s.inviter, amount: 300, category: 'food', splitType: 'all_mine',
    }))
    write.catch(() => {})
    await waitBlockedBy(monitor, holder.pid)

    const accept = as(s.joiner, () => acceptInvite(s.invite.token))
    accept.catch(() => {})
    await waitLockWaitersOr(monitor, 2, accept)
    await holder.commit()

    const [w, a] = [await write, await accept]
    expectNoDeadlock(w, a)
    expect(w).toMatchObject({ ok: true })
    expect(a).toEqual({ ok: true, data: s.g.id })
    const rows = await summaries(s.g.id, s.tripId)
    expect(rows.map((r) => r.amount)).toEqual([1500])
    expect(rows.every((r) => r.in_trip_chapter === true)).toBe(true)
    await expectNothingInNewChapter(s.g.id)
  })

  it('accept first (holding the trip row): the expense is refused and not in the summary', async () => {
    const s = await soloInviterWithTrip([1200])
    const { accept, release } = await acceptPausedAtClaim(s.joiner, s.invite)

    const write = as(s.inviter, () => createTripExpense({
      tripId: s.tripId, paidBy: s.inviter, amount: 300, category: 'food', splitType: 'all_mine',
    }))
    write.catch(() => {})
    await waitLockWaitersOr(monitor, 2, write)
    await release()

    const [a, w] = [await accept, await write]
    expectNoDeadlock(a, w)
    expect(a).toEqual({ ok: true, data: s.g.id })
    expect(w).toEqual({ ok: false, code: 'trip_not_found' })
    expect(await db.select().from(tripExpenses).where(eq(tripExpenses.tripId, s.tripId))).toHaveLength(1)
    expect((await summaries(s.g.id, s.tripId)).map((r) => r.amount)).toEqual([1200])
    await expectNothingInNewChapter(s.g.id)
  })

  it('reverse order: the expense holds the trip row while accept holds the chapter — no 40P01, folded in', async () => {
    const s = await soloInviterWithTrip([1200])
    const { accept, release } = await acceptPausedHoldingChapter(s.joiner, s.invite)

    const write = as(s.inviter, () => createTripExpense({
      tripId: s.tripId, paidBy: s.inviter, amount: 300, category: 'food', splitType: 'all_mine',
    }))
    write.catch(() => {})
    await waitLockWaiters(monitor, 2)
    await release()

    const [a, w] = [await accept, await write]
    expectNoDeadlock(a, w)
    expect(w).toMatchObject({ ok: true })
    expect(a).toEqual({ ok: true, data: s.g.id })
    const rows = await summaries(s.g.id, s.tripId)
    expect(rows.map((r) => r.amount)).toEqual([1500])
    expect(rows.every((r) => r.in_trip_chapter === true)).toBe(true)
    await expectNothingInNewChapter(s.g.id)
  })
})

describe.skipIf(!isLocalDb)('acceptInvite vs updateTrip (#1438)', () => {
  it('updateTrip first: accept waits and ends the renamed trip', async () => {
    const s = await soloInviterWithTrip([1200])

    // Pause updateTrip between its two locks: it holds the trip row and waits
    // for the chapter row, which this holder has.
    const holder = await openTx(holderConn)
    await holder.run((t) => t`SELECT id FROM "GroupEpochs" WHERE id = ${s.g.epochId} FOR NO KEY UPDATE`)
    const write = as(s.inviter, () => updateTrip({ tripId: s.tripId, name: 'renamed' }))
    write.catch(() => {})
    await waitBlockedBy(monitor, holder.pid)

    const accept = as(s.joiner, () => acceptInvite(s.invite.token))
    accept.catch(() => {})
    // accept queues on the chapter row behind updateTrip (the tuple lock
    // updateTrip holds while it waits), so count waiters rather than asking
    // who blocks accept.
    await waitLockWaiters(monitor, 2)
    await holder.commit()

    const [w, a] = [await write, await accept]
    expectNoDeadlock(w, a)
    expect(w).toMatchObject({ ok: true })
    expect(a).toEqual({ ok: true, data: s.g.id })
    expect((await summaries(s.g.id, s.tripId)).map((r) => r.description)).toEqual(['renamed 結算'])
    expect((await tripRow(s.tripId)).status).toBe('ended')
    await expectNothingInNewChapter(s.g.id)
  })

  it('accept first (holding the trip row): updateTrip is refused, the trip keeps its name', async () => {
    const s = await soloInviterWithTrip([1200])
    const { accept, release } = await acceptPausedAtClaim(s.joiner, s.invite)

    const write = as(s.inviter, () => updateTrip({ tripId: s.tripId, name: 'renamed' }))
    write.catch(() => {})
    await waitLockWaitersOr(monitor, 2, write)
    await release()

    const [a, w] = [await accept, await write]
    expectNoDeadlock(a, w)
    expect(a).toEqual({ ok: true, data: s.g.id })
    expect(w).toEqual({ ok: false, code: 'trip_not_found' })
    expect((await tripRow(s.tripId)).name).toBe('TEST_1438_trip')
    expect((await summaries(s.g.id, s.tripId)).map((r) => r.description)).toEqual(['TEST_1438_trip 結算'])
    await expectNothingInNewChapter(s.g.id)
  })

  it('reverse order: updateTrip holds the trip row while accept holds the chapter — no 40P01', async () => {
    const s = await soloInviterWithTrip([1200])
    const { accept, release } = await acceptPausedHoldingChapter(s.joiner, s.invite)

    const write = as(s.inviter, () => updateTrip({ tripId: s.tripId, name: 'renamed' }))
    write.catch(() => {})
    await waitLockWaiters(monitor, 2)
    await release()

    const [a, w] = [await accept, await write]
    expectNoDeadlock(a, w)
    expect(w).toMatchObject({ ok: true })
    expect(a).toEqual({ ok: true, data: s.g.id })
    expect((await summaries(s.g.id, s.tripId)).map((r) => r.description)).toEqual(['renamed 結算'])
    expect((await tripRow(s.tripId)).status).toBe('ended')
    await expectNothingInNewChapter(s.g.id)
  })
})
