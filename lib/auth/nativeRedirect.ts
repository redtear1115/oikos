/**
 * Navigation targets for native (Capacitor) sign-in (#1214).
 *
 * Pure — the origin is always passed in (callers use `window.location.origin`)
 * so these can be unit-tested without a DOM. Navigating to the shell's CURRENT
 * origin rather than a hardcoded prod origin lets a shell pointed elsewhere via
 * CAP_SERVER_URL (localhost, a Vercel preview) finish sign-in; hardcoding prod
 * leaves that shell stuck on the waiting curtain with no error.
 *
 * Both functions also close open redirects: `next` comes from the sign-in URL's
 * query string and the deep link from the OS, so neither is trusted. Before
 * this, `${origin}${next}` with next=`@evil.com` produced
 * `https://futari.southern-light.dev@evil.com` — a userinfo URL on evil.com.
 */

const FALLBACK_PATH = '/dashboard'
const CALLBACK_HOST = 'login-callback'
const CALLBACK_PATH = '/auth/callback'

/**
 * Absolute same-origin URL for `path`, or `${origin}/dashboard` when `path` is
 * not a plain root-relative path on `origin`. Never throws.
 *
 * Same rule as app/auth/callback/route.ts (`startsWith('/') && !startsWith('//')`),
 * plus `/\` (browsers treat `\` as `/`, making it protocol-relative) and a final
 * origin-equality check that catches anything the prefix rule misses (e.g.
 * tab/newline characters the URL parser strips).
 */
export function safeSameOriginUrl(origin: string, path: string): string {
  const fallback = `${origin}${FALLBACK_PATH}`
  if (typeof path !== 'string') return fallback
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return fallback
  try {
    const url = new URL(path, origin)
    return url.origin === origin ? url.href : fallback
  } catch {
    return fallback
  }
}

/**
 * Map an OAuth deep link (`<scheme>://login-callback/auth/callback?...`) to the
 * same-origin `/auth/callback?...` URL on `origin`. Returns `null` for anything
 * else — callers must ignore the link (not abort the attempt), since a stray
 * deep link must not tear down a live sign-in. Never throws.
 */
export function nativeCallbackUrl(origin: string, deepLink: string, scheme: string): string | null {
  if (typeof deepLink !== 'string') return null
  const base = `${scheme}://${CALLBACK_HOST}`
  // Anchored prefix check — the `?` pins the path exactly, so neither
  // `login-callback@evil.com` nor `login-callback//evil.com` can match.
  if (!deepLink.startsWith(`${base}${CALLBACK_PATH}?`)) return null
  const rest = deepLink.slice(base.length)
  try {
    const url = new URL(rest, origin)
    if (url.origin !== origin || url.pathname !== CALLBACK_PATH) return null
    return url.href
  } catch {
    return null
  }
}
