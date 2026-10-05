import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { loadEnvLocal, seedGroup as seedGroupRow } from '../outing/_setup'

// ─── 出遊．朋友從分享連結加入 against the real dev database (#1558 S2) ──────
//
// Integration tests for PLAN-1558 rev 2 「S2 acceptance」 a–h. They need
// 0083_outing_link_join applied to the dev project (every Outings insert names
// the 0083 columns: without it they fail with 42703). Excluded from CI with the
// rest of __tests__/actions/** (vitest.config.ci.ts).
//
// Identity is the mocked session user (`mockUserId`, '' = anonymous) plus the
// mocked cookie jar, which joinOuting writes into through `set`.
// ──────────────────────────────────────────────────────────────────────────────

loadEnvLocal()
vi.setConfig({ testTimeout: 60_000 })

let mockUserId = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUserId ? { id: mockUserId } : null }, error: null }) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
const cookieJar = new Map<string, string>()
const cookieSets: { name: string; value: string; opts: Record<string, unknown> }[] = []
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k)! } : undefined),
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    has: (k: string) => cookieJar.has(k),
    set: (name: string, value: string, opts: Record<string, unknown>) => {
      cookieSets.push({ name, value, opts })
      cookieJar.set(name, value)
    },
    delete: (name: string) => { cookieJar.delete(name) },
  }),
  headers: async () => new Headers(),
}))

const { db } = await import('@/lib/db/client')
const {
  outings, outingParticipants, outingExpenses, outingExpenseShares, outingSettlements, groupEpochs, oikosGroups, profiles,
} = await import('@/lib/db/schema')
const { and, eq, inArray, isNull, sql } = await import('drizzle-orm')
const A = await import('@/actions/outing')
const { PAST_EPOCH_COOKIE } = await import('@/lib/db/queries/epoch')
const { getOutingLanding, getOutingFullView, listParticipatingOutings } = await import('@/lib/db/queries/outingPublic')
const { resolveReader } = await import('@/lib/outing/access')

beforeEach(() => {
  cookieJar.clear()
  cookieSets.length = 0
  mockUserId = ''
})

const seededGroups = new Set<string>()
async function seedGroup(opts?: Parameters<typeof seedGroupRow>[0]) {
  const seed = await seedGroupRow(opts)
  seededGroups.add(seed.groupId)
  return seed
}

afterAll(async () => {
  const ids = [...seededGroups]
  if (ids.length === 0) return
  await db.transaction(async (tx) => {
    const own = sql`(SELECT id FROM "Outings" WHERE group_id IN ${ids})`
    await tx.delete(outingExpenseShares).where(sql`${outingExpenseShares.expenseId} IN (
      SELECT id FROM "OutingExpenses" WHERE outing_id IN ${own})`)
    await tx.delete(outingExpenses).where(sql`${outingExpenses.outingId} IN ${own}`)
    await tx.delete(outingSettlements).where(sql`${outingSettlements.outingId} IN ${own}`)
    await tx.delete(outingParticipants).where(sql`${outingParticipants.outingId} IN ${own}`)
    await tx.delete(outings).where(inArray(outings.groupId, ids))
  })
})

// ─── helpers ───

type R<T> = { ok: true; data: T } | { ok: false; code: string; params?: Record<string, string> }
function ok<T>(r: R<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}`)
  return r.data
}
const as = (userId: string) => { mockUserId = userId; cookieJar.clear() }
const anon = () => { mockUserId = ''; cookieJar.clear() }
const cookieName = (outingId: string) => `oc_${outingId}`

/** Duo group, outing with A, B and two named friends, and a share link. */
async function seedLinked() {
  const seed = await seedGroup()
  as(seed.userId)
  const { id: outingId } = ok(await A.createOuting({ name: '綠島' }))
  const { id: f1 } = ok(await A.addOutingParticipant({ outingId, displayName: '小美' }))
  const { id: f2 } = ok(await A.addOutingParticipant({ outingId, displayName: '阿傑' }))
  const ps = await db.select().from(outingParticipants).where(eq(outingParticipants.outingId, outingId))
  const pA = ps.find((p) => p.profileId === seed.userId)!.id
  const { token: share } = ok(await A.getOutingShareLink({ outingId }))
  return { ...seed, outingId, pA, f1, f2, share }
}

/** Anonymous claim of `slot`; returns the claim token that landed in the cookie. */
async function claimAnon(share: string, slot: string, outingId: string) {
  anon()
  ok(await A.joinOuting({ shareToken: share, participantId: slot }))
  const token = cookieJar.get(cookieName(outingId))!
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  return token
}
const withCookie = (outingId: string, token: string, userId = '') => {
  mockUserId = userId
  cookieJar.clear()
  cookieJar.set(cookieName(outingId), token)
}

async function newProfile(name = '路人') {
  const id = randomUUID()
  await db.insert(profiles).values({ id, displayName: name })
  return id
}

const addExpense = (outingId: string, payer: string, ids: string[], amount = 300) =>
  A.addOutingExpense({ outingId, paidByParticipantId: payer, amount, participantIds: ids })

// ─── a. actor matrix ───

describe('a. actor matrix — every refusal is { ok:false, code }', () => {
  it('anonymous without a cookie, and with a garbage cookie → outing_not_found', async () => {
    const o = await seedLinked()
    anon()
    expect(await addExpense(o.outingId, o.f1, [o.f1])).toEqual({ ok: false, code: 'outing_not_found' })
    cookieJar.set(cookieName(o.outingId), 'garbage')
    expect(await addExpense(o.outingId, o.f1, [o.f1])).toEqual({ ok: false, code: 'outing_not_found' })
  })

  it('cookie of a released slot → outing_not_found', async () => {
    const o = await seedLinked()
    const t = await claimAnon(o.share, o.f1, o.outingId)
    as(o.userId)
    ok(await A.releaseOutingSlot({ outingId: o.outingId, participantId: o.f1 }))
    withCookie(o.outingId, t)
    expect(await addExpense(o.outingId, o.f1, [o.f1])).toEqual({ ok: false, code: 'outing_not_found' })
  })

  it('cookie for a slot bound to another profile → outing_not_found for a different signed-in user', async () => {
    const o = await seedLinked()
    const t = await claimAnon(o.share, o.f1, o.outingId)
    const owner = await newProfile()
    withCookie(o.outingId, t, owner)
    ok(await A.bindOutingParticipant({ outingId: o.outingId }))
    const someoneElse = await newProfile()
    withCookie(o.outingId, t, someoneElse)
    expect(await addExpense(o.outingId, o.f1, [o.f1])).toEqual({ ok: false, code: 'outing_not_found' })
  })

  it('session user with their own slot + another slot\'s cookie → acts as their own slot', async () => {
    const o = await seedLinked()
    const t2 = await claimAnon(o.share, o.f2, o.outingId)
    const u = await newProfile()
    as(u)
    ok(await A.joinOuting({ shareToken: o.share, participantId: o.f1 }))
    withCookie(o.outingId, t2, u)
    const { id } = ok(await addExpense(o.outingId, o.f1, [o.f1, o.f2]))
    const [row] = await db.select().from(outingExpenses).where(eq(outingExpenses.id, id))
    expect(row.enteredByParticipantId).toBe(o.f1)
  })

  it('member of another group → outing_not_found', async () => {
    const o = await seedLinked()
    const other = await seedGroup()
    as(other.userId)
    expect(await addExpense(o.outingId, o.f1, [o.f1])).toEqual({ ok: false, code: 'outing_not_found' })
    expect(await A.renameOuting({ outingId: o.outingId, name: 'x' })).toEqual({ ok: false, code: 'outing_not_found' })
  })

  it('past-chapter-pinned member → outing_viewing_past_chapter (no throw)', async () => {
    const o = await seedLinked()
    const now = new Date()
    const [old] = await db.update(groupEpochs).set({ endedAt: now })
      .where(and(eq(groupEpochs.groupId, o.groupId), isNull(groupEpochs.endedAt))).returning()
    await db.insert(groupEpochs).values({ groupId: o.groupId, startedAt: now, memberAId: o.userId, memberBId: o.partnerId })
    as(o.userId)
    cookieJar.set(PAST_EPOCH_COOKIE, old.id)
    expect(await addExpense(o.outingId, o.pA, [o.pA])).toEqual({ ok: false, code: 'outing_viewing_past_chapter' })
  })

  it('a friend whose own ledger is pinned to its past chapter still writes through the cookie', async () => {
    const o = await seedLinked()
    const t = await claimAnon(o.share, o.f1, o.outingId)
    const friendLedger = await seedGroup()
    const now = new Date()
    const [old] = await db.update(groupEpochs).set({ endedAt: now })
      .where(and(eq(groupEpochs.groupId, friendLedger.groupId), isNull(groupEpochs.endedAt))).returning()
    withCookie(o.outingId, t, friendLedger.userId)
    cookieJar.set(PAST_EPOCH_COOKIE, old.id)
    ok(await addExpense(o.outingId, o.f1, [o.f1]))
  })

  it('ended outing → outing_not_active for content writes', async () => {
    const o = await seedLinked()
    const t = await claimAnon(o.share, o.f1, o.outingId)
    as(o.userId)
    ok(await A.endOuting({ outingId: o.outingId }))
    withCookie(o.outingId, t)
    expect(await addExpense(o.outingId, o.f1, [o.f1])).toEqual({ ok: false, code: 'outing_not_active' })
    expect(await A.joinOuting({ shareToken: o.share, participantId: o.f2 })).toEqual({ ok: false, code: 'outing_not_active' })
  })
})

// ─── b. admin-only ───

describe('b. admin-only actions', () => {
  it('a claimed friend gets outing_admin_only on each; a member succeeds on each', async () => {
    const o = await seedLinked()
    const t = await claimAnon(o.share, o.f1, o.outingId)
    const calls = (who: 'friend' | 'member') => [
      () => A.renameOuting({ outingId: o.outingId, name: `${who}-rename` }),
      () => A.addOutingParticipant({ outingId: o.outingId, displayName: `${who}-add` }),
      () => A.getOutingShareLink({ outingId: o.outingId }),
      () => A.resetOutingShareLink({ outingId: o.outingId }),
      () => A.releaseOutingSlot({ outingId: o.outingId, participantId: o.f2 }),
      () => A.deactivateOutingParticipant({ outingId: o.outingId, participantId: o.f2 }),
      () => A.endOuting({ outingId: o.outingId }),
      () => A.softDeleteOuting({ outingId: o.outingId }),
    ]
    for (const call of calls('friend')) {
      withCookie(o.outingId, t)
      expect(await call()).toEqual({ ok: false, code: 'outing_admin_only' })
    }
    for (const call of calls('member')) {
      as(o.partnerId!)
      expect((await call()).ok).toBe(true)
    }
  })
})

// ─── c. read tiers ───

describe('c. read tiers', () => {
  it('share token only → name, status, slots; nothing else', async () => {
    const o = await seedLinked()
    as(o.userId)
    ok(await addExpense(o.outingId, o.pA, [o.pA, o.f1]))
    const landing = await getOutingLanding(o.share)
    expect(Object.keys(landing!).sort()).toEqual(['name', 'outingId', 'slots', 'status'])
    for (const s of landing!.slots) expect(Object.keys(s).sort()).toEqual(['claim', 'displayName', 'id'])
  })

  it('participant and member get the full view; a cookie-less visitor gets nothing', async () => {
    const o = await seedLinked()
    const t = await claimAnon(o.share, o.f1, o.outingId)
    withCookie(o.outingId, t)
    const asFriend = await resolveReader(o.outingId)
    const view = await getOutingFullView(asFriend!.outing, asFriend!.actor)
    expect(view.isAdmin).toBe(false)
    expect(view.youParticipantId).toBe(o.f1)
    as(o.userId)
    const asMember = await resolveReader(o.outingId)
    expect((await getOutingFullView(asMember!.outing, asMember!.actor)).isAdmin).toBe(true)
    anon()
    expect(await resolveReader(o.outingId)).toBeNull()
  })

  it('invalid and reset tokens → null', async () => {
    const o = await seedLinked()
    expect(await getOutingLanding('x')).toBeNull()
    as(o.userId)
    ok(await A.resetOutingShareLink({ outingId: o.outingId }))
    expect(await getOutingLanding(o.share)).toBeNull()
  })
})

// ─── d. IDOR ───

describe('d. ids from another outing', () => {
  it('edit / delete expense and delete settlement with a foreign id → not found, nothing written', async () => {
    const o = await seedLinked()
    const p = await seedLinked()
    as(p.userId)
    const { id: foreignExpense } = ok(await addExpense(p.outingId, p.pA, [p.pA]))
    const { id: foreignSettlement } = ok(await A.recordOutingSettlement({
      outingId: p.outingId, fromParticipantId: p.pA, toParticipantId: p.f1, amount: 10,
    }))
    as(o.userId)
    expect(await A.editOutingExpense({
      outingId: o.outingId, expenseId: foreignExpense, paidByParticipantId: o.pA, amount: 1, participantIds: [o.pA],
    })).toEqual({ ok: false, code: 'outing_expense_not_found' })
    expect(await A.deleteOutingExpense({ outingId: o.outingId, expenseId: foreignExpense }))
      .toEqual({ ok: false, code: 'outing_expense_not_found' })
    expect(await A.deleteOutingSettlement({ outingId: o.outingId, settlementId: foreignSettlement }))
      .toEqual({ ok: false, code: 'outing_settlement_not_found' })
    const [e] = await db.select().from(outingExpenses).where(eq(outingExpenses.id, foreignExpense))
    const [s] = await db.select().from(outingSettlements).where(eq(outingSettlements.id, foreignSettlement))
    expect(e.deletedAt).toBeNull()
    expect(s.deletedAt).toBeNull()
  })
})

// ─── e. claim ───

describe('e. claiming a slot', () => {
  it('two concurrent claims on one slot → exactly one succeeds', async () => {
    const o = await seedLinked()
    anon()
    const results = await Promise.all([
      A.joinOuting({ shareToken: o.share, participantId: o.f1 }),
      A.joinOuting({ shareToken: o.share, participantId: o.f1 }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: 'outing_slot_taken' }])
  })

  it('a deleted account\'s slot (profile_id NULL, claimed_at set) is not claimable', async () => {
    const o = await seedLinked()
    await db.update(outingParticipants)
      .set({ profileId: null, displayName: '已離開的夥伴', claimTokenHash: null, claimedAt: new Date() })
      .where(eq(outingParticipants.id, o.f1))
    anon()
    expect(await A.joinOuting({ shareToken: o.share, participantId: o.f1 })).toEqual({ ok: false, code: 'outing_slot_taken' })
  })

  it('adding yourself respects the cap of 20 under FOR UPDATE', async () => {
    const o = await seedLinked() // A, B, 2 friends = 4
    as(o.userId)
    for (let i = 0; i < 15; i++) ok(await A.addOutingParticipant({ outingId: o.outingId, displayName: `f${i}` }))
    anon()
    const results = await Promise.all([
      A.joinOuting({ shareToken: o.share, displayName: 'p1' }),
      A.joinOuting({ shareToken: o.share, displayName: 'p2' }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: 'outing_participant_limit' }])
  })

  it('a member, or a user already bound here, calling joinOuting → outing_already_joined', async () => {
    const o = await seedLinked()
    as(o.userId)
    expect(await A.joinOuting({ shareToken: o.share, participantId: o.f1 })).toEqual({ ok: false, code: 'outing_already_joined' })
    const u = await newProfile()
    as(u)
    ok(await A.joinOuting({ shareToken: o.share, participantId: o.f1 }))
    expect(await A.joinOuting({ shareToken: o.share, participantId: o.f2 })).toEqual({ ok: false, code: 'outing_already_joined' })
  })
})

// ─── f. release ───

describe('f. releasing a slot', () => {
  it('refused for a bound slot and for a deleted account\'s slot', async () => {
    const o = await seedLinked()
    const u = await newProfile()
    as(u)
    ok(await A.joinOuting({ shareToken: o.share, participantId: o.f1 }))
    as(o.userId)
    expect(await A.releaseOutingSlot({ outingId: o.outingId, participantId: o.f1 })).toEqual({ ok: false, code: 'outing_slot_bound' })
    await db.update(outingParticipants)
      .set({ profileId: null, claimTokenHash: null, claimedAt: new Date() })
      .where(eq(outingParticipants.id, o.f2))
    expect(await A.releaseOutingSlot({ outingId: o.outingId, participantId: o.f2 })).toEqual({ ok: false, code: 'outing_slot_bound' })
  })

  it('after release the old cookie fails and the slot is claimable again', async () => {
    const o = await seedLinked()
    const t = await claimAnon(o.share, o.f1, o.outingId)
    as(o.userId)
    ok(await A.releaseOutingSlot({ outingId: o.outingId, participantId: o.f1 }))
    withCookie(o.outingId, t)
    expect(await addExpense(o.outingId, o.f1, [o.f1])).toEqual({ ok: false, code: 'outing_not_found' })
    await claimAnon(o.share, o.f1, o.outingId)
  })
})

// ─── g. reset link ───

describe('g. resetting the link', () => {
  it('the old share token stops joining; an existing cookie participant still writes', async () => {
    const o = await seedLinked()
    const t = await claimAnon(o.share, o.f1, o.outingId)
    as(o.userId)
    const { token: fresh } = ok(await A.resetOutingShareLink({ outingId: o.outingId }))
    expect(fresh).not.toBe(o.share)
    anon()
    expect(await A.joinOuting({ shareToken: o.share, participantId: o.f2 })).toEqual({ ok: false, code: 'outing_link_invalid' })
    withCookie(o.outingId, t)
    ok(await addExpense(o.outingId, o.f1, [o.f1]))
  })

  it('copying the link twice returns the same token (no rotation)', async () => {
    const o = await seedLinked()
    as(o.userId)
    expect(ok(await A.getOutingShareLink({ outingId: o.outingId })).token).toBe(o.share)
  })
})

// ─── h. what leaves the server ───

describe('h. results never carry secrets or internal ids', () => {
  it('join / bind / write results contain no claim token, hash, profile, group or epoch id', async () => {
    const o = await seedLinked()
    anon()
    const joined = await A.joinOuting({ shareToken: o.share, participantId: o.f1 })
    const set = cookieSets.find((c) => c.name === cookieName(o.outingId))!
    expect(set.opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    withCookie(o.outingId, set.value)
    const wrote = await addExpense(o.outingId, o.f1, [o.f1])
    const [row] = await db.select().from(outingParticipants).where(eq(outingParticipants.id, o.f1))
    const [outing] = await db.select().from(outings).where(eq(outings.id, o.outingId))
    const forbidden = [set.value, row.claimTokenHash!, outing.shareTokenHash!, o.groupId, o.epochId, o.userId]
    for (const r of [joined, wrote]) {
      const json = JSON.stringify(r)
      for (const f of forbidden) expect(json).not.toContain(f)
    }
  })

  it('我參與的出遊 lists another group\'s outing a user is bound in, not their own group\'s', async () => {
    const o = await seedLinked()
    const mine = await seedGroup()
    as(mine.userId)
    const { id: ownOuting } = ok(await A.createOuting({ name: 'own' }))
    ok(await A.joinOuting({ shareToken: o.share, participantId: o.f1 }))
    const listed = await listParticipatingOutings(mine.userId)
    expect(listed.map((r) => r.id)).toEqual([o.outingId])
    expect(listed.map((r) => r.id)).not.toContain(ownOuting)
    // The group row is untouched by joining someone else's outing.
    const [g] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, o.groupId))
    expect([g.memberA, g.memberB]).not.toContain(mine.userId)
  })
})
