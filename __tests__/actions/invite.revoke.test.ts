import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { seedAuthUsers, deleteAuthUsers } from './_authUser'

// ─── #1546 — revokeOpenInvites: making the open invite link unusable ─────
//
// An invite link is a bearer credential for the ledger. The revoke only works
// because acceptInvite's claim is one conditional UPDATE (`revoked_at IS
// NULL`, under the group lock) — so the revoke must only stamp `revoked_at`,
// with createInvite's lock order, and must never claim success when an accept
// won the race. Failure looks like: a link the owner "turned off" still seats
// whoever opens it, with nothing erroring on either side.
//
// Same harness as invite.atomicClaim.test.ts: `inWindow` runs inside
// getActiveGroupForUser, i.e. after acceptInvite has read the invite row and
// before it validates it — exactly where a concurrent revoke would land.
// `afterResolve` runs after the real resolution, so the caller holds a group
// that the DB has already moved on from (stale resolution, F4).
//
// Integration test: talks to the database in DATABASE_URL (dev), like the
// rest of this folder.
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
  getCurrentUser: async () => ({ id: viewerStore.getStore() ?? '' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))

const captured: { distinctId: string; event: string; properties?: Record<string, unknown> }[] = []
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async (distinctId: string, event: string, properties?: Record<string, unknown>) => {
    captured.push({ distinctId, event, properties })
  },
  isUserFirstNonDeletedRecord: async () => false,
}))

let inWindow: (() => Promise<void>) | null = null
let afterResolve: ((userId: string) => Promise<void>) | null = null
vi.mock('@/lib/db/queries/group', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/db/queries/group')>()
  return {
    ...real,
    getActiveGroupForUser: async (userId: string) => {
      if (inWindow) await inWindow()
      const g = await real.getActiveGroupForUser(userId)
      if (afterResolve) await afterResolve(userId)
      return g
    },
  }
})

const { db } = await import('@/lib/db/client')
const { profiles, oikosGroups, groupBalance, groupEpochs, groupInvites } = await import('@/lib/db/schema')
const { acceptInvite, previewInvite, createInvite, revokeOpenInvites } = await import('@/actions/invite')
const { leaveGroup } = await import('@/actions/membership')
const { hasOpenInvite } = await import('@/lib/db/queries/invite')
const { generateToken, hashToken } = await import('@/lib/invite')
const { sanitizeAnalyticsUrl } = await import('@/lib/analytics/urlSanitizer')
const { and, eq, inArray, isNull, or } = await import('drizzle-orm')

const as = <T>(userId: string, fn: () => Promise<T>) => viewerStore.run(userId, fn)

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.')
  }
})

const created = { profiles: [] as string[], groups: [] as string[] }

afterEach(async () => {
  inWindow = null
  afterResolve = null
  captured.length = 0
  try {
    // Ledgers the actions created (leaveGroup's new solo ledger) are found
    // by membership.
    if (created.profiles.length) {
      const extra = await db.select({ id: oikosGroups.id }).from(oikosGroups).where(or(
        inArray(oikosGroups.memberA, created.profiles),
        inArray(oikosGroups.memberB, created.profiles),
      ))
      for (const g of extra) if (!created.groups.includes(g.id)) created.groups.push(g.id)
    }
    if (created.groups.length) {
      await db.delete(groupInvites).where(inArray(groupInvites.groupId, created.groups))
      await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, created.groups))
      await db.delete(groupBalance).where(inArray(groupBalance.groupId, created.groups))
      await db.delete(oikosGroups).where(inArray(oikosGroups.id, created.groups))
    }
    if (created.profiles.length) {
      await db.delete(groupEpochs).where(inArray(groupEpochs.memberAId, created.profiles))
      await deleteAuthUsers(created.profiles)
      await db.delete(profiles).where(inArray(profiles.id, created.profiles))
    }
  } catch (e) {
    console.error('cleanup failed', e)
  }
  created.profiles = []
  created.groups = []
})

// auth.users first: on dev, handle_new_user inserts the Profiles row without
// ON CONFLICT, so a Profiles row inserted beforehand makes the auth insert
// fail with Profiles_pkey. The trigger creates the profile from full_name;
// the insert below only covers a database whose trigger does not.
async function person(label: string): Promise<string> {
  const id = randomUUID()
  created.profiles.push(id)
  await seedAuthUsers([{ id, displayName: `TEST_1546_${label}` }])
  await db.insert(profiles).values({ id, displayName: `TEST_1546_${label}` }).onConflictDoNothing()
  return id
}

async function ledger(memberA: string, memberB: string | null = null): Promise<string> {
  const [g] = await db.insert(oikosGroups)
    .values({ name: 'TEST_1546_group', memberA, memberB })
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
    tokenHash: hashToken(token),
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

async function openInvites(groupId: string) {
  return db.select().from(groupInvites).where(and(
    eq(groupInvites.groupId, groupId),
    isNull(groupInvites.acceptedAt),
    isNull(groupInvites.revokedAt),
  ))
}

const tokenOf = (url: string) => url.slice(url.lastIndexOf('/invite/') + '/invite/'.length)

describe('revokeOpenInvites — the link stops working (#1546)', () => {
  it('#1 revoke, then accept: refused as revoked, nobody seated, preview reads revoked', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await ledger(inviter)
    const invite = await seedInvite(groupId, inviter)
    expect(await hasOpenInvite(groupId)).toBe(true)

    expect(await as(inviter, () => revokeOpenInvites())).toEqual({ ok: true, data: { revoked: 1, partnerJoined: false } })
    expect(await hasOpenInvite(groupId)).toBe(false)

    // Only revoked_at moved: not deleted, expiry untouched, so the invitee
    // keeps reading "revoked" rather than "invalid or expired".
    const row = await inviteRow(invite.id)
    expect(row).toBeDefined()
    expect(row.revokedAt).not.toBeNull()
    expect(row.acceptedAt).toBeNull()
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now())

    expect(await as(joiner, () => previewInvite(invite.token))).toEqual({ ok: true, data: { ok: false, error: 'revoked' } })
    expect(await as(joiner, () => acceptInvite(invite.token))).toEqual({ ok: false, code: 'revoked' })
    expect((await groupRow(groupId)).memberB).toBeNull()
    expect(captured.find((c) => c.event === 'partner_joined')).toBeUndefined()
  })

  it('#2 a revoke landing inside the accept window (after the invite was read) still wins', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await ledger(inviter)
    const invite = await seedInvite(groupId, inviter)

    let revokeResult: unknown
    inWindow = async () => {
      inWindow = null // the revoke resolves the viewer's group through the same hook
      revokeResult = await as(inviter, () => revokeOpenInvites())
    }
    expect(await as(joiner, () => acceptInvite(invite.token))).toEqual({ ok: false, code: 'revoked' })
    expect(revokeResult).toEqual({ ok: true, data: { revoked: 1, partnerJoined: false } })

    const g = await groupRow(groupId)
    expect(g.memberB).toBeNull()
    expect((await inviteRow(invite.id)).acceptedAt).toBeNull()
    const open = await db.select().from(groupEpochs).where(and(eq(groupEpochs.groupId, groupId), isNull(groupEpochs.endedAt)))
    expect(open).toHaveLength(1)
    expect(open[0].memberBId).toBeNull()
  })

  it('#3 accept commits first: revoke changes nothing and reports partnerJoined, not success', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await ledger(inviter)
    const invite = await seedInvite(groupId, inviter)

    expect(await as(joiner, () => acceptInvite(invite.token))).toEqual({ ok: true, data: groupId })
    expect(await as(inviter, () => revokeOpenInvites())).toEqual({ ok: true, data: { revoked: 0, partnerJoined: true } })

    const row = await inviteRow(invite.id)
    expect(row.acceptedAt).not.toBeNull()
    expect(row.revokedAt).toBeNull()
    expect((await groupRow(groupId)).memberB).toBe(joiner)
    expect(captured.find((c) => c.event === 'invite_revoked')).toBeUndefined()
  })

  it('#4 nothing open: ok with revoked 0; a second call is idempotent; an expired row is stamped but not counted', async () => {
    const inviter = await person('inviter')
    const groupId = await ledger(inviter)

    expect(await as(inviter, () => revokeOpenInvites())).toEqual({ ok: true, data: { revoked: 0, partnerJoined: false } })

    const minted = await as(inviter, () => createInvite())
    expect(minted.ok).toBe(true)
    expect(await as(inviter, () => revokeOpenInvites())).toEqual({ ok: true, data: { revoked: 1, partnerJoined: false } })
    expect(await as(inviter, () => revokeOpenInvites())).toEqual({ ok: true, data: { revoked: 0, partnerJoined: false } })

    const stale = await seedInvite(groupId, inviter, { expiresAt: new Date(Date.now() - 60_000) })
    expect(await hasOpenInvite(groupId)).toBe(false)
    expect(await as(inviter, () => revokeOpenInvites())).toEqual({ ok: true, data: { revoked: 0, partnerJoined: false } })
    expect((await inviteRow(stale.id)).revokedAt).not.toBeNull()

    // One event, for the one live link.
    expect(captured.filter((c) => c.event === 'invite_revoked')).toHaveLength(1)
  })
})

describe('revokeOpenInvites — who can revoke what (#1546, #1031)', () => {
  it('#5a a member of ledger Y cannot touch ledger X\'s invite', async () => {
    const ownerX = await person('ownerX')
    const ownerY = await person('ownerY')
    const groupX = await ledger(ownerX)
    const groupY = await ledger(ownerY)
    const inviteX = await seedInvite(groupX, ownerX)
    const inviteY = await seedInvite(groupY, ownerY)

    expect(await as(ownerY, () => revokeOpenInvites())).toEqual({ ok: true, data: { revoked: 1, partnerJoined: false } })
    expect((await inviteRow(inviteX.id)).revokedAt).toBeNull()
    expect((await inviteRow(inviteY.id)).revokedAt).not.toBeNull()
  })

  it('#5b a former partner, after leaveGroup, cannot revoke the invite member_a mints afterwards', async () => {
    const a = await person('a')
    const b = await person('b')
    const groupX = await ledger(a, b)

    const left = await as(b, () => leaveGroup())
    expect(left.ok).toBe(true)
    expect((await groupRow(groupX)).memberB).toBeNull()

    const minted = await as(a, () => createInvite())
    if (!minted.ok) throw new Error('mint failed')

    // b resolves to their own new solo ledger; X is unreachable by design.
    expect(await as(b, () => revokeOpenInvites())).toEqual({ ok: true, data: { revoked: 0, partnerJoined: false } })
    const open = await openInvites(groupX)
    expect(open).toHaveLength(1)
    expect(open[0].tokenHash).toBe(hashToken(tokenOf(minted.data)))
  })

  it('#5c stale resolution: a viewer no longer in the ledger under the lock gets inviter_not_member and touches nothing', async () => {
    const owner = await person('owner')
    const other = await person('other')
    const groupId = await ledger(owner)
    const invite = await seedInvite(groupId, owner)

    // The group was resolved for `owner`; before the lock, it stops being theirs.
    afterResolve = async () => {
      afterResolve = null
      await db.update(oikosGroups).set({ memberA: other }).where(eq(oikosGroups.id, groupId))
    }
    expect(await as(owner, () => revokeOpenInvites())).toEqual({ ok: false, code: 'inviter_not_member' })
    expect((await inviteRow(invite.id)).revokedAt).toBeNull()
  })

  it('#6 a duo ledger: no-op for either member, nothing changes', async () => {
    const a = await person('a')
    const b = await person('b')
    const groupId = await ledger(a, b)
    // An open row should not exist in a duo; seeded to prove it is not touched.
    const invite = await seedInvite(groupId, a)

    expect(await as(a, () => revokeOpenInvites())).toEqual({ ok: true, data: { revoked: 0, partnerJoined: true } })
    expect(await as(b, () => revokeOpenInvites())).toEqual({ ok: true, data: { revoked: 0, partnerJoined: true } })
    expect((await inviteRow(invite.id)).revokedAt).toBeNull()
    const g = await groupRow(groupId)
    expect([g.memberA, g.memberB]).toEqual([a, b])
    expect(captured).toHaveLength(0)
  })
})

describe('revokeOpenInvites — with createInvite and analytics (#1546)', () => {
  it('#7 revoke then mint: the new link works, no 23505, no supersede reported for the revoked row', async () => {
    const inviter = await person('inviter')
    const joiner = await person('joiner')
    const groupId = await ledger(inviter)

    const first = await as(inviter, () => createInvite())
    if (!first.ok) throw new Error('mint failed')
    expect((await as(inviter, () => revokeOpenInvites())).ok).toBe(true)

    const second = await as(inviter, () => createInvite())
    if (!second.ok) throw new Error(`second mint failed: ${JSON.stringify(second)}`)
    expect(captured.filter((c) => c.event === 'invite_superseded')).toHaveLength(0)

    expect(await as(joiner, () => acceptInvite(tokenOf(first.data)))).toEqual({ ok: false, code: 'revoked' })
    expect(await as(joiner, () => acceptInvite(tokenOf(second.data)))).toEqual({ ok: true, data: groupId })
  })

  it('#8 invite_revoked carries group_id and count only; the revoked link still masks in analytics URLs', async () => {
    const inviter = await person('inviter')
    const groupId = await ledger(inviter)
    const minted = await as(inviter, () => createInvite())
    if (!minted.ok) throw new Error('mint failed')
    const token = tokenOf(minted.data)
    const [row] = await openInvites(groupId)

    expect((await as(inviter, () => revokeOpenInvites())).ok).toBe(true)

    const events = captured.filter((c) => c.event === 'invite_revoked')
    expect(events).toHaveLength(1)
    expect(events[0].distinctId).toBe(inviter)
    expect(events[0].properties).toEqual({ group_id: groupId, count: 1 })
    const serialized = JSON.stringify(captured)
    expect(serialized).not.toContain(token)
    expect(serialized).not.toContain(hashToken(token))
    expect(serialized).not.toContain(row.id)

    const masked = sanitizeAnalyticsUrl(minted.data)
    expect(masked).not.toContain(token)
    expect(masked).toContain('/invite/:token')
  })

  it('#10 mint and revoke racing each other: no 23505, no 40P01, at most one open link', async () => {
    const inviter = await person('inviter')
    const groupId = await ledger(inviter)

    for (let round = 0; round < 3; round++) {
      const results = await Promise.all([
        as(inviter, () => createInvite()),
        as(inviter, () => revokeOpenInvites()),
        as(inviter, () => createInvite()),
        as(inviter, () => revokeOpenInvites()),
      ])
      // Any driver error (23505 / 40P01) would reject Promise.all, and a
      // 23505 in createInvite would come back as `invite_conflict`.
      expect(results.every((r) => r.ok)).toBe(true)
      expect((await openInvites(groupId)).length).toBeLessThanOrEqual(1)
    }
  })
})
