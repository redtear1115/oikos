import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import {
  ActiveTripBanner,
  type ActiveTripBannerTrip,
} from '@/app/(dashboard)/dashboard/_components/ActiveTripBanner'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

const tripA: ActiveTripBannerTrip = {
  id: 'trip-a',
  name: '京都春日',
  defaultCurrency: 'jpy',
  startDate: '2026-04-01',
}

const tripB: ActiveTripBannerTrip = {
  id: 'trip-b',
  name: '台中小週末',
  defaultCurrency: null,
  startDate: '2026-05-10',
}

describe('ActiveTripBanner', () => {
  it('renders nothing when there are no active trips', () => {
    const { container } = wrap(<ActiveTripBanner trips={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the single trip name + start date and links to the trip detail', () => {
    wrap(<ActiveTripBanner trips={[tripA]} />)
    expect(screen.getByText('旅行進行中')).toBeTruthy()
    expect(screen.getByText('京都春日')).toBeTruthy()
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/trips/trip-a')
    // Currency symbol included when defaultCurrency is set
    expect(link.textContent).toContain('2026-04-01')
    expect(link.textContent).toContain('¥')
  })

  it('omits the currency badge when the trip has no defaultCurrency', () => {
    wrap(<ActiveTripBanner trips={[tripB]} />)
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.textContent).toContain('2026-05-10')
    expect(link.textContent).not.toContain('NT$')
    expect(link.textContent).not.toContain('¥')
  })

  it('summarises N > 1 trips and links to /trips', () => {
    wrap(<ActiveTripBanner trips={[tripA, tripB]} />)
    expect(screen.getByText('2 段旅行進行中')).toBeTruthy()
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/trips')
  })
})
