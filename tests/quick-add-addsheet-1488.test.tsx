import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// #1488 — the real AddSheet, opened the way Dashboard opens it for a quick-add
// URL: create-mode prefill props, never `initial`. Pins that save can only
// create (createTransaction, never editTransaction), and that a URL prefill is
// not filed into the trip that happens to cover today.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({
    viewer: { id: 'u-1', initial: 'R', avatarUrl: null, defaultSplitType: 'half' },
    partner: null,
    viewerIsA: true,
    isSolo: true,
    isPast: false,
    canAccessGuardian: false,
  }),
  whoToMemberRole: (w: 'M' | 'T') => (w === 'M' ? 'a' : 'b'),
}))
vi.mock('@/actions/transaction', () => ({
  createTransaction: vi.fn(),
  editTransaction: vi.fn(),
  softDeleteTransaction: vi.fn(),
  getDescriptionSuggestions: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
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

import { createTransaction, editTransaction } from '@/actions/transaction'
import { createTripExpense, editTripExpense } from '@/actions/tripExpense'
import { editAndConfirmPending } from '@/actions/recurringExpense'
import { AddSheet } from '@/app/(dashboard)/dashboard/_components/AddSheet'

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}
})
afterAll(() => {
  vi.unstubAllGlobals()
})
beforeEach(() => {
  vi.mocked(createTransaction).mockReset()
  vi.mocked(createTransaction).mockResolvedValue({ ok: true, data: { isFirstTransaction: false } } as never)
  vi.mocked(editTransaction).mockReset()
  vi.mocked(createTripExpense).mockReset()
  vi.mocked(editTripExpense).mockReset()
  vi.mocked(editAndConfirmPending).mockReset()
})

// A trip that covers today — the case where create mode would normally auto-tag.
const activeTrips = [{ id: 't1', name: '京都', defaultCurrency: 'jpy', startDate: '2000-01-01', endDate: null }]

function renderPrefilled(extra: Partial<Parameters<typeof AddSheet>[0]> = {}) {
  const onClose = vi.fn()
  render(
    <I18nWrapper>
      <AddSheet
        open
        onClose={onClose}
        prefilledAmount={120}
        prefilledCategory="transit"
        prefilledDescription="LINE Pay 午餐"
        skipTripAutoDetect
        activeTrips={activeTrips}
        baseCurrency="twd"
        {...extra}
      />
    </I18nWrapper>,
  )
  return { onClose }
}

describe('AddSheet quick-add prefill (#1488)', () => {
  it('opens in create mode with amount and description filled', async () => {
    renderPrefilled()
    const amount = screen.getByLabelText(zhTW.addSheet.amount) as HTMLInputElement
    await waitFor(() => expect(amount.value).toBe('120'))
    expect(screen.getByDisplayValue('LINE Pay 午餐')).toHaveAttribute('aria-autocomplete', 'list')
    // Create-mode title and save label, not the edit ones.
    expect(screen.getByRole('button', { name: zhTW.common.save })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: zhTW.common.update })).toBeNull()
  })

  it('save creates on the main ledger in base currency — never edits, never a trip expense', async () => {
    const { onClose } = renderPrefilled()
    await waitFor(() => expect((screen.getByLabelText(zhTW.addSheet.amount) as HTMLInputElement).value).toBe('120'))
    fireEvent.click(screen.getByRole('button', { name: zhTW.common.save }))

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createTransaction).mock.calls[0][0]).toMatchObject({
      amount: 120,
      description: 'LINE Pay 午餐',
      category: 'transit',
      currency: 'twd',
      tripId: null,
      payerId: 'u-1',
      splitType: 'all_mine',
    })
    expect(editTransaction).not.toHaveBeenCalled()
    expect(createTripExpense).not.toHaveBeenCalled()
    expect(editTripExpense).not.toHaveBeenCalled()
    expect(editAndConfirmPending).not.toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('control: without skipTripAutoDetect the same sheet files into today’s trip', async () => {
    vi.mocked(createTripExpense).mockResolvedValue({ ok: true, data: undefined } as never)
    renderPrefilled({ skipTripAutoDetect: false })
    await waitFor(() => expect((screen.getByLabelText(zhTW.addSheet.amount) as HTMLInputElement).value).toBe('120'))
    fireEvent.click(screen.getByRole('button', { name: zhTW.common.save }))
    await waitFor(() => expect(createTripExpense).toHaveBeenCalledTimes(1))
    expect(createTransaction).not.toHaveBeenCalled()
  })
})
