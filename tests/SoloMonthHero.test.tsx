import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { SoloMonthHero } from '@/app/(dashboard)/dashboard/_components/SoloMonthHero'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

describe('SoloMonthHero', () => {
  it('formats the month into monthLabel instead of leaving the literal placeholder', () => {
    wrap(<SoloMonthHero monthKey="2026-09" total={12345} count={7} />)

    // zh-TW monthLabel is '{month}記下' — Intl.DateTimeFormat('zh-TW', { month: 'long' })
    // renders September as '9月'.
    expect(screen.getByText('9月記下')).toBeTruthy()
    expect(screen.queryByText(/\{month\}/)).toBeNull()
  })

  it('substitutes {count} in countLabel with the actual record count', () => {
    wrap(<SoloMonthHero monthKey="2026-09" total={12345} count={7} />)

    expect(screen.getByText('7 筆')).toBeTruthy()
    expect(screen.queryByText(/\{count\}/)).toBeNull()
  })

  it('renders the total as a locale-formatted NT$ amount', () => {
    wrap(<SoloMonthHero monthKey="2026-09" total={12345} count={7} />)

    // Component does `NT$` + total.toLocaleString('en-US') as separate nodes,
    // so match on the text content of their shared container rather than a
    // single exact string.
    expect(screen.getByText('12,345')).toBeTruthy()
    expect(screen.getByText('NT$')).toBeTruthy()
  })

  it('renders without crashing and still shows both labels when total and count are 0', () => {
    wrap(<SoloMonthHero monthKey="2026-09" total={0} count={0} />)

    expect(screen.getByText('9月記下')).toBeTruthy()
    expect(screen.getByText('0 筆')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('NT$')).toBeTruthy()
  })
})
