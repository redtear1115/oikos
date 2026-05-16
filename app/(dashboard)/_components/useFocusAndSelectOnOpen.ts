'use client'

import { type RefObject, useLayoutEffect } from 'react'

/**
 * Focus and select-all an input when a sheet opens.
 *
 * Uses useLayoutEffect (synchronous after render, before paint) so the focus
 * call runs in the same JS turn as the user gesture that flipped `open`.
 * That's what lets iOS Safari pop the keyboard automatically — a setTimeout-
 * delayed focus runs past the gesture window, so the cursor blinks without
 * the keyboard ever coming up. The sheet's slide-up animation and the
 * keyboard's slide-up run in parallel here, which reads as a single
 * coordinated motion rather than the visual jank we were trying to avoid
 * with the old 350ms delay.
 */
export function useFocusAndSelectOnOpen(
  open: boolean,
  ref: RefObject<HTMLInputElement | null>,
): void {
  useLayoutEffect(() => {
    if (!open) return
    // preventScroll stops iOS Safari's focus-driven scroll-into-view —
    // without it, focusing an input inside a `position: fixed` sheet
    // scrolls the *document* (window.scrollY went 0 → 639 in real-iOS
    // debug HUD), which then visually shifts the sheet via WebKit's
    // fixed-element jumping behavior. The sibling `useScrollToTopOnOpen`
    // resets window.scrollY too as a belt — preventing the scroll in
    // the first place is the suspenders.
    ref.current?.focus({ preventScroll: true })
    ref.current?.select()
  // ref is a stable RefObject — omitting it from deps is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
