import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1485 — Assets joins are scoped to the row's own group ───────────────
//
// Read queries that resolve a linked 愛物 by id (a record's asset_id, a
// policy's insured_child_id / vehicle_id) used to join "Assets" on the id
// alone. #1442 makes cross-ledger links not exist, but if one ever did, those
// queries would show *another ledger's* asset name in this ledger. Defense in
// depth: every such join also requires the joined asset to be in the row's own
// group, so a foreign asset resolves as if absent (NULL name / no row).
//
// The suite seeds the failure directly: ledger A holds a record, a policy and
// a recurring link pointing at assets that live in ledger B, then asserts no
// query run for ledger A returns ledger B's asset names. In-group links next
// to them are the positive control (the join still resolves normal links).
//
// Local throwaway database only; refuses to run against anything that is not
// localhost. Start one with:
//   docker run -d --name pg-1485 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55685:5432 postgres:17
//   DATABASE_URL_DIRECT=postgres://postgres:pg@127.0.0.1:55685/postgres npx drizzle-kit push --force
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55685/postgres npx vitest run __tests__/actions/groupScopedAssetJoins.test.ts
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

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))

const { db } = await import('@/lib/db/client')
const {
  profiles, oikosGroups, groupBalance, groupEpochs, assets,
  carDetails, childDetails, insuranceDetails, cashTransactions,
} = await import('@/lib/db/schema')
const { listAssetsForGroup, getAssetById } = await import('@/lib/db/queries/asset')
const { getInsuranceDetails, getLinkedInsurancesForVehicle } = await import('@/lib/db/queries/aibutsu')
const { monthlyStatsByAsset } = await import('@/lib/db/queries/transactions')
const { inArray } = await import('drizzle-orm')

const T = 'TEST_1485'
const FOREIGN_CHILD = `${T} B child (foreign)`
const FOREIGN_CAR = `${T} B car (foreign)`
const OWN_CHILD = `${T} A child`
const OWN_CAR = `${T} A car`

const ids = {
  A: randomUUID(), B: randomUUID(),
  gA: '', gB: '',
  childA: '', carA: '', childB: '', carB: '',
  insCross: '', insOwn: '', insVehicleCross: '',
}
const allTime = { startedAt: new Date(0), endedAt: null, epochId: null, isPast: false }

async function seed() {
  await db.insert(profiles).values([
    { id: ids.A, displayName: `${T}_A` },
    { id: ids.B, displayName: `${T}_B` },
  ])
  const group = async (member: string, name: string) => {
    const [g] = await db.insert(oikosGroups).values({ name, memberA: member, memberB: null })
      .returning({ id: oikosGroups.id })
    await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
    await db.insert(groupEpochs).values({ groupId: g.id, startedAt: new Date(Date.now() - 86400_000), memberAId: member, memberBId: null })
    return g.id
  }
  ids.gA = await group(ids.A, `${T}_A_ledger`)
  ids.gB = await group(ids.B, `${T}_B_ledger`)

  const mk = async (groupId: string, type: typeof assets.$inferInsert['type'], name: string) => {
    const [a] = await db.insert(assets).values({ groupId, type, name }).returning({ id: assets.id })
    return a.id
  }
  ids.childA = await mk(ids.gA, 'child', OWN_CHILD)
  await db.insert(childDetails).values({ assetId: ids.childA, nickname: 'a' })
  ids.carA = await mk(ids.gA, 'car', OWN_CAR)
  await db.insert(carDetails).values({ assetId: ids.carA, primaryUserId: ids.A })
  ids.childB = await mk(ids.gB, 'child', FOREIGN_CHILD)
  await db.insert(childDetails).values({ assetId: ids.childB, nickname: 'b' })
  ids.carB = await mk(ids.gB, 'car', FOREIGN_CAR)
  await db.insert(carDetails).values({ assetId: ids.carB, primaryUserId: ids.B })

  // Ledger A policy whose insured child is ledger B's child: the cross link.
  ids.insCross = await mk(ids.gA, 'insurance', `${T} A policy cross`)
  await db.insert(insuranceDetails).values({
    assetId: ids.insCross, insuredType: 'child', insuredChildId: ids.childB, policyNumber: 'PN-X',
  })
  // Positive control: ledger A policy on ledger A's own child.
  ids.insOwn = await mk(ids.gA, 'insurance', `${T} A policy own`)
  await db.insert(insuranceDetails).values({
    assetId: ids.insOwn, insuredType: 'child', insuredChildId: ids.childA, policyNumber: 'PN-O',
  })
  // Ledger A policy linked to ledger B's car.
  ids.insVehicleCross = await mk(ids.gA, 'insurance', `${T} A policy on B car`)
  await db.insert(insuranceDetails).values({
    assetId: ids.insVehicleCross, insuredType: 'user', insuredUserId: ids.A, vehicleId: ids.carB, policyNumber: 'PN-V',
  })

  // Ledger A expenses: one on ledger B's car (cross), one on its own car.
  await db.insert(cashTransactions).values([
    { groupId: ids.gA, paidBy: ids.A, assetId: ids.carB, amount: 900, splitType: 'all_mine', description: `${T} cross`, category: 'transit', transactedAt: new Date('2026-05-10T04:00:00Z') },
    { groupId: ids.gA, paidBy: ids.A, assetId: ids.carA, amount: 300, splitType: 'all_mine', description: `${T} own`, category: 'transit', transactedAt: new Date('2026-05-11T04:00:00Z') },
  ])
}

async function cleanup() {
  const groups = [ids.gA, ids.gB].filter(Boolean)
  if (groups.length === 0) return
  const groupAssets = (await db.select({ id: assets.id }).from(assets).where(inArray(assets.groupId, groups))).map((a) => a.id)
  await db.delete(cashTransactions).where(inArray(cashTransactions.groupId, groups))
  if (groupAssets.length) {
    // Policies first: their insured_child_id / vehicle_id reference other assets.
    await db.delete(insuranceDetails).where(inArray(insuranceDetails.assetId, groupAssets))
    await db.delete(carDetails).where(inArray(carDetails.assetId, groupAssets))
    await db.delete(childDetails).where(inArray(childDetails.assetId, groupAssets))
    await db.delete(assets).where(inArray(assets.id, groupAssets))
  }
  await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, groups))
  await db.delete(groupBalance).where(inArray(groupBalance.groupId, groups))
  await db.delete(oikosGroups).where(inArray(oikosGroups.id, groups))
  await db.delete(profiles).where(inArray(profiles.id, [ids.A, ids.B]))
}

describe.skipIf(!isLocalDb)('Assets joins are group-scoped (#1485)', () => {
  beforeAll(async () => {
    await seed()
  })
  afterAll(async () => {
    try { await cleanup() } catch (e) { console.error('cleanup failed', e) }
  })

  it('monthlyStatsByAsset: a record on another ledger\'s asset gets no name', async () => {
    const rows = await monthlyStatsByAsset(ids.gA, '2026-05', undefined, undefined, allTime, ids.A)
    const cross = rows.find((r) => r.key === ids.carB)
    expect(cross).toBeDefined()
    expect(cross!.name).toBeNull()
    expect(rows.find((r) => r.key === ids.carA)?.name).toBe(OWN_CAR)
    expect(rows.map((r) => r.name)).not.toContain(FOREIGN_CAR)
  })

  it('listAssetsForGroup: a policy\'s insured child in another ledger resolves as no name', async () => {
    const list = await listAssetsForGroup(ids.gA, ids.A)
    const cross = list.find((a) => a.id === ids.insCross)
    expect(cross).toBeDefined()
    expect(cross!.insuranceInsuredChildId).toBe(ids.childB)
    expect(cross!.insuranceInsuredChildName).toBeNull()
    expect(list.find((a) => a.id === ids.insOwn)?.insuranceInsuredChildName).toBe(OWN_CHILD)
    expect(list.map((a) => a.insuranceInsuredChildName)).not.toContain(FOREIGN_CHILD)
  })

  it('getAssetById: same, for the single-asset read', async () => {
    const cross = await getAssetById(ids.insCross, ids.gA, ids.A)
    expect(cross?.insuranceInsuredChildName).toBeNull()
    expect((await getAssetById(ids.insOwn, ids.gA, ids.A))?.insuranceInsuredChildName).toBe(OWN_CHILD)
  })

  it('getInsuranceDetails: foreign insured child resolves as no name; base row is group-scoped', async () => {
    const cross = await getInsuranceDetails(ids.insCross, ids.gA, ids.A)
    expect(cross).not.toBeNull()
    expect(cross!.insuredChildId).toBe(ids.childB)
    expect(cross!.insuredChildName).toBeNull()
    expect((await getInsuranceDetails(ids.insOwn, ids.gA, ids.A))?.insuredChildName).toBe(OWN_CHILD)
    // The policy itself is ledger A's: asking for it under ledger B returns nothing.
    expect(await getInsuranceDetails(ids.insCross, ids.gB, ids.A)).toBeNull()
  })

  it('getLinkedInsurancesForVehicle: ledger B\'s car does not list ledger A\'s policy', async () => {
    const linked = await getLinkedInsurancesForVehicle(ids.carB, ids.gB)
    expect(linked.map((l) => l.id)).not.toContain(ids.insVehicleCross)
  })
})
