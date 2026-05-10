import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MonthSection } from '@/app/(dashboard)/records/_components/MonthSection'
import { I18nWrapper } from './_mocks/i18n'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

describe('MonthSection', () => {
  it('shows count + total in unified format', () => {
    wrap(<MonthSection monthKey="2026-05" count={5} totalAmount={12000} />)
    expect(screen.getByText(/5 筆/)).toBeInTheDocument()
    expect(screen.getByText(/NT\$12,000/)).toBeInTheDocument()
  })

  it('renders the month label using the active locale', () => {
    wrap(<MonthSection monthKey="2026-05" count={1} totalAmount={500} />)
    // I18nWrapper defaults to zh-TW; Intl outputs e.g. "2026年5月".
    expect(screen.getByText(/2026/)).toBeInTheDocument()
  })

  it('renders a zero-count empty group cleanly', () => {
    wrap(<MonthSection monthKey="2026-05" count={0} totalAmount={0} />)
    expect(screen.getByText(/0 筆/)).toBeInTheDocument()
    expect(screen.getByText(/NT\$0/)).toBeInTheDocument()
  })
})
