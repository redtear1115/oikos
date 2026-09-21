import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { loadEnvLocal, seedGroup } from '../outing/_setup'

// ─── 出遊 v1.6.0 against the real dev database (#943, plan v2.1 S-C / S-D / S-E) ──
//
// Integration tests: they need 0066 applied to the dev project. Excluded from
// CI with the rest of __tests__/actions/** (vitest.config.ci.ts).
//
// Concurrency tests hold a lock in one transaction, start the action on
// another pool connection, and poll pg_stat_activity until the action is
// actually waiting on a lock — no sleeps, so the interleaving is the one the
// test claims.
// ──────────────────────────────────────────────────────────────────────────────

loadEnvLocal()

let mockUserId = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
// Cookie jar: lets a test pin the viewer to a past epoch (futari_past_epoch).
const cookieJar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k)! } : undefined),
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    has: (k: string) => cookieJar.has(k),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(),
}))

const { db } = await import('@/lib/db/client')
const {
  outings, outingParticipants, outingExpenses, outingExpenseShares, outingSettlements,
  settlements, groupBalance, groupEpochs, oikosGroups, profiles, cashTransactions,
} = await import('@/lib/db/schema')
const { and, eq, isNull, sql } = await import('drizzle-orm')
const {
  createOuting, addOutingParticipant, addOutingExpense, recordOutingSettlement,
  endOuting, softDeleteOuting,
} = await import('@/actions/outing')
const { leaveGroup, removePartner } = await import('@/actions/membership')
const { setBaseCurrency } = await import('@/actions/currency')
const { recalcGroupBalance } = await import('@/lib/db/queries/balance')
const { PAST_EPOCH_COOKIE } = await import('@/lib/db/queries/epoch')

beforeEach(() => cookieJar.clear())

// ─── helpers ───

function ok<T>(r: { ok: true; data: T } | { ok: false; code: string }): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}`)
  return r.data
}

async function members(outingId: string) {
  return db.select().from(outingParticipants).where(eq(outingParticipants.outingId, outingId))
}

async function balanceOf(groupId: string) {
  const [row] = await db.select({ b: groupBalance.balance }).from(groupBalance).where(eq(groupBalance.groupId, groupId))
  return row.b
}

async function countRows(q: Promise<{ n: number }[]>) {
  return Number((await q)[0].n)
}

async function counts(outingId: string, groupId: string) {
  const n = sql<number>`count(*)::int`
  return {
    participants: await countRows(db.select({ n }).from(outingParticipants).where(eq(outingParticipants.outingId, outingId))),
    expenses: await countRows(db.select({ n }).from(outingExpenses).where(eq(outingExpenses.outingId, outingId))),
    outingSettlements: await countRows(db.select({ n }).from(outingSettlements).where(eq(outingSettlements.outingId, outingId))),
    settlements: await countRows(db.select({ n }).from(settlements).where(eq(settlements.groupId, groupId))),
    cash: await countRows(db.select({ n }).from(cashTransactions).where(eq(cashTransactions.groupId, groupId))),
  }
}

/** Duo group + outing with both members and one friend. */
async function seedOuting() {
  const seed = await seedGroup()
  mockUserId = seed.userId
  const { id: outingId } = ok(await createOuting({ name: '宜蘭' }))
  const ps = await members(outingId)
  const pA = ps.find((p) => p.profileId === seed.userId)!.id
  const pB = ps.find((p) => p.profileId === seed.partnerId)!.id
  const { id: pF } = ok(await addOutingParticipant({ outingId, displayName: '阿傑' }))
  return { ...seed, outingId, pA, pB, pF }
}

/** What acceptInvite does to a solo group: close its epoch, open a duo one. */
async function partnerJoins(groupId: string, memberA: string) {
  const partner = randomUUID()
  await db.insert(profiles).values({ id: partner, displayName: '新伴' })
  const now = new Date()
  await db.update(groupEpochs).set({ endedAt: now }).where(and(eq(groupEpochs.groupId, groupId), isNull(groupEpochs.endedAt)))
  await db.insert(groupEpochs).values({ groupId, startedAt: now, memberAId: memberA, memberBId: partner })
  await db.update(oikosGroups).set({ memberB: partner, currentEpochStartedAt: now }).where(eq(oikosGroups.id, groupId))
  return partner
}

/** Resolve once another backend is waiting on a row lock (or fail after ~10s). */
async function waitForLockWaiter() {
  for (let i = 0; i < 200; i++) {
    const rows = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid()
        AND (query ILIKE '%"Outings"%' OR query ILIKE '%"OikosGroups"%')`)
    if (Number(rows[0]?.n ?? 0) > 0) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('no backend ever waited on a lock — the interleaving under test did not happen')
}

// ─── S-C: authorization + scoping + validation ───

describe("scoping (F2) — another group's ids are rejected and nothing is written", () => {
  it('a G1 viewer cannot touch a G2 outing through any of the 6 actions', async () => {
    const g2 = await seedOuting()
    const g1 = await seedGroup()
    mockUserId = g1.userId
    const before = await counts(g2.outingId, g2.groupId)
    const g1Before = await balanceOf(g1.groupId)
    const notFound = { ok: false, code: 'outing_not_found' }

    expect(await addOutingParticipant({ outingId: g2.outingId, displayName: 'x' })).toEqual(notFound)
    expect(await addOutingExpense({ outingId: g2.outingId, paidByParticipantId: g2.pA, amount: 100, participantIds: [g2.pA] })).toEqual(notFound)
    expect(await recordOutingSettlement({ outingId: g2.outingId, fromParticipantId: g2.pF, toParticipantId: g2.pA, amount: 1 })).toEqual(notFound)
    expect(await endOuting({ outingId: g2.outingId })).toEqual(notFound)
    expect(await softDeleteOuting({ outingId: g2.outingId })).toEqual(notFound)
    // createOuting takes no outing id; it can only ever create in the viewer's own group.
    const { id } = ok(await createOuting({ name: 'mine' }))
    const [own] = await db.select().from(outings).where(eq(outings.id, id))
    expect(own.groupId).toBe(g1.groupId)

    expect(await counts(g2.outingId, g2.groupId)).toEqual(before)
    const [g2Outing] = await db.select().from(outings).where(eq(outings.id, g2.outingId))
    expect(g2Outing.status).toBe('active')
    expect(g2Outing.deletedAt).toBeNull()
    expect(await balanceOf(g1.groupId)).toBe(g1Before)
  })

  it('participant ids from another outing are rejected as payer, share, from and to', async () => {
    const g1 = await seedOuting()
    const g2 = await seedOuting()
    mockUserId = g1.userId
    const foreign = g2.pF
    const before = await counts(g1.outingId, g1.groupId)
    const reject = { ok: false, code: 'outing_participant_not_found' }

    expect(await addOutingExpense({ outingId: g1.outingId, paidByParticipantId: foreign, amount: 100, participantIds: [g1.pA] })).toEqual(reject)
    expect(await addOutingExpense({ outingId: g1.outingId, paidByParticipantId: g1.pA, amount: 100, participantIds: [g1.pA, foreign] })).toEqual(reject)
    expect(await recordOutingSettlement({ outingId: g1.outingId, fromParticipantId: foreign, toParticipantId: g1.pA, amount: 1 })).toEqual(reject)
    expect(await recordOutingSettlement({ outingId: g1.outingId, fromParticipantId: g1.pA, toParticipantId: foreign, amount: 1 })).toEqual(reject)
    expect(await counts(g1.outingId, g1.groupId)).toEqual(before)
  })
})

describe('input handling (F5–F7)', () => {
  it('rejects bad amounts through the action and writes nothing', async () => {
    const o = await seedOuting()
    const before = await counts(o.outingId, o.groupId)
    const cases: [unknown, string][] = [
      [0, 'amount_not_positive'], [-1, 'amount_not_positive'], [1.5, 'amount_invalid'],
      [Number.NaN, 'amount_invalid'], ['100', 'amount_invalid'], [10_000_000, 'amount_too_large'],
    ]
    for (const [amount, code] of cases) {
      expect(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pA, amount: amount as number, participantIds: [o.pA] }))
        .toEqual({ ok: false, code })
    }
    expect(await counts(o.outingId, o.groupId)).toEqual(before)
  })

  it('computes shares on the server: duplicates deduped, 100 over 3 → 34/33/33, client share amounts ignored', async () => {
    const o = await seedOuting()
    const { id } = ok(await addOutingExpense({
      outingId: o.outingId, paidByParticipantId: o.pA, amount: 100,
      participantIds: [o.pA, o.pB, o.pF, o.pB],
      // An attacker-supplied field is simply not part of the contract.
      ...({ shares: [{ participantId: o.pA, shareAmount: 100 }] } as object),
    }))
    const shares = await db.select().from(outingExpenseShares).where(eq(outingExpenseShares.expenseId, id))
    expect(shares).toHaveLength(3)
    expect(shares.map((s) => s.shareAmount).sort((a, b) => b - a)).toEqual([34, 33, 33])
  })

  it('a client-supplied profileId on a friend is ignored', async () => {
    const o = await seedOuting()
    const { id } = ok(await addOutingParticipant({
      outingId: o.outingId, displayName: '小美', ...({ profileId: o.partnerId } as object),
    }))
    const [p] = await db.select().from(outingParticipants).where(eq(outingParticipants.id, id))
    expect(p.profileId).toBeNull()
  })

  it('currency is forced to the group base: JPY requested on a TWD group → TWD stored', async () => {
    const seed = await seedGroup()
    mockUserId = seed.userId
    const { id } = ok(await createOuting({ name: '東京', ...({ currency: 'jpy' } as object) }))
    const [o] = await db.select().from(outings).where(eq(outings.id, id))
    expect(o.currency).toBe('twd')
  })

  it('a 60-character OAuth display name is truncated to 40 for the member participant', async () => {
    const seed = await seedGroup()
    const longName = 'A'.repeat(20) + '很長的名字'.repeat(8)
    expect(Array.from(longName)).toHaveLength(60)
    await db.update(profiles).set({ displayName: longName }).where(eq(profiles.id, seed.userId))
    mockUserId = seed.userId
    const { id } = ok(await createOuting({ name: 'x' }))
    const me = (await members(id)).find((p) => p.profileId === seed.userId)!
    expect(Array.from(me.displayName)).toHaveLength(40)
  })

  it('the 21st participant is rejected — including two parallel adds at 19', async () => {
    const o = await seedOuting() // A, B, friend = 3
    for (let i = 0; i < 16; i++) ok(await addOutingParticipant({ outingId: o.outingId, displayName: `f${i}` }))
    expect((await members(o.outingId)).length).toBe(19)
    const results = await Promise.all([
      addOutingParticipant({ outingId: o.outingId, displayName: 'p1' }),
      addOutingParticipant({ outingId: o.outingId, displayName: 'p2' }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: 'outing_participant_limit' }])
    expect((await members(o.outingId)).length).toBe(20)
    expect(await addOutingParticipant({ outingId: o.outingId, displayName: 'late' }))
      .toEqual({ ok: false, code: 'outing_participant_limit' })
  })
})

// ─── S-D: foldback + lock discipline ───

describe('endOuting folds the couple debt into the main ledger (S-D)', () => {
  it('A/B + friend: exactly one Settlement, GroupBalance moves by exactly the net, friends never touch the main ledger', async () => {
    const o = await seedOuting()
    // A pays 300 split three ways; B pays 60 split A/B; the friend repays A 100.
    // By hand: B owes A 100 − 30 = 70. The friend's repayment does not fold.
    ok(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pA, amount: 300, participantIds: [o.pA, o.pB, o.pF] }))
    ok(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pB, amount: 60, participantIds: [o.pA, o.pB] }))
    ok(await recordOutingSettlement({ outingId: o.outingId, fromParticipantId: o.pF, toParticipantId: o.pA, amount: 100 }))
    const balanceBefore = await balanceOf(o.groupId)
    const cashBefore = (await counts(o.outingId, o.groupId)).cash

    expect(ok(await endOuting({ outingId: o.outingId }))).toEqual({ folded: true })

    const rows = await db.select().from(settlements).where(eq(settlements.groupId, o.groupId))
    expect(rows).toHaveLength(1)
    expect(rows[0].paidBy).toBe(o.userId) // member_a
    expect(rows[0].amount).toBe(70)
    expect(rows[0].note).toContain('宜蘭')
    expect(await balanceOf(o.groupId)).toBe(balanceBefore + 70)
    expect((await counts(o.outingId, o.groupId)).cash).toBe(cashBefore)

    const [ended] = await db.select().from(outings).where(eq(outings.id, o.outingId))
    expect(ended.status).toBe('ended')
    expect(ended.foldedAt).not.toBeNull()
  })

  it('A owes B → paid_by member_b; members inserted in reverse order still resolve by profile', async () => {
    const seed = await seedGroup()
    mockUserId = seed.userId
    // Build the outing by hand with B's participant row created BEFORE A's.
    const [epoch] = await db.select().from(groupEpochs).where(and(eq(groupEpochs.groupId, seed.groupId), isNull(groupEpochs.endedAt)))
    const [o] = await db.insert(outings).values({ groupId: seed.groupId, epochId: epoch.id, createdBy: seed.userId, name: 'rev', currency: 'twd' }).returning()
    const [pB] = await db.insert(outingParticipants).values({ outingId: o.id, displayName: 'B', profileId: seed.partnerId }).returning()
    const [pA] = await db.insert(outingParticipants).values({ outingId: o.id, displayName: 'A', profileId: seed.userId }).returning()
    ok(await addOutingExpense({ outingId: o.id, paidByParticipantId: pB.id, amount: 90, participantIds: [pA.id, pB.id] }))

    ok(await endOuting({ outingId: o.id }))
    const rows = await db.select().from(settlements).where(eq(settlements.groupId, seed.groupId))
    expect(rows).toHaveLength(1)
    expect(rows[0].paidBy).toBe(seed.partnerId) // member_b
    expect(rows[0].amount).toBe(45)
    expect(await balanceOf(seed.groupId)).toBe(-45)
  })

  it('net 0 and solo → no Settlement', async () => {
    const even = await seedOuting()
    ok(await addOutingExpense({ outingId: even.outingId, paidByParticipantId: even.pF, amount: 100, participantIds: [even.pA, even.pB] }))
    expect(ok(await endOuting({ outingId: even.outingId }))).toEqual({ folded: false })
    expect(await db.select().from(settlements).where(eq(settlements.groupId, even.groupId))).toHaveLength(0)

    const solo = await seedGroup({ solo: true })
    mockUserId = solo.userId
    const { id } = ok(await createOuting({ name: 'solo' }))
    const [me] = await members(id)
    const { id: f } = ok(await addOutingParticipant({ outingId: id, displayName: 'f' }))
    ok(await addOutingExpense({ outingId: id, paidByParticipantId: me.id, amount: 100, participantIds: [me.id, f] }))
    expect(ok(await endOuting({ outingId: id }))).toEqual({ folded: false })
    expect(await db.select().from(settlements).where(eq(settlements.groupId, solo.groupId))).toHaveLength(0)
    expect(await balanceOf(solo.groupId)).toBe(0)
  })

  it('second end is rejected and writes nothing; every mutation after end is rejected', async () => {
    const o = await seedOuting()
    ok(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pA, amount: 100, participantIds: [o.pA, o.pB] }))
    ok(await endOuting({ outingId: o.outingId }))
    const after = await counts(o.outingId, o.groupId)
    const bal = await balanceOf(o.groupId)
    const closed = { ok: false, code: 'outing_not_active' }

    expect(await endOuting({ outingId: o.outingId })).toEqual(closed)
    expect(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pA, amount: 5, participantIds: [o.pA] })).toEqual(closed)
    expect(await recordOutingSettlement({ outingId: o.outingId, fromParticipantId: o.pB, toParticipantId: o.pA, amount: 5 })).toEqual(closed)
    expect(await addOutingParticipant({ outingId: o.outingId, displayName: 'late' })).toEqual(closed)
    expect(await counts(o.outingId, o.groupId)).toEqual(after)
    expect(await balanceOf(o.groupId)).toBe(bal)
  })

  it('soft-deleting a folded outing leaves the Settlement and GroupBalance alone', async () => {
    const o = await seedOuting()
    ok(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pA, amount: 100, participantIds: [o.pA, o.pB] }))
    ok(await endOuting({ outingId: o.outingId }))
    const bal = await balanceOf(o.groupId)
    ok(await softDeleteOuting({ outingId: o.outingId }))
    expect(await balanceOf(o.groupId)).toBe(bal)
    expect(await db.select().from(settlements).where(and(eq(settlements.groupId, o.groupId), isNull(settlements.deletedAt)))).toHaveLength(1)
  })

  it('the partner (member_b) may end and delete too (Q4)', async () => {
    const o = await seedOuting()
    mockUserId = o.partnerId!
    ok(await endOuting({ outingId: o.outingId }))
    ok(await softDeleteOuting({ outingId: o.outingId }))
  })

  it('a viewer pinned to a past epoch is rejected by the write gate', async () => {
    const o = await seedOuting()
    const [oldEpoch] = await db.select().from(groupEpochs).where(and(eq(groupEpochs.groupId, o.groupId), isNull(groupEpochs.endedAt)))
    const now = new Date()
    await db.update(groupEpochs).set({ endedAt: now }).where(eq(groupEpochs.id, oldEpoch.id))
    await db.insert(groupEpochs).values({ groupId: o.groupId, startedAt: now, memberAId: o.userId, memberBId: o.partnerId })
    await db.update(oikosGroups).set({ currentEpochStartedAt: now }).where(eq(oikosGroups.id, o.groupId))
    cookieJar.set(PAST_EPOCH_COOKIE, oldEpoch.id)
    await expect(endOuting({ outingId: o.outingId })).rejects.toThrow()
    const [still] = await db.select().from(outings).where(eq(outings.id, o.outingId))
    expect(still.status).toBe('active')
  })

  it("a solo owner's outing whose epoch closed (partner accepted an invite) can still be ended, without a Settlement", async () => {
    const solo = await seedGroup({ solo: true })
    mockUserId = solo.userId
    const { id } = ok(await createOuting({ name: 'before partner' }))
    await partnerJoins(solo.groupId, solo.userId)

    // A past-epoch outing is read-only for content, but it can be ended.
    const [me] = await members(id)
    expect(await addOutingExpense({ outingId: id, paidByParticipantId: me.id, amount: 5, participantIds: [me.id] }))
      .toEqual({ ok: false, code: 'outing_epoch_closed' })
    expect(ok(await endOuting({ outingId: id }))).toEqual({ folded: false })
    expect(await db.select().from(settlements).where(eq(settlements.groupId, solo.groupId))).toHaveLength(0)
  })
})

describe('end vs a concurrent mutation (F4) — no expense can land after the fold', () => {
  it('an expense in flight when end starts is included in the fold', async () => {
    const o = await seedOuting()
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    // Stand-in for addOutingExpense mid-transaction: holds FOR SHARE on the
    // outing, has inserted its expense, has not committed.
    const inFlight = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM "Outings" WHERE id = ${o.outingId} FOR SHARE`)
      const [e] = await tx.insert(outingExpenses).values({ outingId: o.outingId, paidByParticipantId: o.pA, amount: 80 }).returning()
      await tx.insert(outingExpenseShares).values([
        { expenseId: e.id, participantId: o.pA, shareAmount: 40 },
        { expenseId: e.id, participantId: o.pB, shareAmount: 40 },
      ])
      await held
    })
    const ending = endOuting({ outingId: o.outingId })
    await waitForLockWaiter() // endOuting is blocked behind the in-flight expense
    release()
    await inFlight
    expect(ok(await ending)).toEqual({ folded: true })
    const [s] = await db.select().from(settlements).where(eq(settlements.groupId, o.groupId))
    expect(s.amount).toBe(40) // the in-flight expense counted
  })

  it('an expense that starts after end has the lock is rejected', async () => {
    const o = await seedOuting()
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    // Stand-in for endOuting between its status flip and its commit.
    const ending = db.transaction(async (tx) => {
      await tx.update(outings).set({ status: 'ended', endedAt: new Date(), foldedAt: new Date() }).where(eq(outings.id, o.outingId))
      await held
    })
    const adding = addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pA, amount: 80, participantIds: [o.pA, o.pB] })
    await waitForLockWaiter()
    release()
    await ending
    expect(await adding).toEqual({ ok: false, code: 'outing_not_active' })
    expect(await db.select().from(outingExpenses).where(eq(outingExpenses.outingId, o.outingId))).toHaveLength(0)
  })
})

// ─── S-E: membership fences ───

describe('membership fences (S-E)', () => {
  it('leave and remove are blocked while an outing is active, and allowed after it ends', async () => {
    const o = await seedOuting()
    mockUserId = o.partnerId!
    expect(await leaveGroup()).toEqual({ ok: false, code: 'leave_active_outing' })
    mockUserId = o.userId
    expect(await removePartner()).toEqual({ ok: false, code: 'active_outing' })
    ok(await endOuting({ outingId: o.outingId })) // nothing spent → no fold, balance stays 0
    mockUserId = o.partnerId!
    ok(await leaveGroup())
  })

  it('an active outing in a past epoch does not block', async () => {
    const solo = await seedGroup({ solo: true })
    mockUserId = solo.userId
    ok(await createOuting({ name: 'old chapter' }))
    await partnerJoins(solo.groupId, solo.userId)
    ok(await removePartner())
  })

  it('an endOuting that commits while leave waits for the group lock makes the leave fail, and nothing changes', async () => {
    const o = await seedOuting()
    ok(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pA, amount: 100, participantIds: [o.pA, o.pB] }))
    const epochsBefore = await db.select().from(groupEpochs).where(eq(groupEpochs.groupId, o.groupId))
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    // Stand-in for endOuting's second half: holds the group row, has folded 50
    // into the ledger and ended the outing, has not committed.
    const folding = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM "OikosGroups" WHERE id = ${o.groupId} FOR UPDATE`)
      await tx.update(outings).set({ status: 'ended', endedAt: new Date(), foldedAt: new Date() }).where(eq(outings.id, o.outingId))
      await tx.insert(settlements).values({ groupId: o.groupId, paidBy: o.userId, amount: 50, settledAt: new Date() })
      await recalcGroupBalance(o.groupId, tx)
      await held
    })
    mockUserId = o.partnerId!
    const leaving = leaveGroup()
    await waitForLockWaiter()
    release()
    await folding
    expect(await leaving).toEqual({ ok: false, code: 'balance_not_zero' })
    expect(await db.select().from(groupEpochs).where(eq(groupEpochs.groupId, o.groupId))).toEqual(epochsBefore)
    const [g] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, o.groupId))
    expect(g.memberB).toBe(o.partnerId)
  })
})

// ─── #1378 review fixes ───

describe('base currency vs an outing (P2)', () => {
  it('the base currency is locked while an outing is active, and free again once it ends with nothing to fold', async () => {
    const seed = await seedGroup()
    mockUserId = seed.userId
    const { id } = ok(await createOuting({ name: 'x' }))
    expect(await setBaseCurrency({ currency: 'jpy' })).toEqual({ ok: false, code: 'base_currency_locked' })
    expect(ok(await endOuting({ outingId: id }))).toEqual({ folded: false })
    ok(await setBaseCurrency({ currency: 'jpy' }))
  })

  it('if the base changes anyway (a race past the lock), end refuses and writes nothing; switching back lets it fold', async () => {
    const o = await seedOuting()
    ok(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pA, amount: 3000, participantIds: [o.pA, o.pB] }))
    // Stand-in for a setBaseCurrency that passed its guard before the outing existed.
    await db.update(oikosGroups).set({ baseCurrency: 'jpy' }).where(eq(oikosGroups.id, o.groupId))

    expect(await endOuting({ outingId: o.outingId })).toEqual({ ok: false, code: 'outing_currency_changed' })
    expect(await db.select().from(settlements).where(eq(settlements.groupId, o.groupId))).toHaveLength(0)
    expect(await balanceOf(o.groupId)).toBe(0)
    const [still] = await db.select().from(outings).where(eq(outings.id, o.outingId))
    expect(still.status).toBe('active')
    expect(still.foldedAt).toBeNull()

    await db.update(oikosGroups).set({ baseCurrency: 'twd' }).where(eq(oikosGroups.id, o.groupId))
    expect(ok(await endOuting({ outingId: o.outingId }))).toEqual({ folded: true })
    expect(await balanceOf(o.groupId)).toBe(1500)
  })

  it('a mismatch with nothing to fold still ends (no debt is dropped)', async () => {
    const o = await seedOuting()
    await db.update(oikosGroups).set({ baseCurrency: 'jpy' }).where(eq(oikosGroups.id, o.groupId))
    expect(ok(await endOuting({ outingId: o.outingId }))).toEqual({ folded: false })
  })
})

describe('malformed ids (P3) — "not found", never an unexpected 22P02', () => {
  it('a non-UUID outing id on every action', async () => {
    const o = await seedOuting()
    const bad = 'not-a-uuid'
    const notFound = { ok: false, code: 'outing_not_found' }
    expect(await addOutingParticipant({ outingId: bad, displayName: 'x' })).toEqual(notFound)
    expect(await addOutingExpense({ outingId: bad, paidByParticipantId: o.pA, amount: 1, participantIds: [o.pA] })).toEqual(notFound)
    expect(await recordOutingSettlement({ outingId: bad, fromParticipantId: o.pA, toParticipantId: o.pB, amount: 1 })).toEqual(notFound)
    expect(await endOuting({ outingId: bad })).toEqual(notFound)
    expect(await softDeleteOuting({ outingId: bad })).toEqual(notFound)
  })

  it('non-UUID participant ids', async () => {
    const o = await seedOuting()
    const reject = { ok: false, code: 'outing_participant_not_found' }
    expect(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: 'x', amount: 1, participantIds: [o.pA] })).toEqual(reject)
    expect(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pA, amount: 1, participantIds: ['x'] })).toEqual(reject)
    expect(await recordOutingSettlement({ outingId: o.outingId, fromParticipantId: 'x', toParticipantId: o.pA, amount: 1 })).toEqual(reject)
  })
})

describe('createOuting vs a concurrent partner removal (P3)', () => {
  it('waits for the group lock and then builds the outing from the group as it is after the removal', async () => {
    const seed = await seedGroup()
    mockUserId = seed.userId
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    // Stand-in for removePartner mid-transaction: group row locked, member_b
    // cleared, the duo epoch closed and a solo one opened; not committed.
    let newEpochId = ''
    const removing = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM "OikosGroups" WHERE id = ${seed.groupId} FOR UPDATE`)
      const now = new Date()
      await tx.update(groupEpochs).set({ endedAt: now }).where(and(eq(groupEpochs.groupId, seed.groupId), isNull(groupEpochs.endedAt)))
      const [e] = await tx.insert(groupEpochs).values({ groupId: seed.groupId, startedAt: now, memberAId: seed.userId, memberBId: null }).returning()
      newEpochId = e.id
      await tx.update(oikosGroups).set({ memberB: null, currentEpochStartedAt: now }).where(eq(oikosGroups.id, seed.groupId))
      await held
    })
    const creating = createOuting({ name: 'race' })
    await waitForLockWaiter()
    release()
    await removing
    const { id } = ok(await creating)
    const [o] = await db.select().from(outings).where(eq(outings.id, id))
    expect(o.epochId).toBe(newEpochId)
    const ps = await members(id)
    expect(ps.map((p) => p.profileId)).toEqual([seed.userId]) // the removed partner is not a participant
  })
})

describe('setBaseCurrency and createOuting serialize on the group row (#1378 re-verify)', () => {
  it('an outing committing while the currency change waits → the change is refused', async () => {
    const seed = await seedGroup()
    mockUserId = seed.userId
    const [epoch] = await db.select().from(groupEpochs).where(and(eq(groupEpochs.groupId, seed.groupId), isNull(groupEpochs.endedAt)))
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    // Stand-in for createOuting mid-transaction: group row FOR SHARE, outing inserted, not committed.
    const creating = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM "OikosGroups" WHERE id = ${seed.groupId} FOR SHARE`)
      await tx.insert(outings).values({ groupId: seed.groupId, epochId: epoch.id, createdBy: seed.userId, name: 'race', currency: 'twd' })
      await held
    })
    const changing = setBaseCurrency({ currency: 'jpy' })
    await waitForLockWaiter()
    release()
    await creating
    expect(await changing).toEqual({ ok: false, code: 'base_currency_locked' })
    const [g] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, seed.groupId))
    expect(g.baseCurrency).toBe('twd')
  })

  it('a currency change committing while createOuting waits → the outing opens in the new base', async () => {
    const seed = await seedGroup()
    mockUserId = seed.userId
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    // Stand-in for setBaseCurrency mid-transaction: group row FOR UPDATE, base switched, not committed.
    const changing = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM "OikosGroups" WHERE id = ${seed.groupId} FOR UPDATE`)
      await tx.update(oikosGroups).set({ baseCurrency: 'jpy' }).where(eq(oikosGroups.id, seed.groupId))
      await held
    })
    const creating = createOuting({ name: 'after' })
    await waitForLockWaiter()
    release()
    await changing
    const { id } = ok(await creating)
    const [o] = await db.select().from(outings).where(eq(outings.id, id))
    expect(o.currency).toBe('jpy')
  })
})
