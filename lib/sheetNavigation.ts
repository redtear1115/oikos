/**
 * Run `fn` after the sheet's close has settled, then run the navigation.
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
 * BUT that synthetic-back only happens on `useEscapeToClose`'s History API
 * fallback path (Safari + older browsers). On Chrome 120+ / Android, the hook
 * uses CloseWatcher, which closes the sheet WITHOUT touching history — so no
 * `popstate` ever fires. Waiting for one there strands the navigation until the
 * user presses Back themselves, which manifests as "tap 幣別 → sheet closes but
 * nothing navigates → press Back → page finally appears" (#898). On that path
 * there is no synthetic-back to outrace, so run `fn` immediately.
 *
 * The CloseWatcher feature-detect here MUST match the one in `useEscapeToClose`
 * so the two agree on which path is active.
 *
 * Usage: call this with the navigation, then close the sheet in the same handler.
 *
 *   runAfterSheetCloseBack(() => router.replace(target, { scroll: false }))
 *   setSheetOpen(false)
 */
export function runAfterSheetCloseBack(fn: () => void): void {
  // CloseWatcher path: no synthetic history entry was pushed, so no popstate is
  // coming — navigate right away instead of waiting forever.
  if (typeof window !== 'undefined' && 'CloseWatcher' in window) {
    fn()
    return
  }
  const onPopState = () => {
    window.removeEventListener('popstate', onPopState)
    fn()
  }
  window.addEventListener('popstate', onPopState)
}
