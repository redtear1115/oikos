import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { I18nWrapper } from './_mocks/i18n'

// #1183 — form sheets ask before a backdrop tap / Escape / Back discards input.

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
  // Never settles: autocomplete data is irrelevant here and a late setState
  // would only add act() noise.
  getDescriptionSuggestions: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/actions/tripExpense', () => ({
  createTripExpense: vi.fn(),
  editTripExpense: vi.fn(),
  softDeleteTripExpense: vi.fn(),
}))
vi.mock('@/actions/recurringExpense', () => ({ editAndConfirmPending: vi.fn() }))
vi.mock('@/actions/asset', () => ({
  loadAssetsForPicker: vi.fn(() => Promise.resolve([])),
  getCarAssets: vi.fn(() => Promise.resolve([])),
  getChildAssets: vi.fn(() => Promise.resolve([])),
  createInsurance: vi.fn(),
  editInsurance: vi.fn(),
  softDeleteAsset: vi.fn(),
}))
vi.mock('@/actions/trip', () => ({ endTrip: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { SheetFrame } from '@/app/(dashboard)/_components/SheetFrame'
import { useDirtyCheck } from '@/app/(dashboard)/_components/useUnsavedChangesGuard'
import { useEscapeToClose } from '@/app/(dashboard)/_components/useEscapeToClose'
import { EditTextSheet } from '@/app/(dashboard)/_components/EditTextSheet'
import { AddSheet } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { InsuranceSheetBody } from '@/app/(dashboard)/assets/_components/AssetSheet/InsuranceSheetBody'
import { EndTripSheet } from '@/app/(dashboard)/trips/[id]/_components/EndTripSheet'

const CONFIRM_TITLE = '剛剛填的內容還沒儲存'

// jsdom has no layout; model "attached = visible" for useFocusTrap.
const offsetParentDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
beforeAll(() => {
  // AddSheet's ScrollFadeRow observes its size; jsdom has no ResizeObserver.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
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

// jsdom takes useEscapeToClose's History API path; history.back() emits the
// popstate echo the hook expects.
let backSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
})
afterEach(() => {
  backSpy.mockRestore()
})

function sheetBackdrop(): HTMLElement {
  // The sheet's backdrop renders first; a ConfirmModal's backdrop is portalled after it.
  return document.querySelectorAll<HTMLElement>('.z-sheet-backdrop')[0]
}
function tapBackdrop() {
  act(() => sheetBackdrop().click())
}
function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  })
}
function pressBack() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}
const confirmDialog = () => screen.queryByRole('dialog', { name: CONFIRM_TITLE })

/**
 * Minimal SheetFrame form in the shape every real sheet uses: stays mounted,
 * prefills in an effect on `open`, and has an explicit 取消 button.
 */
function FormSheet({ open, onClose, prefill = '' }: { open: boolean; onClose: () => void; prefill?: string }) {
  const [text, setText] = useState('stale value from last session')
  useEffect(() => {
    if (open) setText(prefill)
  }, [open, prefill])
  const isDirty = useDirtyCheck(open, { text })
  return (
    <SheetFrame open={open} onClose={onClose} isDirty={isDirty} ariaLabel="記一筆">
      <button type="button" onClick={onClose}>取消</button>
      <input aria-label="描述" value={text} onChange={(e) => setText(e.target.value)} />
    </SheetFrame>
  )
}

function Host({ prefill }: { prefill?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <I18nWrapper>
      <button type="button" onClick={() => setOpen(true)}>fab</button>
      <FormSheet open={open} onClose={() => setOpen(false)} prefill={prefill} />
    </I18nWrapper>
  )
}

function openHost(prefill?: string) {
  render(<Host prefill={prefill} />)
  const fab = screen.getByText('fab')
  act(() => fab.focus())
  act(() => fab.click())
  return fab
}
const sheetOpen = () => screen.queryByRole('dialog', { name: '記一筆' }) !== null

describe('SheetFrame isDirty guard', () => {
  it('closes straight away when nothing changed, even with an effect prefill', () => {
    openHost('午餐')
    expect(screen.getByLabelText('描述')).toHaveValue('午餐')
    tapBackdrop()
    expect(confirmDialog()).toBeNull()
    expect(sheetOpen()).toBe(false)
  })

  it('counts typing back to the opening value as not dirty', () => {
    openHost('午餐')
    const input = screen.getByLabelText('描述')
    fireEvent.change(input, { target: { value: '午餐加飲料' } })
    fireEvent.change(input, { target: { value: '午餐' } })
    tapBackdrop()
    expect(sheetOpen()).toBe(false)
  })

  it('asks on backdrop tap when dirty; keep editing leaves the input intact', () => {
    openHost()
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: '晚餐' } })
    tapBackdrop()
    expect(confirmDialog()).toBeInTheDocument()
    expect(sheetOpen()).toBe(true)

    act(() => screen.getByRole('button', { name: '繼續填寫' }).click())
    expect(confirmDialog()).toBeNull()
    expect(sheetOpen()).toBe(true)
    expect(screen.getByLabelText('描述')).toHaveValue('晚餐')
  })

  it('discard closes the sheet and returns focus to the trigger', () => {
    const fab = openHost()
    const input = screen.getByLabelText('描述')
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '晚餐' } })
    tapBackdrop()
    act(() => screen.getByRole('button', { name: '捨棄' }).click())
    expect(confirmDialog()).toBeNull()
    expect(sheetOpen()).toBe(false)
    expect(document.activeElement).toBe(fab)
  })

  it('does not intercept the explicit 取消 button', () => {
    openHost()
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: '晚餐' } })
    act(() => screen.getByText('取消').click())
    expect(confirmDialog()).toBeNull()
    expect(sheetOpen()).toBe(false)
  })

  it('asks on Escape, and Escape still reaches the sheet after keep editing', () => {
    openHost()
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: '晚餐' } })
    pressEscape()
    expect(confirmDialog()).toBeInTheDocument()
    // Escape on the confirm = keep editing.
    pressEscape()
    expect(confirmDialog()).toBeNull()
    expect(sheetOpen()).toBe(true)

    pressEscape()
    expect(confirmDialog()).toBeInTheDocument()
  })

  it('asks on system Back, and a later Back still reaches the sheet', () => {
    openHost()
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: '晚餐' } })
    pressBack()
    expect(confirmDialog()).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: '繼續填寫' }).click())
    expect(sheetOpen()).toBe(true)

    pressBack()
    expect(confirmDialog()).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: '捨棄' }).click())
    expect(sheetOpen()).toBe(false)
  })

  it('re-baselines on the next open', () => {
    openHost()
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: '晚餐' } })
    act(() => screen.getByText('取消').click())
    act(() => screen.getByText('fab').click())
    tapBackdrop()
    expect(confirmDialog()).toBeNull()
    expect(sheetOpen()).toBe(false)
  })
})

describe('useEscapeToClose declined close (CloseWatcher path)', () => {
  class FakeCloseWatcher extends EventTarget {
    static live: FakeCloseWatcher[] = []
    onclose: ((e: Event) => void) | null = null
    constructor() {
      super()
      FakeCloseWatcher.live.push(this)
    }
    destroy() {
      FakeCloseWatcher.live = FakeCloseWatcher.live.filter((w) => w !== this)
    }
    /** What the browser does on Esc / Back: fire the topmost watcher, which is then spent. */
    static requestClose() {
      const top = FakeCloseWatcher.live.pop()
      top?.onclose?.(new Event('close'))
    }
  }

  beforeEach(() => {
    FakeCloseWatcher.live = []
    ;(globalThis as { CloseWatcher?: unknown }).CloseWatcher = FakeCloseWatcher
  })
  afterEach(() => {
    delete (globalThis as { CloseWatcher?: unknown }).CloseWatcher
  })

  it('re-arms a fresh watcher when onClose returns false', () => {
    const onClose = vi.fn(() => false)
    renderHook(() => useEscapeToClose(true, onClose))
    act(() => FakeCloseWatcher.requestClose())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(FakeCloseWatcher.live).toHaveLength(1)
    act(() => FakeCloseWatcher.requestClose())
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('does not re-arm after a normal close', () => {
    const onClose = vi.fn()
    renderHook(() => useEscapeToClose(true, onClose))
    act(() => FakeCloseWatcher.requestClose())
    expect(FakeCloseWatcher.live).toHaveLength(0)
  })
})

// ── Real sheets: one per family ────────────────────────────────────────────

describe('AddSheet (SheetFrame family)', () => {
  function AddHost() {
    const [open, setOpen] = useState(false)
    return (
      <I18nWrapper>
        <button type="button" onClick={() => setOpen(true)}>fab</button>
        <AddSheet open={open} onClose={() => setOpen(false)} />
      </I18nWrapper>
    )
  }
  const addOpen = () => screen.queryByRole('dialog', { name: '新增紀錄' }) !== null

  function openAdd() {
    render(<AddHost />)
    act(() => screen.getByText('fab').click())
  }

  it('closes on backdrop when untouched', () => {
    openAdd()
    expect(addOpen()).toBe(true)
    tapBackdrop()
    expect(confirmDialog()).toBeNull()
    expect(addOpen()).toBe(false)
  })

  it('asks on backdrop once an amount is typed', () => {
    openAdd()
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '240' } })
    tapBackdrop()
    expect(confirmDialog()).toBeInTheDocument()
    expect(addOpen()).toBe(true)
  })
})

describe('InsuranceSheetBody (SheetShell family)', () => {
  function InsHost() {
    const [open, setOpen] = useState(false)
    return (
      <I18nWrapper>
        <button type="button" onClick={() => setOpen(true)}>fab</button>
        <InsuranceSheetBody open={open} onClose={() => setOpen(false)} typePickerSlot={null} />
      </I18nWrapper>
    )
  }

  it('closes when untouched, asks once a field is filled', async () => {
    render(<InsHost />)
    act(() => screen.getByText('fab').click())
    const dialog = screen.getAllByRole('dialog')[0]
    tapBackdrop()
    expect(confirmDialog()).toBeNull()
    expect(dialog).not.toHaveAttribute('role')

    act(() => screen.getByText('fab').click())
    const nameInput = screen.getAllByRole('textbox')[0]
    fireEvent.change(nameInput, { target: { value: '國泰醫療險' } })
    tapBackdrop()
    expect(confirmDialog()).toBeInTheDocument()
  })
})

describe('EndTripSheet (SheetShell family, prefilled)', () => {
  it('treats the suggested end date as the baseline', () => {
    function EndHost() {
      const [open, setOpen] = useState(true)
      return (
        <I18nWrapper>
          <EndTripSheet
            open={open}
            tripId="t-1"
            startDate="2026-09-01"
            suggestedEndDate="2026-09-10"
            onClose={() => setOpen(false)}
          />
        </I18nWrapper>
      )
    }
    const { container } = render(<EndHost />)
    const date = container.ownerDocument.querySelector<HTMLInputElement>('input[type="date"]')!
    expect(date).toHaveValue('2026-09-10')
    fireEvent.change(date, { target: { value: '2026-09-12' } })
    tapBackdrop()
    expect(confirmDialog()).toBeInTheDocument()
  })
})

describe('EditTextSheet (hand-rolled panel)', () => {
  function EditHost() {
    const [open, setOpen] = useState(false)
    return (
      <I18nWrapper>
        <button type="button" onClick={() => setOpen(true)}>rename</button>
        <EditTextSheet
          open={open}
          title="帳本名稱"
          initialValue="我們家"
          onSubmit={vi.fn(() => Promise.resolve())}
          onClose={() => setOpen(false)}
        />
      </I18nWrapper>
    )
  }
  const editOpen = () => screen.queryByRole('dialog', { name: '帳本名稱' }) !== null

  it('closes when the value is unchanged', () => {
    render(<EditHost />)
    act(() => screen.getByText('rename').click())
    tapBackdrop()
    expect(editOpen()).toBe(false)
  })

  it('asks when edited, and discard restores focus to the row', () => {
    render(<EditHost />)
    const trigger = screen.getByText('rename')
    act(() => trigger.focus())
    act(() => trigger.click())
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '小窩' } })
    tapBackdrop()
    expect(confirmDialog()).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: '捨棄' }).click())
    expect(editOpen()).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })
})
