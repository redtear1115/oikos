'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/client'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'

/**
 * Single ⚙ 定期 entry point in the records header. Tap reveals a small
 * popover with the two recurring-rule destinations (定期支出 / 定期收入).
 *
 * Why one button instead of two pills: the previous design put both pills
 * to the right of the tab row, which crowded the high-traffic tab area.
 * Recurring-rule edits are low-frequency settings work, so collapsing them
 * to a single icon entry frees the tab row for the higher-traffic
 * filter affordance and keeps the title row visually quiet.
 */
export function RecurringMenu() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Click-outside / Esc to dismiss. We listen on `pointerdown` not `click`
  // so the menu closes BEFORE any link inside fires its navigation —
  // otherwise the menu briefly stays open during the route transition.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const P = DEFAULT_INCOME_PALETTE

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.records.recurringMenuAriaLabel}
        className="text-xs font-medium pb-1 cursor-pointer bg-transparent border-0 flex items-center gap-1"
        style={{ color: 'var(--ink-2)' }}
      >
        <span aria-hidden style={{ fontSize: 11 }}>⚙</span>
        {t.records.recurringMenuLabel} <span style={{ color: 'var(--ink-3)' }}>›</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 min-w-[160px] rounded-[12px] py-1 z-30"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--hairline)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          }}
        >
          <Link
            href="/settings/recurring-expense"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-150"
            style={{ color: '#7A5A38' }}
          >
            <span aria-hidden style={{ fontSize: 11 }}>⚙</span>
            {t.records.manageRecurringExpense}
          </Link>
          <Link
            href="/settings/recurring-income"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-150"
            style={{ color: P.ink }}
          >
            <span aria-hidden style={{ fontSize: 11 }}>⚙</span>
            {t.records.manageRecurringIncome}
          </Link>
        </div>
      )}
    </div>
  )
}
