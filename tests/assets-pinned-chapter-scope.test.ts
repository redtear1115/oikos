// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

// /assets and /assets/[id] for a viewer pinned to a closed chapter of a group
// they are no longer in: only assets (and income rules) created before that
// chapter closed are readable. Current members are unaffected.
//
//   chapter 1  A + B   2026-03-01 → 2026-06-15, epoch e1 — B removed
//   chapter 2  A solo  2026-06-15 → open,       epoch e2
//   group row today: member_a A, member_b null
//
// After the removal A creates a new insurance (linked to the old car) and a new
// income rule on the old savings insurance.
//
// Failure looks like: nothing errors; the pinned chapter just shows assets and
// rules that did not exist in it.
//
// The query mocks below apply `createdBefore` the way the SQL does
// (`created_at < cutoff`); assets-pinned-chapter-scope-queries.test.ts checks
// that the real queries emit that predicate.

const ENDED = new Date('2026-06-15T00:00:00Z')
const BEFORE = new Date('2026-05-01T00:00:00Z')
const AFTER = new Date('2026-07-01T00:00:00Z')
const CH1 = { startedAt: new Date('2026-03-01T00:00:00Z'), endedAt: ENDED, epochId: 'e1', isPast: true }
const CH2 = { startedAt: ENDED, endedAt: null, epochId: 'e2', isPast: false }
const GROUP = { id: 'g1', memberA: 'user-a', memberB: null, guardianBetaEnabled: true }

const baseAsset = {
  groupId: 'g1', notes: null, templateKey: null, templateFields: null, deletedAt: null,
  plateEncrypted: null, purchasedAt: null, purchasePrice: null, fuelType: '95', primaryUserId: null,
  color: null, year: null, brand: null, model: null, initialOdometer: null,
  insuranceType: null, insuranceTermYears: null, insuranceExpiryDate: null, insuranceStartsAt: null,
  insurancePayCycle: null, insuranceVehicleId: null,
  childNickname: null, childBirthday: null, childHeightCm: null, childWeightG: null,
}
const ASSETS = [
  { ...baseAsset, id: 'car-old', type: 'car', name: 'Old car', createdAt: BEFORE },
  { ...baseAsset, id: 'ins-old', type: 'insurance', name: 'Old savings', insuranceType: 'savings', createdAt: BEFORE },
  { ...baseAsset, id: 'ins-new', type: 'insurance', name: 'New policy', insuranceType: 'car', insuranceVehicleId: 'car-old', createdAt: AFTER },
]
const RULES = [
  { id: 'rule-old', assetId: 'ins-old', createdAt: BEFORE },
  { id: 'rule-new', assetId: 'ins-old', createdAt: AFTER },
]
const before = <T extends { createdAt: Date }>(rows: T[], cutoff: Date | null | undefined) =>
  cutoff ? rows.filter((r) => r.createdAt < cutoff) : rows

let viewer = 'user-b'
let epochWindow: typeof CH1 | typeof CH2 = CH1

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) },
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: async () => ({ id: viewer }) }))
vi.mock('@/lib/db/queries/epoch', () => ({
  resolveViewerEpochContext: async () => ({ group: GROUP, window: epochWindow }),
}))
vi.mock('@/lib/i18n/t', () => ({
  getTranslations: async () => ({
    assetListItem: { insuranceGroups: { shortTermProtection: 's', longTermProtection: 'l', savings: 'v' } },
    assetDetail: { switcher: { carGroup: 'c' } },
  }),
}))
vi.mock('@/lib/db/queries/asset', () => ({
  listAssetsForGroup: vi.fn(async (_g: string, cutoff?: Date | null) => before(ASSETS, cutoff)),
  getAssetById: vi.fn(async (id: string, _g: string, cutoff?: Date | null) =>
    before(ASSETS, cutoff).find((a) => a.id === id) ?? null),
  getAssetSummariesBatch: async () => new Map(),
  getAssetSummary: async () => ({ monthAmount: 0, totalAmount: 0 }),
  listTransactionsPagedForAsset: async () => [],
}))
vi.mock('@/lib/db/queries/recurringIncome', () => ({
  listRulesForAsset: vi.fn(async (_g: string, assetId: string, cutoff?: Date | null) =>
    before(RULES, cutoff).filter((r) => r.assetId === assetId)),
}))
vi.mock('@/lib/db/queries/insurance', () => ({
  getInsurancePaymentTotal: async () => ({ total: 0, count: 0 }),
  getInsuranceReturnTotal: async () => ({ total: 0, count: 0 }),
  getInsuranceReturnTotalsByCategory: async () => new Map(),
  listInsurancePaymentsPaged: async () => [],
  listInsuranceReturnsPaged: async () => [],
}))
vi.mock('@/lib/db/queries/fuelLog', () => ({
  getCarHeroStats: async () => ({ latestOdometer: null, avgFuelEcon: null, lastFuelDate: null }),
  listFuelLogsWithPrev: async () => [],
  fuelStatsForAsset: async () => ({ monthFuel: 0, totalFuel: 0 }),
}))
vi.mock('@/lib/db/queries/aibutsu', () => ({
  getChildNicknames: async () => new Map(),
  getPetListDetailsBatch: async () => new Map(),
  getPlantListDetailsBatch: async () => new Map(),
  getChildDetails: async () => null,
  getPetDetails: async () => null,
  getPlantDetails: async () => null,
  getHouseDetails: async () => null,
  getInsuranceDetails: async (id: string) => (id === 'ins-old' ? { kind: 'savings', vehicleId: null } : { kind: 'car', vehicleId: 'car-old' }),
  getLinkedInsurancesForVehicle: async () =>
    ASSETS.filter((a) => a.insuranceVehicleId === 'car-old').map((a) => ({ id: a.id, name: a.name })),
}))

const { default: AssetsPage } = await import('@/app/(dashboard)/assets/page')
const { default: AssetDetailPage } = await import('@/app/(dashboard)/assets/[id]/page')
const assetQueries = await import('@/lib/db/queries/asset')
const ruleQueries = await import('@/lib/db/queries/recurringIncome')

async function listIds(): Promise<string[]> {
  const el = (await AssetsPage()) as ReactElement<{ items: { id: string }[] }>
  return el.props.items.map((i) => i.id).sort()
}
async function detail<P>(id: string): Promise<P> {
  const el = (await AssetDetailPage({ params: Promise.resolve({ id }) })) as ReactElement<P>
  return el.props
}
type SavingsProps = { recurringRules: { id: string }[] }
type CarProps = { linkedInsurances: { id: string }[]; siblings: { id: string }[] }

beforeEach(() => { vi.clearAllMocks() })

describe('removed member B, pinned to chapter 1', () => {
  beforeEach(() => { viewer = 'user-b'; epochWindow = CH1 })

  it('the list excludes an asset created after the chapter closed', async () => {
    expect(await listIds()).toEqual(['car-old', 'ins-old'])
    expect(assetQueries.listAssetsForGroup).toHaveBeenCalledWith('g1', ENDED)
  })

  it('the newer asset is not found by URL', async () => {
    await expect(detail('ins-new')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(assetQueries.getAssetById).toHaveBeenCalledWith('ins-new', 'g1', ENDED)
  })

  it("an old asset's detail excludes a rule created after the chapter closed", async () => {
    const p = await detail<SavingsProps>('ins-old')
    expect(p.recurringRules.map((r) => r.id)).toEqual(['rule-old'])
    expect(ruleQueries.listRulesForAsset).toHaveBeenCalledWith('g1', 'ins-old', ENDED)
  })

  it("an old car's detail does not name the newer linked insurance", async () => {
    const p = await detail<CarProps>('car-old')
    expect(p.linkedInsurances.map((i) => i.id)).toEqual([])
    expect(p.siblings.map((s) => s.id)).not.toContain('ins-new')
  })
})

describe('control: A, a current member', () => {
  for (const [label, win] of [['current chapter', CH2], ['pinned to chapter 1', CH1]] as const) {
    describe(label, () => {
      beforeEach(() => { viewer = 'user-a'; epochWindow = win })

      it('sees every asset', async () => {
        expect(await listIds()).toEqual(['car-old', 'ins-new', 'ins-old'])
      })

      it('reads with no cut-off', async () => {
        await listIds()
        await detail('ins-old')
        expect(assetQueries.listAssetsForGroup).toHaveBeenCalledWith('g1', null)
        expect(assetQueries.getAssetById).toHaveBeenCalledWith('ins-old', 'g1', null)
        expect(ruleQueries.listRulesForAsset).toHaveBeenCalledWith('g1', 'ins-old', null)
      })

      it('opens the newer asset', async () => {
        await expect(detail('ins-new')).resolves.toBeDefined()
      })

      it("sees both rules on the old asset and the car's linked insurance", async () => {
        expect((await detail<SavingsProps>('ins-old')).recurringRules.map((r) => r.id)).toEqual(['rule-old', 'rule-new'])
        expect((await detail<CarProps>('car-old')).linkedInsurances.map((i) => i.id)).toEqual(['ins-new'])
      })
    })
  }
})
