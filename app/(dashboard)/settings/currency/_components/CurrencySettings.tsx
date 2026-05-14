'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { setBaseCurrency, setRate } from '@/actions/currency'

type RateRow = {
  fromCurrency: CurrencyCode
  toCurrency: CurrencyCode
  rate: string
}

type RowState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }

export function CurrencySettings(props: {
  baseCurrency: CurrencyCode
  rates: RateRow[]
  canChangeBase: boolean
}) {
  const router = useRouter()
  const t = useTranslations()
  const tc = t.currencyPage
  const [base, setBase] = useState(props.baseCurrency)
  const [rates, setRates] = useState(props.rates)
  const [pending, start] = useTransition()
  const [baseError, setBaseError] = useState<string | null>(null)
  const [rowStates, setRowStates] = useState<Record<number, RowState>>({})

  const debounceRefs = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const savedTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const debounces = debounceRefs.current
    const saved = savedTimers.current
    return () => {
      Object.values(debounces).forEach(clearTimeout)
      Object.values(saved).forEach(clearTimeout)
    }
  }, [])

  function setRowState(idx: number, state: RowState) {
    setRowStates((prev) => ({ ...prev, [idx]: state }))
  }

  function onBaseChange(next: CurrencyCode) {
    if (next === base) return
    setBaseError(null)
    setBase(next)
    start(async () => {
      try {
        await setBaseCurrency({ currency: next })
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : tc.errors.baseChangeFailed
        setBaseError(message)
        setBase(props.baseCurrency)
      }
    })
  }

  function onRateChange(idx: number, raw: string) {
    const { fromCurrency, toCurrency } = rates[idx]
    setRates((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], rate: raw }
      return next
    })
    setRowState(idx, { kind: 'idle' })

    clearTimeout(debounceRefs.current[idx])
    clearTimeout(savedTimers.current[idx])

    debounceRefs.current[idx] = setTimeout(async () => {
      setRowState(idx, { kind: 'saving' })
      try {
        await setRate({ fromCurrency, toCurrency, rate: raw })
        setRowState(idx, { kind: 'saved' })
        savedTimers.current[idx] = setTimeout(
          () => setRowState(idx, { kind: 'idle' }),
          2000,
        )
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : tc.errors.rateChangeFailed
        setRowState(idx, { kind: 'error', message })
      }
    }, 500)
  }

  return (
    <>
      <div
        className="sticky top-0 z-20 px-4 flex items-center justify-between"
        style={{
          background: 'var(--bg)',
          paddingTop: 'max(env(safe-area-inset-top), 24px)',
          paddingBottom: 8,
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 bg-transparent border-0 cursor-pointer min-h-11 px-2 -ml-2"
          style={{ color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 'var(--fs-sm)' }}
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
            <path
              d="M7 1L1 6.5L7 12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {tc.back}
        </button>

        <div className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
          {tc.title}
        </div>

        <div className="w-[64px]" aria-hidden="true" />
      </div>

      <div className="px-5 pt-6 pb-6">
        <h1
          className="text-page leading-tight"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {tc.pageHeading}
        </h1>
        <p className="text-sm mt-3" style={{ color: 'var(--ink-2)' }}>
          {tc.pageSubtitle}
        </p>
      </div>

      <section className="px-4 pb-8">
        <h2 className="text-base font-medium mb-1.5" style={{ color: 'var(--ink)' }}>
          {tc.base.sectionTitle}
        </h2>
        <p className="text-sm mb-3" style={{ color: 'var(--ink-2)' }}>
          {tc.base.sectionHint}
        </p>

        {!props.canChangeBase && (
          <div
            className="rounded-xl p-4 mb-3"
            style={{
              background: 'var(--surface-alt)',
              border: '1px solid var(--hairline)',
            }}
            role="note"
          >
            <div className="text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>
              {tc.base.locked.heading}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {tc.base.locked.body}
            </p>
            <p className="text-sm leading-relaxed mt-1.5" style={{ color: 'var(--ink-2)' }}>
              {tc.base.locked.bodyNext}
            </p>
          </div>
        )}

        <div
          role="radiogroup"
          aria-label={tc.base.sectionTitle}
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${CURRENCIES.length}, minmax(0, 1fr))` }}
        >
          {CURRENCIES.map((c) => {
            const selected = c === base
            const disabled = !props.canChangeBase || pending
            return (
              <button
                key={c}
                type="button"
                onClick={() => onBaseChange(c)}
                disabled={disabled}
                aria-checked={selected}
                role="radio"
                className="h-11 rounded-full cursor-pointer border text-sm font-medium"
                style={{
                  background: selected
                    ? 'var(--toggle-active-bg)'
                    : 'var(--toggle-inactive-bg)',
                  color: selected
                    ? 'var(--toggle-active-text)'
                    : 'var(--toggle-inactive-text)',
                  borderColor: selected
                    ? 'var(--toggle-active-bg)'
                    : 'var(--toggle-border)',
                  opacity: disabled && !selected ? 'var(--toggle-disabled-opacity)' : 1,
                  transition: 'var(--toggle-transition)',
                  fontFamily: 'var(--font-numeric)',
                  letterSpacing: 0.5,
                }}
              >
                {c.toUpperCase()}
              </button>
            )
          })}
        </div>

        {baseError && (
          <p className="text-sm mt-2" style={{ color: 'var(--debit)' }}>
            {baseError}
          </p>
        )}
      </section>

      <section className="px-4 pb-12">
        <h2 className="text-base font-medium mb-3" style={{ color: 'var(--ink)' }}>
          {tc.rates.sectionTitle}
        </h2>

        <div
          className="rounded-xl p-4 mb-4 space-y-3"
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--hairline)',
          }}
        >
          <ExplainBlock heading={tc.rates.whyHeading} body={tc.rates.whyBody} />
          <ExplainBlock
            heading={tc.rates.exampleHeading}
            body={tc.rates.exampleBody}
            emphasis
          />
          <ExplainBlock
            heading={tc.rates.behaviorHeading}
            body={tc.rates.behaviorBody}
          />
        </div>

        <div className="space-y-3">
          {rates.map((r, idx) => {
            const state = rowStates[idx] ?? { kind: 'idle' }
            const showSaving = state.kind === 'saving'
            const showSaved = state.kind === 'saved'
            const showError = state.kind === 'error'
            return (
              <div key={`${r.fromCurrency}-${r.toCurrency}`}>
                <label
                  className="flex items-center gap-2 rounded-xl px-3 h-12"
                  style={{
                    background: 'var(--surface)',
                    border: showError
                      ? '1px solid var(--debit)'
                      : '1px solid var(--hairline)',
                  }}
                >
                  <span
                    className="text-sm shrink-0"
                    style={{
                      color: 'var(--ink-2)',
                      fontFamily: 'var(--font-numeric)',
                      minWidth: 72,
                    }}
                  >
                    1 {r.fromCurrency.toUpperCase()} =
                  </span>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    inputMode="decimal"
                    className="flex-1 min-w-0 bg-transparent border-0 outline-none text-right"
                    style={{
                      color: 'var(--ink)',
                      fontSize: 'var(--fs-base)',
                      fontFamily: 'var(--font-numeric)',
                    }}
                    value={r.rate}
                    onChange={(e) => onRateChange(idx, e.target.value)}
                    aria-label={`1 ${r.fromCurrency.toUpperCase()} = ? ${r.toCurrency.toUpperCase()}`}
                  />
                  <span
                    className="text-sm shrink-0 text-right"
                    style={{
                      color: 'var(--ink-2)',
                      fontFamily: 'var(--font-numeric)',
                      minWidth: 36,
                    }}
                  >
                    {r.toCurrency.toUpperCase()}
                  </span>
                  <span
                    className="w-5 h-5 flex items-center justify-center shrink-0"
                    aria-hidden={!showSaving && !showSaved}
                  >
                    {showSaving && <SavingDot />}
                    {showSaved && <SavedCheck />}
                  </span>
                </label>
                {showError && (
                  <p
                    className="text-xs mt-1 px-3"
                    style={{ color: 'var(--debit)' }}
                    role="alert"
                  >
                    {state.message}
                  </p>
                )}
                {showSaving && (
                  <p className="text-xs mt-1 px-3" style={{ color: 'var(--ink-3)' }}>
                    {tc.rates.saving}
                  </p>
                )}
                {showSaved && (
                  <p
                    className="text-xs mt-1 px-3"
                    style={{ color: 'var(--credit)' }}
                    role="status"
                  >
                    {tc.rates.saved}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}

function ExplainBlock({
  heading,
  body,
  emphasis = false,
}: {
  heading: string
  body: string
  emphasis?: boolean
}) {
  return (
    <div>
      <div
        className="text-xs uppercase tracking-wider mb-1"
        style={{ color: 'var(--ink-3)', letterSpacing: 1 }}
      >
        {heading}
      </div>
      <p
        className="text-sm leading-relaxed"
        style={{
          color: emphasis ? 'var(--ink)' : 'var(--ink-2)',
        }}
      >
        {body}
      </p>
    </div>
  )
}

function SavingDot() {
  return (
    <span
      className="block w-2 h-2 rounded-full animate-pulse"
      style={{ background: 'var(--ink-3)' }}
    />
  )
}

function SavedCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 7.5L6 10.5L11.5 4"
        stroke="var(--credit)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
