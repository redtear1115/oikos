'use client'

import { createClient } from '@/lib/supabase/client'
import { track, getAnonId } from '@/lib/analytics/track'
import { buildAuthCallbackUrl, entrySourceFromParam } from '@/lib/analytics/attribution'
import { recordNativeAuthConversion } from '@/actions/auth'
import { generateNonce, sha256Hex } from '@/lib/auth/nonce'

// Deep link scheme registered in AndroidManifest.xml / capacitor.config.ts
const CAPACITOR_SCHEME = 'dev.southernlight.futari'
const APP_ORIGIN = 'https://futari.southern-light.dev'

type Provider = 'google' | 'apple'

/** True when running inside a Capacitor native shell (Android / iOS). */
function isCapacitor(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).Capacitor
}

/** 'ios' | 'android' | 'web' — Capacitor's platform string, 'web' when not native. */
function getPlatform(): string {
  if (!isCapacitor()) return 'web'
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor
  return cap?.getPlatform?.() ?? 'web'
}

/** iOS-native Apple: native sheet → identity token → client-side session. */
async function appleNativeSignIn(
  supabase: ReturnType<typeof createClient>,
  ctx: { next: string; from: string | null },
): Promise<void> {
  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')

  const rawNonce = generateNonce()
  const hashedNonce = await sha256Hex(rawNonce)

  const result = await SignInWithApple.authorize({
    clientId: CAPACITOR_SCHEME,
    redirectURI: `${APP_ORIGIN}/auth/callback`,
    scopes: 'name email',
    nonce: hashedNonce,
  })

  const idToken = result.response?.identityToken
  if (!idToken) return

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken,
    nonce: rawNonce,
  })
  if (error) return

  // Bypasses /auth/callback, so replay its attribution here (best-effort).
  await recordNativeAuthConversion({ from: ctx.from, anonId: getAnonId() })

  window.location.href = `${APP_ORIGIN}${ctx.next}`
}

/** Android-native: in-app browser OAuth + custom-scheme deep link back. */
async function browserOAuthSignIn(
  supabase: ReturnType<typeof createClient>,
  provider: Provider,
  ctx: { next: string; from: string | null },
): Promise<void> {
  const { Browser } = await import('@capacitor/browser')
  const { App } = await import('@capacitor/app')

  const redirectTo = buildAuthCallbackUrl(`${CAPACITOR_SCHEME}://login-callback`, {
    next: ctx.next,
    from: ctx.from,
    anonId: getAnonId(),
  })

  const { data } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  })
  if (!data.url) return

  await Browser.open({ url: data.url })

  // Remove the listener after it fires once — otherwise every attempt leaks one.
  const listener = await App.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(`${CAPACITOR_SCHEME}://`)) return
    await listener.remove()
    await Browser.close()
    const callbackUrl = url.replace(`${CAPACITOR_SCHEME}://login-callback`, '')
    window.location.href = `${APP_ORIGIN}${callbackUrl}`
  })
}

/** Web: ordinary OAuth redirect through /auth/callback. */
async function webOAuthSignIn(
  supabase: ReturnType<typeof createClient>,
  provider: Provider,
  ctx: { next: string; from: string | null },
): Promise<void> {
  const redirectTo = buildAuthCallbackUrl(window.location.origin, {
    next: ctx.next,
    from: ctx.from,
    anonId: getAnonId(),
  })
  await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
}

export function SignInButton({ provider, label }: { provider: Provider; label: string }) {
  const handleSignIn = async () => {
    const search = new URLSearchParams(window.location.search)
    const next = search.get('next') ?? '/dashboard'
    const from = search.get('from')

    track('sign_in_started', { entry_source: entrySourceFromParam(from), provider })

    const supabase = createClient()
    const ctx = { next, from }

    if (provider === 'apple' && getPlatform() === 'ios') {
      await appleNativeSignIn(supabase, ctx)
    } else if (isCapacitor()) {
      await browserOAuthSignIn(supabase, provider, ctx)
    } else {
      await webOAuthSignIn(supabase, provider, ctx)
    }
  }

  const isApple = provider === 'apple'

  return (
    <button
      type="button"
      onClick={handleSignIn}
      className="w-full h-12 rounded-xl border-0 text-sm font-medium cursor-pointer flex items-center justify-center gap-2"
      style={
        isApple
          ? { background: '#000', color: '#fff' }
          : { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }
      }
    >
      {isApple && (
        <svg width="16" height="16" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        </svg>
      )}
      {label}
    </button>
  )
}
