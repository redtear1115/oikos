import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { dictionaries } from '@/lib/i18n/t'
import { MIGRATE_SOURCES, type MigrateSlug } from '@/lib/migrate/sources'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

type Source = MigrateSlug

/**
 * BreadcrumbList JSON-LD for the per-source migrate landing pages (#593).
 * Three levels (Home → /migrate hub → source). It was two while /migrate had
 * no index page; the hub shipped in #939, so the middle crumb is a real page
 * now, and the visible breadcrumb (BrandBreadcrumb, #1523) shows the same
 * three levels. Change one, change the other.
 */
export function MigrateBreadcrumbJsonLd({
  locale,
  source,
}: {
  locale: Locale
  source: Source
}) {
  const hubLabel = dictionaries[locale].migrate.hub.breadcrumbLabel
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
        name: hubLabel,
        item: `${APP_URL}${localizedHref('/migrate', locale)}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
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
