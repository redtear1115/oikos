import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'

// #1599 — aibutsu (house / car / pet / plant) amounts follow the ledger base
// currency. TWD output must stay byte-identical to what shipped before.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/assets/a1',
}))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/app/(dashboard)/_components/TransactionFeed', () => ({ TransactionFeed: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/AddSheet', () => ({ AddSheet: () => null }))
vi.mock('@/app/(dashboard)/assets/_components/AssetSheet', () => ({ AssetSheet: () => null }))
vi.mock('@/actions/transaction', () => ({ loadMoreTransactionsForAsset: vi.fn() }))
vi.mock('@/actions/asset', () => ({
  createPet: vi.fn(), editPet: vi.fn(), createPlant: vi.fn(), editPlant: vi.fn(),
  createCar: vi.fn(), editCar: vi.fn(), deleteAsset: vi.fn(),
}))
vi.mock('@/actions/fuel', () => ({ createFuelLog: vi.fn(), editFuelLog: vi.fn() }))
vi.mock('@/app/(dashboard)/assets/[id]/_components/AibutsuHeader', () => ({
  AibutsuHeader: () => null,
  useTint: () => ({ accent: '#000', bg: '#fff' }),
}))
vi.mock('@/app/(dashboard)/assets/[id]/_components/AibutsuHintCard', () => ({ AibutsuHintCard: () => null }))

import { HouseDetailClient } from '@/app/(dashboard)/assets/[id]/_components/HouseDetailClient'
import { PetDetailClient } from '@/app/(dashboard)/assets/[id]/_components/PetDetailClient'
import { PlantDetailClient } from '@/app/(dashboard)/assets/[id]/_components/PlantDetailClient'
import { PetSheetBody } from '@/app/(dashboard)/assets/_components/AssetSheet/PetSheetBody'
import { PlantSheetBody } from '@/app/(dashboard)/assets/_components/AssetSheet/PlantSheetBody'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import { formatLedgerAmountSpaced, type CurrencyCode } from '@/lib/currency'

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}
})
afterAll(() => { vi.unstubAllGlobals() })

function member(baseCurrency: CurrencyCode): MemberContextValue {
  return {
    group: { id: 'g1', name: 'G', baseCurrency },
    viewer: { id: 'viewer-1', initial: 'V', displayName: 'Viewer', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
    partner: { id: 'partner-1', initial: 'P', displayName: 'Partner', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
    viewerIsA: true, isSolo: false, isPast: false, canAccessGuardian: false,
    epochStartedAt: '2026-01-01', epochEndedAt: null,
  }
}
const wrap = (base: CurrencyCode, ui: React.ReactElement) =>
  render(<I18nWrapper><MemberProvider value={member(base)}>{ui}</MemberProvider></I18nWrapper>)

const common = {
  assetId: 'a1', name: 'N', notes: null,
  summary: { monthAmount: 0, totalAmount: 0 },
  initialTxns: [], pageSize: 20,
}

describe('formatLedgerAmountSpaced', () => {
  it('keeps "symbol space digits" and whole units', () => {
    expect(formatLedgerAmountSpaced(500000, 'twd')).toBe('NT$ 500,000')
    expect(formatLedgerAmountSpaced(500000, 'usd')).toBe('$ 500,000')
    expect(formatLedgerAmountSpaced(900, 'jpy')).toBe('¥ 900')
    expect(formatLedgerAmountSpaced(1200, 'vnd')).toBe('VND 1,200')
  })
})

describe('detail rows', () => {
  const house = { purchasedAt: '2020-01-01', purchasePrice: 500000, address: null } as never
  const pet = { purchaseCost: 12000, birthDate: null, species: 'cat' } as never
  const plant = { cost: 350 } as never
  const cases: Array<[string, (b: CurrencyCode) => React.ReactElement, string]> = [
    ['house', () => <HouseDetailClient {...common} details={house} assetSheetInitial={{ id: 'a1', type: 'house', name: 'N' }} />, '500,000'],
    ['pet', () => <PetDetailClient {...common} details={pet} assetSheetInitial={{ id: 'a1', type: 'pet', name: 'N' }} />, '12,000'],
    ['plant', () => <PlantDetailClient {...common} details={plant} assetSheetInitial={{ id: 'a1', type: 'plant', name: 'N' }} />, '350'],
  ]
  for (const [name, ui, digits] of cases) {
    it(`${name}: TWD unchanged, USD base shows $, never NT$`, () => {
      const twd = wrap('twd', ui('twd'))
      expect(twd.container.textContent).toContain(`NT$ ${digits}`)
      twd.unmount()
      const usd = wrap('usd', ui('usd'))
      expect(usd.container.textContent).toContain(`$ ${digits}`)
      expect(usd.container.textContent).not.toContain('NT$')
    })
  }
})

describe('sheet addon symbol', () => {
  const sheets: Array<[string, () => React.ReactElement]> = [
    ['pet', () => <PetSheetBody open onClose={() => {}} />],
    ['plant', () => <PlantSheetBody open onClose={() => {}} />],
  ]
  for (const [name, ui] of sheets) {
    it(`${name}: TWD NT$, USD base $`, () => {
      const twd = wrap('twd', ui())
      expect(document.body.textContent).toContain('NT$')
      twd.unmount()
      wrap('usd', ui())
      expect(document.body.textContent).not.toContain('NT$')
      expect(document.body.textContent).toContain('$')
    })
  }
})
