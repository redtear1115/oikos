import { describe, it, expect, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1588 S3 — removePartner pauses the ex's recurring rules ─────────────
//
// removePartner (same transaction): pauses every live rule whose person is
// the removed member (COALESCE keeps an earlier paused_at), deletes the
// unprocessed pending cards of those rules whatever their earlier paused
// state, keeps skipped / resolved cards and written transactions, resets a
// stale proposed_paid_by on the stayer's rules, and leaves the stayer's own
// rules alone. resumeRule then refuses a rule whose person is not a current
// member (`rule_person_not_member`, paused_at unchanged) until updateRule
// re-assigns it.
//
// Failure looks like: cards of the ex keep arriving every period and can
// never be confirmed; or 恢復 on a former-person rule "works" and the cards
// start again.
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

let mockUserId = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))

const { db } = await import('@/lib/db/client')
const {
  profiles, oikosGroups, groupBalance, groupEpochs,
  recurringIncomeRules, recurringExpenseRules, pendingIncomeOccurrences, pendingExpenseOccurrences,
  cashTransactions,
} = await import('@/lib/db/schema')
const { removePartner } = await import('@/actions/membership')
const expense = await import('@/actions/recurringExpense')
const income = await import('@/actions/recurringIncome')
const { unwrapAction } = await import('@/lib/action-errors')
const { eq, inArray } = await import('drizzle-orm')

if (!process.env.DATABASE_URL?.includes('ufhcprrauwsxdmscbkrf')) {
  throw new Error('#1588 S3 dev-DB test: DATABASE_URL must point at the dev project (oikos-dev)')
}

const RULE = { intervalMonths: 1, dayOfMonth: 5, startsOn: '2026-01-05', nextOccurrenceAt: '2027-01-05' }
const EARLIER = new Date('2026-01-01T00:00:00Z')

interface Seed {
  a: string; b: string; groupId: string
  exIncome: string; exExpensePaused: string; ownIncome: string; ownExpense: string
  pend: Record<string, string>; txId: string
}
let seeded: Seed | null = null

async function seed(): Promise<Seed> {
  const a = randomUUID(); const b = randomUUID()
  await db.insert(profiles).values([{ id: a, displayName: 'TEST_1588S3_A' }, { id: b, displayName: 'TEST_1588S3_B' }])
  const [g] = await db.insert(oikosGroups).values({ name: 'TEST_1588S3', memberA: a, memberB: b }).returning({ id: oikosGroups.id })
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: g.id, startedAt: new Date('2026-05-10T00:00:00Z'), memberAId: a, memberBId: b })

  const [exI] = await db.insert(recurringIncomeRules).values({ groupId: g.id, recipientId: b, amount: 50000, category: 'salary', ...RULE }).returning({ id: recurringIncomeRules.id })
  const [ownI] = await db.insert(recurringIncomeRules).values({ groupId: g.id, recipientId: a, amount: 40000, category: 'salary', ...RULE }).returning({ id: recurringIncomeRules.id })
  // already paused by the user earlier: its unprocessed card must still go
  const [exE] = await db.insert(recurringExpenseRules).values({ groupId: g.id, paidBy: b, amount: 1200, splitType: 'half', description: 'TEST_1588S3 gym', category: 'other', pausedAt: EARLIER, ...RULE }).returning({ id: recurringExpenseRules.id })
  const [ownE] = await db.insert(recurringExpenseRules).values({ groupId: g.id, paidBy: a, amount: 20000, splitType: 'half', description: 'TEST_1588S3 rent', category: 'housing', ...RULE }).returning({ id: recurringExpenseRules.id })
  const [tx] = await db.insert(cashTransactions).values({ groupId: g.id, paidBy: b, amount: 100, category: 'other', description: 'TEST_1588S3 history', splitType: 'half', transactedAt: new Date('2026-06-01T00:00:00Z') }).returning({ id: cashTransactions.id })

  const pi = await db.insert(pendingIncomeOccurrences).values([
    { groupId: g.id, ruleId: exI.id, periodStart: '2026-08-05', proposedAmount: 50000, proposedDate: '2026-08-05' },
    { groupId: g.id, ruleId: exI.id, periodStart: '2026-09-05', proposedAmount: 50000, proposedDate: '2026-09-05', skippedAt: new Date() },
    { groupId: g.id, ruleId: ownI.id, periodStart: '2026-08-05', proposedAmount: 40000, proposedDate: '2026-08-05' },
  ]).returning({ id: pendingIncomeOccurrences.id })
  const exp = (ruleId: string, day: number, paidBy: string, extra: object = {}) => ({
    groupId: g.id, ruleId, periodStart: `2026-0${day}-05`, proposedAmount: 100, proposedDate: `2026-0${day}-05`,
    proposedDescription: 'x', proposedPaidBy: paidBy, proposedSplitType: 'half' as const, ...extra,
  })
  const pe = await db.insert(pendingExpenseOccurrences).values([
    exp(exE.id, 1, b),                                   // unprocessed, on an already-paused ex rule
    exp(exE.id, 2, b, { resolvedTxId: tx.id }),          // resolved: stays
    exp(ownE.id, 3, b),                                  // stale snapshot on the stayer's rule
    exp(ownE.id, 4, a),                                  // fine
  ]).returning({ id: pendingExpenseOccurrences.id })
  return {
    a, b, groupId: g.id, exIncome: exI.id, exExpensePaused: exE.id, ownIncome: ownI.id, ownExpense: ownE.id, txId: tx.id,
    pend: { exIncomeOpen: pi[0].id, exIncomeSkipped: pi[1].id, ownIncome: pi[2].id, exExpenseOpen: pe[0].id, exExpenseResolved: pe[1].id, ownStale: pe[2].id, ownFine: pe[3].id },
  }
}

async function cleanup(s: Seed) {
  const rules = [s.exIncome, s.ownIncome]; const erules = [s.exExpensePaused, s.ownExpense]
  await db.delete(pendingIncomeOccurrences).where(inArray(pendingIncomeOccurrences.ruleId, rules))
  await db.delete(pendingExpenseOccurrences).where(inArray(pendingExpenseOccurrences.ruleId, erules))
  await db.delete(recurringIncomeRules).where(inArray(recurringIncomeRules.id, rules))
  await db.delete(recurringExpenseRules).where(inArray(recurringExpenseRules.id, erules))
  await db.delete(cashTransactions).where(eq(cashTransactions.groupId, s.groupId))
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, s.groupId))
  await db.delete(groupBalance).where(eq(groupBalance.groupId, s.groupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, s.groupId))
  await db.delete(profiles).where(inArray(profiles.id, [s.a, s.b]))
}

const pausedAt = async (table: typeof recurringIncomeRules | typeof recurringExpenseRules, id: string) =>
  (await db.select({ p: table.pausedAt }).from(table).where(eq(table.id, id)))[0].p
const pendingIds = async (s: Seed) => {
  const i = await db.select({ id: pendingIncomeOccurrences.id }).from(pendingIncomeOccurrences).where(inArray(pendingIncomeOccurrences.ruleId, [s.exIncome, s.ownIncome]))
  const e = await db.select({ id: pendingExpenseOccurrences.id }).from(pendingExpenseOccurrences).where(inArray(pendingExpenseOccurrences.ruleId, [s.exExpensePaused, s.ownExpense]))
  return new Set([...i, ...e].map((r) => r.id))
}

describe('removePartner #1588 S3 — recurring rules of the removed member', () => {
  afterEach(async () => {
    if (seeded) { try { await cleanup(seeded) } catch (e) { console.error('cleanup failed', e) } seeded = null }
  })

  it('pauses the ex rules, clears their unprocessed cards, keeps history, resets stale payer; stayer untouched', async () => {
    const s = (seeded = await seed())
    mockUserId = s.a
    unwrapAction(await removePartner())

    expect(await pausedAt(recurringIncomeRules, s.exIncome)).not.toBeNull()
    // already-paused rule keeps its earlier paused_at (COALESCE)
    expect((await pausedAt(recurringExpenseRules, s.exExpensePaused))?.getTime()).toBe(EARLIER.getTime())
    expect(await pausedAt(recurringIncomeRules, s.ownIncome)).toBeNull()
    expect(await pausedAt(recurringExpenseRules, s.ownExpense)).toBeNull()

    const left = await pendingIds(s)
    expect(left.has(s.pend.exIncomeOpen)).toBe(false)
    expect(left.has(s.pend.exExpenseOpen)).toBe(false) // already-paused rule's card goes too
    expect(left.has(s.pend.exIncomeSkipped)).toBe(true)
    expect(left.has(s.pend.exExpenseResolved)).toBe(true)
    expect(left.has(s.pend.ownIncome)).toBe(true)
    expect(left.has(s.pend.ownFine)).toBe(true)
    expect(left.has(s.pend.ownStale)).toBe(true)

    const [stale] = await db.select({ p: pendingExpenseOccurrences.proposedPaidBy }).from(pendingExpenseOccurrences).where(eq(pendingExpenseOccurrences.id, s.pend.ownStale))
    expect(stale.p).toBe(s.a)
    const tx = await db.select({ id: cashTransactions.id }).from(cashTransactions).where(eq(cashTransactions.id, s.txId))
    expect(tx).toHaveLength(1)
  })

  it('resumeRule refuses a former-person rule until updateRule re-assigns it', async () => {
    const s = (seeded = await seed())
    mockUserId = s.a
    unwrapAction(await removePartner())

    const before = await pausedAt(recurringIncomeRules, s.exIncome)
    const r1 = await income.resumeRule(s.exIncome)
    expect(r1).toMatchObject({ ok: false, code: 'rule_person_not_member' })
    const r2 = await expense.resumeRule(s.exExpensePaused)
    expect(r2).toMatchObject({ ok: false, code: 'rule_person_not_member' })
    expect((await pausedAt(recurringIncomeRules, s.exIncome))?.getTime()).toBe(before?.getTime())
    expect(await pausedAt(recurringExpenseRules, s.exExpensePaused)).not.toBeNull()

    // re-assign to the stayer, then resume works
    unwrapAction(await income.updateRule({ id: s.exIncome, amount: 50000, category: 'salary', recipientId: s.a, intervalMonths: 1, dayOfMonth: 5, startsOn: '2026-01-05', endsOn: null, source: null, assetId: null }))
    unwrapAction(await income.resumeRule(s.exIncome))
    expect(await pausedAt(recurringIncomeRules, s.exIncome)).toBeNull()

    unwrapAction(await expense.updateRule({ id: s.exExpensePaused, amount: 1200, category: 'other', paidBy: s.a, splitType: 'half', splitRatioA: null, description: 'TEST_1588S3 gym', intervalMonths: 1, dayOfMonth: 5, startsOn: '2026-01-05', endsOn: null, assetId: null }))
    unwrapAction(await expense.resumeRule(s.exExpensePaused))
    expect(await pausedAt(recurringExpenseRules, s.exExpensePaused)).toBeNull()
  })
})
