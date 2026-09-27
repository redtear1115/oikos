import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Regression for #1442 ─────────────────────────────────────────────────
//
// leaveGroup moves the leaver's House / Car / Insurance 愛物 to the leaver's
// new ledger, and moves the leaver's own rows with them. Before #1442 every
// OTHER link into those 愛物 stayed where it was, so after a leave a row in
// one ledger could point at a 愛物 that now lives in the other:
//   - the stayer's expense on the leaver's house (asset_id)
//   - the stayer's fuel expense on the leaver's car (asset_id + fuel_log_id)
//   - the leaver's fuel expense on the stayer's car (fuel_log_id — asset_id
//     was already nulled by the #1441 CASE)
//   - an insurance policy on one side whose vehicle_id / insured_child_id
//     names a 愛物 on the other side
// There's no error when this happens: the 愛物 page just counts records from
// a ledger its viewer isn't in, or shows a link nobody can open.
//
// User decision (2026-09-27): the link is cleared (set to NULL); the record
// itself is kept, with its amount.
//
// The generic check below lists every foreign key into "Assets" / "FuelLogs"
// from the live catalog and asserts the suite knows about each one — so a new
// asset-referencing column added later fails this suite until someone decides
// whether a leave can make it cross ledgers.
//
// Local throwaway database only; refuses to run against anything that is not
// localhost. Start one with:
//   docker run -d --name pg-1442 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55840:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55840/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55840/postgres npx vitest run __tests__/actions/leaveGroup.crossLedgerLinks.test.ts
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

vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))

const { db } = await import('@/lib/db/client')
const {
  profiles,
  oikosGroups,
  groupBalance,
  groupEpochs,
  cashTransactions,
  incomeTransactions,
  recurringExpenseRules,
  recurringIncomeRules,
  assets,
  carDetails,
  houseDetails,
  childDetails,
  insuranceDetails,
  fuelLogs,
} = await import('@/lib/db/schema')
const { leaveGroup } = await import('@/actions/membership')
const { eq, inArray, sql } = await import('drizzle-orm')
const { unwrapAction } = await import('@/lib/action-errors')

beforeAll(() => {
  if (!isLocalDb) return
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set (see file header).')
})

// ─── The audit, as data ─────────────────────────────────────────────────────
//
// Every FK column that references "Assets" or an asset-owned row ("FuelLogs").
// `rowLedger` resolves which ledger the referencing row lives in; `target`
// resolves which ledger the referenced row lives in. `identity` links ARE the
// 愛物 (a detail row / a fuel log has no ledger of its own — it lives wherever
// its asset lives), so they cannot cross and are only listed for the inventory.
type Link =
  | { table: string; column: string; identity: true }
  | { table: string; column: string; identity?: false; rowLedger: string; target: 'Assets' | 'FuelLogs' }

const ASSET_OF = (col: string) => `(SELECT a.group_id FROM "Assets" a WHERE a.id = ${col})`
const FUEL_LOG_OF = (col: string) =>
  `(SELECT a.group_id FROM "FuelLogs" f JOIN "Assets" a ON a.id = f.asset_id WHERE f.id = ${col})`

const LINKS: Link[] = [
  { table: 'CashTransactions', column: 'asset_id', rowLedger: 't.group_id', target: 'Assets' },
  { table: 'CashTransactions', column: 'fuel_log_id', rowLedger: 't.group_id', target: 'FuelLogs' },
  { table: 'IncomeTransactions', column: 'asset_id', rowLedger: 't.group_id', target: 'Assets' },
  { table: 'RecurringExpenseRules', column: 'asset_id', rowLedger: 't.group_id', target: 'Assets' },
  { table: 'RecurringIncomeRules', column: 'asset_id', rowLedger: 't.group_id', target: 'Assets' },
  { table: 'InsuranceDetails', column: 'vehicle_id', rowLedger: ASSET_OF('t.asset_id'), target: 'Assets' },
  { table: 'InsuranceDetails', column: 'insured_child_id', rowLedger: ASSET_OF('t.asset_id'), target: 'Assets' },
  { table: 'InsuranceDetails', column: 'asset_id', identity: true },
  { table: 'CarDetails', column: 'asset_id', identity: true },
  { table: 'HouseDetails', column: 'asset_id', identity: true },
  { table: 'ChildDetails', column: 'asset_id', identity: true },
  { table: 'PetDetails', column: 'asset_id', identity: true },
  { table: 'PlantDetails', column: 'asset_id', identity: true },
  { table: 'FuelLogs', column: 'asset_id', identity: true },
]

async function crossLedgerLinks(groupIds: string[]) {
  const found: { link: string; id: string }[] = []
  const inGroups = sql.join(groupIds.map((id) => sql`${id}::uuid`), sql`, `)
  for (const link of LINKS) {
    if (link.identity) continue
    const col = `t.${link.column}`
    const target = link.target === 'Assets' ? ASSET_OF(col) : FUEL_LOG_OF(col)
    const rows = await db.execute<{ id: string }>(sql`
      SELECT ${sql.raw(link.table === 'InsuranceDetails' ? 't.asset_id' : 't.id')}::text AS id
      FROM ${sql.raw(`"${link.table}"`)} t
      WHERE ${sql.raw(col)} IS NOT NULL
        AND ${sql.raw(link.rowLedger)} IN (${inGroups})
        AND ${sql.raw(target)} IS DISTINCT FROM ${sql.raw(link.rowLedger)}
    `)
    for (const r of rows) found.push({ link: `${link.table}.${link.column}`, id: r.id })
  }
  return found
}

// ─── Seed ───────────────────────────────────────────────────────────────────

interface Refs {
  userAId: string
  userBId: string
  oldGroupId: string
  newGroupId?: string
}

async function seedDuoGroup(): Promise<Refs> {
  const userAId = randomUUID()
  const userBId = randomUUID()
  await db.insert(profiles).values([
    { id: userAId, displayName: 'TEST_1442_stayer' },
    { id: userBId, displayName: 'TEST_1442_leaver' },
  ])
  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_1442_duo', memberA: userAId, memberB: userBId,
  }).returning({ id: oikosGroups.id })
  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({
    groupId: group.id, startedAt: new Date(), memberAId: userAId, memberBId: userBId,
  })
  return { userAId, userBId, oldGroupId: group.id }
}

async function cleanup(refs: Refs) {
  const groups = [refs.oldGroupId, ...(refs.newGroupId ? [refs.newGroupId] : [])]
  const assetRows = await db.select({ id: assets.id }).from(assets).where(inArray(assets.groupId, groups))
  const assetIds = assetRows.map((r) => r.id)
  await db.delete(cashTransactions).where(inArray(cashTransactions.groupId, groups))
  await db.delete(incomeTransactions).where(inArray(incomeTransactions.groupId, groups))
  await db.delete(recurringExpenseRules).where(inArray(recurringExpenseRules.groupId, groups))
  await db.delete(recurringIncomeRules).where(inArray(recurringIncomeRules.groupId, groups))
  if (assetIds.length) {
    await db.delete(fuelLogs).where(inArray(fuelLogs.assetId, assetIds))
    await db.delete(insuranceDetails).where(inArray(insuranceDetails.assetId, assetIds))
    await db.delete(carDetails).where(inArray(carDetails.assetId, assetIds))
    await db.delete(houseDetails).where(inArray(houseDetails.assetId, assetIds))
    await db.delete(childDetails).where(inArray(childDetails.assetId, assetIds))
    await db.delete(assets).where(inArray(assets.id, assetIds))
  }
  await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, groups))
  await db.delete(groupBalance).where(inArray(groupBalance.groupId, groups))
  await db.delete(oikosGroups).where(inArray(oikosGroups.id, groups))
  await db.delete(profiles).where(inArray(profiles.id, [refs.userAId, refs.userBId]))
}

async function newAsset(groupId: string, type: 'car' | 'house' | 'child' | 'insurance', name: string) {
  const [a] = await db.insert(assets).values({ groupId, type, name }).returning({ id: assets.id })
  return a.id
}

const at = new Date('2026-05-01T00:00:00Z')

async function cashTx(v: {
  groupId: string; paidBy: string; amount: number; assetId?: string | null; fuelLogId?: string | null
  splitType?: 'all_mine' | 'half'; deletedAt?: Date | null
}) {
  const [row] = await db.insert(cashTransactions).values({
    groupId: v.groupId, paidBy: v.paidBy, amount: v.amount,
    splitType: v.splitType ?? 'all_mine',
    assetId: v.assetId ?? null, fuelLogId: v.fuelLogId ?? null,
    description: 'TEST_1442', category: 'transport', transactedAt: at,
    deletedAt: v.deletedAt ?? null,
  }).returning({ id: cashTransactions.id })
  return row.id
}

describe.skipIf(!isLocalDb)('leaveGroup — links that would cross ledgers are cleared (#1442)', () => {
  let activeRefs: Refs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('the audit covers every foreign key into Assets / FuelLogs', async () => {
    const rows = await db.execute<{ tbl: string; col: string }>(sql`
      SELECT replace(c.conrelid::regclass::text, '"', '') AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.confrelid IN ('"Assets"'::regclass, '"FuelLogs"'::regclass)
    `)
    const live = rows.map((r) => `${r.tbl}.${r.col}`).sort()
    const audited = LINKS.map((l) => `${l.table}.${l.column}`).sort()
    expect(live).toEqual(audited)
  })

  it('clears every cross-ledger link in both directions, keeps the rows, amounts and balances', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    const { userAId: A, userBId: B, oldGroupId: G } = refs

    // Leaver's 愛物 (move): car, house, two insurance policies.
    const carB = await newAsset(G, 'car', 'TEST_1442 leaver car')
    await db.insert(carDetails).values({ assetId: carB, primaryUserId: B })
    const houseB = await newAsset(G, 'house', 'TEST_1442 leaver house')
    await db.insert(houseDetails).values({ assetId: houseB, owner: B })
    // Stayer's 愛物 (stay): car, child.
    const carA = await newAsset(G, 'car', 'TEST_1442 stayer car')
    await db.insert(carDetails).values({ assetId: carA, primaryUserId: A })
    const childC = await newAsset(G, 'child', 'TEST_1442 child')
    await db.insert(childDetails).values({ assetId: childC })

    // Leaver's policy on the leaver's own car → link kept.
    const insBOwnCar = await newAsset(G, 'insurance', 'TEST_1442 leaver policy own car')
    await db.insert(insuranceDetails).values({
      assetId: insBOwnCar, insuredType: 'user', insuredUserId: B, vehicleId: carB,
    })
    // Leaver's policy naming a car and a child that stay → both cleared.
    const insBStaying = await newAsset(G, 'insurance', 'TEST_1442 leaver policy staying refs')
    await db.insert(insuranceDetails).values({
      assetId: insBStaying, insuredType: 'user', insuredUserId: B, vehicleId: carA, insuredChildId: childC,
    })
    // Stayer's policy on the leaver's car (cleared) for the child (kept).
    const insA = await newAsset(G, 'insurance', 'TEST_1442 stayer policy')
    await db.insert(insuranceDetails).values({
      assetId: insA, insuredType: 'child', insuredChildId: childC, vehicleId: carB,
    })

    const flA = (await db.insert(fuelLogs).values({
      assetId: carA, liters: '30.00', fuelType: '95', odometer: 1000, loggedAt: at,
    }).returning({ id: fuelLogs.id }))[0].id
    const flB = (await db.insert(fuelLogs).values({
      assetId: carB, liters: '40.00', fuelType: '95', odometer: 2000, loggedAt: at,
    }).returning({ id: fuelLogs.id }))[0].id

    // Expenses. The two `half` rows cancel out so the pre-leave balance is 0.
    const txAonHouseB = await cashTx({ groupId: G, paidBy: A, amount: 1000, splitType: 'half', assetId: houseB })
    const txAfuelCarB = await cashTx({ groupId: G, paidBy: A, amount: 700, assetId: carB, fuelLogId: flB })
    const txAfuelCarA = await cashTx({ groupId: G, paidBy: A, amount: 600, assetId: carA, fuelLogId: flA })
    const txAdeletedOnHouseB = await cashTx({
      groupId: G, paidBy: A, amount: 50, assetId: houseB, deletedAt: new Date('2026-05-02T00:00:00Z'),
    })
    const txBfuelCarB = await cashTx({ groupId: G, paidBy: B, amount: 800, assetId: carB, fuelLogId: flB })
    const txBfuelCarA = await cashTx({ groupId: G, paidBy: B, amount: 1000, splitType: 'half', assetId: carA, fuelLogId: flA })
    const txBonHouseB = await cashTx({ groupId: G, paidBy: B, amount: 900, assetId: houseB })

    const [incAonHouseB] = await db.insert(incomeTransactions).values({
      groupId: G, recipientId: A, amount: 20000, category: 'rent', assetId: houseB, occurredAt: '2026-05-01',
    }).returning({ id: incomeTransactions.id })
    const [incBonInsB] = await db.insert(incomeTransactions).values({
      groupId: G, recipientId: B, amount: 3000, category: 'insurance', assetId: insBOwnCar, occurredAt: '2026-05-01',
    }).returning({ id: incomeTransactions.id })

    const ruleBase = { amount: 500, category: 'transport', dayOfMonth: 1, startsOn: '2026-05-01', nextOccurrenceAt: '2026-06-01' }
    const [reAonCarB] = await db.insert(recurringExpenseRules).values({
      ...ruleBase, groupId: G, paidBy: A, splitType: 'all_mine', description: 'TEST_1442', assetId: carB,
    }).returning({ id: recurringExpenseRules.id })
    const [reBonHouseB] = await db.insert(recurringExpenseRules).values({
      ...ruleBase, groupId: G, paidBy: B, splitType: 'all_mine', description: 'TEST_1442', assetId: houseB,
    }).returning({ id: recurringExpenseRules.id })
    const [riAonInsB] = await db.insert(recurringIncomeRules).values({
      ...ruleBase, groupId: G, recipientId: A, assetId: insBOwnCar,
    }).returning({ id: recurringIncomeRules.id })

    const allTxIds = [txAonHouseB, txAfuelCarB, txAfuelCarA, txAdeletedOnHouseB, txBfuelCarB, txBfuelCarA, txBonHouseB]
    const moneyOf = async () => {
      const rows = await db.select({
        id: cashTransactions.id, amount: cashTransactions.amount, paidBy: cashTransactions.paidBy,
        splitType: cashTransactions.splitType, splitRatioA: cashTransactions.splitRatioA,
        status: cashTransactions.status, deletedAt: cashTransactions.deletedAt,
      }).from(cashTransactions).where(inArray(cashTransactions.id, allTxIds))
      return new Map(rows.map((r) => [r.id, r]))
    }
    const moneyBefore = await moneyOf()
    expect(moneyBefore.size).toBe(allTxIds.length)
    expect(await crossLedgerLinks([G])).toEqual([])

    // ── Act ──
    mockUserId = B
    const result = unwrapAction(await leaveGroup())
    const N = result.groupId
    refs.newGroupId = N

    // Assets moved as before (#1441).
    const assetGroup = new Map(
      (await db.select({ id: assets.id, groupId: assets.groupId }).from(assets)
        .where(inArray(assets.id, [carB, houseB, insBOwnCar, insBStaying, carA, childC, insA])))
        .map((r) => [r.id, r.groupId]),
    )
    for (const id of [carB, houseB, insBOwnCar, insBStaying]) expect(assetGroup.get(id)).toBe(N)
    for (const id of [carA, childC, insA]) expect(assetGroup.get(id)).toBe(G)

    // The generic invariant: no row in either ledger references the other.
    expect(await crossLedgerLinks([G, N])).toEqual([])

    // Specific outcomes.
    const tx = async (id: string) =>
      (await db.select().from(cashTransactions).where(eq(cashTransactions.id, id)).limit(1))[0]
    // Stayer's rows stay in the old ledger; links to moved 愛物 cleared.
    expect(await tx(txAonHouseB)).toMatchObject({ groupId: G, assetId: null })
    expect(await tx(txAfuelCarB)).toMatchObject({ groupId: G, assetId: null, fuelLogId: null })
    expect(await tx(txAdeletedOnHouseB)).toMatchObject({ groupId: G, assetId: null })
    // Stayer's links to staying 愛物 preserved.
    expect(await tx(txAfuelCarA)).toMatchObject({ groupId: G, assetId: carA, fuelLogId: flA })
    // Leaver's links to moved 愛物 preserved.
    expect(await tx(txBfuelCarB)).toMatchObject({ groupId: N, assetId: carB, fuelLogId: flB })
    expect(await tx(txBonHouseB)).toMatchObject({ groupId: N, assetId: houseB })
    // Leaver's fuel row on the stayer's car: both links cleared.
    expect(await tx(txBfuelCarA)).toMatchObject({ groupId: N, assetId: null, fuelLogId: null })

    const inc = async (id: string) =>
      (await db.select().from(incomeTransactions).where(eq(incomeTransactions.id, id)).limit(1))[0]
    expect(await inc(incAonHouseB.id)).toMatchObject({ groupId: G, assetId: null, amount: 20000 })
    expect(await inc(incBonInsB.id)).toMatchObject({ groupId: N, assetId: insBOwnCar, amount: 3000 })

    const re = async (id: string) =>
      (await db.select().from(recurringExpenseRules).where(eq(recurringExpenseRules.id, id)).limit(1))[0]
    expect(await re(reAonCarB.id)).toMatchObject({ groupId: G, assetId: null, amount: 500 })
    expect(await re(reBonHouseB.id)).toMatchObject({ groupId: N, assetId: houseB })
    const [ri] = await db.select().from(recurringIncomeRules).where(eq(recurringIncomeRules.id, riAonInsB.id))
    expect(ri).toMatchObject({ groupId: G, assetId: null, amount: 500 })

    const ins = async (id: string) =>
      (await db.select().from(insuranceDetails).where(eq(insuranceDetails.assetId, id)).limit(1))[0]
    expect(await ins(insBOwnCar)).toMatchObject({ vehicleId: carB, insuredUserId: B })
    expect(await ins(insBStaying)).toMatchObject({ vehicleId: null, insuredChildId: null, insuredUserId: B })
    expect(await ins(insA)).toMatchObject({ vehicleId: null, insuredChildId: childC })

    // Fuel logs are records too — they stay on their car, nothing deleted.
    const logs = await db.select({ id: fuelLogs.id, assetId: fuelLogs.assetId, deletedAt: fuelLogs.deletedAt })
      .from(fuelLogs).where(inArray(fuelLogs.id, [flA, flB]))
    expect(new Map(logs.map((l) => [l.id, l.assetId]))).toEqual(new Map([[flA, carA], [flB, carB]]))
    for (const l of logs) expect(l.deletedAt).toBeNull()

    // Money untouched: every row still exists with the same amount / payer /
    // split / status / deletion; each ledger holds exactly its payer's rows.
    const moneyAfter = await moneyOf()
    expect(moneyAfter).toEqual(moneyBefore)
    const sumIn = async (groupId: string) => (await db.execute<{ s: number }>(sql`
      SELECT COALESCE(SUM(amount), 0)::int AS s FROM "CashTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
    `))[0].s
    expect(await sumIn(G)).toBe(1000 + 700 + 600)
    expect(await sumIn(N)).toBe(800 + 1000 + 900)
    const balances = await db.select({ groupId: groupBalance.groupId, balance: groupBalance.balance })
      .from(groupBalance).where(inArray(groupBalance.groupId, [G, N]))
    expect(new Map(balances.map((b) => [b.groupId, b.balance]))).toEqual(new Map([[G, 0], [N, 0]]))
  })

  it('leaver with no owned 愛物: their fuel row on the stayer car loses both links', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    const { userAId: A, userBId: B, oldGroupId: G } = refs

    const carA = await newAsset(G, 'car', 'TEST_1442 stayer car only')
    await db.insert(carDetails).values({ assetId: carA, primaryUserId: A })
    const flA = (await db.insert(fuelLogs).values({
      assetId: carA, liters: '20.00', fuelType: '95', odometer: 500, loggedAt: at,
    }).returning({ id: fuelLogs.id }))[0].id
    const txB = await cashTx({ groupId: G, paidBy: B, amount: 400, assetId: carA, fuelLogId: flA })
    const txA = await cashTx({ groupId: G, paidBy: A, amount: 300, assetId: carA, fuelLogId: flA })

    mockUserId = B
    const result = unwrapAction(await leaveGroup())
    refs.newGroupId = result.groupId

    expect(await crossLedgerLinks([G, result.groupId])).toEqual([])
    const [b] = await db.select().from(cashTransactions).where(eq(cashTransactions.id, txB))
    expect(b).toMatchObject({ groupId: result.groupId, assetId: null, fuelLogId: null, amount: 400 })
    const [a] = await db.select().from(cashTransactions).where(eq(cashTransactions.id, txA))
    expect(a).toMatchObject({ groupId: G, assetId: carA, fuelLogId: flA, amount: 300 })
  })
})
