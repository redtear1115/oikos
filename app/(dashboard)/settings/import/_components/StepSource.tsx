'use client'

import { useRef, useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { CsvFileUploadWidget } from '@/components/CsvFileUploadWidget'
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

const SOURCE_OPTIONS: ImportSource[] = ['honeydue', 'spendee', 'cwmoney', 'generic']

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
        size="sm"
      />

      {parsed && (
        <SectionCard>
          <div className="text-sm mb-1" style={{ color: 'var(--ink)' }}>
            {tImport.fileSelected.replace('{name}', parsed.file.name)}
          </div>
          <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {tImport.sourceDetected.replace('{source}', t.settings.import.step1.sources[parsed.source as ImportSource])}
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
