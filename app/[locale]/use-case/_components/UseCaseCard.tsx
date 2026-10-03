import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import type { UseCaseSlug } from '@/lib/use-case/cases'
import { LampLinkRow } from '../../_components/LampLinkRow'

/**
 * Single situation row linking to /use-case/<slug>, used by the /use-case hub
 * (#1057). A hairline row, not a card (#1524); shared with the migrate hub.
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
    <LampLinkRow
      href={localizedHref(`/use-case/${slug}`, locale)}
      name={name}
      description={description}
      cta={cta}
    />
  )
}
