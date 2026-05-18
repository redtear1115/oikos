'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  // Anchor for the portalled popover — recomputed every time it opens and on
  // scroll/resize so the dropdown tracks the trigger even when the sticky
  // header moves. `null` = no anchor yet (popover invisible on first paint).
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null)

  // Defer portal creation until after hydration — createPortal during SSR
  // would mismatch since `document` doesn't exist on the server.
  useEffect(() => setMounted(true), [])

  const updateAnchor = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAnchor({ left: r.left, top: r.bottom + 4, width: r.width })
  }

  // Recompute anchor whenever the popover opens, and keep it in sync with
  // page scroll / window resize while open. Without this, scrolling the
  // page would leave the popover floating in its initial position.
  useLayoutEffect(() => {
    if (!open) return
    updateAnchor()
    const onScrollOrResize = () => updateAnchor()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  // When the popover opens, snap back to the current month's year so the
  // user always lands on the year they're viewing — not whichever year
  // they last scrolled to in the picker.
  useEffect(() => {
    if (open) setPickerYear(parseInt(monthKey.split('-')[0]!, 10))
  }, [open, monthKey])

  // Click outside closes. Both the trigger AND the portalled popover are
  // "inside" — the popover lives under document.body, so checking only the
  // trigger container would close it on its own clicks. pointerdown (not
  // click) avoids the touch-device "tap to toggle never reopens" pattern
  // where mousedown→close→click would hit a now-detached node.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      const inTrigger = containerRef.current?.contains(target)
      const inPopover = popoverRef.current?.contains(target)
      if (!inTrigger && !inPopover) setOpen(false)
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

  // Popover is portalled to document.body so it escapes the sticky header's
  // `overflow-x-auto` (which also clips overflow-y) on the L3 chip row. With
  // a regular `position: absolute` child, the dropdown would get cut off the
  // moment it crossed the row's bottom edge.
  const popover = open && anchor ? (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={t.records.monthPicker.dialogLabel}
      className="rounded-2xl"
      style={{
        position: 'fixed',
        left: anchor.left,
        top: anchor.top,
        zIndex: 100,
        background: '#fff',
        border: '1px solid var(--hairline)',
        padding: 12,
        width: 280,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
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
  ) : null

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
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
      {mounted && popover ? createPortal(popover, document.body) : null}
    </div>
  )
}
