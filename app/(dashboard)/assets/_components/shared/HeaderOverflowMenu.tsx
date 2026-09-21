'use client'

import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '@/app/(dashboard)/_components/useFocusTrap'

interface OverflowMenuItem {
  label: string
  onSelect: () => void
}

interface Props {
  /** aria-label for the "⋯" trigger and the revealed menu. */
  ariaLabel: string
  items: OverflowMenuItem[]
}

/**
 * Small header "⋯" overflow menu. No dropdown/menu primitive existed
 * elsewhere in the repo when this was written (#1325) — this establishes
 * the pattern, kept deliberately minimal (one trigger, a short list of
 * plain-text items) rather than a general-purpose popover component.
 *
 * Tab containment + focus-restore-on-close reuse `useFocusTrap`, the same
 * primitive ConfirmModal's dialog uses, instead of hand-rolling that half.
 * Escape and click-outside are handled locally here: `useEscapeToClose`
 * (the sheet-level dismiss hook) is wired to the browser History /
 * CloseWatcher stack for whole sheets, and reusing it for a three-dot menu
 * would push a synthetic history entry just to open it.
 */
export function HeaderOverflowMenu({ ariaLabel, items }: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useFocusTrap(open, panelRef)

  // Move focus into the panel on open (mirrors ConfirmModal's own
  // focus-on-open effect — no shared hook for that half exists yet either).
  useEffect(() => {
    if (!open) return
    const first = panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()
  }, [open])

  // Close on a pointerdown outside both the trigger and the panel.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="oik-btn h-8 w-8 flex items-center justify-center rounded-full border-0 cursor-pointer bg-transparent text-ink-2"
      >
        <span aria-hidden="true" className="text-base leading-none tracking-[1px]">···</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={(e) => {
            // stopPropagation keeps this Escape from also reaching the
            // sheet's own window-level Escape listener (useEscapeToClose) —
            // one press closes the menu, not the whole sheet underneath it.
            if (e.key !== 'Escape') return
            e.stopPropagation()
            e.preventDefault()
            setOpen(false)
          }}
          className="absolute right-0 top-full mt-1 min-w-[8rem] rounded-xl py-1 z-modal bg-surface border border-hairline"
          style={{
            boxShadow: '0 12px 32px rgba(31,27,22,0.16)',
          }}
        >
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); item.onSelect() }}
              className="oik-btn w-full text-left px-4 h-9 text-sm font-medium cursor-pointer border-0 bg-transparent text-ink"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
