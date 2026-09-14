'use client'

import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react'

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

interface TrapEntry {
  /** Where focus goes back to when this trap is released. Mutable: see the
   *  hand-off in the cleanup below. */
  restoreTo: HTMLElement | null
  /** The panel element captured at activation. Refs are already detached by
   *  the time a passive-effect cleanup runs on unmount, so the cleanup can't
   *  read `panelRef.current` to ask "was this node inside me". */
  panel: HTMLElement | null
}

/**
 * Module-level stack of active traps, mirroring the one in useEscapeToClose.
 * Every trap listens on `window`, so without it two open traps (a SheetFrame
 * plus the ConfirmModal it spawned) each run their own "focus left my panel →
 * pull it back" logic on the same Tab press and cancel each other out: Tab is
 * swallowed and the modal's confirm button is pointer-only (#1171 F1, #1176).
 * Only the most recently activated trap handles Tab.
 */
const stack: TrapEntry[] = []

/**
 * Trap Tab / Shift+Tab inside `panelRef` while `open` is true, and restore
 * focus to the previously-focused element when the trap is released.
 *
 * Pairs with useFocusAndSelectOnOpen (which moves focus *into* the sheet on
 * mount) and useEscapeToClose (which handles dismissal). The trap is passive
 * — it only intercepts Tab when focus would leave the panel.
 *
 * Nested traps: only the topmost one responds. Traps are ordered by
 * activation, not by DOM position — so a modal can be portalled anywhere and
 * still sit above the sheet that opened it.
 */
export function useFocusTrap(open: boolean, panelRef: RefObject<HTMLElement | null>): void {
  // The restore target is read in a layout effect, the rest of the trap runs
  // in a passive one. useFocusAndSelectOnOpen moves focus into the sheet from
  // a layout effect, and every layout effect in a commit runs before every
  // passive one — so a passive read recorded the sheet's own amount input as
  // the restore target. Layout effects run child-first, which lets SheetFrame
  // (rendered *by* the sheet that calls useFocusAndSelectOnOpen) read before
  // its parent moves focus.
  //
  // The restore itself must stay in the passive cleanup: a focus() call made
  // during React's mutation phase (where layout cleanups run on update) is
  // undone by React's own focus/selection restore at the end of the commit.
  //
  // Symptom if either half regresses: nothing errors and the sheet opens and
  // closes normally, but after Escape / save / delete focus lands on <body>
  // instead of the button that opened the sheet. Same symptom if a
  // focus-on-open ever moves *below* SheetFrame (into its `children`), since
  // that child layout effect would then run first.
  const restoreToRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) restoreToRef.current = document.activeElement as HTMLElement | null
  }, [open])

  useEffect(() => {
    if (!open) return
    const entry: TrapEntry = {
      restoreTo: restoreToRef.current,
      panel: panelRef.current,
    }
    stack.push(entry)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (stack[stack.length - 1] !== entry) return
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
      const i = stack.indexOf(entry)
      if (i < 0) return
      const wasTop = i === stack.length - 1
      stack.splice(i, 1)

      if (!wasTop) {
        // A lower layer closed while something above it is still open — e.g.
        // a sheet's delete-confirm fires onDelete, which closes the sheet in
        // the same commit as the modal. Don't move focus now (the upper trap
        // still owns it). But if the upper layer's restore target lives inside
        // this panel, that target is about to be hidden, so hand it ours
        // instead; otherwise focus would be restored into a closed sheet.
        const above = stack[i]
        if (above?.restoreTo && entry.panel?.contains(above.restoreTo)) {
          above.restoreTo = entry.restoreTo
        }
        return
      }

      // Restore focus to the trigger after close. Guard against the previous
      // element being detached (e.g. parent re-rendered) — focus() on a
      // detached node is a no-op but harmless.
      entry.restoreTo?.focus?.()
    }
  // panelRef is stable; intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
