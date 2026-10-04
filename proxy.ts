import { createServerClient } from '@supabase/ssr'
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import {
  LOCALE_COOKIE,
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
} from './lib/i18n/locales-meta'
import {
  parseLocaleFromPath,
  isPublicLocalizedPath,
  isLocalePrefixedPath,
  isOutingPublicPath,
  localizedHref,
} from './lib/i18n/path'
import { isKnownProtectedPath } from './lib/auth/protectedPaths'

const LOCALE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie)
  }
  return to
}

// #1540 — getUser() failures that mean "this session cookie will never work
// again", as opposed to "Supabase could not answer right now". Only these make
// the proxy expire the auth cookie itself (on top of whatever auth-js removed).
// - AuthSessionMissingError: no session, or `session_not_found` (signed out
//   elsewhere / global sign-out). auth-js already removes the cookie here.
// - bad_jwt: the token is malformed, or signed by a key the project no longer
//   trusts. auth-js does NOT remove the cookie, so without this the browser
//   keeps it and the sign-in page bounces to /dashboard and back forever.
//   Trade-off: revoking a JWT signing key signs out everyone whose access token
//   it signed — never revoke a key before those tokens expire (~1 h, see
//   docs/superpowers/ops-runbook.md).
// Matched by auth-js's own `code`, never by HTTP status: a codeless 401/403 is
// an API-key incident, 429/5xx are outages — expiring cookies on those would
// sign out every user at once. Retryable fetch errors, AuthUnknownError and
// every other code fall through to "no explicit expiry".
const DEFINITIVE_REJECTION_CODES = new Set([
  'bad_jwt',
  'user_not_found',
  'session_expired',
  'user_banned',
])

function isDefinitiveRejection(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true
  return isAuthApiError(error)
    && typeof error.code === 'string'
    && DEFINITIVE_REJECTION_CODES.has(error.code)
}

/**
 * The `@supabase/ssr` session cookie name: `sb-<ref>-auth-token`, split into
 * `.0`, `.1`, … when large — the same key supabase-js derives from the URL.
 * `sb-<ref>-auth-token-code-verifier` (an OAuth attempt in flight) does not
 * match and is never expired by the proxy.
 */
function isSessionCookieName(name: string, storageKey: string): boolean {
  return name === storageKey
    || (name.startsWith(`${storageKey}.`) && /^\d+$/.test(name.slice(storageKey.length + 1)))
}

function expireSessionCookies(request: NextRequest, response: NextResponse): void {
  let storageKey: string
  try {
    storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`
  } catch {
    return
  }
  // request.cookies: what the browser sent (setAll() blanks removed ones but
  // keeps the names). response.cookies: anything auth-js just wrote, e.g.
  // chunks of a refreshed session.
  const names = new Set(
    [...request.cookies.getAll(), ...response.cookies.getAll()]
      .map(({ name }) => name)
      .filter((name) => isSessionCookieName(name, storageKey)),
  )
  for (const name of names) {
    // path / sameSite match @supabase/ssr's DEFAULT_COOKIE_OPTIONS, so the
    // removal hits the cookie the browser actually stored.
    response.cookies.set(name, '', { path: '/', maxAge: 0, sameSite: 'lax' })
  }
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname
  const urlLocale = parseLocaleFromPath(pathname)

  // 1) Locale handling — 只處理 public-localized paths.
  // Sync cookie 讓 root layout (cookie-based getLocale) 跟 URL 對齊；
  // unprefixed public path 內部 rewrite 到 /<DEFAULT_LOCALE>/<path>。
  // 非 public-localized path（dashboard / onboarding / setup / invite / auth / api / offline）：
  // proxy 不動 cookie，沿用既有 cookie-based locale。
  let needsRewrite = false
  if (isPublicLocalizedPath(pathname)) {
    const effectiveLocale: Locale = urlLocale ?? DEFAULT_LOCALE

    request.cookies.set(LOCALE_COOKIE, effectiveLocale)
    supabaseResponse.cookies.set(LOCALE_COOKIE, effectiveLocale, {
      path: '/',
      maxAge: LOCALE_MAX_AGE,
      sameSite: 'lax',
    })

    if (!urlLocale) {
      needsRewrite = true
    }
  }

  // 2) Auth check — ONLY for protected (non-public) paths (#920 Phase 1).
  // Public marketing routes (/, /sign-in, /terms, /privacy, /migrate/*,
  // /use-case/*, /auth/*, /invite/*, /offline) don't need an edge→Supabase Auth
  // round-trip: they render the same for everyone, so we skip getUser() entirely
  // to cut TTFB. The two branches that historically used `user` were:
  //   (a) unauthed → auth-walled redirect: only fires on protected paths (below).
  //   (b) authed-on-/sign-in → /dashboard redirect: now done client-side on the
  //       sign-in page itself (it's public, so the proxy no longer verifies it).
  // Auth gating for protected routes is UNCHANGED — they still get a full
  // getUser() verification and redirect exactly as before.
  //
  // #1275: 任何 `/<locale>/...` 也略過——app/[locale] 只有 public 頁，未知的
  // `/zh-TW/foo` 交給 [locale] 的 notFound() 回 404，而不是被 307 到 /sign-in。
  // 這條只影響 auth-skip；上面的 cookie sync / rewrite 仍只看 isPublicLocalizedPath，
  // 否則 `/en/junk` 會把已登入使用者的語系 cookie 切掉。
  // 「app/[locale] 只放 public 頁」由 tests/locale-segment-public-only.test.ts 守住：
  // 失效的樣子是那頁在 proxy 這層沒有 session refresh、也不導轉，而且不會報錯。
  const isPublic = isPublicLocalizedPath(pathname)
    || isLocalePrefixedPath(pathname)
    || pathname.startsWith('/auth/')
    || pathname.startsWith('/invite/')
    || pathname === '/offline'

  if (isPublic && isOutingPublicPath(pathname)) {
    // #1558: the outing share pages are public but read the session (a
    // signed-in friend sees their own name). Refresh it here like a protected
    // page would, and never redirect: a signed-out visitor is a normal visitor.
    // Cookie writes land on supabaseResponse, which the rewrite below copies.
    await supabase.auth.getUser()
  } else if (!isPublic) {
    const { data: { user }, error } = await supabase.auth.getUser()

    if (!user) {
      // 未登入訪問 auth-walled 頁 → redirect 到 sign-in；
      // 從現有 cookie 推算 locale prefix，讓使用者繼續講原語言。
      const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value
      const targetLocale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
      const target = new URL(localizedHref('/sign-in', targetLocale), request.url)
      // #1275: 已知 protected 頁帶 `?next=<pathname>`，登入後回原頁。
      // - 只帶 pathname，不帶 search：/records 的金額篩選會跟著進 PostHog / Supabase log。
      // - 用 searchParams.set 而非字串串接：sign-in 還會讀 `from`（歸因），
      //   串接的 `&` 會讓 next 的內容偽造出別的參數。
      // - /api/* 與未知路徑不帶（見 lib/auth/protectedPaths.ts）。
      if (isKnownProtectedPath(pathname)) {
        target.searchParams.set('next', pathname)
      }
      // #1540: a NEW response, so Supabase's cookie writes (removals on
      // sign-out-elsewhere, a refreshed session) must be copied onto it —
      // returning the bare redirect dropped them, the browser kept the dead
      // cookie, and /sign-in bounced to /dashboard and back forever. The copy
      // is unconditional and passes auth-js's own removals through unchanged
      // (Supabase's default; it also removes the session when a refresh fails
      // non-retryably). Then, only for a definitive rejection, expire the
      // session cookie ourselves — auth-js leaves e.g. a bad_jwt cookie alone.
      const redirect = copyCookies(supabaseResponse, NextResponse.redirect(target))
      if (isDefinitiveRejection(error)) {
        expireSessionCookies(request, redirect)
      }
      return redirect
    }
  }

  // 3) Apply rewrite if needed（要保留所有 cookies）
  if (needsRewrite) {
    const url = request.nextUrl.clone()
    url.pathname = `/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}`
    const rewriteResponse = NextResponse.rewrite(url, { request })
    return copyCookies(supabaseResponse, rewriteResponse)
  }

  // Note: Cache-Control for public pages is set in vercel.json — proxy-set
  // headers get clobbered by Next.js dynamic rendering, which always emits
  // `private, no-store` for cookie-touched responses (issue #314). vercel.json
  // runs at the edge AFTER Next.js, so its headers take effect.

  return supabaseResponse
}

export const config = {
  // Skip auth check on Next internals, SEO assets, PWA artifacts, and static
  // files in /public. Without these exclusions: /sw.js + /manifest.* get 307'd
  // to /sign-in (PWA registration silently fails, MIME mismatch); robots.txt +
  // sitemap.xml get 307'd too, defeating SEO. See issues #305, #306, #575.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|sw\\.js|service-worker\\.js|manifest\\.(?:json|webmanifest)|robots\\.txt|sitemap\\.xml|llms\\.txt|llms-full\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|xlsx?)$).*)',
  ],
}
