// @vitest-environment node
/**
 * #1466 — behavioural half of the ciphertext guard (the static half is
 * tests/no-ciphertext-to-client.test.ts).
 *
 * Runs the real /assets and /assets/[id] server components with every
 * encrypted column populated with a v1 ciphertext, and checks the props they
 * hand to their client component. Those props are what the RSC payload
 * carries to the browser: any string in them is emitted verbatim.
 *
 * The house and child detail queries (getHouseDetails / getChildDetails) are
 * the REAL functions over the mocked db, so a query that starts returning a
 * ciphertext field again is caught here as well as a page that forwards one.
 *
 * Failure looks like: nothing on screen. Before #1466 the house page's props
 * contained `details.addressEncrypted = "v1:k…"`, visible only in
 * view-source / the RSC payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { queueDbResult, resetDbMocks } from './_mocks/db'
import { encrypt, aadFor } from '@/lib/crypto'

const GROUP = { id: 'g1', memberA: 'user-a', memberB: 'user-b', guardianBetaEnabled: true }
const WINDOW = { startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: null, epochId: 'e1', isPast: false }
const CREATED = new Date('2026-02-01T00:00:00Z')

const CT = {
  plate: encrypt('ABC-1234', aadFor('CarDetails', 'plate_encrypted', 'car-1')),
  childName: encrypt('陳小白', aadFor('Assets', 'name_encrypted', 'child-1')),
  address: encrypt('台北市大安區某路1號', aadFor('HouseDetails', 'address_encrypted', 'house-1')),
  nationalId: encrypt('A123456789', aadFor('ChildDetails', 'id_number_encrypted', 'child-1')),
  nhi: encrypt('NHI-001', aadFor('ChildDetails', 'insurance_id_encrypted', 'child-1')),
}
/** Any v1 ciphertext, whatever the kid. */
const CIPHERTEXT_RE = /v1:k\d+:[0-9a-f]{24}:[0-9a-f]{32}:/
const ENCRYPTED_KEY_RE = /Encrypted"\s*:|_encrypted"\s*:/

const baseAsset = {
  groupId: 'g1', notes: null, templateKey: null, templateFields: null, deletedAt: null, createdAt: CREATED,
  nameEncrypted: null, plateEncrypted: null, purchasedAt: null, purchasePrice: null, fuelType: '95', primaryUserId: null,
  color: null, year: null, brand: null, model: null, initialOdometer: null,
  insuranceType: null, insuranceTermYears: null, insuranceExpiryDate: null, insuranceStartsAt: null,
  insurancePayCycle: null, insuranceVehicleId: null, insuranceInsurer: null,
  childNickname: null, childBirthday: null, childHeightCm: null, childWeightG: null,
}
// Shaped like what listAssetsForGroup / getAssetById really return: the
// ciphertext columns are selected (the pages derive booleans from them).
const ASSETS = [
  { ...baseAsset, id: 'car-1', type: 'car', name: '小白車', plateEncrypted: CT.plate },
  { ...baseAsset, id: 'child-1', type: 'child', name: '小白', nameEncrypted: CT.childName },
  { ...baseAsset, id: 'house-1', type: 'house', name: '我們的家' },
]

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) },
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: async () => ({ id: 'user-a' }) }))
vi.mock('@/lib/db/queries/epoch', () => ({
  resolveViewerEpochContext: async () => ({ group: GROUP, window: WINDOW }),
}))
vi.mock('@/lib/i18n/t', () => ({
  getTranslations: async () => ({
    assetListItem: { insuranceGroups: { shortTermProtection: 's', longTermProtection: 'l', savings: 'v' } },
    assetDetail: { switcher: { carGroup: 'c' } },
  }),
}))
vi.mock('@/lib/db/queries/asset', () => ({
  listAssetsForGroup: async () => ASSETS,
  getAssetById: async (id: string) => ASSETS.find((a) => a.id === id) ?? null,
  getAssetSummariesBatch: async () => new Map(),
  getAssetSummary: async () => ({ monthAmount: 0, totalAmount: 0 }),
  listTransactionsPagedForAsset: async () => [],
}))
vi.mock('@/lib/db/queries/fuelLog', () => ({
  getCarHeroStats: async () => ({ latestOdometer: null, avgFuelEcon: null, lastFuelDate: null }),
  listFuelLogsWithPrev: async () => [],
  fuelStatsForAsset: async () => ({ monthFuel: 0, totalFuel: 0 }),
}))
vi.mock('@/lib/db/queries/aibutsu', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/db/queries/aibutsu')>()
  return {
    ...real,
    // Real: getHouseDetails, getChildDetails (the ciphertext → boolean mappers).
    getChildNicknames: async () => new Map(),
    getPetListDetailsBatch: async () => new Map(),
    getPlantListDetailsBatch: async () => new Map(),
    getLinkedInsurancesForVehicle: async () => [],
  }
})

const { default: AssetsPage } = await import('@/app/(dashboard)/assets/page')
const { default: AssetDetailPage } = await import('@/app/(dashboard)/assets/[id]/page')

async function detailProps(id: string): Promise<Record<string, unknown>> {
  const el = (await AssetDetailPage({ params: Promise.resolve({ id }) })) as ReactElement<Record<string, unknown>>
  return el.props
}

function expectNoCiphertext(props: unknown) {
  const wire = JSON.stringify(props)
  expect(wire).not.toMatch(CIPHERTEXT_RE)
  expect(wire).not.toMatch(ENCRYPTED_KEY_RE)
}

beforeEach(() => resetDbMocks())

describe('#1466 — asset pages hand no ciphertext to client components', () => {
  it('house detail: the address is a boolean, the ciphertext stays on the server', async () => {
    queueDbResult([{ owner: 'user-a', addressEncrypted: CT.address, purchasedAt: '2020-01-01', purchasePrice: 100 }])
    const props = await detailProps('house-1')
    expectNoCiphertext(props)
    expect(props.details).toEqual({ owner: 'user-a', hasAddress: true, purchasedAt: '2020-01-01', purchasePrice: 100 })
    expect((props.assetSheetInitial as { houseHasAddress: boolean }).houseHasAddress).toBe(true)
  })

  it('house detail without an address: hasAddress false', async () => {
    queueDbResult([{ owner: 'user-a', addressEncrypted: null, purchasedAt: null, purchasePrice: null }])
    const props = await detailProps('house-1')
    expectNoCiphertext(props)
    expect((props.details as { hasAddress: boolean }).hasAddress).toBe(false)
    expect((props.assetSheetInitial as { houseHasAddress: boolean }).houseHasAddress).toBe(false)
  })

  it('child detail: full name / national id / NHI no. are booleans only', async () => {
    queueDbResult([{
      birthday: null, gender: null, idNumberEncrypted: CT.nationalId, insuranceIdEncrypted: CT.nhi,
      nickname: '小白', hospital: null, bloodType: null, heightCm: null, weightG: null,
    }])
    const props = await detailProps('child-1')
    expectNoCiphertext(props)
    expect(props.assetSheetInitial).toMatchObject({ childHasFullName: true, childHasNationalId: true, childHasNhiNo: true })
  })

  it('car detail: the plate is a boolean only', async () => {
    const props = await detailProps('car-1')
    expectNoCiphertext(props)
    expect(props.hasPlate).toBe(true)
  })

  it('asset list: no row carries a ciphertext field', async () => {
    const el = (await AssetsPage()) as ReactElement<{ items: { id: string; hasPlate: boolean }[] }>
    expectNoCiphertext(el.props)
    expect(el.props.items.find((i) => i.id === 'car-1')?.hasPlate).toBe(true)
  })

  it('self-check: the detector sees a ciphertext if one is present', () => {
    expect(() => expectNoCiphertext({ details: { addressEncrypted: CT.address } })).toThrow()
    expect(() => expectNoCiphertext({ nested: [{ x: CT.plate }] })).toThrow()
  })
})
