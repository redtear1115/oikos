import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1588 — recurring rules / pending cards whose person left the ledger ──
//
// B was A's partner. B is the stored 收入歸屬 of an income rule and the
// stored 付款人 of an expense rule, and cron has already generated a pending
// card from each (the expense card snapshots proposed_paid_by = B). B was
// removed; removePartner moves nothing, so the rows still point at B.
//
//   solo:  group S = { A }      (B gone, nobody new)
//   duo:   group D = { A2, N }  (B gone, N joined later)
//
//   read:  the page readers (lib/db/queries/recurringView.ts) return no B
//          uuid; the former rows carry the *IsFormer flag; rows of current
//          members are untouched (no false flags).
//   write: updateRule with B's (stale / forged) id is refused and changes
//          nothing — updateRule stays strict; a re-pick of a current member
//          saves. Confirming the former-payer expense card returns
//          `pending_former_member` (not the old race message) and writes no
//          record; edit-and-confirm with a picked payer / recipient works.
//
// Failure looks like: the /settings/recurring or dashboard payload carries
// B's uuid to A (and to N, labelled as N); or 「就這樣」 on B's card says
// 「這筆 partner 剛剛已處理」 and the card never goes away.
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
  cashTransactions, incomeTransactions,
} = await import('@/lib/db/schema')
const expense = await import('@/actions/recurringExpense')
const income = await import('@/actions/recurringIncome')
const view = await import('@/lib/db/queries/recurringView')
const { memberLinkScope } = await import('@/lib/insuranceMemberLink')
const { eq, inArray } = await import('drizzle-orm')

if (!process.env.DATABASE_URL?.includes('ufhcprrauwsxdmscbkrf')) {
  throw new Error('#1588 dev-DB test: DATABASE_URL must point at the dev project (oikos-dev)')
}

const T = 'TEST_1588'
const p = { A: randomUUID(), A2: randomUUID(), N: randomUUID(), B: randomUUID() }
type Ledger = {
  group: string; memberA: string; memberB: string | null
  exIncomeRule: string; exExpenseRule: string; ownIncomeRule: string; ownExpenseRule: string
  exIncomePending: string; exExpensePending: string; exExpensePending2: string; exIncomePending2: string
}
const blank = (): Ledger => ({
  group: '', memberA: '', memberB: null,
  exIncomeRule: '', exExpenseRule: '', ownIncomeRule: '', ownExpenseRule: '',
  exIncomePending: '', exExpensePending: '', exExpensePending2: '', exIncomePending2: '',
})
const solo = blank()
const duo = blank()

const RULE_DATES = { intervalMonths: 1, dayOfMonth: 5, startsOn: '2026-01-05', nextOccurrenceAt: '2027-01-05' }

async function seed(l: Ledger, memberA: string, memberB: string | null, tag: string) {
  const [g] = await db.insert(oikosGroups).values({ name: `${T}_${tag}`, memberA, memberB }).returning({ id: oikosGroups.id })
  Object.assign(l, { group: g.id, memberA, memberB })
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: g.id, startedAt: new Date('2020-01-01T00:00:00Z'), memberAId: memberA, memberBId: memberB })

  const [exI] = await db.insert(recurringIncomeRules)
    .values({ groupId: g.id, recipientId: p.B, amount: 50000, category: 'salary', source: `${T} B salary`, ...RULE_DATES })
    .returning({ id: recurringIncomeRules.id })
  const [ownI] = await db.insert(recurringIncomeRules)
    .values({ groupId: g.id, recipientId: memberA, amount: 40000, category: 'salary', source: `${T} own salary`, ...RULE_DATES })
    .returning({ id: recurringIncomeRules.id })
  const [exE] = await db.insert(recurringExpenseRules)
    .values({ groupId: g.id, paidBy: p.B, amount: 1200, splitType: 'half', description: `${T} B gym`, category: 'other', ...RULE_DATES })
    .returning({ id: recurringExpenseRules.id })
  const [ownE] = await db.insert(recurringExpenseRules)
    .values({ groupId: g.id, paidBy: memberA, amount: 20000, splitType: 'half', description: `${T} rent`, category: 'housing', ...RULE_DATES })
    .returning({ id: recurringExpenseRules.id })
  Object.assign(l, { exIncomeRule: exI.id, ownIncomeRule: ownI.id, exExpenseRule: exE.id, ownExpenseRule: ownE.id })

  const pi = await db.insert(pendingIncomeOccurrences).values([
    { groupId: g.id, ruleId: exI.id, periodStart: '2026-09-05', proposedAmount: 50000, proposedDate: '2026-09-05' },
    { groupId: g.id, ruleId: exI.id, periodStart: '2026-10-05', proposedAmount: 50000, proposedDate: '2026-10-05' },
  ]).returning({ id: pendingIncomeOccurrences.id })
  const pe = await db.insert(pendingExpenseOccurrences).values([
    { groupId: g.id, ruleId: exE.id, periodStart: '2026-09-05', proposedAmount: 1200, proposedDate: '2026-09-05', proposedDescription: `${T} B gym`, proposedPaidBy: p.B, proposedSplitType: 'half' },
    { groupId: g.id, ruleId: exE.id, periodStart: '2026-10-05', proposedAmount: 1200, proposedDate: '2026-10-05', proposedDescription: `${T} B gym`, proposedPaidBy: p.B, proposedSplitType: 'half' },
  ]).returning({ id: pendingExpenseOccurrences.id })
  Object.assign(l, {
    exIncomePending: pi[0].id, exIncomePending2: pi[1].id,
    exExpensePending: pe[0].id, exExpensePending2: pe[1].id,
  })
}

beforeAll(async () => {
  await db.insert(profiles).values([
    { id: p.A, displayName: `${T}_A` },
    { id: p.A2, displayName: `${T}_A2` },
    { id: p.N, displayName: `${T}_N` },
    { id: p.B, displayName: `${T}_B_ex` },
  ])
  await seed(solo, p.A, null, 'solo')
  await seed(duo, p.A2, p.N, 'duo')
})

afterAll(async () => {
  try {
    for (const l of [solo, duo]) {
      if (!l.group) continue
      await db.delete(pendingIncomeOccurrences).where(eq(pendingIncomeOccurrences.groupId, l.group))
      await db.delete(pendingExpenseOccurrences).where(eq(pendingExpenseOccurrences.groupId, l.group))
      await db.delete(incomeTransactions).where(eq(incomeTransactions.groupId, l.group))
      await db.delete(cashTransactions).where(eq(cashTransactions.groupId, l.group))
      await db.delete(recurringIncomeRules).where(eq(recurringIncomeRules.groupId, l.group))
      await db.delete(recurringExpenseRules).where(eq(recurringExpenseRules.groupId, l.group))
      await db.delete(groupEpochs).where(eq(groupEpochs.groupId, l.group))
      await db.delete(groupBalance).where(eq(groupBalance.groupId, l.group))
      await db.delete(oikosGroups).where(eq(oikosGroups.id, l.group))
    }
    await db.delete(profiles).where(inArray(profiles.id, Object.values(p)))
  } catch (err) {
    console.error('cleanup failed', err)
  }
})

const storedExpenseRule = async (id: string) => {
  const [r] = await db.select({ paidBy: recurringExpenseRules.paidBy, amount: recurringExpenseRules.amount })
    .from(recurringExpenseRules).where(eq(recurringExpenseRules.id, id))
  return r
}
const storedIncomeRule = async (id: string) => {
  const [r] = await db.select({ recipientId: recurringIncomeRules.recipientId, amount: recurringIncomeRules.amount })
    .from(recurringIncomeRules).where(eq(recurringIncomeRules.id, id))
  return r
}
const cashCount = async (groupId: string) =>
  (await db.select({ id: cashTransactions.id }).from(cashTransactions).where(eq(cashTransactions.groupId, groupId))).length
const incomeTxCount = async (groupId: string) =>
  (await db.select({ id: incomeTransactions.id }).from(incomeTransactions).where(eq(incomeTransactions.groupId, groupId))).length

const expenseRuleInput = (id: string, paidBy: string, amount: number) => ({
  id, paidBy, amount, splitType: 'half' as const, splitRatioA: null, description: `${T} B gym`, category: 'other',
  intervalMonths: 1, dayOfMonth: 5, startsOn: '2026-01-05', endsOn: null, assetId: null,
})
const incomeRuleInput = (id: string, recipientId: string, amount: number) => ({
  id, recipientId, amount, category: 'salary', source: `${T} B salary`,
  intervalMonths: 1, dayOfMonth: 5, startsOn: '2026-01-05', endsOn: null, assetId: null,
})

for (const [label, l] of [['solo', solo], ['duo', duo]] as const) {
  // The person the re-pick lands on: the viewer in solo (the only choice),
  // the current partner in duo.
  const pick = () => l.memberB ?? l.memberA

  describe(`${label}: rules and pending cards whose person (B) left (#1588)`, () => {
    const scope = () => memberLinkScope([l.memberA, l.memberB], l.memberA, true)

    it('T1/T2/T3 — the page readers return no trace of B and flag the former rows', async () => {
      const [iRules, eRules, iPend, ePend] = await Promise.all([
        view.listIncomeRulesForViewer(l.group, scope()),
        view.listExpenseRulesForViewer(l.group, scope()),
        view.listIncomePendingsForViewer(l.group, scope()),
        view.listExpensePendingsForViewer(l.group, scope()),
      ])
      expect(JSON.stringify([iRules, eRules, iPend, ePend])).not.toContain(p.B)
      expect(iRules.find((r) => r.id === l.exIncomeRule)).toMatchObject({ recipientId: null, recipientIsFormer: true, formerLabel: true })
      expect(eRules.find((r) => r.id === l.exExpenseRule)).toMatchObject({ paidBy: null, paidByIsFormer: true, formerLabel: true })
      expect(iPend.filter((r) => r.ruleId === l.exIncomeRule)).toHaveLength(2)
      for (const r of iPend) expect(r).toMatchObject({ recipientId: null, recipientIsFormer: true })
      expect(ePend).toHaveLength(2)
      for (const r of ePend) expect(r).toMatchObject({ proposedPaidBy: null, proposedPaidByIsFormer: true })
      // T11 — current members' rows: no false flag, id kept.
      expect(iRules.find((r) => r.id === l.ownIncomeRule)).toMatchObject({ recipientId: l.memberA, recipientIsFormer: false })
      expect(eRules.find((r) => r.id === l.ownExpenseRule)).toMatchObject({ paidBy: l.memberA, paidByIsFormer: false })
    })

    it('expense confirm of the former-payer card → pending_former_member, no record written', async () => {
      mockUserId = l.memberA
      const before = await cashCount(l.group)
      expect(await expense.confirmPending(l.exExpensePending)).toEqual({ ok: false, code: 'pending_former_member' })
      expect(await cashCount(l.group)).toBe(before)
    })

    it('income confirm of the former-recipient card → recipient_not_in_group, no record written', async () => {
      mockUserId = l.memberA
      const before = await incomeTxCount(l.group)
      expect(await income.confirmPending(l.exIncomePending)).toEqual({ ok: false, code: 'recipient_not_in_group' })
      expect(await incomeTxCount(l.group)).toBe(before)
    })

    it("T9 — updateRule with B's stale / forged id is refused and changes nothing", async () => {
      mockUserId = l.memberA
      expect(await expense.updateRule(expenseRuleInput(l.exExpenseRule, p.B, 999)))
        .toEqual({ ok: false, code: 'payer_not_in_group' })
      expect(await storedExpenseRule(l.exExpenseRule)).toEqual({ paidBy: p.B, amount: 1200 })
      expect(await income.updateRule(incomeRuleInput(l.exIncomeRule, p.B, 999)))
        .toEqual({ ok: false, code: 'recipient_not_in_group' })
      expect(await storedIncomeRule(l.exIncomeRule)).toEqual({ recipientId: p.B, amount: 50000 })
    })

    it('T7 — the re-pick (a current member) saves', async () => {
      mockUserId = l.memberA
      expect(await expense.updateRule(expenseRuleInput(l.exExpenseRule, pick(), 1300)))
        .toMatchObject({ ok: true, data: { id: l.exExpenseRule } })
      expect(await storedExpenseRule(l.exExpenseRule)).toEqual({ paidBy: pick(), amount: 1300 })
      expect(await income.updateRule(incomeRuleInput(l.exIncomeRule, pick(), 51000)))
        .toMatchObject({ ok: true, data: { id: l.exIncomeRule } })
      expect(await storedIncomeRule(l.exIncomeRule)).toEqual({ recipientId: pick(), amount: 51000 })
    })

    it('edit-and-confirm of a former card with a picked person writes the record', async () => {
      mockUserId = l.memberA
      const e = await expense.editAndConfirmPending({ pendingId: l.exExpensePending2, overrides: { paidBy: pick() } })
      expect(e.ok).toBe(true)
      const [tx] = await db.select({ paidBy: cashTransactions.paidBy }).from(cashTransactions).where(eq(cashTransactions.groupId, l.group))
      expect(tx.paidBy).toBe(pick())

      const i = await income.editAndConfirmPending({
        pendingId: l.exIncomePending2, amount: 50000, category: 'salary', recipientId: pick(), occurredAt: '2026-10-05',
      })
      expect(i.ok).toBe(true)
      const [itx] = await db.select({ recipientId: incomeTransactions.recipientId }).from(incomeTransactions).where(eq(incomeTransactions.groupId, l.group))
      expect(itx.recipientId).toBe(pick())
    })
  })
}
