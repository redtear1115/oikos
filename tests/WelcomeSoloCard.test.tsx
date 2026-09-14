import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { WelcomeSoloCard } from '@/app/(dashboard)/dashboard/_components/WelcomeSoloCard'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

beforeEach(() => {
  window.localStorage.clear()
})

describe('WelcomeSoloCard', () => {
  it('renders nothing when there is no "just left" flag for this epoch', () => {
    const { container } = wrap(<WelcomeSoloCard epochId="epoch-new" />)
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('surfaces the welcome card after the leaver lands with the flag set', () => {
    window.localStorage.setItem('futari_just_left_epoch-new', '1')
    wrap(<WelcomeSoloCard epochId="epoch-new" />)
    expect(screen.getByText('歡迎回到一個人')).toBeTruthy()
    expect(screen.getByText(/帳本完整地跟著你過來/)).toBeTruthy()
  })

  it('hides + clears the just-left flag and records dismissal on ✕', () => {
    window.localStorage.setItem('futari_just_left_epoch-new', '1')
    wrap(<WelcomeSoloCard epochId="epoch-new" />)
    fireEvent.click(screen.getByRole('button', { name: '關閉' }))
    expect(screen.queryByText('歡迎回到一個人')).toBeNull()
    expect(window.localStorage.getItem('futari_just_left_epoch-new')).toBeNull()
    expect(window.localStorage.getItem('futari_welcome_solo_dismissed_epoch-new')).toBe('1')
  })

  it('does not re-show after dismissal even if the just-left flag is set again', () => {
    window.localStorage.setItem('futari_welcome_solo_dismissed_epoch-new', '1')
    window.localStorage.setItem('futari_just_left_epoch-new', '1')
    const { container } = wrap(<WelcomeSoloCard epochId="epoch-new" />)
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  // ─── #1125: both keys are epoch-keyed, and they moved together ─────────────

  it('keys BOTH the flag and the dismissal off the epoch, never the group', () => {
    // Pinning the pair: re-keying one without the other is what would make an
    // already-dismissed card come back, and nothing else in the suite would
    // notice — the card would simply render again on a device that had
    // dismissed it.
    window.localStorage.setItem('futari_just_left_epoch-new', '1')
    wrap(<WelcomeSoloCard epochId="epoch-new" />)
    fireEvent.click(screen.getByRole('button', { name: '關閉' }))

    const written = Object.keys(window.localStorage)
    expect(written).toEqual(['futari_welcome_solo_dismissed_epoch-new'])
    // Nothing group-shaped survives on either side of the pair.
    expect(written.some((k) => k.endsWith('_grp-new'))).toBe(false)
  })

  it('ignores a flag left on a previous epoch of the same group', () => {
    window.localStorage.setItem('futari_just_left_epoch-old', '1')
    const { container } = wrap(<WelcomeSoloCard epochId="epoch-new" />)
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('stays hidden and writes nothing when epochId is null', () => {
    // `EpochWindow.epochId` is nullable (defensive fallback in
    // lib/db/queries/epoch.ts for a group with no epoch row). Without the
    // guard the key would be assembled as `futari_just_left_null`, shared by
    // every such group on the device — one group's dismissal would hide
    // another group's card, silently.
    window.localStorage.setItem('futari_just_left_null', '1')
    const { container } = wrap(<WelcomeSoloCard epochId={null} />)
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(window.localStorage.getItem('futari_welcome_solo_dismissed_null')).toBeNull()
  })
})
