// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// #1589 — a car whose 主要使用人, or a house whose owner, left the ledger.
// The car / house detail pages must not put that person's profile id into
// the client payload: not in the edit sheet's initial values, not in the
// car prop handed to the fuel-log sheet, not in the house `details` row.
//
//   chapter 1  A + B   closed, epoch e1 — B removed
//   chapter 2  A + D   open,   epoch e2 — D joined later
//   group row today: member_a A, member_b D   (duo)
//   SOLO group row:  member_a A, member_b null (B removed, nobody new)
//
// Failure looks like nothing: the page renders, but the RSC payload carries
// B's uuid to A's (and D's) browser.
//
// The real resolver (lib/carMemberLink.ts), the real scope loader
// (lib/db/queries/insuranceView.ts) and the real getHouseDetails run here.
// The DB client behind getHouseDetails is faked and honours the SELECT
// projection over a full HouseDetails row that includes `owner` — so if the
// owner column is ever selected again, it shows up in the payload and this
// test fails.

const EX = 'b0b0b0b0-ex00-4000-8000-0000000000b0'        // B, removed
const ME = 'a0a0a0a0-me00-4000-8000-0000000000a0'        // A
const NEW = 'd0d0d0d0-new0-4000-8000-0000000000d0'       // D, joined after B left

const CH1 = { startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-06-01T00:00:00Z'), epochId: 'e1', isPast: true }
const CH2 = { startedAt: new Date('2026-06-01T00:00:00Z'), endedAt: null, epochId: 'e2', isPast: false }
const DUO = { id: 'g1', memberA: ME, memberB: NEW as string | null, guardianBetaEnabled: true }
const SOLO = { id: 'g1', memberA: ME, memberB: null as string | null, guardianBetaEnabled: true }
const OLD = new Date('2026-02-01T00:00:00Z')

const car = (id: string, primaryUserId: string | null) => ({
  id, type: 'car', name: `car ${id}`, groupId: 'g1', notes: null, templateKey: null, templateFields: null,
  deletedAt: null, frozenAt: null, plateEncrypted: null, createdAt: OLD,
  purchasedAt: null, purchasePrice: null, fuelType: '95', primaryUserId,
  color: null, year: null, brand: null, model: null, initialOdometer: null,
  insuranceType: null, insuranceTermYears: null, insuranceExpiryDate: null, insuranceStartsAt: null,
  insurancePayCycle: null, insuranceVehicleId: null,
  childNickname: null, childBirthday: null, childHeightCm: null, childWeightG: null,
})
const ASSETS = [
  car('car-ex', EX),
  car('car-new', NEW),
  car('car-me', ME),
  car('car-shared', null),
  { ...car('house-ex', null), type: 'house', name: 'house' },
]
/** A full HouseDetails row, as the table holds it: owner is B. */
const HOUSE_ROW = { owner: EX, addressEncrypted: null, purchasedAt: '2020-01-01', purchasePrice: 1000 }

let viewer = ME
let group = DUO
let epochWindow: typeof CH1 | typeof CH2 = CH2

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) },
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: async () => ({ id: viewer }) }))
vi.mock('@/lib/db/queries/epoch', () => ({
  resolveViewerEpochContext: async () => ({ group, window: epochWindow }),
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
  getAssetSummary: async () => ({ monthAmount: 0, totalAmount: 0 }),
  listTransactionsPagedForAsset: async () => [],
}))
vi.mock('@/lib/db/queries/recurringIncome', () => ({ listRulesForAsset: async () => [] }))
vi.mock('@/lib/db/queries/insurance', () => ({}))
vi.mock('@/lib/db/queries/fuelLog', () => ({
  listFuelLogsWithPrev: async () => [],
  fuelStatsForAsset: async () => ({ monthFuel: 0, totalFuel: 0 }),
}))
// Fake drizzle client: select(projection).from().where().limit() → the full
// row narrowed to the projection's keys.
vi.mock('@/lib/db/client', () => {
  const chain = (fields: Record<string, unknown>) => {
    const rows = [Object.fromEntries(Object.keys(fields).map((k) => [k, (HOUSE_ROW as Record<string, unknown>)[k]]))]
    const c = { from: () => c, where: () => c, limit: async () => rows }
    return c
  }
  return { db: { select: (fields: Record<string, unknown>) => chain(fields) } }
})
vi.mock('@/lib/db/queries/aibutsu', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/queries/aibutsu')>()),
  getLinkedInsurancesForVehicle: async () => [],
}))

const { default: AssetDetailPage } = await import('@/app/(dashboard)/assets/[id]/page')

type CarProps = {
  primaryUser: { primaryUserId: string | null; primaryUserIsFormer: boolean }
  assetSheetInitial: Record<string, unknown>
}
async function page<P>(id: string): Promise<P> {
  const el = (await AssetDetailPage({ params: Promise.resolve({ id }) })) as ReactElement<P>
  return el.props
}
/** Everything the server component hands to the client, as it would be serialised. */
const wire = (v: unknown) => JSON.stringify(v)

beforeEach(() => { viewer = ME; group = DUO; epochWindow = CH2 })

for (const [label, g] of [['duo (A + D)', DUO], ['solo (A)', SOLO]] as const) {
  describe(`A, current member, ${label} — B (primary user / house owner) removed`, () => {
    beforeEach(() => { group = g })

    it('car page: no trace of B; the sheet and the fuel-log car get the former flag', async () => {
      const p = await page<CarProps>('car-ex')
      expect(wire(p)).not.toContain(EX)
      expect(p.primaryUser).toEqual({ primaryUserId: null, primaryUserIsFormer: true })
      expect(p.assetSheetInitial).toMatchObject({ primaryUserId: null, primaryUserFormer: true })
    })

    it('house page: no trace of B, no owner field at all', async () => {
      const p = await page<{ details: Record<string, unknown> }>('house-ex')
      expect(wire(p)).not.toContain(EX)
      expect(p.details).not.toHaveProperty('owner')
      expect(p.details).toMatchObject({ hasAddress: false, purchasedAt: '2020-01-01', purchasePrice: 1000 })
    })

    it('control: the viewer as primary user and 共用 are kept, flag false', async () => {
      expect((await page<CarProps>('car-me')).primaryUser).toEqual({ primaryUserId: ME, primaryUserIsFormer: false })
      expect((await page<CarProps>('car-shared')).primaryUser).toEqual({ primaryUserId: null, primaryUserIsFormer: false })
    })
  })
}

it('duo control: the current partner as primary user is kept', async () => {
  const p = await page<CarProps>('car-new')
  expect(p.primaryUser).toEqual({ primaryUserId: NEW, primaryUserIsFormer: false })
  expect(p.assetSheetInitial).toMatchObject({ primaryUserId: NEW, primaryUserFormer: false })
})

describe('B, who was removed, pinned to chapter 1 (A + B) — D joined after', () => {
  beforeEach(() => { viewer = EX; epochWindow = CH1; group = DUO })

  it("a car whose primary user is D (the group's current partner) never reveals D to B", async () => {
    const p = await page<CarProps>('car-new')
    expect(wire(p)).not.toContain(NEW)
    expect(p.primaryUser).toEqual({ primaryUserId: null, primaryUserIsFormer: true })
  })

  it('B still sees themself as the primary user of a chapter-1 car', async () => {
    expect((await page<CarProps>('car-ex')).primaryUser).toEqual({ primaryUserId: EX, primaryUserIsFormer: false })
  })
})

// Raw-row guard. The car's stored primary_user_id may reach a client only
// through resolveCarPrimaryUser; a page or action that forwards the raw
// column (`asset.primaryUserId`, `row.carPrimaryUserId`) would hand an
// ex-partner's uuid to the browser. The type system covers the rest:
// AssetDetailClient takes a CarPrimaryUserView, NewFuelLog's car and
// FuelLogDetail need a required `…IsFormer` flag, and HouseDetailsRow has
// `owner?: never`.
describe('no page or action forwards the raw car primary user (#1589)', () => {
  it('every read of a raw primaryUserId under app/ and actions/ goes through resolveCarPrimaryUser', () => {
    const root = resolve(__dirname, '..')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) { walk(p); continue }
        if (!/\.(ts|tsx)$/.test(name)) continue
        const lines = readFileSync(p, 'utf8').split('\n')
        lines.forEach((line, i) => {
          // raw DB rows: `asset.primaryUserId`, `row.carPrimaryUserId`, `r.primaryUserId` …
          if (/\b(asset|row|rows?\[\d+\]|r|a|car|stored)\.(carP|p)rimaryUserId\b/.test(line)
            && !line.includes('resolveCarPrimaryUser(')) {
            hits.push(`${p.slice(root.length + 1)}:${i + 1}: ${line.trim()}`)
          }
        })
      }
    }
    for (const dir of ['app', 'actions']) walk(join(root, dir))
    // Allowed: client-side reads of an already-resolved car (NewFuelLog's
    // `car.primaryUserId` is the CarLite built from the resolved view), and
    // editCar's comparison with its own stored value (never returned).
    const allowed = [
      /^app\/\(dashboard\)\/assets\/\[id\]\/_components\/NewFuelLog\.tsx:/,
      /^actions\/asset\.ts:.*stored\?\.primaryUserId !== validated\.primaryUserId/,
    ]
    expect(hits.filter((h) => !allowed.some((re) => re.test(h)))).toEqual([])
  })

  it('only the asset detail page calls getHouseDetails', () => {
    const root = resolve(__dirname, '..')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) { walk(p); continue }
        if (!/\.(ts|tsx)$/.test(name)) continue
        if (/\bgetHouseDetails\(/.test(readFileSync(p, 'utf8'))) hits.push(p.slice(root.length + 1))
      }
    }
    for (const dir of ['app', 'actions', 'components']) walk(join(root, dir))
    expect(hits).toEqual(['app/(dashboard)/assets/[id]/page.tsx'])
  })
})
