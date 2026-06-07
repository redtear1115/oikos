'use client'

import { useEffect } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { SubpageHeader } from '@/app/(dashboard)/_components/SubpageHeader'
import { track } from '@/lib/analytics/track'

/**
 * Embedded Ko-fi tip jar. The iframe lets the user complete the donation
 * inside the app — no external redirect.
 */
export function SupportContent() {
  const t = useTranslations()

  useEffect(() => {
    track('kofi_page_viewed')
  }, [])

  return (
    <>
      <SubpageHeader title={t.support.title} backLabel={t.support.back} />

      <div className="px-5 pt-6 pb-4">
        <h1
          className="text-page leading-tight"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {t.support.pageHeading}
        </h1>
        <p className="text-sm mt-3" style={{ color: 'var(--ink-2)' }}>
          {t.support.pageSubtitle}
        </p>
      </div>

      <div className="px-4 pb-12">
        <div
          className="rounded-card overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <iframe
            id="kofiframe"
            src="https://ko-fi.com/ray19841115/?hidefeed=true&widget=true&embed=true&preview=true&utm_source=futari_app&utm_medium=kofi_widget"
            title="Ko-fi · ray19841115"
            className="w-full block"
            style={{ height: '712px', border: 'none', background: 'transparent' }}
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </>
  )
}
