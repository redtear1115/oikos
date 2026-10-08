import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Sql } from 'postgres'
import { loadEnvLocal } from '../outing/_setup'

// ─── 0077: compute_monthly_review_snapshot hardening (#1494) ───────────────
//
// LOCAL THROWAWAY DATABASE ONLY. This file commits the current function
// (0089's since #1618 — 0077's hardening plus card 2 storing the payer id, never
// a name) and swaps in 0061's for the control runs. It never leaves the
// database on a body that writes names (0061 / 0077). It skips itself unless
// DATABASE_URL points at localhost — never run it against dev or prod.
//
// Database: postgres:17 plus the Supabase stand-ins (see PR #1445's
// description), then `drizzle-kit migrate` through 0089.
//
//   DATABASE_URL=postgres://postgres:<pw>@localhost:<port>/postgres \
//     npx vitest run __tests__/actions/monthlyReviewSnapshot0077.test.ts
//
// What it proves:
//   1. Card 4: a transaction in ledger G linked to ledger H's asset shows as
//      '' (rendered '—'), not H's asset name; G's own asset is still named.
//      Control: under 0061 H's asset name lands in G's snapshot.
//   2. Card 3: a pending in G resolved to a transaction in H (expense and
//      income) is not part of G's recurring events or totals; the same-ledger
//      pending still is. Control: under 0061 H's transactions are counted.
//   3. The function is pinned to `search_path=public, pg_temp`, and EXECUTE
//      is held only by postgres / service_role (not PUBLIC, anon,
//      authenticated, futari_app). Control: a CREATE OR REPLACE without a SET
//      clause (0061's) resets the pin to NULL — the silent loss 0042 → 0061.
//
// Failure look of what this guards: no error anywhere. A monthly review card
// shows another ledger's asset name or transaction; or the Supabase advisor
// reports `function_search_path_mutable` again; or the function is callable
// as a PostgREST rpc.
// ──────────────────────────────────────────────────────────────────────────────

loadEnvLocal()

const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
  } catch {
    return false
  }
})()

const postgres = (await import('postgres')).default

const migration = (file: string) => readFileSync(resolve(__dirname, '../../drizzle', file), 'utf-8')
// #1618: the current definition is 0089's (0077's body; card 2 stores the
// payer id and writes the name NULL). Every control run restores it.
const FILE_CURRENT = migration('0089_review_payer_id.sql')
const STATEMENTS_CURRENT = FILE_CURRENT.split('--> statement-breakpoint')
const FN_CURRENT = STATEMENTS_CURRENT.find((s) => s.includes('CREATE OR REPLACE FUNCTION public.compute_monthly_review_snapshot'))!
// 0061 has no breakpoints: take its CREATE OR REPLACE FUNCTION … $$; only
// (not its cron block).
const FN_0061 = (() => {
  const text = migration('0061_fix_monthly_review_month_calc.sql')
  const start = text.indexOf('CREATE OR REPLACE FUNCTION compute_monthly_review_snapshot(')
  const end = text.indexOf('\n$$;\n', start)
  return text.slice(start, end + '\n$$;\n'.length)
})()

const SIGNATURE = 'public.compute_monthly_review_snapshot(uuid, integer, integer)'
const YEAR = 2026
const MONTH = 3
// Mid-month, so Asia/Taipei vs UTC boundaries do not matter.
const TX_AT = '2026-03-15T12:00:00+08:00'
const TX_DATE = '2026-03-15'

let pg: Sql

async function profile() {
  const id = randomUUID()
  // on_auth_user_created (handle_new_user) inserts the Profiles row.
  await pg`INSERT INTO auth.users (id, raw_user_meta_data) VALUES (${id}, '{"full_name":"TEST_1494"}'::jsonb)`
  return id
}

async function group() {
  const a = await profile()
  const b = await profile()
  const [g] = await pg<{ id: string }[]>`
    INSERT INTO "OikosGroups" (name, member_a, member_b, current_epoch_started_at, base_currency)
    VALUES ('TEST_1494', ${a}, ${b}, now() - interval '400 days', 'twd') RETURNING id`
  return { id: g.id, a, b }
}

async function asset(groupId: string, name: string) {
  const [r] = await pg<{ id: string }[]>`
    INSERT INTO "Assets" (group_id, type, name) VALUES (${groupId}, 'item', ${name}) RETURNING id`
  return r.id
}

async function cashTx(groupId: string, paidBy: string, amount: number, assetId: string | null = null) {
  const [r] = await pg<{ id: string }[]>`
    INSERT INTO "CashTransactions" (group_id, paid_by, amount, split_type, description, category, transacted_at, asset_id)
    VALUES (${groupId}, ${paidBy}, ${amount}, 'half', 'TEST_1494', 'dining', ${TX_AT}, ${assetId}) RETURNING id`
  return r.id
}

async function incomeTx(groupId: string, recipient: string, amount: number) {
  const [r] = await pg<{ id: string }[]>`
    INSERT INTO "IncomeTransactions" (group_id, recipient_id, amount, category, occurred_at)
    VALUES (${groupId}, ${recipient}, ${amount}, 'salary', ${TX_DATE}) RETURNING id`
  return r.id
}

async function expenseRule(groupId: string, paidBy: string, description: string) {
  const [r] = await pg<{ id: string }[]>`
    INSERT INTO "RecurringExpenseRules"
      (group_id, paid_by, amount, split_type, description, category, day_of_month, starts_on, next_occurrence_at)
    VALUES (${groupId}, ${paidBy}, 100, 'half', ${description}, 'dining', 15, '2025-01-15', '2026-04-15') RETURNING id`
  return r.id
}

async function incomeRule(groupId: string, recipient: string, source: string) {
  const [r] = await pg<{ id: string }[]>`
    INSERT INTO "RecurringIncomeRules"
      (group_id, recipient_id, amount, category, source, day_of_month, starts_on, next_occurrence_at)
    VALUES (${groupId}, ${recipient}, 100, 'salary', ${source}, 15, '2025-01-15', '2026-04-15') RETURNING id`
  return r.id
}

async function expensePending(groupId: string, ruleId: string, paidBy: string, periodStart: string, txId: string) {
  await pg`
    INSERT INTO "PendingExpenseOccurrences"
      (group_id, rule_id, period_start, proposed_amount, proposed_date, proposed_description, proposed_paid_by, proposed_split_type, resolved_tx_id)
    VALUES (${groupId}, ${ruleId}, ${periodStart}, 100, ${periodStart}, 'TEST_1494', ${paidBy}, 'half', ${txId})`
}

async function incomePending(groupId: string, ruleId: string, periodStart: string, txId: string) {
  await pg`
    INSERT INTO "PendingIncomeOccurrences"
      (group_id, rule_id, period_start, proposed_amount, proposed_date, resolved_tx_id)
    VALUES (${groupId}, ${ruleId}, ${periodStart}, 100, ${periodStart}, ${txId})`
}

type Snapshot = {
  asset_breakdown: { assetName: string; total: number }[]
  recurring_events: { name: string; amount: number; direction: string; occurredAt: string }[]
  recurring_total_income: number
  recurring_total_expense: number
}

/** Fresh compute: the upsert only overwrites empty rows, so drop the old one. */
async function compute(groupId: string): Promise<Snapshot> {
  await pg`DELETE FROM "MonthlyReviewSnapshots" WHERE group_id = ${groupId}`
  await pg`SELECT public.compute_monthly_review_snapshot(${groupId}, ${YEAR}, ${MONTH})`
  const [row] = await pg<Snapshot[]>`
    SELECT asset_breakdown, recurring_events, recurring_total_income, recurring_total_expense
      FROM "MonthlyReviewSnapshots" WHERE group_id = ${groupId} AND year = ${YEAR} AND month = ${MONTH}`
  return row
}

async function under0061<T>(fn: () => Promise<T>): Promise<T> {
  try {
    await pg.unsafe(FN_0061)
    return await fn()
  } finally {
    await pg.unsafe(FN_CURRENT)
  }
}

describe.skipIf(!isLocalDb)('0077 compute_monthly_review_snapshot hardening (#1494) — local throwaway DB', () => {
  beforeAll(async () => {
    pg = postgres(databaseUrl, { max: 1, prepare: false, connection: { application_name: 'main_1494' } })
    await pg.unsafe(FN_CURRENT)
  })

  afterAll(async () => {
    await pg?.unsafe(FN_CURRENT)
    await pg?.end()
  })

  // ─── card 4: Assets join ────────────────────────────────────────────────
  async function seedAssets() {
    const g = await group()
    const h = await group()
    const own = await asset(g.id, 'TEST_1494 own car')
    const foreign = await asset(h.id, 'TEST_1494 FOREIGN cat')
    await cashTx(g.id, g.a, 500, own)
    await cashTx(g.id, g.a, 300, foreign)
    return g
  }

  it('control: under 0061 another ledger\'s asset name lands in the snapshot', async () => {
    const g = await seedAssets()
    const snap = await under0061(() => compute(g.id))
    expect(snap.asset_breakdown).toEqual([
      { assetName: 'TEST_1494 own car', total: 500 },
      { assetName: 'TEST_1494 FOREIGN cat', total: 300 },
    ])
  })

  it('0077: a cross-ledger asset keeps its slot with an empty name; the own asset is named', async () => {
    const g = await seedAssets()
    const snap = await compute(g.id)
    expect(snap.asset_breakdown).toEqual([
      { assetName: 'TEST_1494 own car', total: 500 },
      { assetName: '', total: 300 },
    ])
  })

  // ─── card 3: resolved-transaction joins ────────────────────────────────
  async function seedRecurring() {
    const g = await group()
    const h = await group()
    const er = await expenseRule(g.id, g.a, 'TEST_1494 rent')
    const ir = await incomeRule(g.id, g.a, 'TEST_1494 pay')
    // Same ledger: counted.
    await expensePending(g.id, er, g.a, '2026-02-15', await cashTx(g.id, g.a, 1000))
    await incomePending(g.id, ir, '2026-02-15', await incomeTx(g.id, g.a, 2000))
    // Resolved into H's transactions (the leave edge path): must not count.
    await expensePending(g.id, er, g.a, '2026-03-15', await cashTx(h.id, h.a, 777))
    await incomePending(g.id, ir, '2026-03-15', await incomeTx(h.id, h.a, 888))
    return g
  }

  it('control: under 0061 another ledger\'s transactions are counted in card 3', async () => {
    const g = await seedRecurring()
    const snap = await under0061(() => compute(g.id))
    expect(snap.recurring_total_expense).toBe(1000 + 777)
    expect(snap.recurring_total_income).toBe(2000 + 888)
    expect(snap.recurring_events).toHaveLength(4)
  })

  it('0077: pendings resolved into another ledger are excluded; same-ledger ones stay', async () => {
    const g = await seedRecurring()
    const snap = await compute(g.id)
    expect(snap.recurring_total_expense).toBe(1000)
    expect(snap.recurring_total_income).toBe(2000)
    expect(snap.recurring_events).toEqual([
      { name: 'TEST_1494 pay', amount: 2000, direction: 'income', occurredAt: TX_DATE },
      { name: 'TEST_1494 rent', amount: 1000, direction: 'expense', occurredAt: TX_DATE },
    ])
  })

  // ─── card 2: payer id, never a name (#1618, 0089) ──────────────────────
  async function card2(groupId: string) {
    await pg`DELETE FROM "MonthlyReviewSnapshots" WHERE group_id = ${groupId}`
    await pg`SELECT public.compute_monthly_review_snapshot(${groupId}, ${YEAR}, ${MONTH})`
    const [row] = await pg<{ paid_by: string | null; has_name: boolean }[]>`
      SELECT largest_expense_paid_by AS paid_by, largest_expense_paid_by_name IS NOT NULL AS has_name
        FROM "MonthlyReviewSnapshots" WHERE group_id = ${groupId} AND year = ${YEAR} AND month = ${MONTH}`
    return row
  }

  it('control: under 0061 card 2 stores the payer\'s display name', async () => {
    const g = await group()
    await cashTx(g.id, g.b, 900)
    const row = await under0061(() => card2(g.id))
    expect(row).toEqual({ paid_by: null, has_name: true })
  })

  it('0089: card 2 stores the payer id and no name', async () => {
    const g = await group()
    await cashTx(g.id, g.a, 100)
    await cashTx(g.id, g.b, 900)
    expect(await card2(g.id)).toEqual({ paid_by: g.b, has_name: false })
  })

  // ─── search_path pin and EXECUTE ACL ───────────────────────────────────
  const proconfig = async () =>
    (await pg<{ proconfig: string[] | null }[]>`
      SELECT proconfig FROM pg_proc WHERE oid = ${SIGNATURE}::regprocedure`)[0].proconfig

  it('control: a CREATE OR REPLACE without SET (0061) drops the pin — how 0042\'s pin was lost', async () => {
    const lost = await under0061(proconfig)
    expect(lost).toBeNull()
    expect(await proconfig()).toEqual(['search_path=public, pg_temp'])
  })

  it('0077/0089: pinned search_path; EXECUTE only for postgres / service_role, also after re-applying 0089', async () => {
    // Re-apply every 0089 statement (it carries 0077's SET / REVOKE / GRANT
    // unchanged): CREATE OR REPLACE must keep the revoked
    // ACL (a DROP + CREATE would bring the default grants back).
    for (const stmt of STATEMENTS_CURRENT) await pg.unsafe(stmt)

    expect(await proconfig()).toEqual(['search_path=public, pg_temp'])

    const [{ acl }] = await pg<{ acl: string[] }[]>`
      SELECT proacl::text[] AS acl FROM pg_proc WHERE oid = ${SIGNATURE}::regprocedure`
    // No PUBLIC entry ("=X/...").
    expect(acl.filter((e) => e.startsWith('='))).toEqual([])

    const roles = (await pg<{ rolname: string }[]>`
      SELECT rolname FROM pg_roles
       WHERE rolname IN ('anon', 'authenticated', 'futari_app', 'service_role')`).map((r) => r.rolname)
    const can = async (role: string) =>
      (await pg<{ ok: boolean }[]>`SELECT has_function_privilege(${role}, ${SIGNATURE}, 'EXECUTE') AS ok`)[0].ok

    const denied = ['anon', 'authenticated', 'futari_app'].filter((r) => roles.includes(r))
    for (const role of denied) expect({ role, execute: await can(role) }).toEqual({ role, execute: false })
    expect(await can('postgres')).toBe(true)
    if (roles.includes('service_role')) expect(await can('service_role')).toBe(true)

    // Say which role checks actually ran (the stand-in DB may lack a role).
    console.info(`[0077 ACL] denied checked: ${denied.join(', ') || '(none)'}; service_role checked: ${roles.includes('service_role')}`)
    expect(denied.length).toBeGreaterThan(0)
  })
})
