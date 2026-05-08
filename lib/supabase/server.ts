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
            // Server Components cannot set cookies; middleware handles session refresh.
          }
        },
      },
    }
  )
}

/**
 * Read the current user from the local session cookie without an Auth API
 * round-trip. Use ONLY in page / layout server components where read latency
 * matters and the trust boundary is already enforced by middleware.
 *
 * Do NOT use in server actions — those mutate state and must call
 * `supabase.auth.getUser()` directly to re-validate the JWT against Supabase
 * Auth.
 */
export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}
