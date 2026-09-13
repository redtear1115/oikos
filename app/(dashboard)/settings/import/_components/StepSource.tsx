'use client'

import { useRef, useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { CsvFileUploadWidget } from '@/components/CsvFileUploadWidget'
import { IMPORT_ACCEPT, type DetectedSource } from '@/lib/csvImport'
import type { ImportSource } from '@/actions/import'
import type { ParsedFileState } from './ImportContent'
import { SectionCard } from './SectionCard'
import { WizardNavButtons } from './WizardNavButtons'

interface Props {
  onFile: (file: File, source: ImportSource) => Promise<void>
  parseError: string | null
  parsed: ParsedFileState | null
  onNext: () => void
  onReset: () => void
}

/** The sources a user picks by hand. `ofx` / `qif` / `futari_generic` are also
 *  valid `ImportSource`s but are recognised from the file itself, never chosen
 *  here — hence the narrow literal type rather than `ImportSource[]`. */
const SOURCE_OPTIONS = ['honeydue', 'spendee', 'cwmoney', 'generic'] as const satisfies readonly ImportSource[]

/**
 * Label for the *detected* source. Only the hand-picked ones have translated
 * names; a file recognised as OFX / QIF falls back to the bare format acronym
 * (a format name, not copy — it reads the same in all four locales). Without
 * the fallback the template rendered the literal string "undefined".
 *
 * `futari_generic` borrows the generic label instead of that fallback: it is
 * only ever reached from the 「通用 CSV」 button (the screenshot→ChatGPT→CSV
 * file is recognised inside `processFile`, #1094), so echoing the button the
 * user just pressed is both truthful and free of a new string. The raw
 * fallback would have shown "FUTARI_GENERIC" — an internal identifier.
 */
function sourceLabel(source: DetectedSource, labels: Record<string, string | undefined>): string {
  if (source === 'futari_generic') return labels.generic ?? source.toUpperCase()
  return labels[source] ?? source.toUpperCase()
}

export function StepSource({ onFile, parseError, parsed, onNext, onReset }: Props) {
  const t = useTranslations()
  const tImport = t.settings.import.step1
  const inputRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<ImportSource>('honeydue')
  const [parsing, setParsing] = useState(false)

  async function handleFile(file: File) {
    setParsing(true)
    try {
      await onFile(file, source)
    } finally {
      setParsing(false)
    }
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = ''
    onReset()
  }

  return (
    <div className="space-y-5">
      <SectionCard title={tImport.title} subtitle={tImport.subtitle}>
        <div className="text-xs font-medium px-1 mb-2" style={{ color: 'var(--ink-3)' }}>
          {tImport.sourceLabel}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SOURCE_OPTIONS.map((s) => {
            const isActive = source === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                disabled={parsing}
                className="px-4 py-3 rounded-xl text-sm text-left cursor-pointer disabled:cursor-default"
                style={{
                  background: isActive ? 'var(--surface-alt)' : 'var(--surface)',
                  border: `1px solid ${isActive ? 'var(--ink-2)' : 'var(--hairline)'}`,
                  color: 'var(--ink)',
                }}
              >
                {tImport.sources[s]}
              </button>
            )
          })}
        </div>
      </SectionCard>

      <CsvFileUploadWidget
        inputRef={inputRef}
        onFile={handleFile}
        loading={parsing}
        error={parseError ?? undefined}
        onRetry={clear}
        promptText={tImport.uploadPrompt}
        buttonText={tImport.uploadButton}
        loadingText={tImport.parsing}
        retryText={tImport.retryCta}
        accept={IMPORT_ACCEPT}
        size="sm"
      />

      {parsed && (
        <SectionCard>
          <div className="text-sm mb-1" style={{ color: 'var(--ink)' }}>
            {tImport.fileSelected.replace('{name}', parsed.file.name)}
          </div>
          <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {tImport.sourceDetected.replace('{source}', sourceLabel(parsed.source, tImport.sources))}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
            {tImport.summary
              .replace('{total}', String(parsed.result.stats.total))
              .replace('{valid}', String(parsed.result.stats.valid))
              .replace('{invalid}', String(parsed.result.stats.invalid))}
          </div>
          {parsed.result.stats.invalid > 0 && (
            <div className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
              {tImport.invalidNote}
            </div>
          )}
          <div className="mt-4">
            <WizardNavButtons
              onBack={clear}
              backLabel={tImport.retryCta}
              onNext={onNext}
              nextLabel={t.common.navigation.next}
            />
          </div>
        </SectionCard>
      )}
    </div>
  )
}
