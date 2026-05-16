'use client'

import { type RefObject, useLayoutEffect } from 'react'

/**
 * Reset both the sheet's inner scroll container AND the document scroll
 * position to the top whenever a sheet opens.
 *
 * The Add / Income / Settlement sheets stay mounted across open cycles —
 * `open` only toggles `transform: translateY`. The inner scroll container
 * therefore preserves its scrollTop across closes, so reopening can land
 * mid-sheet (the amount input scrolled off-screen).
 *
 * On iOS Safari the inner container's scrollTop alone isn't enough.
 * Focusing an input inside a `position: fixed` panel triggers WebKit's
 * "ensure focused element visible" pass against the soft keyboard, which
 * — instead of scrolling the inner container — scrolls the *document*
 * (window.scrollY) and visually shifts the sheet up (the well-known iOS
 * fixed-element jumping behavior). debug HUD on real iOS showed
 * `scrollTop: 0` but `window.scrollY: 326 peak: 639` while the bug was
 * on-screen. Resetting only the container leaves the document scroll
 * intact, so the user still lands mid-sheet visually.
 *
 * Defer to `requestAnimationFrame` so the reset runs AFTER iOS has done
 * its focus-driven scroll (which fires during/right after `focus()` in
 * the sibling `useFocusAndSelectOnOpen` hook).
 */
export function useScrollToTopOnOpen(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
): void {
  useLayoutEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      ref.current?.scrollTo({ top: 0, behavior: 'instant' })
      window.scrollTo({ top: 0, behavior: 'instant' })
    })
    return () => cancelAnimationFrame(raf)
  // ref is a stable RefObject — omitting it from deps is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
