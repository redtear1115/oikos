import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))
import { FeatureOutingCta } from '@/app/[locale]/features/outing/_components/FeatureOutingCta'
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales-meta'
import { safeSameOriginUrl } from '@/lib/auth/nativeRedirect'
import { hasTokenBearingNext } from '@/lib/analytics/tokenBearingUrl'
import { entrySourceFromParam } from '@/lib/analytics/attribution'

const ORIGIN = 'https://futari.example'

// #1633: the feature page's CTA sends a signed-in visitor to /outings (via the
// same `next` rule SignedInRedirect and /auth/callback use) and tags the
// sign-up as entry_source feature_outing. A drift here is silent: the visitor
// lands on /dashboard, or the sign-up reads back as `direct`.
describe('FeatureOutingCta', () => {
  it.each(SUPPORTED_LOCALES)('%s: next resolves to /outings and from maps to feature_outing', (locale) => {
    render(<FeatureOutingCta locale={locale} label={`cta-${locale}`} location="feature_primary" />)
    const href = screen.getByText(`cta-${locale}`).closest('a')!.getAttribute('href')!
    const url = new URL(href, ORIGIN)
    expect(url.pathname).toBe(locale === 'zh-TW' ? '/sign-in' : `/${locale}/sign-in`)
    const next = url.searchParams.get('next')
    expect(next).toBe('/outings')
    expect(safeSameOriginUrl(ORIGIN, next!)).toBe(`${ORIGIN}/outings`)
    expect(hasTokenBearingNext(url.searchParams.getAll('next'))).toBe(false)
    expect(entrySourceFromParam(url.searchParams.get('from'))).toBe('feature_outing')
  })
})
