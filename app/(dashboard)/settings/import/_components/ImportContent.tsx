'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { SubpageHeader } from '@/app/(dashboard)/_components/SubpageHeader'
import { processFile, type DetectedSource, type ImportRow, type ProcessResult } from '@/lib/csvImport'
import {
  importCsvBatch,
  rollbackImportBatch,
  type ImportBatchInput,
  type ImportBatchSummary,
  type ImportPayerMember,
  type ImportSource,
} from '@/actions/import'
import { StepSource } from './StepSource'
import { StepMapping } from './StepMapping'
import { StepRules } from './StepRules'
import { StepConfirm } from './StepConfirm'
import { ImportResult } from './ImportResult'
import { ImportHistory } from './ImportHistory'

interface Member {
  id: string
  displayName: string
}

interface Props {
  viewer: Member
  partner: Member | null
  viewerIsMemberA: boolean
  history: ImportBatchSummary[]
}

export type WizardStep = 1 | 2 | 3 | 4

export interface ParsedFileState {
  file: File
  source: DetectedSource
  result: ProcessResult
}

export interface RuleState {
  payer: ImportPayerMember
  splitType: 'all_mine' | 'all_theirs' | 'half'
}

export interface ResultState {
  batchId: string
  importedCount: number
  errorCount: number
  /** Timestamp the batch was written — used to show the 24h rollback window. */
  importedAt: number
}

export function ImportContent({ viewer, partner, viewerIsMemberA, history }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const hasPartner = partner !== null

  const [step, setStep] = useState<WizardStep>(1)
  const [parsed, setParsed] = useState<ParsedFileState | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({})
  const [rules, setRules] = useState<RuleState>({
    payer: viewerIsMemberA ? 'a' : 'b',
    splitType: hasPartner ? 'half' : 'all_mine',
  })
  const [submitting, startSubmit] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<ResultState | null>(null)
  const [localHistory, setLocalHistory] = useState(history)

  async function handleFile(file: File, requestedSource: ImportSource) {
    setParseError(null)
    try {
      // For the four known sources the wizard forces detection up front. The
      // 'generic' source still needs a HeaderMap; until the generic-mapping
      // sub-flow lands the wizard simply hides that source choice — see the
      // empty `headerMap` branch in lib/csvImport which would throw.
      const result =
        requestedSource === 'generic'
          ? await processFile(file, { source: 'generic', headerMap: { date: 'Date', amount: 'Amount' } })
          : await processFile(file, { source: requestedSource })

      if (result.rows.length === 0) {
        setParseError(t.settings.import.errors.noValidRows)
        return
      }

      setParsed({ file, source: result.source, result })

      // Seed category map with auto-suggestions — every source row already
      // has a Futari category id post-mapping; the user can override here.
      const seedMap: Record<string, string> = {}
      for (const row of result.rows) {
        if (!(row.category in seedMap)) {
          seedMap[row.category] = row.category
        }
      }
      setCategoryMap(seedMap)

      setStep(2)
    } catch (err) {
      console.error('CSV parse error', err)
      setParseError(t.settings.import.errors.parseFailed)
    }
  }

  function applyCategoryMap(row: ImportRow): ImportRow {
    const next = categoryMap[row.category]
    if (next && next !== row.category) {
      return { ...row, category: next }
    }
    return row
  }

  function buildBatchInput(): ImportBatchInput | null {
    if (!parsed) return null
    const remappedRows = parsed.result.rows.map(applyCategoryMap)
    return {
      source: parsed.source as ImportSource,
      fileName: parsed.file.name,
      totalRows: parsed.result.stats.total,
      rows: remappedRows.map((r) => ({
        type: r.type,
        amount: r.amount,
        date: r.date.toISOString().slice(0, 10),
        category: r.category,
        description: r.description,
        paidBy: rules.payer,
        splitType: hasPartner ? rules.splitType : 'all_mine',
        originalCurrency: r.originalCurrency ?? null,
        originalAmount: r.originalAmount ?? null,
      })),
      errors: parsed.result.errors.map((e) => ({
        rowNumber: e.rowIndex + 1,
        rawRow: {},
        errorType: 'parse_error' as const,
        errorDetail: e.errors.join('; '),
      })),
    }
  }

  function handleSubmit() {
    setSubmitError(null)
    const input = buildBatchInput()
    if (!input) return

    startSubmit(async () => {
      try {
        const res = await importCsvBatch(input)
        setResult({
          batchId: res.batchId,
          importedCount: res.importedCount,
          errorCount: res.errorCount,
          importedAt: Date.now(),
        })
        // Refresh the page so the history list re-renders with the new batch.
        router.refresh()
      } catch (err) {
        console.error('import submit failed', err)
        setSubmitError(t.settings.import.errors.submitFailed)
      }
    })
  }

  function handleRollback(batchId: string) {
    setSubmitError(null)
    startSubmit(async () => {
      try {
        await rollbackImportBatch(batchId)
        // Optimistically mark the local entry rolled-back so the UI updates
        // without waiting for the server refresh.
        setLocalHistory((rows) =>
          rows.map((r) =>
            r.id === batchId
              ? { ...r, status: 'rolled_back', rolledBackAt: new Date(), rollbackable: false }
              : r,
          ),
        )
        if (result?.batchId === batchId) {
          setResult(null)
          setStep(1)
          setParsed(null)
          setCategoryMap({})
        }
        router.refresh()
      } catch (err) {
        console.error('rollback failed', err)
        setSubmitError(t.settings.import.errors.rollbackFailed)
      }
    })
  }

  function reset() {
    setStep(1)
    setParsed(null)
    setCategoryMap({})
    setResult(null)
    setSubmitError(null)
    setParseError(null)
  }

  return (
    <>
      <SubpageHeader
        title={t.settings.import.pageTitle}
        backLabel={t.settings.import.back}
        onBack={() => router.push('/settings')}
      />

      <div className="px-5 pt-6 pb-2">
        <h1
          className="text-page leading-tight"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {t.settings.import.pageTitle}
        </h1>
        <p className="text-sm mt-3" style={{ color: 'var(--ink-2)' }}>
          {t.settings.import.pageSubtitle}
        </p>
      </div>

      {result ? (
        <ImportResult
          result={result}
          onRollback={() => handleRollback(result.batchId)}
          onDone={() => router.push('/settings')}
          onAnother={reset}
          rollbacking={submitting}
        />
      ) : (
        <div className="px-4 pt-4 pb-6">
          <StepIndicator step={step} />

          {submitError && (
            <div
              className="text-xs px-4 py-3 rounded-xl mb-4"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                color: 'var(--debit)',
              }}
            >
              {submitError}
            </div>
          )}

          {step === 1 && (
            <StepSource
              onFile={handleFile}
              parseError={parseError}
              parsed={parsed}
              onNext={() => setStep(2)}
              onReset={reset}
            />
          )}

          {step === 2 && parsed && (
            <StepMapping
              rows={parsed.result.rows}
              categoryMap={categoryMap}
              onChange={setCategoryMap}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}

          {step === 3 && parsed && (
            <StepRules
              viewer={viewer}
              partner={partner}
              viewerIsMemberA={viewerIsMemberA}
              rules={rules}
              onChange={setRules}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          )}

          {step === 4 && parsed && (
            <StepConfirm
              rows={parsed.result.rows.map(applyCategoryMap)}
              invalidCount={parsed.result.errors.length}
              onBack={() => setStep(3)}
              onConfirm={handleSubmit}
              submitting={submitting}
            />
          )}
        </div>
      )}

      <div className="px-4 pb-12">
        <ImportHistory history={localHistory} onRollback={handleRollback} rollbacking={submitting} />
      </div>
    </>
  )
}

function StepIndicator({ step }: { step: WizardStep }) {
  const t = useTranslations()
  return (
    <div className="text-xs mb-4 px-1" style={{ color: 'var(--ink-3)' }}>
      {t.settings.import.stepLabel
        .replace('{current}', String(step))
        .replace('{total}', '4')}
    </div>
  )
}
