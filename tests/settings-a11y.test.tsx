import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// #1172 — /settings: page h1, split-ratio slider name, and focus management
// for the two hand-rolled destructive dialogs (remove partner, leave ledger).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

const proposeSwap = vi.fn()
vi.mock('@/actions/membership', () => ({
  proposeSwap: () => proposeSwap(),
  leaveGroup: vi.fn(),
  removePartner: vi.fn(),
  cancelSwap: vi.fn(),
  confirmSwap: vi.fn(),
}))
vi.mock('@/actions/group', () => ({ updateGroupSplitRatio: vi.fn() }))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({ viewerIsA: true }),
}))

// SettingsContent is an async server component; stub its server-only
// translations and the client children that pull in unrelated providers.
vi.mock('@/lib/i18n/t', () => ({ getTranslations: async () => zhTW }))
vi.mock('@/app/(dashboard)/settings/_components/QuickAccessRow', () => ({ QuickAccessRow: () => null }))
vi.mock('@/app/(dashboard)/settings/_components/InstallGuideRow', () => ({ InstallGuideRow: () => null }))
vi.mock('@/app/(dashboard)/settings/_components/OfflineBrowsingToggle', () => ({ OfflineBrowsingToggle: () => null }))
vi.mock('@/app/(dashboard)/settings/_components/LogoutButton', () => ({ LogoutButton: () => null }))
vi.mock('@/app/(dashboard)/settings/_components/DeleteAccountButton', () => ({ DeleteAccountButton: () => null }))

import { SettingsContent } from '@/app/(dashboard)/settings/_components/SettingsContent'
import { SplitRatioSection } from '@/app/(dashboard)/settings/_components/sections/SplitRatioSection'
import { RemovePartnerFlow } from '@/app/(dashboard)/settings/_components/RemovePartnerFlow'
import { LeaveGroupFlow } from '@/app/(dashboard)/settings/_components/LeaveGroupFlow'

// jsdom has no layout, so `offsetParent` is always null and useFocusTrap's
// visibility filter would treat every control as hidden. Model "attached =
// visible", as in sheet-focus-stack.test.tsx.
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
let backSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  proposeSwap.mockReset()
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
})
afterEach(() => {
  backSpy.mockRestore()
})

function pressTab(shiftKey = false): boolean {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
  act(() => {
    window.dispatchEvent(e)
  })
  return e.defaultPrevented
}

describe('SettingsContent heading', () => {
  it('renders the page title as the single h1', async () => {
    const el = await SettingsContent({
      viewer: { id: 'v', displayName: '小明', email: 'a@b.c', avatarUrl: null },
      partner: null,
      appVersion: '0.0.0',
      currentLocale: 'zh-TW',
      viewerIsMemberA: true,
      groupBalance: 0,
      pendingSwap: null,
      tripSummary: { active: 0, past: 0 },
    })
    render(<I18nWrapper>{el}</I18nWrapper>)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('設定')
  })
})

describe('SplitRatioSection slider', () => {
  it('has an accessible name and a value text naming both shares', () => {
    render(
      <I18nWrapper>
        <SplitRatioSection viewerName="小明" partnerName="小華" initialRatioA={60} />
      </I18nWrapper>,
    )
    const slider = screen.getByRole('slider', { name: '預設分攤比例' })
    expect(slider).toHaveAttribute('aria-valuetext', '小明（我）60%, 小華（對方）40%')
  })
})

/** Page-like harness: a trigger row that opens the flow, like DangerZone. */
function RemoveHarness() {
  const [open, setOpen] = useState(false)
  return (
    <I18nWrapper>
      <button type="button" onClick={() => setOpen(true)}>移除對方</button>
      <RemovePartnerFlow open={open} onClose={() => setOpen(false)} partnerName="小華" />
    </I18nWrapper>
  )
}

function LeaveHarness({ viewerIsMemberA = false }: { viewerIsMemberA?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <I18nWrapper>
      <button type="button" onClick={() => setOpen(true)}>離開帳本</button>
      <LeaveGroupFlow
        open={open}
        onClose={() => setOpen(false)}
        viewerIsMemberA={viewerIsMemberA}
        viewerName="小明"
        partnerName="小華"
        groupBalance={0}
      />
    </I18nWrapper>
  )
}

function openFrom(label: string) {
  const trigger = screen.getByText(label)
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}

describe('RemovePartnerFlow focus management', () => {
  it('is inert with no dialog semantics while closed', () => {
    render(<RemoveHarness />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const close = screen.getByLabelText(zhTW.settings.dangerZone.flow.close, { selector: 'button' })
    expect(close.closest('[inert]')).not.toBeNull()
  })

  it('moves focus into a named dialog, traps Tab, and restores focus on close', () => {
    render(<RemoveHarness />)
    const trigger = openFrom('移除對方')

    const title = zhTW.settings.dangerZone.removeFlow.title.replaceAll('{partner}', '小華')
    const dialog = screen.getByRole('dialog', { name: title })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).not.toHaveAttribute('inert')
    expect(document.activeElement).toBe(dialog)

    // Shift+Tab from the first control wraps to the last one inside the panel.
    const close = screen.getByRole('button', { name: zhTW.settings.dangerZone.flow.close })
    close.focus()
    expect(pressTab(true)).toBe(true)
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(close)

    fireEvent.click(close)
    expect(document.activeElement).toBe(trigger)
  })

  it('labels the type-to-confirm input with its prompt', () => {
    render(<RemoveHarness />)
    openFrom('移除對方')
    const input = screen.getByRole('textbox')
    const label = document.querySelector(`label[for="${input.id}"]`)
    expect(label).not.toBeNull()
    expect(label).toHaveTextContent(zhTW.settings.dangerZone.removeFlow.confirmText)
  })

  it('gives the ✕ a 44px hit area', () => {
    render(<RemoveHarness />)
    const close = screen.getByLabelText(zhTW.settings.dangerZone.flow.close, { selector: 'button' })
    expect(close.className).toMatch(/\bw-11\b/)
    expect(close.className).toMatch(/\bh-11\b/)
  })
})

describe('LeaveGroupFlow focus management', () => {
  const flow = zhTW.settings.dangerZone.flow

  it('names the dialog by the current card title and restores focus on close', () => {
    render(<LeaveHarness />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const trigger = openFrom('離開帳本')

    const dialog = screen.getByRole('dialog', { name: flow.card1.titleB })
    expect(document.activeElement).toBe(dialog)

    fireEvent.click(screen.getByText(flow.next))
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2 }).id).toBe(
      screen.getByRole('dialog').getAttribute('aria-labelledby'),
    )

    fireEvent.click(screen.getByRole('button', { name: flow.close }))
    expect(document.activeElement).toBe(trigger)
  })

  it('pulls focus back into the panel when a step change unmounts the focused control', async () => {
    proposeSwap.mockResolvedValue(undefined)
    render(<LeaveHarness viewerIsMemberA />)
    openFrom('離開帳本')
    fireEvent.click(screen.getByText(flow.next))
    fireEvent.click(screen.getByText(flow.next))
    fireEvent.click(screen.getByText(flow.next))

    const yes = screen.getByText(flow.card4.yesASwap)
    yes.focus()
    fireEvent.click(yes)

    await waitFor(() => expect(screen.getByText(flow.swapProposed.ok)).toBeTruthy())
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('labels the final type-to-confirm input', () => {
    render(<LeaveHarness />)
    openFrom('離開帳本')
    fireEvent.click(screen.getByText(flow.next))
    fireEvent.click(screen.getByText(flow.next))
    fireEvent.click(screen.getByText(flow.next))
    fireEvent.click(screen.getByText(flow.card4.yesB))
    const input = screen.getByRole('textbox')
    const label = document.querySelector(`label[for="${input.id}"]`)
    expect(label).toHaveTextContent(flow.finalConfirm.confirmText)
  })
})
