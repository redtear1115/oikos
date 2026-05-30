'use client'

import { createClient } from '@/lib/supabase/client'
import { track, getAnonId } from '@/lib/analytics/track'
import { buildAuthCallbackUrl, entrySourceFromParam } from '@/lib/analytics/attribution'

// Deep link scheme registered in AndroidManifest.xml / capacitor.config.ts
const CAPACITOR_SCHEME = 'dev.southernlight.futari'

/** True when running inside a Capacitor native shell (Android / iOS). */
function isCapacitor(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).Capacitor
}

export function SignInButton({ label }: { label: string }) {
  const handleSignIn = async () => {
    const search = new URLSearchParams(window.location.search)
    const next = search.get('next') ?? '/dashboard'
    const from = search.get('from')

    track('sign_in_started', { entry_source: entrySourceFromParam(from) })

    const supabase = createClient()

    if (isCapacitor()) {
      // --- Native path ---
      // Use Capacitor Browser plugin to open OAuth in an in-app browser and
      // redirect back to the app via the custom URL scheme.
      const { Browser } = await import('@capacitor/browser')
      const { App } = await import('@capacitor/app')

      const redirectTo = buildAuthCallbackUrl(
        `${CAPACITOR_SCHEME}://login-callback`,
        { next, from, anonId: getAnonId() },
      )

      const { data } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      })

      if (!data.url) return

      await Browser.open({ url: data.url })

      // Listen for the deep link coming back into the app
      App.addListener('appUrlOpen', async ({ url }) => {
        if (!url.startsWith(`${CAPACITOR_SCHEME}://`)) return
        await Browser.close()
        // Exchange the code in the callback URL for a session
        const callbackUrl = url.replace(`${CAPACITOR_SCHEME}://login-callback`, '/auth/callback')
        const fullUrl = `https://futari.southern-light.dev${callbackUrl}`
        // Navigate the WebView to the auth callback handler
        window.location.href = fullUrl
      })
    } else {
      // --- Web path (unchanged) ---
      const redirectTo = buildAuthCallbackUrl(window.location.origin, {
        next,
        from,
        anonId: getAnonId(),
      })

      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignIn}
      className="w-full h-12 rounded-xl border-0 text-sm font-medium cursor-pointer flex items-center justify-center gap-2"
      style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
    >
      {label}
    </button>
  )
}
