'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { monthLabel } from '@/lib/groupByMonth'
import { useTranslations, useLocale } from '@/lib/i18n/client'

interface Props {
  /** Currently displayed month, 'YYYY-MM'. */
  monthKey: string
  /** Lower bound (inclusive). Defaults to '1970-01' so the user can scroll into
   *  pre-creation months — the page renders a forced-compact stats card for
   *  those (no data) but switching is still possible. */
  minMonthKey?: string
  /** Upper bound (inclusive) — usually current Taipei month. */
  maxMonthKey: string
}

/**
 * Month picker — single chip-style trigger that opens a popover with a
 * 3×4 month grid plus year navigation. Replaces the previous prev/next
 * arrow pair so the L3 row stays at the same visual height as the L2
 * dual-toggle pill above it (#548 review #3 + #6).
 */
export function MonthSwitcher({ monthKey, minMonthKey = '1970-01', maxMonthKey }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => parseInt(monthKey.split('-')[0]!, 10))
  const containerRef = useRef<HTMLDivElement>(null)

  // When the popover opens, snap back to the current month's year so the
  // user always lands on the year they're viewing — not whichever year
  // they last scrolled to in the picker.
  useEffect(() => {
    if (open) setPickerYear(parseInt(monthKey.split('-')[0]!, 10))
  }, [open, monthKey])

  // Click outside closes — mousedown so the trigger button's onClick still
  // fires before we collapse (avoids the "click to toggle never reopens" bug
  // on touch devices where mousedown→close→click hits a now-detached node).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Escape closes — table-stakes for any popover dialog.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', next)
    startTransition(() => {
      // Use replace so the back button doesn't trap the user in a chain of months.
      router.replace(`/records?${params.toString()}`, { scroll: false })
    })
    setOpen(false)
  }

  const [minYearStr, minMonthStr] = minMonthKey.split('-')
  const [maxYearStr, maxMonthStr] = maxMonthKey.split('-')
  const minYear = parseInt(minYearStr!, 10)
  const minMonthOfMinYear = parseInt(minMonthStr!, 10)
  const maxYear = parseInt(maxYearStr!, 10)
  const maxMonthOfMaxYear = parseInt(maxMonthStr!, 10)

  const yearPrevDisabled = pickerYear <= minYear
  const yearNextDisabled = pickerYear >= maxYear

  const isMonthDisabled = (m: number) => {
    if (pickerYear === minYear && m < minMonthOfMinYear) return true
    if (pickerYear === maxYear && m > maxMonthOfMaxYear) return true
    return false
  }
  const isSelected = (m: number) =>
    monthKey === `${pickerYear}-${String(m).padStart(2, '0')}`

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="h-8 px-3 rounded-full text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          color: 'var(--ink-2)',
          fontFamily: 'var(--font-serif)',
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t.records.monthPicker.triggerLabel}
      >
        {monthLabel(monthKey, locale)}
        <span
          aria-hidden
          style={{
            fontSize: 10,
            color: 'var(--ink-3)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
            display: 'inline-block',
            lineHeight: 1,
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t.records.monthPicker.dialogLabel}
          className="absolute left-0 top-full z-30 mt-2 rounded-2xl"
          style={{
            background: '#fff',
            border: '1px solid var(--hairline)',
            padding: 12,
            width: 280,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          }}
        >
          {/* Year navigation row */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => {
                if (!yearPrevDisabled) setPickerYear((y) => y - 1)
              }}
              disabled={yearPrevDisabled}
              className="w-8 h-8 grid place-items-center rounded-lg cursor-pointer bg-transparent border-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: 'var(--ink-2)' }}
              aria-label={t.records.monthPicker.prevYear}
            >
              ‹
            </button>
            <div
              className="text-sm font-medium"
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
            >
              {pickerYear}
            </div>
            <button
              type="button"
              onClick={() => {
                if (!yearNextDisabled) setPickerYear((y) => y + 1)
              }}
              disabled={yearNextDisabled}
              className="w-8 h-8 grid place-items-center rounded-lg cursor-pointer bg-transparent border-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: 'var(--ink-2)' }}
              aria-label={t.records.monthPicker.nextYear}
            >
              ›
            </button>
          </div>
          {/* 3×4 month grid */}
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const disabled = isMonthDisabled(m)
              const sel = isSelected(m)
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => go(`${pickerYear}-${String(m).padStart(2, '0')}`)}
                  disabled={disabled}
                  className="h-9 rounded-lg text-sm cursor-pointer border-0 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  style={{
                    background: sel ? 'var(--ink)' : 'transparent',
                    color: sel ? '#fff' : 'var(--ink-2)',
                    fontWeight: sel ? 600 : 400,
                  }}
                  aria-pressed={sel}
                >
                  {new Date(2000, m - 1, 1).toLocaleDateString(locale, { month: 'short' })}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
