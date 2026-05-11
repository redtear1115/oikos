'use client'

import { useTranslations } from '@/lib/i18n/client'
import type { DateRange } from '@/lib/filter'

interface Props {
  dateRange: DateRange
  /** Tapping the X clears the custom range and returns to single-month mode. */
  onClear: () => void
}

/**
 * Compact chip that surfaces the active custom date range (or「全部時間」when
 * range='all') and offers a one-tap clear. Replaces the MonthSwitcher in the
 * sticky header when the structured filter is using a non-month scope, so
 * the user always knows the active scope and how to get back to the default.
 */
export function DateRangeChip({ dateRange, onClear }: Props) {
  const t = useTranslations()

  const label = dateRange.kind === 'all'
    ? t.filterSheet.dateRangeAll
    : dateRange.kind === 'range'
      ? `${dateRange.start} → ${dateRange.end}`
      : dateRange.monthKey

  return (
    <div
      className="flex items-center justify-between rounded-[14px] px-3 py-2"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--accent)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
          {t.filterSheet.dateRangeChipPrefix}
        </span>
        <span
          className="text-sm font-medium"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {label}
        </span>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label={t.filterSheet.dateRangeClear}
        className="h-6 w-6 grid place-items-center rounded-full bg-transparent border-0 cursor-pointer text-base leading-none"
        style={{ color: 'var(--ink-3)' }}
      >
        ×
      </button>
    </div>
  )
}
