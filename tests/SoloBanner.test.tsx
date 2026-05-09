import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'

// Stub `useMember` — SoloBanner only reads `group.id` to feed the invite action,
// which we never trigger in this test.
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({ group: { id: 'g-1' } }),
}))

// The invite server action shouldn't run during a unit test.
vi.mock('@/actions/invite', () => ({
  createInvite: vi.fn(),
}))

vi.mock('@/lib/share', () => ({
  shareInviteLink: vi.fn(),
}))

import { SoloBanner } from '@/app/(dashboard)/dashboard/_components/SoloBanner'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

describe('SoloBanner', () => {
  // Regression for #61: when SoloBanner is visible the embedded mode toggle
  // must forward clicks. Earlier it dropped `onChange`, leaving the income tab
  // dead until the user dismissed the banner.
  it('forwards income-tab clicks through onModeChange', () => {
    const onModeChange = vi.fn()
    const { getByRole } = wrap(
      <SoloBanner mode="expense" onModeChange={onModeChange} />,
    )
    fireEvent.click(getByRole('button', { name: /進帳模式/ }))
    expect(onModeChange).toHaveBeenCalledWith('income')
  })

  it('forwards expense-tab clicks back through onModeChange', () => {
    const onModeChange = vi.fn()
    const { getByRole } = wrap(
      <SoloBanner mode="income" onModeChange={onModeChange} />,
    )
    fireEvent.click(getByRole('button', { name: /支出模式/ }))
    expect(onModeChange).toHaveBeenCalledWith('expense')
  })
})
