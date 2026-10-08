// Edge-safe, no 'use client': imported by the GA gate (client), the sign-in
// page metadata (server) and next.config.ts (build).
import { SUPPORTED_LOCALES } from '../i18n/locales-meta'

/**
 * #1558 / #1583 — URLs that carry a bearer secret, for the places that cannot
 * mask a URL and so must not send it at all (GA, the Referer header).
 *
 * - `/invite/<token>` — group invite (24 h, DB stores only the hash, #1288).
 *   No locale-prefixed invite route exists, but a `/<locale>/invite/<x>` form is
 *   treated the same so a future one is covered.
 * - `/outing/<shareToken>` (and `/outing/r/<id>`), with or without a locale.
 * - Any page whose `next` query param is one of the above. Signed-out visitors
 *   on `/invite/<token>` are bounced to `/<locale>/sign-in?next=/invite/<token>`
 *   (app/invite/[token]/page.tsx), so the sign-in URL itself carries the token.
 *
 * What failure looks like: nothing errors. The token just shows up in GA's
 * page-path / referrer reports (property shared across products for Ko-fi
 * attribution) or in another site's Referer logs. Over-matching is silent too:
 * a gate that blocks a normal page zeroes its GA traffic and Ko-fi attribution.
 */

/**
 * The `next` values that carry a token, as a regex body anchored at both ends
 * by the caller. Kept in the exact form Next's `has` matcher takes
 * (`new RegExp('^' + value + '$')` on the decoded query value,
 * next/dist/shared/lib/router/utils/prepare-destination.js › matchHas), so the
 * header rule in next.config.ts and the in-app predicate cannot drift.
 *
 * Anchored on purpose (#1583 F6): only `/invite/<x>`, `/outing/<x>` or the
 * same behind a supported locale. `/settings/invite/x` and `/dashboard` must
 * not match — the loose any-first-segment rule of isOutingSharePath is NOT
 * reused here. The default locale has no prefix (lib/i18n/path.ts).
 */
export const TOKEN_BEARING_NEXT_PATTERN =
  `(?:/(?:${SUPPORTED_LOCALES.join('|')}))?/(?:invite|outing)/[^/?#].*`

// Case-insensitive and dotAll in-app: over-blocking a malformed `next` is
// harmless, under-blocking leaks. (Next routes `/Invite/x` case-insensitively.)
const TOKEN_BEARING_NEXT = new RegExp(`^${TOKEN_BEARING_NEXT_PATTERN}$`, 'is')

/** True when a `next` param value (already URL-decoded) is a token path. */
export function isTokenBearingNext(value: string | null | undefined): boolean {
  return typeof value === 'string' && TOKEN_BEARING_NEXT.test(value)
}

/**
 * True when any of the `next` values is a token path. The sign-in flow reads
 * the first value (`URLSearchParams#get`), Next's header matcher the last, so
 * every value is checked.
 */
export function hasTokenBearingNext(
  next: string | readonly string[] | null | undefined,
): boolean {
  if (next == null) return false
  return (typeof next === 'string' ? [next] : next).some(isTokenBearingNext)
}

/** `/outing/<token>` or `/<locale>/outing/<token>` (non-empty token). */
export function isOutingSharePath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== 'string') return false
  const segments = pathname.split('/').filter(segment => segment !== '')
  const at = segments[0]?.toLowerCase() === 'outing' ? 0 : segments[1]?.toLowerCase() === 'outing' ? 1 : -1
  return at !== -1 && segments.length > at + 1
}

/** `/invite/<token>` or `/<supported-locale>/invite/<token>` (non-empty token). */
export function isInviteTokenPath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== 'string') return false
  const segments = pathname.split('/').filter(segment => segment !== '')
  const at = (SUPPORTED_LOCALES as readonly string[]).includes(segments[0] ?? '') ? 1 : 0
  return segments[at]?.toLowerCase() === 'invite' && segments.length > at + 1
}

/**
 * The GA gate's decision: the path itself is a token path, or a `next` param
 * points at one.
 */
export function isTokenBearingUrl(
  pathname: string | null | undefined,
  nextValues: readonly string[] = [],
): boolean {
  return isOutingSharePath(pathname) || isInviteTokenPath(pathname) || hasTokenBearingNext(nextValues)
}
