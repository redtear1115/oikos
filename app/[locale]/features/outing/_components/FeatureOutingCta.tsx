import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { FEATURE_OUTING_FROM_PARAM } from '@/lib/analytics/attribution'
import { LandingCtaLink } from '../../../_landing/LandingCtaLink'

/**
 * Sign-up ask on /features/outing. Sends the visitor to sign-in with
 * `next=/outings`, so someone already signed in lands on the outing list (and a
 * new sign-up goes through normal onboarding), and tags `from=feature-outing`
 * so the sign-up is attributable (entry_source `feature_outing`).
 * `next` is the plain path `/outings`, not `/outing/<token>`: it carries no
 * secret, so the sign-in URL stays out of the token-bearing-URL rules.
 */
export function FeatureOutingCta({
  locale,
  label,
  location,
}: {
  locale: Locale
  label: string
  location: 'feature_primary' | 'feature_closing'
}) {
  return (
    <LandingCtaLink
      href={`${localizedHref('/sign-in', locale)}?next=%2Foutings`}
      fromParam={FEATURE_OUTING_FROM_PARAM}
      ctaLocation={location}
      target="sign_in"
      className="fc-edge inline-flex items-center justify-center h-12 px-6 rounded-xl bg-ink no-underline text-[var(--on-fill)] text-base font-medium"
    >
      {label}
    </LandingCtaLink>
  )
}
