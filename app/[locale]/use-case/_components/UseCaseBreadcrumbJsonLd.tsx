import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { dictionaries } from '@/lib/i18n/t'
import type { UseCaseSlug } from '@/lib/use-case/cases'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

/**
 * BreadcrumbList JSON-LD for the per-situation /use-case pages (#1058).
 * Three levels (Home → situation hub → this page) — unlike /migrate/<source>,
 * the middle crumb is a real page since #1057 added the /use-case hub, so it
 * links somewhere Google can follow instead of a 404.
 * Names and URLs are per-locale.
 */
export function UseCaseBreadcrumbJsonLd({
  locale,
  slug,
}: {
  locale: Locale
  slug: UseCaseSlug
}) {
  const hub = dictionaries[locale].useCase.hub

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
        name: hub.breadcrumbLabel,
        item: `${APP_URL}${localizedHref('/use-case', locale)}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: hub.items[slug].name,
        item: `${APP_URL}${localizedHref(`/use-case/${slug}`, locale)}`,
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
