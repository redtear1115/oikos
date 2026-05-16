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

/**
 * Build the initial draft entries for the TripSheet. The trip's "default"
 * currency is always the group's base currency (the per-trip default picker
 * was removed — see #410 follow-up); we ensure a base entry with rate=1
 * exists at the front of the list.
 */
function initialDraft(
  initial: TripSheetInitial | null | undefined,
  baseCurrency: string,
): DraftEntry[] {
  const base = baseCurrency.toUpperCase()
  if (initial?.rateSnapshot) {
    const snap = initial.rateSnapshot
    const entries: DraftEntry[] = snap.entries
      .map(e => ({
        ...e,
        code: e.code.toUpperCase(),
        rate: e.code.toUpperCase() === base ? 1 : e.rate,
        uid: nextUid(),
        preset: PRESET_CURRENCIES.includes(e.code.toUpperCase()),
      }))
    if (!entries.some(e => e.code === base)) {
      entries.unshift({ code: base, label: null, rate: 1, uid: nextUid(), preset: PRESET_CURRENCIES.includes(base) })
    }
    return entries
  }
  return [{ code: base, label: null, rate: 1, uid: nextUid(), preset: PRESET_CURRENCIES.includes(base) }]
}

export function TripSheet({ open, baseCurrency, onClose, initial, onSaved }: Props) {
  const t = useTranslations()
  const ts = t.tripSheet
  const editing = !!initial
  const today = new Date().toISOString().slice(0, 10)
  // The trip's "default" is always the group base — there's no longer a UI to
  // change it. Non-base rows treat base as the conversion target.
  const baseCode = baseCurrency.toUpperCase()

  const [name, setName] = useState(initial?.name ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? today)
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [entries, setEntries] = useState<DraftEntry[]>(() => initialDraft(initial, baseCurrency))
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // Reset form whenever the sheet opens (or its initial trip changes) so the
  // FAB → "建立旅行" path doesn't leak state from a previous edit.
  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setStartDate(initial?.startDate ?? today)
    setEndDate(initial?.endDate ?? '')
    setEntries(initialDraft(initial, baseCurrency))
    setErr(null)
  }, [open, initial, baseCurrency, today])

  function usedCount(code: string): number {
    // Counts of TripExpenses already recorded against this currency. Rate edits
    // are still allowed (new records use the new rate; existing TripExpenses.
    // amount stays as already-stored base integers), but the UI surfaces the
    // count as soft context.
    return initial?.usedCurrencyCounts?.[code] ?? 0
  }

  function togglePreset(code: string) {
    const upper = code.toUpperCase()
    if (upper === baseCode) return  // base is always present, cannot toggle off
    const existing = entries.find(e => e.code === upper)
    if (existing) {
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
    setEntries(prev => prev.map(e => e.uid === uid ? { ...e, code: next } : e))
  }

  function updateCustomLabel(uid: string, raw: string) {
    const next = raw.slice(0, 32)
    setEntries(prev => prev.map(e => e.uid === uid ? { ...e, label: next || null } : e))
  }

  function addCustom() {
    if (entries.length >= MAX_ENTRIES) {
      setErr(ts.errors.maxCurrencies.replace('{max}', String(MAX_ENTRIES)))
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
    if (entry.code === baseCode) return  // base cannot be removed
    setEntries(prev => prev.filter(e => e.uid !== uid))
  }

  // Derived: validation
  const trimmedName = name.trim()
  const dateInvalid = !!endDate && endDate < startDate
  const codeIssues = useMemo(() => {
    // Validation runs against the non-base entries only — base is always
    // synthesised with rate=1 server-side.
    const nonBase = entries.filter(e => e.code !== baseCode)
    const codes = nonBase.map(e => e.code)
    const blank = codes.some(c => !c)
    const dup = new Set([baseCode, ...codes]).size !== codes.length + 1
    const badRate = nonBase.some(e => !Number.isFinite(e.rate) || e.rate <= 0)
    return { blank, dup, badRate }
  }, [entries, baseCode])

  const formError = err
    ?? (codeIssues.blank ? ts.errors.codeBlank : null)
    ?? (codeIssues.dup ? ts.errors.codeDuplicate : null)
    ?? (codeIssues.badRate ? ts.errors.rateInvalid : null)

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
      default: baseCode,
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
              const isBase = code === baseCode
              return (
                <CurrencyRow
                  key={code}
                  code={code}
                  label={ts.presetLabels[code as keyof typeof ts.presetLabels]}
                  rate={row?.rate ?? 1}
                  baseCode={baseCode}
                  checked={checked}
                  isBase={isBase}
                  usedCount={usedCount(code)}
                  onToggle={() => togglePreset(code)}
                  onRateChange={(raw) => row && updateRate(row.uid, raw)}
                />
              )
            })}

            {customRows.map(row => (
              <CustomCurrencyRow
                key={row.uid}
                code={row.code}
                label={row.label ?? ''}
                rate={row.rate}
                baseCode={baseCode}
                usedCount={usedCount(row.code)}
                onCodeChange={(raw) => updateCustomCode(row.uid, raw)}
                onLabelChange={(raw) => updateCustomLabel(row.uid, raw)}
                onRateChange={(raw) => updateRate(row.uid, raw)}
                onRemove={() => removeEntry(row.uid)}
              />
            ))}

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
  baseCode: string
  checked: boolean
  isBase: boolean
  usedCount: number
  onToggle: () => void
  onRateChange: (raw: string) => void
}) {
  const t = useTranslations()
  const ts = t.tripSheet
  const { code, label, rate, baseCode, checked, isBase, usedCount } = props
  const rateInvalid = checked && !isBase && (!Number.isFinite(rate) || rate <= 0)

  return (
    <RowFrame ghost={!checked}>
      {/* Header — full-width label so the entire row is a 44pt+ tap area.
          The base row is always checked + cannot be toggled off. */}
      <label
        className="flex items-center gap-3 min-h-11 px-3 py-1"
        style={{ cursor: isBase ? 'default' : 'pointer' }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={isBase}
          onChange={props.onToggle}
          aria-label={`${code} ${label}`}
          className="cursor-pointer w-4 h-4"
          style={{ accentColor: 'var(--ink)' }}
        />
        <div className="flex-1 text-sm font-medium" style={{ color: checked ? 'var(--ink)' : 'var(--ink-2)' }}>
          {code} <span className="font-normal" style={{ color: 'var(--ink-3)' }}>{label}</span>
        </div>
        {isBase && (
          <span
            className="text-[11px] tracking-[0.5px] px-2 py-0.5 rounded-full"
            style={{ background: 'var(--ink)', color: 'var(--bg)' }}
          >
            {ts.basePill}
          </span>
        )}
      </label>

      {checked && !isBase && (
        <>
          <RateRow
            code={code}
            baseCode={baseCode}
            rate={rate}
            invalid={rateInvalid}
            onRateChange={props.onRateChange}
          />
          {usedCount > 0 && (
            <p className="text-xs px-3 pb-3" style={{ color: 'var(--ink-3)' }} role="status">
              {ts.usedCountNote.replace('{n}', String(usedCount))}
            </p>
          )}
        </>
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
  baseCode: string
  usedCount: number
  onCodeChange: (raw: string) => void
  onLabelChange: (raw: string) => void
  onRateChange: (raw: string) => void
  onRemove: () => void
}) {
  const t = useTranslations()
  const tsRow = t.tripSheet.customRow
  const ts = t.tripSheet
  const { code, label, rate, baseCode, usedCount } = props
  const rateInvalid = !Number.isFinite(rate) || rate <= 0

  return (
    <RowFrame>
      {/* Custom row header: code + label inputs + remove. The remove button
          is a separate 44pt target since the inputs themselves are 36px tall. */}
      <div className="flex items-center gap-2 px-3 pt-3">
        <input
          type="text"
          value={code}
          onChange={e => props.onCodeChange(e.target.value)}
          placeholder={tsRow.codePlaceholder}
          maxLength={16}
          aria-label={tsRow.codeAriaLabel}
          className="w-20 rounded-lg px-2 py-2 text-sm uppercase"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--hairline)',
            color: 'var(--ink)',
          }}
        />
        <input
          type="text"
          value={label}
          onChange={e => props.onLabelChange(e.target.value)}
          placeholder={tsRow.labelPlaceholder}
          maxLength={32}
          aria-label={tsRow.labelAriaLabel}
          className="flex-1 min-w-0 rounded-lg px-2 py-2 text-sm"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--hairline)',
            color: 'var(--ink)',
          }}
        />
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
      </div>

      <RateRow
        code={code || '?'}
        baseCode={baseCode}
        rate={rate}
        invalid={rateInvalid}
        onRateChange={props.onRateChange}
      />
      {usedCount > 0 && (
        <p className="text-xs px-3 pb-3" style={{ color: 'var(--ink-3)' }} role="status">
          {ts.usedCountNote.replace('{n}', String(usedCount))}
        </p>
      )}
    </RowFrame>
  )
}

/**
 * Shared chrome for both preset and custom currency rows. `ghost` = preset
 * row that's unchecked → transparent background + softer text, reducing
 * visual weight so the section doesn't feel like a stack of cards before
 * the user picks anything.
 */
function RowFrame({
  ghost = false,
  children,
}: {
  ghost?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl flex flex-col"
      style={{
        background: ghost ? 'transparent' : 'var(--surface)',
        border: `1px solid ${ghost ? 'transparent' : 'var(--hairline)'}`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * The "1 [code] = [input] [base]" rate row with inverse hint underneath.
 * The base currency itself never renders a rate row (its rate is implicitly 1).
 * `step="any"` so user-defined small currencies like VND (rate ≈ 0.0013) can
 * be entered without UI clamping.
 *
 * Rates can be edited mid-trip; historical TripExpenses.amount (base integer)
 * is unaffected, so this row never goes "locked" — only the soft
 * usedCountNote message below mentions that older records keep their original
 * conversion.
 */
function RateRow(props: {
  code: string
  baseCode: string
  rate: number
  invalid: boolean
  onRateChange: (raw: string) => void
}) {
  const t = useTranslations()
  const ts = t.tripSheet
  const { code, baseCode, rate, invalid } = props
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
          onChange={e => props.onRateChange(e.target.value)}
          aria-invalid={invalid}
          className="flex-1 min-w-0 rounded-lg px-2.5 py-2 text-sm"
          style={{
            background: 'var(--bg)',
            border: invalid ? '1px solid var(--debit)' : '1px solid var(--hairline)',
            color: 'var(--ink)',
          }}
        />
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
          {baseCode}
        </span>
      </div>
      {invalid ? (
        <p className="text-xs" style={{ color: 'var(--debit)' }} role="alert">
          {ts.errors.rateInvalidInline}
        </p>
      ) : rate > 0 ? (
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
          {ts.rateInverseFormat
            .replace('{default}', baseCode)
            .replace('{inverse}', formatInverse(rate))
            .replace('{code}', code)}
        </p>
      ) : null}
    </div>
  )
}
