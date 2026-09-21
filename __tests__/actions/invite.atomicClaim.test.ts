import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Regression for #1288 I1 ──────────────────────────────────────────────
//
// acceptInvite used to validate the invite on a row read *outside* its
// transaction, then stamp `accepted_at` without checking `revoked_at`,
// `expires_at` or how many rows changed. A revoke (supersede, partner removal,
// leave) or an expiry landing between that read and the transaction was
// ignored: the accept succeeded and nothing errored. createInvite never
// retired earlier links, so every "Invite" tap left one more live key behind.
//
// The window is reproduced deterministically: `getActiveGroupForUser` runs
// after acceptInvite has read the invite row and before it validates it, so a
// hook there changes the DB exactly where a concurrent revoke would land.
// Pre-fix, the revoke / expiry / issuer-change cases below all end with the
// accepter seated as member_b.
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

// Concurrent calls need different viewers, so the auth mock reads the user id
// from an AsyncLocalStorage scope set by `as()`.
const { AsyncLocalStorage } = await import('node:async_hooks')
const viewerStore = new AsyncLocalStorage<string>()
let mockUserId = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: viewerStore.getStore() ?? mockUserId } }, error: null }),
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))

const captured: { distinctId: string; event: string; properties?: Record<string, unknown> }[] = []
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async (distinctId: string, event: string, properties?: Record<string, unknown>) => {
    captured.push({ distinctId, event, properties })
  },
  isUserFirstNonDeletedRecord: async () => false,
}))

// The race window: runs after the invite row was read, before it is validated.
let inWindow: (() => Promise<void>) | null = null
vi.mock('@/lib/db/queries/group', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/db/queries/group')>()
  return {
    ...real,
    getActiveGroupForUser: async (userId: string) => {
      if (inWindow) await inWindow()
      return real.getActiveGroupForUser(userId)
    },
  }
})

const { db } = await import('@/lib/db/client')
const { profiles, oikosGroups, groupBalance, groupEpochs, groupInvites } = await import('@/lib/db/schema')
const { acceptInvite, previewInvite, createInvite } = await import('@/actions/invite')
const { generateToken } = await import('@/lib/invite')
const { and, eq, inArray, isNull, sql } = await import('drizzle-orm')

const as = <T>(userId: string, fn: () => Promise<T>) => viewerStore.run(userId, fn)

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.')
  }
})

const created = { profiles: [] as string[], groups: [] as string[] }

afterEach(async () => {
  inWindow = null
  mockUserId = ''
  captured.length = 0
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
  await db.insert(profiles).values({ id, displayName: `TEST_1288_${label}` })
  created.profiles.push(id)
  return id
}

async function soloGroup(memberA: string, memberB: string | null = null): Promise<string> {
  const [g] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1288_group', memberA, memberB })
    .returning({ id: oikosGroups.id })
  created.groups.push(g.id)
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: g.id, startedAt: new Date(), memberAId: memberA, memberBId: memberB })
  return g.id
}

async function seedInvite(groupId: string, invitedBy: string, over: Partial<typeof groupInvites.$inferInsert> = {}) {
  const token = generateToken()
  const [row] = await db.insert(groupInvites).values({
    groupId,
    invitedBy,
    token,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...over,
  }).returning({ id: groupInvites.id })
  return { id: row.id, token }
}

async function groupRow(id: string) {
  const [g] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, id)).limit(1)
  return g
}

async function inviteRow(id: string) {
  const [i] = await db.select().from(groupInvites).where(eq(groupInvites.id, id)).limit(1)
  return i
}

async function openEpochs(groupId: string) {
  return db.select().from(groupEpochs).where(and(
    eq(groupEpochs.groupId, groupId),
    isNull(groupEpochs.endedAt),
  ))
}

/** Membership and the invite are exactly as they were before the accept. */
async function expectNothingJoined(groupId: string, inviteId: string) {
  const g = await groupRow(groupId)
  expect(g.memberB).toBeNull()
  const i = await inviteRow(inviteId)
  expect(i.acceptedAt).toBeNull()
  const open = await openEpochs(groupId)
  expect(open).toHaveLength(1)
  expect(open[0].memberAId).toBe(g.memberA)
  expect(open[0].memberBId).toBeNull()
}

describe('acceptInvite — the claim is atomic (#1288)', () => {
  it('a revoke landing between preview and accept makes the accept fail and leaves membership unchanged', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)
    const invite = await seedInvite(groupId, inviter)

    // The invitee sees a good preview…
    const preview = await as(joiner, () => previewInvite(invite.token))
    expect(preview).toMatchObject({ ok: true, data: { ok: true } })

    // …then the link is revoked (supersede / partner removal) after accept
    // has already read the row.
    inWindow = async () => {
      await db.update(groupInvites).set({ revokedAt: new Date() }).where(eq(groupInvites.id, invite.id))
    }
    expect(await as(joiner, () => acceptInvite(invite.token))).toEqual({ ok: false, code: 'revoked' })

    await expectNothingJoined(groupId, invite.id)
    expect(captured.find((c) => c.event === 'partner_joined')).toBeUndefined()
  })

  it('an expiry landing in the same window makes the accept fail', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)
    const invite = await seedInvite(groupId, inviter)

    inWindow = async () => {
      await db.update(groupInvites)
        .set({ expiresAt: sql`now() - interval '1 second'` })
        .where(eq(groupInvites.id, invite.id))
    }
    expect(await as(joiner, () => acceptInvite(invite.token))).toEqual({ ok: false, code: 'expired' })

    await expectNothingJoined(groupId, invite.id)
  })

  it('an issuer who is no longer member_a by the time of the accept lets nobody in', async () => {
    const inviter = await person('inviter')
    const other = await person('other')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)
    const invite = await seedInvite(groupId, inviter)

    inWindow = async () => {
      await db.update(oikosGroups).set({ memberA: other }).where(eq(oikosGroups.id, groupId))
    }
    expect(await as(joiner, () => acceptInvite(invite.token))).toEqual({ ok: false, code: 'inviter_not_member' })

    const g = await groupRow(groupId)
    expect(g.memberB).toBeNull()
    // The claim was rolled back together with the refused join.
    expect((await inviteRow(invite.id)).acceptedAt).toBeNull()
  })

  it('two concurrent accepts of one token: exactly one joins', async () => {
    const inviter = await person('inviter')
    const first = await person('joiner1')
    const second = await person('joiner2')
    const groupId = await soloGroup(inviter)
    const invite = await seedInvite(groupId, inviter)

    // Hold both accepts in the window until both have read (and will pass
    // validation on) the still-open invite, so both reach the transaction.
    let arrived = 0
    let release!: () => void
    const bothIn = new Promise<void>((r) => { release = r })
    inWindow = async () => {
      arrived += 1
      if (arrived === 2) release()
      await bothIn
    }

    const results = await Promise.all([
      as(first, () => acceptInvite(invite.token)),
      as(second, () => acceptInvite(invite.token)),
    ])

    const wins = results.filter((r) => r.ok)
    const losses = results.filter((r) => !r.ok)
    expect(wins).toHaveLength(1)
    expect(losses).toEqual([{ ok: false, code: 'already_used' }])

    const winner = results[0].ok ? first : second
    const g = await groupRow(groupId)
    expect(g.memberB).toBe(winner)
    const open = await openEpochs(groupId)
    expect(open).toHaveLength(1)
    expect(open[0].memberBId).toBe(winner)
    expect((await inviteRow(invite.id)).acceptedAt).not.toBeNull()
  })

  it('reusing an accepted token is refused with already_used', async () => {
    const inviter = await person('inviter')
    const first = await person('joiner1')
    const second = await person('joiner2')
    const groupId = await soloGroup(inviter)
    const invite = await seedInvite(groupId, inviter)

    expect(await as(first, () => acceptInvite(invite.token))).toEqual({ ok: true, data: groupId })
    expect(await as(second, () => acceptInvite(invite.token))).toEqual({ ok: false, code: 'already_used' })
    expect((await groupRow(groupId)).memberB).toBe(first)
  })

  it('an invite that is both expired and revoked reads as expired, and preview telemetry carries the code only', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)
    const invite = await seedInvite(groupId, inviter, {
      expiresAt: new Date(Date.now() - 60_000),
      revokedAt: new Date(),
    })

    const preview = await as(joiner, () => previewInvite(invite.token))
    expect(preview).toEqual({ ok: true, data: { ok: false, error: 'expired' } })
    expect(await as(joiner, () => acceptInvite(invite.token))).toEqual({ ok: false, code: 'expired' })

    const failed = captured.filter((c) => c.event === 'invite_preview_failed')
    expect(failed).toHaveLength(1)
    expect(failed[0].properties).toEqual({ code: 'expired' })
    expect(JSON.stringify(captured)).not.toContain(invite.token)
  })
})

describe('createInvite — one open invite per group (#1288)', () => {
  const tokenOf = (url: string) => url.slice(url.lastIndexOf('/invite/') + '/invite/'.length)

  it('minting again supersedes the earlier open invite; the new one is live', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await soloGroup(inviter)

    const r1 = await as(inviter, () => createInvite())
    const r2 = await as(inviter, () => createInvite())
    if (!r1.ok || !r2.ok) throw new Error('mint failed')
    const [t1, t2] = [tokenOf(r1.data), tokenOf(r2.data)]
    expect(t1).not.toBe(t2)

    const rows = await db.select().from(groupInvites).where(eq(groupInvites.groupId, groupId))
    expect(rows).toHaveLength(2)
    const open = rows.filter((r) => r.acceptedAt === null && r.revokedAt === null)
    expect(open).toHaveLength(1)
    expect(open[0].token).toBe(t2)

    const superseded = captured.filter((c) => c.event === 'invite_superseded')
    expect(superseded).toHaveLength(1)
    expect(superseded[0].properties).toEqual({ group_id: groupId, count: 1 })
    const serialized = JSON.stringify(captured)
    expect(serialized).not.toContain(t1)
    expect(serialized).not.toContain(t2)

    // The superseded link is dead; the new one works.
    expect(await as(joiner, () => acceptInvite(t1))).toEqual({ ok: false, code: 'revoked' })
    expect(await as(joiner, () => acceptInvite(t2))).toEqual({ ok: true, data: groupId })
  })

  it('also retires an expired-but-unrevoked invite, and does not report a supersede when there was nothing to retire', async () => {
    const inviter = await person('inviter')
    const groupId = await soloGroup(inviter)

    const first = await as(inviter, () => createInvite())
    expect(first.ok).toBe(true)
    expect(captured.filter((c) => c.event === 'invite_superseded')).toHaveLength(0)

    const stale = await seedInvite(groupId, inviter, { expiresAt: new Date(Date.now() - 60_000) })
    // Drop the live one so only the expired row is left open.
    await db.update(groupInvites).set({ revokedAt: new Date() })
      .where(and(eq(groupInvites.groupId, groupId), sql`${groupInvites.id} <> ${stale.id}`))

    expect((await as(inviter, () => createInvite())).ok).toBe(true)
    expect((await inviteRow(stale.id)).revokedAt).not.toBeNull()
  })

  it('concurrent mints leave exactly one open invite', async () => {
    const inviter = await person('inviter')
    const groupId = await soloGroup(inviter)

    const results = await Promise.all([
      as(inviter, () => createInvite()),
      as(inviter, () => createInvite()),
      as(inviter, () => createInvite()),
    ])
    expect(results.every((r) => r.ok)).toBe(true)

    const rows = await db.select().from(groupInvites).where(eq(groupInvites.groupId, groupId))
    expect(rows).toHaveLength(3)
    expect(rows.filter((r) => r.acceptedAt === null && r.revokedAt === null)).toHaveLength(1)
  })

  it('refuses to mint while the ledger is a duo (server-side solo guard)', async () => {
    const memberA = await person('a')
    const memberB = await person('b')
    const groupId = await soloGroup(memberA, memberB)

    expect(await as(memberA, () => createInvite())).toEqual({ ok: false, code: 'group_full' })
    expect(await as(memberB, () => createInvite())).toEqual({ ok: false, code: 'group_full' })

    const rows = await db.select().from(groupInvites).where(eq(groupInvites.groupId, groupId))
    expect(rows).toHaveLength(0)
    expect(captured.filter((c) => c.event === 'invite_created')).toHaveLength(0)
  })
})
