import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { SheetFrame } from '@/app/(dashboard)/_components/SheetFrame'
import { useFocusTrap } from '@/app/(dashboard)/_components/useFocusTrap'
import { useFocusAndSelectOnOpen } from '@/app/(dashboard)/_components/useFocusAndSelectOnOpen'
import { BottomNav, FAB_ID } from '@/app/(dashboard)/_components/BottomNav'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'

// #1256 — the trigger that opened the sheet is not always the same DOM node
// when the sheet closes. Every dashboard surface renders the FAB as
// `{!hideFab && <button…>}` with `hideFab` tied to the sheet's own open state,
// so opening the sheet *unmounts* the FAB and closing it mounts a brand-new
// button. The node useFocusTrap recorded at activation is detached by restore
// time; focus() on a detached node is a silent no-op, and #1242's
// "no trap underneath → don't guess" fallback then leaves focus on <body>.
//
// jsdom boundary (what these tests cannot see):
//   - `inert` is parsed as an attribute but not *enforced*: jsdom will happily
//     focus a control inside an inert subtree. The inert guard in
//     resolveRestoreTarget is therefore asserted structurally (we check where
//     focus landed), not by relying on the engine to refuse the focus.
//   - real unmount timing, the iOS soft-keyboard blur in SheetFrame, and
//     `:focus-visible` ring painting are all outside jsdom.
// Failure mode if this regresses: nothing throws, the screen looks right and
// every other test stays green — only keyboard users notice, because each
// Escape out of a sheet drops them back at the top of the document and the
// next Tab restarts from the page header.

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// jsdom has no layout, so `offsetParent` is always null and useFocusTrap's
// visibility filter would treat every control as hidden. Model "attached =
// visible", as in sheet-focus-stack.test.tsx.
const offsetParentDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
beforeAll(() => {
  // BottomNav renders HomeIndicator, which probes display-mode; jsdom has no
  // matchMedia.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }))
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

// useEscapeToClose (via SheetBackdrop) takes its History API path in jsdom.
let backSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
})
afterEach(() => {
  backSpy.mockRestore()
})

describe('restore focus when the trigger node is replaced (#1256)', () => {
  /** The dashboard shape: FAB is conditionally rendered on the sheet's own
   *  open state, so it is a *different node* before and after. */
  function FabAndSheet({ open }: { open: boolean }) {
    const inputRef = useRef<HTMLInputElement>(null)
    useFocusAndSelectOnOpen(open, inputRef)
    return (
      <I18nWrapper>
        {!open && (
          <button id="oik-fab" type="button" aria-label="新增一筆">
            +
          </button>
        )}
        <SheetFrame open={open} onClose={() => {}} ariaLabel="記一筆">
          <input ref={inputRef} aria-label="金額" />
        </SheetFrame>
      </I18nWrapper>
    )
  }

  it('focuses the re-mounted trigger, not <body>', () => {
    const { rerender } = render(<FabAndSheet open={false} />)
    const firstFab = screen.getByLabelText('新增一筆')
    act(() => firstFab.focus())

    rerender(<FabAndSheet open />)
    expect(document.activeElement).toBe(screen.getByLabelText('金額'))
    // The premise of the bug: the recorded trigger is gone from the document.
    expect(firstFab.isConnected).toBe(false)

    rerender(<FabAndSheet open={false} />)
    const secondFab = screen.getByLabelText('新增一筆')
    expect(secondFab).not.toBe(firstFab) // a genuinely new node
    expect(document.activeElement).toBe(secondFab)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('restores with preventScroll, like the same-node path (#1242)', () => {
    const { rerender } = render(<FabAndSheet open={false} />)
    act(() => screen.getByLabelText('新增一筆').focus())
    rerender(<FabAndSheet open />)

    const spy = vi.spyOn(HTMLElement.prototype, 'focus')
    rerender(<FabAndSheet open={false} />)
    expect(spy).toHaveBeenCalledWith({ preventScroll: true })
    spy.mockRestore()
  })

  it('leaves focus alone when the id does not come back (#1242 fallback intact)', () => {
    // A row that opened its sheet and was deleted from inside it: the id is
    // recorded, but nothing in the document carries it any more, and there is
    // no trap underneath to fall back into.
    function RowAndSheet({ open, showRow }: { open: boolean; showRow: boolean }) {
      return (
        <I18nWrapper>
          {showRow && (
            <button id="row-42" type="button">
              row
            </button>
          )}
          <SheetFrame open={open} onClose={() => {}} ariaLabel="編輯">
            <button type="button">刪除</button>
          </SheetFrame>
        </I18nWrapper>
      )
    }
    const { rerender } = render(<RowAndSheet open={false} showRow />)
    act(() => screen.getByText('row').focus())
    rerender(<RowAndSheet open showRow />)
    act(() => screen.getByText('刪除').focus())

    const spy = vi.spyOn(HTMLElement.prototype, 'focus')
    rerender(<RowAndSheet open={false} showRow={false} />)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('does not restore into an element that came back inside an inert subtree', () => {
    // The id resolves again, but only to a control parked inside a closed
    // (inert) sheet. Focusing it would be a no-op in a real browser and would
    // read as "focus vanished", so the trap must treat it as unresolved.
    function Harness({ open }: { open: boolean }) {
      const panelRef = useRef<HTMLDivElement>(null)
      useFocusTrap(open, panelRef)
      return (
        <I18nWrapper>
          {!open && (
            <button id="ghost" type="button">
              ghost
            </button>
          )}
          {open && (
            <div inert>
              <button id="ghost" type="button">
                ghost-in-closed-sheet
              </button>
            </div>
          )}
          <div ref={panelRef}>
            <button type="button">inside</button>
          </div>
        </I18nWrapper>
      )
    }
    // Keep the id resolvable while the trap closes: the inert copy is the only
    // `#ghost` in the document at restore time.
    function OpenThenInert({ open }: { open: boolean }) {
      return <Harness open={open} />
    }
    const { rerender } = render(<OpenThenInert open={false} />)
    act(() => screen.getByText('ghost').focus())
    rerender(<OpenThenInert open />)
    act(() => screen.getByText('inside').focus())

    const inertGhost = screen.getByText('ghost-in-closed-sheet')
    const spy = vi.spyOn(inertGhost, 'focus')
    rerender(<OpenThenInert open={false} />)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('BottomNav FAB keeps a stable identity across remounts (#1256)', () => {
  it('stamps the same id on the FAB every time it mounts', () => {
    const { rerender, unmount } = render(
      <I18nWrapper>
        <BottomNav onAddClick={() => {}} />
      </I18nWrapper>,
    )
    const fab = screen.getByLabelText('新增一筆')
    expect(fab.id).toBe(FAB_ID)

    // Hidden while a sheet is open (the real call sites pass `hideFab={sheetOpen}`)…
    rerender(
      <I18nWrapper>
        <BottomNav onAddClick={() => {}} hideFab />
      </I18nWrapper>,
    )
    expect(screen.queryByLabelText('新增一筆')).toBeNull()

    // …and back with the same id, which is what useFocusTrap re-queries by.
    rerender(
      <I18nWrapper>
        <BottomNav onAddClick={() => {}} />
      </I18nWrapper>,
    )
    const again = screen.getByLabelText('新增一筆')
    expect(again).not.toBe(fab)
    expect(again.id).toBe(FAB_ID)
    unmount()
  })

  it('stamps the same id on the wide `fabContent` variant', () => {
    render(
      <I18nWrapper>
        <BottomNav onAddClick={() => {}} fabContent={<span>加油</span>} />
      </I18nWrapper>,
    )
    expect(screen.getByText('加油').closest('button')?.id).toBe(FAB_ID)
  })
})

describe('ConfirmModal buttons use the design-system focus ring (#1256)', () => {
  it('opts both buttons into .oik-btn', () => {
    // `.oik-btn:focus-visible` is the 2px --focus-ring-color ring (globals.css).
    // jsdom paints nothing, so this can only assert the opt-in class; the ring
    // itself has to be seen in a browser. Failure mode: the buttons fall back to
    // the engine's 1px blue outline — nothing errors, it just becomes the only
    // non-palette colour on screen, and only on keyboard focus.
    render(
      <I18nWrapper>
        <ConfirmModal open title="刪除這筆？" confirmLabel="確認刪除" onCancel={() => {}} onConfirm={() => {}} />
      </I18nWrapper>,
    )
    expect(screen.getByText('確認刪除')).toHaveClass('oik-btn')
    expect(screen.getByText('取消')).toHaveClass('oik-btn')
  })
})
