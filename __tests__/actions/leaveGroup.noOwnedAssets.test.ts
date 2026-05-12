import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Regression for #139 ──────────────────────────────────────────────────
//
// Background (PR #138, commit 8c2a0001): leaveGroup re-routes the leaver's
// CashTransactions / IncomeTransactions / RecurringExpenseRules /
// RecurringIncomeRules with a `SET asset_id = CASE WHEN asset_id = ANY(...)`
// expression. When the leaver owns none of House / Car / Insurance, the
// `movingAssetIds` array is `[]`. Drizzle spreads an empty array as `()`,
// producing `ANY(()::uuid[])` — a Postgres syntax error that aborts the
// whole transaction. The fix short-circuits the CASE to `sql\`NULL\`` when
// the array is empty.
//
// This suite touches the real dev DB because mocked-DB tests in `tests/`
// cannot exercise the SQL syntax path — the bug only surfaces when Postgres
// actually parses the query.
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

const { db } = await import('@/lib/db/client')
const {
  profiles,
  oikosGroups,
  groupBalance,
  groupEpochs,
  cashTransactions,
  incomeTransactions,
  settlements,
  recurringExpenseRules,
  recurringIncomeRules,
} = await import('@/lib/db/schema')
const { leaveGroup } = await import('@/actions/membership')
const { eq, inArray } = await import('drizzle-orm')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.',
    )
  }
})

// Each test seeds its own group + members and tears down inside a try/finally.
// Sharing fixtures across tests is awkward because leaveGroup mutates the
// schema (creates a new group, flips memberB to null, moves rules/txs).

interface SeedRefs {
  userAId: string
  userBId: string
  oldGroupId: string
  oldEpochId: string
  // tracked for cleanup
  cashTxIds: string[]
  incomeTxIds: string[]
  settlementIds: string[]
  recurringExpenseRuleIds: string[]
  recurringIncomeRuleIds: string[]
  newGroupId?: string  // populated by leaveGroup
}

function emptyRefs(userAId: string, userBId: string, oldGroupId: string, oldEpochId: string): SeedRefs {
  return {
    userAId,
    userBId,
    oldGroupId,
    oldEpochId,
    cashTxIds: [],
    incomeTxIds: [],
    settlementIds: [],
    recurringExpenseRuleIds: [],
    recurringIncomeRuleIds: [],
  }
}

async function seedDuoGroup(): Promise<SeedRefs> {
  const userAId = randomUUID()
  const userBId = randomUUID()

  await db.insert(profiles).values([
    { id: userAId, displayName: 'TEST_139_userA' },
    { id: userBId, displayName: 'TEST_139_userB' },
  ])

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_139_duo',
    memberA: userAId,
    memberB: userBId,
  }).returning({ id: oikosGroups.id })

  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })

  const [epoch] = await db.insert(groupEpochs).values({
    groupId: group.id,
    startedAt: new Date(),
    memberAId: userAId,
    memberBId: userBId,
  }).returning({ id: groupEpochs.id })

  return emptyRefs(userAId, userBId, group.id, epoch.id)
}

async function cleanup(refs: SeedRefs) {
  // FK order: rules → txs → epochs/balance → groups → profiles.
  if (refs.recurringExpenseRuleIds.length) {
    await db.delete(recurringExpenseRules).where(inArray(recurringExpenseRules.id, refs.recurringExpenseRuleIds))
  }
  if (refs.recurringIncomeRuleIds.length) {
    await db.delete(recurringIncomeRules).where(inArray(recurringIncomeRules.id, refs.recurringIncomeRuleIds))
  }
  if (refs.settlementIds.length) {
    await db.delete(settlements).where(inArray(settlements.id, refs.settlementIds))
  }
  if (refs.cashTxIds.length) {
    await db.delete(cashTransactions).where(inArray(cashTransactions.id, refs.cashTxIds))
  }
  if (refs.incomeTxIds.length) {
    await db.delete(incomeTransactions).where(inArray(incomeTransactions.id, refs.incomeTxIds))
  }
  // Epochs cascade from groups but the new solo group exists too.
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.oldGroupId))
  if (refs.newGroupId) {
    await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.newGroupId))
    await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.newGroupId))
    await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.newGroupId))
  }
  await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.oldGroupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.oldGroupId))
  await db.delete(profiles).where(inArray(profiles.id, [refs.userAId, refs.userBId]))
}

describe('leaveGroup — leaver with no owned 愛物 (#139)', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('completes the transaction when leaver owns zero House/Car/Insurance', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs

    // Leaver (member B) data — all without an asset reference, since the bug
    // surfaces specifically when movingAssetIds is empty.
    const [cashTx] = await db.insert(cashTransactions).values({
      groupId: refs.oldGroupId, paidBy: refs.userBId,
      amount: 100, splitType: 'all_mine',
      description: 'TEST_139 leaver cash', category: 'food',
      transactedAt: new Date('2026-05-01T00:00:00Z'),
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(cashTx.id)

    const [incomeTx] = await db.insert(incomeTransactions).values({
      groupId: refs.oldGroupId, recipientId: refs.userBId,
      amount: 50000, category: 'salary',
      occurredAt: '2026-05-01',
    }).returning({ id: incomeTransactions.id })
    refs.incomeTxIds.push(incomeTx.id)

    const [settlement] = await db.insert(settlements).values({
      groupId: refs.oldGroupId, paidBy: refs.userBId,
      amount: 0, settledAt: new Date('2026-05-01T00:00:00Z'),
    }).returning({ id: settlements.id })
    refs.settlementIds.push(settlement.id)

    const [expenseRule] = await db.insert(recurringExpenseRules).values({
      groupId: refs.oldGroupId, paidBy: refs.userBId,
      amount: 1000, splitType: 'half',
      description: 'TEST_139 rent share', category: 'housing',
      intervalMonths: 1, dayOfMonth: 1,
      startsOn: '2026-01-01',
      nextOccurrenceAt: '2026-06-01',
    }).returning({ id: recurringExpenseRules.id })
    refs.recurringExpenseRuleIds.push(expenseRule.id)

    const [incomeRule] = await db.insert(recurringIncomeRules).values({
      groupId: refs.oldGroupId, recipientId: refs.userBId,
      amount: 50000, category: 'salary',
      intervalMonths: 1, dayOfMonth: 1,
      startsOn: '2026-01-01',
      nextOccurrenceAt: '2026-06-01',
    }).returning({ id: recurringIncomeRules.id })
    refs.recurringIncomeRuleIds.push(incomeRule.id)

    // Member A's data — must stay untouched on the old group.
    const [aCashTx] = await db.insert(cashTransactions).values({
      groupId: refs.oldGroupId, paidBy: refs.userAId,
      amount: 200, splitType: 'all_mine',
      description: 'TEST_139 stayer cash', category: 'food',
      transactedAt: new Date('2026-05-01T00:00:00Z'),
    }).returning({ id: cashTransactions.id })
    refs.cashTxIds.push(aCashTx.id)

    // ── Act ──
    mockUserId = refs.userBId
    const result = await leaveGroup()
    refs.newGroupId = result.groupId

    // ── Assert: new solo group exists and is owned by the leaver ──
    expect(result.groupId).toBeTruthy()
    expect(result.groupId).not.toBe(refs.oldGroupId)

    const [newGroup] = await db.select().from(oikosGroups)
      .where(eq(oikosGroups.id, result.groupId)).limit(1)
    expect(newGroup.memberA).toBe(refs.userBId)
    expect(newGroup.memberB).toBeNull()

    // ── Assert: old group is now solo, member A intact ──
    const [oldGroup] = await db.select().from(oikosGroups)
      .where(eq(oikosGroups.id, refs.oldGroupId)).limit(1)
    expect(oldGroup.memberA).toBe(refs.userAId)
    expect(oldGroup.memberB).toBeNull()
    expect(oldGroup.pendingSwapProposedBy).toBeNull()

    // ── Assert: leaver's records moved to new group with asset_id = NULL ──
    const [movedCashTx] = await db.select().from(cashTransactions)
      .where(eq(cashTransactions.id, cashTx.id)).limit(1)
    expect(movedCashTx.groupId).toBe(result.groupId)
    expect(movedCashTx.assetId).toBeNull()

    const [movedIncomeTx] = await db.select().from(incomeTransactions)
      .where(eq(incomeTransactions.id, incomeTx.id)).limit(1)
    expect(movedIncomeTx.groupId).toBe(result.groupId)
    expect(movedIncomeTx.assetId).toBeNull()

    const [movedSettlement] = await db.select().from(settlements)
      .where(eq(settlements.id, settlement.id)).limit(1)
    expect(movedSettlement.groupId).toBe(result.groupId)

    const [movedExpenseRule] = await db.select().from(recurringExpenseRules)
      .where(eq(recurringExpenseRules.id, expenseRule.id)).limit(1)
    expect(movedExpenseRule.groupId).toBe(result.groupId)
    expect(movedExpenseRule.assetId).toBeNull()
    expect(movedExpenseRule.splitType).toBe('all_mine')          // solo conversion
    expect(movedExpenseRule.splitRatioA).toBeNull()

    const [movedIncomeRule] = await db.select().from(recurringIncomeRules)
      .where(eq(recurringIncomeRules.id, incomeRule.id)).limit(1)
    expect(movedIncomeRule.groupId).toBe(result.groupId)
    expect(movedIncomeRule.assetId).toBeNull()

    // ── Assert: member A's data untouched ──
    const [stayerCashTx] = await db.select().from(cashTransactions)
      .where(eq(cashTransactions.id, aCashTx.id)).limit(1)
    expect(stayerCashTx.groupId).toBe(refs.oldGroupId)
    expect(stayerCashTx.paidBy).toBe(refs.userAId)

    // ── Assert: epochs handed off cleanly (old duo closed, both solos open) ──
    const oldGroupEpochs = await db.select().from(groupEpochs)
      .where(eq(groupEpochs.groupId, refs.oldGroupId))
    expect(oldGroupEpochs).toHaveLength(2)
    const closedDuo = oldGroupEpochs.find((e) => e.id === refs.oldEpochId)
    expect(closedDuo?.endedAt).not.toBeNull()
    const stayerSolo = oldGroupEpochs.find((e) => e.id !== refs.oldEpochId)
    expect(stayerSolo?.memberAId).toBe(refs.userAId)
    expect(stayerSolo?.memberBId).toBeNull()
    expect(stayerSolo?.endedAt).toBeNull()

    const newGroupEpochs = await db.select().from(groupEpochs)
      .where(eq(groupEpochs.groupId, result.groupId))
    expect(newGroupEpochs).toHaveLength(1)
    expect(newGroupEpochs[0].memberAId).toBe(refs.userBId)
    expect(newGroupEpochs[0].memberBId).toBeNull()
    expect(newGroupEpochs[0].endedAt).toBeNull()
  })

  // NOTE: The #139 bonus ("leaver owns ≥1 of each asset type — verify CASE
  // preserves matching asset_id and NULLs others") is intentionally NOT
  // covered here. Attempting it surfaces a separate pre-existing bug in the
  // same statements — drizzle interpolates a single-element array as
  // `ANY(($1)::uuid[])` (cast of a scalar to uuid[], not a uuid[] literal)
  // and a multi-element array as `ANY(($1, $2)::uuid[])` (record cast).
  // Both are rejected by Postgres, meaning leaveGroup currently throws
  // whenever the leaver owns *any* asset. Tracking that separately so
  // #139's regression scope stays clean; see PR body for follow-up issue.
})
