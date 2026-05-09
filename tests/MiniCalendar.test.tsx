import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MiniCalendar } from '@/app/(dashboard)/dashboard/_components/MiniCalendar'

describe('MiniCalendar', () => {
  it('renders day grid with the value month visible', () => {
    render(<MiniCalendar value="2026-05-08" onChange={() => {}} />)
    expect(screen.getByText(/2026 年 5 月/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上個月' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下個月' })).toBeInTheDocument()
  })

  it('selects a day and calls onChange', () => {
    const onChange = vi.fn()
    render(<MiniCalendar value="2026-05-08" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '15' }))
    expect(onChange).toHaveBeenCalledWith('2026-05-15')
  })

  it('navigates to previous and next month with single arrows', () => {
    render(<MiniCalendar value="2026-05-08" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '上個月' }))
    expect(screen.getByText(/2026 年 4 月/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下個月' }))
    fireEvent.click(screen.getByRole('button', { name: '下個月' }))
    expect(screen.getByText(/2026 年 6 月/)).toBeInTheDocument()
  })

  it('switches to month-grid view when header is tapped', () => {
    render(<MiniCalendar value="2026-05-08" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /選擇月份/ }))
    expect(screen.getByText(/^2026 年 ˅$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 月' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '12 月' })).toBeInTheDocument()
  })

  it('arrows in month-grid view step year by 1', () => {
    render(<MiniCalendar value="2026-05-08" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /選擇月份/ }))
    fireEvent.click(screen.getByRole('button', { name: '上一年' }))
    expect(screen.getByText(/^2025 年 ˅$/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一年' }))
    fireEvent.click(screen.getByRole('button', { name: '下一年' }))
    expect(screen.getByText(/^2027 年 ˅$/)).toBeInTheDocument()
  })

  it('picking a month from month-grid returns to day view of that month', () => {
    render(<MiniCalendar value="2026-05-08" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /選擇月份/ }))
    fireEvent.click(screen.getByRole('button', { name: '上一年' }))
    fireEvent.click(screen.getByRole('button', { name: '11 月' }))
    expect(screen.getByText(/2025 年 11 月/)).toBeInTheDocument()
  })

  it('switches to year-grid view when month-grid header is tapped', () => {
    render(<MiniCalendar value="2026-05-08" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /選擇月份/ }))
    fireEvent.click(screen.getByRole('button', { name: /選擇年份/ }))
    // 2026 falls in decade 2020-2029
    expect(screen.getByText(/^2020 – 2029$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2020' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2029' })).toBeInTheDocument()
    // 3×4 grid with overflow years on each side
    expect(screen.getByRole('button', { name: '2019' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2030' })).toBeInTheDocument()
  })

  it('arrows in year-grid view step decade by 10', () => {
    render(<MiniCalendar value="2026-05-08" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /選擇月份/ }))
    fireEvent.click(screen.getByRole('button', { name: /選擇年份/ }))
    fireEvent.click(screen.getByRole('button', { name: '上一個十年' }))
    expect(screen.getByText(/^2010 – 2019$/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一個十年' }))
    fireEvent.click(screen.getByRole('button', { name: '下一個十年' }))
    expect(screen.getByText(/^2030 – 2039$/)).toBeInTheDocument()
  })

  it('picking a year from year-grid returns to month-grid for that year', () => {
    render(<MiniCalendar value="2026-05-08" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /選擇月份/ }))
    fireEvent.click(screen.getByRole('button', { name: /選擇年份/ }))
    fireEvent.click(screen.getByRole('button', { name: '上一個十年' }))
    fireEvent.click(screen.getByRole('button', { name: '2015' }))
    expect(screen.getByText(/^2015 年 ˅$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5 月' })).toBeInTheDocument()
  })

  it('picking an overflow year jumps into that year and adjacent decade', () => {
    render(<MiniCalendar value="2026-05-08" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /選擇月份/ }))
    fireEvent.click(screen.getByRole('button', { name: /選擇年份/ }))
    // 2019 is the leading overflow year of decade 2020-2029
    fireEvent.click(screen.getByRole('button', { name: '2019' }))
    expect(screen.getByText(/^2019 年 ˅$/)).toBeInTheDocument()
    // Re-entering year view from 2019 should land on decade 2010-2019
    fireEvent.click(screen.getByRole('button', { name: /選擇年份/ }))
    expect(screen.getByText(/^2010 – 2019$/)).toBeInTheDocument()
  })

  it('day selection still uses originally selected month even after navigating away', () => {
    const onChange = vi.fn()
    render(<MiniCalendar value="2026-05-08" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /選擇月份/ }))
    fireEvent.click(screen.getByRole('button', { name: /選擇年份/ }))
    fireEvent.click(screen.getByRole('button', { name: '上一個十年' }))
    fireEvent.click(screen.getByRole('button', { name: '2015' }))
    fireEvent.click(screen.getByRole('button', { name: '3 月' }))
    fireEvent.click(screen.getByRole('button', { name: '20' }))
    expect(onChange).toHaveBeenCalledWith('2015-03-20')
  })
})
