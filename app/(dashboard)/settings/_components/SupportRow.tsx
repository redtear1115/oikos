'use client'

import { useEffect, useState } from 'react'
import { KOFI_USERNAME, SOURCE, getCapacitorPlatform } from '@/components/KofiWidget'
import { useTranslations } from '@/lib/i18n/client'

/** Settings row linking to the Ko-fi page (#1516). Replaces the floating widget
 * on Settings, so no Ko-fi third-party script loads here.
 *
 * Apple Guideline 3.1.1 (#848): never rendered inside the iOS native shell. The
 * gate is runtime (see KofiWidget). Renders nothing until mounted so iOS never
 * flashes the row and SSR/hydration output match. */
export function SupportRow() {
  const t = useTranslations()
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(getCapacitorPlatform() !== 'ios')
  }, [])

  if (!show) return null

  return (
    <div className="mt-3">
      <a
        href={`https://ko-fi.com/${KOFI_USERNAME}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => window.gtag?.('event', 'kofi_widget_click', { source: SOURCE })}
        className="w-full flex items-center justify-between px-5 py-4 rounded-card text-left bg-transparent cursor-pointer"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t.support.buttonText}
          </div>
        </div>
        <div className="text-sm flex items-center gap-2 shrink-0" style={{ color: 'var(--ink-3)' }}>
          <span aria-hidden="true">›</span>
        </div>
      </a>
    </div>
  )
}
