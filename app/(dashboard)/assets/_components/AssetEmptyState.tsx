'use client'

import { useTranslations } from '@/lib/i18n/client'

export function AssetEmptyState() {
  const t = useTranslations()
  return (
    <div className="flex flex-col items-center justify-center pt-16 pb-12 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        aria-hidden="true"
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <ellipse cx="12" cy="15" rx="4" ry="3.5" fill="var(--ink-3)" opacity="0.6" />
          <circle cx="7.5" cy="10.5" r="1.6" fill="var(--ink-3)" opacity="0.6" />
          <circle cx="11" cy="8.5" r="1.6" fill="var(--ink-3)" opacity="0.6" />
          <circle cx="13" cy="8.5" r="1.6" fill="var(--ink-3)" opacity="0.6" />
          <circle cx="16.5" cy="10.5" r="1.6" fill="var(--ink-3)" opacity="0.6" />
        </svg>
      </div>
      <div className="text-base font-medium mb-2" style={{ color: 'var(--ink)' }}>
        {t.assets.empty.title}
      </div>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)', maxWidth: 240 }}>
        {t.assets.empty.body}
      </div>
    </div>
  )
}
