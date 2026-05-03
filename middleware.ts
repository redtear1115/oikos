import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  return supabaseResponse
}

export const config = {
  // Skip auth check on Next internals + static assets in /public.
  // manifest.json and image files would otherwise be redirected to /sign-in for
  // signed-out users, which the browser then tries to parse as JSON / image →
  // "Manifest: Line 1 Syntax error" / broken icons.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)',
  ],
}
