import { LandingCtaLink } from '../../_landing/LandingCtaLink'

/**
 * Standalone sign-up CTA for /migrate/<source> (#1011).
 *
 * These pages are search landing pages, not migration tools — the real importer
 * lives in post-login settings and the on-page upload widget is a bonus. Until
 * this block existed the page carried no `landing_cta_clicked` emitter at all:
 * the only on-page CTA (`MigrateCta`) is gated behind a successful CSV parse,
 * so a visitor who had no CSV to give had to bounce back to the home page to
 * find an ask. Mounted between the "why Futari" differentiators and the
 * migration walkthrough so the ask lands before the screenshot instructions.
 */
export function MigratePrimaryCta({
  title,
  body,
  button,
  signInHref,
  source,
}: {
  title: string
  body: string
  button: string
  /** Locale-aware /sign-in href; `LandingCtaLink` appends `?from=<source>`. */
  signInHref: string
  source: string
}) {
  return (
    <section className="rounded-card bg-surface-alt border border-hairline px-5 py-6 md:px-8 md:py-7 flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-8">
      <div className="space-y-2">
        <h2 className="m-0 text-xl md:text-title font-medium text-ink">{title}</h2>
        <p className="m-0 text-sm md:text-base leading-[1.7] text-ink-2">{body}</p>
      </div>
      <LandingCtaLink
        href={signInHref}
        fromParam={source}
        ctaLocation="migrate_primary"
        target="sign_in"
        className="shrink-0 self-start md:self-auto inline-flex items-center justify-center h-12 px-6 rounded-xl text-white text-base font-medium"
        style={{ background: 'var(--btn-primary-bg)', letterSpacing: '1.2px', textDecoration: 'none' }}
      >
        {button}
      </LandingCtaLink>
    </section>
  )
}
