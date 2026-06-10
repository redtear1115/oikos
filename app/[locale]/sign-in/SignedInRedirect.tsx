'use client'

import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

/**
 * Client-side "already logged in → /dashboard" redirect (#920 Phase 1).
 *
 * The proxy no longer verifies auth on public paths (/sign-in is public), so the
 * server-side redirect that used to bounce signed-in viewers off the sign-in
 * form moved here. On mount we read the local session via the browser Supabase
 * client (getSession() is cookie-local — no Auth API round-trip); if a session
 * exists we replace the history entry with /dashboard so the sign-in form isn't
 * left in the back-stack. Renders nothing.
 */
export function SignedInRedirect() {
  useEffect(() => {
    let active = true
    const supabase = createClient()
    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (active && data.session) {
        window.location.replace('/dashboard')
      }
    })
    return () => {
      active = false
    }
  }, [])

  return null
}
