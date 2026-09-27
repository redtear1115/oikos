import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Chapter scope of the export, description suggestions and import history ─
//
// One ledger, four people, four chapters:
//
//   G:  [A+B] ──B leaves──▶ [A solo] ──C joins──▶ [A+C]
//   GB: (B's own rows carried over) [B solo] ──D joins──▶ [B+D]
//
// The leave is the real `leaveGroup` action: it carries B's rows into GB with
// their original `created_at`, which predates GB's first chapter. Expected:
//   - export / suggestions cover exactly the chapters the viewer was in:
//       A@G  → every G row          C@G  → only the A+C chapter
//       B@GB → B's carried rows + B+D   D@GB → only the B+D chapter
//   - import history / count list only the open chapter's batches.
//
// Writes whole fixtures, so it only runs against a local throwaway database
// (DATABASE_URL on localhost). Integration folder — excluded from CI.
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

const { AsyncLocalStorage } = await import('node:async_hooks')
const viewerStore = new AsyncLocalStorage<string>()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: viewerStore.getStore() ?? '' } }, error: null }),
    },
  }),
  getCurrentUser: async () => ({ id: viewerStore.getStore() ?? '' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(),
}))
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))

const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
  } catch {
    return false
  }
})()

const { db } = await import('@/lib/db/client')
const {
  profiles, oikosGroups, groupBalance, groupEpochs, cashTransactions, importBatches,
} = await import('@/lib/db/schema')
const { leaveGroup } = await import('@/actions/membership')
const { getImportHistory, countImportBatches } = await import('@/actions/import')
const { getDescriptionSuggestions } = await import('@/actions/transaction')
const { listAllActiveCashTransactionsForExport } = await import('@/lib/db/queries/transactions')
const { and, eq, inArray, isNull } = await import('drizzle-orm')
const { unwrapAction } = await import('@/lib/action-errors')

const as = <T>(userId: string, fn: () => Promise<T>) => viewerStore.run(userId, fn)

const H = 60 * 60 * 1000
const D = 24 * H

const ids = {
  A: randomUUID(), B: randomUUID(), C: randomUUID(), D: randomUUID(),
  G: '', GB: '',
}
const tag = `TEST_scope_${ids.A.slice(0, 8)}`
const txIds: string[] = []
const batchIds: { ab: string; ac: string } = { ab: '', ac: '' }

async function addTx(groupId: string, paidBy: string, description: string, createdAt: Date) {
  const [row] = await db.insert(cashTransactions).values({
    groupId, paidBy, amount: 100, splitType: 'all_mine',
    description, category: 'other',
    transactedAt: createdAt, createdAt,
  }).returning({ id: cashTransactions.id })
  txIds.push(row.id)
}

async function addBatch(groupId: string, importedBy: string, fileName: string, createdAt: Date) {
  const [row] = await db.insert(importBatches).values({
    groupId, importedBy, source: 'futari_generic', fileName,
    totalRows: 1, importedCount: 1, status: 'completed', createdAt,
  }).returning({ id: importBatches.id })
  return row.id
}

/** Seat `joiner` as member_b the way acceptInvite does: close the open chapter, open a duo one. */
async function join(groupId: string, memberA: string, joiner: string, at: Date) {
  await db.update(groupEpochs).set({ endedAt: at })
    .where(and(eq(groupEpochs.groupId, groupId), isNull(groupEpochs.endedAt)))
  await db.insert(groupEpochs).values({ groupId, startedAt: at, memberAId: memberA, memberBId: joiner })
  await db.update(oikosGroups).set({ memberB: joiner, currentEpochStartedAt: at })
    .where(eq(oikosGroups.id, groupId))
}

const exportedDescriptions = async (groupId: string, viewerId: string) =>
  (await listAllActiveCashTransactionsForExport(groupId, viewerId)).map((r) => r.description).sort()

describe.skipIf(!isLocalDb)('chapter scope: export, suggestions, import history', () => {
  beforeAll(async () => {
    await db.insert(profiles).values([
      { id: ids.A, displayName: `${tag}_A` },
      { id: ids.B, displayName: `${tag}_B` },
      { id: ids.C, displayName: `${tag}_C` },
      { id: ids.D, displayName: `${tag}_D` },
    ])

    const t0 = new Date(Date.now() - 10 * D)
    const [g] = await db.insert(oikosGroups).values({
      name: `${tag}_G`, memberA: ids.A, memberB: ids.B, currentEpochStartedAt: t0,
    }).returning({ id: oikosGroups.id })
    ids.G = g.id
    await db.insert(groupBalance).values({ groupId: ids.G, balance: 0, version: 0 })
    await db.insert(groupEpochs).values({ groupId: ids.G, startedAt: t0, memberAId: ids.A, memberBId: ids.B })

    // Chapter A+B.
    await addTx(ids.G, ids.A, `${tag} A in AB`, new Date(t0.getTime() + D))
    await addTx(ids.G, ids.B, `${tag} B in AB`, new Date(t0.getTime() + D))
    batchIds.ab = await addBatch(ids.G, ids.A, `${tag}_ab.csv`, new Date(t0.getTime() + D))

    // B leaves (real action): B's row moves to a new group GB.
    const left = unwrapAction(await as(ids.B, () => leaveGroup()))
    ids.GB = left.groupId
    const [leaveEpoch] = await db.select({ startedAt: groupEpochs.startedAt }).from(groupEpochs)
      .where(and(eq(groupEpochs.groupId, ids.G), isNull(groupEpochs.endedAt)))
    const L = leaveEpoch.startedAt.getTime()

    // Chapter A solo.
    await addTx(ids.G, ids.A, `${tag} A solo`, new Date(L + H))

    // C joins G → chapter A+C.
    const J = L + 2 * H
    await join(ids.G, ids.A, ids.C, new Date(J))
    await addTx(ids.G, ids.C, `${tag} C in AC`, new Date(J + H))
    await addTx(ids.G, ids.A, `${tag} A in AC`, new Date(J + 2 * H))
    batchIds.ac = await addBatch(ids.G, ids.C, `${tag}_ac.csv`, new Date(J + H))

    // D joins GB → chapter B+D.
    const K = L + 3 * H
    await join(ids.GB, ids.B, ids.D, new Date(K))
    await addTx(ids.GB, ids.D, `${tag} D in BD`, new Date(K + H))
  })

  afterAll(async () => {
    const groups = [ids.G, ids.GB].filter(Boolean)
    await db.delete(cashTransactions).where(inArray(cashTransactions.id, txIds))
    await db.delete(cashTransactions).where(inArray(cashTransactions.groupId, groups))
    await db.delete(importBatches).where(inArray(importBatches.groupId, groups))
    await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, groups))
    await db.delete(groupBalance).where(inArray(groupBalance.groupId, groups))
    await db.delete(oikosGroups).where(inArray(oikosGroups.id, groups))
    await db.delete(profiles).where(inArray(profiles.id, [ids.A, ids.B, ids.C, ids.D]))
  })

  it('fixture: the leave carried B\'s row into GB, older than GB\'s first chapter', async () => {
    const [moved] = await db.select({ groupId: cashTransactions.groupId, createdAt: cashTransactions.createdAt })
      .from(cashTransactions).where(eq(cashTransactions.description, `${tag} B in AB`))
    expect(moved.groupId).toBe(ids.GB)
    const [first] = await db.select({ startedAt: groupEpochs.startedAt }).from(groupEpochs)
      .where(eq(groupEpochs.groupId, ids.GB)).orderBy(groupEpochs.startedAt).limit(1)
    expect(moved.createdAt.getTime()).toBeLessThan(first.startedAt.getTime())
  })

  describe('export', () => {
    it('a later partner gets only the chapter they are in', async () => {
      expect(await exportedDescriptions(ids.G, ids.C)).toEqual([`${tag} A in AC`, `${tag} C in AC`])
    })

    it('a member of every chapter gets every row of the group', async () => {
      expect(await exportedDescriptions(ids.G, ids.A)).toEqual(
        [`${tag} A in AB`, `${tag} A in AC`, `${tag} A solo`, `${tag} C in AC`],
      )
    })

    it('the leaver keeps their own carried rows in the new group', async () => {
      expect(await exportedDescriptions(ids.GB, ids.B)).toEqual([`${tag} B in AB`, `${tag} D in BD`])
    })

    it('a partner who joins the leaver\'s new group does not get the carried rows', async () => {
      expect(await exportedDescriptions(ids.GB, ids.D)).toEqual([`${tag} D in BD`])
    })

    it('a former member gets only the chapter they were in', async () => {
      expect(await exportedDescriptions(ids.G, ids.B)).toEqual([`${tag} A in AB`])
    })

    it('someone who was never in the group gets nothing', async () => {
      expect(await exportedDescriptions(ids.G, ids.D)).toEqual([])
    })
  })

  describe('description suggestions', () => {
    const mine = (list: string[]) => list.filter((d) => d.startsWith(tag)).sort()

    it('a later partner is offered only their chapter\'s descriptions', async () => {
      const list = unwrapAction(await as(ids.C, () => getDescriptionSuggestions()))
      expect(mine(list)).toEqual([`${tag} A in AC`, `${tag} C in AC`])
    })

    it('the leaver is offered their carried descriptions; the new partner is not', async () => {
      expect(mine(unwrapAction(await as(ids.B, () => getDescriptionSuggestions()))))
        .toEqual([`${tag} B in AB`, `${tag} D in BD`])
      expect(mine(unwrapAction(await as(ids.D, () => getDescriptionSuggestions()))))
        .toEqual([`${tag} D in BD`])
    })
  })

  describe('import history', () => {
    it('lists and counts only the open chapter\'s batches', async () => {
      for (const viewer of [ids.C, ids.A]) {
        const history = unwrapAction(await as(viewer, () => getImportHistory()))
        expect(history.map((b) => b.id)).toEqual([batchIds.ac])
        expect(unwrapAction(await as(viewer, () => countImportBatches()))).toBe(1)
      }
    })
  })
})
