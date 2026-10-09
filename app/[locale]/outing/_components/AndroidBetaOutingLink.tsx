'use client'

import { useEffect, useState } from 'react'
import { track } from '@/lib/analytics/track'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { isLocale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'
import { getPlatform } from '@/lib/install-guide'
import { getCapacitorPlatform } from '@/components/KofiWidget'
import { ANDROID_BETA_PATH, ANDROID_TEST_GROUP_URL } from '@/lib/visitorPlatform'

/**
 * One quiet line on the public outing page for Android browser visitors,
 * pointing at the Android closed-test join page (#1648). Friends who open an
 * outing link are exactly the people who may not have Futari yet.
 *
 * Same privacy rules as FeatureOutingLink: the href is built from the locale
 * only, never the share token, and `rel="noreferrer"` keeps this page's URL
 * (which holds the token on the picker) out of the Referer. The click event
 * has no properties, so nothing from the URL can reach PostHog. Failure looks
 * like: the outing share token turning up in /android-beta's referrer or in
 * PostHog, with no error anywhere.
 *
 * Shown only in an Android browser: not iPhone or desktop, and not inside any
 * Capacitor shell (a shell visitor is already in the app). Runtime detection,
 * nothing before mount so SSR and the first client render agree. Hidden when
 * the group URL is empty, so the line never leads to a page with no action.
 *
 * TEMPORARY: removed with the Android closed-test cleanup (#1553), together
 * with `androidBeta.outingLine` and `android_beta_outing_link_clicked`.
 */
export function AndroidBetaOutingLink() {
  const t = useTranslations()
  const raw = useLocale()
  const locale = isLocale(raw) ? raw : 'zh-TW'
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Capacitor reports 'web' off-shell; either shell ('ios' or 'android') hides the line.
    setShow(!!ANDROID_TEST_GROUP_URL && getCapacitorPlatform() === 'web' && getPlatform() === 'android')
  }, [])

  if (!show) return null

  return (
    <p className="px-4 pb-8 m-0 -mt-6">
      <a
        href={localizedHref(ANDROID_BETA_PATH, locale)}
        rel="noreferrer"
        className="text-sm text-ink-3 underline"
        onClick={() => track('android_beta_outing_link_clicked')}
      >
        {t.androidBeta.outingLine}
      </a>
    </p>
  )
}
