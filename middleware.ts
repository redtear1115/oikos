import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE, isLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from './lib/i18n/locales-meta'
import { decideLocaleRouting } from './lib/i18n/routing'

const LOCALE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

// Non-default locale variants of /sign-in. Built from SUPPORTED_LOCALES so
// adding a new locale doesn't silently bypass the signed-in bounce below.
// /zh-TW/sign-in is intentionally excluded — it 308's to /sign-in upstream
// (decideLocaleRouting's 'redirect' branch).
const SIGN_IN_LOCALE_PREFIXED = new RegExp(
  `^\\/(${SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE).join('|')})\\/sign-in$`,
)

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const decision = decideLocaleRouting(pathname)

  // Pure redirect: no Supabase work needed.
  if (decision.action === 'redirect') {
    const target = request.nextUrl.clone()
    target.pathname = decision.targetPath
    return NextResponse.redirect(target, decision.status)
  }

  // Surface the URL-derived locale to the route handler via x-locale header
  // (lib/i18n/t.ts#getLocale prefers this over the cookie). For rewrite +
  // set-locale we keep going so Supabase can refresh session cookies — the
  // signed-in-user bounce at the bottom needs `user`.
  if (decision.action === 'rewrite' || decision.action === 'set-locale') {
    request.headers.set('x-locale', decision.locale)
  }

  // Build base response: rewrite for default-locale public URLs, plain next()
  // otherwise. Wrapped in a helper because Supabase's setAll callback may need
  // to recreate the response after writing refreshed-session cookies.
  const buildResponse = (): NextResponse => {
    if (decision.action === 'rewrite') {
      const target = request.nextUrl.clone()
      target.pathname = decision.targetPath
      return NextResponse.rewrite(target, { request: { headers: request.headers } })
    }
    return NextResponse.next({ request: { headers: request.headers } })
  }

  let supabaseResponse = buildResponse()

  // Sync lang cookie for /<locale>/<page> hits so dashboard inherits the
  // user's chosen language after sign-in.
  if (decision.action === 'set-locale') {
    supabaseResponse.cookies.set(LOCALE_COOKIE, decision.locale, {
      path: '/',
      maxAge: LOCALE_MAX_AGE,
      sameSite: 'lax',
    })
  }

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
          supabaseResponse = buildResponse()
          if (decision.action === 'set-locale') {
            supabaseResponse.cookies.set(LOCALE_COOKIE, decision.locale, {
              path: '/',
              maxAge: LOCALE_MAX_AGE,
              sameSite: 'lax',
            })
          }
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // ?lang=xx sticky-cookie behavior — kept for backwards-compat on dashboard URLs
  // where there's no URL-prefix to drive the locale. On set-locale paths
  // (/en/sign-in?lang=ja), the explicit query param intentionally wins over the
  // URL-derived locale cookie set above.
  const langParam = request.nextUrl.searchParams.get('lang')
  if (isLocale(langParam)) {
    request.cookies.set(LOCALE_COOKIE, langParam)
    supabaseResponse.cookies.set(LOCALE_COOKIE, langParam, {
      path: '/',
      maxAge: LOCALE_MAX_AGE,
      sameSite: 'lax',
    })
  }

  const { data: { user } } = await supabase.auth.getUser()

  // Auth gate: only passthrough paths are auth-gated. Public URLs (handled
  // above via rewrite / set-locale) are always open.
  if (decision.action === 'passthrough') {
    const isAuthEscape =
      pathname.startsWith('/auth/') ||
      pathname.startsWith('/invite/')
    if (!user && !isAuthEscape) {
      return NextResponse.redirect(new URL('/sign-in', request.url))
    }
  }

  // Signed-in user landing on any sign-in URL → bounce to dashboard.
  // Original pathname is preserved across the rewrite (rewrite changes
  // routing, not request.nextUrl.pathname), so this check is reliable.
  // /zh-TW/sign-in already 308'd above, so no need to match it here.
  if (user) {
    const isSignInUrl =
      pathname === '/sign-in' ||
      SIGN_IN_LOCALE_PREFIXED.test(pathname)
    if (isSignInUrl) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  // Skip auth check on Next internals, SEO assets, PWA artifacts, and static
  // files in /public. Without these exclusions: /sw.js + /manifest.* get 307'd
  // to /sign-in (PWA registration silently fails, MIME mismatch); robots.txt +
  // sitemap.xml get 307'd too, defeating SEO. See issues #305, #306.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|sw\\.js|service-worker\\.js|manifest\\.(?:json|webmanifest)|robots\\.txt|sitemap\\.xml|llms\\.txt|llms-full\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
