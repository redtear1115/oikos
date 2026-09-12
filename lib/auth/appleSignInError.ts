/**
 * Tells a user-dismissed native Apple sheet apart from one that failed to
 * present at all.
 *
 * `ASAuthorizationController` reports both through the same delegate callback,
 * and `@capacitor-community/apple-sign-in` rejects with only
 * `error.localizedDescription` — no error code survives the bridge — so
 * matching the text is all that is available.
 * `ASAuthorizationError.canceled` is 1001, and the trailing
 * `(… AuthorizationError error 1001.)` stays in ASCII even when the leading
 * sentence is localized.
 *
 * Unrecognised errors are deliberately reported as *not* cancelled. The cost of
 * that direction is an unwanted browser hand-off; the cost of the other is
 * silently swallowing a configuration failure, which is exactly how a missing
 * `com.apple.developer.applesignin` entitlement went unnoticed for three months
 * (#935).
 */
export function isUserCancelled(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return /\b1001\b/.test(message) || /cancell?ed/i.test(message)
}
