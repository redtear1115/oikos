import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ModeTogglePlaceholder } from '@/app/(dashboard)/dashboard/_components/ModeTogglePlaceholder'

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
    const { getByRole } = render(<ModeTogglePlaceholder mode="expense" />)
    expect(getByRole('button', { name: /支出模式/ })).toBeInTheDocument()
    expect(getByRole('button', { name: /進帳模式/ })).toBeInTheDocument()
  })

  it('calls onChange when a mode is clicked', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<ModeTogglePlaceholder mode="expense" onChange={onChange} />)
    fireEvent.click(getByRole('button', { name: /進帳模式/ }))
    expect(onChange).toHaveBeenCalledWith('income')
  })

  it('shows a pending dot on income tab when expense is selected and pendings > 0', () => {
    const { container } = render(<ModeTogglePlaceholder mode="expense" pendingCount={2} />)
    expect(pendingDotsIn(container).length).toBe(1)
  })

  it('hides the pending dot when pendingCount is 0', () => {
    const { container } = render(<ModeTogglePlaceholder mode="expense" pendingCount={0} />)
    expect(pendingDotsIn(container).length).toBe(0)
  })

  it('hides the pending dot when income tab is already selected', () => {
    // Even if pending count > 0, no dot when the user is already viewing the
    // income surface — they are presumably about to see the pendings inline.
    const { container } = render(<ModeTogglePlaceholder mode="income" pendingCount={5} />)
    expect(pendingDotsIn(container).length).toBe(0)
  })

  it('defaults pendingCount to 0 when prop is omitted', () => {
    const { container } = render(<ModeTogglePlaceholder mode="expense" />)
    expect(pendingDotsIn(container).length).toBe(0)
  })
})
