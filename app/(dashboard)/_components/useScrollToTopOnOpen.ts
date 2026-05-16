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
 *
 * iOS Safari quirk: even with `focus({ preventScroll: true })`, the soft
 * keyboard sliding up can trigger an internal scroll on the nearest
 * scrollable ancestor of the focused input (visualViewport shrinks, WebKit
 * re-runs its "ensure focused element is visible" pass against the
 * still-animating sheet transform and lands at a non-zero scrollTop). We
 * subscribe to `visualViewport.resize` for a short window after open and
 * re-assert scrollTop = 0 on each tick — that only fires for
 * keyboard/zoom events, so it does not fight user-initiated scrolls.
 */
export function useScrollToTopOnOpen(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
): void {
  useLayoutEffect(() => {
    if (!open) return
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: 0 })

    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const onResize = () => { el.scrollTo({ top: 0 }) }
    vv.addEventListener('resize', onResize)
    // 800ms covers the iOS keyboard slide-up animation (~250-400ms) with
    // headroom; after that the user owns the scroll.
    const timeout = window.setTimeout(() => {
      vv.removeEventListener('resize', onResize)
    }, 800)
    return () => {
      window.clearTimeout(timeout)
      vv.removeEventListener('resize', onResize)
    }
  // ref is a stable RefObject — omitting it from deps is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
