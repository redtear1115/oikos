import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef, useState } from 'react'
import { I18nWrapper } from './_mocks/i18n'

// #1194 — hand-written inputs moved onto TextInput / TextArea. What must not
// change: accessible names, ref targets, native attributes.

vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({
    viewer: { id: 'u-1', initial: 'R', avatarUrl: null, defaultSplitType: 'half' },
    partner: { id: 'u-2', initial: 'S', avatarUrl: null },
    isSolo: false,
    isPast: false,
    viewerIsA: true,
    canAccessGuardian: false,
  }),
  whoToMemberRole: (w: 'M' | 'T') => (w === 'M' ? 'a' : 'b'),
}))
vi.mock('@/actions/transaction', () => ({
  createTransaction: vi.fn(),
  editTransaction: vi.fn(),
  softDeleteTransaction: vi.fn(),
  getDescriptionSuggestions: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/actions/tripExpense', () => ({
  createTripExpense: vi.fn(),
  editTripExpense: vi.fn(),
  softDeleteTripExpense: vi.fn(),
}))
vi.mock('@/actions/recurringExpense', () => ({ editAndConfirmPending: vi.fn() }))
vi.mock('@/actions/asset', () => ({ loadAssetsForPicker: vi.fn(() => Promise.resolve([])) }))
vi.mock('@/actions/trip', () => ({ endTrip: vi.fn(), createTrip: vi.fn(), updateTrip: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { TextInput } from '@/components/ui/TextInput'
import { TextArea } from '@/components/ui/TextArea'
import { NameField } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/NameField'
import { NotesField } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/NotesField'
import { EditTextSheet } from '@/app/(dashboard)/_components/EditTextSheet'
import { AddSheet } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { TripSheet } from '@/app/(dashboard)/trips/_components/TripSheet'
import { EndTripSheet } from '@/app/(dashboard)/trips/[id]/_components/EndTripSheet'

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

describe('TextInput primitive', () => {
  it('puts ref and native attributes on the <input>, not the wrapper', () => {
    const ref = createRef<HTMLInputElement>()
    render(
      <>
        <span id="hint">說明</span>
        <TextInput
          ref={ref}
          aria-label="車牌"
          aria-describedby="hint"
          inputMode="numeric"
          autoComplete="off"
          className="w-20"
          inputClassName="font-numeric"
        />
      </>,
    )
    const input = screen.getByRole('textbox', { name: '車牌' })
    expect(ref.current).toBe(input)
    expect(input).toHaveAccessibleDescription('說明')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveClass('font-numeric')
    expect(input).not.toHaveClass('w-20')
    expect(input.parentElement).toHaveClass('w-20', 'h-[var(--control-md)]', 'rounded-bubble')
  })

  // #1252: the fade used to sit on the `<input>` only, so a disabled field
  // kept a full-strength border and addon. Nothing looked broken — it read as
  // a live input whose text had gone faint (InsuranceListItem's renewal field
  // while the save runs).
  it('fades the whole field when disabled, border and addon included', () => {
    const { rerender } = render(
      <TextInput aria-label="保單號碼" disabled rightAddon={<span>NT$</span>} />,
    )
    const input = screen.getByRole('textbox', { name: '保單號碼' })
    expect(input.parentElement).toHaveClass('opacity-50')
    expect(input).not.toHaveClass('disabled:opacity-50')
    expect(input).toHaveClass('disabled:cursor-default')

    rerender(<TextInput aria-label="保單號碼" rightAddon={<span>NT$</span>} />)
    expect(input.parentElement).not.toHaveClass('opacity-50')
  })
})

describe('TextArea primitive', () => {
  it('associates with an external label and forwards ref', () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(
      <>
        <label htmlFor="n">備註</label>
        <TextArea id="n" ref={ref} maxLength={2000} />
      </>,
    )
    const area = screen.getByRole('textbox', { name: '備註' })
    expect(ref.current).toBe(area)
    expect(area).toHaveAttribute('maxlength', '2000')
    expect(area).toHaveClass('oik-input-wrapper', 'rounded-bubble', 'text-base')
  })
})

describe('asset sheet shared fields', () => {
  it('NameField keeps its label and forwards the focus ref', () => {
    const ref = createRef<HTMLInputElement>()
    function Harness() {
      const [v, setV] = useState('')
      return <NameField ref={ref} label="名字" value={v} onChange={setV} placeholder="小白" />
    }
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: '名字' })
    expect(ref.current).toBe(input)
  })

  it('NotesField keeps its label', () => {
    render(<NotesField label="備註" placeholder="" value="" onChange={() => {}} />)
    expect(screen.getByRole('textbox', { name: '備註' }).tagName).toBe('TEXTAREA')
  })
})

describe('migrated sheets', () => {
  it('EditTextSheet still focuses its input on open through the ref', () => {
    render(
      <I18nWrapper>
        <EditTextSheet open title="帳本名稱" initialValue="我們家" onSubmit={vi.fn()} onClose={vi.fn()} />
      </I18nWrapper>,
    )
    const input = screen.getByPlaceholderText('帳本名稱')
    expect(document.activeElement).toBe(input)
    expect(input).toHaveValue('我們家')
  })

  it('AddSheet notes field is now labelled (was placeholder-only, #1186)', () => {
    render(
      <I18nWrapper>
        <AddSheet open onClose={() => {}} />
      </I18nWrapper>,
    )
    const notes = screen.getByRole('textbox', { name: '備註（選填，兩人都看得到）' })
    expect(notes.tagName).toBe('TEXTAREA')
    // The amount input ref is untouched: it still takes focus on open.
    expect(document.activeElement).toBe(screen.getByLabelText('金額'))
  })

  it('TripSheet fields keep their names', () => {
    render(
      <I18nWrapper>
        <TripSheet
          open
          baseCurrency="twd"
          onClose={() => {}}
          initial={{
            id: 't-1',
            name: '京都',
            startDate: '2026-09-01',
            endDate: null,
            defaultCurrency: 'TWD',
            rateSnapshot: {
              default: 'TWD',
              entries: [
                { code: 'TWD', label: null, rate: 1 },
                { code: 'VND', label: '越南盾', rate: 0.0013 },
              ],
            },
          }}
        />
      </I18nWrapper>,
    )
    expect(screen.getByRole('textbox', { name: '名稱' })).toHaveValue('京都')
    expect(screen.getByLabelText('起始日')).toHaveValue('2026-09-01')
    expect(screen.getByLabelText('結束日（可選）')).toHaveValue('')
    expect(screen.getByRole('textbox', { name: '幣別代碼' })).toHaveValue('VND')
    expect(screen.getByRole('textbox', { name: '顯示名稱' })).toHaveValue('越南盾')
    expect(screen.getByRole('spinbutton', { name: 'VND 對 TWD 的匯率' })).toHaveValue(0.0013)
  })

  it('EndTripSheet date keeps its label and flags an invalid date', () => {
    render(
      <I18nWrapper>
        <EndTripSheet open tripId="t-1" startDate="2026-09-20" suggestedEndDate="2026-09-10" onClose={() => {}} />
      </I18nWrapper>,
    )
    const date = screen.getByLabelText('結束日')
    expect(date).toHaveValue('2026-09-10')
    expect(date).toHaveAttribute('aria-invalid', 'true')
  })
})
