'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { setBaseCurrency } from '@/actions/currency'

export function CurrencySettings(props: {
  baseCurrency: CurrencyCode
  canChangeBase: boolean
}) {
  const router = useRouter()
  const t = useTranslations()
  const tc = t.currencyPage
  const [base, setBase] = useState(props.baseCurrency)
  const [pending, start] = useTransition()
  const [baseError, setBaseError] = useState<string | null>(null)

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
    </>
  )
}
