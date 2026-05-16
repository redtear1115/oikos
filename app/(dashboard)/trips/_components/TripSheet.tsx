'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { createTrip, updateTrip } from '@/actions/trip'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'
import type { TripCurrencyEntry, TripCurrencySnapshot } from '@/lib/trip-currency'
import { useTranslations } from '@/lib/i18n/client'

const PRESET_CURRENCIES = CURRENCIES.map(c => c.toUpperCase())
const MAX_ENTRIES = 5

export interface TripSheetInitial {
  id: string
  name: string
  startDate: string
  endDate: string | null
  defaultCurrency: string | null
  /** Trip's current rate_snapshot. Drives the multi-currency editor. */
  rateSnapshot: TripCurrencySnapshot | null
  /**
   * Edit-mode lock map. Key = uppercase currency code, '' = expenses recorded
   * in the trip's default currency. Value = expense count (>0 means locked).
   */
  usedCurrencyCounts?: Record<string, number>
}

interface Props {
  open: boolean
  baseCurrency: CurrencyCode
  onClose: () => void
  /** When provided, the sheet is in edit mode for this trip. */
  initial?: TripSheetInitial | null
  /** Fires after a successful save so the parent can refresh. */
  onSaved?: () => void
}

interface DraftEntry extends TripCurrencyEntry {
  /** Stable key so re-renders preserve focus on rows whose code is being edited. */
  uid: string
  /** True for the 4 preset codes; false for user-defined rows. */
  preset: boolean
}

let uidCounter = 0
const nextUid = () => `e${++uidCounter}`

function initialDraft(initial: TripSheetInitial | null | undefined, baseCurrency: string): {
  entries: DraftEntry[]
  defaultCode: string
} {
  if (initial?.rateSnapshot) {
    const snap = initial.rateSnapshot
    const seen = new Set(snap.entries.map(e => e.code))
    const entries: DraftEntry[] = snap.entries.map(e => ({
      ...e,
      uid: nextUid(),
      preset: PRESET_CURRENCIES.includes(e.code),
    }))
    // Synthesise rows for any preset codes the snapshot omits — so the UI
    // still shows their checkboxes unchecked. We mark these as "off" by
    // tracking inclusion via a separate set rather than rate=0; for simplicity
    // they live OUTSIDE the entries array (the rows are derived in render).
    void seen
    return { entries, defaultCode: snap.default }
  }
  const def = baseCurrency.toUpperCase()
  return {
    entries: [{ code: def, label: null, rate: 1, uid: nextUid(), preset: PRESET_CURRENCIES.includes(def) }],
    defaultCode: def,
  }
}

export function TripSheet({ open, baseCurrency, onClose, initial, onSaved }: Props) {
  const t = useTranslations()
  const ts = t.tripSheet
  const editing = !!initial
  const today = new Date().toISOString().slice(0, 10)
  const usedCounts = initial?.usedCurrencyCounts ?? {}
  const defaultHasExpenses = (usedCounts[''] ?? 0) > 0

  const [name, setName] = useState(initial?.name ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? today)
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [entries, setEntries] = useState<DraftEntry[]>(() => initialDraft(initial, baseCurrency).entries)
  const [defaultCode, setDefaultCode] = useState(() => initialDraft(initial, baseCurrency).defaultCode)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // Reset form whenever the sheet opens (or its initial trip changes) so the
  // FAB → "建立旅行" path doesn't leak state from a previous edit.
  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setStartDate(initial?.startDate ?? today)
    setEndDate(initial?.endDate ?? '')
    const seed = initialDraft(initial, baseCurrency)
    setEntries(seed.entries)
    setDefaultCode(seed.defaultCode)
    setErr(null)
  }, [open, initial, baseCurrency, today])

  function isCodeLocked(code: string): boolean {
    return (usedCounts[code] ?? 0) > 0
  }

  function togglePreset(code: string) {
    const upper = code.toUpperCase()
    const existing = entries.find(e => e.code === upper)
    if (existing) {
      // remove
      if (isCodeLocked(upper)) return
      if (upper === defaultCode) return // default cannot be removed via the checkbox
      setEntries(prev => prev.filter(e => e.code !== upper))
    } else {
      if (entries.length >= MAX_ENTRIES) {
        setErr(ts.errors.maxCurrencies.replace('{max}', String(MAX_ENTRIES)))
        return
      }
      setErr(null)
      setEntries(prev => [
        ...prev,
        { code: upper, label: null, rate: 1, uid: nextUid(), preset: true },
      ])
    }
  }

  function updateRate(uid: string, raw: string) {
    const parsed = parseFloat(raw)
    setEntries(prev => prev.map(e => e.uid === uid ? { ...e, rate: Number.isFinite(parsed) ? parsed : 0 } : e))
  }

  function updateCustomCode(uid: string, raw: string) {
    const next = raw.trim().toUpperCase().slice(0, 16)
    setEntries(prev => prev.map(e => {
      if (e.uid !== uid) return e
      const wasDefault = e.code === defaultCode
      const updated = { ...e, code: next }
      if (wasDefault) setDefaultCode(next)
      return updated
    }))
  }

  function updateCustomLabel(uid: string, raw: string) {
    const next = raw.slice(0, 32)
    setEntries(prev => prev.map(e => e.uid === uid ? { ...e, label: next || null } : e))
  }

  function addCustom() {
    if (entries.length >= MAX_ENTRIES) {
      setErr(`最多 ${MAX_ENTRIES} 個幣別`)
      return
    }
    setErr(null)
    setEntries(prev => [
      ...prev,
      { code: '', label: null, rate: 1, uid: nextUid(), preset: false },
    ])
  }

  function removeEntry(uid: string) {
    const entry = entries.find(e => e.uid === uid)
    if (!entry) return
    if (isCodeLocked(entry.code)) return
    if (entry.code === defaultCode) return
    setEntries(prev => prev.filter(e => e.uid !== uid))
  }

  function setAsDefault(code: string) {
    if (defaultHasExpenses && defaultCode !== code) return
    if (!entries.some(e => e.code === code)) return
    setDefaultCode(code)
  }

  // Derived: validation
  const trimmedName = name.trim()
  const dateInvalid = !!endDate && endDate < startDate
  const codeIssues = useMemo(() => {
    const codes = entries.map(e => e.code)
    const blank = codes.some(c => !c)
    const dup = new Set(codes).size !== codes.length
    const badRate = entries.some(e => !Number.isFinite(e.rate) || e.rate <= 0)
    const defaultMissing = !entries.some(e => e.code === defaultCode)
    return { blank, dup, badRate, defaultMissing }
  }, [entries, defaultCode])

  const formError = err
    ?? (codeIssues.blank ? ts.errors.codeBlank : null)
    ?? (codeIssues.dup ? ts.errors.codeDuplicate : null)
    ?? (codeIssues.badRate ? ts.errors.rateInvalid : null)
    ?? (codeIssues.defaultMissing ? ts.errors.defaultMissing : null)

  const canSave = !!trimmedName
    && !!startDate
    && !dateInvalid
    && !formError
    && !pending
    && entries.length >= 1

  function submit() {
    if (!canSave) return
    setErr(null)
    const payload: TripCurrencySnapshot = {
      default: defaultCode,
      entries: entries.map(e => ({ code: e.code, label: e.label || null, rate: e.rate })),
    }
    start(async () => {
      try {
        if (editing && initial) {
          await updateTrip({
            tripId: initial.id,
            name: trimmedName,
            startDate,
            endDate: endDate || null,
            currencies: payload,
          })
        } else {
          await createTrip({
            name: trimmedName,
            startDate,
            endDate: endDate || null,
            currencies: payload,
          })
        }
        onSaved?.()
        onClose()
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : editing ? ts.errors.updateFailed : ts.errors.createFailed)
      }
    })
  }

  // Render-time rows for presets (always 4 rows, in fixed order) + custom rows.
  const customRows = entries.filter(e => !e.preset)
  const presetIncluded = (code: string) => entries.find(e => e.code === code)

  return (
    <SheetShell
      open={open}
      title={editing ? ts.titleEdit : ts.titleNew}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={editing ? ts.saveEdit : ts.saveNew}
      error={formError ?? ''}
      onClose={onClose}
      onSave={submit}
    >
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{ts.nameLabel}</span>
          <input
            className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              color: 'var(--ink)',
            }}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={ts.namePlaceholder}
            maxLength={100}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{ts.startDateLabel}</span>
            <input
              type="date"
              className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                color: 'var(--ink)',
              }}
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{ts.endDateLabel}</span>
            <input
              type="date"
              className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: 'var(--surface)',
                border: dateInvalid ? '1px solid var(--debit, #c0392b)' : '1px solid var(--hairline)',
                color: 'var(--ink)',
              }}
              value={endDate}
              min={startDate || undefined}
              onChange={e => setEndDate(e.target.value)}
            />
          </label>
        </div>

        {dateInvalid && (
          <p className="text-xs -mt-2" style={{ color: 'var(--debit, #c0392b)' }} role="alert">
            {ts.endBeforeStart}
          </p>
        )}

        <div className="block">
          <div className="flex items-baseline justify-between">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{ts.currenciesSectionTitle}</span>
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
              {ts.currencyCountFormat.replace('{n}', String(entries.length)).replace('{max}', String(MAX_ENTRIES))}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            {ts.currenciesHint}
          </p>

          <div className="mt-2 flex flex-col gap-2">
            {PRESET_CURRENCIES.map(code => {
              const row = presetIncluded(code)
              const checked = !!row
              const locked = isCodeLocked(code)
              const isDefault = defaultCode === code
              const usedCount = usedCounts[code] ?? 0
              return (
                <CurrencyRow
                  key={code}
                  code={code}
                  label={ts.presetLabels[code as keyof typeof ts.presetLabels]}
                  rate={row?.rate ?? 1}
                  defaultCode={defaultCode}
                  checked={checked}
                  isDefault={isDefault}
                  defaultHasExpenses={defaultHasExpenses}
                  locked={locked}
                  usedCount={usedCount}
                  onToggle={() => togglePreset(code)}
                  onRateChange={(raw) => row && updateRate(row.uid, raw)}
                  onSetDefault={() => setAsDefault(code)}
                />
              )
            })}

            {customRows.map(row => {
              const locked = isCodeLocked(row.code)
              const isDefault = defaultCode === row.code
              const usedCount = usedCounts[row.code] ?? 0
              return (
                <CustomCurrencyRow
                  key={row.uid}
                  code={row.code}
                  label={row.label ?? ''}
                  rate={row.rate}
                  defaultCode={defaultCode}
                  isDefault={isDefault}
                  defaultHasExpenses={defaultHasExpenses}
                  locked={locked}
                  usedCount={usedCount}
                  onCodeChange={(raw) => updateCustomCode(row.uid, raw)}
                  onLabelChange={(raw) => updateCustomLabel(row.uid, raw)}
                  onRateChange={(raw) => updateRate(row.uid, raw)}
                  onSetDefault={() => row.code && setAsDefault(row.code)}
                  onRemove={() => removeEntry(row.uid)}
                />
              )
            })}

            {entries.length < MAX_ENTRIES && (
              <button
                type="button"
                onClick={addCustom}
                className="self-start mt-1 min-h-11 text-sm rounded-full px-4 cursor-pointer"
                style={{
                  background: 'transparent',
                  border: '1px dashed var(--hairline)',
                  color: 'var(--ink-2)',
                }}
              >
                {ts.addCustomCta}
              </button>
            )}
          </div>
        </div>

        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
          {ts.footerNote}
        </p>
      </div>
    </SheetShell>
  )
}

function CurrencyRow(props: {
  code: string
  label: string
  rate: number
  defaultCode: string
  checked: boolean
  isDefault: boolean
  defaultHasExpenses: boolean
  locked: boolean
  usedCount: number
  onToggle: () => void
  onRateChange: (raw: string) => void
  onSetDefault: () => void
}) {
  const t = useTranslations()
  const ts = t.tripSheet
  const { code, label, rate, defaultCode, checked, isDefault, defaultHasExpenses, locked, usedCount } = props
  const toggleDisabled = checked && (locked || isDefault)
  const rateInvalid = checked && !isDefault && (!Number.isFinite(rate) || rate <= 0)

  return (
    <RowFrame locked={locked} ghost={!checked}>
      {/* Header — full-width label so the entire row is a 44pt+ tap area. */}
      <label
        className="flex items-center gap-3 min-h-11 px-3 py-1"
        style={{ cursor: toggleDisabled ? 'default' : 'pointer' }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={toggleDisabled}
          onChange={props.onToggle}
          aria-label={`${code} ${label}`}
          className="cursor-pointer w-4 h-4"
          style={{ accentColor: 'var(--ink)' }}
        />
        <div className="flex-1 text-sm font-medium" style={{ color: checked ? 'var(--ink)' : 'var(--ink-2)' }}>
          {code} <span className="font-normal" style={{ color: 'var(--ink-3)' }}>{label}</span>
        </div>
        {checked && isDefault && (
          <span
            className="text-[11px] tracking-[0.5px] px-2 py-0.5 rounded-full"
            style={{ background: 'var(--ink)', color: 'var(--bg)' }}
          >
            {ts.defaultPill}
          </span>
        )}
      </label>

      {checked && !isDefault && (
        <>
          <RateRow
            code={code}
            defaultCode={defaultCode}
            rate={rate}
            locked={locked}
            invalid={rateInvalid}
            onRateChange={props.onRateChange}
          />
          <FooterRow
            isDefault={false}
            defaultHasExpenses={defaultHasExpenses}
            locked={locked}
            usedCount={usedCount}
            onSetDefault={props.onSetDefault}
          />
        </>
      )}
      {checked && isDefault && defaultHasExpenses && (
        <p className="text-xs px-3 pb-3" style={{ color: 'var(--ink-3)' }} role="status">
          {ts.defaultLockedNote}
        </p>
      )}
    </RowFrame>
  )
}

/**
 * Render the inverse rate (1 / rate) with sensible precision — trims trailing
 * zeros and caps the precision so big-denomination currencies like VND don't
 * overflow the row width (1/0.0013 = ~769 → "769" not "769.230769…").
 */
function formatInverse(rate: number): string {
  if (rate <= 0) return '—'
  const inv = 1 / rate
  // 4 significant digits is more than enough for psychological rates.
  if (inv >= 100) return inv.toFixed(0)
  if (inv >= 10) return inv.toFixed(1)
  if (inv >= 1) return inv.toFixed(2)
  return inv.toFixed(3)
}

function CustomCurrencyRow(props: {
  code: string
  label: string
  rate: number
  defaultCode: string
  isDefault: boolean
  defaultHasExpenses: boolean
  locked: boolean
  usedCount: number
  onCodeChange: (raw: string) => void
  onLabelChange: (raw: string) => void
  onRateChange: (raw: string) => void
  onSetDefault: () => void
  onRemove: () => void
}) {
  const t = useTranslations()
  const tsRow = t.tripSheet.customRow
  const { code, label, rate, defaultCode, isDefault, defaultHasExpenses, locked, usedCount } = props
  const rateInvalid = !isDefault && (!Number.isFinite(rate) || rate <= 0)

  return (
    <RowFrame locked={locked}>
      {/* Custom row header: code + label inputs + remove. The remove button
          is a separate 44pt target since the inputs themselves are 36px tall. */}
      <div className="flex items-center gap-2 px-3 pt-3">
        <input
          type="text"
          value={code}
          disabled={locked}
          onChange={e => props.onCodeChange(e.target.value)}
          placeholder={tsRow.codePlaceholder}
          maxLength={16}
          aria-label={tsRow.codeAriaLabel}
          className="w-20 rounded-lg px-2 py-2 text-sm uppercase"
          style={{
            background: locked ? 'var(--surface-alt)' : 'var(--bg)',
            border: '1px solid var(--hairline)',
            color: 'var(--ink)',
          }}
        />
        <input
          type="text"
          value={label}
          disabled={locked}
          onChange={e => props.onLabelChange(e.target.value)}
          placeholder={tsRow.labelPlaceholder}
          maxLength={32}
          aria-label={tsRow.labelAriaLabel}
          className="flex-1 min-w-0 rounded-lg px-2 py-2 text-sm"
          style={{
            background: locked ? 'var(--surface-alt)' : 'var(--bg)',
            border: '1px solid var(--hairline)',
            color: 'var(--ink)',
          }}
        />
        {!locked && !isDefault && (
          <button
            type="button"
            onClick={props.onRemove}
            aria-label={tsRow.removeAriaLabel}
            className="min-w-11 min-h-11 -mr-1 flex items-center justify-center bg-transparent cursor-pointer"
            style={{ border: 'none', color: 'var(--ink-3)' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      {!isDefault && (
        <RateRow
          code={code || '?'}
          defaultCode={defaultCode}
          rate={rate}
          locked={locked}
          invalid={rateInvalid}
          onRateChange={props.onRateChange}
        />
      )}
      <FooterRow
        isDefault={isDefault}
        defaultHasExpenses={defaultHasExpenses}
        locked={locked}
        usedCount={usedCount}
        onSetDefault={props.onSetDefault}
        disableSetDefault={!code}
      />
    </RowFrame>
  )
}

/**
 * Shared chrome for both preset and custom currency rows.
 *
 * - `locked`: row's currency has expenses → background switches to
 *   `--surface-alt` (no opacity reduction — opacity 0.5 was failing WCAG on
 *   already-secondary text per the UX audit).
 * - `ghost`: preset row that's unchecked → transparent background + softer
 *   text. Reduces visual weight so the section doesn't feel like 4 stacked
 *   cards before the user picks anything.
 */
function RowFrame({
  locked,
  ghost = false,
  children,
}: {
  locked: boolean
  ghost?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl flex flex-col"
      style={{
        background: ghost ? 'transparent' : (locked ? 'var(--surface-alt)' : 'var(--surface)'),
        border: `1px solid ${ghost ? 'transparent' : 'var(--hairline)'}`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * The "1 [code] = [input] [default]" rate row with inverse hint underneath.
 * Only rendered for non-default currencies (the default's rate is implicitly
 * 1 and showing a row that says so is just noise — see UX review §14).
 * `step="any"` (instead of 0.001) so user-defined small currencies like VND
 * (rate ≈ 0.0013) can be entered without UI clamping.
 */
function RateRow(props: {
  code: string
  defaultCode: string
  rate: number
  locked: boolean
  invalid: boolean
  onRateChange: (raw: string) => void
}) {
  const t = useTranslations()
  const ts = t.tripSheet
  const { code, defaultCode, rate, locked, invalid } = props
  return (
    <div className="px-3 pt-2 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
          1 {code} =
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={rate || ''}
          disabled={locked}
          onChange={e => props.onRateChange(e.target.value)}
          aria-invalid={invalid}
          className="flex-1 min-w-0 rounded-lg px-2.5 py-2 text-sm"
          style={{
            background: locked ? 'var(--surface-alt)' : 'var(--bg)',
            border: invalid ? '1px solid var(--debit)' : '1px solid var(--hairline)',
            color: 'var(--ink)',
          }}
        />
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
          {defaultCode}
        </span>
      </div>
      {invalid ? (
        <p className="text-xs" style={{ color: 'var(--debit)' }} role="alert">
          {ts.errors.rateInvalidInline}
        </p>
      ) : rate > 0 ? (
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
          {ts.rateInverseFormat
            .replace('{default}', defaultCode)
            .replace('{inverse}', formatInverse(rate))
            .replace('{code}', code)}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Footer row carrying the "set as default" chip + any lock status. The chip
 * replaces the old native radio so the tap target meets 44pt and the toggle
 * state is obvious without a tiny radio dot.
 */
function FooterRow(props: {
  isDefault: boolean
  defaultHasExpenses: boolean
  locked: boolean
  usedCount: number
  onSetDefault: () => void
  disableSetDefault?: boolean
}) {
  const t = useTranslations()
  const ts = t.tripSheet
  const { isDefault, defaultHasExpenses, locked, usedCount, disableSetDefault } = props
  const chipDisabled = isDefault || (defaultHasExpenses && !isDefault) || !!disableSetDefault
  return (
    <div className="px-3 pb-3 pt-2 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={props.onSetDefault}
        disabled={chipDisabled}
        aria-pressed={isDefault}
        className="min-h-11 px-3 rounded-full text-xs font-medium cursor-pointer disabled:cursor-default"
        style={{
          background: isDefault ? 'var(--ink)' : 'transparent',
          color: isDefault ? 'var(--bg)' : 'var(--ink-2)',
          border: isDefault ? '1px solid var(--ink)' : '1px solid var(--hairline)',
          opacity: chipDisabled && !isDefault ? 0.55 : 1,
        }}
      >
        {isDefault ? ts.chipIsDefault : ts.chipSetDefault}
      </button>
      {locked && !isDefault && (
        <span className="text-xs text-right" style={{ color: 'var(--ink-3)' }} role="status">
          {ts.usedCountNote.replace('{n}', String(usedCount))}
        </span>
      )}
      {isDefault && defaultHasExpenses && (
        <span className="text-xs text-right" style={{ color: 'var(--ink-3)' }} role="status">
          {ts.defaultLockedNote}
        </span>
      )}
    </div>
  )
}
