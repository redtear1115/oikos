// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// #1579 — an insurance policy whose 要保人 / member 被保人 left the ledger.
// The pages must not put that person's profile id or current name into the
// client payload: not in the edit sheet's initial values, not in the
// `details` row handed to the detail views, not in the /assets list items.
//
//   chapter 1  A + B   closed, epoch e1 — B left
//   chapter 2  A + D   open,   epoch e2 — D joined later
//   group row today: member_a A, member_b D
//
// Failure looks like nothing: the page renders, but the RSC payload carries
// B's uuid (and their current display name) to A's browser, and the edit
// sheet sends B's uuid back on save → `policyholder_not_member`.
//
// The real sanitiser (lib/insuranceMemberLink.ts) and the real wrapper
// (lib/db/queries/insuranceView.ts) run here; only the raw DB reads are mocked.

const EX = 'b0b0b0b0-ex00-4000-8000-0000000000b0'        // B, left
const EX_NAME = 'Bea Current Name'
const EX_AVATAR = 'https://img.example/bea.png'
const ME = 'a0a0a0a0-me00-4000-8000-0000000000a0'        // A
const NEW = 'd0d0d0d0-new0-4000-8000-0000000000d0'       // D, joined after B left
const NEW_NAME = 'Dana Current Name'

const CH1 = { startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-06-01T00:00:00Z'), epochId: 'e1', isPast: true }
const CH2 = { startedAt: new Date('2026-06-01T00:00:00Z'), endedAt: null, epochId: 'e2', isPast: false }
const GROUP = { id: 'g1', memberA: ME, memberB: NEW, guardianBetaEnabled: true }
const OLD = new Date('2026-02-01T00:00:00Z')

const insAsset = (id: string, insuranceType: string, holder: string | null, insuredUser: string | null, insuredName: string | null) => ({
  id, type: 'insurance', name: `policy ${id}`, groupId: 'g1', notes: null, templateKey: null, templateFields: null,
  deletedAt: null, frozenAt: null, plateEncrypted: null, createdAt: OLD,
  insuranceType, insuranceInsured: null, insuranceInsuredChildId: null, insuranceInsuredChildName: null,
  insuranceInsuredUserId: insuredUser, insuranceInsuredUserDisplayName: insuredName,
  insurancePolicyHolderUserId: holder,
  insurancePolicyHolderDisplayName: holder === EX ? EX_NAME : holder === NEW ? NEW_NAME : holder ? 'Me' : null,
  insurancePolicyHolderAvatarUrl: holder === EX ? EX_AVATAR : null,
  insuranceInsurer: 'Acme', insuranceAnnualPremium: 1000, insuranceSumInsured: null, insuranceStartsAt: null,
  insuranceExpiryDate: null, insuranceTermYears: null, insurancePayCycle: null, insuranceReminderDaysBefore: 30,
  insuranceVehicleId: null, insuranceCurrency: null,
})
const ASSETS = [
  // Both the holder and the insured left (B).
  insAsset('ins-ex-savings', 'savings', EX, EX, EX_NAME),
  insAsset('ins-ex-medical', 'medical', EX, EX, EX_NAME),
  // Control: holder and insured are current members.
  insAsset('ins-current', 'medical', ME, NEW, NEW_NAME),
  // Holder is D, who joined after B left (what B must not see when pinned).
  insAsset('ins-new-holder', 'medical', NEW, NEW, NEW_NAME),
]
const detailsFor = (id: string) => {
  const a = ASSETS.find((x) => x.id === id)!
  return {
    policyNo: null, kind: a.insuranceType, insured: null, insuredChildId: null, insuredChildName: null,
    insuredUserId: a.insuranceInsuredUserId, insuredUserDisplayName: a.insuranceInsuredUserDisplayName,
    policyHolderUserId: a.insurancePolicyHolderUserId, insurer: 'Acme', annualPremium: 1000, payCycle: 'annual',
    startsAt: '2026-01-01', endsAt: '2046-01-01', termYears: 20, sumInsured: null, vehicleId: null,
    expectedMaturityAmount: null, accountValue: null,
  }
}

let viewer = ME
let epochWindow: typeof CH1 | typeof CH2 = CH2

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) },
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: async () => ({ id: viewer }) }))
vi.mock('@/lib/db/queries/epoch', () => ({
  resolveViewerEpochContext: async () => ({ group: GROUP, window: epochWindow }),
  getEpochMembers: vi.fn(async (id: string) => (id === 'e1' ? { memberAId: ME, memberBId: EX } : { memberAId: ME, memberBId: NEW })),
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
vi.mock('@/lib/db/queries/recurringIncome', () => ({ listRulesForAsset: async () => [] }))
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
  getInsuranceDetails: async (id: string) => detailsFor(id),
  getLinkedInsurancesForVehicle: async () => [],
}))

const { default: AssetsPage } = await import('@/app/(dashboard)/assets/page')
const { default: AssetDetailPage } = await import('@/app/(dashboard)/assets/[id]/page')

type InsuranceItem = { id: string; insurance?: Record<string, unknown> }
async function listItems(): Promise<InsuranceItem[]> {
  const el = (await AssetsPage()) as ReactElement<{ items: InsuranceItem[] }>
  return el.props.items
}
type DetailProps = { details: Record<string, unknown>; assetSheetInitial: Record<string, unknown> }
async function detail(id: string): Promise<DetailProps> {
  const el = (await AssetDetailPage({ params: Promise.resolve({ id }) })) as ReactElement<DetailProps>
  return el.props
}
/** Everything the server component hands to the client, as it would be serialised. */
const wire = (v: unknown) => JSON.stringify(v)

beforeEach(() => { vi.clearAllMocks() })

describe('A, current member, current chapter — B (holder + insured) left', () => {
  beforeEach(() => { viewer = ME; epochWindow = CH2 })

  for (const id of ['ins-ex-savings', 'ins-ex-medical']) {
    it(`${id}: the detail page payload has no trace of B`, async () => {
      const p = await detail(id)
      expect(wire(p)).not.toContain(EX)
      expect(wire(p)).not.toContain(EX_NAME)
      expect(wire(p)).not.toContain(EX_AVATAR)
      expect(p.assetSheetInitial).toMatchObject({
        insPolicyHolderUserId: null,
        insPolicyHolderFormer: true,
        insInsuredUserId: null,
        insInsuredFormer: true,
      })
      expect(p.details).toMatchObject({
        policyHolderUserId: null,
        insuredUserId: null,
        insuredUserDisplayName: null,
        policyHolderIsFormer: true,
        insuredIsFormer: true,
        formerLabel: true,
      })
    })
  }

  it('control: a current-member policy keeps its ids and name, flags false', async () => {
    const p = await detail('ins-current')
    expect(p.assetSheetInitial).toMatchObject({
      insPolicyHolderUserId: ME, insPolicyHolderFormer: false, insInsuredUserId: NEW, insInsuredFormer: false,
    })
    expect(p.details).toMatchObject({ insuredUserDisplayName: NEW_NAME, policyHolderIsFormer: false, insuredIsFormer: false })
  })

  it('the /assets list payload has no trace of B, and flags the former people', async () => {
    const items = await listItems()
    expect(wire(items)).not.toContain(EX)
    expect(wire(items)).not.toContain(EX_NAME)
    expect(wire(items)).not.toContain(EX_AVATAR)
    const ex = items.find((i) => i.id === 'ins-ex-medical')!.insurance!
    expect(ex).toMatchObject({
      policyHolderUserId: null, policyHolderDisplayName: null, policyHolderAvatarUrl: null, policyHolderIsFormer: true,
      insuredUserId: null, insuredUserDisplayName: null, insuredIsFormer: true, formerLabel: true,
    })
    const ok = items.find((i) => i.id === 'ins-current')!.insurance!
    expect(ok).toMatchObject({ policyHolderUserId: ME, insuredUserId: NEW, insuredUserDisplayName: NEW_NAME, insuredIsFormer: false })
  })
})

describe('B, who left, pinned to chapter 1 (A + B) — D joined after (#1579 F2)', () => {
  beforeEach(() => { viewer = EX; epochWindow = CH1 })

  it("D (the group's current partner) never reaches B, and is not labelled 前伴侶", async () => {
    const items = await listItems()
    expect(wire(items)).not.toContain(NEW)
    expect(wire(items)).not.toContain(NEW_NAME)
    const d = items.find((i) => i.id === 'ins-new-holder')!.insurance!
    expect(d).toMatchObject({ policyHolderIsFormer: true, insuredIsFormer: true, formerLabel: false })

    const p = await detail('ins-new-holder')
    expect(wire(p)).not.toContain(NEW)
    expect(wire(p)).not.toContain(NEW_NAME)
    expect(p.details).toMatchObject({ formerLabel: false })
  })

  it('B still sees themself, and A (the chapter partner) by name', async () => {
    const p = await detail('ins-ex-medical')
    expect(p.details).toMatchObject({ insuredUserId: EX, insuredUserDisplayName: EX_NAME, insuredIsFormer: false })
    const items = await listItems()
    expect(items.find((i) => i.id === 'ins-current')!.insurance).toMatchObject({ policyHolderUserId: ME, policyHolderIsFormer: false })
  })
})

// F3 — one exit: no page reads the raw row. A page that imports
// getInsuranceDetails directly would hand the unsanitised row (ex-member uuid
// and current name) to its client components.
describe('no page under app/ reads the raw insurance details (#1579 F3)', () => {
  it('only lib/db/queries/insuranceView.ts calls getInsuranceDetails', () => {
    const root = resolve(__dirname, '..')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) { walk(p); continue }
        if (!/\.(ts|tsx)$/.test(name)) continue
        if (/\bgetInsuranceDetails\b/.test(readFileSync(p, 'utf8'))) hits.push(p.slice(root.length + 1))
      }
    }
    for (const dir of ['app', 'actions', 'components']) walk(join(root, dir))
    expect(hits).toEqual([])
  })
})
