import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE, isLocale } from './lib/i18n/locales-meta'

const LOCALE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

export async function middleware(request: NextRequest) {
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

  // Persist `?lang=xx` into a cookie so subsequent requests (and SSR for the
  // current request) pick up the locale. Mutate the in-flight request cookies
  // first so the page render in this same request sees the new value.
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

  const pathname = request.nextUrl.pathname
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/invite/') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/privacy')

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  if (user && pathname === '/sign-in') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Note: Cache-Control for public pages (/, /sign-in, /terms, /privacy) is
  // set in vercel.json — middleware-set headers get clobbered by Next.js
  // dynamic rendering, which always emits `private, no-store` for cookie-touched
  // responses (issue #314). vercel.json runs at the edge AFTER Next.js, so its
  // headers take effect.

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
