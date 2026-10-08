/**
 * #1558 S3 phase 2 — a friend adds / edits / deletes an expense and deletes a
 * repayment on the public outing page, through S4's shared ExpenseSheet and
 * SettlementList (not copies). Actions are mocked; the server side — the
 * friend resolved by claim cookie or session — is S2's
 * (__tests__/actions/outing-link-join.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

const actions = vi.hoisted(() => ({
  addOutingExpense: vi.fn(),
  editOutingExpense: vi.fn(),
  deleteOutingExpense: vi.fn(),
  deleteOutingSettlement: vi.fn(),
  recordOutingSettlement: vi.fn(),
  bindOutingParticipant: vi.fn(),
}))
vi.mock('@/actions/outing', () => actions)

const track = vi.hoisted(() => vi.fn())
vi.mock('@/lib/analytics/track', () => ({ track }))

import { OutingParticipantView } from '@/app/[locale]/outing/_components/OutingParticipantView'
import { ExpenseSheet } from '@/app/(dashboard)/outings/_components/ExpenseSheet'
import { SettlementList } from '@/app/(dashboard)/outings/_components/SettlementList'

const to = zhTW.outing
const ok = <T,>(data: T) => ({ ok: true as const, data })

const ID = '0b0e7d3c-6b7e-4c8e-9a51-2f7d3c6b7e4c'
const participants = [
  { id: 'A', displayName: '阿傑', claim: 'claimed' as const, active: true, net: 600 },
  { id: 'B', displayName: '小芳', claim: 'unclaimed' as const, active: true, net: -300 },
  { id: 'G', displayName: '老王', claim: 'unclaimed' as const, active: false, net: -300 },
]
const expense = {
  id: 'e1', paidByParticipantId: 'A', amount: 900, description: '午餐', category: 'food',
  transactedAt: new Date('2026-10-01T04:00:00Z'), enteredByParticipantId: 'A',
  shares: [{ participantId: 'A', shareAmount: 300 }, { participantId: 'B', shareAmount: 300 }, { participantId: 'G', shareAmount: 300 }],
}
const settlement = { id: 's1', fromParticipantId: 'B', toParticipantId: 'A', amount: 100 }

const view = (status: 'active' | 'ended' = 'active') => ({
  outing: { id: ID, name: '綠島', currency: 'twd', status },
  youParticipantId: 'A',
  participants,
  expenses: [expense],
  settlements: [settlement],
  transfers: [],
})

const page = (status: 'active' | 'ended' = 'active') =>
  render(
    <I18nWrapper>
      <OutingParticipantView view={view(status)} needsBind={false} signedIn={false} signInHref="/zh-TW/sign-in" />
    </I18nWrapper>,
  )

// Every sheet stays mounted while closed (inert, no dialog role), so scope
// queries to the one open dialog: the settle sheet has its own payer / amount.
const sheet = () => screen.getByRole('dialog')
const chips = (label: string) =>
  within(within(sheet()).getByText(label).parentElement as HTMLElement).getAllByRole('button')
const sheetSave = (name: string) => within(sheet()).getAllByRole('button', { name }).at(-1)!

beforeEach(() => {
  vi.clearAllMocks()
})

describe('public page: add an expense', () => {
  it('opens the shared ExpenseSheet, saves through addOutingExpense, and records outing_expense_added', async () => {
    actions.addOutingExpense.mockResolvedValue(ok({ id: 'e2' }))
    page()
    fireEvent.click(screen.getByRole('button', { name: to.addExpense }))
    // Active people only; 老王 was removed and is not on a new expense.
    expect(chips(to.form.payerLabel).map((b) => b.textContent)).toEqual(['阿傑', '小芳'])
    fireEvent.click(chips(to.form.payerLabel)[1])
    fireEvent.change(within(sheet()).getByPlaceholderText('0'), { target: { value: '450' } })
    fireEvent.click(sheetSave(to.form.saveExpense))

    await waitFor(() => expect(actions.addOutingExpense).toHaveBeenCalledWith({
      outingId: ID, paidByParticipantId: 'B', amount: 450, participantIds: ['A', 'B'], description: undefined,
    }))
    await waitFor(() => expect(track).toHaveBeenCalledWith('outing_expense_added', { actor: 'participant' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('the event carries the actor only — no outing, expense or participant id, no token', async () => {
    actions.addOutingExpense.mockResolvedValue(ok({ id: 'e2' }))
    page()
    fireEvent.click(screen.getByRole('button', { name: to.addExpense }))
    fireEvent.click(chips(to.form.payerLabel)[0])
    fireEvent.change(within(sheet()).getByPlaceholderText('0'), { target: { value: '100' } })
    fireEvent.click(sheetSave(to.form.saveExpense))
    await waitFor(() => expect(track).toHaveBeenCalled())
    const [name, props] = track.mock.calls.find(([n]) => n === 'outing_expense_added')!
    expect(name).toBe('outing_expense_added')
    expect(props).toEqual({ actor: 'participant' })
    expect(JSON.stringify(props)).not.toMatch(new RegExp(`${ID}|e2|"A"|"B"`))
  })
})

describe('public page: edit / delete an expense', () => {
  it('a feed row opens the sheet in edit mode, keeps a removed person already on it, saves via editOutingExpense', async () => {
    actions.editOutingExpense.mockResolvedValue(ok({ id: 'e3' }))
    page()
    fireEvent.click(screen.getByText('午餐'))
    expect(screen.getAllByText(to.editExpense).length).toBeGreaterThan(0)
    expect(chips(to.form.splitLabel).map((b) => b.textContent)).toEqual(['阿傑', '小芳', '老王'])
    fireEvent.change(within(sheet()).getByDisplayValue('900'), { target: { value: '1200' } })
    fireEvent.click(sheetSave(zhTW.common.update))

    await waitFor(() => expect(actions.editOutingExpense).toHaveBeenCalledWith({
      outingId: ID, expenseId: 'e1', paidByParticipantId: 'A', amount: 1200,
      participantIds: ['A', 'B', 'G'], description: '午餐', category: 'food',
    }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(track).not.toHaveBeenCalledWith('outing_expense_added', expect.anything())
  })

  it('delete asks first, then calls deleteOutingExpense; no "added" event', async () => {
    actions.deleteOutingExpense.mockResolvedValue(ok(undefined))
    page()
    fireEvent.click(screen.getByText('午餐'))
    fireEvent.click(within(sheet()).getByRole('button', { name: to.deleteExpense }))
    const dialog = await screen.findByRole('dialog', { name: to.deleteExpenseConfirmTitle })
    fireEvent.click(within(dialog).getByRole('button', { name: zhTW.common.delete }))
    await waitFor(() => expect(actions.deleteOutingExpense).toHaveBeenCalledWith({ outingId: ID, expenseId: 'e1' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(track).not.toHaveBeenCalledWith('outing_expense_added', expect.anything())
  })
})

describe('public page: delete a repayment', () => {
  it('lists recorded repayments and deletes one after a confirm', async () => {
    actions.deleteOutingSettlement.mockResolvedValue(ok(undefined))
    page()
    expect(screen.getByText(to.settlementsLabel)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: to.deleteSettlementAria.replace('{row}', '小芳 → 阿傑') }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: zhTW.common.delete }))
    await waitFor(() => expect(actions.deleteOutingSettlement).toHaveBeenCalledWith({ outingId: ID, settlementId: 's1' }))
  })
})

describe('public page: ended outing', () => {
  it('is read-only: no add button, rows do not open, repayments stay without delete', () => {
    page('ended')
    expect(screen.queryByRole('button', { name: to.addExpense })).toBeNull()
    const row = screen.getByText('午餐').closest('button')!
    expect(row.disabled).toBe(true)
    fireEvent.click(row)
    expect(screen.queryByText(to.editExpense)).toBeNull()
    expect(screen.getByText(to.settlementsLabel)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /刪除還款/ })).toBeNull()
  })
})

describe('reuse, not a fork', () => {
  it('the public view renders the dashboard components themselves', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('app/[locale]/outing/_components/OutingParticipantView.tsx', 'utf8'))
    expect(src).toContain("from '@/app/(dashboard)/outings/_components/ExpenseSheet'")
    expect(src).toContain("from '@/app/(dashboard)/outings/_components/SettlementList'")
    expect(typeof ExpenseSheet).toBe('function')
    expect(typeof SettlementList).toBe('function')
  })
})
