'use client'

import { useEffect, useRef } from 'react'

/**
 * Module-level stack of active close handlers. When multiple sheets are open
 * (e.g. AddSheet → ConfirmModal), only the most recently pushed handler
 * responds to Escape — so a single keypress unwinds exactly one layer.
 */
const stack: Array<() => void> = []

/**
 * Wire Escape to dismiss a sheet/modal while it's open. Pairs with the
 * existing backdrop-click affordance so the dismissal vocabulary matches
 * desktop/PWA expectations (#255).
 *
 * Nested sheets are handled by a module-level stack: each open sheet pushes
 * its handler; only the top of the stack runs on Escape; closing pops it.
 * That's why the listener is registered per-instance rather than once at the
 * app root — registering only the topmost handler keeps the unwind order
 * predictable without a single global owner.
 */
export function useEscapeToClose(open: boolean, onClose: () => void): void {
  // Hold the latest onClose in a ref so we don't re-bind the global listener
  // every render — parent callbacks are often inline arrows that change
  // identity each pass.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const handler = () => onCloseRef.current()
    stack.push(handler)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // During IME composition (e.g. typing Chinese), Escape cancels the
      // composition — don't also dismiss the sheet underneath.
      if (e.isComposing || e.keyCode === 229) return
      if (stack[stack.length - 1] !== handler) return
      e.preventDefault()
      handler()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      const i = stack.indexOf(handler)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [open])
}
