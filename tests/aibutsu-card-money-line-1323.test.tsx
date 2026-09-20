// #1323 — 愛物列表改以關係為主：金額不再是右對齊的獨立欄位，而是折成 meta line 下方
// 的一行安靜文字，0 元時整行不顯示；過去章節顯示章節合計而非本月（本月在過去章節恆為 0）。
//
// Failure looks like: the money line silently reappears as a right-aligned column
// (a straight revert), or a past chapter keeps showing 「本月 NT$0」 instead of the
// chapter total — a quiet 0 that draws the eye to the wrong thing.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChildCard, PetCard, PlantCard, ItemCard, HouseCard } from '@/app/(dashboard)/assets/_components/AibutsuCard'
import { CarHeroCard } from '@/app/(dashboard)/assets/_components/CarHeroCard'
import { I18nWrapper } from './_mocks/i18n'

describe('AibutsuCard money line (#1323)', () => {
  it('renders nothing when the amount is 0 — no line, no placeholder', () => {
    render(
      <ChildCard id="k1" name="Kid" monthAmount={0} totalAmount={0} isPast={false} />,
      { wrapper: I18nWrapper },
    )
    expect(screen.queryByText(/本月/)).not.toBeInTheDocument()
    expect(screen.queryByText(/這個章節/)).not.toBeInTheDocument()
  })

  it('shows 本月 + the month amount in the current chapter', () => {
    render(
      <ChildCard id="k1" name="Kid" monthAmount={1580} totalAmount={5000} isPast={false} />,
      { wrapper: I18nWrapper },
    )
    expect(screen.getByText('本月 NT$1,580')).toBeInTheDocument()
    expect(screen.queryByText(/這個章節/)).not.toBeInTheDocument()
  })

  it('shows 這個章節 + the chapter total in a past chapter, not 本月', () => {
    render(
      <ChildCard id="k1" name="Kid" monthAmount={0} totalAmount={5000} isPast />,
      { wrapper: I18nWrapper },
    )
    expect(screen.getByText('這個章節 NT$5,000')).toBeInTheDocument()
    expect(screen.queryByText(/本月/)).not.toBeInTheDocument()
  })

  it('hides the line in a past chapter when the chapter total is 0', () => {
    render(
      <PetCard id="p1" name="Cat" monthAmount={0} totalAmount={0} isPast />,
      { wrapper: I18nWrapper },
    )
    expect(screen.queryByText(/本月/)).not.toBeInTheDocument()
    expect(screen.queryByText(/這個章節/)).not.toBeInTheDocument()
  })

  it.each([
    ['PetCard', <PetCard key="p" id="p1" name="Cat" monthAmount={123} totalAmount={0} isPast={false} />],
    ['PlantCard', <PlantCard key="pl" id="pl1" name="Fern" monthAmount={123} totalAmount={0} isPast={false} />],
    ['ItemCard', <ItemCard key="i" id="i1" name="Thing" monthAmount={123} totalAmount={0} isPast={false} />],
    ['HouseCard', <HouseCard key="h" id="h1" name="Home" monthAmount={123} totalAmount={0} isPast={false} />],
  ])('%s renders the quiet money line under the meta line', (_label, el) => {
    render(el, { wrapper: I18nWrapper })
    expect(screen.getByText('本月 NT$123')).toBeInTheDocument()
  })

  it('CarHeroCard shows 本月 in the current chapter and 這個章節 in a past chapter', () => {
    const { rerender } = render(
      <CarHeroCard
        id="c1" name="Car" hasPlate={false} color={null} year={null} brand={null} model={null}
        latestOdometer={12000} monthAmount={450} totalAmount={1200} isPast={false}
      />,
      { wrapper: I18nWrapper },
    )
    expect(screen.getByText('本月 NT$450')).toBeInTheDocument()

    rerender(
      <I18nWrapper>
        <CarHeroCard
          id="c1" name="Car" hasPlate={false} color={null} year={null} brand={null} model={null}
          latestOdometer={12000} monthAmount={450} totalAmount={1200} isPast
        />
      </I18nWrapper>,
    )
    expect(screen.getByText('這個章節 NT$1,200')).toBeInTheDocument()
    expect(screen.queryByText(/本月/)).not.toBeInTheDocument()
  })

  it('CarHeroCard hides the money line entirely at 0', () => {
    render(
      <CarHeroCard
        id="c1" name="Car" hasPlate={false} color={null} year={null} brand={null} model={null}
        latestOdometer={12000} monthAmount={0} totalAmount={0} isPast={false}
      />,
      { wrapper: I18nWrapper },
    )
    expect(screen.queryByText(/本月/)).not.toBeInTheDocument()
  })
})
