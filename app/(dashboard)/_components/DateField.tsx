'use client'

/**
 * Unified date picker (#512 PR 2). Two visual variants share one calendar
 * primitive:
 *
 *   - **card** (default): full-width tile with subtitle, used in dashboard
 *     sheets (AddSheet / IncomeSheet). Requires a non-null `value` for
 *     formatting; falls back to today if null.
 *   - **inline** (when `label` is given): label + inline button + bottom
 *     hairline, used in asset sheets (Car / future types). `value` may be
 *     null in this variant — `placeholder` is shown until the user picks.
 *
 * Both variants own their own calendar visibility; pass the parent's `open`
 * prop to reset the calendar when the sheet re-opens.
 */

import { useState, useEffect } from 'react'
import { CalIcon, Chevron } from './sheet-icons'
import { MiniCalendar } from '@/app/(dashboard)/dashboard/_components/MiniCalendar'
import { localTodayISO } from '@/lib/local-date'
import { formatDateAbsolute, formatPickerSubtitle } from '@/lib/format-date'
import { useLocale } from '@/lib/i18n/client'

interface DateFieldProps {
  value: string | null
  onChange: (iso: string) => void
  /** Parent sheet open state — when toggled true, resets calendar visibility. */
  open?: boolean
  /** When provided, switches to the inline variant (label + bottom hairline). */
  label?: string
  /** Inline-variant placeholder shown when value is null. */
  placeholder?: string
}

export function DateField({ value, onChange, open, label, placeholder }: DateFieldProps) {
  const locale = useLocale()
  const [showCal, setShowCal] = useState(false)
  useEffect(() => { if (open) setShowCal(false) }, [open])

  const toggle = () => setShowCal(v => !v)
  const select = (d: string) => { onChange(d); setShowCal(false) }
  // MiniCalendar requires a non-null seed; inline variant may not have one yet.
  const calendarSeed = value ?? localTodayISO()

  if (label !== undefined) {
    // Inline variant — matches Field shell so it sits alongside other sheet rows.
    return (
      <div className="py-3" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div className="text-xs mb-1 tracking-wide" style={{ color: 'var(--ink-3)' }}>{label}</div>
        <button
          type="button"
          className="flex items-center gap-2 bg-transparent border-0 cursor-pointer p-0 text-base"
          style={{ color: value ? 'var(--ink)' : 'var(--ink-3)' }}
          onClick={toggle}
        >
          <CalIcon size={16} />
          {value ? formatDateAbsolute(value, locale) : placeholder}
          <Chevron />
        </button>
        {showCal && <MiniCalendar value={calendarSeed} onChange={select} />}
      </div>
    )
  }

  // Card variant — large tile with subtitle, default for dashboard sheets.
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-3 px-3.5 py-3 rounded-bubble cursor-pointer text-left"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <CalIcon />
        <div className="flex-1 text-left">
          <div className="text-body font-medium" style={{ color: 'var(--ink)' }}>{formatDateAbsolute(calendarSeed, locale)}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{formatPickerSubtitle(calendarSeed, locale)}</div>
        </div>
        <Chevron />
      </button>
      {showCal && <MiniCalendar value={calendarSeed} onChange={select} />}
    </>
  )
}
