import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import type { MigrateSlug } from '@/lib/migrate/sources'
import { LampLinkRow } from '../../_components/LampLinkRow'

/**
 * Single source row linking to /migrate/<slug>. Shared by the cross-link
 * block on each per-source page (MigrateOtherSources) and the /migrate hub
 * index (#939). A hairline row, not a card (#1524).
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
    <LampLinkRow
      href={localizedHref(`/migrate/${slug}`, locale)}
      name={name}
      description={description}
      cta={cta}
    />
  )
}
