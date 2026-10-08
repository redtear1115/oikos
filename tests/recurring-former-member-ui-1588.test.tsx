// #1588 — rules and pending cards whose 收入歸屬 / 付款人 left the ledger.
//
// The pages send no id for that person, only `*IsFormer` + `formerLabel`
// (lib/recurringMemberLink.ts). The client must:
//   - label them 「前伴侶」 (or nothing when formerLabel is false), never as
//     the current partner — any non-viewer id used to read as `partner`;
//   - in the rule sheet, the dashboard IncomeSheet (edit-pending) and AddSheet
//     (edit-pending-expense): duo → no person preselected, a hint, save
//     disabled until a person is picked; solo → an explicit 「會改記在你名下」
//     line, save allowed and writes the viewer.
//
// Failure looks like: B's salary rule shows the new partner's name; opening
// it and saving any change silently reassigns it to the new partner.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { ToastProvider } from '@/components/Toast'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import type {
  RecurringIncomeRuleView,
  RecurringExpenseRuleView,
  PendingIncomeView,
  PendingExpenseView,
} from '@/lib/recurringMemberLink'

const VIEWER = { id: 'a0a0a0a0-0000-4000-8000-0000000000a0', initial: 'M', avatarUrl: null, defaultSplitType: 'half' as const, displayName: 'Me' }
const PARTNER = { id: 'd0d0d0d0-0000-4000-8000-0000000000d0', initial: 'D', avatarUrl: null, displayName: 'Dana' }
let partner: typeof PARTNER | null = PARTNER

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({
    viewer: VIEWER, partner, viewerIsA: true, isSolo: partner === null, isPast: false, canAccessGuardian: true,
  }),
  whoToMemberRole: (w: 'M' | 'T') => (w === 'M' ? 'a' : 'b'),
  useBaseCurrency: () => 'twd',
}))
vi.mock('@/actions/transaction', () => ({
  createTransaction: vi.fn(), editTransaction: vi.fn(), softDeleteTransaction: vi.fn(),
  getDescriptionSuggestions: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
}))
vi.mock('@/actions/tripExpense', () => ({ createTripExpense: vi.fn(), editTripExpense: vi.fn(), softDeleteTripExpense: vi.fn() }))
vi.mock('@/actions/asset', () => ({
  loadAsset: vi.fn(() => Promise.resolve(null)),
  loadAssetsForPicker: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/actions/income', () => ({
  createIncome: vi.fn(), editIncome: vi.fn(), softDeleteIncome: vi.fn(),
  getInsuranceAssets: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
}))
const ok = { ok: true as const, data: { id: 'x', txId: 'x' } }
vi.mock('@/actions/recurringExpense', () => ({
  createRule: vi.fn(), updateRule: vi.fn(), pauseRule: vi.fn(), resumeRule: vi.fn(), softDeleteRule: vi.fn(),
  editAndConfirmPending: vi.fn(), confirmPending: vi.fn(), skipPending: vi.fn(),
}))
vi.mock('@/actions/recurringIncome', () => ({
  createRule: vi.fn(), updateRule: vi.fn(), pauseRule: vi.fn(), resumeRule: vi.fn(), softDeleteRule: vi.fn(),
  editAndConfirmPending: vi.fn(), confirmPending: vi.fn(), skipPending: vi.fn(),
}))
vi.mock('@/app/(dashboard)/dashboard/_components/AssetLinkField', () => ({ AssetLinkField: () => null }))

import * as expenseActions from '@/actions/recurringExpense'
import * as incomeActions from '@/actions/recurringIncome'
import { RuleListItem } from '@/app/(dashboard)/settings/recurring/_components/RuleListItem'
import { PendingExpenseCard } from '@/app/(dashboard)/dashboard/_components/PendingExpenseCard'
import { PendingIncomeCard } from '@/app/(dashboard)/dashboard/_components/PendingIncomeCard'
import { RecurringRuleSheet } from '@/app/(dashboard)/_components/RecurringRuleSheet'
import { AddSheet } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { IncomeSheet } from '@/app/(dashboard)/dashboard/_components/IncomeSheet'

const FORMER = zhTW.common.formerPartner

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}
})
afterAll(() => { vi.unstubAllGlobals() })
beforeEach(() => {
  partner = PARTNER
  for (const m of [expenseActions, incomeActions]) {
    vi.mocked(m.updateRule).mockReset().mockResolvedValue(ok as never)
    vi.mocked(m.editAndConfirmPending).mockReset().mockResolvedValue(ok as never)
  }
})

const RULE_BASE = {
  amount: 50000, category: 'salary', assetId: null, intervalMonths: 1, dayOfMonth: 5,
  startsOn: '2026-01-05', endsOn: null, nextOccurrenceAt: '2026-11-05', pausedAt: null,
}
const formerIncomeRule = (formerLabel = true): RecurringIncomeRuleView => ({
  ...RULE_BASE, id: 'ri', source: 'B salary', recipientId: null, recipientIsFormer: true, formerLabel,
})
const formerExpenseRule = (formerLabel = true): RecurringExpenseRuleView => ({
  ...RULE_BASE, id: 're', category: 'other', description: 'B gym', splitType: 'half', splitRatioA: null,
  paidBy: null, paidByIsFormer: true, formerLabel,
})
const formerIncomePending = (formerLabel = true): PendingIncomeView => ({
  id: 'pi', ruleId: 'ri', proposedAmount: 50000, proposedDate: '2026-10-05', category: 'salary', source: 'B salary',
  assetId: null, recipientId: null, recipientIsFormer: true, formerLabel,
})
const formerExpensePending = (formerLabel = true): PendingExpenseView => ({
  id: 'pe', ruleId: 're', proposedAmount: 1200, proposedDate: '2026-10-05', proposedDescription: 'B gym',
  proposedSplitType: 'half', proposedSplitRatioA: null, category: 'other', assetId: null,
  proposedPaidBy: null, proposedPaidByIsFormer: true, formerLabel,
})

const wrap = (ui: React.ReactElement) => render(<I18nWrapper><ToastProvider>{ui}</ToastProvider></I18nWrapper>)
const saveBtn = () => screen.getByRole('button', { name: zhTW.common.save })

describe('T6 — labels: a former person is 「前伴侶」, never the current partner', () => {
  it('rule list (expense + income): 前伴侶, not Dana', () => {
    wrap(<ul>
      <RuleListItem type="expense" rule={formerExpenseRule()} onEdit={() => {}} />
      <RuleListItem type="income" rule={formerIncomeRule()} onEdit={() => {}} />
    </ul>)
    expect(screen.getAllByText(FORMER)).toHaveLength(2)
    expect(screen.queryByText(PARTNER.displayName)).toBeNull()
  })

  it('rule list, formerLabel false (pinned non-member): no name at all', () => {
    wrap(<ul><RuleListItem type="income" rule={formerIncomeRule(false)} onEdit={() => {}} /></ul>)
    expect(screen.queryByText(FORMER)).toBeNull()
    expect(screen.queryByText(PARTNER.displayName)).toBeNull()
  })

  it('pending expense card: 前伴侶, not Dana', () => {
    wrap(<PendingExpenseCard pending={formerExpensePending()} />)
    expect(screen.getByText(FORMER)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(PARTNER.displayName))).toBeNull()
  })

  it('pending income card: 前伴侶 (nothing when formerLabel is false)', () => {
    const { unmount } = wrap(<PendingIncomeCard pending={formerIncomePending()} />)
    expect(screen.getByText(FORMER)).toBeInTheDocument()
    unmount()
    wrap(<PendingIncomeCard pending={formerIncomePending(false)} />)
    expect(screen.queryByText(FORMER)).toBeNull()
  })
})

describe('T7 — RecurringRuleSheet edit of a former-person rule', () => {
  for (const kind of ['income', 'expense'] as const) {
    const sheet = () => kind === 'income'
      ? <RecurringRuleSheet type="income" open onClose={() => {}} onMutated={() => {}} initial={formerIncomeRule()} insuranceAssets={[]} />
      : <RecurringRuleSheet type="expense" open onClose={() => {}} onMutated={() => {}} initial={formerExpenseRule()} />
    const hint = kind === 'income' ? zhTW.recurringIncome.sheet.recipientFormerHint : zhTW.recurringExpense.sheet.paidByFormerHint
    const soloHint = kind === 'income' ? zhTW.recurringIncome.sheet.recipientFormerSoloHint : zhTW.recurringExpense.sheet.paidByFormerSoloHint
    const action = kind === 'income' ? incomeActions.updateRule : expenseActions.updateRule
    const personField = kind === 'income' ? 'recipientId' : 'paidBy'

    it(`${kind}, duo: nothing preselected, hint, save disabled until a person is picked`, async () => {
      wrap(sheet())
      expect(screen.getByText(hint)).toBeInTheDocument()
      const people = screen.getAllByRole('radio', { name: /^(我|對方)$/ })
      expect(people).toHaveLength(2)
      for (const r of people) expect(r).toHaveAttribute('aria-checked', 'false')
      expect(saveBtn()).toBeDisabled()
      fireEvent.click(saveBtn())
      expect(action).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('radio', { name: zhTW.common.partner }))
      expect(screen.queryByText(hint)).toBeNull()
      expect(saveBtn()).not.toBeDisabled()
      fireEvent.click(saveBtn())
      await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
      expect(vi.mocked(action).mock.calls[0][0]).toMatchObject({ id: kind === 'income' ? 'ri' : 're', [personField]: PARTNER.id })
    })

    it(`${kind}, solo: explicit 「會改記在你名下」 line, save allowed, writes the viewer`, async () => {
      partner = null
      wrap(sheet())
      expect(screen.getByText(soloHint)).toBeInTheDocument()
      expect(soloHint).toContain('會改記在你名下')
      expect(saveBtn()).not.toBeDisabled()
      fireEvent.click(saveBtn())
      await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
      expect(vi.mocked(action).mock.calls[0][0]).toMatchObject({ [personField]: VIEWER.id })
    })
  }
})

describe('T7 — dashboard edit-pending sheets of a former-person card', () => {
  const addSheet = () => (
    <AddSheet
      open onClose={() => {}} pendingExpenseId="pe" baseCurrency="twd"
      initial={{
        id: 'pe', amount: 1200, description: 'B gym', category: 'other', splitType: 'half', splitRatioA: null,
        payerId: null, payerFormer: true, transactedAt: '2026-10-05T00:00:00', assetId: null, notes: null,
      }}
    />
  )
  const incomeSheet = () => (
    <IncomeSheet
      open onClose={() => {}} mode="edit-pending" pendingId="pi"
      initial={{ id: 'pi', amount: 50000, category: 'salary', source: 'B salary', recipientId: null, recipientFormer: true, assetId: null, occurredAt: '2026-10-05' }}
    />
  )

  it('AddSheet, duo: no payer preselected, hint, save disabled; pick → editAndConfirmPending with the pick', async () => {
    wrap(addSheet())
    expect(screen.getByText(zhTW.recurringExpense.sheet.paidByFormerHint)).toBeInTheDocument()
    const people = screen.getAllByRole('radio', { name: /^(我|對方)$/ })
      expect(people).toHaveLength(2)
      for (const r of people) expect(r).toHaveAttribute('aria-checked', 'false')
    expect(saveBtn()).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: zhTW.common.partner }))
    expect(saveBtn()).not.toBeDisabled()
    fireEvent.click(saveBtn())
    await waitFor(() => expect(expenseActions.editAndConfirmPending).toHaveBeenCalledTimes(1))
    expect(vi.mocked(expenseActions.editAndConfirmPending).mock.calls[0][0])
      .toMatchObject({ pendingId: 'pe', overrides: { paidBy: PARTNER.id } })
  })

  it('AddSheet, solo: 「會改記在你名下」, save writes the viewer', async () => {
    partner = null
    wrap(addSheet())
    expect(screen.getByText(zhTW.recurringExpense.sheet.paidByFormerSoloHint)).toBeInTheDocument()
    expect(saveBtn()).not.toBeDisabled()
    fireEvent.click(saveBtn())
    await waitFor(() => expect(expenseActions.editAndConfirmPending).toHaveBeenCalledTimes(1))
    expect(vi.mocked(expenseActions.editAndConfirmPending).mock.calls[0][0])
      .toMatchObject({ overrides: { paidBy: VIEWER.id } })
  })

  it('IncomeSheet, duo: no recipient preselected, hint, save disabled; pick → editAndConfirmPending with the pick', async () => {
    wrap(incomeSheet())
    expect(screen.getByText(zhTW.recurringIncome.sheet.recipientFormerHint)).toBeInTheDocument()
    const partnerBtn = screen.getByRole('button', { name: new RegExp(`${zhTW.common.partner}$`) })
    const meBtn = screen.getByRole('button', { name: new RegExp(`${zhTW.common.me}$`) })
    expect(partnerBtn).toHaveAttribute('aria-pressed', 'false')
    expect(meBtn).toHaveAttribute('aria-pressed', 'false')
    expect(saveBtn()).toBeDisabled()
    fireEvent.click(partnerBtn)
    expect(saveBtn()).not.toBeDisabled()
    fireEvent.click(saveBtn())
    await waitFor(() => expect(incomeActions.editAndConfirmPending).toHaveBeenCalledTimes(1))
    expect(vi.mocked(incomeActions.editAndConfirmPending).mock.calls[0][0])
      .toMatchObject({ pendingId: 'pi', recipientId: PARTNER.id })
  })

  it('IncomeSheet, solo: 「會改記在你名下」, save writes the viewer', async () => {
    partner = null
    wrap(incomeSheet())
    expect(screen.getByText(zhTW.recurringIncome.sheet.recipientFormerSoloHint)).toBeInTheDocument()
    expect(saveBtn()).not.toBeDisabled()
    fireEvent.click(saveBtn())
    await waitFor(() => expect(incomeActions.editAndConfirmPending).toHaveBeenCalledTimes(1))
    expect(vi.mocked(incomeActions.editAndConfirmPending).mock.calls[0][0]).toMatchObject({ recipientId: VIEWER.id })
  })
})
