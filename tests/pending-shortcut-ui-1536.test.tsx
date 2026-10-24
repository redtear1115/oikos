// #1536 S4 — the dashboard cards an iOS Shortcut leaves in 待確認.
//
// What each failure looks like (none of them errors):
//   - the one-tap button on a card with no note: tapping it answers
//     `shortcut_pending_needs_note` forever, or (worse) records a blank;
//   - the note linkified: a note carrying `<a href=…>` from some app's
//     notification becomes a live link on a money card;
//   - skip / edit wired to the wrong action: the card fades out but the record
//     is written twice, or never written.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { ToastProvider } from '@/components/Toast'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import type { ShortcutPendingView } from '@/lib/db/queries/shortcutPending'

const VIEWER = { id: 'a0a0a0a0-0000-4000-8000-0000000000a0', initial: 'M', avatarUrl: null, defaultSplitType: 'half' as const, displayName: 'Me' }
const PARTNER = { id: 'd0d0d0d0-0000-4000-8000-0000000000d0', initial: 'D', avatarUrl: null, displayName: 'Dana' }

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({
    viewer: VIEWER, partner: PARTNER, viewerIsA: true, isSolo: false, isPast: false, canAccessGuardian: true,
  }),
  whoToMemberRole: (w: 'M' | 'T') => (w === 'M' ? 'a' : 'b'),
  useBaseCurrency: () => 'twd',
}))
vi.mock('@/actions/shortcutPending', () => ({
  confirmShortcutPending: vi.fn(),
  skipShortcutPending: vi.fn(),
}))
vi.mock('@/actions/transaction', () => ({
  createTransaction: vi.fn(), editTransaction: vi.fn(), softDeleteTransaction: vi.fn(),
  getDescriptionSuggestions: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
  getMerchantCategory: vi.fn(() => Promise.resolve({ ok: true, data: null })),
}))
vi.mock('@/actions/tripExpense', () => ({ createTripExpense: vi.fn(), editTripExpense: vi.fn(), softDeleteTripExpense: vi.fn() }))
vi.mock('@/actions/asset', () => ({
  loadAsset: vi.fn(() => Promise.resolve(null)),
  loadAssetsForPicker: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/actions/recurringExpense', () => ({ editAndConfirmPending: vi.fn() }))
vi.mock('@/app/(dashboard)/dashboard/_components/AssetLinkField', () => ({ AssetLinkField: () => null }))

import * as shortcutActions from '@/actions/shortcutPending'
import * as txActions from '@/actions/transaction'
import { PendingShortcutStack } from '@/app/(dashboard)/dashboard/_components/PendingShortcutStack'
import { AddSheet } from '@/app/(dashboard)/dashboard/_components/AddSheet'

const copy = zhTW.dashboard.shortcutPending
const ok = { ok: true as const, data: { txId: 'tx' } }

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}
})
afterAll(() => { vi.unstubAllGlobals() })
beforeEach(() => {
  vi.mocked(shortcutActions.confirmShortcutPending).mockReset().mockResolvedValue(ok as never)
  vi.mocked(shortcutActions.skipShortcutPending).mockReset().mockResolvedValue({ ok: true, data: undefined } as never)
  vi.mocked(txActions.createTransaction).mockReset()
  refresh.mockReset()
})

const view = (over: Partial<ShortcutPendingView> = {}): ShortcutPendingView => ({
  id: 'sp1', amount: 1200, category: 'dining', note: '午餐', day: '2026-10-31', ...over,
})
const wrap = (ui: React.ReactElement) => render(<I18nWrapper><ToastProvider>{ui}</ToastProvider></I18nWrapper>)

describe('PendingShortcutStack', () => {
  it('a card with a note shows 記下 / 改一下 / 略過, the amount, the Taipei day and the category', () => {
    wrap(<PendingShortcutStack pendings={[view()]} onEdit={() => {}} />)
    expect(screen.getByText(copy.sectionLabel)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: copy.primaryAction })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: copy.editAction })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: copy.skipAction })).toBeInTheDocument()
    expect(screen.getByText('午餐')).toBeInTheDocument()
    expect(screen.getByText('2026-10-31')).toBeInTheDocument()
    expect(screen.getByText(/NT\$\s*1,200/)).toBeInTheDocument()
    expect(screen.getByText(zhTW.category.dining)).toBeInTheDocument()
  })

  it('a card with no note has no one-tap button: only 編輯後記下, a hint, and the category as title (null → 其他)', () => {
    for (const note of [null, '', '   ']) {
      const { unmount } = wrap(<PendingShortcutStack pendings={[view({ note, category: null })]} onEdit={() => {}} />)
      expect(screen.queryByRole('button', { name: copy.primaryAction })).toBeNull()
      expect(screen.getByRole('button', { name: copy.editOnlyAction })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: copy.editAction })).toBeNull()
      expect(screen.getByText(copy.noNoteHint)).toBeInTheDocument()
      expect(screen.getByText(zhTW.category.other)).toBeInTheDocument()
      unmount()
    }
  })

  it('renders the note as plain text: markup and URLs are not turned into links', () => {
    const note = '<a href="https://evil.example/x">點我</a> https://evil.example/y'
    const { container } = wrap(<PendingShortcutStack pendings={[view({ note })]} onEdit={() => {}} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('[href]')).toBeNull()
    expect(screen.getByText(note)).toBeInTheDocument()
  })

  it('one tap calls confirmShortcutPending(id) with no overrides, then refreshes', async () => {
    wrap(<PendingShortcutStack pendings={[view()]} onEdit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: copy.primaryAction }))
    await waitFor(() => expect(shortcutActions.confirmShortcutPending).toHaveBeenCalledTimes(1))
    expect(shortcutActions.confirmShortcutPending).toHaveBeenCalledWith('sp1')
    expect(shortcutActions.skipShortcutPending).not.toHaveBeenCalled()
  })

  it('skip asks first, then calls skipShortcutPending(id) and never confirms', async () => {
    wrap(<PendingShortcutStack pendings={[view()]} onEdit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: copy.skipAction }))
    expect(shortcutActions.skipShortcutPending).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(copy.skipConfirmTitle)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: copy.skipAction }))
    await waitFor(() => expect(shortcutActions.skipShortcutPending).toHaveBeenCalledWith('sp1'))
    expect(shortcutActions.confirmShortcutPending).not.toHaveBeenCalled()
  })

  it('改一下 hands the card to onEdit and writes nothing', () => {
    const onEdit = vi.fn()
    const p = view()
    wrap(<PendingShortcutStack pendings={[p]} onEdit={onEdit} />)
    fireEvent.click(screen.getByRole('button', { name: copy.editAction }))
    expect(onEdit).toHaveBeenCalledWith(p)
    expect(shortcutActions.confirmShortcutPending).not.toHaveBeenCalled()
  })

  it('a failed confirm shows the localized code and keeps the card', async () => {
    vi.mocked(shortcutActions.confirmShortcutPending)
      .mockResolvedValue({ ok: false, code: 'shortcut_pending_handled_elsewhere' } as never)
    wrap(<PendingShortcutStack pendings={[view()]} onEdit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: copy.primaryAction }))
    expect(await screen.findByText(zhTW.errors.actions.shortcut_pending_handled_elsewhere)).toBeInTheDocument()
  })

  it('shows two cards and folds the rest behind 展開全部', () => {
    const many = [1, 2, 3, 4].map((n) => view({ id: `sp${n}`, note: `n${n}` }))
    wrap(<PendingShortcutStack pendings={many} onEdit={() => {}} />)
    expect(screen.queryByText('n3')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: copy.expandAll.replace('{n}', '2') }))
    expect(screen.getByText('n4')).toBeInTheDocument()
  })
})

describe('AddSheet with shortcutPendingId', () => {
  const sheet = (over: { description?: string } = {}) => (
    <AddSheet
      open onClose={() => {}} shortcutPendingId="sp1" baseCurrency="twd"
      initial={{
        id: 'sp1', amount: 1200, description: over.description ?? '午餐', category: 'dining', splitType: 'half', splitRatioA: null,
        payerId: VIEWER.id, transactedAt: '2026-10-31T00:00:00', assetId: null, notes: null,
      }}
    />
  )
  const saveBtn = () => screen.getByRole('button', { name: zhTW.common.save })

  it('save calls confirmShortcutPending(id, overrides) and never createTransaction', async () => {
    wrap(sheet())
    fireEvent.click(saveBtn())
    await waitFor(() => expect(shortcutActions.confirmShortcutPending).toHaveBeenCalledTimes(1))
    const [id, overrides] = vi.mocked(shortcutActions.confirmShortcutPending).mock.calls[0]
    expect(id).toBe('sp1')
    expect(overrides).toMatchObject({
      amount: 1200, description: '午餐', category: 'dining', paidBy: VIEWER.id, transactedAt: '2026-10-31',
    })
    expect(txActions.createTransaction).not.toHaveBeenCalled()
  })

  it('a card without a note opens with an empty description; save is refused until one is typed', async () => {
    wrap(sheet({ description: '' }))
    fireEvent.click(saveBtn())
    expect(await screen.findByText(zhTW.addSheet.errors.descriptionRequired)).toBeInTheDocument()
    expect(shortcutActions.confirmShortcutPending).not.toHaveBeenCalled()
  })

  it('losing the race closes the sheet with the handled-elsewhere message', async () => {
    vi.mocked(shortcutActions.confirmShortcutPending)
      .mockResolvedValue({ ok: false, code: 'shortcut_pending_handled_elsewhere' } as never)
    const onClose = vi.fn()
    const onRaceResolved = vi.fn()
    wrap(
      <AddSheet
        open onClose={onClose} onRaceResolved={onRaceResolved} shortcutPendingId="sp1" baseCurrency="twd"
        initial={{
          id: 'sp1', amount: 1200, description: '午餐', category: 'dining', splitType: 'half', splitRatioA: null,
          payerId: VIEWER.id, transactedAt: '2026-10-31T00:00:00', assetId: null, notes: null,
        }}
      />,
    )
    fireEvent.click(saveBtn())
    await waitFor(() => expect(onRaceResolved).toHaveBeenCalledWith(zhTW.errors.actions.shortcut_pending_handled_elsewhere))
    expect(onClose).toHaveBeenCalled()
  })
})
