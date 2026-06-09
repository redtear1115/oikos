import { createServerClient } from '@supabase/ssr'
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
  localizedHref,
} from './lib/i18n/path'

const LOCALE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie)
  }
  return to
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
  const isPublic = isPublicLocalizedPath(pathname)
    || pathname.startsWith('/auth/')
    || pathname.startsWith('/invite/')
    || pathname === '/offline'

  if (!isPublic) {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // 未登入訪問 auth-walled 頁 → redirect 到 sign-in；
      // 從現有 cookie 推算 locale prefix，讓使用者繼續講原語言。
      const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value
      const targetLocale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
      const target = localizedHref('/sign-in', targetLocale)
      return NextResponse.redirect(new URL(target, request.url))
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
