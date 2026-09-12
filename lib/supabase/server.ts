// Supabase server clients. Which helper belongs at which position (proxy /
// page / server action) and why pages may use the cached session is decided in
// docs/superpowers/specs/product-design.md §Auth 驗證分層 — new page/layout code
// uses `getCurrentUser()` below rather than calling `auth.getUser()` directly.
//
// That is authentication. Authorization — which ledger a viewer may touch, and
// why the query layer deliberately does not check membership — is
// docs/superpowers/specs/authorization-design.md.

import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components cannot set cookies; proxy handles session refresh.
          }
        },
      },
    }
  )
}

/**
 * Request-scoped current user for page / layout server components.
 * Internally calls `supabase.auth.getUser()` (JWT validated against Supabase
 * Auth); React `cache()` dedupes so a single request hits the Auth API at
 * most once. Switched from `getSession()` in v1.0.2 to eliminate the
 * Supabase security warning in prod logs (#494).
 *
 * Do NOT use in server actions — those mutate state and must call
 * `supabase.auth.getUser()` directly for a fresh validation, not a value
 * shared through the render-pass cache.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
})
