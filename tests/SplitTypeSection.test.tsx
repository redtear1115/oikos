import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { SplitTypeSection } from '@/app/(dashboard)/settings/_components/sections/SplitTypeSection'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/actions/profile', () => ({ updateDefaultSplitType: vi.fn() }))

beforeEach(() => { vi.clearAllMocks() })

function wrap(props: { current: 'all_mine' | 'all_theirs' | 'half'; isSolo: boolean }) {
  return render(
    <I18nWrapper>
      <SplitTypeSection {...props} />
    </I18nWrapper>,
  )
}

describe('SplitTypeSection — a11y', () => {
  it('exposes a radiogroup with three radios', () => {
    wrap({ current: 'half', isSolo: false })
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('marks exactly the current split type as checked', () => {
    wrap({ current: 'half', isSolo: false })
    const checked = screen.getAllByRole('radio', { checked: true })
    expect(checked).toHaveLength(1)
    // '平分' = even/half
    expect(checked[0].textContent).toContain('平分')
  })

})

// #1122 — solo used to render all three radios disabled, including "全部對方的"
// for a partner who isn't there. It now renders the one configuration that
// exists, as a readout rather than a dead control.
describe('SplitTypeSection — solo', () => {
  it('renders a single row for 全部我的, with no radios and nothing disabled', () => {
    const { container } = wrap({ current: 'half', isSolo: true })
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByText('全部我的')).toBeTruthy()
    expect(container.querySelectorAll('button:disabled')).toHaveLength(0)
  })

  it('never renders 全部對方的 — the option names a partner who is not here', () => {
    wrap({ current: 'all_theirs', isSolo: true })
    expect(screen.queryByText('全部對方的')).toBeNull()
    expect(screen.queryByText('平分')).toBeNull()
  })

  it('does not write the stored preference back — solo is a display, not a save', async () => {
    const { updateDefaultSplitType } = await import('@/actions/profile')
    wrap({ current: 'half', isSolo: true })
    screen.getByText('全部我的').click()
    expect(updateDefaultSplitType).not.toHaveBeenCalled()
  })

  it('shows the solo hint, and the hint does not promise a future partner', () => {
    wrap({ current: 'half', isSolo: true })
    const hint = screen.getByText(/單人狀態下/)
    expect(hint).toBeTruthy()
    expect(hint.textContent).not.toContain('邀請')
    expect(hint.textContent).not.toContain('加入後')
  })

  it('keeps the group label reachable for assistive tech', () => {
    wrap({ current: 'half', isSolo: true })
    expect(screen.getByRole('group', { name: '預設分攤方式' })).toBeTruthy()
  })
})
