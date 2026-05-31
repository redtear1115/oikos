'use client'

import { useEffect, useRef } from 'react'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import type { MigrateSource } from '@/lib/csvImport'
import { track } from '@/lib/analytics/track'
import { useCsvPreview } from '@/lib/migrate/useCsvPreview'
import { CsvFileUploadWidget } from '@/components/CsvFileUploadWidget'
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

  function handleFile(file: File) {
    track('migrate_file_selected', { migrate_source: hint })
    void preview.load(file)
  }

  function reset() {
    preview.reset()
    if (inputRef.current) inputRef.current.value = ''
  }

  const showPreview = preview.status === 'ready'
  const showError = preview.status === 'error'
  const isBusy = preview.status === 'parsing'

  // Fire the preview outcome once per terminal parse state. `totalRows` is the
  // CsvStats row count; fall back to the parsed row length if stats are absent.
  useEffect(() => {
    if (preview.status === 'ready') {
      track('migrate_preview_shown', {
        migrate_source: hint,
        detected_source: preview.detectedSource,
        row_count: preview.stats?.totalRows ?? preview.rows.length,
      })
    } else if (preview.status === 'error') {
      track('migrate_preview_failed', { migrate_source: hint, reason: preview.error ?? 'unknown' })
    }
  }, [preview.status, preview.detectedSource, preview.stats, preview.rows.length, preview.error, hint])

  return (
    <div className="space-y-6">
      <CsvFileUploadWidget
        inputRef={inputRef}
        onFile={handleFile}
        loading={isBusy}
        error={showError ? t.upload.error : undefined}
        onRetry={reset}
        promptText={t.upload.prompt}
        buttonText={t.upload.button}
        loadingText={t.upload.parsing}
        retryText={t.upload.retry}
        size="md"
        icon={
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
        }
        hint={
          <div
            className="text-xs mt-4 flex items-center justify-center gap-2 flex-wrap"
            style={{ color: 'var(--ink-3)' }}
          >
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs"
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
        }
      />

      {showPreview && (
        <>
          <MigratePreviewCard
            t={t}
            source={preview.detectedSource}
            encoding={preview.encoding}
            stats={preview.stats}
          />
          <MigrateCta
            t={t}
            signInHref={signInHref}
            source={preview.detectedSource}
            onClick={() => track('migrate_cta_clicked', { migrate_source: hint })}
          />
          <p className="text-center text-xs" style={{ color: 'var(--ink-3)' }}>
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
        <p className="text-center text-xs" style={{ color: 'var(--ink-3)' }}>
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
