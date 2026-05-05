'use client'

import { type RefObject, useEffect } from 'react'

/**
 * Focus and select-all an input when a sheet opens.
 * The delay matches the sheet slide-up animation so the keyboard appears
 * after the sheet is fully visible.
 */
export function useFocusAndSelectOnOpen(
  open: boolean,
  ref: RefObject<HTMLInputElement | null>,
  delay = 350,
): void {
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      ref.current?.focus()
      ref.current?.select()
    }, delay)
    return () => clearTimeout(t)
  }, [open, ref, delay])
}
