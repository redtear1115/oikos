'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { TrustCommitments } from './TrustCommitments'

export function TrustContent() {
  const router = useRouter()
  const t = useTranslations()

  const [exportPending, startExportTransition] = useTransition()
  const [exportError, setExportError] = useState<string | null>(null)

  const handleExport = () => {
    setExportError(null)
    startExportTransition(async () => {
      try {
        const res = await fetch('/api/export/transactions', { credentials: 'same-origin' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const disposition = res.headers.get('Content-Disposition') ?? ''
        const match = /filename="?([^";]+)"?/i.exec(disposition)
        const filename = match?.[1] ?? 'futari-transactions.csv'

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } catch {
        setExportError(t.csvExport.failed)
      }
    })
  }

  return (
    <>
      <div
        className="px-4 flex items-center justify-between"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingBottom: 8 }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 bg-transparent border-0 cursor-pointer min-h-11 px-2 -ml-2"
          style={{ color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 'var(--fs-sm)' }}
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.trust.back}
        </button>

        <div className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
          {t.trust.title}
        </div>

        <div className="w-[64px]" aria-hidden="true" />
      </div>

      <div className="px-5 pt-6 pb-8">
        <h1
          className="text-page leading-tight"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {t.trust.pageHeading}
        </h1>
        <p className="text-sm mt-3" style={{ color: 'var(--ink-2)' }}>
          {t.trust.pageSubtitle}
        </p>
      </div>

      <div className="px-4 pb-6">
        <button
          type="button"
          onClick={handleExport}
          disabled={exportPending}
          className="w-full flex items-center justify-between px-5 py-4 rounded-[20px] text-left bg-transparent cursor-pointer disabled:cursor-default disabled:opacity-60"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {exportPending ? t.csvExport.preparing : t.settings.exportData}
          </div>
          <span className="text-sm shrink-0" style={{ color: 'var(--ink-3)' }}>›</span>
        </button>
        {exportError && (
          <div className="text-xs mt-2 px-1" style={{ color: 'var(--debit)' }}>
            {exportError}
          </div>
        )}
      </div>

      <div className="px-4 pb-12">
        <TrustCommitments t={t.trust} />
      </div>
    </>
  )
}
