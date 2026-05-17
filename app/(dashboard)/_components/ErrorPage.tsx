'use client'

import { useTranslations } from '@/lib/i18n/client'

interface ErrorPageProps {
  /** i18n key from t.errorPage — e.g. 'dashboard', 'records'. */
  page: 'dashboard' | 'records' | 'settings' | 'trips' | 'assets' | 'review'
  reset: () => void
}

/**
 * Shared error boundary UI for all dashboard route segments.
 * Each route's error.tsx renders this with its page-specific key.
 */
export function ErrorPage({ page, reset }: ErrorPageProps) {
  const t = useTranslations()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="text-base mb-3" style={{ color: 'var(--ink)' }}>
        {t.errorPage[page]}
      </div>
      <div className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
        {t.errorPage.subtitle}
      </div>
      <button
        type="button"
        onClick={reset}
        className="px-5 py-2 rounded-full text-sm cursor-pointer border-0"
        style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
      >
        {t.errorPage.retry}
      </button>
    </div>
  )
}
