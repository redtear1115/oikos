import Link from 'next/link'
import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import type { MigrateSlug } from '@/lib/migrate/sources'

/**
 * Single source card linking to /migrate/<slug>. Shared by the cross-link
 * block on each per-source page (MigrateOtherSources) and the /migrate hub
 * index (#939) so both surfaces use one card definition.
 */
export function MigrateSourceCard({
  locale,
  slug,
  name,
  description,
  cta,
}: {
  locale: Locale
  slug: MigrateSlug
  name: string
  description: string
  cta: string
}) {
  return (
    <li>
      <Link
        href={localizedHref(`/migrate/${slug}`, locale)}
        className="block p-5 md:p-6 rounded-tile h-full"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          color: 'inherit',
          textDecoration: 'none',
        }}
      >
        <p
          className="m-0 text-base md:text-base font-medium"
          style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
        >
          {name}
        </p>
        <p className="m-0 mt-1.5 text-sm md:text-sm leading-[1.65]" style={{ color: 'var(--ink-2)' }}>
          {description}
        </p>
        <span
          className="inline-flex items-center gap-1.5 mt-3 text-[13px]"
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
