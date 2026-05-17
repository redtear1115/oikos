// Server-only: reads next/headers cookies. Used by server actions, server
// components, and route handlers that need to redirect to a locale-aware
// sign-in URL.
//
// Why this exists: middleware's redirect-when-unauthed branch already picks
// the locale from cookie (see middleware.ts), but EXPLICIT redirects from
// app code — sign-out (`actions/auth.ts`), OAuth failure (`app/auth/
// callback/route.ts`), invite page (`app/invite/[token]/page.tsx`), and
// page-level `requireViewerOrRedirect()` — emit `/sign-in` as a hard
// destination. When the browser then GETs that URL, middleware sees an
// unprefixed public path, sets the lang cookie to DEFAULT_LOCALE (URL = source
// of truth), and the user's previous locale is silently downgraded.
//
// Calling `localizedSignInPath()` before the redirect makes the destination
// already locale-aware (e.g. `/ja/sign-in`), so middleware preserves rather
// than downgrades the cookie.

import { cookies } from 'next/headers'
import { LOCALE_COOKIE, DEFAULT_LOCALE, isLocale, type Locale } from './locales-meta'
import { localizedHref } from './path'

/**
 * Return a locale-aware `/sign-in` path, optionally with a trailing
 * search/hash suffix (e.g. `?next=/invite/abc` or `?error=auth_failed`).
 *
 * Reads the current request's `lang` cookie; falls back to DEFAULT_LOCALE
 * when missing/invalid.
 */
export async function localizedSignInPath(suffix = ''): Promise<string> {
  const cookieStore = await cookies()
  const value = cookieStore.get(LOCALE_COOKIE)?.value
  const locale: Locale = isLocale(value) ? value : DEFAULT_LOCALE
  return `${localizedHref('/sign-in', locale)}${suffix}`
}
