import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1484 — frozen copies resolve only for members at freeze time ─────────
//
// leaveGroup (#1442) leaves frozen copies of 愛物 in a ledger so records keep
// their linked name. Before #1484 every server read that resolves a copy by id
// was group-scoped only, so a partner who joined the ledger later (or an
// earlier ex-partner) saw the leaver's car / child name on old records.
//
// Rule: a copy resolves iff the viewer was a member of the copy's ledger AT
// the freeze moment (lib/db/queries/_predicates.ts › frozenCopyVisibleClause).
// Otherwise it resolves exactly like a missing / other-ledger asset: null.
//
// Matrix (one timeline, real leaveGroup / swap actions; chapter joins are
// written as GroupEpochs rows the way acceptInvite leaves them):
//   ledger L: A+C1 (earlier) → A+B → B leaves (copies) → A solo → A+C (later)
//   (1) B reads copies in B's own new ledger NB (chapter starts AT the boundary)
//   (2) C also owns a solo ledger SC whose chapter covers frozen_at — the
//       unqualified-column trap: a clause binding GroupEpochs' own group_id
//       would let C through
//   (3) earlier partner C1: pinned (query-level) and rejoined (actions) → excluded
//   (4) copy-of-copy: C re-links a copy C may not see and leaves → the copy in
//       C's new ledger keeps the old frozen_at and resolves for no one;
//       B's legitimate second leave → B's new copy resolves for B
//   (5) B via pinned past chapter of L (R2 drill name, R3 stats) → resolves
//   (6) swap then leave (ledger M) → stayer and leaver both resolve
// Read paths: R1 getAssetById / loadAsset, R2 getDrillAssetName, R3
// monthlyStatsByAsset, R4 getFuelLogById, R6 the three insured-child joins,
// and the reveal actions (frozen excluded).
//
// Local throwaway database only; refuses to run against anything that is not
// localhost. Start one with:
//   docker run -d --name pg-1484 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55484:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55484/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55484/postgres npx vitest run __tests__/actions/frozenCopyVisibility1484.test.ts
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

const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
  } catch {
    return false
  }
})()

let mockUserId = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }) },
  }),
  getCurrentUser: async () => ({ id: mockUserId }),
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
  profiles, oikosGroups, groupBalance, groupEpochs, assets,
  carDetails, houseDetails, childDetails, insuranceDetails,
  fuelLogs, cashTransactions, incomeTransactions,
  recurringExpenseRules, recurringIncomeRules,
  pendingExpenseOccurrences, pendingIncomeOccurrences,
} = await import('@/lib/db/schema')
const { leaveGroup, proposeSwap, confirmSwap } = await import('@/actions/membership')
const assetActions = await import('@/actions/asset')
const fuelActions = await import('@/actions/fuelLog')
const { listAssetsForGroup, getAssetById, getDrillAssetName } = await import('@/lib/db/queries/asset')
const { getInsuranceDetails } = await import('@/lib/db/queries/aibutsu')
const { monthlyStatsByAsset } = await import('@/lib/db/queries/transactions')
const { eq, and, inArray, isNotNull, sql } = await import('drizzle-orm')
const { unwrapAction } = await import('@/lib/action-errors')

const T = 'TEST_1484'
const allTime = { startedAt: new Date(0), endedAt: null, epochId: null, isPast: false }
const everything = { kind: 'all' as const }

const u = {
  A: randomUUID(), B: randomUUID(), C: randomUUID(), C1: randomUUID(), F: randomUUID(),
  X: randomUUID(), Y: randomUUID(),
}
const g = { L: '', NB: '', SC: '', SC1: '', NC: '', NC1: '', NB2: '', M: '', NX: '' }
const a = {
  carB: '', houseA: '', childA: '', insB: '', carX: '', houseY: '',
  // copies
  kL: '', kHouseNB: '', kChildNB: '', kM: '', kHouseNX: '', kC: '', kNB2: '',
}
const f = { fl1: '', flL: '', flC: '' }
const tx = { txA_carB: '', txB_house: '', txC: '', txB2: '', txY_carX: '', txX_houseY: '' }
const frozenAt: Record<string, Date> = {}

async function nowText(): Promise<string> {
  const rows = await db.execute<{ t: string }>(sql`SELECT clock_timestamp()::text AS t`)
  return rows[0].t
}

async function newGroup(name: string, memberA: string, memberB: string | null, startedAt: string) {
  const [grp] = await db.insert(oikosGroups).values({
    name: `${T}_${name}`, memberA, memberB, currentEpochStartedAt: sql`${startedAt}::timestamptz`,
  }).returning({ id: oikosGroups.id })
  await db.insert(groupBalance).values({ groupId: grp.id, balance: 0, version: 0 })
  return grp.id
}

async function epoch(groupId: string, memberA: string, memberB: string | null, startedAt: string, endedAt: string | null) {
  await db.insert(groupEpochs).values({
    groupId,
    startedAt: sql`${startedAt}::timestamptz`,
    endedAt: endedAt === null ? null : sql`${endedAt}::timestamptz`,
    memberAId: memberA,
    memberBId: memberB,
  })
}

/**
 * `joiner` becomes member_b of `groupId` now: close the open chapter, open
 * (member_a, joiner) at the same instant — the shape acceptInvite leaves.
 */
async function join(groupId: string, joiner: string) {
  const t = await nowText()
  const [grp] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, groupId))
  await db.update(groupEpochs).set({ endedAt: sql`${t}::timestamptz` })
    .where(and(eq(groupEpochs.groupId, groupId), sql`${groupEpochs.endedAt} IS NULL`))
  await epoch(groupId, grp.memberA, joiner, t, null)
  await db.update(oikosGroups).set({ memberB: joiner, currentEpochStartedAt: sql`${t}::timestamptz` })
    .where(eq(oikosGroups.id, groupId))
}

async function leaveAs(userId: string) {
  mockUserId = userId
  return unwrapAction(await leaveGroup()).groupId
}

/** The frozen copy in `groupId` with `name` (exactly one expected). */
async function copyIn(groupId: string, name: string) {
  const rows = await db.select().from(assets)
    .where(and(eq(assets.groupId, groupId), eq(assets.name, name), isNotNull(assets.frozenAt)))
  expect(rows, `${name} in ${groupId}`).toHaveLength(1)
  return rows[0]
}

async function cashTx(groupId: string, paidBy: string, assetId: string | null, extra: Partial<typeof cashTransactions.$inferInsert> = {}) {
  const [t] = await db.insert(cashTransactions).values({
    groupId, paidBy, assetId, amount: 100, splitType: 'all_mine',
    description: `${T} tx`, category: 'transit', transactedAt: new Date('2026-05-01T00:00:00Z'), ...extra,
  }).returning({ id: cashTransactions.id })
  return t.id
}

async function statName(groupId: string, assetId: string, viewerId: string) {
  const rows = await monthlyStatsByAsset(groupId, undefined, everything, undefined, allTime, viewerId)
  const row = rows.find((r) => r.key === assetId)
  expect(row, `stats row for ${assetId}`).toBeDefined()
  return row!.name
}

async function loadAssetAs(userId: string, assetId: string) {
  mockUserId = userId
  return unwrapAction(await assetActions.loadAsset(assetId))
}

async function fuelLogAs(userId: string, fuelLogId: string) {
  mockUserId = userId
  return unwrapAction(await fuelActions.getFuelLogById(fuelLogId))
}

async function seed() {
  await db.insert(profiles).values(Object.entries(u).map(([k, id]) => ({ id, displayName: `${T}_${k}` })))
  const t0 = await nowText()
  const daysBefore = (d: number) => sql`${t0}::timestamptz - make_interval(days => ${d})`
  const rel = async (d: number) => {
    const rows = await db.execute<{ t: string }>(sql`SELECT (${daysBefore(d)})::text AS t`)
    return rows[0].t
  }
  const d90 = await rel(90), d60 = await rel(60), d30 = await rel(30)

  // C's own solo ledger, open since before anything below (case 2's trap).
  g.SC = await newGroup('SC', u.C, null, d90)
  await epoch(g.SC, u.C, null, d90, null)
  // C1's solo ledger after leaving L (C1 is pinned on L's first chapter).
  g.SC1 = await newGroup('SC1', u.C1, null, d30)
  await epoch(g.SC1, u.C1, null, d30, null)

  // Ledger L: A+C1 (d60–d30), then A+B from d30 (open).
  g.L = await newGroup('L', u.A, u.B, d30)
  await epoch(g.L, u.A, u.C1, d60, d30)
  await epoch(g.L, u.A, u.B, d30, null)

  const mk = async (groupId: string, v: { type: typeof assets.$inferInsert['type']; name: string }) => {
    const [row] = await db.insert(assets).values({ groupId, ...v }).returning({ id: assets.id })
    return row.id
  }
  // B's car (moves with B) used by A's fuel record → copy + fuel-log copy in L.
  a.carB = await mk(g.L, { type: 'car', name: `${T} B car` })
  await db.insert(carDetails).values({ assetId: a.carB, primaryUserId: u.B })
  const [fl] = await db.insert(fuelLogs).values({
    assetId: a.carB, liters: '30.00', fuelType: '95', odometer: 1000, station: `${T} st`, loggedAt: new Date('2026-05-01T00:00:00Z'),
  }).returning({ id: fuelLogs.id })
  f.fl1 = fl.id
  tx.txA_carB = await cashTx(g.L, u.A, a.carB, { fuelLogId: f.fl1 })
  // A's house (stays) used by B's record → copy in NB.
  a.houseA = await mk(g.L, { type: 'house', name: `${T} A house` })
  await db.insert(houseDetails).values({ assetId: a.houseA, owner: u.A })
  tx.txB_house = await cashTx(g.L, u.B, a.houseA)
  // A child (stays) insured by B's policy (moves) → insured-child copy in NB.
  a.childA = await mk(g.L, { type: 'child', name: `${T} child` })
  await db.insert(childDetails).values({ assetId: a.childA, nickname: 'n' })
  a.insB = await mk(g.L, { type: 'insurance', name: `${T} B policy` })
  await db.insert(insuranceDetails).values({
    assetId: a.insB, insuredType: 'user', insuredUserId: u.B, insuredChildId: a.childA, policyNumber: 'PN-B',
  })

  // Ledger M for case 6: X (member_a) + Y; X's car, Y's house, crossing records.
  g.M = await newGroup('M', u.X, u.Y, d30)
  await epoch(g.M, u.X, u.Y, d30, null)
  a.carX = await mk(g.M, { type: 'car', name: `${T} X car` })
  await db.insert(carDetails).values({ assetId: a.carX, primaryUserId: u.X })
  a.houseY = await mk(g.M, { type: 'house', name: `${T} Y house` })
  await db.insert(houseDetails).values({ assetId: a.houseY, owner: u.Y })
  tx.txY_carX = await cashTx(g.M, u.Y, a.carX)
  tx.txX_houseY = await cashTx(g.M, u.X, a.houseY)
}

async function cleanup() {
  const groups = Object.values(g).filter(Boolean)
  if (groups.length === 0) return
  const groupAssets = (await db.select({ id: assets.id }).from(assets).where(inArray(assets.groupId, groups))).map((x) => x.id)
  await db.delete(pendingExpenseOccurrences).where(inArray(pendingExpenseOccurrences.groupId, groups))
  await db.delete(pendingIncomeOccurrences).where(inArray(pendingIncomeOccurrences.groupId, groups))
  await db.delete(cashTransactions).where(inArray(cashTransactions.groupId, groups))
  await db.delete(incomeTransactions).where(inArray(incomeTransactions.groupId, groups))
  await db.delete(recurringExpenseRules).where(inArray(recurringExpenseRules.groupId, groups))
  await db.delete(recurringIncomeRules).where(inArray(recurringIncomeRules.groupId, groups))
  if (groupAssets.length) {
    await db.delete(fuelLogs).where(inArray(fuelLogs.assetId, groupAssets))
    for (const t of [carDetails, houseDetails, childDetails, insuranceDetails]) {
      await db.delete(t).where(inArray(t.assetId, groupAssets))
    }
    await db.delete(assets).where(inArray(assets.id, groupAssets))
  }
  await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, groups))
  await db.delete(groupBalance).where(inArray(groupBalance.groupId, groups))
  await db.delete(oikosGroups).where(inArray(oikosGroups.id, groups))
  await db.delete(profiles).where(inArray(profiles.id, Object.values(u)))
}

describe.skipIf(!isLocalDb)('#1484 — frozen copies resolve only for members at freeze time', () => {
  beforeAll(async () => {
    await seed()

    // B leaves L → copies in both ledgers.
    g.NB = await leaveAs(u.B)
    const kL = await copyIn(g.L, `${T} B car`)
    a.kL = kL.id
    frozenAt.L = kL.frozenAt!
    a.kHouseNB = (await copyIn(g.NB, `${T} A house`)).id
    a.kChildNB = (await copyIn(g.NB, `${T} child`)).id
    const [t] = await db.select().from(cashTransactions).where(eq(cashTransactions.id, tx.txA_carB))
    expect(t.assetId).toBe(a.kL)
    f.flL = t.fuelLogId!
    expect(f.flL).not.toBe(f.fl1)

    // Later partners: C joins L, F joins NB.
    await join(g.L, u.C)
    await join(g.NB, u.F)
  })

  afterAll(async () => {
    try { await cleanup() } catch (e) { console.error('cleanup failed', e) }
  })

  it('fixture: the copies exist, frozen at the leave boundary = NB\'s first chapter start', async () => {
    const [nbFirst] = await db.select().from(groupEpochs).where(eq(groupEpochs.groupId, g.NB)).orderBy(groupEpochs.startedAt).limit(1)
    expect(nbFirst.startedAt.getTime()).toBe(frozenAt.L.getTime())
    const [ab] = await db.select().from(groupEpochs)
      .where(and(eq(groupEpochs.groupId, g.L), eq(groupEpochs.memberBId, u.B)))
    expect(ab.endedAt!.getTime()).toBe(frozenAt.L.getTime())
  })

  // ── stayer A: control ───────────────────────────────────────────────────
  it('A (stayer, chapter ends at the boundary) resolves the copy on every path', async () => {
    expect((await getAssetById(a.kL, g.L, u.A))?.name).toBe(`${T} B car`)
    expect(await getDrillAssetName(a.kL, g.L, u.A)).toBe(`${T} B car`)
    expect(await statName(g.L, a.kL, u.A)).toBe(`${T} B car`)
    expect((await loadAssetAs(u.A, a.kL))?.name).toBe(`${T} B car`)
    expect((await fuelLogAs(u.A, f.flL))?.carName).toBe(`${T} B car`)
  })

  // ── (1) B in B's own new ledger ────────────────────────────────────────
  it('(1) B resolves the copies in B\'s own new ledger (its chapter starts AT the boundary)', async () => {
    expect((await getAssetById(a.kHouseNB, g.NB, u.B))?.name).toBe(`${T} A house`)
    expect(await getDrillAssetName(a.kHouseNB, g.NB, u.B)).toBe(`${T} A house`)
    expect(await statName(g.NB, a.kHouseNB, u.B)).toBe(`${T} A house`)
    expect((await loadAssetAs(u.B, a.kHouseNB))?.name).toBe(`${T} A house`)
  })

  it('(1) R6: B sees the insured child copy\'s name on all three joins; later partner F does not', async () => {
    const listB = await listAssetsForGroup(g.NB, u.B)
    expect(listB.find((x) => x.id === a.insB)?.insuranceInsuredChildId).toBe(a.kChildNB)
    expect(listB.find((x) => x.id === a.insB)?.insuranceInsuredChildName).toBe(`${T} child`)
    expect((await getAssetById(a.insB, g.NB, u.B))?.insuranceInsuredChildName).toBe(`${T} child`)
    expect((await getInsuranceDetails(a.insB, g.NB, u.B))?.insuredChildName).toBe(`${T} child`)

    const listF = await listAssetsForGroup(g.NB, u.F)
    const polF = listF.find((x) => x.id === a.insB)
    expect(polF).toBeDefined() // the policy itself is an ordinary asset
    expect(polF!.insuranceInsuredChildId).toBe(a.kChildNB)
    expect(polF!.insuranceInsuredChildName).toBeNull()
    const byIdF = await getAssetById(a.insB, g.NB, u.F)
    expect(byIdF).not.toBeNull()
    expect(byIdF!.insuranceInsuredChildName).toBeNull()
    const detF = await getInsuranceDetails(a.insB, g.NB, u.F)
    expect(detF).not.toBeNull()
    expect(detF!.insuredChildName).toBeNull()
  })

  it('(1) later partner F of NB: the house copy does not resolve on any path', async () => {
    expect(await getAssetById(a.kHouseNB, g.NB, u.F)).toBeNull()
    expect(await getDrillAssetName(a.kHouseNB, g.NB, u.F)).toBeNull()
    expect(await statName(g.NB, a.kHouseNB, u.F)).toBeNull()
  })

  // ── (2) later partner C, who also owns an older solo ledger ─────────────
  it('(2) fixture is live: C has a chapter (in SC) that covers frozen_at', async () => {
    const rows = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM "GroupEpochs"
       WHERE group_id = ${g.SC} AND member_a_id = ${u.C}
         AND started_at <= ${frozenAt.L.toISOString()}::timestamptz
         AND (ended_at IS NULL OR ended_at >= ${frozenAt.L.toISOString()}::timestamptz)`)
    expect(rows[0].n).toBe(1)
  })

  it('(2) C (joined L after the freeze) resolves nothing: R1, R2, R3, R4', async () => {
    expect(await getAssetById(a.kL, g.L, u.C)).toBeNull()
    expect(await getDrillAssetName(a.kL, g.L, u.C)).toBeNull()
    expect(await statName(g.L, a.kL, u.C)).toBeNull()
    expect(await loadAssetAs(u.C, a.kL)).toBeNull()
    expect(await fuelLogAs(u.C, f.flL)).toBeNull()
  })

  it('(2) ordinary assets are unchanged for C', async () => {
    expect((await getAssetById(a.houseA, g.L, u.C))?.name).toBe(`${T} A house`)
    expect((await loadAssetAs(u.C, a.houseA))?.name).toBe(`${T} A house`)
    expect((await listAssetsForGroup(g.L, u.C)).map((x) => x.id)).toContain(a.childA)
  })

  it('reveal actions refuse a frozen copy like a missing asset (even for A)', async () => {
    mockUserId = u.A
    expect(await assetActions.revealCarPlate(a.kL)).toEqual({ ok: false, code: 'aibutsu_not_found' })
    mockUserId = u.B
    expect(await assetActions.revealChildName(a.kChildNB)).toEqual({ ok: false, code: 'aibutsu_not_found' })
    expect(await assetActions.revealChildPii(a.kChildNB, 'nationalId')).toEqual({ ok: false, code: 'aibutsu_not_found' })
    expect(await assetActions.revealHouseAddress(a.kHouseNB)).toEqual({ ok: false, code: 'aibutsu_not_found' })
  })

  // ── (5) B pinned on L's past chapter ───────────────────────────────────
  it('(5) B, reading L\'s past chapter, resolves the copy (R1, R2, R3)', async () => {
    expect((await getAssetById(a.kL, g.L, u.B))?.name).toBe(`${T} B car`)
    expect(await getDrillAssetName(a.kL, g.L, u.B)).toBe(`${T} B car`)
    expect(await statName(g.L, a.kL, u.B)).toBe(`${T} B car`)
  })

  // ── (3) earlier partner C1, pinned ─────────────────────────────────────
  it('(3) C1 pinned on L\'s first chapter (ended before the freeze) resolves nothing', async () => {
    expect(await getAssetById(a.kL, g.L, u.C1)).toBeNull()
    expect(await getDrillAssetName(a.kL, g.L, u.C1)).toBeNull()
    expect(await statName(g.L, a.kL, u.C1)).toBeNull()
  })

  // ── (4) copy-of-copy laundering by C ───────────────────────────────────
  describe('(4) C re-links the copy it may not see, then leaves', () => {
    beforeAll(async () => {
      // As an edit would leave it: a record now paid by C, still on the car
      // copy and its fuel-log copy; and C's own policy linked to the car copy.
      tx.txC = await cashTx(g.L, u.C, a.kL, { fuelLogId: f.flL })
      const [ins] = await db.insert(assets).values({ groupId: g.L, type: 'insurance', name: `${T} C policy` })
        .returning({ id: assets.id })
      await db.insert(insuranceDetails).values({ assetId: ins.id, insuredType: 'user', insuredUserId: u.C, vehicleId: a.kL, policyNumber: 'PN-C' })
      g.NC = await leaveAs(u.C)
      const kC = await copyIn(g.NC, `${T} B car`)
      a.kC = kC.id
      frozenAt.C = kC.frozenAt!
      const [t] = await db.select().from(cashTransactions).where(eq(cashTransactions.id, tx.txC))
      expect(t.groupId).toBe(g.NC)
      expect(t.assetId).toBe(a.kC)
      f.flC = t.fuelLogId!
    })

    it('the copy in C\'s new ledger keeps the source\'s frozen_at (not C\'s boundary)', async () => {
      expect(frozenAt.C.getTime()).toBe(frozenAt.L.getTime())
      const [ncFirst] = await db.select().from(groupEpochs).where(eq(groupEpochs.groupId, g.NC)).limit(1)
      expect(ncFirst.startedAt.getTime()).toBeGreaterThan(frozenAt.C.getTime())
    })

    it('… so C still resolves nothing, in its own new ledger either', async () => {
      expect(await getAssetById(a.kC, g.NC, u.C)).toBeNull()
      expect(await getDrillAssetName(a.kC, g.NC, u.C)).toBeNull()
      expect(await statName(g.NC, a.kC, u.C)).toBeNull()
      expect(await loadAssetAs(u.C, a.kC)).toBeNull()
      expect(await fuelLogAs(u.C, f.flC)).toBeNull()
      const pol = (await listAssetsForGroup(g.NC, u.C)).find((x) => x.name === `${T} C policy`)
      expect(pol?.insuranceVehicleId).toBe(a.kC)
    })

    it('A still resolves the original copy in L', async () => {
      expect((await getAssetById(a.kL, g.L, u.A))?.name).toBe(`${T} B car`)
    })
  })

  // ── (3) earlier partner C1, rejoined ───────────────────────────────────
  it('(3) C1 rejoined L (a new chapter after the freeze) still resolves nothing', async () => {
    await join(g.L, u.C1)
    expect(await loadAssetAs(u.C1, a.kL)).toBeNull()
    expect(await fuelLogAs(u.C1, f.flL)).toBeNull()
    expect(await getAssetById(a.kL, g.L, u.C1)).toBeNull()
    expect(await statName(g.L, a.kL, u.C1)).toBeNull()
    g.NC1 = await leaveAs(u.C1)
  })

  // ── (4) B's legitimate second leave ────────────────────────────────────
  it('(4) B rejoins L, re-links the copy, leaves again → B\'s new copy resolves for B', async () => {
    await join(g.L, u.B)
    tx.txB2 = await cashTx(g.L, u.B, a.kL)
    g.NB2 = await leaveAs(u.B)
    const k = await copyIn(g.NB2, `${T} B car`)
    a.kNB2 = k.id
    const [nb2First] = await db.select().from(groupEpochs).where(eq(groupEpochs.groupId, g.NB2)).limit(1)
    expect(k.frozenAt!.getTime()).toBe(nb2First.startedAt.getTime())
    expect(k.frozenAt!.getTime()).toBeGreaterThan(frozenAt.L.getTime())
    expect((await getAssetById(a.kNB2, g.NB2, u.B))?.name).toBe(`${T} B car`)
    expect(await statName(g.NB2, a.kNB2, u.B)).toBe(`${T} B car`)
    expect((await loadAssetAs(u.B, a.kNB2))?.name).toBe(`${T} B car`)
  })

  // ── (6) swap then leave ────────────────────────────────────────────────
  it('(6) swap then leave: the stayer and the leaver both resolve; the chapter row was not relabelled', async () => {
    mockUserId = u.X
    unwrapAction(await proposeSwap())
    mockUserId = u.Y
    unwrapAction(await confirmSwap())
    const [m] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, g.M))
    expect(m.memberA).toBe(u.Y)
    expect(m.memberB).toBe(u.X)
    const [ep] = await db.select().from(groupEpochs).where(eq(groupEpochs.groupId, g.M))
    expect([ep.memberAId, ep.memberBId]).toEqual([u.X, u.Y])

    g.NX = await leaveAs(u.X)
    a.kM = (await copyIn(g.M, `${T} X car`)).id
    a.kHouseNX = (await copyIn(g.NX, `${T} Y house`)).id
    expect((await getAssetById(a.kM, g.M, u.Y))?.name).toBe(`${T} X car`)
    expect((await loadAssetAs(u.Y, a.kM))?.name).toBe(`${T} X car`)
    expect((await getAssetById(a.kM, g.M, u.X))?.name).toBe(`${T} X car`)
    expect((await getAssetById(a.kHouseNX, g.NX, u.X))?.name).toBe(`${T} Y house`)
    expect((await loadAssetAs(u.X, a.kHouseNX))?.name).toBe(`${T} Y house`)
    // Someone with no chapter in M at all: nothing.
    expect(await getAssetById(a.kM, g.M, u.A)).toBeNull()
  })
})
