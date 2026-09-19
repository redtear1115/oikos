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

  // #1252: Home / End are optional in the WAI-ARIA pattern and #1242 left them
  // out. Without them the keys fall through to the scroll container.
  it('Home and End jump to the first and last radio and select it', () => {
    render(<SplitHarness />)
    const radios = screen.getAllByRole('radio')
    act(() => radios[0].focus())

    fireEvent.keyDown(radios[0], { key: 'End' })
    expect(document.activeElement).toBe(radios[2])
    expect(radios[2]).toHaveAttribute('aria-checked', 'true')
    expect(radios[2]).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(radios[2], { key: 'Home' })
    expect(document.activeElement).toBe(radios[0])
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
  })

  it('does not swallow Home / End pressed on the nested split slider', () => {
    render(<SplitHarness />)
    const slider = screen.getByRole('slider')
    expect(fireEvent.keyDown(slider, { key: 'Home' })).toBe(true)
    expect(fireEvent.keyDown(slider, { key: 'End' })).toBe(true)
  })

  it('leaves other keys and non-radio targets alone (the nested split slider keeps its arrows)', () => {
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

  it.each([
    ['half' as const, 0],
    ['all_theirs' as const, 2],
    // 'weighted' is pickable per record but has no row in settings, so nothing
    // in the group is checked. Without a fallback Tab stop the whole group is
    // unreachable by keyboard — it looks completely normal (#1242 follow-up).
    ['weighted' as const, 0],
  ])('keeps exactly one Tab stop in the settings split group when current=%s', (current, expectedIndex) => {
    render(
      <I18nWrapper>
        <SplitTypeSection current={current} isSolo={false} />
      </I18nWrapper>,
    )
    const radios = screen.getAllByRole('radio')
    const tabStops = radios.filter((r) => r.getAttribute('tabindex') === '0')
    expect(tabStops).toHaveLength(1)
    expect(tabStops[0]).toBe(radios[expectedIndex])
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(current === 'weighted' ? 0 : 1)
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

  // #1252: #1242 kept focus put during the save but killed the arrow keys —
  // every radio was `aria-disabled`, so the navigable list came back empty and
  // nothing moved. Silent: no announcement, no visible change, and on a fast
  // save it is over before the user can tell it from a dropped keypress.
  it('keeps arrow keys moving focus while the group is aria-busy, without changing the selection', async () => {
    let resolveSave: () => void = () => {}
    updateDefaultSplitType.mockImplementation(() => new Promise<void>((r) => { resolveSave = r }))
    render(
      <I18nWrapper>
        <SplitTypeSection current="half" isSolo={false} />
      </I18nWrapper>,
    )
    const group = screen.getByRole('radiogroup')
    const radios = screen.getAllByRole('radio')
    act(() => radios[0].focus())
    fireEvent.keyDown(radios[0], { key: 'ArrowDown' })
    await waitFor(() => expect(group).toHaveAttribute('aria-busy', 'true'))

    fireEvent.keyDown(radios[1], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(radios[2])
    fireEvent.keyDown(radios[2], { key: 'Home' })
    expect(document.activeElement).toBe(radios[0])
    // Focus moved; the pending save is still the only one in flight.
    expect(updateDefaultSplitType).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('radio', { checked: true })).toBe(radios[0])

    await act(async () => resolveSave())
    expect(group).not.toHaveAttribute('aria-busy')
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

  // #1312 — the banner used to be `absolute top-4` against the panel, i.e. on
  // top of cancel / save, and never cleared until the next save: forgetting
  // the description left the sheet stuck. jsdom has no layout, so pin the two
  // things that caused it: the banner is in flow after the header row, and
  // editing the offending field clears it.
  it('renders the banner in flow after the cancel / save row, not overlaid on it (#1312)', async () => {
    renderSheet()
    fireEvent.change(screen.getByLabelText(zhTW.addSheet.amount), { target: { value: '120' } })
    const save = screen.getByRole('button', { name: zhTW.common.save })
    fireEvent.click(save)

    const banner = await screen.findByRole('alert')
    expect(banner.className).not.toMatch(/\b(absolute|fixed)\b/)
    expect(save.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('combobox').compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it('clears the description error once the description is typed (#1312)', async () => {
    renderSheet()
    fireEvent.change(screen.getByLabelText(zhTW.addSheet.amount), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: zhTW.common.save }))
    await screen.findByRole('alert')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '午餐' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-invalid')
  })

  it('keeps the error while an unrelated field changes (#1312)', async () => {
    renderSheet()
    fireEvent.change(screen.getByLabelText(zhTW.addSheet.amount), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: zhTW.common.save }))
    await screen.findByRole('alert')

    fireEvent.change(screen.getByLabelText(zhTW.addSheet.amount), { target: { value: '150' } })
    expect(screen.getByRole('alert')).toHaveTextContent(zhTW.addSheet.errors.descriptionRequired)
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
