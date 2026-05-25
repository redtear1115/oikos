import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import type { CategoryStatRow, DailyTrendRow } from '@/lib/db/queries/transactions'
import type { IncomeCategoryStatRow } from '@/lib/db/queries/incomes'

// MonthlyStatsView + its expanded children (StatsBreakdownToggle) read the URL
// via next/navigation. The drill parser only needs `.get()` / `.toString()`,
// so an empty URLSearchParams is enough to render the no-drill state.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { MonthlyStatsView } from '@/app/(dashboard)/records/_components/MonthlyStatsView'
import { TabProvider } from '@/app/(dashboard)/records/_components/TabContext'

// These #746 tests assert the summary line (支出/收入/淨收入) stays visible when
// expanded. The summary now renders on every expanded tab — including the 收支
// (`all`) tab, above its daily-trend chart (covered by the 收支-tab test below).
// useRecordsTab defaults to 'all' outside a provider; these donut-tab cases pin
// to 'expense' to exercise the breakdown branch.
const wrap = (ui: React.ReactElement) =>
  render(<I18nWrapper><TabProvider value="expense">{ui}</TabProvider></I18nWrapper>)

const categoryRows: CategoryStatRow[] = [{ key: 'food', total: 3000, count: 1 }]
const noRows: CategoryStatRow[] = []
const noIncomeRows: IncomeCategoryStatRow[] = []
// `dailyTrend` is a required prop; these tests assert on the summary line, not
// the trend chart, so an empty trend keeps DailyTrendChart out of the render
// (it returns null when data.length === 0). Override per-test if needed.
const noDailyTrend: DailyTrendRow[] = []

function view(overrides: Partial<React.ComponentProps<typeof MonthlyStatsView>> = {}) {
  return wrap(
    <MonthlyStatsView
      userId="u-a"
      initialCollapsed={false}
      view="category"
      categoryRows={categoryRows}
      assetRows={[]}
      incomeRows={noIncomeRows}
      expenseTotal={3000}
      incomeTotal={5000}
      dailyTrend={noDailyTrend}
      {...overrides}
    />,
  )
}

describe('MonthlyStatsView — total stays visible when expanded (#746)', () => {
  it('renders the income + net summary in the expanded state (with breakdown)', () => {
    view()
    // The donut center shows the expense breakdown total ("總計"); the income
    // and net figures only exist in the summary line, which must survive expand.
    expect(screen.getByText('收入 5,000')).toBeInTheDocument()
    expect(screen.getByText('淨收入 +2,000')).toBeInTheDocument()
  })

  it('keeps the total visible when expanded even with no expense breakdown', () => {
    // Income-only month on the 全部/支出 tab: breakdownTotal is 0 so the donut
    // is suppressed — the summary line is the only place the total can live.
    view({ categoryRows: noRows, expenseTotal: 0, incomeTotal: 5000 })
    expect(screen.getByText('收入 5,000')).toBeInTheDocument()
    expect(screen.getByText('淨收入 +5,000')).toBeInTheDocument()
  })

  it('still shows the summary when collapsed (regression guard)', () => {
    view({ initialCollapsed: true })
    expect(screen.getByText('支出 3,000')).toBeInTheDocument()
    expect(screen.getByText('收入 5,000')).toBeInTheDocument()
  })
})

describe('MonthlyStatsView — 收支 (all) tab keeps the summary when expanded', () => {
  it('shows the summary line above the daily trend on the expanded 收支 tab', () => {
    render(
      <I18nWrapper>
        <TabProvider value="all">
          <MonthlyStatsView
            userId="u-a"
            initialCollapsed={false}
            view="category"
            categoryRows={categoryRows}
            assetRows={[]}
            incomeRows={noIncomeRows}
            expenseTotal={3000}
            incomeTotal={5000}
            dailyTrend={noDailyTrend}
          />
        </TabProvider>
      </I18nWrapper>,
    )
    expect(screen.getByText('支出 3,000')).toBeInTheDocument()
    expect(screen.getByText('收入 5,000')).toBeInTheDocument()
    expect(screen.getByText('淨收入 +2,000')).toBeInTheDocument()
  })
})
