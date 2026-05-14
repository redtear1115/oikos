'use client'

import { useState, useTransition } from 'react'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { createTrip } from '@/actions/trip'

export function TripSheet(props: {
  baseCurrency: CurrencyCode
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>(props.baseCurrency)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    setErr(null)
    start(async () => {
      try {
        await createTrip({
          name,
          startDate,
          endDate: endDate || null,
          defaultCurrency,
        })
        props.onClose()
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : '建立失敗')
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={props.onClose}>
      <div
        className="bg-white w-full rounded-t-2xl p-4 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-medium">建立旅行</h2>

        <label className="block">
          <span className="text-sm text-gray-600">名稱</span>
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例：東京 5 日"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="text-sm text-gray-600">起始日</span>
            <input
              type="date"
              className="mt-1 w-full rounded border px-3 py-2"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </label>
          <label>
            <span className="text-sm text-gray-600">結束日（可選）</span>
            <input
              type="date"
              className="mt-1 w-full rounded border px-3 py-2"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm text-gray-600">預設幣別</span>
          <select
            className="mt-1 w-full rounded border px-3 py-2"
            value={defaultCurrency}
            onChange={e => setDefaultCurrency(e.target.value as CurrencyCode)}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </label>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex gap-2 pt-2">
          <button className="flex-1 rounded border py-2" onClick={props.onClose}>
            取消
          </button>
          <button
            className="flex-1 rounded bg-black text-white py-2 disabled:opacity-50"
            onClick={submit}
            disabled={pending || !name.trim()}
          >
            {pending ? '建立中…' : '建立'}
          </button>
        </div>
      </div>
    </div>
  )
}
