import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { MIGRATE_SOURCES, type MigrateSlug } from '@/lib/migrate/sources'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

type Source = MigrateSlug

/**
 * BreadcrumbList JSON-LD for the per-source migrate landing pages (#593).
 * Two levels (Home → source) — /migrate has no index page, so a middle
 * crumb would link to a 404 and fail Google's rich result validation.
 */
export function MigrateBreadcrumbJsonLd({
  locale,
  source,
}: {
  locale: Locale
  source: Source
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Futari',
        item: `${APP_URL}${localizedHref('/', locale)}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: MIGRATE_SOURCES[source].name,
        item: `${APP_URL}${localizedHref(`/migrate/${source}`, locale)}`,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
