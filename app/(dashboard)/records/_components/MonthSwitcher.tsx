'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { monthLabel } from '@/lib/groupByMonth'
import { addMonths } from '@/lib/monthKey'
import { useTranslations, useLocale } from '@/lib/i18n/client'

interface Props {
  /** Currently displayed month, 'YYYY-MM'. */
  monthKey: string
  /** Lower bound (inclusive) — usually the group creation month. */
  minMonthKey: string
  /** Upper bound (inclusive) — usually current Taipei month. */
  maxMonthKey: string
}

export function MonthSwitcher({ monthKey, minMonthKey, maxMonthKey }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  const prevDisabled = monthKey <= minMonthKey
  const nextDisabled = monthKey >= maxMonthKey

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', next)
    startTransition(() => {
      // Use replace so the back button doesn't trap the user in a chain of months.
      router.replace(`/records?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div
      className="flex items-center justify-between rounded-[14px] px-2 py-1"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        opacity: isPending ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => go(addMonths(monthKey, -1))}
        disabled={prevDisabled || isPending}
        aria-label={t.records.stats.prevMonth}
        className="h-9 w-9 grid place-items-center rounded-lg cursor-pointer bg-transparent border-0 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ color: 'var(--ink-2)' }}
      >
        ‹
      </button>
      <div
        className="text-sm font-medium"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
      >
        {monthLabel(monthKey, locale)}
      </div>
      <button
        type="button"
        onClick={() => go(addMonths(monthKey, 1))}
        disabled={nextDisabled || isPending}
        aria-label={t.records.stats.nextMonth}
        className="h-9 w-9 grid place-items-center rounded-lg cursor-pointer bg-transparent border-0 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ color: 'var(--ink-2)' }}
      >
        ›
      </button>
    </div>
  )
}
