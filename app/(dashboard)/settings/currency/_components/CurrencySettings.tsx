'use client'

import { useState, useTransition } from 'react'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { setBaseCurrency, setRate } from '@/actions/currency'

type RateRow = {
  fromCurrency: CurrencyCode
  toCurrency: CurrencyCode
  rate: string
}

export function CurrencySettings(props: {
  baseCurrency: CurrencyCode
  rates: RateRow[]
  canChangeBase: boolean
}) {
  const [base, setBase] = useState(props.baseCurrency)
  const [rates, setRates] = useState(props.rates)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  async function onBaseChange(next: CurrencyCode) {
    setErr(null)
    setBase(next)
    start(async () => {
      try {
        await setBaseCurrency({ currency: next })
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : '無法切換主體幣別'
        setErr(message)
        setBase(props.baseCurrency)
      }
    })
  }

  async function onRateChange(idx: number, raw: string) {
    setErr(null)
    const next = [...rates]
    next[idx] = { ...next[idx], rate: raw }
    setRates(next)
    start(async () => {
      try {
        await setRate({
          fromCurrency: next[idx].fromCurrency,
          toCurrency: next[idx].toCurrency,
          rate: raw,
        })
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : '無法更新匯率'
        setErr(message)
      }
    })
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <section>
        <h2 className="text-base font-medium mb-2">主體幣別</h2>
        <select
          className="w-full rounded border px-3 py-2 disabled:opacity-50"
          value={base}
          disabled={!props.canChangeBase || pending}
          onChange={(e) => onBaseChange(e.target.value as CurrencyCode)}
        >
          {CURRENCIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
        </select>
        {!props.canChangeBase && (
          <p className="text-xs text-gray-500 mt-1">
            當前章節已有紀錄、不可修改主體幣別
          </p>
        )}
      </section>

      <section>
        <h2 className="text-base font-medium mb-2">心理匯率</h2>
        <p className="text-xs text-gray-500 mb-3">
          兩人共同對齊的一把尺。變動後過去的紀錄保留當時的匯率。
        </p>
        <div className="space-y-3">
          {rates.map((r, idx) => (
            <div key={`${r.fromCurrency}-${r.toCurrency}`} className="flex items-center gap-2">
              <span className="text-sm w-24">
                1 {r.fromCurrency.toUpperCase()} =
              </span>
              <input
                type="number"
                step="0.001"
                min="0.001"
                className="flex-1 rounded border px-3 py-2"
                value={r.rate}
                onChange={(e) => onRateChange(idx, e.target.value)}
              />
              <span className="text-sm w-12">{r.toCurrency.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </section>

      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  )
}
