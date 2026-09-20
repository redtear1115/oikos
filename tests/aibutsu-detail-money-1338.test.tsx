// #1338 — #1323 made the 愛物 list read as a relationship; the detail page
// broke that promise on the first tap. Under the age hero sat `MoneyTwoCol`:
// two framed numbers with accent-coloured labels (louder than the numbers),
// showing 「本月 NT$0」 even in a past chapter — the exact quiet zero #1323
// removed one level up. 「累計」 was also factually wrong: `getAssetSummary`
// scopes both aggregates to the chapter.
//
// Failure looks like: nothing throws and no test elsewhere goes red. The
// detail page silently regains a framed money block above the fold, or a
// closed chapter keeps reporting 「本月 NT$0」 for a child who is no longer in
// this chapter at all.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const member = vi.hoisted(() => ({ isPast: false }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/app/(dashboard)/_components/TransactionFeed', () => ({ TransactionFeed: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/AddSheet', () => ({ AddSheet: () => null }))
vi.mock('@/app/(dashboard)/assets/_components/AssetSheet', () => ({ AssetSheet: () => null }))
vi.mock('@/actions/transaction', () => ({ loadMoreTransactionsForAsset: vi.fn() }))
vi.mock('@/app/(dashboard)/assets/[id]/_components/AibutsuHeader', () => ({
  AibutsuHeader: () => null,
  useTint: () => ({ accent: '#000', bg: '#fff' }),
}))
vi.mock('@/app/(dashboard)/assets/[id]/_components/AibutsuHintCard', () => ({ AibutsuHintCard: () => null }))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({ useMember: () => member }))

import { render, screen } from '@testing-library/react'
import { MoneyLine } from '@/app/(dashboard)/assets/[id]/_components/aibutsu-ui'
import { AssetHero } from '@/app/(dashboard)/assets/[id]/_components/AssetHero'
import { PetDetailClient } from '@/app/(dashboard)/assets/[id]/_components/PetDetailClient'
import { I18nWrapper } from './_mocks/i18n'

describe('detail-page MoneyLine (#1338)', () => {
  it('renders nothing when the amount is 0 — no line, no placeholder', () => {
    const { container } = render(<MoneyLine month={0} total={0} isPast={false} />, { wrapper: I18nWrapper })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows 本月 + the month amount as one quiet line in the current chapter', () => {
    render(<MoneyLine month={1580} total={5000} isPast={false} />, { wrapper: I18nWrapper })
    expect(screen.getByText('本月 NT$1,580')).toBeInTheDocument()
    expect(screen.queryByText(/這個章節/)).not.toBeInTheDocument()
  })

  it('shows 這個章節 + the chapter total in a past chapter, never 本月', () => {
    render(<MoneyLine month={0} total={5000} isPast />, { wrapper: I18nWrapper })
    expect(screen.getByText('這個章節 NT$5,000')).toBeInTheDocument()
    expect(screen.queryByText(/本月/)).not.toBeInTheDocument()
  })

  it('hides the line in a past chapter when the chapter total is 0', () => {
    const { container } = render(<MoneyLine month={0} total={0} isPast />, { wrapper: I18nWrapper })
    expect(container).toBeEmptyDOMElement()
  })

  it('never says 累計 — both aggregates are chapter-scoped by getAssetSummary', () => {
    render(<MoneyLine month={100} total={5000} isPast />, { wrapper: I18nWrapper })
    expect(screen.queryByText(/累計/)).not.toBeInTheDocument()
  })
})

describe('PetDetailClient — money + age above the fold (#1338, #1339)', () => {
  const baseProps = {
    assetId: 'a1',
    name: '米嚕',
    notes: null,
    details: null,
    summary: { monthAmount: 0, totalAmount: 0 },
    assetSheetInitial: { id: 'a1', type: 'pet' as const, name: '米嚕' },
    initialTxns: [],
    pageSize: 20,
  }

  const petDetails = {
    species: 'cat', breed: null, sex: null, birthDate: null,
    adoptedDate: null, purchaseCost: null, weightG: null, chipNo: null, vet: null,
  }

  it('shows no money at all when the chapter has no spending', () => {
    member.isPast = false
    render(<PetDetailClient {...baseProps} />, { wrapper: I18nWrapper })
    expect(screen.queryByText(/本月/)).not.toBeInTheDocument()
    expect(screen.queryByText(/這個章節/)).not.toBeInTheDocument()
  })

  it('shows 本月 in the current chapter', () => {
    member.isPast = false
    render(
      <PetDetailClient {...baseProps} summary={{ monthAmount: 880, totalAmount: 12000 }} />,
      { wrapper: I18nWrapper },
    )
    expect(screen.getByText('本月 NT$880')).toBeInTheDocument()
  })

  it('never shows 本月 in a past chapter', () => {
    member.isPast = true
    render(
      <PetDetailClient {...baseProps} summary={{ monthAmount: 0, totalAmount: 12000 }} />,
      { wrapper: I18nWrapper },
    )
    expect(screen.queryByText(/本月/)).not.toBeInTheDocument()
    expect(screen.getByText('這個章節 NT$12,000')).toBeInTheDocument()
  })

  it('shows no age for a birthday in the future instead of 「-1 歲」', () => {
    member.isPast = false
    const { container } = render(
      <PetDetailClient {...baseProps} details={{ ...petDetails, birthDate: '2099-01-01' }} />,
      { wrapper: I18nWrapper },
    )
    // 年齡 is the AgeDisplay label; the whole block is skipped, so it is absent.
    expect(screen.queryByText('年齡')).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('-1')
  })

  it('still shows the age for a birthday in the past', () => {
    member.isPast = false
    render(
      <PetDetailClient {...baseProps} details={{ ...petDetails, birthDate: '2020-01-01' }} />,
      { wrapper: I18nWrapper },
    )
    expect(screen.getByText('年齡')).toBeInTheDocument()
  })
})

describe('car detail hero (#1338)', () => {
  const baseProps = {
    name: '小白', brand: 'Toyota', model: 'Altis', year: 2019,
    fuelType: '95' as const, color: null,
    monthAmount: 450, totalAmount: 12000, avgEcon: 13.2, lastFuelAt: '2026-09-01',
  }

  it('labels the chapter total 這個章節, not 累計', () => {
    render(<AssetHero {...baseProps} isPast={false} />, { wrapper: I18nWrapper })
    expect(screen.getByText('這個章節')).toBeInTheDocument()
    expect(screen.queryByText('累計')).not.toBeInTheDocument()
  })

  it('drops the 本月 column in a past chapter', () => {
    render(<AssetHero {...baseProps} isPast monthAmount={0} />, { wrapper: I18nWrapper })
    expect(screen.queryByText('本月')).not.toBeInTheDocument()
    expect(screen.getByText('這個章節')).toBeInTheDocument()
  })

  it('drops the 本月 column in a past chapter on an electric car too', () => {
    render(
      <AssetHero {...baseProps} fuelType="electric" isPast monthAmount={0} />,
      { wrapper: I18nWrapper },
    )
    expect(screen.queryByText('本月')).not.toBeInTheDocument()
    expect(screen.getByText('這個章節')).toBeInTheDocument()
  })
})

// The component tests above cover the shared pieces. This one covers the
// wiring: a partial revert that reconnects one detail page to the old framed
// block — or forgets to pass the chapter through — would leave every
// assertion above green.
describe('every 愛物 detail page is wired to the chapter-aware money line', () => {
  const DIR = join(process.cwd(), 'app/(dashboard)/assets/[id]/_components')
  const CLIENTS = [
    'ChildDetailClient.tsx',
    'PetDetailClient.tsx',
    'PlantDetailClient.tsx',
    'HouseDetailClient.tsx',
    'TemplateAssetDetailClient.tsx',
  ]

  it.each(CLIENTS)('%s renders MoneyLine with isPast and no MoneyTwoCol', (file) => {
    const src = readFileSync(join(DIR, file), 'utf8')
    expect(src).not.toContain('MoneyTwoCol')
    expect(src).toContain('<MoneyLine ')
    expect(src).toMatch(/<MoneyLine[^>]*isPast=\{isPast\}/)
  })
})
