'use client'

import { useId, useMemo, useRef, useState, useTransition, type DragEvent } from 'react'
import Link from 'next/link'

import { useTranslations } from '@/lib/i18n/client'
import { PICKABLE_CATEGORIES } from '@/lib/categories'
import { PICKABLE_INCOME_CATEGORIES } from '@/lib/incomeCategories'
import { parseCsvBuffer } from '@/lib/csvImport/parser'
import { detectSource, type DetectedSource } from '@/lib/csvImport/detector'
import {
  mapCwmoney,
  mapHoneydue,
  mapSpendee,
  mapCategory,
  parseAmount,
  parseDate,
} from '@/lib/csvImport/mapper'
import { validateRow } from '@/lib/csvImport/validator'
import type { ImportRow, ImportRowType, PartialImportRow } from '@/lib/csvImport/types'
import {
  findImportDuplicates,
  importCsvBatch,
  type ImportBatchResult,
  type ImportRowWire,
} from '@/actions/import'

const MAX_BYTES = 2 * 1024 * 1024  // 2 MB — matches spec §Upload constraint
const MAX_ROWS = 5000              // matches spec §Locked decisions

type Step = 'upload' | 'map' | 'payer' | 'confirm' | 'result'

/** Parser output bundled with raw competitor category strings (lost by the
 *  parser layer once `mapCategory` runs, but the wizard needs them to render
 *  the mapping table). Aligned 1:1 with `parsed.rows` by index. */
interface ParsedFile {
  source: DetectedSource
  fileName: string
  rows: ImportRow[]                        // validated, post-mapper
  rowsWithRaw: Array<ImportRow & { rawCategory: string }>
  invalidCount: number
  warningCount: number
}

interface DupSummary {
  status: 'idle' | 'loading' | 'ready' | 'error'
  duplicateIndices: number[]
}

export function ImportClient({ isSolo }: { isSolo: boolean }) {
  const t = useTranslations()
  const tt = t.importPage

  const [step, setStep] = useState<Step>('upload')
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)

  // Category overrides — keyed by raw competitor category string.
  // Initial value seeded after parse; user edits override mapper's guess.
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({})

  const [defaultPayer, setDefaultPayer] = useState<'viewer' | 'partner'>('viewer')
  const [defaultSplit, setDefaultSplit] = useState<'half' | 'all_mine' | 'all_theirs'>(
    isSolo ? 'all_mine' : 'half',
  )
  const [sourceLabel, setSourceLabel] = useState('')
  const [skipDuplicates, setSkipDuplicates] = useState(true)

  const [dupSummary, setDupSummary] = useState<DupSummary>({
    status: 'idle',
    duplicateIndices: [],
  })

  const [isImporting, startImportTransition] = useTransition()
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportBatchResult | null>(null)

  // ─── Apply user overrides to produce final wire rows ─────────────────────
  const finalRows: ImportRowWire[] = useMemo(() => {
    if (!parsed) return []
    return parsed.rowsWithRaw.map<ImportRowWire>((r) => {
      const userMappedCategory = r.rawCategory ? categoryMap[r.rawCategory] : undefined
      // Income rows pull from the income category palette — the spec routes
      // them to IncomeTransactions whose `category` is independent of expense.
      const category = (r.type === 'income')
        ? toIncomeCategory(userMappedCategory ?? r.category)
        : (userMappedCategory ?? r.category)
      return {
        date: toYmd(r.date),
        amount: r.amount,
        type: r.type,
        category,
        description: r.description,
        // The mapper currently hardcodes paidBy='viewer' for every parser. Treat
        // it as a placeholder and replace with the wizard's file-level choice.
        paidBy: defaultPayer,
        // Solo group: server defends `all_mine`, but pass the wizard's choice
        // through for the (future) shared-group case where the locked selector
        // is unlocked.
        splitType: isSolo ? 'all_mine' : defaultSplit,
      }
    })
  }, [parsed, categoryMap, defaultPayer, defaultSplit, isSolo])

  // ─── File picker handler ────────────────────────────────────────────────
  async function handleFile(file: File | undefined | null) {
    if (!file) return
    setUploadError(null)
    setImportError(null)
    setImportResult(null)

    if (file.size > MAX_BYTES) {
      setUploadError(tt.upload.tooLarge)
      return
    }

    setIsParsing(true)
    try {
      const buf = await file.arrayBuffer()
      const result = parseAndValidate(buf, file.name)
      if (result.rowsWithRaw.length > MAX_ROWS) {
        setUploadError(tt.upload.tooManyRows)
        return
      }
      setParsed(result)
      setCategoryMap(seedCategoryMap(result.rowsWithRaw))
    } catch {
      setUploadError(tt.upload.parseError)
    } finally {
      setIsParsing(false)
    }
  }

  // ─── Step transitions ───────────────────────────────────────────────────
  async function goToConfirm() {
    setStep('confirm')
    if (finalRows.length === 0) return
    setDupSummary({ status: 'loading', duplicateIndices: [] })
    try {
      const { duplicateIndices } = await findImportDuplicates(finalRows)
      setDupSummary({ status: 'ready', duplicateIndices })
    } catch {
      setDupSummary({ status: 'error', duplicateIndices: [] })
    }
  }

  function runImport() {
    if (!parsed) return
    setImportError(null)
    startImportTransition(async () => {
      try {
        const result = await importCsvBatch(finalRows, {
          source: parsed.source,
          fileName: parsed.fileName,
          skipDuplicates,
        })
        setImportResult(result)
        setStep('result')
      } catch (err) {
        setImportError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  function reset() {
    setParsed(null)
    setUploadError(null)
    setCategoryMap({})
    setSourceLabel('')
    setDupSummary({ status: 'idle', duplicateIndices: [] })
    setImportError(null)
    setImportResult(null)
    setStep('upload')
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {step !== 'result' && (
        <StepIndicator current={stepIndex(step)} total={4} template={tt.stepLabel} />
      )}

      {step === 'upload' && (
        <UploadStep
          t={tt}
          isParsing={isParsing}
          uploadError={uploadError}
          parsed={parsed}
          onPick={handleFile}
          onReset={reset}
          onNext={() => setStep('map')}
        />
      )}

      {step === 'map' && parsed && (
        <CategoryMapStep
          t={tt}
          parsed={parsed}
          categoryMap={categoryMap}
          onChange={(raw, futari) =>
            setCategoryMap((m) => ({ ...m, [raw]: futari }))
          }
          onBack={() => setStep('upload')}
          onNext={() => setStep('payer')}
        />
      )}

      {step === 'payer' && parsed && (
        <PayerSplitStep
          t={tt}
          isSolo={isSolo}
          defaultPayer={defaultPayer}
          defaultSplit={defaultSplit}
          sourceLabel={sourceLabel}
          onPayer={setDefaultPayer}
          onSplit={setDefaultSplit}
          onSourceLabel={setSourceLabel}
          onBack={() => setStep('map')}
          onNext={goToConfirm}
        />
      )}

      {step === 'confirm' && parsed && (
        <ConfirmStep
          t={tt}
          rows={finalRows}
          dupSummary={dupSummary}
          skipDuplicates={skipDuplicates}
          onSkipDuplicatesChange={setSkipDuplicates}
          isImporting={isImporting}
          importError={importError}
          onBack={() => setStep('payer')}
          onImport={runImport}
        />
      )}

      {step === 'result' && importResult && (
        <ResultStep t={tt} result={importResult} onReset={reset} />
      )}
    </div>
  )
}

// ───────────────────────────── Step 1: Upload ─────────────────────────────

function UploadStep({
  t, isParsing, uploadError, parsed, onPick, onReset, onNext,
}: {
  t: ReturnType<typeof useTranslations>['importPage']
  isParsing: boolean
  uploadError: string | null
  parsed: ParsedFile | null
  onPick: (file: File | undefined | null) => void
  onReset: () => void
  onNext: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [isDragging, setIsDragging] = useState(false)

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
    onPick(e.dataTransfer.files?.[0])
  }

  const hasUsableRows = parsed !== null && parsed.rows.length > 0
  const sourceLabel = parsed
    ? t.upload.detectedSource.replace('{source}', t.sources[parsed.source])
    : null
  const rowCounts = parsed
    ? t.upload.rowCounts
        .replace('{total}', String(parsed.rowsWithRaw.length + parsed.invalidCount))
        .replace('{valid}', String(parsed.rows.length))
        .replace('{invalid}', String(parsed.invalidCount))
    : null

  return (
    <div className="space-y-4">
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
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <div className="text-[15px] mb-3">{t.upload.prompt}</div>
        <span
          className="inline-flex items-center justify-center h-10 px-5 rounded-xl text-white text-[14px] font-medium"
          style={{ background: 'var(--btn-primary-bg)', letterSpacing: '0.6px' }}
        >
          {isParsing ? t.upload.parsing : t.upload.button}
        </span>
        <div className="text-[12px] mt-3" style={{ color: 'var(--ink-3)' }}>
          {t.upload.constraint}
        </div>
      </label>

      {uploadError && (
        <ErrorCard message={uploadError} />
      )}

      {parsed && (
        <section
          className="rounded-2xl px-5 py-5 space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <div>
            <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
              {t.upload.detectedHeading}
            </div>
            <div className="text-[15px] mt-1" style={{ color: 'var(--ink)' }}>
              {sourceLabel}
            </div>
            {rowCounts && (
              <div className="text-xs mt-2" style={{ color: 'var(--ink-2)' }}>
                {rowCounts}
              </div>
            )}
          </div>

          {hasUsableRows ? (
            <PreviewTable t={t} rows={parsed.rows.slice(0, 5)} />
          ) : (
            <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
              {t.upload.noRowsValid}
            </div>
          )}
        </section>
      )}

      <NavBar
        backLabel={t.nav.cancel}
        nextLabel={t.nav.next}
        onBack={onReset}
        onNext={onNext}
        nextDisabled={!hasUsableRows}
      />
    </div>
  )
}

function PreviewTable({
  t,
  rows,
}: {
  t: ReturnType<typeof useTranslations>['importPage']
  rows: readonly ImportRow[]
}) {
  return (
    <div>
      <div className="text-xs mb-2" style={{ color: 'var(--ink-3)' }}>
        {t.upload.previewHeading}
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13px]" style={{ color: 'var(--ink)' }}>
          <thead>
            <tr style={{ color: 'var(--ink-3)' }}>
              <Th>{t.upload.col.date}</Th>
              <Th>{t.upload.col.type}</Th>
              <Th align="right">{t.upload.col.amount}</Th>
              <Th>{t.upload.col.category}</Th>
              <Th>{t.upload.col.description}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--hairline)' }}>
                <Td>{toYmd(r.date)}</Td>
                <Td>{r.type === 'expense' ? '-' : '+'}</Td>
                <Td align="right">{r.amount.toLocaleString()}</Td>
                <Td>{r.category}</Td>
                <Td>{r.description}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] mt-2" style={{ color: 'var(--ink-3)' }}>
        {t.upload.previewCaption}
      </div>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      className="text-left text-[11px] font-normal py-2 px-2"
      style={{ textAlign: align ?? 'left' }}
    >
      {children}
    </th>
  )
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <td className="py-2 px-2 align-top" style={{ textAlign: align ?? 'left' }}>
      {children}
    </td>
  )
}

// ───────────────────────────── Step 2: Category map ─────────────────────────

function CategoryMapStep({
  t, parsed, categoryMap, onChange, onBack, onNext,
}: {
  t: ReturnType<typeof useTranslations>['importPage']
  parsed: ParsedFile
  categoryMap: Record<string, string>
  onChange: (rawCategory: string, futariCategory: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const distinct = useMemo(() => distinctRawCategories(parsed.rowsWithRaw), [parsed])

  return (
    <div className="space-y-4">
      <SectionHeading title={t.categoryMap.heading} body={t.categoryMap.body} />

      {distinct.length === 0 ? (
        <p className="text-sm px-1" style={{ color: 'var(--ink-2)' }}>
          {t.categoryMap.empty}
        </p>
      ) : (
        <ul
          className="rounded-2xl divide-y"
          style={{ background: 'var(--surface)', borderColor: 'var(--hairline)' }}
        >
          {distinct.map((raw) => {
            const current = categoryMap[raw] ?? mapCategory(raw)
            const isUnmapped = current === 'other' && mapCategory(raw) === 'other'
            return (
              <li key={raw} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate" style={{ color: 'var(--ink)' }}>
                    {raw}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                    {t.categoryMap.columnFrom}
                  </div>
                </div>
                <div className="text-right">
                  <select
                    value={current}
                    onChange={(e) => onChange(raw, e.target.value)}
                    className="text-sm rounded-md px-2 py-1.5 bg-transparent"
                    style={{
                      border: '1px solid var(--hairline)',
                      color: 'var(--ink)',
                    }}
                  >
                    {PICKABLE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  {isUnmapped && (
                    <div className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
                      {t.categoryMap.unmappedHint}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <NavBar
        backLabel={t.nav.back}
        nextLabel={t.nav.next}
        onBack={onBack}
        onNext={onNext}
      />
    </div>
  )
}

// ───────────────────────────── Step 3: Payer + split ────────────────────────

function PayerSplitStep({
  t, isSolo, defaultPayer, defaultSplit, sourceLabel,
  onPayer, onSplit, onSourceLabel, onBack, onNext,
}: {
  t: ReturnType<typeof useTranslations>['importPage']
  isSolo: boolean
  defaultPayer: 'viewer' | 'partner'
  defaultSplit: 'half' | 'all_mine' | 'all_theirs'
  sourceLabel: string
  onPayer: (p: 'viewer' | 'partner') => void
  onSplit: (s: 'half' | 'all_mine' | 'all_theirs') => void
  onSourceLabel: (s: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="space-y-5">
      <SectionHeading title={t.payerSplit.heading} body={t.payerSplit.body} />

      {!isSolo && (
        <Field label={t.payerSplit.payerLabel}>
          <SegmentedControl
            value={defaultPayer}
            options={[
              { value: 'viewer', label: t.payerSplit.payerViewer },
              { value: 'partner', label: t.payerSplit.payerPartner },
            ]}
            onChange={onPayer}
          />
        </Field>
      )}

      <Field label={t.payerSplit.splitLabel}>
        {isSolo ? (
          <p className="text-xs px-1" style={{ color: 'var(--ink-3)' }}>
            {t.payerSplit.soloLockHint}
          </p>
        ) : (
          <SegmentedControl
            value={defaultSplit}
            options={[
              { value: 'half', label: t.payerSplit.splitHalf },
              { value: 'all_mine', label: t.payerSplit.splitAllMine },
              { value: 'all_theirs', label: t.payerSplit.splitAllTheirs },
            ]}
            onChange={onSplit}
          />
        )}
      </Field>

      <Field label={t.payerSplit.sourceLabel}>
        <input
          type="text"
          value={sourceLabel}
          onChange={(e) => onSourceLabel(e.target.value)}
          placeholder={t.payerSplit.sourcePlaceholder}
          className="w-full rounded-xl px-4 py-3 text-sm bg-transparent"
          style={{
            border: '1px solid var(--hairline)',
            color: 'var(--ink)',
          }}
        />
      </Field>

      <NavBar
        backLabel={t.nav.back}
        nextLabel={t.nav.next}
        onBack={onBack}
        onNext={onNext}
      />
    </div>
  )
}

// ───────────────────────────── Step 4: Confirm ──────────────────────────────

function ConfirmStep({
  t, rows, dupSummary, skipDuplicates, onSkipDuplicatesChange,
  isImporting, importError, onBack, onImport,
}: {
  t: ReturnType<typeof useTranslations>['importPage']
  rows: readonly ImportRowWire[]
  dupSummary: DupSummary
  skipDuplicates: boolean
  onSkipDuplicatesChange: (v: boolean) => void
  isImporting: boolean
  importError: string | null
  onBack: () => void
  onImport: () => void
}) {
  const expense = rows.filter((r) => r.type === 'expense').length
  const income = rows.filter((r) => r.type === 'income').length
  const dupCount = dupSummary.duplicateIndices.length
  const skipCount = skipDuplicates ? dupCount : 0

  const [expanded, setExpanded] = useState(false)
  const visibleDups = dupSummary.duplicateIndices.slice(0, 10)

  return (
    <div className="space-y-5">
      <SectionHeading title={t.confirm.heading} body={t.confirm.body} />

      <div
        className="rounded-2xl px-5 py-5 space-y-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <CountRow label={t.confirm.expenseCount.replace('{n}', String(expense))} />
        <CountRow label={t.confirm.incomeCount.replace('{n}', String(income))} />
        <CountRow
          label={t.confirm.skipCount.replace('{n}', String(skipCount))}
          dim
        />
      </div>

      <div
        className="rounded-2xl px-5 py-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => onSkipDuplicatesChange(e.target.checked)}
            className="mt-0.5"
          />
          <div className="flex-1">
            <div className="text-sm" style={{ color: 'var(--ink)' }}>
              {t.confirm.skipDuplicatesToggle}
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
              {t.confirm.skipDuplicatesHint}
            </div>
          </div>
        </label>
      </div>

      <div
        className="rounded-2xl px-5 py-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-sm" style={{ color: 'var(--ink)' }}>
            {t.confirm.duplicatesHeading}
          </div>
          {dupSummary.status === 'loading' && (
            <div className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
              {t.confirm.checkingDuplicates}
            </div>
          )}
          {dupSummary.status === 'error' && (
            <div className="text-[11px]" style={{ color: 'var(--debit)' }}>
              {t.confirm.duplicateCheckError}
            </div>
          )}
        </div>

        {dupSummary.status === 'ready' && dupCount === 0 && (
          <div className="text-[12px] mt-2" style={{ color: 'var(--ink-2)' }}>
            {t.confirm.duplicatesEmpty}
          </div>
        )}

        {dupSummary.status === 'ready' && dupCount > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setExpanded((x) => !x)}
              className="text-[12px] underline bg-transparent cursor-pointer"
              style={{ color: 'var(--ink-2)' }}
            >
              {expanded ? t.confirm.duplicatesHide : t.confirm.duplicatesShow}
            </button>
            {expanded && (
              <ul className="mt-2 space-y-1.5">
                {visibleDups.map((idx) => {
                  const r = rows[idx]
                  if (!r) return null
                  return (
                    <li
                      key={idx}
                      className="text-[12px] flex items-center justify-between gap-3 py-1.5 px-2 rounded-md"
                      style={{ background: 'var(--surface-alt)', color: 'var(--ink-2)' }}
                    >
                      <span className="truncate">
                        {r.date} · {r.category} · {r.description || '—'}
                      </span>
                      <span style={{ color: 'var(--ink-3)' }}>
                        {r.amount.toLocaleString()}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {importError && <ErrorCard message={importError} />}

      <NavBar
        backLabel={t.nav.back}
        nextLabel={isImporting ? t.nav.importing : t.nav.startImport}
        onBack={onBack}
        onNext={onImport}
        nextDisabled={isImporting || rows.length === 0}
      />
    </div>
  )
}

// ───────────────────────────── Step 5: Result ───────────────────────────────

function ResultStep({
  t, result, onReset,
}: {
  t: ReturnType<typeof useTranslations>['importPage']
  result: ImportBatchResult
  onReset: () => void
}) {
  return (
    <div className="space-y-5">
      <section
        className="rounded-2xl px-5 py-6 text-center space-y-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <h2 className="text-[18px] font-medium" style={{ color: 'var(--ink)' }}>
          {t.result.successHeading}
        </h2>
        <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
          {t.result.successBody}
        </p>
        <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
          {t.result.counts
            .replace('{imported}', String(result.imported))
            .replace('{skipped}', String(result.skipped))}
        </p>
      </section>

      <div className="space-y-3">
        <Link
          href="/records"
          className="block w-full text-center rounded-xl px-5 py-3 text-white text-sm font-medium"
          style={{ background: 'var(--btn-primary-bg)' }}
        >
          {t.result.goToRecords}
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="block w-full text-center rounded-xl px-5 py-3 text-sm bg-transparent cursor-pointer"
          style={{ border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
        >
          {t.result.importAnother}
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────── Shared primitives ────────────────────────────

function StepIndicator({
  current, total, template,
}: { current: number; total: number; template: string }) {
  return (
    <div className="text-[11px] px-1" style={{ color: 'var(--ink-3)' }}>
      {template.replace('{current}', String(current)).replace('{total}', String(total))}
    </div>
  )
}

function NavBar({
  backLabel, nextLabel, onBack, onNext, nextDisabled,
}: {
  backLabel: string
  nextLabel: string
  onBack: () => void
  onNext: () => void
  nextDisabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        type="button"
        onClick={onBack}
        className="flex-1 rounded-xl px-4 py-3 text-sm bg-transparent cursor-pointer"
        style={{ border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
      >
        {backLabel}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="flex-1 rounded-xl px-4 py-3 text-white text-sm font-medium cursor-pointer disabled:cursor-default disabled:opacity-60"
        style={{ background: 'var(--btn-primary-bg)' }}
      >
        {nextLabel}
      </button>
    </div>
  )
}

function SectionHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-1">
      <h2 className="text-[16px] font-medium" style={{ color: 'var(--ink)' }}>
        {title}
      </h2>
      <p className="text-[13px] mt-1" style={{ color: 'var(--ink-2)' }}>
        {body}
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs px-1" style={{ color: 'var(--ink-3)' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function SegmentedControl<T extends string>({
  value, options, onChange,
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div
      className="inline-flex rounded-xl p-1"
      style={{ background: 'var(--surface-alt)' }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="px-3 py-2 text-sm rounded-lg bg-transparent cursor-pointer"
            style={{
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--ink-3)',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.04)' : undefined,
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function CountRow({ label, dim }: { label: string; dim?: boolean }) {
  return (
    <div
      className="text-sm"
      style={{ color: dim ? 'var(--ink-3)' : 'var(--ink)' }}
    >
      {label}
    </div>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-[13px]"
      style={{ background: 'var(--surface-alt)', color: 'var(--debit)' }}
    >
      {message}
    </div>
  )
}

// ───────────────────────────── Helpers ──────────────────────────────────────

function stepIndex(step: Step): number {
  switch (step) {
    case 'upload':  return 1
    case 'map':     return 2
    case 'payer':   return 3
    case 'confirm': return 4
    case 'result':  return 4
  }
}

/** YYYY-MM-DD from a Date — local-calendar so a 2026-05-09 entry stays
 *  2026-05-09 regardless of the user's runtime timezone. */
function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const INCOME_IDS = new Set(PICKABLE_INCOME_CATEGORIES.map((c) => c.id))

/** Cast an expense category back to a valid income category id (or 'other').
 *  Income rows go to IncomeTransactions, whose `category` is a different enum;
 *  the mapping wizard only lists expense categories so income rows that go
 *  through user overrides need this safety net. */
function toIncomeCategory(id: string): string {
  return INCOME_IDS.has(id as never) ? id : 'other'
}

function distinctRawCategories(
  rows: readonly { rawCategory: string }[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    const raw = r.rawCategory.trim()
    if (!raw) continue
    if (seen.has(raw)) continue
    seen.add(raw)
    out.push(raw)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

function seedCategoryMap(
  rows: readonly { rawCategory: string; category: string }[],
): Record<string, string> {
  const seed: Record<string, string> = {}
  for (const r of rows) {
    const raw = r.rawCategory.trim()
    if (!raw || raw in seed) continue
    seed[raw] = r.category
  }
  return seed
}

/**
 * Mirror of `lib/csvImport#processBuffer`, except we preserve the raw
 * competitor category string per row. The parser layer loses it once
 * `mapCategory` runs, but the wizard needs it to render the mapping table
 * (raw → futari). Kept inline so the lib stays a pure transform and this
 * UI-specific concern doesn't leak into it.
 */
function parseAndValidate(buffer: ArrayBuffer, fileName: string): ParsedFile {
  const { headers, rows: rawRows } = parseCsvBuffer(buffer)
  const source = detectSource(headers)
  if (rawRows.length === 0) {
    return {
      source, fileName,
      rows: [], rowsWithRaw: [], invalidCount: 0, warningCount: 0,
    }
  }
  const mapper = pickMapper(source)
  const rowsWithRaw: Array<ImportRow & { rawCategory: string }> = []
  const rows: ImportRow[] = []
  let invalidCount = 0
  let warningCount = 0

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]!
    const partial = mapper(raw)
    const result = validateRow(partial, i)
    if (result.warnings.length > 0) warningCount++
    if (!result.ok || !isComplete(partial)) {
      invalidCount++
      continue
    }
    rows.push(partial)
    rowsWithRaw.push({
      ...partial,
      rawCategory: pickRawCategory(source, raw),
    })
  }
  return { source, fileName, rows, rowsWithRaw, invalidCount, warningCount }
}

function pickMapper(source: DetectedSource) {
  switch (source) {
    case 'honeydue': return (r: Record<string, string>) => mapHoneydue(r)
    case 'spendee':  return (r: Record<string, string>) => mapSpendee(r)
    case 'cwmoney':  return (r: Record<string, string>) => mapCwmoney(r)
    case 'generic':  return (r: Record<string, string>) => fallbackGeneric(r)
  }
}

/** Generic / unknown source: pull from common date/amount/category/note column
 *  names. Mirrors the heuristics in `lib/migrate/csv.ts#computeStats` so the
 *  authenticated importer matches the anonymous /migrate preview. */
function fallbackGeneric(row: Record<string, string>): PartialImportRow {
  const dateRaw =
    row['date'] ?? row['Date'] ?? row['DATE'] ?? row['日期'] ?? row['datetime'] ?? ''
  const amtRaw =
    row['amount'] ?? row['Amount'] ?? row['AMOUNT'] ?? row['金額'] ?? row['value'] ?? ''
  const catRaw =
    row['category'] ?? row['Category'] ?? row['Category name'] ?? row['類別'] ?? row['type'] ?? ''
  const noteRaw =
    row['note'] ?? row['Note'] ?? row['memo'] ?? row['Memo'] ?? row['備註'] ?? row['description'] ?? row['Description'] ?? ''
  const typeRaw =
    row['類型'] ?? row['Type'] ?? row['type'] ?? ''
  const date = parseDate(dateRaw)
  const amt = parseAmount(amtRaw)
  const out: PartialImportRow = {
    category: mapCategory(catRaw),
    description: noteRaw.trim(),
    paidBy: 'viewer',
    splitType: 'half',
  }
  if (date) out.date = date
  if (amt) {
    out.amount = amt.value
    out.type = inferType(typeRaw, amt.isNegative)
  }
  return out
}

function inferType(rawType: string, isNegative: boolean): ImportRowType {
  const t = rawType.trim().toLowerCase()
  if (t === '支出' || t === 'expense' || t === 'debit' || t === 'out') return 'expense'
  if (t === '收入' || t === 'income' || t === 'credit' || t === 'in')  return 'income'
  return isNegative ? 'expense' : 'income'
}

function isComplete(row: PartialImportRow): row is ImportRow {
  return (
    row.date instanceof Date &&
    typeof row.amount === 'number' &&
    typeof row.type === 'string' &&
    typeof row.category === 'string' &&
    typeof row.description === 'string' &&
    typeof row.paidBy === 'string' &&
    typeof row.splitType === 'string'
  )
}

/** Pull the raw competitor category text from the original row, before the
 *  mapper synonym-folds it. Per-source picks mirror the mapper's key lookup
 *  order so the mapping wizard shows what the user actually wrote. */
function pickRawCategory(source: DetectedSource, row: Record<string, string>): string {
  switch (source) {
    case 'honeydue':
      return (row['Category'] ?? row['category'] ?? '').trim()
    case 'spendee':
      return (row['Category name'] ?? row['Category'] ?? row['category'] ?? '').trim()
    case 'cwmoney':
      return (row['類別'] ?? row['Category'] ?? row['i_kind'] ?? row['category'] ?? '').trim()
    case 'generic':
      return (row['category'] ?? row['Category'] ?? row['Category name'] ?? row['類別'] ?? '').trim()
  }
}
