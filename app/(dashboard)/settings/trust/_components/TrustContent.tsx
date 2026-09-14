'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { SubpageHeader } from '@/app/(dashboard)/_components/SubpageHeader'
import { TrustCommitments } from './TrustCommitments'

export function TrustContent() {
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
      <SubpageHeader title={t.trust.title} backLabel={t.trust.back} />

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
          className="w-full flex items-center justify-between px-5 py-4 rounded-card text-left bg-transparent cursor-pointer disabled:cursor-default disabled:opacity-60"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {exportPending ? t.csvExport.preparing : t.settings.exportData}
          </div>
          <span className="text-sm shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden="true">›</span>
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
