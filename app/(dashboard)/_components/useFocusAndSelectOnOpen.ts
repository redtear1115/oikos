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
    ref.current?.focus()
    ref.current?.select()
  // ref is a stable RefObject — omitting it from deps is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
