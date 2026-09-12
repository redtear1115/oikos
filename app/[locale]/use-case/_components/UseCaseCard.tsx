import Link from 'next/link'
import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import type { UseCaseSlug } from '@/lib/use-case/cases'

/**
 * Single situation card linking to /use-case/<slug>. Used by the /use-case hub
 * (#1057); shaped after MigrateSourceCard so both hubs read as one system.
 */
export function UseCaseCard({
  locale,
  slug,
  name,
  description,
  cta,
}: {
  locale: Locale
  slug: UseCaseSlug
  name: string
  description: string
  cta: string
}) {
  return (
    <li>
      <Link
        href={localizedHref(`/use-case/${slug}`, locale)}
        className="block p-5 md:p-6 rounded-tile h-full"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          color: 'inherit',
          textDecoration: 'none',
        }}
      >
        <p
          className="m-0 text-base font-medium"
          style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
        >
          {name}
        </p>
        <p className="m-0 mt-1.5 text-sm leading-[1.65]" style={{ color: 'var(--ink-2)' }}>
          {description}
        </p>
        <span
          className="inline-flex items-center gap-1.5 mt-3 text-sm"
          style={{
            color: 'var(--ink)',
            textDecoration: 'underline',
            textDecorationColor: 'var(--accent)',
            textUnderlineOffset: '4px',
          }}
        >
          {cta}
          <span aria-hidden>→</span>
        </span>
      </Link>
    </li>
  )
}
