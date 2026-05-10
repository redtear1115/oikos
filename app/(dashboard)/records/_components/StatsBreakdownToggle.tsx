'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { useTranslations } from '@/lib/i18n/client'

export type BreakdownView = 'category' | 'asset'

interface Props {
  value: BreakdownView
}

export function StatsBreakdownToggle({ value }: Props) {
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

  const options: Array<{ id: BreakdownView; label: string }> = [
    { id: 'category', label: t.records.stats.viewByCategory },
    { id: 'asset', label: t.records.stats.viewByAsset },
  ]

  return (
    <div
      className="inline-flex items-center rounded-full p-0.5"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
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
            className="h-7 px-3 rounded-full text-xs font-medium cursor-pointer border-0 transition-colors duration-150"
            style={{
              background: sel ? 'var(--ink)' : 'transparent',
              color: sel ? '#fff' : 'var(--ink-2)',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
