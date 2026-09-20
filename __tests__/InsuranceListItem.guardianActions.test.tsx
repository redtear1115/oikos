import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, within, waitFor } from '@testing-library/react'

// #1324 — pins two fixes on InsuranceListItem's renew/lapse flow:
//   1. The renew dialog used to be an always-mounted, hand-rolled panel
//      hidden only by opacity/pointerEvents — its TextInput and two buttons
//      stayed in Tab/VoiceOver order on every row, even closed.
//   2. handleRenew / handleLapse swallowed failures with console.error only —
//      the dialog just sat there with no feedback.

const renewInsuranceMock = vi.fn()
const lapseInsuranceMock = vi.fn()

vi.mock('@/actions/asset', () => ({
  renewInsurance: (...args: unknown[]) => renewInsuranceMock(...args),
  lapseInsurance: (...args: unknown[]) => lapseInsuranceMock(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { InsuranceListItem } from '@/app/(dashboard)/assets/_components/InsuranceListItem'
import { TranslationsProvider } from '@/lib/i18n/client'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

const i = zhTW.assets.insuranceList

function baseData(overrides: Partial<Parameters<typeof InsuranceListItem>[0]['data']> = {}) {
  return {
    insuranceType: 'life',
    insured: null,
    insuredChildId: null,
    insuredChildName: null,
    insuredUserId: null,
    insuredUserDisplayName: null,
    policyHolderUserId: null,
    policyHolderDisplayName: null,
    policyHolderAvatarUrl: null,
    insurer: '國泰人壽',
    annualPremium: 12000,
    sumInsured: 1000000,
    // Expired single-year policy → renders the 已續保 / 已停止 action row.
    startsAt: '2025-01-01',
    expiryDate: '2026-01-01',
    termYears: 1,
    payCycle: null,
    reminderDaysBefore: 30,
    notes: null,
    ...overrides,
  }
}

function renderList(count: number) {
  return render(
    <TranslationsProvider value={zhTW} locale="zh-TW">
      {Array.from({ length: count }, (_, n) => (
        <InsuranceListItem key={n} id={`policy-${n}`} name={`保單 ${n}`} data={baseData()} />
      ))}
    </TranslationsProvider>,
  )
}

afterEach(() => {
  cleanup()
  renewInsuranceMock.mockReset()
  lapseInsuranceMock.mockReset()
})

describe('InsuranceListItem guardian actions (#1324)', () => {
  it('leaves no focusable dialog controls in a closed multi-policy list', () => {
    renderList(3)

    // Both dialogs are closed for every row — nothing dialog-shaped should
    // be in the DOM at all (not merely hidden), so Tab/VoiceOver never see
    // the renew input or its buttons.
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
    expect(screen.queryByPlaceholderText(i.renewPolicyNoPlaceholder)).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    // Only the two row-level trigger buttons per policy remain — the renew
    // dialog's own Cancel/Confirm pair (t.common.cancel + i.renewConfirm)
    // must not be in the tree while the dialog is closed.
    expect(screen.getAllByRole('button', { name: i.renewAction })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: i.lapseAction })).toHaveLength(3)
    expect(screen.queryAllByRole('button', { name: zhTW.common.cancel })).toHaveLength(0)
  })

  it('opens a real dialog (role, focus trap) once the renew action is triggered', () => {
    renderList(1)

    fireEvent.click(screen.getByRole('button', { name: i.renewAction }))

    const dialog = screen.getByRole('dialog', { name: i.renewTitle })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByPlaceholderText(i.renewPolicyNoPlaceholder)).toBeInTheDocument()
  })

  it('shows an inline alert and keeps the dialog open when renew fails', async () => {
    renewInsuranceMock.mockResolvedValue({ ok: false, code: 'not_a_real_code' })
    renderList(1)

    fireEvent.click(screen.getByRole('button', { name: i.renewAction }))
    const dialog = screen.getByRole('dialog', { name: i.renewTitle })
    // renewAction ("已續保", the row button) and renewConfirm share the same
    // zh-TW copy, so the confirm button must be queried scoped to the dialog.
    fireEvent.click(within(dialog).getByRole('button', { name: i.renewConfirm }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(i.renewError)
    // Dialog stays open so the user can retry, per CLAUDE.md action-error convention.
    expect(screen.getByRole('dialog', { name: i.renewTitle })).toBeInTheDocument()
  })

  it('shows an inline alert and keeps the dialog open when lapse fails', async () => {
    lapseInsuranceMock.mockResolvedValue({ ok: false, code: 'not_a_real_code' })
    renderList(1)

    fireEvent.click(screen.getByRole('button', { name: i.lapseAction }))
    const dialog = screen.getByRole('dialog', { name: i.lapseTitle })
    fireEvent.click(within(dialog).getByRole('button', { name: i.lapseConfirm }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(i.lapseError)
    expect(screen.getByRole('dialog', { name: i.lapseTitle })).toBeInTheDocument()
  })

  it('closes the renew dialog and refreshes on success', async () => {
    renewInsuranceMock.mockResolvedValue({ ok: true, data: undefined })
    renderList(1)

    fireEvent.click(screen.getByRole('button', { name: i.renewAction }))
    const dialog = screen.getByRole('dialog', { name: i.renewTitle })
    fireEvent.click(within(dialog).getByRole('button', { name: i.renewConfirm }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: i.renewTitle })).toBeNull()
    })
  })
})
