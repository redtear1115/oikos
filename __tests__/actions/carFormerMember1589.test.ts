import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1589 — a car / house whose 主要使用人 / owner left the ledger ─────────
//
// B was A's partner and is the stored primary user of A's car and the stored
// owner of A's house. B was removed; removePartner moves nothing, so the rows
// still point at B.
//
//   solo:  group S = { A } (B gone, nobody new)
//   duo:   group D = { A2, N } (B gone, N joined later)
//
//   read:  getFuelLogById and getHouseDetails must not return B's profile id.
//   write: editCar with primaryUserId undefined (what the edit sheet sends
//          while the person is unresolved) keeps primary_user_id = B in the
//          DB; an explicit pick of a current member (or 共用) changes it; a
//          forged id of some other non-member is refused with
//          primary_user_not_in_group and changes nothing.
//
// Failure looks like: the fuel-log edit response carries B's uuid to A (and
// to N); or editing the car's brand silently turns the car into 共用.
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

let mockUserId = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }) },
  }),
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
const { profiles, oikosGroups, groupBalance, groupEpochs, assets, carDetails, fuelLogs, houseDetails } = await import('@/lib/db/schema')
const { editCar } = await import('@/actions/asset')
const { getFuelLogById } = await import('@/actions/fuelLog')
const { getHouseDetails } = await import('@/lib/db/queries/aibutsu')
const { unwrapAction } = await import('@/lib/action-errors')
const { eq, inArray } = await import('drizzle-orm')

const T = 'TEST_1589'
const p = { A: randomUUID(), A2: randomUUID(), N: randomUUID(), B: randomUUID(), C: randomUUID() }
type Ledger = { group: string; car: string; fuel: string; house: string }
const solo: Ledger = { group: '', car: '', fuel: '', house: '' }
const duo: Ledger = { group: '', car: '', fuel: '', house: '' }

async function seed(l: Ledger, memberA: string, memberB: string | null, tag: string) {
  const [g] = await db.insert(oikosGroups)
    .values({ name: `${T}_${tag}`, memberA, memberB })
    .returning({ id: oikosGroups.id })
  l.group = g.id
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: g.id, startedAt: new Date(), memberAId: memberA, memberBId: memberB })
  const [car] = await db.insert(assets).values({ groupId: g.id, type: 'car', name: `${T} car ${tag}` }).returning({ id: assets.id })
  l.car = car.id
  await db.insert(carDetails).values({ assetId: car.id, primaryUserId: p.B, fuelType: '95', brand: 'Before' })
  const [f] = await db.insert(fuelLogs)
    .values({ assetId: car.id, liters: '30.00', fuelType: '95', odometer: 12000, loggedAt: new Date() })
    .returning({ id: fuelLogs.id })
  l.fuel = f.id
  const [house] = await db.insert(assets).values({ groupId: g.id, type: 'house', name: `${T} house ${tag}` }).returning({ id: assets.id })
  l.house = house.id
  await db.insert(houseDetails).values({ assetId: house.id, owner: p.B, purchasePrice: 1000 })
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.')
  }
  await db.insert(profiles).values([
    { id: p.A, displayName: `${T}_A` },
    { id: p.A2, displayName: `${T}_A2` },
    { id: p.N, displayName: `${T}_N` },
    { id: p.B, displayName: `${T}_B_ex` },
    { id: p.C, displayName: `${T}_C_stranger` },
  ])
  await seed(solo, p.A, null, 'solo')
  await seed(duo, p.A2, p.N, 'duo')
})

afterAll(async () => {
  try {
    for (const l of [solo, duo]) {
      if (l.house) {
        await db.delete(houseDetails).where(eq(houseDetails.assetId, l.house))
        await db.delete(assets).where(eq(assets.id, l.house))
      }
      if (l.car) {
        await db.delete(fuelLogs).where(eq(fuelLogs.assetId, l.car))
        await db.delete(carDetails).where(eq(carDetails.assetId, l.car))
        await db.delete(assets).where(eq(assets.id, l.car))
      }
      if (l.group) {
        await db.delete(groupEpochs).where(eq(groupEpochs.groupId, l.group))
        await db.delete(groupBalance).where(eq(groupBalance.groupId, l.group))
        await db.delete(oikosGroups).where(eq(oikosGroups.id, l.group))
      }
    }
    await db.delete(profiles).where(inArray(profiles.id, Object.values(p)))
  } catch (err) {
    console.error('cleanup failed', err)
  }
})

const storedCar = async (carId: string) => {
  const [r] = await db
    .select({ primaryUserId: carDetails.primaryUserId, brand: carDetails.brand })
    .from(carDetails)
    .where(eq(carDetails.assetId, carId))
  return r
}

/** The payload the edit sheet sends while the former primary user is unresolved. */
const sheetSave = (carId: string, brand: string, primaryUserId: string | null | undefined) =>
  editCar({ id: carId, name: `${T} car`, purchasedAt: null, purchasePrice: null, fuelType: '95', primaryUserId, brand })

for (const [label, l, viewer, partner] of [
  ['solo', solo, () => p.A, null],
  ['duo', duo, () => p.A2, () => p.N],
] as const) {
  describe(`${label}: car whose primary user (B) left (#1589)`, () => {
    it("getFuelLogById carries no trace of B, and flags the former primary user", async () => {
      mockUserId = viewer()
      const detail = unwrapAction(await getFuelLogById(l.fuel))
      expect(detail).not.toBeNull()
      expect(JSON.stringify(detail)).not.toContain(p.B)
      expect(detail).toMatchObject({ carPrimaryUserId: null, carPrimaryUserIsFormer: true })
    })

    it("getHouseDetails (the house page's only details read) carries no owner id", async () => {
      const row = await getHouseDetails(l.house)
      expect(row).not.toBeNull()
      expect(JSON.stringify(row)).not.toContain(p.B)
      expect(row).not.toHaveProperty('owner')
    })

    it('an unchanged save (primaryUserId undefined) keeps primary_user_id = B in the DB', async () => {
      mockUserId = viewer()
      expect(await sheetSave(l.car, `After-${label}`, undefined)).toEqual({ ok: true, data: undefined })
      expect(await storedCar(l.car)).toEqual({ primaryUserId: p.B, brand: `After-${label}` })
    })

    it('a forged id of another non-member is refused and changes nothing', async () => {
      mockUserId = viewer()
      expect(await sheetSave(l.car, 'Forged', p.C)).toEqual({ ok: false, code: 'primary_user_not_in_group' })
      expect(await storedCar(l.car)).toEqual({ primaryUserId: p.B, brand: `After-${label}` })
    })

    if (partner) {
      it('an explicit pick of the current partner changes it', async () => {
        mockUserId = viewer()
        expect(await sheetSave(l.car, 'Picked', partner())).toEqual({ ok: true, data: undefined })
        expect(await storedCar(l.car)).toEqual({ primaryUserId: partner(), brand: 'Picked' })
        // and the read now returns the current partner, not former
        const detail = unwrapAction(await getFuelLogById(l.fuel))
        expect(detail).toMatchObject({ carPrimaryUserId: partner(), carPrimaryUserIsFormer: false })
      })

      it('an explicit 共用 (null) is still a real choice, not keep', async () => {
        mockUserId = viewer()
        expect(await sheetSave(l.car, 'Shared', null)).toEqual({ ok: true, data: undefined })
        expect(await storedCar(l.car)).toEqual({ primaryUserId: null, brand: 'Shared' })
      })
    } else {
      it('an explicit pick of the viewer changes it', async () => {
        mockUserId = viewer()
        expect(await sheetSave(l.car, 'Picked', viewer())).toEqual({ ok: true, data: undefined })
        expect(await storedCar(l.car)).toEqual({ primaryUserId: viewer(), brand: 'Picked' })
      })
    }
  })
}
