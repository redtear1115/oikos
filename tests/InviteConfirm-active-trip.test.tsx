import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { en } from '@/lib/i18n/locales/en'

// #1290 — acceptInvite refuses while the accepter has a trip in progress in
// their own ledger (`accept_active_trip`). The accept screen must show the
// localized sentence for it. What it looks like when this regresses: the
// generic "can't join" message, with nothing telling the person to end the
// trip first.

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/actions/invite', () => ({
  acceptInvite: vi.fn(async () => ({ ok: false, code: 'accept_active_trip' })),
}))

import { InviteConfirm } from '@/app/invite/[token]/InviteConfirm'

describe('InviteConfirm — accept refused for an active trip', () => {
  it.each([
    ['zh-TW', zhTW],
    ['en', en],
  ])('shows the %s active-trip message', async (_label, t) => {
    render(
      <InviteConfirm
        token="tok"
        groupName="g"
        inviterName="a"
        hasSoloLedger
        groupId="g1"
        trust={t.trust}
        invite={t.invite}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(t.invite.errors.activeTrip)
    })
    expect(t.invite.errors.activeTrip).not.toBe(t.invite.errors.unknown)
  })
})
