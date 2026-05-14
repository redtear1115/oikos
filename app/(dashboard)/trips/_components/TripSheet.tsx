'use client'

import { useEffect, useState, useTransition } from 'react'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { createTrip, updateTrip } from '@/actions/trip'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'

export interface TripSheetInitial {
  id: string
  name: string
  startDate: string
  endDate: string | null
  defaultCurrency: CurrencyCode | null
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

export function TripSheet({ open, baseCurrency, onClose, initial, onSaved }: Props) {
  const editing = !!initial
  const today = new Date().toISOString().slice(0, 10)

  const [name, setName] = useState(initial?.name ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? today)
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>(
    initial?.defaultCurrency ?? baseCurrency,
  )
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // Reset form whenever the sheet opens (or its initial trip changes) so the
  // FAB → "建立旅行" path doesn't leak state from a previous edit.
  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setStartDate(initial?.startDate ?? today)
    setEndDate(initial?.endDate ?? '')
    setDefaultCurrency(initial?.defaultCurrency ?? baseCurrency)
    setErr(null)
  }, [open, initial, baseCurrency, today])

  const trimmedName = name.trim()
  const dateInvalid = !!endDate && endDate < startDate
  const canSave = !!trimmedName && !!startDate && !dateInvalid && !pending

  function submit() {
    if (!canSave) return
    setErr(null)
    start(async () => {
      try {
        if (editing && initial) {
          await updateTrip({
            tripId: initial.id,
            name: trimmedName,
            startDate,
            endDate: endDate || null,
            defaultCurrency,
          })
        } else {
          await createTrip({
            name: trimmedName,
            startDate,
            endDate: endDate || null,
            defaultCurrency,
          })
        }
        onSaved?.()
        onClose()
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : editing ? '更新失敗' : '建立失敗')
      }
    })
  }

  return (
    <SheetShell
      open={open}
      title={editing ? '編輯旅行' : '建立旅行'}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={editing ? '保存變更' : '開始這趟'}
      error={err ?? ''}
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

        <label className="block">
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>預設幣別</span>
          <select
            className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              color: 'var(--ink)',
            }}
            value={defaultCurrency}
            onChange={e => setDefaultCurrency(e.target.value as CurrencyCode)}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </label>

        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
          這趟期間記錄的支出，會自動掛在這次旅行底下。
        </p>
      </div>
    </SheetShell>
  )
}
