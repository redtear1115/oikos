import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { SheetFrame } from '@/app/(dashboard)/_components/SheetFrame'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { useFocusTrap } from '@/app/(dashboard)/_components/useFocusTrap'
import { useFocusAndSelectOnOpen } from '@/app/(dashboard)/_components/useFocusAndSelectOnOpen'

// #1176 / #1204 — closed SheetFrame out of reach, nested focus traps stack,
// ConfirmModal escapes the sheet's transform containing block.

// jsdom has no layout, so `offsetParent` is always null and useFocusTrap's
// visibility filter would treat every control as hidden. Model "attached =
// visible" for these tests.
const offsetParentDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return (this as HTMLElement).isConnected ? (this as HTMLElement).parentElement : null
    },
  })
})
afterAll(() => {
  if (offsetParentDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParentDescriptor)
  }
})

// useEscapeToClose (via SheetBackdrop) takes its History API path in jsdom.
// Model the browser: history.back() emits the popstate echo it expects.
let backSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
})
afterEach(() => {
  backSpy.mockRestore()
})

/** Dispatch a Tab keydown on window and report whether a trap intercepted it. */
function pressTab(shiftKey = false): boolean {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
  act(() => {
    window.dispatchEvent(e)
  })
  return e.defaultPrevented
}

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  })
}

describe('SheetFrame closed state (#1176)', () => {
  function Frame({ open }: { open: boolean }) {
    return (
      <SheetFrame open={open} onClose={() => {}} ariaLabel="設定">
        <button type="button">登出</button>
      </SheetFrame>
    )
  }

  it('has no dialog semantics and is inert while closed', () => {
    render(<Frame open={false} />)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.querySelector('[aria-modal]')).toBeNull()
    const button = screen.getByText('登出')
    expect(button.closest('[inert]')).not.toBeNull()
  })

  it('exposes the dialog and drops inert while open', () => {
    const { rerender } = render(<Frame open={false} />)
    rerender(<Frame open />)
    const dialog = screen.getByRole('dialog', { name: '設定' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).not.toHaveAttribute('inert')
    expect(screen.getByText('登出').closest('[inert]')).toBeNull()
  })
})

describe('useFocusTrap stack (#1176)', () => {
  function Trap({ open, label }: { open: boolean; label: string }) {
    const ref = useRef<HTMLDivElement>(null)
    useFocusTrap(open, ref)
    return (
      <div ref={ref} data-testid={label}>
        <button type="button">{`${label}-1`}</button>
        <button type="button">{`${label}-2`}</button>
      </div>
    )
  }

  function Nested({ outer, inner }: { outer: boolean; inner: boolean }) {
    return (
      <>
        <button type="button">page-trigger</button>
        <Trap open={outer} label="sheet" />
        <Trap open={inner} label="modal" />
      </>
    )
  }

  it('lets Tab move normally inside the topmost trap', () => {
    const { rerender } = render(<Nested outer={false} inner={false} />)
    rerender(<Nested outer inner={false} />)
    rerender(<Nested outer inner />)
    act(() => screen.getByText('modal-1').focus())

    // Not at a boundary: the browser should be allowed to move focus to
    // modal-2. Before the stack, the sheet's trap saw focus "outside" its
    // panel and yanked it back, swallowing the Tab.
    expect(pressTab()).toBe(false)
    expect(document.activeElement).toBe(screen.getByText('modal-1'))
  })

  it('cycles within the topmost trap at its boundaries', () => {
    const { rerender } = render(<Nested outer={false} inner={false} />)
    rerender(<Nested outer inner={false} />)
    rerender(<Nested outer inner />)

    act(() => screen.getByText('modal-2').focus())
    expect(pressTab()).toBe(true)
    expect(document.activeElement).toBe(screen.getByText('modal-1'))

    expect(pressTab(true)).toBe(true)
    expect(document.activeElement).toBe(screen.getByText('modal-2'))
  })

  it('hands Tab back to the lower trap once the upper one closes', () => {
    const { rerender } = render(<Nested outer={false} inner={false} />)
    rerender(<Nested outer inner={false} />)
    rerender(<Nested outer inner />)
    rerender(<Nested outer inner={false} />)

    act(() => screen.getByText('modal-1').focus())
    // Focus is outside the sheet now; the sheet trap pulls it back in.
    expect(pressTab()).toBe(true)
    expect(document.activeElement).toBe(screen.getByText('sheet-1'))
  })

  it('restores focus layer by layer', () => {
    const { rerender } = render(<Nested outer={false} inner={false} />)
    act(() => screen.getByText('page-trigger').focus())
    rerender(<Nested outer inner={false} />)

    act(() => screen.getByText('sheet-2').focus())
    rerender(<Nested outer inner />)
    act(() => screen.getByText('modal-1').focus())

    rerender(<Nested outer inner={false} />)
    expect(document.activeElement).toBe(screen.getByText('sheet-2'))

    rerender(<Nested outer={false} inner={false} />)
    expect(document.activeElement).toBe(screen.getByText('page-trigger'))
  })

  it('restores to the page trigger when both layers close in one commit', () => {
    // e.g. confirming a delete closes the modal and the sheet together. The
    // modal's restore target (a button inside the sheet) is about to be
    // hidden, so focus must land on the sheet's trigger instead.
    const { rerender } = render(<Nested outer={false} inner={false} />)
    act(() => screen.getByText('page-trigger').focus())
    rerender(<Nested outer inner={false} />)
    act(() => screen.getByText('sheet-2').focus())
    rerender(<Nested outer inner />)
    act(() => screen.getByText('modal-1').focus())

    rerender(<Nested outer={false} inner={false} />)
    expect(document.activeElement).toBe(screen.getByText('page-trigger'))
  })
})

describe('ConfirmModal inside an open SheetFrame (#1204)', () => {
  function SheetWithConfirm({ onSheetClose }: { onSheetClose: () => void }) {
    const [confirming, setConfirming] = useState(false)
    return (
      <I18nWrapper>
        <SheetFrame open onClose={onSheetClose} ariaLabel="設定">
          <button type="button" onClick={() => setConfirming(true)}>
            登出
          </button>
          <ConfirmModal
            open={confirming}
            title="登出 Futari？"
            confirmLabel="確認登出"
            onCancel={() => setConfirming(false)}
            onConfirm={() => setConfirming(false)}
          />
        </SheetFrame>
      </I18nWrapper>
    )
  }

  it('portals the modal out of the sheet panel', () => {
    render(<SheetWithConfirm onSheetClose={() => {}} />)
    const trigger = screen.getByText('登出')
    act(() => trigger.focus())
    act(() => trigger.click())

    const modal = screen.getByRole('dialog', { name: '登出 Futari？' })
    const sheet = screen.getByRole('dialog', { name: '設定' })
    // A `transform` on any ancestor would become the containing block for the
    // modal's `position: fixed`; being a direct child of body rules that out.
    expect(sheet.contains(modal)).toBe(false)
    expect(modal.parentElement).toBe(document.body)
    expect(document.activeElement).toBe(screen.getByText('取消'))
  })

  it('keeps Tab inside the modal and reaches the confirm button', () => {
    render(<SheetWithConfirm onSheetClose={() => {}} />)
    act(() => screen.getByText('登出').click())

    const cancel = screen.getByText('取消')
    const confirm = screen.getByText('確認登出')
    expect(document.activeElement).toBe(cancel)
    // Cancel → Confirm is a normal browser move; no trap may intercept it.
    expect(pressTab()).toBe(false)
    act(() => confirm.focus())
    expect(pressTab()).toBe(true)
    expect(document.activeElement).toBe(cancel)
  })

  it('Escape closes only the modal and returns focus to the trigger', () => {
    const onSheetClose = vi.fn()
    render(<SheetWithConfirm onSheetClose={onSheetClose} />)
    const trigger = screen.getByText('登出')
    act(() => trigger.focus())
    act(() => trigger.click())
    expect(screen.getByRole('dialog', { name: '登出 Futari？' })).toBeInTheDocument()

    pressEscape()
    expect(screen.queryByRole('dialog', { name: '登出 Futari？' })).toBeNull()
    expect(onSheetClose).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)
  })
})

// A sheet that moves focus into its amount input on open — the AddSheet /
// IncomeSheet / SettlementSheet shape. useFocusAndSelectOnOpen is a layout
// effect, so it ran before the trap's passive effect recorded the restore
// target: the trap recorded the input inside its own panel, and closing the
// sheet dropped focus on <body> instead of the trigger.
describe('restore target when the sheet focuses a field on open', () => {
  function AmountSheet({
    open,
    confirming = false,
    onDeleteRequest,
  }: {
    open: boolean
    confirming?: boolean
    onDeleteRequest?: () => void
  }) {
    const inputRef = useRef<HTMLInputElement>(null)
    useFocusAndSelectOnOpen(open, inputRef)
    return (
      <I18nWrapper>
        <button type="button">fab</button>
        <SheetFrame open={open} onClose={() => {}} ariaLabel="記一筆">
          <input ref={inputRef} aria-label="金額" />
          <button type="button" onClick={onDeleteRequest}>
            刪除
          </button>
        </SheetFrame>
        <ConfirmModal
          open={confirming}
          title="刪除這筆？"
          confirmLabel="確認刪除"
          onCancel={() => {}}
          onConfirm={() => {}}
        />
      </I18nWrapper>
    )
  }

  it('returns focus to the trigger, not <body>, after close', () => {
    const { rerender } = render(<AmountSheet open={false} />)
    act(() => screen.getByText('fab').focus())
    rerender(<AmountSheet open />)
    expect(document.activeElement).toBe(screen.getByLabelText('金額'))

    rerender(<AmountSheet open={false} />)
    expect(document.activeElement).toBe(screen.getByText('fab'))
  })

  it('returns focus to the trigger when delete-confirm closes modal and sheet together', () => {
    const { rerender } = render(<AmountSheet open={false} />)
    act(() => screen.getByText('fab').focus())
    rerender(<AmountSheet open />)
    act(() => screen.getByText('刪除').focus())
    rerender(<AmountSheet open confirming />)
    expect(document.activeElement).toBe(screen.getByText('取消'))

    rerender(<AmountSheet open={false} confirming={false} />)
    expect(document.activeElement).toBe(screen.getByText('fab'))
  })
})
