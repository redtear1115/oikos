import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// #1197 — dashboard home a11y: the hero collapse toggle had hard-coded English
// aria-labels, and the settlement / pending-card error paths rendered text
// with no live region, so a screen reader heard nothing when a save failed.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/actions/settlement', () => ({
  createSettlement: vi.fn(),
  editSettlement: vi.fn(),
  softDeleteSettlement: vi.fn(),
}))

import { createSettlement, editSettlement } from '@/actions/settlement'
import { BalanceHero } from '@/app/(dashboard)/dashboard/_components/BalanceHero'
import { SettlementForm } from '@/app/(dashboard)/dashboard/_components/SettlementForm'
import { SettlementSheet } from '@/app/(dashboard)/dashboard/_components/SettlementSheet'
import { PendingCard } from '@/app/(dashboard)/dashboard/_components/PendingCard'
import { DashboardFilterRow } from '@/app/(dashboard)/dashboard/_components/DashboardFilterRow'

const member: MemberContextValue = {
  group: { id: 'g1', name: '我們家' },
  viewer: { id: 'u-me', initial: '我', displayName: '小明', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
  partner: { id: 'u-you', initial: '對', displayName: '小華', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
  viewerIsA: true,
  isSolo: false,
  isPast: false,
  canAccessGuardian: false,
  epochStartedAt: '2024-01-01T00:00:00.000Z',
  epochEndedAt: null,
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nWrapper>
      <MemberProvider value={member}>{children}</MemberProvider>
    </I18nWrapper>
  )
}

const heroBase = {
  rawBalance: 1200,
  initialIncludePending: false,
  mode: 'expense' as const,
  incomeMonthTotal: 0,
  incomeMonthCount: 0,
  recentIncomeLabel: null,
}

beforeEach(() => {
  vi.mocked(createSettlement).mockReset()
  vi.mocked(editSettlement).mockReset()
})

describe('#1197 BalanceHero — collapse toggle aria-label is localised', () => {
  it('expense hero, collapsed: names the + toggle from i18n, not "expand"', () => {
    render(<BalanceHero {...heroBase} initialHeroCollapsed />, { wrapper: Wrapper })
    const btn = screen.getByRole('button', { name: zhTW.balanceHero.expandAriaLabel })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: /^(expand|collapse)$/i })).toBeNull()
  })

  it('expense hero, expanded: names the − toggle from i18n, not "collapse"', () => {
    render(<BalanceHero {...heroBase} initialHeroCollapsed={false} />, { wrapper: Wrapper })
    const btn = screen.getByRole('button', { name: zhTW.balanceHero.collapseAriaLabel })
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByRole('button', { name: /^(expand|collapse)$/i })).toBeNull()
  })

  it('income hero: the label follows the collapsed state after a toggle', () => {
    render(<BalanceHero {...heroBase} mode="income" initialHeroCollapsed />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: zhTW.balanceHero.expandAriaLabel }))
    expect(screen.getByRole('button', { name: zhTW.balanceHero.collapseAriaLabel })).toBeTruthy()
  })
})

describe('#1197 SettlementForm', () => {
  const formProps = { debtAmount: 1000, viewerIsDebtor: true, onClose: vi.fn(), onMutated: vi.fn() }

  it('announces a validation error via role="alert"', () => {
    render(<SettlementForm {...formProps} />, { wrapper: Wrapper })
    fireEvent.change(screen.getByLabelText(zhTW.settlement.amountAriaLabel), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: /還款|NT\$/ }))
    expect(screen.getByRole('alert').textContent).toBe(zhTW.settlement.errors.exceedsDebt)
  })

  it('announces a failed save via role="alert"', async () => {
    vi.mocked(createSettlement).mockRejectedValueOnce(new Error('boom'))
    render(<SettlementForm {...formProps} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: /NT\$/ }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
  })

  it('submit uses the primary (ink) fill, not white-on-accent (2.68:1)', () => {
    render(<SettlementForm {...formProps} />, { wrapper: Wrapper })
    const submit = screen.getByRole('button', { name: /NT\$/ })
    expect(submit.className).toContain('bg-[var(--btn-primary-bg)]')
    expect(submit.className).toContain('text-[var(--btn-primary-text)]')
    expect(submit.className).not.toContain('text-white')
    expect(submit.getAttribute('style') ?? '').not.toContain('--accent')
  })

  it('amount chips expose selection with aria-pressed', () => {
    render(<SettlementForm {...formProps} />, { wrapper: Wrapper })
    // Default amount = full debt → the 全額 chip is the pressed one.
    expect(screen.getByRole('button', { name: /全額/ }).getAttribute('aria-pressed')).toBe('true')
    const half = screen.getByRole('button', { name: /一半/ })
    expect(half.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(half)
    expect(half.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('#1197 SettlementSheet — failed save / delete is announced', () => {
  it('renders the error toast with role="alert" when editSettlement rejects', async () => {
    vi.mocked(editSettlement).mockRejectedValueOnce(new Error('boom'))
    render(
      <SettlementSheet
        open
        onClose={vi.fn()}
        initial={{ id: 's1', amount: 500, payerId: 'u-me', settledAt: '2026-09-01T12:00:00.000Z' }}
      />,
      { wrapper: Wrapper },
    )
    fireEvent.click(screen.getByRole('button', { name: zhTW.common.save }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(zhTW.common.error)
    // Error surface per DESIGN.md, not white on --debit (3.27:1).
    expect(alert.innerHTML).toContain('--debit-text')
    expect(alert.innerHTML).not.toContain('text-white')
  })
})

describe('#1197 PendingCard — failed confirm / skip is announced', () => {
  const cardProps = {
    cat: { tint: '#F8D9C2', ink: '#3A2419', mono: '食' },
    gradientAlpha: '45',
    title: '房租',
    date: '9/1',
    amount: 20000,
    confirmLabel: '確認',
    editLabel: '編輯',
    skipLabel: '略過',
    primaryDisabledClass: '',
    secondaryDisabledClass: '',
    onSkip: vi.fn(),
    confirmErrorFallback: '確認失敗',
    skipErrorFallback: '略過失敗',
    skipModalTitle: '略過這筆？',
  }

  it('renders the error with role="alert" when onConfirm rejects', async () => {
    render(<PendingCard {...cardProps} onConfirm={vi.fn().mockRejectedValue(new Error('boom'))} />, {
      wrapper: Wrapper,
    })
    fireEvent.click(screen.getByRole('button', { name: '確認' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('確認失敗'))
    expect(screen.getByRole('alert').innerHTML).toContain('--debit-text')
  })
})

describe('#1197 DashboardFilterRow — dual-toggle groups are named', () => {
  it('both role="group" toggles carry an accessible name', () => {
    render(
      <DashboardFilterRow
        payerFilter="me"
        splitFilter="all"
        onPayerChange={() => {}}
        onSplitChange={() => {}}
        viewerIsA
        t={zhTW}
      />,
    )
    expect(screen.getByRole('group', { name: zhTW.dashboard.payerFilterAriaLabel })).toBeTruthy()
    expect(screen.getByRole('group', { name: zhTW.dashboard.burdenFilterAriaLabel })).toBeTruthy()
  })
})
