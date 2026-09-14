import { translateActionError, type ActionErrorMessages } from './action-errors'

/**
 * Translate a caught error into a user-facing message.
 *
 * Resolution order:
 *   1. Network failure (offline, captive portal, weak signal) → `offlineMessage`,
 *      instead of leaking raw "Failed to fetch" / "NetworkError when attempting
 *      to fetch resource" / "Load failed" surfaces from different browsers.
 *   2. A server-action error code (see `lib/action-errors.ts`) → the localized
 *      sentence from `actionErrors`.
 *   3. Anything else → `fallback`.
 *
 * Step 3 deliberately does NOT return `e.message` (#1156). It used to, and
 * every action that threw a zh-TW sentence rendered that sentence to en / ja /
 * zh-CN users. Raw messages are also where DB driver text ("duplicate key value
 * violates…") would otherwise reach the screen.
 *
 * Consequence to know about: lib code that still throws prose (e.g.
 * `lib/validators.ts`) now renders as `fallback` rather than its sentence.
 * That is the intended trade — a generic message in the viewer's language
 * beats a specific one in someone else's — but it is why a validator error can
 * look "less helpful" than it used to in zh-TW.
 *
 * @param e             The caught error (any thrown value).
 * @param fallback      Localized generic message for anything unrecognised.
 * @param offlineMessage  Localized message shown when we detect a network
 *                      failure. Pass `undefined` to disable offline detection.
 * @param actionErrors  `t.errors.actions` for the viewer's locale.
 */
export function describeError(
  e: unknown,
  fallback: string,
  offlineMessage: string | undefined,
  actionErrors: ActionErrorMessages,
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
  return translateActionError(e, actionErrors) ?? fallback
}
