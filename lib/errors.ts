/**
 * Translate a caught error into a user-facing message.
 *
 * Detects browser network failures (offline, captive portal, weak signal)
 * and substitutes a friendly "you're offline" message instead of leaking
 * raw "Failed to fetch" / "NetworkError when attempting to fetch resource"
 * / "Load failed" surfaces from different browsers.
 *
 * @param e          The caught error (any thrown value).
 * @param fallback   Generic fallback message for non-network errors that
 *                   don't carry a usable `message`.
 * @param offlineMessage  Localized message shown when we detect a network
 *                   failure. Pass `undefined` to disable offline detection
 *                   (helper falls through to standard error.message handling).
 */
export function describeError(
  e: unknown,
  fallback: string,
  offlineMessage?: string,
): string {
  if (offlineMessage) {
    // Hard signal: device reports no connection.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return offlineMessage
    }
    // Soft signal: TypeError with a network-y message. `navigator.onLine`
    // misreports captive portals and weak Wi-Fi as "online", so we also
    // sniff the error itself.
    if (e instanceof TypeError) {
      const msg = e.message.toLowerCase()
      if (
        msg.includes('failed to fetch') ||      // Chromium
        msg.includes('networkerror') ||         // Firefox
        msg.includes('load failed') ||          // Safari
        msg.includes('network request failed')  // misc fetch polyfills
      ) {
        return offlineMessage
      }
    }
  }
  if (e instanceof Error && e.message) return e.message
  return fallback
}
