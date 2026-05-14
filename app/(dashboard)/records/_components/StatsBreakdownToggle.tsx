'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { useTranslations } from '@/lib/i18n/client'

export type BreakdownView = 'category' | 'asset'

interface Props {
  value: BreakdownView
  /**
   * Hide the「愛物」option. Used when the structured filter has 愛物 active
   * — the by-asset breakdown would degenerate to a single bar, and the
   * server has already auto-switched the value to 'category'. Hiding the
   * option keeps the toggle from offering a degraded view; if the user
   * clears the filter, the toggle reappears.
   */
  hideAsset?: boolean
}

export function StatsBreakdownToggle({ value, hideAsset = false }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const [isPending, startTransition] = useTransition()

  const setView = (next: BreakdownView) => {
    if (next === value) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'category') {
      params.delete('view')  // category is the default — keep URL clean
    } else {
      params.set('view', next)
    }
    const qs = params.toString()
    startTransition(() => {
      router.replace(qs ? `/records?${qs}` : '/records', { scroll: false })
    })
  }

  const options: Array<{ id: BreakdownView; label: string }> = hideAsset
    ? [{ id: 'category', label: t.records.stats.viewByCategory }]
    : [
        { id: 'category', label: t.records.stats.viewByCategory },
        { id: 'asset', label: t.records.stats.viewByAsset },
      ]
  // When only one option remains, hide the toggle entirely — it'd just be a
  // disabled-looking single pill that doesn't toggle anything.
  if (options.length <= 1) return null

  return (
    <div
      className="inline-flex items-center rounded-full p-0.5"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--toggle-border)',
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {options.map((opt) => {
        const sel = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => setView(opt.id)}
            disabled={isPending}
            className="oik-segment h-7 px-3 rounded-full text-xs font-medium cursor-pointer border-0"
            style={{
              background: sel ? 'var(--toggle-active-bg)' : 'transparent',
              color: sel ? 'var(--toggle-active-text)' : 'var(--ink-2)',
              transition: `background var(--toggle-transition), color var(--toggle-transition)`,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
