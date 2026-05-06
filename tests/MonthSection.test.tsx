import { render, screen } from '@testing-library/react'
import { MonthSection } from '@/app/(dashboard)/records/_components/MonthSection'

describe('MonthSection', () => {
  it('shows count + expense total when no income', () => {
    render(<MonthSection monthKey="2026-05" count={5} totalAmount={12000} />)
    expect(screen.getByText(/5 筆/)).toBeInTheDocument()
    expect(screen.getByText(/12,000/)).toBeInTheDocument()
    expect(screen.queryByText(/淨/)).toBeNull()
  })

  it('shows net summary when incomeTotal > 0', () => {
    render(
      <MonthSection monthKey="2026-05" count={8} totalAmount={12000} incomeTotal={98000} />
    )
    expect(screen.getByText(/12,000/)).toBeInTheDocument()
    expect(screen.getByText(/\+98,000/)).toBeInTheDocument()
    expect(screen.getByText(/淨/)).toBeInTheDocument()
    expect(screen.getByText(/\+NT\$86,000/)).toBeInTheDocument()
  })

  it('shows negative net when expenses exceed income', () => {
    render(
      <MonthSection monthKey="2026-05" count={3} totalAmount={50000} incomeTotal={30000} />
    )
    expect(screen.getByText(/淨/)).toBeInTheDocument()
    expect(screen.getByText(/NT\$-20,000/)).toBeInTheDocument()
  })
})
