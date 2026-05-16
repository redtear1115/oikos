import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

// Stub TripSheet — its full implementation pulls in server actions / supabase /
// currency picker that are out of scope for a banner-shape unit test. The
// banner only needs the sheet to render conditionally; behavior is covered by
// /trips integration paths elsewhere.
vi.mock('@/app/(dashboard)/trips/_components/TripSheet', () => ({
  TripSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="trip-sheet" /> : null,
}))

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

beforeEach(() => {
  localStorage.clear()
})

describe('ActiveTripBanner', () => {
  it('renders an empty-state CTA when there are no active trips', () => {
    wrap(<ActiveTripBanner trips={[]} baseCurrency="twd" />)
    // The CTA is a button (opens TripSheet directly, no navigation).
    const cta = screen.getByRole('button', { name: '開始一段旅行' })
    expect(cta).toBeTruthy()
    // No link in empty state.
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows the single trip name + start date and links to the trip detail', () => {
    wrap(<ActiveTripBanner trips={[tripA]} baseCurrency="twd" />)
    expect(screen.getByText('旅行進行中')).toBeTruthy()
    expect(screen.getByText('京都春日')).toBeTruthy()
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/trips/trip-a')
    expect(link.textContent).toContain('2026-04-01')
    expect(link.textContent).toContain('¥')
  })

  it('omits the currency badge when the trip has no defaultCurrency', () => {
    wrap(<ActiveTripBanner trips={[tripB]} baseCurrency="twd" />)
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.textContent).toContain('2026-05-10')
    expect(link.textContent).not.toContain('NT$')
    expect(link.textContent).not.toContain('¥')
  })

  it('summarises N > 1 trips and links to /trips', () => {
    wrap(<ActiveTripBanner trips={[tripA, tripB]} baseCurrency="twd" />)
    expect(screen.getByText('2 段旅行進行中')).toBeTruthy()
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/trips')
  })

  it('exposes ✈ add-trip and − collapse controls on expanded active states', () => {
    wrap(<ActiveTripBanner trips={[tripA]} baseCurrency="twd" />)
    expect(screen.getByRole('button', { name: '新增旅行' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '收合旅行卡' })).toBeTruthy()
  })

  it('renders the collapsed single-row form when the user previously collapsed it', () => {
    localStorage.setItem('trip-banner-collapsed', 'true')
    wrap(<ActiveTripBanner trips={[tripA]} baseCurrency="twd" />)
    // Kicker is hidden in collapsed mode; expand toggle replaces collapse.
    expect(screen.queryByText('旅行進行中')).toBeNull()
    expect(screen.getByRole('button', { name: '展開旅行卡' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '新增旅行' })).toBeTruthy()
    // Trip name and link are still present.
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/trips/trip-a')
    expect(link.textContent).toContain('京都春日')
  })
})
