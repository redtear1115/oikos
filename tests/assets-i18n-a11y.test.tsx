// #1173 — /assets carried hardcoded zh-TW strings (fuel-log sheet, guardian
// summary, insurance timeline, aibutsu card age / companion lines).
// #1174 — the insurance sheet's freeform 被保人 input had no accessible name,
// and neither /assets nor /assets/[id] had an <h1>.
//
// Failure looks like: en / ja users see Chinese fragments mixed into an
// otherwise translated card, and a screen reader announces "edit text, blank".

import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { TranslationsProvider } from '@/lib/i18n/client'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/assets',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({
    viewer: { id: 'u1', displayName: 'Me' },
    partner: null,
    isPast: false,
    canAccessGuardian: false,
  }),
}))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/app/(dashboard)/_components/RealtimeProvider', () => ({ useRealtimeEvents: () => {} }))
vi.mock('@/app/(dashboard)/assets/_components/AssetSheet', () => ({ AssetSheet: () => null }))
vi.mock('@/actions/asset', () => ({
  createInsurance: vi.fn(),
  editInsurance: vi.fn(),
  getCarAssets: vi.fn().mockResolvedValue([]),
  getChildAssets: vi.fn().mockResolvedValue([]),
  softDeleteAsset: vi.fn(),
  renewInsurance: vi.fn(),
  lapseInsurance: vi.fn(),
}))
vi.mock('@/actions/fuelLog', () => ({
  createFuelLog: vi.fn(),
  editFuelLog: vi.fn(),
  softDeleteFuelLog: vi.fn(),
}))

import { InsuranceSheetBody } from '@/app/(dashboard)/assets/_components/AssetSheet/InsuranceSheetBody'
import { InsuranceListItem } from '@/app/(dashboard)/assets/_components/InsuranceListItem'
import { ChildCard, PetCard, PlantCard } from '@/app/(dashboard)/assets/_components/AibutsuCard'
import { CarHeroCard } from '@/app/(dashboard)/assets/_components/CarHeroCard'
import { AssetsListClient } from '@/app/(dashboard)/assets/_components/AssetsListClient'
import { AibutsuHeader } from '@/app/(dashboard)/assets/[id]/_components/AibutsuHeader'
import { NewFuelLog } from '@/app/(dashboard)/assets/[id]/_components/NewFuelLog'
import { FuelRow } from '@/app/(dashboard)/assets/[id]/_components/FuelRow'

const CJK = /[㐀-鿿]/

function wrap(value: typeof en, locale: 'en' | 'ja') {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TranslationsProvider value={value} locale={locale}>
        {children}
      </TranslationsProvider>
    )
  }
}

const insuranceBase = {
  insuranceType: 'medical',
  insured: 'Grandma',
  insuredChildId: null,
  insuredChildName: null,
  insuredUserId: null,
  insuredUserDisplayName: null,
  policyHolderUserId: null,
  policyHolderDisplayName: null,
  policyHolderAvatarUrl: null,
  insurer: 'Acme',
  annualPremium: 12000,
  sumInsured: 1000000,
  startsAt: '2020-01-01',
  expiryDate: '2040-01-01',
  termYears: 20,
  payCycle: 'annual',
  reminderDaysBefore: 30,
  notes: null,
}

describe('/assets a11y (#1174)', () => {
  it('gives the freeform insured input the Field label as its accessible name', () => {
    render(<InsuranceSheetBody open onClose={() => {}} />, { wrapper: wrap(en, 'en') })
    // No insured member / child selected on create → the freeform input shows.
    expect(screen.getByRole('textbox', { name: en.assetSheet.insurance.insured })).toBeTruthy()
  })

  it('renders the /assets title as the page h1', () => {
    render(<AssetsListClient items={[]} isPast={false} />, { wrapper: wrap(en, 'en') })
    expect(screen.getByRole('heading', { level: 1, name: en.assets.title })).toBeTruthy()
  })

  it('renders the asset name as the detail page h1', () => {
    render(<AibutsuHeader kind="pet" name="Miru" />, { wrapper: wrap(en, 'en') })
    expect(screen.getByRole('heading', { level: 1, name: 'Miru' })).toBeTruthy()
  })

  it('names the masked plate chip with a localized label, not the bullet glyphs', () => {
    render(
      <CarHeroCard
        id="c1" name="Car" hasPlate color={null} year={null} brand={null} model={null}
        latestOdometer={null} monthAmount={0} totalAmount={0} isPast={false}
        avgFuelEcon={12.3} lastFuelDate="2026-09-01"
      />,
      { wrapper: wrap(en, 'en') },
    )
    expect(screen.getByRole('img', { name: en.assetListItem.plateMaskedAriaLabel })).toBeTruthy()
    expect(screen.getByText('Last refuel 2026-09-01')).toBeTruthy()
  })
})

describe('/assets i18n (#1173) — no zh-TW leaks under en / ja', () => {
  it.each([
    ['en', en],
    ['ja', ja],
  ] as const)('insurance list card timelines (%s)', (locale, dict) => {
    const { container, unmount } = render(
      <>
        <InsuranceListItem id="i1" name="Policy" data={insuranceBase} />
        <InsuranceListItem id="i2" name="Policy" data={{ ...insuranceBase, termYears: 1, startsAt: '2026-01-01', expiryDate: '2026-12-31' }} />
        <InsuranceListItem id="i3" name="Policy" data={{ ...insuranceBase, insuranceType: 'savings' }} />
      </>,
      { wrapper: wrap(dict as typeof en, locale) },
    )
    expect(container.textContent ?? '').not.toMatch(CJK_NON_JA(locale))
    unmount()
  })

  it('child / pet / plant cards format age and companion days per locale', () => {
    const { container } = render(
      <>
        <ChildCard id="k1" name="Kid" monthAmount={0} totalAmount={0} isPast={false} childBirthday="2023-01-15" />
        <PetCard id="p1" name="Cat" monthAmount={0} totalAmount={0} isPast={false} petBirthDate="2020-01-15" />
        <PlantCard id="pl1" name="Fern" monthAmount={0} totalAmount={0} isPast={false} plantSproutedAt="2026-01-01" />
      </>,
      { wrapper: wrap(en, 'en') },
    )
    const text = container.textContent ?? ''
    expect(text).not.toMatch(CJK)
    expect(text).toMatch(/\d+ yr \d+ mo/)
    expect(text).toMatch(/\d+ days together/)
  })

  it('fuel log sheet and fuel row render fully in English', () => {
    render(
      <NewFuelLog
        open
        onClose={() => {}}
        car={{ id: 'c1', name: 'Car', fuelType: '95', primaryUserId: null }}
        lastOdometer={12000}
        mode="create"
      />,
      { wrapper: wrap(en, 'en') },
    )
    const dialog = screen.getByRole('dialog', { name: en.assetDetail.fuelLog.titleNew })
    expect(dialog.textContent ?? '').not.toMatch(CJK)
    expect(screen.getByRole('button', { name: en.assetDetail.fuelLog.closeAriaLabel })).toBeTruthy()
    expect(screen.getByText('Last 12,000 km')).toBeTruthy()

    const { container } = render(
      <FuelRow
        fuelLog={{ id: 'f1', liters: '30', odometer: 12400, station: null, loggedAt: '2026-09-01T00:00:00.000Z', prevOdometer: 12000 }}
        amount={900}
      />,
      { wrapper: wrap(en, 'en') },
    )
    expect(container.textContent ?? '').not.toMatch(CJK)
  })
})

/** ja legitimately uses kanji; for ja only assert the zh-TW-only glyphs that
 *  the old hardcoded strings contained are gone. */
function CJK_NON_JA(locale: 'en' | 'ja'): RegExp {
  return locale === 'en' ? CJK : /繳|生效|到期|保額|已投入|保 /
}
