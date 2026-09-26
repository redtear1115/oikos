import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// Regression coverage for #1415: invite_link_opened carries group_id so it
// can be paired with the server-side invite_created / partner_joined events
// on the same business key (client/server events can't person-join — see
// docs/superpowers/specs/observability-design.md). See InviteConfirm.tsx.

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { InviteConfirm } from '@/app/invite/[token]/InviteConfirm'
import { track as trackMock } from '@/lib/analytics/track'

describe('InviteConfirm invite_link_opened telemetry (#1415)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fires invite_link_opened with group_id on mount, never the token', async () => {
    render(
      <InviteConfirm
        token="tok123"
        groupName="我們倆"
        inviterName="小明"
        hasSoloLedger={false}
        groupId="g1"
        trust={zhTW.trust}
        invite={zhTW.invite}
      />
    )

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('invite_link_opened', { group_id: 'g1' })
    })
    expect(trackMock).not.toHaveBeenCalledWith('invite_link_opened', expect.objectContaining({ token: expect.anything() }))
  })
})
