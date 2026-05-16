'use client'

import { type RefObject, useEffect } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('aria-hidden') && el.offsetParent !== null,
  )
}

/**
 * Trap Tab / Shift+Tab inside `panelRef` while `open` is true, and restore
 * focus to the previously-focused element when the sheet closes.
 *
 * Pairs with useFocusAndSelectOnOpen (which moves focus *into* the sheet on
 * mount) and useEscapeToClose (which handles dismissal). The trap is passive
 * — it only intercepts Tab when focus would leave the panel.
 */
export function useFocusTrap(open: boolean, panelRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = focusables(panel)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      const insidePanel = active && panel.contains(active)

      if (!insidePanel) {
        e.preventDefault()
        first.focus()
        return
      }
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      // Restore focus to the trigger after close. Guard against the previous
      // element being detached (e.g. parent re-rendered) — focus() on a
      // detached node is a no-op but harmless.
      previouslyFocused?.focus?.()
    }
  // panelRef is stable; intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
