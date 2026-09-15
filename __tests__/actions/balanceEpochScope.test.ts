import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Regression for #1030 ────────────────────────────────────────────────
//
// recalcGroupBalance (settled cache) and getGroupPendingBalanceDelta (live
// pending view) summed over ALL history instead of the current epoch. A new
// partner joining a group that previously had a duo chapter inherited the
// stayer's post-leave residue:
//
//   F1 (settled) — A pays 1000 'half' → B settles 500 → B leaves → C joins →
//   any write recalcs the cache over full history and produces +500 instead
//   of 0.
//
//   F2 (pending) — same setup but the residue is a lone `status='pending'`
//   CashTransactions row. getGroupPendingBalanceDelta is computed live at
//   read time (dashboard), so it surfaces the moment C accepts the invite —
//   no write required at all.
//
// A fresh-verifier pass caught a P2 regression in the first fix attempt:
// scoping by `transacted_at` / `settled_at` (rather than `created_at`) broke
// backdating — a row created TODAY (inside the current epoch) but dated
// yesterday would silently drop out of the balance sum while still showing
// up in the feed (`lib/db/queries/_predicates.ts#epochClause`, the thing
// every actual epoch-scoped read uses, filters on `created_at`). The three
// tests below (backdated settled / backdated pending / backdated settlement)
// pin that down: all three assert the record COUNTS when it was created in
// the current epoch, regardless of what calendar date it's dated to.
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

let mockUserId: string = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }),
    },
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => null,
    getAll: () => [],
    has: () => false,
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(),
}))

const { db } = await import('@/lib/db/client')
const {
  profiles,
  oikosGroups,
  groupBalance,
  groupEpochs,
  groupInvites,
  cashTransactions,
  settlements,
} = await import('@/lib/db/schema')
const { leaveGroup } = await import('@/actions/membership')
const { createInvite, acceptInvite } = await import('@/actions/invite')
const { createTransaction } = await import('@/actions/transaction')
const { createSettlement } = await import('@/actions/settlement')
const { getGroupBalance, getGroupPendingBalanceDelta } = await import('@/lib/db/queries/balance')
const { eq, inArray } = await import('drizzle-orm')
const { unwrapAction } = await import('@/lib/action-errors')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.',
    )
  }
})

interface SeedRefs {
  userAId: string
  userBId: string
  userCId: string
  oldGroupId: string
  newGroupIdForB?: string
  inviteToken?: string
  txIds: string[]
}

async function seedDuoGroup(): Promise<SeedRefs> {
  const userAId = randomUUID()
  const userBId = randomUUID()
  const userCId = randomUUID()
  const epochStartedAt = new Date('2026-01-10T00:00:00Z')

  await db.insert(profiles).values([
    { id: userAId, displayName: 'TEST_1030_userA' },
    { id: userBId, displayName: 'TEST_1030_userB' },
    { id: userCId, displayName: 'TEST_1030_userC' },
  ])

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_1030_duo',
    memberA: userAId,
    memberB: userBId,
    currentEpochStartedAt: epochStartedAt,
  }).returning({ id: oikosGroups.id })

  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })

  await db.insert(groupEpochs).values({
    groupId: group.id,
    startedAt: epochStartedAt,
    memberAId: userAId,
    memberBId: userBId,
  })

  return { userAId, userBId, userCId, oldGroupId: group.id, txIds: [] }
}

/** Duo group whose current epoch started 1 hour ago — for the backdating tests. */
async function seedRecentDuoGroup(): Promise<SeedRefs> {
  const userAId = randomUUID()
  const userBId = randomUUID()
  const userCId = randomUUID()
  const epochStartedAt = new Date(Date.now() - 60 * 60 * 1000)

  await db.insert(profiles).values([
    { id: userAId, displayName: 'TEST_1030_backdate_userA' },
    { id: userBId, displayName: 'TEST_1030_backdate_userB' },
    { id: userCId, displayName: 'TEST_1030_backdate_userC' },
  ])

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_1030_backdate_duo',
    memberA: userAId,
    memberB: userBId,
    currentEpochStartedAt: epochStartedAt,
  }).returning({ id: oikosGroups.id })

  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })

  await db.insert(groupEpochs).values({
    groupId: group.id,
    startedAt: epochStartedAt,
    memberAId: userAId,
    memberBId: userBId,
  })

  return { userAId, userBId, userCId, oldGroupId: group.id, txIds: [] }
}

/** 'YYYY-MM-DD' for yesterday, local machine time — good enough for a date-only field. */
function yesterdayYMD(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

async function cleanup(refs: SeedRefs) {
  const groupIds = [refs.oldGroupId, refs.newGroupIdForB].filter((x): x is string => !!x)
  if (refs.txIds.length) {
    await db.delete(cashTransactions).where(inArray(cashTransactions.id, refs.txIds))
  }
  if (refs.inviteToken) {
    await db.delete(groupInvites).where(eq(groupInvites.token, refs.inviteToken))
  }
  for (const gid of groupIds) {
    await db.delete(cashTransactions).where(eq(cashTransactions.groupId, gid))
    await db.delete(settlements).where(eq(settlements.groupId, gid))
    await db.delete(groupEpochs).where(eq(groupEpochs.groupId, gid))
    await db.delete(groupBalance).where(eq(groupBalance.groupId, gid))
    await db.delete(oikosGroups).where(eq(oikosGroups.id, gid))
  }
  await db.delete(profiles).where(inArray(profiles.id, [refs.userAId, refs.userBId, refs.userCId]))
}

describe('balance epoch scoping (#1030)', () => {
  let refs: SeedRefs | null = null

  afterEach(async () => {
    if (refs) {
      try { await cleanup(refs) } catch (e) { console.error('cleanup failed', e) }
      refs = null
    }
  })

  it('F1 — settled residue after leave+rejoin does not land on the new partner', async () => {
    refs = await seedDuoGroup()
    const { userAId, userBId, userCId, oldGroupId } = refs

    // A pays 1000 'half' → +500 owed to A. B settles 500 → balance back to 0.
    mockUserId = userAId
    const tx1 = unwrapAction(await createTransaction({
      amount: 1000,
      description: 'TEST split',
      category: 'other',
      splitType: 'half',
      payerId: userAId,
      transactedAt: '2026-01-11',
    }))
    refs.txIds.push(tx1.id)

    mockUserId = userBId
    unwrapAction(await createSettlement({
      amount: 500,
      payerId: userBId,
      settledAt: '2026-01-12',
    }))

    expect(await getGroupBalance(oldGroupId)).toBe(0)

    // B leaves. leaveGroup requires balance === 0 (just verified) and moves
    // B's settlement (paid_by = B) to B's new solo group, leaving A's +500
    // 'half' leg behind on oldGroupId with nothing to net it against — the
    // exact mechanism from the issue.
    mockUserId = userBId
    const { groupId: newGroupIdForB } = unwrapAction(await leaveGroup())
    refs.newGroupIdForB = newGroupIdForB

    // C joins the now-solo oldGroupId via invite.
    mockUserId = userAId
    const inviteUrl = unwrapAction(await createInvite())
    const token = new URL(inviteUrl).pathname.split('/').pop()!
    refs.inviteToken = token

    mockUserId = userCId
    unwrapAction(await acceptInvite(token))

    // Any write triggers the next recalc — record C's first transaction.
    mockUserId = userAId
    const tx2 = unwrapAction(await createTransaction({
      amount: 100,
      description: 'TEST after rejoin',
      category: 'other',
      splitType: 'all_mine',
      payerId: userAId,
      transactedAt: '2026-02-01',
    }))
    refs.txIds.push(tx2.id)

    // Bug (pre-fix): balance would be +500 — A's leftover 'half' leg from
    // the prior chapter, inherited by C. Fixed: epoch scoping excludes it.
    expect(await getGroupBalance(oldGroupId)).toBe(0)
  }, 20000)

  it('F2 — leftover pending row does not surface in the new partner\'s include-pending view before any write', async () => {
    refs = await seedDuoGroup()
    const { userAId, userBId, userCId, oldGroupId } = refs

    // A creates a PENDING 'half' transaction. Never settled, never resolved —
    // this is exactly the "leftover pending row" scenario from the issue.
    mockUserId = userAId
    const tx1 = unwrapAction(await createTransaction({
      amount: 1000,
      description: 'TEST pending split',
      category: 'other',
      splitType: 'half',
      payerId: userAId,
      transactedAt: '2026-01-11',
      status: 'pending',
    }))
    refs.txIds.push(tx1.id)

    // Settled balance is 0 (nothing settled yet) — B can leave.
    expect(await getGroupBalance(oldGroupId)).toBe(0)

    mockUserId = userBId
    const { groupId: newGroupIdForB } = unwrapAction(await leaveGroup())
    refs.newGroupIdForB = newGroupIdForB

    // C joins. No write happens after this — getGroupPendingBalanceDelta is
    // computed live at read time (dashboard), so the bug would show up
    // immediately without any further mutation.
    mockUserId = userAId
    const inviteUrl = unwrapAction(await createInvite())
    const token = new URL(inviteUrl).pathname.split('/').pop()!
    refs.inviteToken = token

    mockUserId = userCId
    unwrapAction(await acceptInvite(token))

    // Bug (pre-fix): +500 — A's prior-chapter pending 'half' leg leaks into
    // C's include-pending dashboard view. Fixed: epoch scoping excludes it.
    expect(await getGroupPendingBalanceDelta(oldGroupId)).toBe(0)
  }, 20000)

  it('backdated settled row still counts — created in the current epoch, dated yesterday', async () => {
    refs = await seedRecentDuoGroup()
    const { userAId, oldGroupId } = refs

    // Created right now (inside the current epoch, which started 1h ago) but
    // dated yesterday — the normal "caught up on receipts" flow on day one of
    // a new chapter. Must still count: created_at, not transacted_at, is the
    // epoch boundary.
    mockUserId = userAId
    const tx = unwrapAction(await createTransaction({
      amount: 1000,
      description: 'TEST backdated settled',
      category: 'other',
      splitType: 'half',
      payerId: userAId,
      transactedAt: yesterdayYMD(),
    }))
    refs.txIds.push(tx.id)

    expect(await getGroupBalance(oldGroupId)).toBe(500)
  })

  it('backdated pending row still counts in the include-pending view', async () => {
    refs = await seedRecentDuoGroup()
    const { userAId, oldGroupId } = refs

    mockUserId = userAId
    const tx = unwrapAction(await createTransaction({
      amount: 1000,
      description: 'TEST backdated pending',
      category: 'other',
      splitType: 'half',
      payerId: userAId,
      transactedAt: yesterdayYMD(),
      status: 'pending',
    }))
    refs.txIds.push(tx.id)

    expect(await getGroupPendingBalanceDelta(oldGroupId)).toBe(500)
  })

  it('backdated settlement still nets the balance down', async () => {
    refs = await seedRecentDuoGroup()
    const { userAId, userBId, oldGroupId } = refs

    // A pays 1000 'half' today → balance +500.
    mockUserId = userAId
    const tx = unwrapAction(await createTransaction({
      amount: 1000,
      description: 'TEST backdated settlement setup',
      category: 'other',
      splitType: 'half',
      payerId: userAId,
      transactedAt: new Date().toISOString().slice(0, 10),
    }))
    refs.txIds.push(tx.id)
    expect(await getGroupBalance(oldGroupId)).toBe(500)

    // B settles 500 today, but the settlement is DATED yesterday (backdated,
    // same "catching up" flow). Must still net the balance to 0.
    mockUserId = userBId
    unwrapAction(await createSettlement({
      amount: 500,
      payerId: userBId,
      settledAt: yesterdayYMD(),
    }))

    expect(await getGroupBalance(oldGroupId)).toBe(0)
  })
})
