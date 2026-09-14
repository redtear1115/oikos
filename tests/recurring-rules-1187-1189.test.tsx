import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TranslationsProvider } from '@/lib/i18n/client'
import { en } from '@/lib/i18n/locales/en'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'
import type { RecurringExpenseRuleRow } from '@/lib/db/queries/recurringExpense'

// #1187 / #1189 — recurring rules: next-run date on list rows, localized
// income category names, selection state exposed beyond colour, headings,
// edit / delete consequence copy.

// jsdom has no ResizeObserver; ScrollFadeRow (category chip row) needs one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({
    viewer: { id: 'u-1', initial: 'R', avatarUrl: null, defaultSplitType: 'half' },
    partner: { id: 'u-2', initial: 'S', avatarUrl: null, displayName: 'Sam' },
    viewerIsA: true,
    isSolo: false,
  }),
  whoToMemberRole: (w: 'M' | 'T') => (w === 'M' ? 'a' : 'b'),
}))

vi.mock('@/actions/recurringIncome', () => ({
  createRule: vi.fn(), updateRule: vi.fn(), pauseRule: vi.fn(), resumeRule: vi.fn(), softDeleteRule: vi.fn(),
}))
vi.mock('@/actions/recurringExpense', () => ({
  createRule: vi.fn(), updateRule: vi.fn(), pauseRule: vi.fn(), resumeRule: vi.fn(), softDeleteRule: vi.fn(),
}))
vi.mock('@/app/(dashboard)/dashboard/_components/AssetLinkField', () => ({
  AssetLinkField: () => null,
}))

import { ruleNextDateText } from '@/lib/recurringNextDate'
import { RuleListItem as IncomeRuleListItem } from '@/app/(dashboard)/settings/recurring-income/_components/RuleListItem'
import { RuleListItem as ExpenseRuleListItem } from '@/app/(dashboard)/settings/recurring-expense/_components/RuleListItem'
import { IncomeChip } from '@/app/(dashboard)/dashboard/_components/IncomeChip'
import { RecurringRuleSheet } from '@/app/(dashboard)/_components/RecurringRuleSheet'
import { getIncomeCategory } from '@/lib/incomeCategories'

function En({ children }: { children: ReactNode }) {
  return (
    <TranslationsProvider value={en} locale="en">
      {children}
    </TranslationsProvider>
  )
}

const incomeRule: RecurringRuleRow = {
  id: 'r1',
  recipientId: 'u-1',
  amount: 50000,
  category: 'salary',
  source: null,
  assetId: null,
  intervalMonths: 1,
  dayOfMonth: 5,
  startsOn: '2026-01-05',
  endsOn: null,
  nextOccurrenceAt: '2026-10-05',
  pausedAt: null,
}

const expenseRule: RecurringExpenseRuleRow = {
  id: 'e1',
  paidBy: 'u-1',
  amount: 20000,
  splitType: 'half',
  splitRatioA: null,
  description: 'Rent',
  category: 'housing',
  assetId: null,
  intervalMonths: 1,
  dayOfMonth: 1,
  startsOn: '2026-01-01',
  endsOn: null,
  nextOccurrenceAt: '2026-10-01',
  pausedAt: null,
} as RecurringExpenseRuleRow

describe('ruleNextDateText', () => {
  it('formats the next run date with the template', () => {
    expect(ruleNextDateText(incomeRule, 'Next {date}', 'en')).toBe('Next October 5, 2026')
  })
  it('hides the date while paused (resume re-snaps it)', () => {
    expect(ruleNextDateText({ ...incomeRule, pausedAt: new Date() }, 'Next {date}', 'en')).toBeNull()
  })
  it('hides the date when it falls after endsOn', () => {
    expect(ruleNextDateText({ ...incomeRule, endsOn: '2026-09-30' }, 'Next {date}', 'en')).toBeNull()
  })
})

describe('recurring rule list rows', () => {
  it('income row: English category name and next run date', () => {
    render(<En><ul><IncomeRuleListItem rule={incomeRule} onEdit={() => {}} /></ul></En>)
    expect(screen.getByText('Salary')).toBeInTheDocument()
    expect(screen.queryByText('薪水')).toBeNull()
    expect(screen.getByText('Next October 5, 2026')).toBeInTheDocument()
  })

  it('expense row: next run date', () => {
    render(<En><ul><ExpenseRuleListItem rule={expenseRule} onEdit={() => {}} /></ul></En>)
    expect(screen.getByText('Next October 1, 2026')).toBeInTheDocument()
  })
})

describe('IncomeChip', () => {
  it('uses the localized name and exposes aria-pressed', () => {
    render(
      <En>
        <IncomeChip cat={getIncomeCategory('bonus')} selected onClick={() => {}} />
        <IncomeChip cat={getIncomeCategory('gift')} selected={false} onClick={() => {}} />
      </En>,
    )
    expect(screen.getByRole('button', { name: /Bonus/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Gift/ })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('RecurringRuleSheet (income)', () => {
  function renderSheet(initial?: RecurringRuleRow) {
    return render(
      <En>
        <RecurringRuleSheet
          type="income"
          open
          onClose={() => {}}
          onMutated={() => {}}
          initial={initial}
          insuranceAssets={[{ id: 'a1', name: 'Policy' }]}
        />
      </En>,
    )
  }

  it('recipient segment is a labelled radio group with checked state', () => {
    renderSheet()
    const group = screen.getByRole('radiogroup', { name: en.recurringIncome.sheet.recipientPrompt })
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(group).toContainElement(radios[0])
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    expect(radios[1]).toHaveAttribute('aria-checked', 'false')
    act(() => radios[1].click())
    expect(radios[0]).toHaveAttribute('aria-checked', 'false')
    expect(radios[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('interval and category buttons expose aria-pressed; chips are English', () => {
    renderSheet()
    const monthly = screen.getByRole('button', { name: en.recurringIncome.rule.intervalEveryMonth })
    const quarterly = screen.getByRole('button', { name: en.recurringIncome.rule.intervalEveryQuarter })
    expect(monthly).toHaveAttribute('aria-pressed', 'true')
    expect(quarterly).toHaveAttribute('aria-pressed', 'false')
    act(() => quarterly.click())
    expect(quarterly).toHaveAttribute('aria-pressed', 'true')
    expect(monthly).toHaveAttribute('aria-pressed', 'false')

    expect(screen.getByRole('group', { name: en.recurringIncome.sheet.intervalLabel })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: en.recurringIncome.sheet.categoryLabel })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Salary/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('has a heading and a named asset select', () => {
    renderSheet()
    expect(screen.getByRole('heading', { level: 2, name: en.recurringIncome.sheet.titleNew })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: en.recurringIncome.sheet.assetLabel })).toBeInTheDocument()
  })

  it('edit mode says when changes take effect; create mode does not', () => {
    const { unmount } = renderSheet()
    expect(screen.queryByText(en.recurringIncome.sheet.editEffectHint)).toBeNull()
    unmount()
    renderSheet(incomeRule)
    expect(screen.getByText(en.recurringIncome.sheet.editEffectHint)).toBeInTheDocument()
  })
})
