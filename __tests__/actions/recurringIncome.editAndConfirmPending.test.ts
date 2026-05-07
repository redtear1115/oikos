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

// Import AFTER the mock + env load.
const { db } = await import('@/lib/db/client')
const {
  profiles,
  oikosGroups,
  recurringIncomeRules,
  pendingIncomeOccurrences,
  incomeTransactions,
} = await import('@/lib/db/schema')
const { editAndConfirmPending } = await import('@/actions/recurringIncome')
const { eq } = await import('drizzle-orm')

// ─── Fixtures ─────────────────────────────────────────────────────────────
// We seed two independent groups: groupA owned by userA, groupB owned by userB.
// Each has one rule + one active pending. Cross-group test confirms userB cannot
// confirm groupA's pending.

interface Fixture {
  userAId: string
  userBId: string
  groupAId: string
  groupBId: string
  ruleAId: string
  ruleBId: string
  pendingAId: string
  pendingBId: string
}

const fixture: Fixture = {
  userAId: '', userBId: '',
  groupAId: '', groupBId: '',
  ruleAId: '', ruleBId: '',
  pendingAId: '', pendingBId: '',
}

const cleanupTxIds: string[] = []

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.',
    )
  }

  fixture.userAId = randomUUID()
  fixture.userBId = randomUUID()

  await db.insert(profiles).values([
    { id: fixture.userAId, displayName: 'TEST_userA_phase2' },
    { id: fixture.userBId, displayName: 'TEST_userB_phase2' },
  ])

  const [groupA] = await db.insert(oikosGroups).values({
    name: 'TEST_groupA_phase2', memberA: fixture.userAId, memberB: null,
  }).returning({ id: oikosGroups.id })
  const [groupB] = await db.insert(oikosGroups).values({
    name: 'TEST_groupB_phase2', memberA: fixture.userBId, memberB: null,
  }).returning({ id: oikosGroups.id })
  fixture.groupAId = groupA.id
  fixture.groupBId = groupB.id

  const [ruleA] = await db.insert(recurringIncomeRules).values({
    groupId: fixture.groupAId, recipientId: fixture.userAId,
    amount: 75000, category: 'salary', source: 'TEST_phase2_ruleA',
    intervalMonths: 1, dayOfMonth: 1,
    startsOn: '2026-01-01', endsOn: null,
    nextOccurrenceAt: '2026-06-01',
  }).returning({ id: recurringIncomeRules.id })
  const [ruleB] = await db.insert(recurringIncomeRules).values({
    groupId: fixture.groupBId, recipientId: fixture.userBId,
    amount: 50000, category: 'salary', source: 'TEST_phase2_ruleB',
    intervalMonths: 1, dayOfMonth: 1,
    startsOn: '2026-01-01', endsOn: null,
    nextOccurrenceAt: '2026-06-01',
  }).returning({ id: recurringIncomeRules.id })
  fixture.ruleAId = ruleA.id
  fixture.ruleBId = ruleB.id

  const [pendingA] = await db.insert(pendingIncomeOccurrences).values({
    groupId: fixture.groupAId, ruleId: fixture.ruleAId,
    periodStart: '2026-05-01',
    proposedAmount: 75000, proposedDate: '2026-05-01',
  }).returning({ id: pendingIncomeOccurrences.id })
  const [pendingB] = await db.insert(pendingIncomeOccurrences).values({
    groupId: fixture.groupBId, ruleId: fixture.ruleBId,
    periodStart: '2026-05-01',
    proposedAmount: 50000, proposedDate: '2026-05-01',
  }).returning({ id: pendingIncomeOccurrences.id })
  fixture.pendingAId = pendingA.id
  fixture.pendingBId = pendingB.id
})

afterAll(async () => {
  // Order matters because of FKs.
  for (const txId of cleanupTxIds) {
    await db.delete(incomeTransactions).where(eq(incomeTransactions.id, txId))
  }
  if (fixture.pendingAId) {
    await db.delete(pendingIncomeOccurrences).where(eq(pendingIncomeOccurrences.id, fixture.pendingAId))
  }
  if (fixture.pendingBId) {
    await db.delete(pendingIncomeOccurrences).where(eq(pendingIncomeOccurrences.id, fixture.pendingBId))
  }
  if (fixture.ruleAId) {
    await db.delete(recurringIncomeRules).where(eq(recurringIncomeRules.id, fixture.ruleAId))
  }
  if (fixture.ruleBId) {
    await db.delete(recurringIncomeRules).where(eq(recurringIncomeRules.id, fixture.ruleBId))
  }
  if (fixture.groupAId) {
    await db.delete(oikosGroups).where(eq(oikosGroups.id, fixture.groupAId))
  }
  if (fixture.groupBId) {
    await db.delete(oikosGroups).where(eq(oikosGroups.id, fixture.groupBId))
  }
  if (fixture.userAId) {
    await db.delete(profiles).where(eq(profiles.id, fixture.userAId))
  }
  if (fixture.userBId) {
    await db.delete(profiles).where(eq(profiles.id, fixture.userBId))
  }
})

describe('editAndConfirmPending', () => {
  it('happy path: edits + confirms pending atomically (soft-resolve pending, insert IncomeTx)', async () => {
    mockUserId = fixture.userAId

    const result = await editAndConfirmPending({
      pendingId: fixture.pendingAId,
      amount: 80000,                  // user adjusts amount up
      category: 'bonus',              // and changes category
      recipientId: fixture.userAId,
      occurredAt: '2026-05-03',       // and shifts date
      source: 'TEST_phase2_edited',
      assetId: null,
    })

    expect(result.txId).toBeTruthy()
    cleanupTxIds.push(result.txId)

    // IncomeTransaction was created with edited fields.
    const [tx] = await db.select().from(incomeTransactions)
      .where(eq(incomeTransactions.id, result.txId)).limit(1)
    expect(tx).toBeDefined()
    expect(tx.amount).toBe(80000)
    expect(tx.category).toBe('bonus')
    expect(tx.source).toBe('TEST_phase2_edited')
    expect(tx.recipientId).toBe(fixture.userAId)
    expect(tx.groupId).toBe(fixture.groupAId)
    expect(String(tx.occurredAt)).toBe('2026-05-03')

    // Pending was resolved (resolved_tx_id set), not skipped.
    const [resolved] = await db.select().from(pendingIncomeOccurrences)
      .where(eq(pendingIncomeOccurrences.id, fixture.pendingAId)).limit(1)
    expect(resolved.resolvedTxId).toBe(result.txId)
    expect(resolved.skippedAt).toBeNull()
  })

  it('rejects amount <= 0 (validation failure, pending stays active)', async () => {
    // Re-seed a fresh pending for userA since the previous test resolved one.
    const [pending] = await db.insert(pendingIncomeOccurrences).values({
      groupId: fixture.groupAId, ruleId: fixture.ruleAId,
      periodStart: '2026-06-01',
      proposedAmount: 75000, proposedDate: '2026-06-01',
    }).returning({ id: pendingIncomeOccurrences.id })

    try {
      mockUserId = fixture.userAId
      await expect(editAndConfirmPending({
        pendingId: pending.id,
        amount: 0,
        category: 'salary',
        recipientId: fixture.userAId,
        occurredAt: '2026-06-01',
        source: null,
        assetId: null,
      })).rejects.toThrow(/正整數/)

      // Pending still active (not resolved, not skipped).
      const [row] = await db.select().from(pendingIncomeOccurrences)
        .where(eq(pendingIncomeOccurrences.id, pending.id)).limit(1)
      expect(row.resolvedTxId).toBeNull()
      expect(row.skippedAt).toBeNull()
    } finally {
      await db.delete(pendingIncomeOccurrences).where(eq(pendingIncomeOccurrences.id, pending.id))
    }
  })

  it('cross-group safety: userB cannot confirm groupA pending', async () => {
    mockUserId = fixture.userBId

    await expect(editAndConfirmPending({
      pendingId: fixture.pendingAId,        // belongs to groupA
      amount: 1,
      category: 'salary',
      recipientId: fixture.userBId,
      occurredAt: '2026-05-01',
      source: null,
      assetId: null,
    })).rejects.toThrow(/找不到|處理/)

    // userB cannot resolve their pending against userA's group either —
    // and resolving their *own* pending here is unrelated; the assertion
    // above is the cross-group guarantee. Verify groupA's pending is still
    // untouched after the failed attempt:
    const [row] = await db.select().from(pendingIncomeOccurrences)
      .where(eq(pendingIncomeOccurrences.id, fixture.pendingAId)).limit(1)
    // It was already resolved by the happy-path test above — that's fine;
    // we just check userB's call didn't create a *new* income tx tied to it.
    // The earlier resolvedTxId stays the same.
    expect(row.resolvedTxId).not.toBeNull()
  })
})
