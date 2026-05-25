/**
 * Run `fn` once, on the next `popstate` event, then stop listening.
 *
 * Why this exists: the bottom-sheet backdrop wires Android/browser Back to
 * "close the sheet" by pushing a synthetic same-URL history entry when a sheet
 * opens and calling `window.history.back()` when it closes by any means other
 * than Back (see `useEscapeToClose`). A sheet whose primary action *navigates*
 * (e.g. the records FilterSheet applying `?fPayer=…` via `router.replace`) hits
 * a history-stack collision: if it navigates in the same tick as closing, the
 * close's `history.back()` lands *after* `router.replace` and reverts it — the
 * new params never stick and the action silently fails.
 *
 * `history.back()` fires its `popstate` asynchronously, so `requestAnimationFrame`
 * / `setTimeout(0)` still race ahead of it. Listening for the popstate is the
 * only ordering that reliably runs the navigation *after* the synthetic-back has
 * unwound, so the navigation applies to the entry we returned to instead of
 * being undone.
 *
 * Usage: call this with the navigation, then close the sheet in the same handler.
 *
 *   runAfterSheetCloseBack(() => router.replace(target, { scroll: false }))
 *   setSheetOpen(false)
 */
export function runAfterSheetCloseBack(fn: () => void): void {
  const onPopState = () => {
    window.removeEventListener('popstate', onPopState)
    fn()
  }
  window.addEventListener('popstate', onPopState)
}
