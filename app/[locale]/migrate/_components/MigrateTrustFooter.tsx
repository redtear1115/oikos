import Link from 'next/link'
import { ShieldOutlineGlyph } from '../../_landing/FutariMark'

type TrustItem = { title: string; body: string }

/**
 * Closing trust block — narrative-free three-card row, mounted between
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
    <section
      className="rounded-card px-5 md:px-8 py-7 md:py-9 space-y-5"
      style={{ background: 'var(--surface-alt)' }}
    >
      <h2
        className="text-label m-0 text-center md:text-left"
        style={{
          fontFamily: 'var(--font-fraunces)',
          color: 'var(--accent)',
          letterSpacing: '3.5px',
          textTransform: 'uppercase',
        }}
      >
        {heading}
      </h2>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 m-0 p-0 list-none">
        {items.map(({ title, body }) => (
          <li
            key={title}
            className="p-4 md:p-5 rounded-bubble"
            style={{ background: 'var(--surface)' }}
          >
            <p
              className="m-0 text-meta md:text-body font-semibold"
              style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
            >
              {title}
            </p>
            <p
              className="m-0 mt-1.5 text-[12.5px] md:text-label leading-[1.65]"
              style={{ color: 'var(--ink-2)' }}
            >
              {body}
            </p>
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
        <span className="text-caption" style={{ letterSpacing: '0.3px' }}>
          {trustNote}
        </span>
      </div>
      <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
        <div
          className="flex items-center gap-3 text-[12px]"
          style={{ color: 'var(--ink-2)', letterSpacing: '0.3px' }}
        >
          <Link href={legalLinks.termsHref} className="underline">{legalLinks.termsLabel}</Link>
          <span style={{ color: 'var(--hairline)' }}>·</span>
          <Link href={legalLinks.privacyHref} className="underline">{legalLinks.privacyLabel}</Link>
        </div>
        <span
          className="text-micro"
          style={{ color: 'var(--ink-2)', letterSpacing: '2px' }}
        >
          © 2026 · MADE IN TAIWAN
        </span>
      </div>
    </footer>
  )
}
