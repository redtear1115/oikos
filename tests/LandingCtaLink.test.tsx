import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))
import { track } from '@/lib/analytics/track'
import { LandingCtaLink } from '@/app/[locale]/_landing/LandingCtaLink'

describe('LandingCtaLink', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fires landing_cta_clicked with location + target on click', () => {
    render(
      <LandingCtaLink href="/zh-TW/sign-in" ctaLocation="hero" target="sign_in">
        開始
      </LandingCtaLink>,
    )
    fireEvent.click(screen.getByText('開始'))
    expect(track).toHaveBeenCalledWith('landing_cta_clicked', {
      cta_location: 'hero',
      target: 'sign_in',
    })
  })

  it('appends from=landing to sign-in hrefs', () => {
    render(
      <LandingCtaLink href="/zh-TW/sign-in" ctaLocation="hero" target="sign_in">
        開始
      </LandingCtaLink>,
    )
    expect(screen.getByText('開始').closest('a')!.getAttribute('href')).toBe('/zh-TW/sign-in?from=landing')
  })

  it('lets fromParam override the landing tag (migrate pages tag their slug)', () => {
    render(
      <LandingCtaLink
        href="/zh-TW/sign-in"
        ctaLocation="migrate_primary"
        target="sign_in"
        fromParam="simple-daily-money"
      >
        建立帳號
      </LandingCtaLink>,
    )
    expect(screen.getByText('建立帳號').closest('a')!.getAttribute('href')).toBe(
      '/zh-TW/sign-in?from=simple-daily-money',
    )
  })

  it('does NOT append from for non-sign-in targets', () => {
    render(
      <LandingCtaLink href="/zh-TW/migrate/honeydue" ctaLocation="footer_migrate" target="migrate_honeydue">
        Honeydue
      </LandingCtaLink>,
    )
    expect(screen.getByText('Honeydue').closest('a')!.getAttribute('href')).toBe('/zh-TW/migrate/honeydue')
  })
})
