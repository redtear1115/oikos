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
    expect(screen.getByText('小華 已離開')).toBeTruthy()
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
    expect(screen.queryByText('小華 已離開')).toBeNull()
    expect(window.localStorage.getItem('futari_partner_left_epoch-1')).toBe('1')
  })

  it('uses currentEpochId as the dismiss key — a future leave (new epoch) re-shows the card', () => {
    // Dismissed for epoch-1.
    window.localStorage.setItem('futari_partner_left_epoch-1', '1')
    wrap(<PartnerLeftCard partnerName="小明" currentEpochId="epoch-2" />)
    // Different epoch id → card surfaces again.
    expect(screen.getByText('小明 已離開')).toBeTruthy()
  })

  it('has no ⟂ (U+27C2) in the heading — the glyph is not in the CJK fallback chain', () => {
    wrap(<PartnerLeftCard partnerName="小華" currentEpochId="epoch-1" />)
    expect(screen.getByRole('status').textContent).not.toContain('⟂')
  })
})

// #1121 — removal is server-indistinguishable from departure, so the remover
// used to be told their partner left. RemovePartnerFlow writes an epoch-keyed
// flag; these cover the variant it selects.
describe('PartnerLeftCard — removal variant', () => {
  it('renders the removal copy (not "{partner} 已離開") when the removed flag is set for this epoch', () => {
    window.localStorage.setItem('futari_partner_removed_epoch-1', '1')
    wrap(<PartnerLeftCard partnerName="小華" currentEpochId="epoch-1" />)
    expect(screen.getByText('回到一個人')).toBeTruthy()
    expect(screen.getByText(/帳本完整地留著/)).toBeTruthy()
    // The remover must not be told that the person they removed left them.
    expect(screen.queryByText('小華 已離開')).toBeNull()
  })

  it('does not name the removed partner anywhere in the card', () => {
    window.localStorage.setItem('futari_partner_removed_epoch-1', '1')
    wrap(<PartnerLeftCard partnerName="小華" currentEpochId="epoch-1" />)
    expect(screen.getByRole('status').textContent).not.toContain('小華')
  })

  it('is epoch-scoped — a removed flag from a prior epoch does not leak into the next departure', () => {
    window.localStorage.setItem('futari_partner_removed_epoch-1', '1')
    wrap(<PartnerLeftCard partnerName="小明" currentEpochId="epoch-2" />)
    expect(screen.getByText('小明 已離開')).toBeTruthy()
  })

  it('clears the removed flag and persists the dismissal when ✕ is tapped', () => {
    window.localStorage.setItem('futari_partner_removed_epoch-1', '1')
    wrap(<PartnerLeftCard partnerName="小華" currentEpochId="epoch-1" />)
    fireEvent.click(screen.getByRole('button', { name: '關閉' }))
    expect(screen.queryByText('回到一個人')).toBeNull()
    expect(window.localStorage.getItem('futari_partner_left_epoch-1')).toBe('1')
    expect(window.localStorage.getItem('futari_partner_removed_epoch-1')).toBeNull()
  })

  it('stays down after dismissal even though the removed flag was set', () => {
    window.localStorage.setItem('futari_partner_removed_epoch-1', '1')
    window.localStorage.setItem('futari_partner_left_epoch-1', '1')
    const { container } = wrap(<PartnerLeftCard partnerName="小華" currentEpochId="epoch-1" />)
    expect(container.querySelector('[role="status"]')).toBeNull()
  })
})
