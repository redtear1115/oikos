import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { DailyTrendChart } from '@/app/(dashboard)/records/_components/DailyTrendChart'
import type { DailyTrendRow } from '@/lib/db/queries/transactions'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

/** Build a zero-filled month of `days` days, then apply overrides by day. */
function month(days: number, overrides: Partial<Record<number, Partial<DailyTrendRow>>> = {}): DailyTrendRow[] {
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1
    return { day, totalExpense: 0, totalIncome: 0, ...overrides[day] }
  })
}

describe('DailyTrendChart', () => {
  it('renders nothing for empty data', () => {
    const { container } = wrap(<DailyTrendChart data={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('draws an income bar (up) and expense bar (down) only on days with values', () => {
    const data = month(30, {
      5: { totalExpense: 1200 },
      10: { totalIncome: 5000 },
    })
    const { container } = wrap(<DailyTrendChart data={data} />)
    // One <rect> per non-zero direction → exactly two bars here.
    const rects = container.querySelectorAll('rect')
    expect(rects).toHaveLength(2)
    // The cumulative-net fold line is always present.
    expect(container.querySelector('polyline')).not.toBeNull()
  })

  it('end dot is green when the month closes net-positive', () => {
    // Income (5000) > expense (1200) ⇒ cumulative ends positive ⇒ income green.
    const data = month(30, { 1: { totalExpense: 1200 }, 2: { totalIncome: 5000 } })
    const { container } = wrap(<DailyTrendChart data={data} />)
    const dot = container.querySelector('circle')
    expect(dot?.getAttribute('fill')).toBe('#7AA48E')
  })

  it('end dot is orange when the month closes net-negative', () => {
    const data = month(30, { 1: { totalExpense: 5000 }, 2: { totalIncome: 1200 } })
    const { container } = wrap(<DailyTrendChart data={data} />)
    const dot = container.querySelector('circle')
    expect(dot?.getAttribute('fill')).toBe('#D4955F')
  })

  it('exposes an accessible chart label', () => {
    const { container } = wrap(<DailyTrendChart data={month(28, { 3: { totalIncome: 100 } })} />)
    const svg = container.querySelector('svg[role="img"]')
    expect(svg?.getAttribute('aria-label')).toBe('每日收支趨勢')
  })
})
