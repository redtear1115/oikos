import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ModeTogglePlaceholder } from '@/app/(dashboard)/dashboard/_components/ModeTogglePlaceholder'
import { I18nWrapper } from './_mocks/i18n'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

// The pending-income mint dot lives inside the 「進帳模式」 button as a tiny
// 5×5 round span. We identify it by its width/height inline style — there's no
// stable text or role to grab onto, and adding a data-testid felt heavier than
// the test cost itself.
function pendingDotsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('span')).filter(el => {
    const s = (el as HTMLElement).style
    return s.width === '5px' && s.height === '5px'
  }) as HTMLElement[]
}

describe('ModeTogglePlaceholder', () => {
  it('renders both mode buttons', () => {
    const { getByRole } = wrap(<ModeTogglePlaceholder mode="expense" />)
    expect(getByRole('button', { name: /支出模式/ })).toBeInTheDocument()
    expect(getByRole('button', { name: /進帳模式/ })).toBeInTheDocument()
  })

  it('calls onChange when a mode is clicked', () => {
    const onChange = vi.fn()
    const { getByRole } = wrap(<ModeTogglePlaceholder mode="expense" onChange={onChange} />)
    fireEvent.click(getByRole('button', { name: /進帳模式/ }))
    expect(onChange).toHaveBeenCalledWith('income')
  })

  it('shows a pending dot on income tab when expense is selected and pendings > 0', () => {
    const { container } = wrap(<ModeTogglePlaceholder mode="expense" incomePendingCount={2} />)
    expect(pendingDotsIn(container).length).toBe(1)
  })

  it('hides the pending dot when incomePendingCount is 0', () => {
    const { container } = wrap(<ModeTogglePlaceholder mode="expense" incomePendingCount={0} />)
    expect(pendingDotsIn(container).length).toBe(0)
  })

  it('hides the pending dot when income tab is already selected', () => {
    // Even if pending count > 0, no dot when the user is already viewing the
    // income surface — they are presumably about to see the pendings inline.
    const { container } = wrap(<ModeTogglePlaceholder mode="income" incomePendingCount={5} />)
    expect(pendingDotsIn(container).length).toBe(0)
  })

  it('defaults incomePendingCount to 0 when prop is omitted', () => {
    const { container } = wrap(<ModeTogglePlaceholder mode="expense" />)
    expect(pendingDotsIn(container).length).toBe(0)
  })

  it('shows a pending dot on expense tab when income is selected and expensePendings > 0', () => {
    const { container } = wrap(
      <ModeTogglePlaceholder mode="income" expensePendingCount={3} />,
    )
    expect(pendingDotsIn(container).length).toBe(1)
  })

  it('hides the expense pending dot when expense tab is already selected', () => {
    const { container } = wrap(
      <ModeTogglePlaceholder mode="expense" expensePendingCount={3} />,
    )
    expect(pendingDotsIn(container).length).toBe(0)
  })

  it('shows two dots when both pending counts > 0 and on expense tab — no, only the inactive (income) tab gets the dot', () => {
    const { container } = wrap(
      <ModeTogglePlaceholder
        mode="expense"
        incomePendingCount={2}
        expensePendingCount={2}
      />,
    )
    // Only the inactive (income) tab shows a dot — the active (expense) tab is suppressed.
    expect(pendingDotsIn(container).length).toBe(1)
  })
})
