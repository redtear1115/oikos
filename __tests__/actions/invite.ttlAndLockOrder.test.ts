import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1288 I2 — 24 h TTL, the clamp migration, and one lock order ─────────
//
// 1. TTL: a freshly minted invite expires exactly 24 h after `created_at`.
//
// 2. Lock order (regression): createInvite locks the group row, then the
//    group's open invite rows. acceptInvite used to claim the invite row
//    first and update the group row second — the opposite order. A mint and
//    an accept on the same solo group could then each hold one lock and wait
//    for the other; Postgres broke the cycle with 40P01 and the loser saw only
//    the generic error. The interleaving is forced with a third connection
//    that holds the invite row: the accept queues on it first, the mint
//    queues second, then the blocker lets go. Pre-fix that is a deadlock every
//    time (the accept wins the invite row, then waits for the group row the
//    mint holds, while the mint waits for the invite row).
//
// 3. The clamp migration (`drizzle/0067_invite_ttl_24h_clamp.sql`): open
//    invites older than 24 h become expired, accepted and revoked rows are
//    untouched, and a second run changes nothing. It UPDATEs the whole table,
//    so it only runs against a local throwaway database — never dev or prod.
//
// Integration test: talks to the database in DATABASE_URL (see
// vitest.config.ci.ts for why CI excludes this folder).
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
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))

const { db } = await import('@/lib/db/client')
const { profiles, oikosGroups, groupBalance, groupEpochs, groupInvites } = await import('@/lib/db/schema')
const { acceptInvite, createInvite } = await import('@/actions/invite')
const { generateToken, INVITE_TTL_MS } = await import('@/lib/invite')
const { eq, inArray, sql } = await import('drizzle-orm')
const postgres = (await import('postgres')).default

const as = <T>(userId: string, fn: () => Promise<T>) => viewerStore.run(userId, fn)

const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
  } catch {
    return false
  }
})()

// Separate connections: one holds the blocking lock inside a transaction, the
// other watches pg_stat_activity (whose contents are frozen per transaction,
// so it cannot be polled from inside the blocker's).
let blocker: ReturnType<typeof postgres>
let monitor: ReturnType<typeof postgres>

beforeAll(() => {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.')
  }
  blocker = postgres(databaseUrl, { max: 1, prepare: false })
  monitor = postgres(databaseUrl, { max: 1, prepare: false })
})

afterAll(async () => {
  await blocker?.end()
  await monitor?.end()
})

const created = { profiles: [] as string[], groups: [] as string[] }

afterEach(async () => {
  try {
    if (created.groups.length) {
      await db.delete(groupInvites).where(inArray(groupInvites.groupId, created.groups))
      await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, created.groups))
      await db.delete(groupBalance).where(inArray(groupBalance.groupId, created.groups))
      await db.delete(oikosGroups).where(inArray(oikosGroups.id, created.groups))
    }
    if (created.profiles.length) {
      await db.delete(groupEpochs).where(inArray(groupEpochs.memberAId, created.profiles))
      await db.delete(profiles).where(inArray(profiles.id, created.profiles))
    }
  } catch (e) {
    console.error('cleanup failed', e)
  }
  created.profiles = []
  created.groups = []
})

async function person(label: string): Promise<string> {
  const id = randomUUID()
  await db.insert(profiles).values({ id, displayName: `TEST_1288_I2_${label}` })
  created.profiles.push(id)
  return id
}

async function soloGroup(memberA: string): Promise<string> {
  const [g] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1288_I2_group', memberA, memberB: null })
    .returning({ id: oikosGroups.id })
  created.groups.push(g.id)
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: g.id, startedAt: new Date(), memberAId: memberA, memberBId: null })
  return g.id
}

async function seedInvite(groupId: string, invitedBy: string, over: Partial<typeof groupInvites.$inferInsert> = {}) {
  const token = generateToken()
  const [row] = await db.insert(groupInvites).values({
    groupId,
    invitedBy,
    token,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    ...over,
  }).returning({ id: groupInvites.id })
  return { id: row.id, token }
}

/** Backends of this database currently waiting on a heavyweight lock. */
async function lockWaiters(): Promise<number> {
  const [r] = await monitor`
    SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock'`
  return r.n as number
}

async function waitForLockWaiters(n: number) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if ((await lockWaiters()) >= n) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`timed out waiting for ${n} lock waiter(s)`)
}

/**
 * Hold a row lock on the invite from a third connection until `release()`.
 * Resolves once the lock is held.
 */
async function holdInviteRow(inviteId: string): Promise<{ release: () => Promise<void> }> {
  let release!: () => void
  const released = new Promise<void>((r) => { release = r })
  let locked!: () => void
  const isLocked = new Promise<void>((r) => { locked = r })
  const tx = blocker.begin(async (t) => {
    await t`SELECT 1 FROM "GroupInvites" WHERE id = ${inviteId} FOR UPDATE`
    locked()
    await released
  })
  await isLocked
  return {
    release: async () => {
      release()
      await tx
    },
  }
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

describe('createInvite — 24 h TTL (#1288 I2)', () => {
  it('a new invite expires exactly 24 h after it was created (DB clock)', async () => {
    const inviter = await person('inviter')
    const groupId = await soloGroup(inviter)

    const res = await as(inviter, () => createInvite())
    expect(res.ok).toBe(true)

    const [row] = await db
      .select({ ttlSeconds: sql<number>`extract(epoch from ${groupInvites.expiresAt} - ${groupInvites.createdAt})::float8` })
      .from(groupInvites)
      .where(eq(groupInvites.groupId, groupId))
    expect(Number(row.ttlSeconds)).toBe(24 * 60 * 60)
  })
})

describe('mint vs accept — one lock order, no deadlock (#1288 I2)', () => {
  it('accept queued first, mint second: the accept joins, the mint reads group_full, no 40P01', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)
    const invite = await seedInvite(groupId, inviter)

    const hold = await holdInviteRow(invite.id)
    const accept = as(joiner, () => acceptInvite(invite.token))
    await waitForLockWaiters(1)
    const mint = as(inviter, () => createInvite())
    await waitForLockWaiters(2)
    await hold.release()

    const [a, m] = await Promise.allSettled([accept, mint])
    const outcome = { accept: describeSettled(a), mint: describeSettled(m) }
    expect(outcome).toEqual({
      accept: { ok: true, data: groupId },
      mint: { ok: false, code: 'group_full' },
    })

    const [g] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, groupId))
    expect(g.memberB).toBe(joiner)
    const rows = await db.select().from(groupInvites).where(eq(groupInvites.groupId, groupId))
    expect(rows).toHaveLength(1) // the mint rolled back; nothing new was minted
    expect(rows[0].acceptedAt).not.toBeNull()
    expect(rows[0].revokedAt).toBeNull()
  })

  it('mint queued first, accept second: the mint supersedes, the accept reads revoked, no 40P01', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)
    const invite = await seedInvite(groupId, inviter)

    const hold = await holdInviteRow(invite.id)
    const mint = as(inviter, () => createInvite())
    await waitForLockWaiters(1)
    const accept = as(joiner, () => acceptInvite(invite.token))
    await waitForLockWaiters(2)
    await hold.release()

    const [m, a] = await Promise.allSettled([mint, accept])
    const outcome = { mint: describeSettled(m), accept: describeSettled(a) }
    expect(outcome).toMatchObject({
      mint: { ok: true },
      accept: { ok: false, code: 'revoked' },
    })

    const [g] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, groupId))
    expect(g.memberB).toBeNull()
    const rows = await db.select().from(groupInvites).where(eq(groupInvites.groupId, groupId))
    expect(rows).toHaveLength(2)
    const old = rows.find((r) => r.id === invite.id)!
    const fresh = rows.find((r) => r.id !== invite.id)!
    expect(old.revokedAt).not.toBeNull()
    expect(old.acceptedAt).toBeNull()
    expect(fresh.revokedAt).toBeNull()
    expect(fresh.acceptedAt).toBeNull()
  })
})

describe('0067 clamp migration (#1288 I2, D2)', () => {
  // Whole-table UPDATE: refuse anything but a local throwaway database.
  it.skipIf(!isLocalDb)('clamps open invites to 24 h, leaves accepted and revoked rows alone, and is idempotent', async () => {
    const inviter = await person('inviter')
    const groupId = await soloGroup(inviter)
    const H = 60 * 60 * 1000
    const now = Date.now()
    const at = (ms: number) => new Date(now + ms)

    const oldOpen = await seedInvite(groupId, inviter, { createdAt: at(-72 * H), expiresAt: at(96 * H) })
    const youngOpen = await seedInvite(groupId, inviter, { createdAt: at(-1 * H), expiresAt: at(167 * H) })
    const oldAccepted = await seedInvite(groupId, inviter, { createdAt: at(-72 * H), expiresAt: at(96 * H), acceptedAt: at(-71 * H) })
    const oldRevoked = await seedInvite(groupId, inviter, { createdAt: at(-72 * H), expiresAt: at(96 * H), revokedAt: at(-70 * H) })
    const longDead = await seedInvite(groupId, inviter, { createdAt: at(-240 * H), expiresAt: at(-72 * H) })
    const fresh24h = await seedInvite(groupId, inviter, { createdAt: at(-2 * H), expiresAt: at(22 * H) })

    const before = new Map(
      (await db.select().from(groupInvites).where(eq(groupInvites.groupId, groupId))).map((r) => [r.id, r]),
    )

    const migration = readFileSync(resolve(__dirname, '../../drizzle/0067_invite_ttl_24h_clamp.sql'), 'utf-8')
    const first = await blocker.unsafe(migration)
    const second = await blocker.unsafe(migration)
    expect(first.count).toBe(3) // oldOpen, youngOpen, longDead
    expect(second.count).toBe(0)

    const after = new Map(
      (await db.select().from(groupInvites).where(eq(groupInvites.groupId, groupId))).map((r) => [r.id, r]),
    )
    const exp = (id: string) => after.get(id)!.expiresAt.getTime()
    const created = (id: string) => after.get(id)!.createdAt.getTime()

    // Older than 24 h and open → now expired, at created_at + 24 h.
    expect(exp(oldOpen.id)).toBe(created(oldOpen.id) + 24 * H)
    expect(exp(oldOpen.id)).toBeLessThan(Date.now())
    // Younger than 24 h → still live, until created_at + 24 h.
    expect(exp(youngOpen.id)).toBe(created(youngOpen.id) + 24 * H)
    expect(exp(youngOpen.id)).toBeGreaterThan(Date.now())
    // Already dead stays dead.
    expect(exp(longDead.id)).toBeLessThan(Date.now())
    // Untouched.
    for (const id of [oldAccepted.id, oldRevoked.id, fresh24h.id]) {
      expect(after.get(id)).toEqual(before.get(id))
    }
  })
})
