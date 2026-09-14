import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { TranslationsProvider } from '@/lib/i18n/client'
import { en } from '@/lib/i18n/locales/en'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// #1197 leftovers: TransactionFeed error toast, DashboardFilterRow tap areas,
// the dashboard <h1>, AssetLinkField i18n, EditTextSheet focus handling.

// ── module mocks ─────────────────────────────────────────────────────────────
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/actions/transaction', () => ({ loadMoreTransactions: vi.fn(async () => []) }))
vi.mock('@/app/(dashboard)/_components/RealtimeProvider', () => ({ useRealtimeEvents: () => {} }))
vi.mock('@/lib/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({
    group: { id: 'g1', name: '我們家' },
    viewer: { id: 'u1', initial: '我', avatarUrl: null },
    partner: { id: 'u2', initial: '對', avatarUrl: null },
    viewerIsA: true,
    isPast: false,
  }),
}))
vi.mock('@/app/(dashboard)/_components/AvatarMenuProvider', () => ({ useAvatarMenu: () => ({ open: () => {} }) }))
vi.mock('@/app/(dashboard)/dashboard/_components/BrandHeaderHint', () => ({ BrandHeaderHint: () => null }))
const loadAsset = vi.fn()
vi.mock('@/actions/asset', () => ({ loadAsset: (id: string) => loadAsset(id) }))

import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { DashboardFilterRow } from '@/app/(dashboard)/dashboard/_components/DashboardFilterRow'
import { BrandHeader } from '@/app/(dashboard)/dashboard/_components/BrandHeader'
import { AssetLinkField } from '@/app/(dashboard)/dashboard/_components/AssetLinkField'
import { EditTextSheet } from '@/app/(dashboard)/_components/EditTextSheet'

// ── 1. TransactionFeed error toast ──────────────────────────────────────────
describe('TransactionFeed load failure (#1197 §2 / §4)', () => {
  it('announces the error with role="alert" on the --debit-soft / --debit-text surface, not white on --debit', async () => {
    const loader = vi.fn(async () => {
      throw new Error('boom')
    })
    render(
      <I18nWrapper>
        <TransactionFeed
          initial={[]}
          pageSize={20}
          emptyState={null}
          onItemClick={() => {}}
          filter={{} as never}
          loader={loader}
        />
      </I18nWrapper>,
    )
    const alert = await screen.findByRole('alert')
    expect(alert.className).toContain('bg-[var(--surface)]')
    const tint = alert.firstElementChild as HTMLElement
    expect(tint.className).toContain('bg-[var(--debit-soft)]')
    expect(tint.className).toContain('text-[var(--debit-text)]')
    // No white-on-debit left anywhere in the toast.
    expect(alert.outerHTML).not.toContain('text-white')
    expect(alert.outerHTML).not.toContain('var(--debit)"')
    expect(screen.getByRole('button', { name: zhTW.transactionFeed.closeAriaLabel })).toBeTruthy()
  })
})

// ── 2. DashboardFilterRow tap areas ─────────────────────────────────────────
describe('DashboardFilterRow tap areas (#1197 §6)', () => {
  const props = {
    payerFilter: 'all' as const,
    splitFilter: 'all' as const,
    onPayerChange: () => {},
    onSplitChange: () => {},
    viewerIsA: true,
    t: zhTW,
  }

  it('pads the overflow-x row top by exactly what it pulls back (layout-neutral) so ::before hit areas are not clipped', () => {
    const { container } = render(<DashboardFilterRow {...props} />)
    const row = container.firstElementChild as HTMLElement
    const cls = row.className.split(/\s+/)
    expect(cls).toContain('overflow-x-auto')
    expect(cls).toContain('pt-1.5')
    expect(cls).toContain('-mt-1.5')
    // Bottom padding must still cover the 6px the pseudos reach below.
    expect(cls).toContain('pb-2')
  })

  it('extends the 32px 篩選 chip to a 44px hit area with a ::before (6px up + down)', () => {
    render(<DashboardFilterRow {...props} />)
    const chip = screen.getByRole('button', { name: zhTW.dashboard.filterAriaLabel })
    const cls = chip.className.split(/\s+/)
    expect(cls).toContain('h-8')
    expect(cls).toContain('relative')
    expect(cls).toContain('before:absolute')
    expect(cls).toContain('before:-inset-y-1.5')
  })
})

// ── 3. dashboard <h1> ───────────────────────────────────────────────────────
describe('BrandHeader carries the dashboard h1 (#1197 §7)', () => {
  it('renders the ledger name as the single level-1 heading', () => {
    render(
      <I18nWrapper>
        <BrandHeader />
      </I18nWrapper>,
    )
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0].textContent).toBe('我們家')
  })
})

// ── 4. AssetLinkField i18n ──────────────────────────────────────────────────
describe('AssetLinkField copy goes through i18n', () => {
  beforeEach(() => {
    loadAsset.mockReset()
  })

  function renderEn(value: string | null) {
    return render(
      <TranslationsProvider value={en} locale="en">
        <AssetLinkField value={value} onChange={() => {}} open />
      </TranslationsProvider>,
    )
  }

  it('shows the no-link label in the active locale', () => {
    renderEn(null)
    expect(screen.getByText(en.assetPickerSheet.noneTitle)).toBeTruthy()
    expect(document.body.textContent).not.toContain('不關聯')
  })

  it('shows the loading label while the linked asset is fetched', () => {
    loadAsset.mockReturnValue(new Promise(() => {}))
    renderEn('a1')
    expect(screen.getByText(en.assetPickerSheet.loading)).toBeTruthy()
    expect(document.body.textContent).not.toContain('載入中')
  })

  it('suffixes a soft-deleted asset with the localized deleted label', async () => {
    loadAsset.mockResolvedValue({ name: 'Camera', deletedAt: '2026-09-01T00:00:00Z' })
    renderEn('a1')
    expect(await screen.findByText(en.assetPickerSheet.deletedSuffix)).toBeTruthy()
    expect(document.body.textContent).not.toContain('已刪除')
  })

  it('has a non-empty deletedSuffix in all four locales', async () => {
    const [{ zhCN }, { ja }] = await Promise.all([
      import('@/lib/i18n/locales/zh-CN'),
      import('@/lib/i18n/locales/ja'),
    ])
    for (const loc of [zhTW, zhCN, en, ja]) {
      expect(loc.assetPickerSheet.deletedSuffix.trim()).not.toBe('')
    }
  })
})

// ── 5. EditTextSheet focus ──────────────────────────────────────────────────
describe('EditTextSheet focus trap + closed state', () => {
  // jsdom has no layout: model "attached = visible" for useFocusTrap's filter.
  const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return (this as HTMLElement).isConnected ? (this as HTMLElement).parentElement : null
      },
    })
  })
  afterAll(() => {
    if (desc) Object.defineProperty(HTMLElement.prototype, 'offsetParent', desc)
  })
  let backSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
  })
  afterEach(() => backSpy.mockRestore())

  function Host() {
    const [open, setOpen] = useState(false)
    return (
      <I18nWrapper>
        <button type="button" onClick={() => setOpen(true)}>帳本名稱</button>
        <EditTextSheet
          open={open}
          title="帳本名稱"
          initialValue="我們家"
          onSubmit={async () => {}}
          onClose={() => setOpen(false)}
        />
      </I18nWrapper>
    )
  }

  function pressTab(shiftKey = false): boolean {
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
    act(() => {
      window.dispatchEvent(e)
    })
    return e.defaultPrevented
  }

  it('is inert with no dialog role while closed', () => {
    render(<Host />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const input = document.querySelector('input') as HTMLInputElement
    expect(input.closest('[inert]')).not.toBeNull()
  })

  it('traps Tab inside the open sheet (wraps last → first, first → last)', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: '帳本名稱' }))
    const dialog = screen.getByRole('dialog', { name: '帳本名稱' })
    expect(dialog.hasAttribute('inert')).toBe(false)
    const cancel = screen.getByRole('button', { name: zhTW.common.cancel })
    const input = dialog.querySelector('input') as HTMLInputElement
    // 完成 is enabled (value is non-empty), input is the last focusable.
    input.focus()
    expect(pressTab()).toBe(true)
    expect(document.activeElement).toBe(cancel)
    expect(pressTab(true)).toBe(true)
    expect(document.activeElement).toBe(input)
  })

  // Restore needs PR #1230's useFocusTrap change: on main the trap reads its
  // restore target in a passive effect, after useFocusAndSelectOnOpen (a
  // layout effect) has already moved focus into the input, so it records the
  // input instead of the trigger. #1230 moves that read into a layout effect
  // without changing the hook's call signature. Unskip once #1230 is on main.
  it.skip('restores focus to the trigger after Escape (needs #1230)', async () => {
    render(<Host />)
    const trigger = screen.getByRole('button', { name: '帳本名稱' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeTruthy()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })
})
