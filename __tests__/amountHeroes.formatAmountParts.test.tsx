import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

// #1358 — the disabled-opacity / overflow-menu / amount-split decisions.
// This file pins the amount-split migration: AssetHero's `Stat`, BalanceHero,
// SoloMonthHero and MonthlyStatsView's `SummaryText` all used to hard-code
// "NT$" as a literal. They now derive it from `formatAmountParts`/
// `formatAmount`, and this test asserts the rendered digits + symbol for TWD
// are unchanged.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/records',
}))

import { AssetHero } from '@/app/(dashboard)/assets/[id]/_components/AssetHero'
import { BalanceHero } from '@/app/(dashboard)/dashboard/_components/BalanceHero'
import { SoloMonthHero } from '@/app/(dashboard)/dashboard/_components/SoloMonthHero'
import { TranslationsProvider } from '@/lib/i18n/client'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

afterEach(cleanup)

const member: MemberContextValue = {
  group: { id: 'g1', name: '測試帳本' },
  viewer: { id: 'u1', initial: '我', displayName: '我', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
  partner: { id: 'u2', initial: '伴', displayName: '伴侶', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
  viewerIsA: true,
  isSolo: false,
  isPast: false,
  canAccessGuardian: false,
  epochStartedAt: '2026-01-01',
  epochEndedAt: null,
}

function withProviders(children: React.ReactNode) {
  return (
    <TranslationsProvider value={zhTW} locale="zh-TW">
      <MemberProvider value={member}>{children}</MemberProvider>
    </TranslationsProvider>
  )
}

describe('AssetHero amount split (#1358)', () => {
  it('renders NT$ + digits for both Stat tiles (electric layout)', () => {
    render(
      withProviders(
        <AssetHero
          name="小車"
          brand="Toyota"
          model="Corolla"
          year={2020}
          fuelType="electric"
          color={null}
          monthAmount={1234}
          totalAmount={56789}
          avgEcon={null}
          lastFuelAt={null}
          isPast={false}
        />,
      ),
    )

    expect(screen.getAllByText('NT$').length).toBeGreaterThan(0)
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('56,789')).toBeInTheDocument()
  })

  it('MiniStat renders NT$ with NO space before the digits (gas layout)', () => {
    const { container } = render(
      withProviders(
        <AssetHero
          name="小車"
          brand="Toyota"
          model="Corolla"
          year={2020}
          fuelType="95"
          color={null}
          monthAmount={1234}
          totalAmount={56789}
          avgEcon={null}
          lastFuelAt={null}
          isPast={false}
        />,
      ),
    )

    expect(container.textContent).toContain('NT$1,234')
    expect(container.textContent).not.toContain('NT$ 1,234')
  })
})

describe('BalanceHero amount split (#1358)', () => {
  it('renders NT$ + digits for the expanded balance amount (default twd)', () => {
    render(
      withProviders(
        <BalanceHero
          rawBalance={98765}
          initialHeroCollapsed={false}
          initialIncludePending={false}
          mode="expense"
          incomeMonthTotal={0}
          incomeMonthCount={0}
          recentIncomeLabel={null}
        />,
      ),
    )

    expect(screen.getByText('NT$')).toBeInTheDocument()
    expect(screen.getByText('98,765')).toBeInTheDocument()
  })

  it('honours a non-TWD baseCurrency prop (#1358 A2 — jpy)', () => {
    render(
      withProviders(
        <BalanceHero
          rawBalance={98765}
          initialHeroCollapsed={false}
          initialIncludePending={false}
          mode="expense"
          incomeMonthTotal={0}
          incomeMonthCount={0}
          recentIncomeLabel={null}
          baseCurrency="jpy"
        />,
      ),
    )

    expect(screen.queryByText('NT$')).toBeNull()
    expect(screen.getByText('¥')).toBeInTheDocument()
    expect(screen.getByText('98,765')).toBeInTheDocument()
  })
})

describe('SoloMonthHero amount split (#1358)', () => {
  it('renders NT$ + digits for the month total (default twd)', () => {
    render(
      withProviders(<SoloMonthHero monthKey="2026-03" total={45000} count={12} />),
    )

    expect(screen.getByText('NT$')).toBeInTheDocument()
    expect(screen.getByText('45,000')).toBeInTheDocument()
  })

  it('honours a non-TWD baseCurrency prop (#1358 A2 — usd cents)', () => {
    render(
      withProviders(
        <SoloMonthHero monthKey="2026-03" total={4500} count={12} baseCurrency="usd" />,
      ),
    )

    expect(screen.queryByText('NT$')).toBeNull()
    expect(screen.getByText('$')).toBeInTheDocument()
    expect(screen.getByText('45.00')).toBeInTheDocument()
  })
})
