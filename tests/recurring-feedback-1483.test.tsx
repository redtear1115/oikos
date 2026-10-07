// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TranslationsProvider } from '@/lib/i18n/client'
import { en } from '@/lib/i18n/locales/en'
import { ToastProvider } from '@/components/Toast'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'
import type { RecurringExpenseRuleRow } from '@/lib/db/queries/recurringExpense'

// #1483 — recurring rule feedback: save toast, next-dates preview, delete count.

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

const incomeActions = vi.hoisted(() => ({
  createRule: vi.fn(), updateRule: vi.fn(), pauseRule: vi.fn(), resumeRule: vi.fn(), softDeleteRule: vi.fn(),
  countPendingForRule: vi.fn(),
}))
const expenseActions = vi.hoisted(() => ({
  createRule: vi.fn(), updateRule: vi.fn(), pauseRule: vi.fn(), resumeRule: vi.fn(), softDeleteRule: vi.fn(),
  countPendingForRule: vi.fn(),
}))
vi.mock('@/actions/recurringIncome', () => incomeActions)
vi.mock('@/actions/recurringExpense', () => expenseActions)
vi.mock('@/app/(dashboard)/dashboard/_components/AssetLinkField', () => ({
  AssetLinkField: () => null,
}))

import { RecurringRuleSheet } from '@/app/(dashboard)/_components/RecurringRuleSheet'

function En({ children }: { children: ReactNode }) {
  return (
    <TranslationsProvider value={en} locale="en">
      <ToastProvider>{children}</ToastProvider>
    </TranslationsProvider>
  )
}

const incomeRule: RecurringRuleRow = {
  id: 'r1', recipientId: 'u-1', amount: 50000, category: 'salary', source: null, assetId: null,
  intervalMonths: 1, dayOfMonth: 5, startsOn: '2026-01-05', endsOn: null,
  nextOccurrenceAt: '2026-10-05', pausedAt: null,
}
const expenseRule = {
  id: 'e1', paidBy: 'u-1', amount: 20000, splitType: 'half', splitRatioA: null, description: 'Rent',
  category: 'housing', assetId: null, intervalMonths: 1, dayOfMonth: 1, startsOn: '2026-01-01',
  endsOn: null, nextOccurrenceAt: '2026-10-01', pausedAt: null,
} as RecurringExpenseRuleRow

type Kind = 'income' | 'expense'

function renderSheet(kind: Kind, initial?: RecurringRuleRow | RecurringExpenseRuleRow) {
  return render(
    <En>
      {kind === 'income' ? (
        <RecurringRuleSheet
          type="income" open onClose={() => {}} onMutated={() => {}}
          initial={initial as RecurringRuleRow | undefined} insuranceAssets={[]}
        />
      ) : (
        <RecurringRuleSheet
          type="expense" open onClose={() => {}} onMutated={() => {}}
          initial={initial as RecurringExpenseRuleRow | undefined}
        />
      )}
    </En>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => cleanup())

async function clickSave() {
  await act(async () => { screen.getByRole('button', { name: en.common.save }).click() })
}

const KINDS: { kind: Kind; actions: typeof incomeActions; rule: RecurringRuleRow | RecurringExpenseRuleRow }[] = [
  { kind: 'income', actions: incomeActions, rule: incomeRule },
  { kind: 'expense', actions: expenseActions, rule: expenseRule },
]

describe.each(KINDS)('#1483 save feedback ($kind)', ({ kind, actions, rule }) => {
  it('edit: the toast shows the date the server returned', async () => {
    actions.updateRule.mockResolvedValue({ ok: true, data: { id: rule.id, nextOccurrenceAt: '2026-11-05' } })
    renderSheet(kind, rule)
    await clickSave()
    expect(screen.getByRole('status')).toHaveTextContent('Saved. Next on November 5, 2026')
  })

  it('paused rule: plain "Saved"', async () => {
    actions.updateRule.mockResolvedValue({ ok: true, data: { id: rule.id, nextOccurrenceAt: '2026-11-05' } })
    renderSheet(kind, { ...rule, pausedAt: new Date() })
    await clickSave()
    expect(screen.getByRole('status')).toHaveTextContent(/^Saved$/)
  })

  it('first date after endsOn: plain "Saved"', async () => {
    actions.updateRule.mockResolvedValue({ ok: true, data: { id: rule.id, nextOccurrenceAt: '2026-11-05' } })
    renderSheet(kind, { ...rule, endsOn: '2026-10-31' })
    await clickSave()
    expect(screen.getByRole('status')).toHaveTextContent(/^Saved$/)
  })

  it('a failed save shows no toast', async () => {
    actions.updateRule.mockResolvedValue({ ok: false, code: 'recurring_rule_not_found' })
    renderSheet(kind, rule)
    await clickSave()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe.each(KINDS)('#1483 next-dates preview ($kind)', ({ kind, rule }) => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 7, 12, 0, 0)) // local 2026-10-07
  })
  afterEach(() => vi.useRealTimers())

  it('day 31: three clamped dates and the new plain-language hint', () => {
    renderSheet(kind)
    expect(screen.queryByText(/Months without a day/)).toBeNull() // day 7 → no hint
    act(() => { screen.getByRole('button', { name: 'Day 31' }).click() })
    expect(screen.getByText('Next: Oct 31, Nov 30, Dec 31')).toBeInTheDocument()
    expect(screen.getByText('Months without a day 31 use the last day of the month.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/fallback/i)
  })

  it('day 28 or less: preview but no hint', () => {
    renderSheet(kind)
    expect(screen.getByText('Next: Oct 7, Nov 7, Dec 7')).toBeInTheDocument()
    expect(screen.queryByText(/use the last day/)).toBeNull()
  })

  it('edit mode starts from the next period; create includes today', () => {
    const { unmount } = renderSheet(kind)
    expect(screen.getByText(/^Next: Oct 7,/)).toBeInTheDocument()
    unmount()
    renderSheet(kind, { ...rule, dayOfMonth: 7, startsOn: '2026-01-07' })
    expect(screen.getByText('Next: Nov 7, Dec 7, Jan 7, 2027')).toBeInTheDocument()
  })
})
