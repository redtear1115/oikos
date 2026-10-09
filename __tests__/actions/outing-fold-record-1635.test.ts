import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import postgres from 'postgres'
import { loadEnvLocal, seedGroup as seedGroupRow } from '../outing/_setup'

// ─── #1635: an ended outing stops listing the line it already folded ────────
//
// Integration tests against the real DEV database; they need
// 0091_outing_fold_record applied (every Outings select names fold_*: without
// it they fail with 42703). Excluded from CI with the rest of
// __tests__/actions/** (vitest.config.ci.ts).
// ──────────────────────────────────────────────────────────────────────────────

loadEnvLocal()
vi.setConfig({ testTimeout: 60_000 })

let mockUserId = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
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
  outings, outingParticipants, outingExpenses, outingExpenseShares, outingSettlements, settlements,
  oikosGroups,
} = await import('@/lib/db/schema')
const { eq, inArray, sql } = await import('drizzle-orm')
const {
  createOuting, addOutingParticipant, addOutingExpense, endOuting,
} = await import('@/actions/outing')
const { proposeSwap, confirmSwap } = await import('@/actions/membership')
const { getOutingDetail } = await import('@/lib/db/queries/outing')
const { getOutingFullView } = await import('@/lib/db/queries/outingPublic')
const { buildOutingView } = await import('@/lib/outing/view')
const { memberPidsOf } = await import('@/lib/outing/foldback')

beforeEach(() => cookieJar.clear())

// Admin connection (DATABASE_URL_DIRECT): triggers, _delete_group_cascade and
// the purge need rights futari_app deliberately lacks. Dev only.
function admin() {
  const url = process.env.DATABASE_URL_DIRECT!
  expect(new URL(url).username).toContain('ufhcprrauwsxdmscbkrf') // dev project, never prod
  return postgres(url, { max: 1, prepare: false, onnotice: () => {} })
}

const seededGroups = new Set<string>()
async function seedGroup(opts?: Parameters<typeof seedGroupRow>[0]) {
  const seed = await seedGroupRow(opts)
  seededGroups.add(seed.groupId)
  return seed
}

async function purgeOutingRows(ids: string[]) {
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
}

afterAll(async () => {
  const ids = [...seededGroups]
  await purgeOutingRows(ids)
  // Measured: no outing row of any group this file created is left behind.
  const [{ n }] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM "Outings" WHERE group_id IN ${ids}`)
  console.log(`[#1635] leftover Outings rows for test-created groups: ${n}`)
  expect(Number(n)).toBe(0)
})

function ok<T>(r: { ok: true; data: T } | { ok: false; code: string }): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}`)
  return r.data
}

async function members(outingId: string) {
  return db.select().from(outingParticipants).where(eq(outingParticipants.outingId, outingId))
}

async function outingRow(id: string) {
  const [o] = await db.select().from(outings).where(eq(outings.id, id))
  return o
}

/** Duo group + outing with both members, one friend (阿傑) and a second (阿美). */
async function seedOuting() {
  const seed = await seedGroup()
  mockUserId = seed.userId
  const { id: outingId } = ok(await createOuting({ name: '宜蘭' }))
  const ps = await members(outingId)
  const pA = ps.find((p) => p.profileId === seed.userId)!.id
  const pB = ps.find((p) => p.profileId === seed.partnerId)!.id
  const { id: pF } = ok(await addOutingParticipant({ outingId, displayName: '阿傑' }))
  const { id: pG } = ok(await addOutingParticipant({ outingId, displayName: '阿美' }))
  return { ...seed, outingId, pA, pB, pF, pG }
}

type Seeded = Awaited<ReturnType<typeof seedOuting>>

/** A 8000, F 3200, G 1200 paid, split four ways: the suggestions include a B→A line plus friends' lines. */
async function spendWithMemberLine(o: Seeded) {
  const all = [o.pA, o.pB, o.pF, o.pG]
  ok(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pA, amount: 8000, participantIds: all }))
  ok(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pF, amount: 3200, participantIds: all }))
  ok(await addOutingExpense({ outingId: o.outingId, paidByParticipantId: o.pG, amount: 1200, participantIds: all }))
}

const isMemberLine = (o: Seeded) => (t: { from: string; to: string }) =>
  [t.from, t.to].every((id) => id === o.pA || id === o.pB)

/** What the member page (page.tsx) renders. */
async function memberViewTransfers(o: Seeded) {
  const detail = (await getOutingDetail(o.outingId))!
  const [g] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, o.groupId))
  const { a, b } = memberPidsOf(detail.participants, g.memberA, g.memberB)
  return buildOutingView({
    participants: detail.participants.map((p) => ({ id: p.id, displayName: p.displayName, profileId: p.profileId })),
    expenses: detail.expenses.map((e) => ({ paidByParticipantId: e.paidByParticipantId, amount: e.amount, shares: e.shares })),
    settlements: detail.settlements.map((x) => ({ fromParticipantId: x.fromParticipantId, toParticipantId: x.toParticipantId, amount: x.amount })),
    memberAParticipantId: a,
    memberBParticipantId: b,
    foldedLine: detail.outing.foldFromParticipantId && detail.outing.foldToParticipantId
      ? { from: detail.outing.foldFromParticipantId, to: detail.outing.foldToParticipantId }
      : null,
  }).transfers
}

async function publicView(o: Seeded) {
  const row = await outingRow(o.outingId)
  return getOutingFullView(
    { id: row.id, groupId: row.groupId, epochId: row.epochId, status: row.status, name: row.name, currency: row.currency },
    { kind: 'participant', participantId: o.pF } as never,
  )
}

describe('endOuting stores the folded line (#1635)', () => {
  it('writes Settlement + fold_* together: from = debtor B, to = creditor A, amount = the line', async () => {
    const o = await seedOuting()
    await spendWithMemberLine(o)
    const before = await memberViewTransfers(o)
    const line = before.find(isMemberLine(o))!
    expect(line).toEqual({ from: o.pB, to: o.pA, amount: line.amount })

    expect(ok(await endOuting({ outingId: o.outingId }))).toEqual({ folded: true })
    const row = await outingRow(o.outingId)
    expect(row.foldFromParticipantId).toBe(o.pB)
    expect(row.foldToParticipantId).toBe(o.pA)
    expect(row.foldAmount).toBe(line.amount)
    const rows = await db.select().from(settlements).where(eq(settlements.groupId, o.groupId))
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(line.amount)
  })

  it('a Settlement insert failure rolls back everything, fold_* included', async () => {
    const o = await seedOuting()
    await spendWithMemberLine(o)
    const sa = admin()
    try {
      await sa.unsafe(`CREATE OR REPLACE FUNCTION public.t1635_fail() RETURNS trigger LANGUAGE plpgsql AS $f$
        BEGIN IF NEW.group_id = '${o.groupId}' THEN RAISE EXCEPTION 't1635 forced settlement failure'; END IF; RETURN NEW; END $f$`)
      await sa.unsafe(`CREATE TRIGGER t1635_fail BEFORE INSERT ON "Settlements" FOR EACH ROW EXECUTE FUNCTION public.t1635_fail()`)
      await expect(endOuting({ outingId: o.outingId })).rejects.toThrow()
    } finally {
      await sa.unsafe(`DROP TRIGGER IF EXISTS t1635_fail ON "Settlements"`)
      await sa.unsafe(`DROP FUNCTION IF EXISTS public.t1635_fail()`)
      await sa.end()
    }
    const row = await outingRow(o.outingId)
    expect(row.status).toBe('active')
    expect(row.foldedAt).toBeNull()
    expect(row.foldFromParticipantId).toBeNull()
    expect(row.foldToParticipantId).toBeNull()
    expect(row.foldAmount).toBeNull()
    expect(await db.select().from(settlements).where(eq(settlements.groupId, o.groupId))).toHaveLength(0)
  })

  it('member page and public view omit the folded line and keep the friends’ lines', async () => {
    const o = await seedOuting()
    await spendWithMemberLine(o)
    const active = await memberViewTransfers(o)
    expect(active.some(isMemberLine(o))).toBe(true)
    const friendsLines = active.filter((t) => !isMemberLine(o)(t))
    expect(friendsLines.length).toBeGreaterThan(0)

    ok(await endOuting({ outingId: o.outingId }))
    const member = await memberViewTransfers(o)
    expect(member.some(isMemberLine(o))).toBe(false)
    expect(member).toEqual(friendsLines)

    const pub = await publicView(o)
    expect(pub.outing.status).toBe('ended')
    expect(pub.transfers.some(isMemberLine(o))).toBe(false)
    expect(pub.transfers).toEqual(friendsLines)
  })

  it('the public payload has no profile id and no fold_* field', async () => {
    const o = await seedOuting()
    await spendWithMemberLine(o)
    ok(await endOuting({ outingId: o.outingId }))
    const json = JSON.stringify(await publicView(o))
    expect(json).not.toMatch(/fold/i)
    expect(json).not.toMatch(/profileId|profile_id/)
    expect(json).not.toContain(o.userId)
    expect(json).not.toContain(o.partnerId!)
  })

  it('no fold leaves fold_* NULL and the view unchanged: no member line, or under 1 whole unit', async () => {
    // No A<->B line: friends absorb it.
    const a = await seedOuting()
    const all = [a.pA, a.pB, a.pF, a.pG]
    ok(await addOutingExpense({ outingId: a.outingId, paidByParticipantId: a.pA, amount: 8000, participantIds: all }))
    ok(await addOutingExpense({ outingId: a.outingId, paidByParticipantId: a.pB, amount: 4000, participantIds: all }))
    ok(await addOutingExpense({ outingId: a.outingId, paidByParticipantId: a.pF, amount: 800, participantIds: all }))
    const beforeA = await memberViewTransfers(a)
    expect(ok(await endOuting({ outingId: a.outingId }))).toEqual({ folded: false })
    const ra = await outingRow(a.outingId)
    expect([ra.foldFromParticipantId, ra.foldToParticipantId, ra.foldAmount]).toEqual([null, null, null])
    expect(await memberViewTransfers(a)).toEqual(beforeA)

    // USD: a 1-cent line is under one whole dollar.
    const b = await seedOuting()
    await db.update(outings).set({ currency: 'usd' }).where(eq(outings.id, b.outingId))
    await db.update(oikosGroups).set({ baseCurrency: 'usd' }).where(eq(oikosGroups.id, b.groupId))
    ok(await addOutingExpense({ outingId: b.outingId, paidByParticipantId: b.pA, amount: 2, participantIds: [b.pA, b.pB] }))
    expect(ok(await endOuting({ outingId: b.outingId }))).toEqual({ folded: false })
    const rb = await outingRow(b.outingId)
    expect([rb.foldFromParticipantId, rb.foldToParticipantId, rb.foldAmount]).toEqual([null, null, null])
    expect(await db.select().from(settlements).where(eq(settlements.groupId, b.groupId))).toHaveLength(0)
  })

  it('account deletion nulling a member participant’s profile_id keeps the line hidden', async () => {
    const o = await seedOuting()
    await spendWithMemberLine(o)
    ok(await endOuting({ outingId: o.outingId }))
    // The same UPDATE process_account_deletions runs for the leaver (0088).
    await db.execute(sql`
      UPDATE "OutingParticipants"
        SET profile_id = NULL, display_name = '已離開的夥伴',
            claim_token_hash = NULL, claimed_at = COALESCE(claimed_at, now())
        WHERE profile_id = ${o.partnerId}`)
    expect((await memberViewTransfers(o)).some(isMemberLine(o))).toBe(false)
    expect((await publicView(o)).transfers.some(isMemberLine(o))).toBe(false)
  })

  it('confirmSwap after the end keeps the line hidden', async () => {
    const o = await seedOuting()
    await spendWithMemberLine(o)
    ok(await endOuting({ outingId: o.outingId }))
    mockUserId = o.userId
    ok(await proposeSwap())
    mockUserId = o.partnerId!
    ok(await confirmSwap())
    expect((await memberViewTransfers(o)).some(isMemberLine(o))).toBe(false)
  })
})

describe('outings_fold_record_check', () => {
  it('rejects a partial record, a zero amount and a self line; accepts all-NULL', async () => {
    const o = await seedOuting()
    const set = (v: Partial<typeof outings.$inferInsert>) => db.update(outings).set(v).where(eq(outings.id, o.outingId))
    await expect(set({ foldAmount: 5 })).rejects.toThrow()
    await expect(set({ foldFromParticipantId: o.pB })).rejects.toThrow()
    await expect(set({ foldFromParticipantId: o.pB, foldToParticipantId: o.pA })).rejects.toThrow()
    await expect(set({ foldFromParticipantId: o.pB, foldToParticipantId: o.pA, foldAmount: 0 })).rejects.toThrow()
    await expect(set({ foldFromParticipantId: o.pA, foldToParticipantId: o.pA, foldAmount: 5 })).rejects.toThrow()
    await set({ foldFromParticipantId: o.pB, foldToParticipantId: o.pA, foldAmount: 5 })
    await set({ foldFromParticipantId: null, foldToParticipantId: null, foldAmount: null })
  })
})

describe('hard-delete paths still work on a folded outing (no FK on fold_*)', () => {
  it('_delete_group_cascade leaves 0 outing, participant, expense and settlement rows', async () => {
    const o = await seedOuting()
    await spendWithMemberLine(o)
    ok(await endOuting({ outingId: o.outingId }))
    expect((await outingRow(o.outingId)).foldAmount).not.toBeNull()

    const sa = admin()
    try {
      await sa`SELECT public._delete_group_cascade(${o.groupId}::uuid)`
      const [r] = await sa<{ o: number; p: number; e: number; s: number; os: number }[]>`
        SELECT (SELECT count(*) FROM "Outings" WHERE group_id = ${o.groupId})::int AS o,
               (SELECT count(*) FROM "OutingParticipants" WHERE outing_id = ${o.outingId})::int AS p,
               (SELECT count(*) FROM "OutingExpenses" WHERE outing_id = ${o.outingId})::int AS e,
               (SELECT count(*) FROM "Settlements" WHERE group_id = ${o.groupId})::int AS s,
               (SELECT count(*) FROM "OutingSettlements" WHERE outing_id = ${o.outingId})::int AS os`
      console.log(`[#1635] after _delete_group_cascade: ${JSON.stringify(r)}`)
      expect(r).toEqual({ o: 0, p: 0, e: 0, s: 0, os: 0 })
    } finally {
      await sa.end()
    }
  })

  it('the cleanup-soft-deleted cron’s outing statements remove a folded outing soft-deleted over a year ago', async () => {
    const o = await seedOuting()
    await spendWithMemberLine(o)
    ok(await endOuting({ outingId: o.outingId }))
    await db.update(outings).set({ deletedAt: sql`now() - interval '13 months'` }).where(eq(outings.id, o.outingId))

    const sa = admin()
    try {
      // The exact statements of the live job, read from cron.job. Only the
      // Outing* ones run, inside a transaction that is rolled back, so other
      // old rows on the shared dev project are not purged by this test.
      const [{ command }] = await sa<{ command: string }[]>`SELECT command FROM cron.job WHERE jobname = 'cleanup-soft-deleted'`
      const stmts = command.split(/;\s*\n/).map((s) => s.trim()).filter((s) => /"Outing/.test(s))
      expect(stmts.length).toBe(5)
      let result: { o: number; p: number } | undefined
      await sa.begin(async (tx) => {
        for (const st of stmts) await tx.unsafe(st)
        const [r] = await tx<{ o: number; p: number }[]>`
          SELECT (SELECT count(*) FROM "Outings" WHERE id = ${o.outingId})::int AS o,
                 (SELECT count(*) FROM "OutingParticipants" WHERE outing_id = ${o.outingId})::int AS p`
        result = r
        throw new Error('rollback')
      }).catch((e) => { if ((e as Error).message !== 'rollback') throw e })
      console.log(`[#1635] after cron purge statements: ${JSON.stringify(result)}`)
      expect(result).toEqual({ o: 0, p: 0 })
    } finally {
      await sa.end()
    }
  })
})
