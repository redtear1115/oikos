'use client'

import { type RefObject, useLayoutEffect } from 'react'

/**
 * Reset a scrollable container to the top whenever a sheet opens.
 *
 * The Add / Income / Settlement sheets stay mounted across open cycles —
 * `open` only toggles `transform: translateY`. The inner scroll container
 * therefore preserves its scrollTop across closes, so reopening can land
 * mid-sheet (the amount input scrolled off-screen). Forcing scrollTop = 0
 * on every open restores the expected "starts at the top" behavior.
 *
 * useLayoutEffect runs after DOM mutations but before paint, so the reset
 * lands in the same frame as the slide-up — no visible flicker.
 */
export function useScrollToTopOnOpen(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
): void {
  useLayoutEffect(() => {
    if (!open) return
    ref.current?.scrollTo({ top: 0 })
  // ref is a stable RefObject — omitting it from deps is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
