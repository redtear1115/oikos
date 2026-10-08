'use client'

import { track } from '@/lib/analytics/track'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { isLocale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'

/**
 * One quiet link from the public outing page to the "how outings work" page
 * (#1633), anchored at the friend's section. The href is built from the locale
 * only: never the share token, and `rel="noreferrer"` so this page's URL (which
 * holds the token on the picker) is not sent as a Referer either. The click
 * event carries a fixed `source`, nothing from the URL; PostHog on this page
 * already runs behind the #1274 URL scrubbing, as for `outing_link_opened`.
 */
export function FeatureOutingLink() {
  const t = useTranslations()
  const raw = useLocale()
  const locale = isLocale(raw) ? raw : 'zh-TW'
  return (
    <p className="px-4 pt-2 pb-8 m-0">
      <a
        href={`${localizedHref('/features/outing', locale)}#for-friends`}
        rel="noreferrer"
        className="text-sm text-ink-3 underline"
        onClick={() => track('feature_outing_link_clicked', { source: 'outing_share' })}
      >
        {t.featureOuting.entries.shareLink}
      </a>
    </p>
  )
}
