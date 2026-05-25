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

  it('reflects the solo lock — all_mine is checked regardless of stored value', () => {
    // Stored preference is half, but solo forces the displayed value to all_mine.
    const checked = (() => {
      wrap({ current: 'half', isSolo: true })
      return screen.getAllByRole('radio', { checked: true })
    })()
    expect(checked).toHaveLength(1)
    expect(checked[0].textContent).toContain('全部我的')
  })
})
