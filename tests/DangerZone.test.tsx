import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'

const refresh = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push }),
}))

const cancelSwap = vi.fn()
const confirmSwap = vi.fn()
vi.mock('@/actions/membership', () => ({
  proposeSwap: vi.fn(),
  leaveGroup: vi.fn(),
  cancelSwap: () => cancelSwap(),
  confirmSwap: () => confirmSwap(),
}))

import { DangerZone } from '@/app/(dashboard)/settings/_components/DangerZone'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

beforeEach(() => {
  cancelSwap.mockReset()
  confirmSwap.mockReset()
  refresh.mockReset()
  push.mockReset()
})

describe('DangerZone — swap-pending banner', () => {
  it('renders nothing for the banner when no swap is pending', () => {
    wrap(
      <DangerZone
        viewerIsMemberA={false}
        viewerName="小明"
        partnerName="小華"
        groupBalance={0}
        pendingSwap={null}
        locale="zh-TW"
      />,
    )
    // The leave CTA always renders; swap headlines do not.
    expect(screen.getByText('我想離開這本帳本')).toBeTruthy()
    expect(screen.queryByText(/提出了身份互換/)).toBeNull()
  })

  it('shows withdraw-only when the viewer proposed the swap themselves', async () => {
    cancelSwap.mockResolvedValue({ ok: true })
    wrap(
      <DangerZone
        viewerIsMemberA={false}
        viewerName="小明"
        partnerName="小華"
        groupBalance={0}
        pendingSwap={{ by: 'self', expiresAt: new Date('2026-05-18') }}
        locale="zh-TW"
      />,
    )
    expect(screen.getByText('你提出了身份互換，等對方確認')).toBeTruthy()
    expect(screen.queryByText('接受並互換')).toBeNull()

    fireEvent.click(screen.getByText('撤回'))
    await waitFor(() => expect(cancelSwap).toHaveBeenCalledTimes(1))
    expect(refresh).toHaveBeenCalled()
  })

  it('shows reject + accept when the partner proposed the swap', async () => {
    confirmSwap.mockResolvedValue({ ok: true })
    wrap(
      <DangerZone
        viewerIsMemberA={false}
        viewerName="小明"
        partnerName="小華"
        groupBalance={0}
        pendingSwap={{ by: 'partner', expiresAt: new Date('2026-05-18') }}
        locale="zh-TW"
      />,
    )
    expect(screen.getByText('小華 提出了身份互換，等你確認')).toBeTruthy()

    fireEvent.click(screen.getByText('接受並互換'))
    await waitFor(() => expect(confirmSwap).toHaveBeenCalledTimes(1))
    expect(refresh).toHaveBeenCalled()
  })

  it('surfaces a localized error from confirmSwap', async () => {
    confirmSwap.mockRejectedValue(new Error('swap_expired'))
    wrap(
      <DangerZone
        viewerIsMemberA={false}
        viewerName="小明"
        partnerName="小華"
        groupBalance={0}
        pendingSwap={{ by: 'partner', expiresAt: new Date('2026-05-18') }}
        locale="zh-TW"
      />,
    )
    fireEvent.click(screen.getByText('接受並互換'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/這個提議已過期/))
  })
})
