import { describe, it, expect, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { seedAuthUsers, deleteAuthUsers } from './_authUser'
import { loadEnvLocal } from '../outing/_setup'

// ─── #1605 S2 — push tokens follow membership (dev DB) ─────────────────────
//
// F10: removePartner, leaveGroup and acceptInvite never moved or deleted
// PushTokens rows, so a person kept a token bound to a ledger they had left
// (and the sender matched tokens by group only). F11: signing out left this
// device's row behind, so a shared phone kept receiving the pushes.
//
//   removePartner  → the removed member's tokens on that ledger are deleted
//                    (their tokens elsewhere and the stayer's stay)
//   leaveGroup     → the leaver's tokens move to their new solo ledger
//   acceptInvite   → the joiner's tokens move from their solo ledger to the
//                    ledger they joined
//   sign-out       → signOut('T1') (#1617: one action, delete folded in)
//                    deletes U's row for this device's token (T1); U's other
//                    device (T2) and another person's row for the same device
//                    token stay; a failing delete still signs out
//
// Failure looks like: no error anywhere; an ex (or the next person holding a
// shared phone) keeps getting 「有待確認的定期收支」 for a ledger that is not
// theirs. Rows are TEST_1605_*; everything is removed in afterEach.
// ──────────────────────────────────────────────────────────────────────────

loadEnvLocal()

let mockUserId = ''
const authSignOut = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }),
      signOut: authSignOut,
    },
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${to};307;` })
  },
  notFound: () => { throw new Error('notFound') },
}))
vi.mock('@/lib/i18n/server-redirect', () => ({
  localizedHomePath: async () => '/',
  localizedSignInPath: async () => '/sign-in',
}))
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))

const { db } = await import('@/lib/db/client')
const { profiles, oikosGroups, groupBalance, groupEpochs, groupInvites, pushTokens } = await import('@/lib/db/schema')
const { removePartner, leaveGroup } = await import('@/actions/membership')
const { acceptInvite } = await import('@/actions/invite')
const { signOut } = await import('@/actions/auth')
const { unwrapAction } = await import('@/lib/action-errors')

/** signOut always ends in a redirect; resolve to its digest instead. */
async function signOutDigest(token?: string): Promise<string | undefined> {
  try {
    await signOut(token)
  } catch (e) {
    return (e as { digest?: string }).digest
  }
  return undefined
}
const { eq, inArray, or, and } = await import('drizzle-orm')

if (!process.env.DATABASE_URL?.includes('ufhcprrauwsxdmscbkrf')) {
  throw new Error('#1605 dev-DB test: DATABASE_URL must point at the dev project (oikos-dev)')
}

const created = { profiles: [] as string[], auth: [] as string[], groups: [] as string[] }

async function person(label: string, withAuth = false): Promise<string> {
  const id = randomUUID()
  await db.insert(profiles).values({ id, displayName: `TEST_1605_${label}` })
  created.profiles.push(id)
  if (withAuth) {
    await seedAuthUsers([{ id, displayName: `TEST_1605_${label}` }])
    created.auth.push(id)
  }
  return id
}

async function ledger(label: string, memberA: string, memberB: string | null): Promise<string> {
  const started = new Date(Date.now() - 86_400_000)
  const [g] = await db.insert(oikosGroups)
    .values({ name: `TEST_1605_${label}`, memberA, memberB, currentEpochStartedAt: started })
    .returning({ id: oikosGroups.id })
  created.groups.push(g.id)
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: g.id, startedAt: started, memberAId: memberA, memberBId: memberB })
  return g.id
}

async function token(userId: string, groupId: string, value: string) {
  await db.insert(pushTokens).values({ userId, groupId, platform: 'apns', token: value })
}

async function tokensOf(userIds: string[]) {
  const rows = await db
    .select({ userId: pushTokens.userId, groupId: pushTokens.groupId, token: pushTokens.token })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, userIds))
  return rows.sort((a, b) => a.token.localeCompare(b.token) || a.userId.localeCompare(b.userId))
}

afterEach(async () => {
  try {
    const ids = [...created.groups]
    if (created.profiles.length) {
      const extra = await db.select({ id: oikosGroups.id }).from(oikosGroups)
        .where(or(inArray(oikosGroups.memberA, created.profiles), inArray(oikosGroups.memberB, created.profiles)))
      for (const g of extra) if (!ids.includes(g.id)) ids.push(g.id)
    }
    if (ids.length) {
      await db.delete(pushTokens).where(inArray(pushTokens.groupId, ids))
      await db.delete(groupInvites).where(inArray(groupInvites.groupId, ids))
      await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, ids))
      await db.delete(groupBalance).where(inArray(groupBalance.groupId, ids))
      await db.delete(oikosGroups).where(inArray(oikosGroups.id, ids))
    }
    if (created.profiles.length) {
      await db.delete(pushTokens).where(inArray(pushTokens.userId, created.profiles))
      await db.delete(profiles).where(inArray(profiles.id, created.profiles))
    }
    await deleteAuthUsers(created.auth)
  } catch (e) {
    console.error('cleanup failed', e)
  } finally {
    created.profiles = []; created.auth = []; created.groups = []
    authSignOut.mockClear()
  }
})

describe('#1605 push tokens follow membership', () => {
  it('removePartner deletes the removed member\'s tokens on that ledger only', async () => {
    const a = await person('stayer'); const b = await person('removed')
    const g = await ledger('duo', a, b)
    const other = await ledger('b-elsewhere', b, null) // a stale solo ledger of B's
    await token(a, g, 'TEST_1605_rm_a')
    await token(b, g, 'TEST_1605_rm_b_on_g')
    await token(b, other, 'TEST_1605_rm_b_other')

    mockUserId = a
    unwrapAction(await removePartner())

    expect(await tokensOf([a, b])).toEqual([
      { userId: a, groupId: g, token: 'TEST_1605_rm_a' },
      { userId: b, groupId: other, token: 'TEST_1605_rm_b_other' },
    ])
  })

  it('leaveGroup moves the leaver\'s tokens to their new solo ledger; the stayer\'s stay', async () => {
    const a = await person('stayer'); const b = await person('leaver')
    const g = await ledger('duo', a, b)
    await token(a, g, 'TEST_1605_lv_a')
    await token(b, g, 'TEST_1605_lv_b1')
    await token(b, g, 'TEST_1605_lv_b2')

    mockUserId = b
    const { groupId: newGroup } = unwrapAction(await leaveGroup())
    created.groups.push(newGroup)

    expect(newGroup).not.toBe(g)
    expect(await tokensOf([a, b])).toEqual([
      { userId: a, groupId: g, token: 'TEST_1605_lv_a' },
      { userId: b, groupId: newGroup, token: 'TEST_1605_lv_b1' },
      { userId: b, groupId: newGroup, token: 'TEST_1605_lv_b2' },
    ])
  })

  it('acceptInvite moves the joiner\'s tokens from their solo ledger to the joined one', async () => {
    const inviter = await person('inviter', true); const joiner = await person('joiner', true)
    const target = await ledger('target', inviter, null)
    const solo = await ledger('joiner-solo', joiner, null)
    await token(inviter, target, 'TEST_1605_acc_inviter')
    await token(joiner, solo, 'TEST_1605_acc_joiner')

    const { generateToken, hashToken } = await import('@/lib/invite')
    const raw = generateToken()
    await db.insert(groupInvites).values({
      groupId: target, invitedBy: inviter, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 86_400_000),
    })

    mockUserId = joiner
    expect(unwrapAction(await acceptInvite(raw))).toBe(target)

    expect(await tokensOf([inviter, joiner])).toEqual([
      { userId: inviter, groupId: target, token: 'TEST_1605_acc_inviter' },
      { userId: joiner, groupId: target, token: 'TEST_1605_acc_joiner' },
    ])
  })
})

describe('#1605 / #1617 signOut(token) removes this device\'s registration', () => {
  it('T1 (this device) is deleted; T2 and another person\'s T1 stay; sign-out completes', async () => {
    const u = await person('u'); const v = await person('v')
    const gu = await ledger('u-solo', u, null)
    const gv = await ledger('v-solo', v, null)
    await token(u, gu, 'TEST_1605_T1')
    await token(u, gu, 'TEST_1605_T2')
    await token(v, gv, 'TEST_1605_T1') // same device, someone else signed in on it earlier

    mockUserId = u
    expect(await signOutDigest('TEST_1605_T1')).toBe('NEXT_REDIRECT;replace;/;307;')

    expect(authSignOut).toHaveBeenCalledOnce()
    expect(await tokensOf([u, v])).toEqual([
      { userId: v, groupId: gv, token: 'TEST_1605_T1' },
      { userId: u, groupId: gu, token: 'TEST_1605_T2' },
    ])
  })

  it('with the delete failing, sign-out still completes and nothing is deleted', async () => {
    const u = await person('u')
    const gu = await ledger('u-solo', u, null)
    await token(u, gu, 'TEST_1605_T1')

    mockUserId = '' // not a uuid → the delete fails in Postgres (the session check itself passes: { id: '' } is a user object)
    expect(await signOutDigest('TEST_1605_T1')).toBe('NEXT_REDIRECT;replace;/;307;')

    expect(authSignOut).toHaveBeenCalledOnce()
    expect(await tokensOf([u])).toEqual([{ userId: u, groupId: gu, token: 'TEST_1605_T1' }])
  })

  it('an empty, oversized or missing token deletes nothing and still signs out', async () => {
    const u = await person('u')
    const gu = await ledger('u-solo', u, null)
    await token(u, gu, 'TEST_1605_T1')
    mockUserId = u
    for (const t of ['', 'x'.repeat(513), undefined]) {
      expect(await signOutDigest(t)).toBe('NEXT_REDIRECT;replace;/;307;')
    }
    expect(authSignOut).toHaveBeenCalledTimes(3)
    expect((await db.select().from(pushTokens).where(and(eq(pushTokens.userId, u)))).length).toBe(1)
  })
})
