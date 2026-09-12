import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))
import { track } from '@/lib/analytics/track'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { UseCaseCta } from '@/app/[locale]/use-case/_components/UseCaseCta'
import { entrySourceFromParam } from '@/lib/analytics/attribution'
import { USE_CASE_SLUGS } from '@/lib/use-case/cases'

// #1056: the CTA on /use-case/<slug> was a bare <Link href="/sign-in"> — no
// `from` tag (so every downstream sign-up read back as `direct`) and no
// emitter at all (so the click-through was unmeasured). Both silent.
describe('UseCaseCta', () => {
  beforeEach(() => vi.clearAllMocks())

  const label = zhTW.useCase.ctaLabel

  function renderCta(slug: (typeof USE_CASE_SLUGS)[number] = 'aa-split') {
    return render(<UseCaseCta label={label} signInHref="/zh-TW/sign-in" slug={slug} />)
  }

  it('tags sign-in with the use-case slug', () => {
    renderCta()
    expect(screen.getByText(label).closest('a')!.getAttribute('href')).toBe(
      '/zh-TW/sign-in?from=use-case-aa-split',
    )
  })

  it('fires landing_cta_clicked with location + target', () => {
    renderCta()
    fireEvent.click(screen.getByText(label))
    expect(track).toHaveBeenCalledWith('landing_cta_clicked', {
      cta_location: 'use_case_primary',
      target: 'sign_in',
    })
  })

  it('round-trips every slug back to a non-direct entry_source', () => {
    for (const slug of USE_CASE_SLUGS) {
      const { unmount } = renderCta(slug)
      const href = screen.getByText(label).closest('a')!.getAttribute('href')!
      const from = new URL(href, 'https://futari.test').searchParams.get('from')
      expect(entrySourceFromParam(from)).toBe(`use_case_${slug.replaceAll('-', '_')}`)
      unmount()
    }
  })
})
