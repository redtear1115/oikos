import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'

const refresh = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push }),
}))

// Spy on the membership server actions; these run only when the user reaches
// the corresponding exit, so a test that never gets there should never fire one.
const proposeSwap = vi.fn()
const leaveGroup = vi.fn()
vi.mock('@/actions/membership', () => ({
  proposeSwap: () => proposeSwap(),
  leaveGroup: () => leaveGroup(),
  cancelSwap: vi.fn(),
  confirmSwap: vi.fn(),
}))

import { LeaveGroupFlow } from '@/app/(dashboard)/settings/_components/LeaveGroupFlow'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

beforeEach(() => {
  proposeSwap.mockReset()
  leaveGroup.mockReset()
  refresh.mockReset()
  push.mockReset()
})

describe('LeaveGroupFlow — member_b path (can leave directly)', () => {
  it('walks 1 → 2 → 3 → 4 then reveals final-confirm with the type-to-confirm input', () => {
    wrap(
      <LeaveGroupFlow
        open
        onClose={() => {}}
        viewerIsMemberA={false}
        viewerName="小明"
        partnerName="小華"
        groupBalance={0}
      />,
    )

    // Step 1: viewer is the secondary holder.
    expect(screen.getByText('你目前是這本帳本的「副帳號」')).toBeTruthy()
    fireEvent.click(screen.getByText('下一步'))
    // Step 2: explanation of member_a leaving (the partner here is member_a).
    expect(screen.getByText(/小華（主帳號）離開會發生什麼/)).toBeTruthy()
    fireEvent.click(screen.getByText('下一步'))
    // Step 3: explanation of member_b leaving (the viewer is member_b).
    expect(screen.getByText(/小明（副帳號）離開會發生什麼/)).toBeTruthy()
    fireEvent.click(screen.getByText('下一步'))
    // Step 4: yes/no decision.
    fireEvent.click(screen.getByText('是的，我要離開'))

    // Now in final-confirm. Balance is 0, so the type-to-confirm input shows.
    expect(screen.getByText('帳目已結清，可以離開')).toBeTruthy()
    expect(proposeSwap).not.toHaveBeenCalled()
    expect(leaveGroup).not.toHaveBeenCalled()
  })

  it('disables the leave button until the user types the magic word', () => {
    wrap(
      <LeaveGroupFlow
        open
        onClose={() => {}}
        viewerIsMemberA={false}
        viewerName="小明"
        partnerName="小華"
        groupBalance={0}
      />,
    )
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('是的，我要離開'))

    const leaveBtn = screen.getByText('確定離開') as HTMLButtonElement
    expect(leaveBtn.disabled).toBe(true)

    const input = screen.getByPlaceholderText('離開') as HTMLInputElement
    fireEvent.change(input, { target: { value: '離開' } })
    expect(leaveBtn.disabled).toBe(false)
  })

  it('blocks the user with a settle CTA when balance ≠ 0', () => {
    wrap(
      <LeaveGroupFlow
        open
        onClose={() => {}}
        viewerIsMemberA={false}
        viewerName="小明"
        partnerName="小華"
        groupBalance={1234}
      />,
    )
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('是的，我要離開'))

    expect(screen.getByText(/還有 NT\$ 1,234 沒結清/)).toBeTruthy()
    // The type-to-confirm input is hidden when blocked.
    expect(screen.queryByPlaceholderText('離開')).toBeNull()
    fireEvent.click(screen.getByText('前往主畫面結算'))
    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(leaveGroup).not.toHaveBeenCalled()
  })

  it('calls leaveGroup when the user types the magic word and confirms', async () => {
    leaveGroup.mockResolvedValue({ groupId: 'new-grp' })
    wrap(
      <LeaveGroupFlow
        open
        onClose={() => {}}
        viewerIsMemberA={false}
        viewerName="小明"
        partnerName="小華"
        groupBalance={0}
      />,
    )
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('是的，我要離開'))
    fireEvent.change(screen.getByPlaceholderText('離開'), { target: { value: '離開' } })
    fireEvent.click(screen.getByText('確定離開'))

    await waitFor(() => expect(leaveGroup).toHaveBeenCalledTimes(1))
    expect(push).toHaveBeenCalledWith('/dashboard')
  })
})

describe('LeaveGroupFlow — member_a path (must swap first)', () => {
  it("card 4's affirmative for member_a fires proposeSwap, not leaveGroup", async () => {
    proposeSwap.mockResolvedValue({ ok: true })
    wrap(
      <LeaveGroupFlow
        open
        onClose={() => {}}
        viewerIsMemberA={true}
        viewerName="小明"
        partnerName="小華"
        groupBalance={0}
      />,
    )
    // Card 1 reflects role A.
    expect(screen.getByText('你目前是這本帳本的「主帳號」')).toBeTruthy()
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('下一步'))
    // Card 4: affirmative is the swap button, not the direct-leave button.
    fireEvent.click(screen.getByText('是的，先發起身份互換'))

    await waitFor(() => expect(proposeSwap).toHaveBeenCalledTimes(1))
    expect(leaveGroup).not.toHaveBeenCalled()
    // After success the user lands on the swap-sent confirmation card.
    expect(screen.getByText('已送出互換邀請')).toBeTruthy()
  })

  it('surfaces a localized error if proposeSwap fails with a known code', async () => {
    proposeSwap.mockRejectedValue(new Error('swap_already_pending'))
    wrap(
      <LeaveGroupFlow
        open
        onClose={() => {}}
        viewerIsMemberA={true}
        viewerName="小明"
        partnerName="小華"
        groupBalance={0}
      />,
    )
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('下一步'))
    fireEvent.click(screen.getByText('是的，先發起身份互換'))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/已經有一個身份互換提議了/))
  })
})
