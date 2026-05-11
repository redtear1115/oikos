import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { WelcomeSoloCard } from '@/app/(dashboard)/dashboard/_components/WelcomeSoloCard'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

beforeEach(() => {
  window.localStorage.clear()
})

describe('WelcomeSoloCard', () => {
  it('renders nothing when there is no "just left" flag for this group', () => {
    const { container } = wrap(<WelcomeSoloCard groupId="grp-new" />)
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('surfaces the welcome card after the leaver lands with the flag set', () => {
    window.localStorage.setItem('futari_just_left_grp-new', '1')
    wrap(<WelcomeSoloCard groupId="grp-new" />)
    expect(screen.getByText('歡迎回到一個人')).toBeTruthy()
    expect(screen.getByText(/帳本完整地跟著你過來/)).toBeTruthy()
  })

  it('hides + clears the just-left flag and records dismissal on ✕', () => {
    window.localStorage.setItem('futari_just_left_grp-new', '1')
    wrap(<WelcomeSoloCard groupId="grp-new" />)
    fireEvent.click(screen.getByRole('button', { name: '關閉' }))
    expect(screen.queryByText('歡迎回到一個人')).toBeNull()
    expect(window.localStorage.getItem('futari_just_left_grp-new')).toBeNull()
    expect(window.localStorage.getItem('futari_welcome_solo_dismissed_grp-new')).toBe('1')
  })

  it('does not re-show after dismissal even if the just-left flag is set again', () => {
    window.localStorage.setItem('futari_welcome_solo_dismissed_grp-new', '1')
    window.localStorage.setItem('futari_just_left_grp-new', '1')
    const { container } = wrap(<WelcomeSoloCard groupId="grp-new" />)
    expect(container.querySelector('[role="status"]')).toBeNull()
  })
})
