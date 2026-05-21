'use client'

import { useEffect, useRef } from 'react'

interface SheetEntry {
  /** Invokes this sheet's `onClose`. */
  close: () => void
  /**
   * Set true by the popstate handler immediately before it closes this entry,
   * so the effect cleanup knows the browser's Back already consumed the
   * synthetic history entry and must NOT pop a second time.
   */
  poppedByBack: boolean
}

/**
 * Module-level stack of active sheet entries. When multiple sheets are open
 * (e.g. AddSheet → AssetPickerSheet), only the most recently pushed entry
 * responds to Escape / Back — so a single keypress (or Back press) unwinds
 * exactly one layer.
 */
const stack: SheetEntry[] = []

/**
 * Count of `history.back()` calls we issued purely to unwind our own synthetic
 * entries (a sheet closed via Esc / backdrop / X rather than Back). Each such
 * call produces a `popstate` echo that must be absorbed rather than treated as
 * a user Back press.
 */
let pendingSelfPops = 0

let popStateListenerAttached = false

/**
 * Single, app-lifetime `popstate` listener shared by every sheet. Using one
 * global listener (rather than one per instance) keeps the self-pop accounting
 * simple: there is exactly one place that decides whether a `popstate` is a
 * real Back press or the echo of our own cleanup.
 */
function handlePopState(): void {
  // Absorb the echo of a self-issued `history.back()` (sheet closed by means
  // other than Back).
  if (pendingSelfPops > 0) {
    pendingSelfPops--
    return
  }
  const top = stack[stack.length - 1]
  if (!top) return
  // The browser has already removed our synthetic entry as part of this Back —
  // splice synchronously (so a rapid second Back targets the next layer) and
  // mark the entry so its React cleanup doesn't pop again.
  stack.pop()
  top.poppedByBack = true
  top.close()
}

function ensurePopStateListener(): void {
  if (popStateListenerAttached) return
  popStateListenerAttached = true
  window.addEventListener('popstate', handlePopState)
}

/**
 * Wire Escape and the Android system Back button / browser Back gesture to
 * dismiss a sheet/modal while it's open. Pairs with the existing backdrop-click
 * affordance so the dismissal vocabulary matches desktop/PWA/Android
 * expectations (#255, #683).
 *
 * Nested sheets are handled by a module-level stack: each open sheet pushes its
 * entry; only the top of the stack runs on Escape/Back; closing pops it. That's
 * why listeners are registered per-instance (Esc) rather than once at the app
 * root — registering only the topmost handler keeps the unwind order
 * predictable without a single global owner. Back is handled by one shared
 * `popstate` listener over the same stack.
 *
 * Back-button mechanism: when a sheet opens we push a synthetic same-URL
 * history entry. Pressing Back pops that entry, fires `popstate`, and we close
 * the top sheet instead of navigating away. When a sheet is instead closed by
 * Esc / backdrop / X, we unwind the synthetic entry ourselves via
 * `history.back()` so a later Back doesn't waste a press on a phantom entry.
 */
export function useEscapeToClose(open: boolean, onClose: () => void): void {
  // Hold the latest onClose in a ref so we don't re-bind listeners every render
  // — parent callbacks are often inline arrows that change identity each pass.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Track the latest `open` synchronously during render (NOT via an effect) so
  // the cleanup below can tell *why* it's unmounting. A separate effect would
  // update too late: React runs every effect's cleanup before any new setup, so
  // the ref would still hold the previous value when the main effect's cleanup
  // reads it. The ref is never read during render — only in the cleanup — so the
  // render-phase write is safe (hence the lint suppression).
  const openRef = useRef(open)
  // eslint-disable-next-line react-hooks/refs -- write-in-render is required; see note above
  openRef.current = open

  useEffect(() => {
    if (!open) return
    const entry: SheetEntry = { close: () => onCloseRef.current(), poppedByBack: false }
    stack.push(entry)

    // Push a synthetic history entry that Back will consume. `pushState(null)`
    // lets Next.js's patched history merge its internal router state into the
    // entry (so the later `popstate` stays a no-op route restore rather than a
    // full reload); omitting the URL keeps the address bar unchanged and avoids
    // triggering a router transition. See node_modules/next/dist/client/
    // components/app-router.js (copyNextJsInternalHistoryState / onPopState).
    ensurePopStateListener()
    window.history.pushState(null, '')

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // During IME composition (e.g. typing Chinese), Escape cancels the
      // composition — don't also dismiss the sheet underneath.
      if (e.isComposing || e.keyCode === 229) return
      if (stack[stack.length - 1] !== entry) return
      e.preventDefault()
      entry.close()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      // Closed by Esc / backdrop / X (not Back): the synthetic entry we pushed
      // is still on the history stack — unwind it so a later Back doesn't waste
      // a press undoing a phantom entry. The resulting `popstate` is absorbed
      // by `pendingSelfPops`. If Back already closed this sheet, the entry was
      // consumed by the browser, so we skip.
      //
      // Only unwind when the sheet is truly closing (`open` is now false). If
      // this cleanup is a key-change remount with the sheet still open — e.g.
      // AssetSheet's keyed body swaps when TypePicker changes type — calling
      // `history.back()` here races the freshly-mounted instance's own
      // `pushState`, dropping a history entry and letting a later Back navigate
      // away instead of closing the sheet (#723). Skip it: the new instance
      // pushes its own synthetic entry.
      if (!entry.poppedByBack && !openRef.current) {
        pendingSelfPops++
        window.history.back()
      }
    }
  }, [open])
}
