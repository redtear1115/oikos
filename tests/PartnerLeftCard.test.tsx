import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { PartnerLeftCard } from '@/app/(dashboard)/dashboard/_components/PartnerLeftCard'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

beforeEach(() => {
  window.localStorage.clear()
})

describe('PartnerLeftCard', () => {
  it('renders heading with partner name and body when not yet dismissed', () => {
    wrap(<PartnerLeftCard partnerName="小華" currentEpochId="epoch-1" />)
    expect(screen.getByText('⟂ 小華 已離開')).toBeTruthy()
    expect(screen.getByText(/從這裡開始，是你一個人的時光/)).toBeTruthy()
  })

  it('renders nothing when localStorage already has the dismiss flag for this epoch', () => {
    window.localStorage.setItem('futari_partner_left_epoch-1', '1')
    const { container } = wrap(<PartnerLeftCard partnerName="小華" currentEpochId="epoch-1" />)
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('hides itself + persists the dismiss flag when ✕ is tapped', () => {
    wrap(<PartnerLeftCard partnerName="小華" currentEpochId="epoch-1" />)
    fireEvent.click(screen.getByRole('button', { name: '關閉' }))
    expect(screen.queryByText('⟂ 小華 已離開')).toBeNull()
    expect(window.localStorage.getItem('futari_partner_left_epoch-1')).toBe('1')
  })

  it('uses currentEpochId as the dismiss key — a future leave (new epoch) re-shows the card', () => {
    // Dismissed for epoch-1.
    window.localStorage.setItem('futari_partner_left_epoch-1', '1')
    wrap(<PartnerLeftCard partnerName="小明" currentEpochId="epoch-2" />)
    // Different epoch id → card surfaces again.
    expect(screen.getByText('⟂ 小明 已離開')).toBeTruthy()
  })
})
