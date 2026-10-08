import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'

// #1482 / #1582 — main-ledger amounts render in the ledger's base currency,
// as whole units. A row converted from a foreign currency shows the original
// whole-unit amount (USD $45, not $0.45) next to the base equivalent.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { AddSheet } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { MonthlyStatsView } from '@/app/(dashboard)/records/_components/MonthlyStatsView'
import { TabProvider } from '@/app/(dashboard)/records/_components/TabContext'
import { CurrencyBreakdownCard } from '@/app/(dashboard)/trips/[id]/_components/TripDetailClient'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import type { CurrencyCode } from '@/lib/currency'

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}
})
afterAll(() => { vi.unstubAllGlobals() })

function member(baseCurrency: CurrencyCode): MemberContextValue {
  return {
    group: { id: 'g1', name: 'G', baseCurrency },
    viewer: { id: 'viewer-1', initial: 'V', displayName: 'Viewer', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
    partner: { id: 'partner-1', initial: 'P', displayName: 'Partner', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
    viewerIsA: true,
    isSolo: false,
    isPast: false,
    canAccessGuardian: false,
    epochStartedAt: '2026-01-01',
    epochEndedAt: null,
  }
}

const wrap = (base: CurrencyCode, ui: React.ReactElement) =>
  render(<I18nWrapper><MemberProvider value={member(base)}>{ui}</MemberProvider></I18nWrapper>)

const baseTx = {
  id: 'tx-1', amount: 1440, splitType: 'all_mine' as const, splitRatioA: null,
  description: 'x', category: 'dining', paidBy: 'viewer-1', transactedAt: '2026-05-01',
  kind: 'transaction' as const,
}

describe('CompactRow', () => {
  it('TWD base: USD original $45 next to ≈ NT$1,440', () => {
    wrap('twd', <CompactRow tx={{ ...baseTx, originalCurrency: 'USD', originalAmount: 45 }} isLast />)
    expect(screen.getByText('$45')).toBeTruthy()
    expect(screen.getByText('≈ NT$1,440')).toBeTruthy()
  })

  it('TWD base native row is unchanged: NT$1,440', () => {
    const { container } = wrap('twd', <CompactRow tx={baseTx} isLast />)
    expect(container.textContent).toContain('NT$1,440')
  })

  it('USD base: main amount and ≈ line use $, never NT$', () => {
    const native = wrap('usd', <CompactRow tx={{ ...baseTx, amount: 45 }} isLast />)
    expect(native.container.textContent).toContain('$45')
    expect(native.container.textContent).not.toContain('NT$')
    native.unmount()
    const fx = wrap('usd', <CompactRow tx={{ ...baseTx, amount: 7, originalCurrency: 'JPY', originalAmount: 1000 }} isLast />)
    expect(fx.container.textContent).toContain('¥1,000')
    expect(fx.container.textContent).toContain('≈ $7')
    expect(fx.container.textContent).not.toContain('NT$')
  })
})

describe('TripDetailClient per-currency card', () => {
  const row = { currency: 'USD', native: 45, base: 1440, count: 1, aPaidNative: 45, bPaidNative: 0, aShareNative: 45, bShareNative: 0 }
  it('TWD base: $45 next to ≈ NT$1,440', () => {
    render(
      <CurrencyBreakdownCard
        row={row} baseCurrency="twd" showPerSide={false}
        viewer={{ avatarUrl: null, initial: 'V', isA: true }} partner={null}
        t={{ youPaid: '', partnerPaid: '', share: '', recordsSuffix: '筆' }}
      />,
    )
    expect(screen.getByText('$45')).toBeTruthy()
    expect(screen.getByText('≈ NT$1,440')).toBeTruthy()
  })
})

describe('MonthlyStatsView anchor', () => {
  const view = (base: CurrencyCode) => wrap(base, (
    <TabProvider value="expense">
      <MonthlyStatsView
        userId="u-a" initialCollapsed={false} view="category"
        categoryRows={[{ key: 'food', total: 45, count: 1 }]} assetRows={[]} incomeRows={[]}
        expenseTotal={45} incomeTotal={0} dailyTrend={[]}
      />
    </TabProvider>
  ))
  it('USD base anchors with $, TWD base with NT$', () => {
    const usd = view('usd')
    expect(usd.container.textContent).toContain('$')
    expect(usd.container.textContent).not.toContain('NT$')
    usd.unmount()
    const twd = view('twd')
    expect(twd.container.textContent).toContain('NT$')
  })
})

describe('AddSheet conversion preview', () => {
  const snapshot = {
    default: 'USD',
    entries: [
      { code: 'USD', label: null, rate: 1 },
      { code: 'JPY', label: null, rate: 0.0067 },
      { code: 'TWD', label: null, rate: 0.031 },
    ],
  }
  const trips = (defaultCurrency: string) => [
    { id: 't1', name: '京都', defaultCurrency, startDate: '2000-01-01', endDate: null, currencies: snapshot },
  ]
  const open = (amount: number, defaultCurrency: string) => wrap('usd', (
    <AddSheet open onClose={() => {}} baseCurrency="usd" prefilledTripId="t1"
      prefilledAmount={amount} activeTrips={trips(defaultCurrency)} />
  ))

  it('USD base: ¥1000 previews ≈ $7 (whole dollars, $ symbol)', async () => {
    open(1000, 'JPY')
    await waitFor(() => expect(screen.getByText('≈ $7')).toBeTruthy())
  })

  it('minimum 1: ¥50 and NT$15 preview ≈ $1, never ≈ $0', async () => {
    const a = open(50, 'JPY')
    await waitFor(() => expect(screen.getByText('≈ $1')).toBeTruthy())
    a.unmount()
    open(15, 'TWD')
    await waitFor(() => expect(screen.getByText('≈ $1')).toBeTruthy())
  })
})
