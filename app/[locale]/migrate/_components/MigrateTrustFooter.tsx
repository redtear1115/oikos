import Link from 'next/link'
import { ShieldOutlineGlyph } from '../../_landing/FutariMark'
import { Phrase } from '../../_components/Phrase'
import { Ember } from '../../_components/Ember'
import { s } from '../../_components/brand-inner'

type TrustItem = { title: string; body: string }

/**
 * Closing trust block — narrative-free three-row list, mounted between
 * steps and the slim footer on every /migrate/<source> page (#578).
 * Companions, not duplicates, of `cta.privacyNote` inline above the upload.
 */
export function MigrateTrustBlock({
  heading,
  items,
}: {
  heading: string
  items: readonly TrustItem[]
}) {
  return (
    <section className={s.band}>
      <h2 className={`${s.h2} m-0 text-xl md:text-title font-medium`}>
        <Phrase text={heading} />
      </h2>
      <ul className={s.rows}>
        {items.map(({ title, body }) => (
          <li key={title} className={s.row}>
            <Ember />
            <div>
              <p className={`${s.rowTitle} text-base font-medium`}>{title}</p>
              <p className={`${s.rowBody} text-sm`}>{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Slim closing footer matching the landing pattern — shield glyph + trust
 * line + © / MADE IN TAIWAN. No language switcher (already in top bar).
 *
 * `legalLinks` adds inline Terms · Privacy links so /terms and /privacy
 * have inbound link equity from the indexed /migrate/* pages (#669 M-6).
 */
export function MigrateFooter({
  trustNote,
  legalLinks,
}: {
  trustNote: string
  legalLinks: {
    termsHref: string
    termsLabel: string
    privacyHref: string
    privacyLabel: string
  }
}) {
  return (
    <footer
      className="mt-6 md:mt-10 pt-5 md:pt-6 flex flex-col md:flex-row items-center md:justify-between gap-3"
      style={{ borderTop: '1px solid var(--hairline)' }}
    >
      <div
        className="flex items-center gap-2 text-center md:text-left"
        style={{ color: 'var(--ink-2)' }}
      >
        <ShieldOutlineGlyph />
        <span className="text-xs" style={{ letterSpacing: '0.3px' }}>
          {trustNote}
        </span>
      </div>
      <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
        <div
          className="flex flex-wrap items-center justify-center gap-3 text-xs"
          style={{ color: 'var(--ink-2)', letterSpacing: '0.3px' }}
        >
          <Link href={legalLinks.termsHref} className="inline-flex items-center min-h-11 underline whitespace-nowrap">{legalLinks.termsLabel}</Link>
          <span aria-hidden="true" style={{ color: 'var(--hairline)' }}>·</span>
          <Link href={legalLinks.privacyHref} className="inline-flex items-center min-h-11 underline whitespace-nowrap">{legalLinks.privacyLabel}</Link>
        </div>
        {/* Deliberately not translated (#1185): an origin mark set as a
            tracked-caps badge, identical on all 4 locales and on the Landing
            footer (_landing/Landing.tsx). Translating it here alone would make
            the two brand footers disagree. */}
        <span
          className="text-xs whitespace-nowrap"
          style={{ color: 'var(--ink-2)', letterSpacing: '2px' }}
        >
          © 2026 · MADE IN TAIWAN
        </span>
      </div>
    </footer>
  )
}
