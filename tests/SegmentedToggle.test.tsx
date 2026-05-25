import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'

describe('SegmentedToggle', () => {
  it('renders one button per option with aria-pressed reflecting active', () => {
    const { getByRole } = render(
      <SegmentedToggle
        options={[
          { id: 'a', label: 'A', active: true, onClick: () => {} },
          { id: 'b', label: 'B', active: false, onClick: () => {} },
        ]}
      />,
    )
    expect(getByRole('button', { name: 'A' }).getAttribute('aria-pressed')).toBe('true')
    expect(getByRole('button', { name: 'B' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('fires onClick only for the clicked segment', () => {
    const onA = vi.fn()
    const onB = vi.fn()
    const { getByRole } = render(
      <SegmentedToggle
        options={[
          { id: 'a', label: 'A', active: true, onClick: onA },
          { id: 'b', label: 'B', active: false, onClick: onB },
        ]}
      />,
    )
    fireEvent.click(getByRole('button', { name: 'B' }))
    expect(onB).toHaveBeenCalledTimes(1)
    expect(onA).not.toHaveBeenCalled()
  })

  it('applies fillColor + activeTextColor only to the active segment', () => {
    const { getByRole } = render(
      <SegmentedToggle
        options={[
          { id: 'a', label: 'A', active: true, onClick: () => {}, fillColor: 'rgb(1, 2, 3)', activeTextColor: 'rgb(4, 5, 6)' },
          { id: 'b', label: 'B', active: false, onClick: () => {}, fillColor: 'rgb(1, 2, 3)' },
        ]}
      />,
    )
    const a = getByRole('button', { name: 'A' })
    const b = getByRole('button', { name: 'B' })
    expect(a.style.background).toBe('rgb(1, 2, 3)')
    expect(a.style.color).toBe('rgb(4, 5, 6)')
    // Inactive segment ignores fillColor and stays transparent.
    expect(b.style.background).toBe('transparent')
  })

  it('exposes a group role carrying the provided aria-label', () => {
    const { getByRole } = render(
      <SegmentedToggle
        ariaLabel="balance view"
        options={[{ id: 'a', label: 'A', active: true, onClick: () => {} }]}
      />,
    )
    expect(getByRole('group', { name: 'balance view' })).toBeInTheDocument()
  })
})
