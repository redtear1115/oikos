const SETTLE_MS = 1000

/**
 * Run `cb` once the page has finished loading and the main thread is idle.
 *
 * For code that must not compete with first paint on the public brand pages
 * (#1520): Sentry, posthog-js and the Supabase client used to be downloaded and
 * evaluated up front there, and Lighthouse put ~0.5 s of simulated LCP on each
 * of them. Failing to defer looks like nothing at all — no error, the page just
 * scores worse — so the gate is a bundle check, not a test.
 *
 * `load` first, because chunks requested earlier join the page's own network
 * queue — then a short grace period (`SETTLE_MS`). On a fast connection `load`
 * fires before the hero image has painted, and Lighthouse's simulated LCP then
 * counts the ~250 KB Sentry chunk as part of first paint (measured: /zh-TW stayed
 * at 2.6 s with idle-only deferral, vs ~2.3 s once the chunks started later).
 * The cost is that an error, or a visitor who bounces inside that window, is not
 * seen by Sentry / PostHog. `requestIdleCallback` is missing on Safari, hence the
 * timeout fallback.
 *
 * The first `pointerdown` / `keydown` runs `cb` straight away instead of waiting
 * out the rest (once, passive, never before the listeners exist — an interaction
 * cannot precede first paint). A tapped event only sits in memory until the SDK
 * is up, so this shortens the window in which a tap can be lost; it does not
 * close it (a hand-off that unloads the page, such as a store link on iOS, can
 * still discard it). `cb` runs at most once, whichever trigger fires first.
 */
export function whenIdle(onIdle: () => void): void {
  if (typeof window === 'undefined') return
  let done = false
  const cb = () => {
    if (done) return
    done = true
    window.removeEventListener('pointerdown', cb)
    window.removeEventListener('keydown', cb)
    onIdle()
  }
  window.addEventListener('pointerdown', cb, { once: true, passive: true })
  window.addEventListener('keydown', cb, { once: true, passive: true })
  const idle = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(cb, { timeout: 3000 })
    } else {
      setTimeout(cb, 200)
    }
  }
  const schedule = () => void setTimeout(idle, SETTLE_MS)
  if (document.readyState === 'complete') schedule()
  else window.addEventListener('load', schedule, { once: true })
}
