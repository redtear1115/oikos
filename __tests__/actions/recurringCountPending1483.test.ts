import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Load .env.local so tests connect to the real dev Supabase Postgres ────
// vitest does not auto-load .env files. We do it manually before any module
// imports the drizzle client (which reads DATABASE_URL on first import).
//
// Per spec: "禁止 mock DB；測試要打真 dev DB". We mock only the Supabase auth
// boundary (lib/supabase/server) — the boundary that needs Next.js cookies()
// — and let the action hit the real DB.
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

// Mock the Supabase server client *before* importing the action under test,
// so getViewerGroup() can reach our synthetic auth user without cookies().
let mockUserId: string = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }),
    },
  }),
}))

// Server actions call revalidatePath after the DB work, which throws outside a
// Next.js request store. We are testing the DB behavior, not cache invalidation,
// so stub it to a no-op.
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}))

// getViewerWriteContext() (added in #1431) calls cookies() to read the write
// context; outside a Next.js request scope that throws "cookies was called
// outside a request scope". Stub it the same way the other actions tests do.
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))

// Import AFTER the mock + env load.
const { db } = await import('@/lib/db/client')
const {
  profiles, oikosGroups,
  recurringIncomeRules, recurringExpenseRules,
  pendingIncomeOccurrences, pendingExpenseOccurrences,
  incomeTransactions, cashTransactions,
} = await import('@/lib/db/schema')
const income = await import('@/actions/recurringIncome')
const expense = await import('@/actions/recurringExpense')
const { eq, inArray } = await import('drizzle-orm')
const { unwrapAction } = await import('@/lib/action-errors')

// #1483 — countPendingForRule counts exactly what softDeleteRule would delete:
// pending cards of that rule that are neither skipped nor resolved, and only
// inside the viewer's group.

const T = 'TEST_1483'
const f = {
  userA: randomUUID(), userB: randomUUID(),
  groupA: '', groupB: '',
  incRuleA: '', incRuleB: '', expRuleA: '', expRuleB: '',
}
const txIncome: string[] = []
const txCash: string[] = []

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set; cannot run integration test.')
  await db.insert(profiles).values([
    { id: f.userA, displayName: `${T}_a` },
    { id: f.userB, displayName: `${T}_b` },
  ])
  const [gA] = await db.insert(oikosGroups).values({ name: `${T}_gA`, memberA: f.userA, memberB: null }).returning({ id: oikosGroups.id })
  const [gB] = await db.insert(oikosGroups).values({ name: `${T}_gB`, memberA: f.userB, memberB: null }).returning({ id: oikosGroups.id })
  f.groupA = gA.id
  f.groupB = gB.id

  const incRule = async (groupId: string, recipientId: string) => (await db.insert(recurringIncomeRules).values({
    groupId, recipientId, amount: 1000, category: 'salary', source: T,
    intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-01-01', nextOccurrenceAt: '2026-11-01',
  }).returning({ id: recurringIncomeRules.id }))[0].id
  const expRule = async (groupId: string, paidBy: string) => (await db.insert(recurringExpenseRules).values({
    groupId, paidBy, amount: 1000, splitType: 'all_mine', description: T, category: 'housing',
    intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-01-01', nextOccurrenceAt: '2026-11-01',
  }).returning({ id: recurringExpenseRules.id }))[0].id
  f.incRuleA = await incRule(f.groupA, f.userA)
  f.incRuleB = await incRule(f.groupB, f.userB)
  f.expRuleA = await expRule(f.groupA, f.userA)
  f.expRuleB = await expRule(f.groupB, f.userB)

  // Rule A of each kind: 3 active + 1 skipped + 1 confirmed (resolved).
  // Rule B (other group): 2 active.
  const incPending = (groupId: string, ruleId: string, month: string, extra: object = {}) =>
    db.insert(pendingIncomeOccurrences).values({
      groupId, ruleId, periodStart: `2026-${month}-01`, proposedAmount: 1000, proposedDate: `2026-${month}-01`, ...extra,
    }).returning({ id: pendingIncomeOccurrences.id })
  const expPending = (groupId: string, ruleId: string, paidBy: string, month: string, extra: object = {}) =>
    db.insert(pendingExpenseOccurrences).values({
      groupId, ruleId, periodStart: `2026-${month}-01`, proposedAmount: 1000, proposedDate: `2026-${month}-01`,
      proposedDescription: T, proposedPaidBy: paidBy, proposedSplitType: 'all_mine', ...extra,
    }).returning({ id: pendingExpenseOccurrences.id })

  for (const m of ['01', '02', '03']) {
    await incPending(f.groupA, f.incRuleA, m)
    await expPending(f.groupA, f.expRuleA, f.userA, m)
  }
  await incPending(f.groupA, f.incRuleA, '04', { skippedAt: new Date() })
  await expPending(f.groupA, f.expRuleA, f.userA, '04', { skippedAt: new Date() })
  for (const m of ['01', '02']) {
    await incPending(f.groupB, f.incRuleB, m)
    await expPending(f.groupB, f.expRuleB, f.userB, m)
  }
  mockUserId = f.userA
  const [resInc] = await incPending(f.groupA, f.incRuleA, '05')
  txIncome.push(unwrapAction(await income.confirmPending(resInc.id)).txId)
  const [resExp] = await expPending(f.groupA, f.expRuleA, f.userA, '05')
  txCash.push(unwrapAction(await expense.confirmPending(resExp.id)).txId)
})

afterAll(async () => {
  const groups = [f.groupA, f.groupB].filter(Boolean)
  if (groups.length) {
    await db.delete(pendingIncomeOccurrences).where(inArray(pendingIncomeOccurrences.groupId, groups))
    await db.delete(pendingExpenseOccurrences).where(inArray(pendingExpenseOccurrences.groupId, groups))
  }
  if (txIncome.length) await db.delete(incomeTransactions).where(inArray(incomeTransactions.id, txIncome))
  if (txCash.length) await db.delete(cashTransactions).where(inArray(cashTransactions.id, txCash))
  if (groups.length) {
    await db.delete(recurringIncomeRules).where(inArray(recurringIncomeRules.groupId, groups))
    await db.delete(recurringExpenseRules).where(inArray(recurringExpenseRules.groupId, groups))
    await db.delete(oikosGroups).where(inArray(oikosGroups.id, groups))
  }
  await db.delete(profiles).where(inArray(profiles.id, [f.userA, f.userB]))
})

describe.each([
  { kind: 'income', mod: income, own: () => f.incRuleA, other: () => f.incRuleB },
  { kind: 'expense', mod: expense, own: () => f.expRuleA, other: () => f.expRuleB },
] as const)('countPendingForRule ($kind)', ({ mod, own, other }) => {
  it('counts only unskipped, unresolved cards of that rule', async () => {
    mockUserId = f.userA
    expect(unwrapAction(await mod.countPendingForRule(own()))).toBe(3)
  })

  it('a rule in another group is not found', async () => {
    mockUserId = f.userA
    await expect(mod.countPendingForRule(other())).resolves.toMatchObject({ ok: false, code: 'recurring_rule_not_found' })
  })

  it('matches what softDeleteRule removes', async () => {
    mockUserId = f.userA
    const before = unwrapAction(await mod.countPendingForRule(own()))
    unwrapAction(await mod.softDeleteRule(own()))
    const table = mod === income ? pendingIncomeOccurrences : pendingExpenseOccurrences
    const left = await db.select({ id: table.id }).from(table).where(eq(table.ruleId, own()))
    // 5 cards seeded; the ones that survive are the skipped + resolved = 2.
    expect(5 - before).toBe(left.length)
  })
})
