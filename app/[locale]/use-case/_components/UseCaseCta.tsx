import { LandingCtaLink } from '../../_landing/LandingCtaLink'
import { fromParamForUseCase, type UseCaseCtaSource } from '@/lib/analytics/attribution'


/**
 * Sign-up ask on /use-case/<slug>.
 *
 * Routed through `LandingCtaLink` so the page reports `landing_cta_clicked`
 * and tags sign-in with `?from=use-case-<slug>` (#1056). Before that it was a
 * bare `<Link href="/sign-in">`: every sign-up from these forty URLs landed in
 * `entry_source=direct`, and the click-through was simply unmeasured — both
 * failures silent, exactly like #1027.
 */
export function UseCaseCta({
  label,
  signInHref,
  slug,
}: {
  label: string
  /** Locale-aware /sign-in href; `LandingCtaLink` appends the `from` tag. */
  signInHref: string
  slug: UseCaseCtaSource
}) {
  return (
    <div className="text-center md:text-left">
      <LandingCtaLink
        href={signInHref}
        fromParam={fromParamForUseCase(slug)}
        ctaLocation="use_case_primary"
        target="sign_in"
        className="inline-flex items-center justify-center h-12 px-6 rounded-xl text-[var(--on-fill)] text-base font-medium"
        style={{ background: 'var(--ink)', textDecoration: 'none' }}
      >
        {label}
      </LandingCtaLink>
    </div>
  )
}
