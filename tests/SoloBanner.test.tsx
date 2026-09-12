import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'

// SoloBanner no longer reads MemberContext at all: since #1031 `createInvite()`
// resolves the group from the viewer server-side, so the banner has no group id
// to pass and the stub that used to live here is gone.

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
  // Regression for #969. History: #61 (2026-05-09) wired an embedded mode
  // toggle inside SoloBanner, back when this banner was the only place that
  // rendered one. The L1/L2/L3 restructure (7d17f7d, 2026-05-17) moved the
  // toggle to the Dashboard L2 row and dropped BalanceHero's copy — but left
  // SoloBanner's, so solo users saw the 支出/收入 pills twice.
  //
  // The toggle is now owned solely by the Dashboard L2 row (rendered
  // unconditionally, so solo still gets a working one). SoloBanner must not
  // render a second copy.
  it('does not render its own mode toggle', () => {
    const { queryByRole } = wrap(<SoloBanner />)
    expect(queryByRole('button', { name: /收入模式/ })).toBeNull()
    expect(queryByRole('button', { name: /支出模式/ })).toBeNull()
  })

  it('still renders the invite CTA and dismiss control', () => {
    const onDismiss = vi.fn()
    const { getByRole } = wrap(<SoloBanner onDismiss={onDismiss} />)
    expect(getByRole('button', { name: /邀請|invite/i })).toBeTruthy()
  })
})
