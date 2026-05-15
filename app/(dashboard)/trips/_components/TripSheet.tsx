'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { createTrip, updateTrip } from '@/actions/trip'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'
import type { TripCurrencyEntry, TripCurrencySnapshot } from '@/lib/trip-currency'

const PRESET_CURRENCIES = CURRENCIES.map(c => c.toUpperCase())
const PRESET_LABELS: Record<string, string> = {
  TWD: '台幣',
  CNY: '人民幣',
  USD: '美元',
  JPY: '日圓',
}
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
        setErr(`最多 ${MAX_ENTRIES} 個幣別`)
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
    ?? (codeIssues.blank ? '請輸入幣別代碼' : null)
    ?? (codeIssues.dup ? '幣別不可重複' : null)
    ?? (codeIssues.badRate ? '匯率必須是正數' : null)
    ?? (codeIssues.defaultMissing ? '預設幣別不在列表中' : null)

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
        setErr(e instanceof Error ? e.message : editing ? '更新失敗' : '建立失敗')
      }
    })
  }

  // Render-time rows for presets (always 4 rows, in fixed order) + custom rows.
  const customRows = entries.filter(e => !e.preset)
  const presetIncluded = (code: string) => entries.find(e => e.code === code)

  return (
    <SheetShell
      open={open}
      title={editing ? '編輯旅行' : '建立旅行'}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={editing ? '保存變更' : '開始這趟'}
      error={formError ?? ''}
      onClose={onClose}
      onSave={submit}
    >
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>名稱</span>
          <input
            className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              color: 'var(--ink)',
            }}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例：東京 5 日"
            maxLength={100}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>起始日</span>
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
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>結束日（可選）</span>
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
          <p className="text-xs -mt-2" style={{ color: 'var(--debit, #c0392b)' }}>
            結束日不可早於起始日
          </p>
        )}

        <div className="block">
          <div className="flex items-baseline justify-between">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>幣別與匯率</span>
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
              {entries.length} / {MAX_ENTRIES}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            勾選這趟用得到的幣別，挑一個當預設。數字是「1 個此幣別 = N 個預設幣別」。
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
                  label={PRESET_LABELS[code]}
                  rate={row?.rate ?? 1}
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
                className="self-start mt-1 text-sm rounded-full px-3 py-1.5 cursor-pointer"
                style={{
                  background: 'transparent',
                  border: '1px dashed var(--hairline)',
                  color: 'var(--ink-2)',
                }}
              >
                + 自訂幣別
              </button>
            )}
          </div>
        </div>

        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
          這趟期間記錄的支出，會自動掛在這次旅行底下。
        </p>
      </div>
    </SheetShell>
  )
}

function CurrencyRow(props: {
  code: string
  label: string
  rate: number
  checked: boolean
  isDefault: boolean
  defaultHasExpenses: boolean
  locked: boolean
  usedCount: number
  onToggle: () => void
  onRateChange: (raw: string) => void
  onSetDefault: () => void
}) {
  const { code, label, rate, checked, isDefault, defaultHasExpenses, locked, usedCount } = props
  const canToggleOff = checked && !locked && !isDefault
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        opacity: !checked && locked ? 0.5 : 1,
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={(!checked && false) || (checked && (locked || isDefault))}
          onChange={props.onToggle}
          aria-label={`${code} ${label}`}
          className="cursor-pointer"
          style={{ accentColor: 'var(--ink)' }}
        />
        <div className="flex-1">
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {code} <span className="font-normal" style={{ color: 'var(--ink-3)' }}>{label}</span>
          </div>
        </div>
        {checked && (
          <label className="flex items-center gap-1 cursor-pointer text-xs" style={{ color: 'var(--ink-2)' }}>
            <input
              type="radio"
              name="trip-default-currency"
              checked={isDefault}
              disabled={defaultHasExpenses && !isDefault}
              onChange={props.onSetDefault}
              style={{ accentColor: 'var(--ink)' }}
            />
            預設
          </label>
        )}
      </div>
      {checked && (
        <div className="flex items-center gap-2">
          {isDefault ? (
            <div className="flex-1 text-xs" style={{ color: 'var(--ink-3)' }}>
              預設幣別匯率固定為 1
            </div>
          ) : (
            <>
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>1 {code} =</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                value={rate || ''}
                disabled={locked}
                onChange={e => props.onRateChange(e.target.value)}
                className="flex-1 rounded-lg px-2.5 py-1.5 text-sm"
                style={{
                  background: locked ? 'var(--surface-alt)' : 'var(--bg)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--ink)',
                }}
              />
            </>
          )}
        </div>
      )}
      {checked && locked && !isDefault && (
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
          已記過 {usedCount} 筆，先刪除才能改
        </p>
      )}
      {checked && isDefault && defaultHasExpenses && (
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
          已記過預設幣別支出，無法變更預設
        </p>
      )}
      {!canToggleOff && checked && isDefault && (
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
          這是預設幣別，需要先改別的幣別為預設才能移除
        </p>
      )}
    </div>
  )
}

function CustomCurrencyRow(props: {
  code: string
  label: string
  rate: number
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
  const { code, label, rate, isDefault, defaultHasExpenses, locked, usedCount } = props
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={code}
          disabled={locked}
          onChange={e => props.onCodeChange(e.target.value)}
          placeholder="VND"
          maxLength={16}
          className="w-20 rounded-lg px-2 py-1.5 text-sm uppercase"
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
          placeholder="越南盾（可選）"
          maxLength={32}
          className="flex-1 rounded-lg px-2 py-1.5 text-sm"
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
            aria-label="移除幣別"
            className="text-sm cursor-pointer"
            style={{ color: 'var(--ink-3)', background: 'transparent', border: 'none' }}
          >
            ×
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {isDefault ? (
          <div className="flex-1 text-xs" style={{ color: 'var(--ink-3)' }}>
            預設幣別匯率固定為 1
          </div>
        ) : (
          <>
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
              1 {code || '?'} =
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              value={rate || ''}
              disabled={locked}
              onChange={e => props.onRateChange(e.target.value)}
              className="flex-1 rounded-lg px-2.5 py-1.5 text-sm"
              style={{
                background: locked ? 'var(--surface-alt)' : 'var(--bg)',
                border: '1px solid var(--hairline)',
                color: 'var(--ink)',
              }}
            />
          </>
        )}
        <label className="flex items-center gap-1 cursor-pointer text-xs" style={{ color: 'var(--ink-2)' }}>
          <input
            type="radio"
            name="trip-default-currency"
            checked={isDefault}
            disabled={(defaultHasExpenses && !isDefault) || !code}
            onChange={props.onSetDefault}
            style={{ accentColor: 'var(--ink)' }}
          />
          預設
        </label>
      </div>
      {locked && !isDefault && (
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
          已記過 {usedCount} 筆，先刪除才能改
        </p>
      )}
    </div>
  )
}
