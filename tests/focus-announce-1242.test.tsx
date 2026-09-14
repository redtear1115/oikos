import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// #1242 — focus / announcement follow-ups to #1172 #1186 (#1226 #1230):
// radiogroup arrow keys + roving tabindex, restore-focus preventScroll and
// detached-trigger fallback, AddSheet error banner described onto its field,
// LeaveGroupFlow moving focus to each new card's heading.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({
    viewer: { id: 'u-1', initial: 'R', avatarUrl: null, defaultSplitType: 'half' },
    partner: { id: 'u-2', initial: 'S', avatarUrl: null },
    viewerIsA: true,
    isSolo: false,
    canAccessGuardian: false,
  }),
  whoToMemberRole: (w: 'M' | 'T') => (w === 'M' ? 'a' : 'b'),
}))
vi.mock('@/actions/transaction', () => ({
  createTransaction: vi.fn(),
  editTransaction: vi.fn(),
  softDeleteTransaction: vi.fn(),
  getDescriptionSuggestions: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/actions/tripExpense', () => ({
  createTripExpense: vi.fn(),
  editTripExpense: vi.fn(),
  softDeleteTripExpense: vi.fn(),
}))
vi.mock('@/actions/recurringExpense', () => ({ editAndConfirmPending: vi.fn() }))
vi.mock('@/actions/asset', () => ({
  loadAsset: vi.fn(() => Promise.resolve(null)),
  loadAssetsForPicker: vi.fn(() => Promise.resolve([])),
}))
const updateDefaultSplitType = vi.fn()
vi.mock('@/actions/profile', () => ({ updateDefaultSplitType: (v: unknown) => updateDefaultSplitType(v) }))
const proposeSwap = vi.fn()
vi.mock('@/actions/membership', () => ({
  proposeSwap: () => proposeSwap(),
  leaveGroup: vi.fn(),
  removePartner: vi.fn(),
}))

import { PayerToggle } from '@/app/(dashboard)/dashboard/_components/PayerToggle'
import { SplitTypeSelector } from '@/app/(dashboard)/dashboard/_components/SplitTypeSelector'
import { SplitTypeSection } from '@/app/(dashboard)/settings/_components/sections/SplitTypeSection'
import { useFocusTrap } from '@/app/(dashboard)/_components/useFocusTrap'
import { AddSheet } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { LeaveGroupFlow } from '@/app/(dashboard)/settings/_components/LeaveGroupFlow'
import type { SplitType } from '@/lib/balance'

// jsdom has no layout: model "attached = visible" for useFocusTrap's filter,
// as in sheet-focus-stack.test.tsx.
const offsetParentDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
beforeAll(() => {
  // AddSheet's ScrollFadeRow observes size; jsdom has no ResizeObserver.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  // useScrollToTopOnOpen calls element.scrollTo, which jsdom doesn't implement.
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return (this as HTMLElement).isConnected ? (this as HTMLElement).parentElement : null
    },
  })
})
afterAll(() => {
  vi.unstubAllGlobals()
  if (offsetParentDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParentDescriptor)
  }
})

let backSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  proposeSwap.mockReset()
  updateDefaultSplitType.mockReset()
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
})
afterEach(() => {
  backSpy.mockRestore()
})

// ── 3. radiogroup keyboard ─────────────────────────────────────────────────
describe('radiogroup arrow keys + roving tabindex (#1242 §3)', () => {
  function PayerHarness() {
    const [who, setWho] = useState<'M' | 'T'>('M')
    return (
      <I18nWrapper>
        <PayerToggle value={who} onChange={setWho} />
      </I18nWrapper>
    )
  }

  it('makes only the checked radio a Tab stop', () => {
    render(<PayerHarness />)
    expect(screen.getByRole('radio', { name: '我' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: '對方' })).toHaveAttribute('tabindex', '-1')
  })

  it.each([
    ['ArrowRight'],
    ['ArrowDown'],
  ])('%s moves focus to the next radio and selects it, wrapping at the end', (key) => {
    render(<PayerHarness />)
    const me = screen.getByRole('radio', { name: '我' })
    const partner = screen.getByRole('radio', { name: '對方' })
    act(() => me.focus())

    fireEvent.keyDown(me, { key })
    expect(document.activeElement).toBe(partner)
    expect(partner).toHaveAttribute('aria-checked', 'true')
    expect(partner).toHaveAttribute('tabindex', '0')
    expect(me).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(partner, { key })
    expect(document.activeElement).toBe(me)
    expect(me).toHaveAttribute('aria-checked', 'true')
  })

  it.each([
    ['ArrowLeft'],
    ['ArrowUp'],
  ])('%s moves to the previous radio, wrapping at the start', (key) => {
    render(<PayerHarness />)
    const me = screen.getByRole('radio', { name: '我' })
    const partner = screen.getByRole('radio', { name: '對方' })
    act(() => me.focus())
    fireEvent.keyDown(me, { key })
    expect(document.activeElement).toBe(partner)
    expect(partner).toHaveAttribute('aria-checked', 'true')
  })

  it('leaves other keys and non-radio targets alone (the nested split slider keeps its arrows)', () => {
    function SplitHarness() {
      const [value, setValue] = useState<SplitType>('weighted')
      const [ratio, setRatio] = useState(50)
      return (
        <I18nWrapper>
          <SplitTypeSelector
            value={value}
            onChange={setValue}
            splitRatioA={ratio}
            onSplitRatioAChange={setRatio}
            amount={100}
            payerWho="M"
            defaultViewerShare={50}
          />
        </I18nWrapper>
      )
    }
    render(<SplitHarness />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])

    const slider = screen.getByRole('slider')
    const e = fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(e).toBe(true) // not preventDefault-ed
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')

    act(() => radios[0].focus())
    fireEvent.keyDown(radios[0], { key: 'Enter' })
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')

    fireEvent.keyDown(radios[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(radios[1])
    expect(radios[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps focus on the settings radio while its save runs (aria-disabled, not disabled)', async () => {
    let resolveSave: () => void = () => {}
    updateDefaultSplitType.mockImplementation(() => new Promise<void>((r) => { resolveSave = r }))
    render(
      <I18nWrapper>
        <SplitTypeSection current="half" isSolo={false} />
      </I18nWrapper>,
    )
    const radios = screen.getAllByRole('radio')
    act(() => radios[0].focus())
    fireEvent.keyDown(radios[0], { key: 'ArrowDown' })
    expect(updateDefaultSplitType).toHaveBeenCalledWith('all_mine')
    await waitFor(() => expect(radios[1]).toHaveAttribute('aria-disabled', 'true'))
    expect(radios[1]).not.toBeDisabled()
    expect(document.activeElement).toBe(radios[1])

    // Presses during the save are ignored rather than queued.
    fireEvent.click(radios[2])
    expect(updateDefaultSplitType).toHaveBeenCalledTimes(1)
    await act(async () => resolveSave())
  })
})

// ── 5 / 6. useFocusTrap restore ────────────────────────────────────────────
describe('useFocusTrap restore (#1242 §5 §6)', () => {
  function Trap({ open, label, focusablePanel = false }: { open: boolean; label: string; focusablePanel?: boolean }) {
    const ref = useRef<HTMLDivElement>(null)
    useFocusTrap(open, ref)
    return (
      <div ref={ref} data-testid={label} {...(focusablePanel ? { tabIndex: -1 } : {})}>
        <button type="button">{`${label}-1`}</button>
      </div>
    )
  }

  it('restores with preventScroll so closing a sheet does not scroll back to its row', () => {
    function Page({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">row</button>
          <Trap open={open} label="sheet" />
        </>
      )
    }
    const { rerender } = render(<Page open={false} />)
    const row = screen.getByText('row')
    act(() => row.focus())
    rerender(<Page open />)
    act(() => screen.getByText('sheet-1').focus())

    const spy = vi.spyOn(row, 'focus')
    rerender(<Page open={false} />)
    expect(spy).toHaveBeenCalledWith({ preventScroll: true })
    expect(document.activeElement).toBe(row)
  })

  it('falls back into the trap underneath when the trigger was unmounted', () => {
    // A modal opened from a button inside the sheet; that button disappears
    // in the same commit the modal closes (e.g. the row it belonged to was
    // deleted).
    function Nested({ modal, showTrigger }: { modal: boolean; showTrigger: boolean }) {
      return (
        <>
          <Trap open label="sheet" />
          {showTrigger && <button type="button">modal-trigger</button>}
          <Trap open={modal} label="modal" />
        </>
      )
    }
    const { rerender } = render(<Nested modal={false} showTrigger />)
    act(() => screen.getByText('modal-trigger').focus())
    rerender(<Nested modal showTrigger />)
    act(() => screen.getByText('modal-1').focus())

    rerender(<Nested modal={false} showTrigger={false} />)
    // SheetFrame's panel has no tabindex → its first control.
    expect(document.activeElement).toBe(screen.getByText('sheet-1'))
  })

  it('prefers a focusable panel (tabIndex=-1) as the fallback target', () => {
    function Nested({ modal, showTrigger }: { modal: boolean; showTrigger: boolean }) {
      return (
        <>
          <Trap open label="flow" focusablePanel />
          {showTrigger && <button type="button">modal-trigger</button>}
          <Trap open={modal} label="modal" />
        </>
      )
    }
    const { rerender } = render(<Nested modal={false} showTrigger />)
    act(() => screen.getByText('modal-trigger').focus())
    rerender(<Nested modal showTrigger />)
    act(() => screen.getByText('modal-1').focus())
    rerender(<Nested modal={false} showTrigger={false} />)
    expect(document.activeElement).toBe(screen.getByTestId('flow'))
  })

  it('does not move focus anywhere when the trigger is gone and no trap is left', () => {
    function Page({ open, showTrigger }: { open: boolean; showTrigger: boolean }) {
      return (
        <>
          {showTrigger && <button type="button">row</button>}
          <Trap open={open} label="sheet" />
        </>
      )
    }
    const { rerender } = render(<Page open={false} showTrigger />)
    act(() => screen.getByText('row').focus())
    rerender(<Page open showTrigger />)
    const inside = screen.getByText('sheet-1')
    act(() => inside.focus())
    const spy = vi.spyOn(HTMLElement.prototype, 'focus')
    rerender(<Page open={false} showTrigger={false} />)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

// ── 4. AddSheet error banner ───────────────────────────────────────────────
describe('AddSheet error banner is described onto its field (#1242 §4)', () => {
  function renderSheet() {
    return render(
      <I18nWrapper>
        <AddSheet open onClose={() => {}} />
      </I18nWrapper>,
    )
  }

  it('describes the description input when the description is missing', async () => {
    renderSheet()
    const amount = screen.getByLabelText(zhTW.addSheet.amount) as HTMLInputElement
    fireEvent.change(amount, { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: zhTW.common.save }))

    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(zhTW.addSheet.errors.descriptionRequired)
    const desc = screen.getByRole('combobox')
    expect(desc).toHaveAttribute('aria-describedby', banner.id)
    expect(desc).toHaveAttribute('aria-invalid', 'true')
    expect(amount).not.toHaveAttribute('aria-describedby')
    expect(amount).not.toHaveAttribute('aria-invalid')
  })

  it('describes the amount input when the amount is zero', async () => {
    renderSheet()
    const amount = screen.getByLabelText(zhTW.addSheet.amount) as HTMLInputElement
    fireEvent.change(amount, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: zhTW.common.save }))

    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(zhTW.addSheet.errors.amountRequired)
    expect(amount).toHaveAttribute('aria-describedby', banner.id)
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-describedby')
  })
})

// ── 1. LeaveGroupFlow step change ──────────────────────────────────────────
describe('LeaveGroupFlow moves focus to each new card heading (#1242 §1)', () => {
  const flow = zhTW.settings.dangerZone.flow

  function LeaveHarness() {
    const [open, setOpen] = useState(false)
    return (
      <I18nWrapper>
        <button type="button" onClick={() => setOpen(true)}>離開帳本</button>
        <LeaveGroupFlow
          open={open}
          onClose={() => setOpen(false)}
          viewerIsMemberA={false}
          viewerName="小明"
          partnerName="小華"
          groupBalance={0}
        />
      </I18nWrapper>
    )
  }

  it('focuses the step 2 and step 3 warning headings, not the surviving "next" button', async () => {
    render(<LeaveHarness />)
    const trigger = screen.getByText('離開帳本')
    trigger.focus()
    fireEvent.click(trigger)
    // Open focuses the panel, not a heading.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog')))

    const next = screen.getByText(flow.next)
    act(() => next.focus())
    fireEvent.click(next)
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 })),
    )
    expect(document.activeElement).not.toBe(screen.getByText(flow.next))

    act(() => screen.getByText(flow.next).focus())
    fireEvent.click(screen.getByText(flow.next))
    await waitFor(() => {
      const h = screen.getByRole('heading', { level: 2 })
      expect(document.activeElement).toBe(h)
      expect(h.id).toBe(screen.getByRole('dialog').getAttribute('aria-labelledby'))
    })
  })

  it('does not steal focus when the flow re-opens at step 1', async () => {
    render(<LeaveHarness />)
    const trigger = screen.getByText('離開帳本')
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText(flow.next))
    fireEvent.click(screen.getByRole('button', { name: flow.close }))
    await waitFor(() => expect(document.activeElement).toBe(trigger))

    fireEvent.click(trigger)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog')))
  })
})
