'use client'

import { useId, useRef, useState, type DragEvent } from 'react'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import type { MigrateSource } from '@/lib/migrate/csv'
import { useCsvPreview } from '@/lib/migrate/useCsvPreview'
import { MigrateCta } from './MigrateCta'
import { MigratePreviewCard } from './MigratePreviewCard'

type MigrateStrings = Translations['migrate']

interface Props {
  t: MigrateStrings
  /** Locale-aware /sign-in href — `MigrateCta` appends `?from=<source>`. */
  signInHref: string
  /** Page-level source bias (e.g. /migrate/honeydue → 'honeydue'). Header
   *  sniffing wins when confident; this is the fallback. */
  hint: MigrateSource
}

/**
 * Self-contained upload → parse → preview → CTA flow shared by all three
 * /migrate/<source> pages. The page only supplies the SEO copy + `hint`.
 */
export function MigrateTool({ t, signInHref, hint }: Props) {
  const preview = useCsvPreview({ hint })
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputId = useId()

  function pickFile(file: File | undefined | null) {
    if (!file) return
    void preview.load(file)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
    pickFile(e.dataTransfer.files?.[0])
  }

  function reset() {
    preview.reset()
    if (inputRef.current) inputRef.current.value = ''
  }

  const showPreview = preview.status === 'ready'
  const showError = preview.status === 'error'
  const isBusy = preview.status === 'parsing'

  return (
    <div className="space-y-6">
      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className="block cursor-pointer rounded-2xl px-6 py-10 text-center transition-colors"
        style={{
          background: isDragging ? 'var(--surface-alt)' : 'var(--surface)',
          border: `1px dashed ${isDragging ? 'var(--ink-2)' : 'var(--ink-3)'}`,
          color: 'var(--ink-2)',
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <div className="text-[15px] mb-3">{t.upload.prompt}</div>
        <span
          className="inline-flex items-center justify-center h-10 px-5 rounded-xl text-white text-[14px] font-medium"
          style={{ background: 'var(--btn-primary-bg)', letterSpacing: '0.6px' }}
        >
          {isBusy ? t.upload.parsing : t.upload.button}
        </span>
        <div className="text-[12px] mt-3" style={{ color: 'var(--ink-3)' }}>
          {t.upload.constraint}
        </div>
      </label>

      {showError && (
        <div
          className="rounded-2xl px-5 py-4 text-[14px] text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}
        >
          <p className="mb-3">{t.upload.error}</p>
          <button
            type="button"
            onClick={reset}
            className="underline cursor-pointer"
            style={{ color: 'var(--ink-2)' }}
          >
            {t.upload.retry}
          </button>
        </div>
      )}

      {showPreview && (
        <>
          <MigratePreviewCard
            t={t}
            source={preview.detectedSource}
            encoding={preview.encoding}
            stats={preview.stats}
          />
          <MigrateCta t={t} signInHref={signInHref} source={preview.detectedSource} />
          <p className="text-center text-[12px]" style={{ color: 'var(--ink-3)' }}>
            <button
              type="button"
              onClick={reset}
              className="underline cursor-pointer"
              style={{ color: 'var(--ink-3)' }}
            >
              {t.upload.retry}
            </button>
          </p>
        </>
      )}

      {!showPreview && !showError && (
        <p className="text-center text-[12px]" style={{ color: 'var(--ink-3)' }}>
          {t.cta.privacyNote}
        </p>
      )}
    </div>
  )
}
