import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { DashboardFilterRow } from '@/app/(dashboard)/dashboard/_components/DashboardFilterRow'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// DashboardFilterRow takes `t` as a prop (Dashboard passes it down), and its
// child toggles take their labels as props too, so no provider is needed.
const base = {
  onPayerChange: () => {},
  onSplitChange: () => {},
  viewerIsA: true,
  t: zhTW,
}

const chipName = zhTW.dashboard.filterAriaLabel

describe('DashboardFilterRow', () => {
  it('shows only the 篩選 chip at rest (toggles collapsed)', () => {
    const { getAllByRole, getByRole } = render(
      <DashboardFilterRow {...base} payerFilter="all" splitFilter="all" />,
    )
    // Just the chip; the two dual-toggles (4 segment buttons) are hidden.
    expect(getAllByRole('button')).toHaveLength(1)
    expect(getByRole('button', { name: chipName }).getAttribute('aria-expanded')).toBe('false')
  })

  it('reveals the payer + split dual-toggles when the chip is tapped', () => {
    const { getByRole, getAllByRole } = render(
      <DashboardFilterRow {...base} payerFilter="all" splitFilter="all" />,
    )
    fireEvent.click(getByRole('button', { name: chipName }))
    // chip + 2 payer segments + 2 split segments
    expect(getAllByRole('button')).toHaveLength(5)
  })

  it('keeps toggles revealed and marks the chip active when a filter is set', () => {
    const { getByRole, getAllByRole } = render(
      <DashboardFilterRow {...base} payerFilter="me" splitFilter="all" />,
    )
    const chip = getByRole('button', { name: chipName })
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    expect(getAllByRole('button')).toHaveLength(5)
  })
})
