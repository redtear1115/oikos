import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1442 — frozen copies when a duo ledger splits ───────────────────────
//
// leaveGroup splits one ledger into two. Before #1442 a record could end up in
// one ledger while the 愛物 it pointed at sat in the other: the stayer's fuel
// expense still pointed at the leaver's car (now in the leaver's ledger), an
// insurance policy that stayed still linked the leaver's car, and so on — a
// cross-ledger reference that later blocked account deletion (#1457) and, on
// the leaver's side, was "fixed" by NULLing asset_id (losing the link).
//
// Now every such link is re-pointed at a *frozen copy* of the 愛物 in the
// row's own ledger (display fields only), re-pointed rules are paused, and
// frozen copies are read-only and hidden from lists / pickers.
//
// This suite runs one leave over a ledger that has a crossing link in every
// one of the seven link columns, in both directions, then checks the
// invariant (0 cross-ledger links in both ledgers), the copies' shape, and
// that every write path refuses a frozen copy with an existing error code.
//
// Local throwaway database only; refuses to run against anything that is not
// localhost. Start one with:
//   docker run -d --name pg-1442 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55642:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55642/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55642/postgres npx vitest run __tests__/actions/leaveGroup.frozenAssetCopy.test.ts
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
const captured: { event: string; props?: unknown }[] = []
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async (_id: string, event: string, props?: unknown) => { captured.push({ event, props }) },
  isUserFirstNonDeletedRecord: async () => false,
}))

const { db } = await import('@/lib/db/client')
const S = await import('@/lib/db/schema')
const {
  profiles, oikosGroups, groupBalance, groupEpochs, assets,
  carDetails, houseDetails, childDetails, petDetails, plantDetails, insuranceDetails,
  fuelLogs, cashTransactions, incomeTransactions,
  recurringExpenseRules, recurringIncomeRules,
  pendingExpenseOccurrences, pendingIncomeOccurrences,
} = S
const { leaveGroup } = await import('@/actions/membership')
const assetActions = await import('@/actions/asset')
const fuelActions = await import('@/actions/fuelLog')
const { createTransaction } = await import('@/actions/transaction')
const { createIncome, getInsuranceAssets } = await import('@/actions/income')
const recurringExpense = await import('@/actions/recurringExpense')
const recurringIncome = await import('@/actions/recurringIncome')
const { listAssetsForGroup, getAssetById, listFilterAssetsForGroup } = await import('@/lib/db/queries/asset')
const { getLinkedInsurancesForVehicle } = await import('@/lib/db/queries/aibutsu')
const { eq, inArray, sql } = await import('drizzle-orm')
const { unwrapAction } = await import('@/lib/action-errors')

const T = 'TEST_1442'
const ids = {
  A: randomUUID(), B: randomUUID(),
  oldGroup: '', newGroup: '',
  // assets (old ledger, before the leave)
  carB: '', carA: '', houseA: '', childC: '', petA: '', plantA: '', petDel: '', tmpl: '', insB: '', insA: '',
  // fuel logs
  fl1: '', fl2: '', fl3: '', fl4: '',
  // records / rules
  txA_carB: '', txA_carB_deleted: '', txA_plain: '', txB_house: '', txB_carA_fuel: '', txB_mixed: '',
  txB_tmpl: '', txB_plant: '', txB_petDel: '', txB_carB_fl3: '',
  incB_pet: '', incA_insB: '',
  reA: '', reB: '', reA_plain: '', riA: '', riB: '',
  pendExpB: '', pendIncA: '',
}
/** copy id by (ledger, source) after the leave */
const copyOf: Record<string, string> = {}
const extra = { frozenCarNew: '', crossIns: '' }

async function crossLedgerCounts(groupId: string) {
  const one = async (q: ReturnType<typeof sql>) => {
    const rows = await db.execute<{ n: number }>(q)
    return Number(rows[0]?.n ?? 0)
  }
  return {
    cashAsset: await one(sql`SELECT count(*)::int n FROM "CashTransactions" t JOIN "Assets" a ON a.id = t.asset_id WHERE t.group_id = ${groupId} AND a.group_id <> t.group_id`),
    cashFuel: await one(sql`SELECT count(*)::int n FROM "CashTransactions" t JOIN "FuelLogs" f ON f.id = t.fuel_log_id JOIN "Assets" a ON a.id = f.asset_id WHERE t.group_id = ${groupId} AND a.group_id <> t.group_id`),
    incomeAsset: await one(sql`SELECT count(*)::int n FROM "IncomeTransactions" t JOIN "Assets" a ON a.id = t.asset_id WHERE t.group_id = ${groupId} AND a.group_id <> t.group_id`),
    insVehicle: await one(sql`SELECT count(*)::int n FROM "InsuranceDetails" d JOIN "Assets" ia ON ia.id = d.asset_id JOIN "Assets" a ON a.id = d.vehicle_id WHERE ia.group_id = ${groupId} AND a.group_id <> ia.group_id`),
    insChild: await one(sql`SELECT count(*)::int n FROM "InsuranceDetails" d JOIN "Assets" ia ON ia.id = d.asset_id JOIN "Assets" a ON a.id = d.insured_child_id WHERE ia.group_id = ${groupId} AND a.group_id <> ia.group_id`),
    expenseRule: await one(sql`SELECT count(*)::int n FROM "RecurringExpenseRules" t JOIN "Assets" a ON a.id = t.asset_id WHERE t.group_id = ${groupId} AND a.group_id <> t.group_id`),
    incomeRule: await one(sql`SELECT count(*)::int n FROM "RecurringIncomeRules" t JOIN "Assets" a ON a.id = t.asset_id WHERE t.group_id = ${groupId} AND a.group_id <> t.group_id`),
  }
}

async function asset(id: string) {
  const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1)
  return row
}
async function cashTx(id: string) {
  const [row] = await db.select().from(cashTransactions).where(eq(cashTransactions.id, id)).limit(1)
  return row
}

async function seed() {
  await db.insert(profiles).values([
    { id: ids.A, displayName: `${T}_A` },
    { id: ids.B, displayName: `${T}_B` },
  ])
  const [g] = await db.insert(oikosGroups).values({
    name: `${T}_duo`, memberA: ids.A, memberB: ids.B, guardianBetaEnabled: true,
  }).returning({ id: oikosGroups.id })
  ids.oldGroup = g.id
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({
    groupId: g.id, startedAt: new Date(Date.now() - 30 * 86400_000), memberAId: ids.A, memberBId: ids.B,
  })

  const mk = async (v: Partial<typeof assets.$inferInsert> & { type: typeof assets.$inferInsert['type']; name: string }) => {
    const [a] = await db.insert(assets).values({ groupId: g.id, ...v }).returning({ id: assets.id })
    return a.id
  }
  ids.carB = await mk({ type: 'car', name: `${T} B car` })
  await db.insert(carDetails).values({ assetId: ids.carB, primaryUserId: ids.B })
  ids.carA = await mk({ type: 'car', name: `${T} A car`, notes: 'car notes stay home' })
  await db.insert(carDetails).values({ assetId: ids.carA, primaryUserId: ids.A })
  ids.houseA = await mk({ type: 'house', name: `${T} A house` })
  await db.insert(houseDetails).values({ assetId: ids.houseA, owner: ids.A })
  // The child's real name lives in name_encrypted; a copy must never carry it.
  ids.childC = await mk({ type: 'child', name: `${T} nickname`, nameEncrypted: 'v1:not-a-real-ciphertext', notes: 'child notes' })
  await db.insert(childDetails).values({ assetId: ids.childC, nickname: 'nick' })
  ids.petA = await mk({ type: 'pet', name: `${T} pet` })
  await db.insert(petDetails).values({ assetId: ids.petA, species: 'cat' })
  ids.plantA = await mk({ type: 'plant', name: `${T} plant` })
  await db.insert(plantDetails).values({ assetId: ids.plantA, species: 'fern' })
  ids.petDel = await mk({ type: 'pet', name: `${T} deleted pet`, deletedAt: new Date(Date.now() - 86400_000) })
  ids.tmpl = await mk({ type: 'item', name: `${T} item`, templateKey: 'general', templateFields: { brand: 'x' } })
  // Insurance moving with the leaver, linked to a staying car and child.
  ids.insB = await mk({ type: 'insurance', name: `${T} B policy` })
  await db.insert(insuranceDetails).values({
    assetId: ids.insB, insuredType: 'user', insuredUserId: ids.B, insuredChildId: ids.childC, vehicleId: ids.carA, policyNumber: 'PN-B',
  })
  // Insurance staying with the stayer, linked to the leaver's car.
  ids.insA = await mk({ type: 'insurance', name: `${T} A policy` })
  await db.insert(insuranceDetails).values({
    assetId: ids.insA, insuredType: 'user', insuredUserId: ids.A, vehicleId: ids.carB, policyNumber: 'PN-A',
  })

  const fl = async (carId: string, odo: number) => {
    const [f] = await db.insert(fuelLogs).values({
      assetId: carId, liters: '30.00', fuelType: '95', odometer: odo, station: `${T} st`, loggedAt: new Date('2026-05-01T00:00:00Z'),
    }).returning({ id: fuelLogs.id })
    return f.id
  }
  ids.fl1 = await fl(ids.carB, 1000) // stayer's tx → leaver's car (direction A)
  ids.fl2 = await fl(ids.carA, 2000) // leaver's tx → stayer's car (direction B)
  ids.fl3 = await fl(ids.carB, 3000) // leaver's tx → leaver's car: no crossing
  ids.fl4 = await fl(ids.carA, 4000) // leaver's tx with asset carB but fuel log on carA

  const tx = async (paidBy: string, assetId: string | null, extraV: Partial<typeof cashTransactions.$inferInsert> = {}) => {
    const [t] = await db.insert(cashTransactions).values({
      groupId: g.id, paidBy, assetId, amount: 123, splitType: 'all_mine',
      description: `${T} tx`, category: 'transit', transactedAt: new Date('2026-05-01T00:00:00Z'), ...extraV,
    }).returning({ id: cashTransactions.id })
    return t.id
  }
  ids.txA_carB = await tx(ids.A, ids.carB, { fuelLogId: ids.fl1, description: `${T} A fuel in B car`, amount: 900 })
  ids.txA_carB_deleted = await tx(ids.A, ids.carB, { deletedAt: new Date() })
  ids.txA_plain = await tx(ids.A, ids.houseA)
  ids.txB_house = await tx(ids.B, ids.houseA, { description: `${T} B repair`, amount: 777, notes: 'keep me' })
  ids.txB_carA_fuel = await tx(ids.B, ids.carA, { fuelLogId: ids.fl2 })
  ids.txB_mixed = await tx(ids.B, ids.carB, { fuelLogId: ids.fl4 })
  ids.txB_tmpl = await tx(ids.B, ids.tmpl)
  ids.txB_plant = await tx(ids.B, ids.plantA)
  ids.txB_petDel = await tx(ids.B, ids.petDel)
  ids.txB_carB_fl3 = await tx(ids.B, ids.carB, { fuelLogId: ids.fl3 })

  const [incB] = await db.insert(incomeTransactions).values({
    groupId: g.id, recipientId: ids.B, amount: 500, category: 'other', assetId: ids.petA, occurredAt: '2026-05-01',
  }).returning({ id: incomeTransactions.id })
  ids.incB_pet = incB.id
  const [incA] = await db.insert(incomeTransactions).values({
    groupId: g.id, recipientId: ids.A, amount: 600, category: 'maturity', assetId: ids.insB, occurredAt: '2026-05-01',
  }).returning({ id: incomeTransactions.id })
  ids.incA_insB = incA.id

  const rule = async (paidBy: string, assetId: string, pausedAt: Date | null = null) => {
    const [r] = await db.insert(recurringExpenseRules).values({
      groupId: g.id, paidBy, amount: 1000, splitType: 'half', description: `${T} rule`, category: 'housing',
      assetId, intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-01-01', nextOccurrenceAt: '2026-11-01', pausedAt,
    }).returning({ id: recurringExpenseRules.id })
    return r.id
  }
  ids.reA = await rule(ids.A, ids.carB)
  ids.reB = await rule(ids.B, ids.houseA)
  ids.reA_plain = await rule(ids.A, ids.houseA)
  const irule = async (recipientId: string, assetId: string, pausedAt: Date | null = null) => {
    const [r] = await db.insert(recurringIncomeRules).values({
      groupId: g.id, recipientId, amount: 2000, category: 'other', assetId,
      intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-01-01', nextOccurrenceAt: '2026-11-01', pausedAt,
    }).returning({ id: recurringIncomeRules.id })
    return r.id
  }
  ids.riA = await irule(ids.A, ids.insB)
  ids.riB = await irule(ids.B, ids.carA, new Date('2026-02-01T00:00:00Z')) // already paused

  const [pe] = await db.insert(pendingExpenseOccurrences).values({
    groupId: g.id, ruleId: ids.reB, periodStart: '2026-09-01', proposedAmount: 1000, proposedDate: '2026-09-01',
    proposedDescription: `${T} pending`, proposedPaidBy: ids.B, proposedSplitType: 'half',
  }).returning({ id: pendingExpenseOccurrences.id })
  ids.pendExpB = pe.id
  const [pi] = await db.insert(pendingIncomeOccurrences).values({
    groupId: g.id, ruleId: ids.riA, periodStart: '2026-09-01', proposedAmount: 2000, proposedDate: '2026-09-01',
  }).returning({ id: pendingIncomeOccurrences.id })
  ids.pendIncA = pi.id
}

async function cleanup() {
  const groups = [ids.oldGroup, ids.newGroup].filter(Boolean)
  if (groups.length === 0) return
  const groupAssets = (await db.select({ id: assets.id }).from(assets).where(inArray(assets.groupId, groups))).map((a) => a.id)
  await db.delete(pendingExpenseOccurrences).where(inArray(pendingExpenseOccurrences.groupId, groups))
  await db.delete(pendingIncomeOccurrences).where(inArray(pendingIncomeOccurrences.groupId, groups))
  await db.delete(cashTransactions).where(inArray(cashTransactions.groupId, groups))
  await db.delete(incomeTransactions).where(inArray(incomeTransactions.groupId, groups))
  await db.delete(recurringExpenseRules).where(inArray(recurringExpenseRules.groupId, groups))
  await db.delete(recurringIncomeRules).where(inArray(recurringIncomeRules.groupId, groups))
  if (groupAssets.length) {
    await db.delete(fuelLogs).where(inArray(fuelLogs.assetId, groupAssets))
    for (const t of [carDetails, houseDetails, childDetails, petDetails, plantDetails, insuranceDetails]) {
      await db.delete(t).where(inArray(t.assetId, groupAssets))
    }
    await db.delete(assets).where(inArray(assets.id, groupAssets))
  }
  await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, groups))
  await db.delete(groupBalance).where(inArray(groupBalance.groupId, groups))
  await db.delete(oikosGroups).where(inArray(oikosGroups.id, groups))
  await db.delete(profiles).where(inArray(profiles.id, [ids.A, ids.B]))
}

describe.skipIf(!isLocalDb)('leaveGroup — frozen copies for cross-ledger links (#1442)', () => {
  let before: { tx: Record<string, typeof cashTransactions.$inferSelect> }

  beforeAll(async () => {
    await seed()
    before = { tx: {} }
    for (const k of ['txA_carB', 'txB_house', 'txB_carA_fuel'] as const) before.tx[k] = await cashTx(ids[k])

    mockUserId = ids.B
    const r = unwrapAction(await leaveGroup())
    ids.newGroup = r.groupId

    const copies = await db.select().from(assets)
      .where(inArray(assets.groupId, [ids.oldGroup, ids.newGroup]))
    for (const c of copies.filter((x) => x.frozenAt !== null)) {
      // Resolve which source each copy stands for via the rows that point at it.
      copyOf[`${c.groupId}:${c.name}`] = c.id
    }
  })

  afterAll(async () => {
    try { await cleanup() } catch (e) { console.error('cleanup failed', e) }
  })

  const copyIn = (ledger: 'old' | 'new', sourceName: string) =>
    copyOf[`${ledger === 'old' ? ids.oldGroup : ids.newGroup}:${sourceName}`]

  // ── the invariant ──────────────────────────────────────────────────────
  it('leaves 0 cross-ledger links in all seven link columns, in both ledgers', async () => {
    const zero = { cashAsset: 0, cashFuel: 0, incomeAsset: 0, insVehicle: 0, insChild: 0, expenseRule: 0, incomeRule: 0 }
    expect(await crossLedgerCounts(ids.oldGroup)).toEqual(zero)
    expect(await crossLedgerCounts(ids.newGroup)).toEqual(zero)
  })

  it('the seeded ledger did have a crossing link in every column (the check is not vacuous)', async () => {
    // What each link pointed at before the leave, resolved against where the
    // assets ended up: every one of these is a crossing the leave had to fix.
    expect((await asset(ids.carB)).groupId).toBe(ids.newGroup)      // txA_carB, reA, insA.vehicle, fl1
    expect((await asset(ids.insB)).groupId).toBe(ids.newGroup)      // incA_insB, riA
    expect((await asset(ids.carA)).groupId).toBe(ids.oldGroup)      // insB.vehicle, txB_carA_fuel, riB
    expect((await asset(ids.childC)).groupId).toBe(ids.oldGroup)    // insB.insured_child
    expect((await asset(ids.houseA)).groupId).toBe(ids.oldGroup)    // txB_house, reB
    expect((await asset(ids.petA)).groupId).toBe(ids.oldGroup)      // incB_pet
  })

  // ── the copies ─────────────────────────────────────────────────────────
  it('creates exactly one frozen copy per (ledger, source), display fields only', async () => {
    const all = await db.select().from(assets).where(inArray(assets.groupId, [ids.oldGroup, ids.newGroup]))
    const frozen = all.filter((a) => a.frozenAt !== null)
    const byLedger = (g: string) => frozen.filter((a) => a.groupId === g).map((a) => a.name).sort()
    expect(byLedger(ids.oldGroup)).toEqual([`${T} B car`, `${T} B policy`].sort())
    expect(byLedger(ids.newGroup)).toEqual([
      `${T} A car`, `${T} A house`, `${T} nickname`, `${T} pet`, `${T} plant`, `${T} deleted pet`, `${T} item`,
    ].sort())

    const sources = all.filter((a) => a.frozenAt === null)
    for (const c of frozen) {
      const src = sources.find((s) => s.name === c.name)!
      expect(c.type).toBe(src.type)
      expect(c.templateKey).toBe(src.templateKey)
      expect(c.nameEncrypted).toBeNull()
      expect(c.notes).toBeNull()
      expect(c.templateFields).toBeNull()
      expect(c.createdAt.getTime()).toBe(src.createdAt.getTime())
      expect(c.deletedAt?.getTime() ?? null).toBe(src.deletedAt?.getTime() ?? null)
    }
    const frozenIds = frozen.map((c) => c.id)
    for (const t of [carDetails, houseDetails, childDetails, petDetails, plantDetails, insuranceDetails]) {
      expect(await db.select().from(t).where(inArray(t.assetId, frozenIds))).toHaveLength(0)
    }
    // A deleted source stays shown as deleted.
    expect((await asset(copyIn('new', `${T} deleted pet`))).deletedAt).not.toBeNull()
  })

  it('emits no asset_created (or any) analytics for the copies', () => {
    expect(captured.filter((c) => c.event === 'asset_created')).toEqual([])
  })

  // ── direction A: rows staying with the stayer ──────────────────────────
  it('stayer tx → leaver car: re-pointed at the copy in the old ledger, fuel log copied too', async () => {
    const carCopy = copyIn('old', `${T} B car`)
    const t = await cashTx(ids.txA_carB)
    expect(t.groupId).toBe(ids.oldGroup)
    expect(t.assetId).toBe(carCopy)
    expect(t.fuelLogId).not.toBe(ids.fl1)
    const [flCopy] = await db.select().from(fuelLogs).where(eq(fuelLogs.id, t.fuelLogId!))
    const [flSrc] = await db.select().from(fuelLogs).where(eq(fuelLogs.id, ids.fl1))
    expect(flCopy.assetId).toBe(carCopy)
    expect(flSrc.assetId).toBe(ids.carB) // the original moved with its car
    for (const k of ['liters', 'fuelType', 'odometer', 'station'] as const) expect(flCopy[k]).toEqual(flSrc[k])
    expect(flCopy.loggedAt.getTime()).toBe(flSrc.loggedAt.getTime())
    expect(flCopy.createdAt.getTime()).toBe(flSrc.createdAt.getTime())
    // The record keeps every other field.
    const b = before.tx.txA_carB
    for (const k of ['amount', 'description', 'paidBy', 'splitType', 'category', 'createdAt', 'transactedAt', 'deletedAt'] as const) {
      expect(t[k]).toEqual(b[k])
    }
    // A soft-deleted stayer row is re-pointed to the same single copy.
    expect((await cashTx(ids.txA_carB_deleted)).assetId).toBe(carCopy)
    expect((await cashTx(ids.txA_plain)).assetId).toBe(ids.houseA)
  })

  it('stayer income → moving insurance and staying policy → leaver car: re-pointed in the old ledger', async () => {
    const [inc] = await db.select().from(incomeTransactions).where(eq(incomeTransactions.id, ids.incA_insB))
    expect(inc.assetId).toBe(copyIn('old', `${T} B policy`))
    const [d] = await db.select().from(insuranceDetails).where(eq(insuranceDetails.assetId, ids.insA))
    expect(d.vehicleId).toBe(copyIn('old', `${T} B car`))
    expect(d.policyNumber).toBe('PN-A')
  })

  // ── direction B: rows moving with the leaver ───────────────────────────
  it('leaver tx → staying house: moved and re-pointed at the copy (not NULLed)', async () => {
    const t = await cashTx(ids.txB_house)
    expect(t.groupId).toBe(ids.newGroup)
    expect(t.assetId).toBe(copyIn('new', `${T} A house`))
    const b = before.tx.txB_house
    for (const k of ['amount', 'description', 'paidBy', 'notes', 'createdAt', 'transactedAt'] as const) expect(t[k]).toEqual(b[k])
  })

  it('leaver tx with fuel log on the staying car: asset and fuel log both re-pointed', async () => {
    const carCopy = copyIn('new', `${T} A car`)
    const t = await cashTx(ids.txB_carA_fuel)
    expect(t.assetId).toBe(carCopy)
    const [f] = await db.select().from(fuelLogs).where(eq(fuelLogs.id, t.fuelLogId!))
    expect(f.assetId).toBe(carCopy)
    expect(f.odometer).toBe(2000)
  })

  it('crossing is decided by the fuel log\'s own car: tx on a moving car with a fuel log on a staying car', async () => {
    const t = await cashTx(ids.txB_mixed)
    expect(t.assetId).toBe(ids.carB) // moved with the leaver — no crossing
    const [f] = await db.select().from(fuelLogs).where(eq(fuelLogs.id, t.fuelLogId!))
    expect(f.assetId).toBe(copyIn('new', `${T} A car`)) // same single copy as above
    expect(f.odometer).toBe(4000)
    // Untouched: leaver tx → leaver car → fuel log on that car.
    const same = await cashTx(ids.txB_carB_fl3)
    expect(same.assetId).toBe(ids.carB)
    expect(same.fuelLogId).toBe(ids.fl3)
  })

  it('only the referenced fuel logs are copied', async () => {
    const copyCars = [copyIn('old', `${T} B car`), copyIn('new', `${T} A car`)]
    const copied = await db.select().from(fuelLogs).where(inArray(fuelLogs.assetId, copyCars))
    expect(copied.map((f) => f.odometer).sort()).toEqual([1000, 2000, 4000])
  })

  it('moving insurance keeps its vehicle and insured child as copies in the new ledger', async () => {
    const [d] = await db.select().from(insuranceDetails).where(eq(insuranceDetails.assetId, ids.insB))
    expect(d.vehicleId).toBe(copyIn('new', `${T} A car`))
    expect(d.insuredChildId).toBe(copyIn('new', `${T} nickname`))
    expect(d.insuredUserId).toBe(ids.B)
  })

  it('leaver records on item / plant / deleted pet / income → pet are re-pointed', async () => {
    expect((await cashTx(ids.txB_tmpl)).assetId).toBe(copyIn('new', `${T} item`))
    expect((await cashTx(ids.txB_plant)).assetId).toBe(copyIn('new', `${T} plant`))
    expect((await cashTx(ids.txB_petDel)).assetId).toBe(copyIn('new', `${T} deleted pet`))
    const [inc] = await db.select().from(incomeTransactions).where(eq(incomeTransactions.id, ids.incB_pet))
    expect(inc.groupId).toBe(ids.newGroup)
    expect(inc.assetId).toBe(copyIn('new', `${T} pet`))
  })

  // ── recurring rules ───────────────────────────────────────────────────
  it('cross-linked rules on both sides point at the copy and are paused; others untouched', async () => {
    const [reA] = await db.select().from(recurringExpenseRules).where(eq(recurringExpenseRules.id, ids.reA))
    expect(reA.groupId).toBe(ids.oldGroup)
    expect(reA.assetId).toBe(copyIn('old', `${T} B car`))
    expect(reA.pausedAt).not.toBeNull()
    const [reB] = await db.select().from(recurringExpenseRules).where(eq(recurringExpenseRules.id, ids.reB))
    expect(reB.groupId).toBe(ids.newGroup)
    expect(reB.assetId).toBe(copyIn('new', `${T} A house`))
    expect(reB.pausedAt).not.toBeNull()
    const [plain] = await db.select().from(recurringExpenseRules).where(eq(recurringExpenseRules.id, ids.reA_plain))
    expect(plain.assetId).toBe(ids.houseA)
    expect(plain.pausedAt).toBeNull()
    const [riA] = await db.select().from(recurringIncomeRules).where(eq(recurringIncomeRules.id, ids.riA))
    expect(riA.assetId).toBe(copyIn('old', `${T} B policy`))
    expect(riA.pausedAt).not.toBeNull()
    const [riB] = await db.select().from(recurringIncomeRules).where(eq(recurringIncomeRules.id, ids.riB))
    expect(riB.groupId).toBe(ids.newGroup)
    expect(riB.assetId).toBe(copyIn('new', `${T} A car`))
    expect(riB.pausedAt?.toISOString()).toBe('2026-02-01T00:00:00.000Z') // already paused: kept
  })

  // ── read surfaces ─────────────────────────────────────────────────────
  it('copies are absent from lists, pickers and the records filter; present via getAssetById', async () => {
    const oldCopies = [copyIn('old', `${T} B car`), copyIn('old', `${T} B policy`)]
    const listed = (await listAssetsForGroup(ids.oldGroup)).map((a) => a.id)
    for (const c of oldCopies) expect(listed).not.toContain(c)
    expect(listed).toContain(ids.carA)
    const filter = (await listFilterAssetsForGroup(ids.oldGroup)).map((a) => a.id)
    for (const c of oldCopies) expect(filter).not.toContain(c)
    expect(filter).toContain(ids.carA)

    mockUserId = ids.A
    const picker = unwrapAction(await assetActions.loadAssetsForPicker()).map((a) => a.id)
    for (const c of oldCopies) expect(picker).not.toContain(c)
    expect(unwrapAction(await assetActions.getCarAssets()).map((a) => a.id)).not.toContain(oldCopies[0])
    expect(unwrapAction(await getInsuranceAssets()).map((a) => a.id)).not.toContain(oldCopies[1])
    expect(unwrapAction(await getInsuranceAssets()).map((a) => a.id)).toContain(ids.insA)

    const byId = await getAssetById(oldCopies[0], ids.oldGroup)
    expect(byId?.frozenAt).not.toBeNull()
    expect(byId?.name).toBe(`${T} B car`)
    expect(unwrapAction(await assetActions.loadAsset(oldCopies[0]))?.name).toBe(`${T} B car`)

    mockUserId = ids.B
    const childCopy = copyIn('new', `${T} nickname`)
    expect(unwrapAction(await assetActions.getChildAssets()).map((a) => a.id)).not.toContain(childCopy)
    expect((await listAssetsForGroup(ids.newGroup)).map((a) => a.id)).not.toContain(childCopy)
  })

  // ── read-only: writes to a copy ───────────────────────────────────────
  it('edit / delete / renew / lapse on a copy are refused with the existing not-found codes', async () => {
    const carCopy = copyIn('old', `${T} B car`)
    const insCopy = copyIn('old', `${T} B policy`)
    mockUserId = ids.A
    expect(await assetActions.editCar({ id: carCopy, name: 'x', purchasedAt: null, purchasePrice: null })).toEqual({ ok: false, code: 'asset_not_found' })
    expect(await assetActions.softDeleteCar(carCopy)).toEqual({ ok: false, code: 'asset_not_found' })
    expect(await assetActions.softDeleteAsset(carCopy)).toEqual({ ok: false, code: 'aibutsu_not_found' })
    expect(await assetActions.editLifeEntity({ id: insCopy, name: 'x' })).toEqual({ ok: false, code: 'aibutsu_not_found' })
    expect(await assetActions.editInsurance({ id: insCopy, name: 'x' })).toEqual({ ok: false, code: 'aibutsu_not_found' })
    expect(await assetActions.renewInsurance({ id: insCopy })).toEqual({ ok: false, code: 'policy_not_found' })
    expect(await assetActions.lapseInsurance({ id: insCopy })).toEqual({ ok: false, code: 'policy_not_found' })

    mockUserId = ids.B
    expect(await assetActions.editChild({ id: copyIn('new', `${T} nickname`), name: 'x' })).toEqual({ ok: false, code: 'aibutsu_not_found' })
    expect(await assetActions.editPet({ id: copyIn('new', `${T} pet`), name: 'x' })).toEqual({ ok: false, code: 'aibutsu_not_found' })
    expect(await assetActions.editPlant({ id: copyIn('new', `${T} plant`), name: 'x' })).toEqual({ ok: false, code: 'aibutsu_not_found' })
    expect(await assetActions.editHouse({ id: copyIn('new', `${T} A house`), name: 'x' })).toEqual({ ok: false, code: 'aibutsu_not_found' })
    expect(await assetActions.editTemplateAsset({ id: copyIn('new', `${T} item`), templateKey: 'general', name: 'x', fields: {} }))
      .toEqual({ ok: false, code: 'aibutsu_not_found' })

    // Nothing changed, and no *Details row was created for any copy.
    const copies = await db.select().from(assets).where(inArray(assets.groupId, [ids.oldGroup, ids.newGroup]))
    for (const c of copies.filter((x) => x.frozenAt !== null)) {
      expect(c.name.startsWith(T)).toBe(true)
      expect(c.deletedAt === null || c.name === `${T} deleted pet`).toBe(true)
    }
    const frozenIds = copies.filter((x) => x.frozenAt !== null).map((c) => c.id)
    for (const t of [childDetails, petDetails, plantDetails, insuranceDetails, houseDetails, carDetails]) {
      expect(await db.select().from(t).where(inArray(t.assetId, frozenIds))).toHaveLength(0)
    }
  })

  it('fuel log create / edit / delete on a frozen car are refused', async () => {
    mockUserId = ids.A
    const carCopy = copyIn('old', `${T} B car`)
    const flCopy = (await cashTx(ids.txA_carB)).fuelLogId!
    const input = {
      assetId: carCopy, liters: 10, odometer: 5000, cost: 300, fuelType: '95',
      loggedAt: '2026-10-01', station: null, paidBy: ids.A, splitType: 'all_mine' as const,
    }
    expect(await fuelActions.createFuelLog(input)).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(await fuelActions.editFuelLog({ ...input, id: flCopy, assetId: ids.carA })).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(await fuelActions.softDeleteFuelLog(flCopy)).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    const [f] = await db.select().from(fuelLogs).where(eq(fuelLogs.id, flCopy))
    expect(f.deletedAt).toBeNull()
  })

  it('newly linking a record or rule to a copy is refused (linked_asset_not_in_group)', async () => {
    mockUserId = ids.A
    const carCopy = copyIn('old', `${T} B car`)
    const insCopy = copyIn('old', `${T} B policy`)
    expect(await createTransaction({
      amount: 100, description: 'x', category: 'transit', splitType: 'all_mine', payerId: ids.A,
      transactedAt: '2026-10-01', assetId: carCopy,
    })).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(await createIncome({
      amount: 100, category: 'other', recipientId: ids.A, occurredAt: '2026-10-01', assetId: insCopy,
    })).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(await recurringExpense.createRule({
      amount: 100, category: 'transit', paidBy: ids.A, splitType: 'all_mine', description: 'x',
      intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-10-01', endsOn: null, assetId: carCopy,
    })).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(await recurringIncome.createRule({
      amount: 100, category: 'other', recipientId: ids.A,
      intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-10-01', endsOn: null, assetId: insCopy,
    })).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
  })

  it('createInsurance with a frozen vehicle / child is refused', async () => {
    mockUserId = ids.A
    expect(await assetActions.createInsurance({ name: `${T} new policy`, vehicleId: copyIn('old', `${T} B car`) }))
      .toEqual({ ok: false, code: 'linked_vehicle_invalid' })
    await db.update(oikosGroups).set({ guardianBetaEnabled: true }).where(eq(oikosGroups.id, ids.newGroup))
    mockUserId = ids.B
    expect(await assetActions.createInsurance({ name: `${T} new policy`, insuredChildId: copyIn('new', `${T} nickname`) }))
      .toEqual({ ok: false, code: 'insured_child_invalid' })
  })

  it('editInsurance keeps its stored frozen links, but cannot switch to a different frozen copy', async () => {
    mockUserId = ids.B
    const carCopy = copyIn('new', `${T} A car`)
    const childCopy = copyIn('new', `${T} nickname`)
    expect(await assetActions.editInsurance({
      id: ids.insB, name: `${T} B policy renamed`, vehicleId: carCopy, insuredChildId: childCopy,
    })).toEqual({ ok: true, data: undefined })
    const [d] = await db.select().from(insuranceDetails).where(eq(insuranceDetails.assetId, ids.insB))
    expect(d.vehicleId).toBe(carCopy)
    expect(d.insuredChildId).toBe(childCopy)

    const [other] = await db.insert(assets).values({
      groupId: ids.newGroup, type: 'car', name: `${T} other frozen car`, frozenAt: new Date(),
    }).returning({ id: assets.id })
    extra.frozenCarNew = other.id
    expect(await assetActions.editInsurance({ id: ids.insB, name: `${T} B policy`, vehicleId: other.id }))
      .toEqual({ ok: false, code: 'linked_vehicle_invalid' })
    const [after] = await db.select().from(insuranceDetails).where(eq(insuranceDetails.assetId, ids.insB))
    expect(after.vehicleId).toBe(carCopy)
  })

  it('updateRule keeps a stored frozen link (rule stays paused), refuses a different frozen copy', async () => {
    mockUserId = ids.B
    const houseCopy = copyIn('new', `${T} A house`)
    const base = {
      amount: 1200, category: 'housing', paidBy: ids.B, splitType: 'all_mine' as const, description: `${T} rule edited`,
      intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-01-01', endsOn: null,
    }
    expect(await recurringExpense.updateRule({ ...base, id: ids.reB, assetId: houseCopy })).toEqual({ ok: true, data: { id: ids.reB } })
    const [r] = await db.select().from(recurringExpenseRules).where(eq(recurringExpenseRules.id, ids.reB))
    expect(r.amount).toBe(1200)
    expect(r.assetId).toBe(houseCopy)
    expect(r.pausedAt).not.toBeNull()
    expect(await recurringExpense.updateRule({ ...base, id: ids.reB, assetId: extra.frozenCarNew }))
      .toEqual({ ok: false, code: 'linked_asset_not_in_group' })

    mockUserId = ids.A
    const insCopy = copyIn('old', `${T} B policy`)
    expect(await recurringIncome.updateRule({
      id: ids.riA, amount: 2100, category: 'other', recipientId: ids.A,
      intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-01-01', endsOn: null, assetId: insCopy,
    })).toEqual({ ok: true, data: { id: ids.riA } })
  })

  it('resumeRule on a frozen-linked rule is refused (expense + income)', async () => {
    mockUserId = ids.B
    expect(await recurringExpense.resumeRule(ids.reB)).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    mockUserId = ids.A
    expect(await recurringIncome.resumeRule(ids.riA)).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(await recurringExpense.resumeRule(ids.reA)).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    const [r] = await db.select().from(recurringExpenseRules).where(eq(recurringExpenseRules.id, ids.reA))
    expect(r.pausedAt).not.toBeNull()
  })

  it('confirmPending / editAndConfirmPending with a frozen asset are refused; clearing the asset confirms', async () => {
    mockUserId = ids.B
    expect(await recurringExpense.confirmPending(ids.pendExpB)).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(await recurringExpense.editAndConfirmPending({ pendingId: ids.pendExpB, overrides: {} }))
      .toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(await recurringExpense.editAndConfirmPending({ pendingId: ids.pendExpB, overrides: { assetId: copyIn('new', `${T} A car`) } }))
      .toEqual({ ok: false, code: 'linked_asset_not_in_group' })

    mockUserId = ids.A
    expect(await recurringIncome.confirmPending(ids.pendIncA)).toEqual({ ok: false, code: 'linked_asset_not_in_group' })
    expect(await recurringIncome.editAndConfirmPending({
      pendingId: ids.pendIncA, amount: 2000, category: 'other', recipientId: ids.A, occurredAt: '2026-09-01',
      assetId: copyIn('old', `${T} B policy`),
    })).toEqual({ ok: false, code: 'linked_asset_not_in_group' })

    // The way out: confirm with no 愛物.
    mockUserId = ids.B
    const ok = unwrapAction(await recurringExpense.editAndConfirmPending({ pendingId: ids.pendExpB, overrides: { assetId: null } }))
    const t = await cashTx(ok.txId)
    expect(t.assetId).toBeNull()
    expect(t.groupId).toBe(ids.newGroup)
  })

  it('getLinkedInsurancesForVehicle is group-scoped', async () => {
    // A legacy-style cross-ledger link (prod has none; built by hand here):
    // a policy in the old ledger pointing at the car that now lives in the new one.
    const [x] = await db.insert(assets).values({ groupId: ids.oldGroup, type: 'insurance', name: `${T} cross policy` })
      .returning({ id: assets.id })
    extra.crossIns = x.id
    await db.insert(insuranceDetails).values({ assetId: x.id, insuredType: 'user', vehicleId: ids.carB })
    expect((await getLinkedInsurancesForVehicle(ids.carB, ids.newGroup)).map((r) => r.id)).not.toContain(x.id)
    expect((await getLinkedInsurancesForVehicle(ids.carB, ids.oldGroup)).map((r) => r.id)).toContain(x.id)
  })
})
