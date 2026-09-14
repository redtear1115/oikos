import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { I18nWrapper } from './_mocks/i18n'

// #1186 — AddSheet family: selection state, accessible names, active option.

vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({
    viewer: { id: 'u-1', initial: 'R', avatarUrl: null },
    partner: { id: 'u-2', initial: 'S', avatarUrl: null },
    viewerIsA: true,
    canAccessGuardian: false,
  }),
  whoToMemberRole: (w: 'M' | 'T') => (w === 'M' ? 'a' : 'b'),
}))

vi.mock('@/actions/asset', () => ({
  loadAssetsForPicker: vi.fn(() => Promise.resolve([])),
}))

import { PayerToggle } from '@/app/(dashboard)/dashboard/_components/PayerToggle'
import { TripSelector } from '@/app/(dashboard)/dashboard/_components/TripSelector'
import { CurrencySelector } from '@/app/(dashboard)/dashboard/_components/CurrencySelector'
import { DescriptionAutocomplete } from '@/app/(dashboard)/dashboard/_components/DescriptionAutocomplete'
import { AssetPickerSheet } from '@/app/(dashboard)/dashboard/_components/AssetPickerSheet'

describe('PayerToggle', () => {
  function Harness() {
    const [who, setWho] = useState<'M' | 'T'>('M')
    return (
      <I18nWrapper>
        <PayerToggle value={who} onChange={setWho} />
      </I18nWrapper>
    )
  }

  it('exposes who paid as a labelled radio group, not colour alone', () => {
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: '誰付的？' })
    const me = screen.getByRole('radio', { name: '我' })
    const partner = screen.getByRole('radio', { name: '對方' })
    expect(group).toContainElement(me)
    expect(me).toHaveAttribute('aria-checked', 'true')
    expect(partner).toHaveAttribute('aria-checked', 'false')
    expect(me).toHaveAttribute('type', 'button')

    act(() => partner.click())
    expect(me).toHaveAttribute('aria-checked', 'false')
    expect(partner).toHaveAttribute('aria-checked', 'true')
  })
})

describe('trip / currency selects', () => {
  it('have accessible names', () => {
    render(
      <>
        <TripSelector
          value={null}
          options={[{ id: 't1', name: '京都', defaultCurrency: 'JPY', startDate: '2026-01-01', endDate: null }]}
          onChange={() => {}}
          noTripLabel="無旅行"
          ariaLabel="旅行"
        />
        <CurrencySelector value="JPY" onChange={() => {}} codes={['JPY', 'TWD']} ariaLabel="幣別" />
      </>,
    )
    expect(screen.getByRole('combobox', { name: '旅行' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '幣別' })).toBeInTheDocument()
  })
})

describe('DescriptionAutocomplete', () => {
  function Harness() {
    const [value, setValue] = useState('')
    return (
      <DescriptionAutocomplete
        value={value}
        onChange={setValue}
        suggestions={['午餐', '午茶']}
        placeholder="描述"
        listboxLabel="建議"
      />
    )
  }

  it('points aria-activedescendant at the highlighted option', () => {
    render(<Harness />)
    const input = screen.getByRole('combobox')
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '午' } })

    const options = screen.getAllByRole('option')
    expect(screen.getByRole('listbox', { name: '建議' }).id).toBe(input.getAttribute('aria-controls'))
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id)
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('drops aria-activedescendant when the list closes', () => {
    render(<Harness />)
    const input = screen.getByRole('combobox')
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '午' } })
    act(() => input.blur())
    expect(input).not.toHaveAttribute('aria-activedescendant')
  })
})

describe('AssetPickerSheet closed state', () => {
  function Picker({ open }: { open: boolean }) {
    return (
      <I18nWrapper>
        <AssetPickerSheet open={open} selectedAssetId={null} onClose={() => {}} onSelect={() => {}} />
      </I18nWrapper>
    )
  }

  it('is inert with no dialog semantics while closed', () => {
    render(<Picker open={false} />)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(screen.getByText('取消').closest('[inert]')).not.toBeNull()
  })

  it('is a labelled modal dialog while open', async () => {
    const { rerender } = render(<Picker open={false} />)
    await act(async () => {
      rerender(<Picker open />)
    })
    const dialog = screen.getByRole('dialog', { name: '選擇愛物' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).not.toHaveAttribute('inert')
  })
})
