/**
 * SSR-readable UI preference cookies (collapse toggles, banner dismissals).
 *
 * These prefs were previously kept in localStorage, but reading localStorage in
 * a `useState` initializer makes the client's first render diverge from the
 * server's (which can't see localStorage), causing a hydration mismatch (React
 * #418). Storing them as cookies lets the server read the value and render the
 * correct initial state — no flash, no mismatch. Written client-side on toggle.
 *
 * Values are encoded as '1' / '0'. Safe to import from both server and client
 * modules: the server reads via `next/headers` cookies() + `parseBoolCookie`,
 * the client writes via `writeBoolCookie` (guarded on `document`).
 */

export const UI_PREF_COOKIE = {
  heroCollapsed: 'oikos_hero_collapsed',
  balanceIncludePending: 'oikos_balance_include_pending',
  partnerLeftDismissed: 'oikos_partner_left_dismissed',
  tripCollapsed: 'oikos_trip_collapsed',
} as const

/** Per-user stats-card collapse state (scoped so two users on one device stay independent). */
export function statsCollapsedCookieName(userId: string): string {
  return `oikos_stats_collapsed_${userId}`
}

/** Parse a '1'/'0' cookie value into a boolean, falling back to `defaultValue`. */
export function parseBoolCookie(value: string | undefined, defaultValue: boolean): boolean {
  if (value === '1') return true
  if (value === '0') return false
  return defaultValue
}

/** Persist a boolean UI preference cookie (client-side only; no-op on the server). */
export function writeBoolCookie(name: string, value: boolean): void {
  if (typeof document === 'undefined') return
  // Site-wide, 1-year, Lax — a per-device UI preference, not sensitive.
  document.cookie = `${name}=${value ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`
}
