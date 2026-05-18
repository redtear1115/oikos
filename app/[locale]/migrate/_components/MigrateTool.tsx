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
        className="block cursor-pointer rounded-2xl px-6 py-10 md:py-12 text-center transition-colors"
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
        <div
          aria-hidden
          className="mx-auto mb-4 flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
          }}
        >
          <UploadGlyph />
        </div>
        <div className="text-[15px] mb-3">{t.upload.prompt}</div>
        <span
          className="inline-flex items-center justify-center h-11 px-6 rounded-xl text-white text-[14px] font-medium"
          style={{
            background: 'var(--btn-primary-bg)',
            letterSpacing: '0.6px',
            boxShadow: '0 10px 24px -10px rgba(58, 36, 25, 0.4)',
          }}
        >
          {isBusy ? t.upload.parsing : t.upload.button}
        </span>
        <div className="text-[12px] mt-4 flex items-center justify-center gap-2 flex-wrap" style={{ color: 'var(--ink-3)' }}>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px]"
            style={{
              background: 'var(--surface-alt)',
              color: 'var(--ink-2)',
              letterSpacing: '0.8px',
              fontFamily: 'var(--font-fraunces)',
              fontStyle: 'italic',
            }}
          >
            .CSV
          </span>
          <span>{t.upload.constraint}</span>
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

function UploadGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 16.5 V 4.5 M 7.5 9 L 12 4.5 L 16.5 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 14.5 V 18.5 C 5 19.05 5.45 19.5 6 19.5 H 18 C 18.55 19.5 19 19.05 19 18.5 V 14.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
