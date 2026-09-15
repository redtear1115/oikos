/**
 * #1243 — weighted recurring expenses lose their split ratio.
 *
 * The path under test is the whole chain, because every link in it was
 * individually plausible and the bug only existed in the seam:
 *
 *   rule.split_ratio_a
 *     → cron INSERT INTO "PendingExpenseOccurrences" (migration SQL)
 *       → pending.proposed_split_ratio_a
 *         → confirmPending()
 *           → CashTransactions.split_ratio_a
 *             → transactionDelta()
 *
 * The cron step is not exercised against a real Postgres, so instead of
 * hardcoding what we hope the SQL says, the test parses the column/expression
 * pairing out of the migration that is actually in drizzle/ and applies it. A
 * cron whose INSERT list and SELECT list drift apart — which is exactly how
 * this bug was born — fails here.
 *
 * Every assertion compares against the rule's configured ratio (30), never
 * merely "not null": null and 50 are the two values this bug produced, and 50
 * is what a `?? 50` fallback hands you, so "not null" would have passed on a
 * still-broken build.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import { confirmPending } from '@/actions/recurringExpense'
import { listActivePendings } from '@/lib/db/queries/recurringExpense'
import { transactionDelta } from '@/lib/balance'
import { unwrapAction } from '@/lib/action-errors'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }

/** A 30/70 rule: member A carries 30%, so the partner carries 70%. */
const RULE = {
  id: 'rule-1',
  group_id: GROUP.id,
  amount: 10000,
  description: '房貸',
  paid_by: 'user-a',
  split_type: 'weighted' as const,
  split_ratio_a: 30,
  next_occurrence_at: '2026-06-01',
}

// vitest runs with the repo root as cwd (vitest.config.ts lives there).
const DRIZZLE_DIR = join(process.cwd(), 'drizzle')

/**
 * The cron body that is actually live: cron.schedule() with an existing jobname
 * replaces the command, so the highest-numbered migration that schedules
 * `generate-pending-expense` wins. Reading the last one rather than a fixed
 * filename means a future migration that re-schedules the job without the ratio
 * fails this test instead of silently reintroducing #1243.
 */
function liveExpenseCronBody(): string {
  const files = readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith('.sql')).sort()
  const owning = files.filter((f) =>
    readFileSync(join(DRIZZLE_DIR, f), 'utf8').includes("cron.schedule('generate-pending-expense'"),
  )
  expect(owning.length).toBeGreaterThan(0)
  const sql = readFileSync(join(DRIZZLE_DIR, owning[owning.length - 1]), 'utf8')
  const m = sql.match(/cron\.schedule\('generate-pending-expense',\s*'([^']+)',\s*\$\$([\s\S]*?)\$\$\)/)
  expect(m, 'cron.schedule body should be parseable').not.toBeNull()
  expect(m![1]).toBe('0 16 * * *')
  return m![2]
}

/** The INSERT column list and the SELECT expression list, paired positionally. */
function cronInsertMapping(body: string): Array<[string, string]> {
  const m = body.match(
    /INSERT INTO "PendingExpenseOccurrences"\s*\(([^)]*)\)\s*SELECT\s+([\s\S]*?)\s+FROM\s+"RecurringExpenseRules"/,
  )
  expect(m, 'cron INSERT ... SELECT should be parseable').not.toBeNull()
  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
  const cols = split(m![1])
  const exprs = split(m![2])
  // The bug itself: a column list and a value list that no longer line up.
  expect(cols.length).toBe(exprs.length)
  return cols.map((c, i) => [c, exprs[i]] as [string, string])
}

/** Apply the parsed mapping to a rule row, as the cron's INSERT would. */
function generatePendingViaCron(rule: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [col, expr] of cronInsertMapping(liveExpenseCronBody())) {
    const ref = expr.match(/^r\.([a-z_]+)$/)
    expect(ref, `cron SELECT expression ${expr} should be a plain rule column`).not.toBeNull()
    const field = ref![1]
    expect(rule, `rule fixture is missing ${field}`).toHaveProperty(field)
    out[col] = rule[field]
  }
  return out
}

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('generate-pending-expense cron', () => {
  it('snapshots the rule ratio into proposed_split_ratio_a', () => {
    const pending = generatePendingViaCron(RULE)
    expect(pending.proposed_split_ratio_a).toBe(RULE.split_ratio_a)
    expect(pending.proposed_split_type).toBe('weighted')
    // The rest of the snapshot is unchanged by this fix.
    expect(pending.proposed_amount).toBe(RULE.amount)
    expect(pending.proposed_paid_by).toBe(RULE.paid_by)
  })
})

describe('listActivePendings', () => {
  it('reads proposed_split_ratio_a, so the edit sheet can prefill the ratio', async () => {
    queueDbResult([])
    await listActivePendings(GROUP.id)
    // mockDb.select is typed as a zero-arg factory, so reach the column map through unknown.
    const selectCalls = mockDb.select.mock.calls as unknown as Array<[Record<string, unknown>]>
    const cols = selectCalls[0][0]
    expect(Object.keys(cols)).toContain('proposedSplitRatioA')
  })
})

describe('confirmPending — weighted rule, end to end', () => {
  it('records the rule ratio, not a 50/50 fallback', async () => {
    const pending = generatePendingViaCron(RULE)

    queueDbResult([GROUP])
    queueDbResult([{
      id: 'pend-1',
      groupId: GROUP.id,
      proposedAmount: pending.proposed_amount,
      proposedDate: pending.proposed_date,
      proposedDescription: pending.proposed_description,
      proposedPaidBy: pending.proposed_paid_by,
      proposedSplitType: pending.proposed_split_type,
      proposedSplitRatioA: pending.proposed_split_ratio_a,
      category: 'housing',
      assetId: null,
    }])
    queueDbResult([{ id: 'tx-1' }])    // insert CashTx
    queueDbResult([{ id: 'pend-1' }])  // resolve pending

    const out = unwrapAction(await confirmPending('pend-1'))
    expect(out).toEqual({ txId: 'tx-1' })

    const insertVals = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(insertVals.splitType).toBe('weighted')
    expect(insertVals.splitRatioA).toBe(RULE.split_ratio_a)

    // What the number means once it reaches the ledger: payer is member A, who
    // carries 30%, so the partner owes the other 70% — 7000, not the 5000 that
    // a null ratio silently produced.
    const delta = transactionDelta({
      amount: insertVals.amount as number,
      splitType: 'weighted',
      payerIs: 'a',
      splitRatioA: insertVals.splitRatioA as number,
    })
    expect(delta).toBe(7000)
    expect(delta).not.toBe(
      transactionDelta({ amount: RULE.amount, splitType: 'weighted', payerIs: 'a' }),
    )
  })

  it('leaves the ratio null for a non-weighted rule', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'pend-2', groupId: GROUP.id,
      proposedAmount: 10000, proposedDate: '2026-06-01',
      proposedDescription: '房租', proposedPaidBy: 'user-a',
      proposedSplitType: 'half', proposedSplitRatioA: null,
      category: 'housing', assetId: null,
    }])
    queueDbResult([{ id: 'tx-2' }])
    queueDbResult([{ id: 'pend-2' }])

    await confirmPending('pend-2')
    const insertVals = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(insertVals.splitType).toBe('half')
    expect(insertVals.splitRatioA).toBeNull()
  })
})
