'use client'

import { createClient } from '@/lib/supabase/client'
import { track, getAnonId } from '@/lib/analytics/track'
import { buildAuthCallbackUrl, entrySourceFromParam } from '@/lib/analytics/attribution'
import { recordNativeAuthConversion } from '@/actions/auth'
import { generateNonce, sha256Hex } from '@/lib/auth/nonce'
import { isUserCancelled } from '@/lib/auth/appleSignInError'
import { nativeCallbackUrl, safeSameOriginUrl } from '@/lib/auth/nativeRedirect'

// Deep link scheme registered in AndroidManifest.xml / capacitor.config.ts
const CAPACITOR_SCHEME = 'dev.southernlight.futari'
// Only the Apple `redirectURI` — the return URL registered on the Apple Services
// ID, so it is intentionally prod. NOT for navigation: navigation uses
// window.location.origin so a shell overridden via CAP_SERVER_URL (localhost /
// Vercel preview, runbook §J, #1214) can complete sign-in. Navigating to this
// constant instead leaves such a shell stuck on the "正在帶你進去" curtain with
// no error.
const APP_ORIGIN = 'https://futari.southern-light.dev'

type Provider = 'google' | 'apple'

/**
 * What an attempt did, from the caller's point of view (#1083).
 *
 * `'navigating'` — a redirect is already under way and this page is about to be
 * replaced, so the waiting curtain must STAY up until the new page lands.
 * `'aborted'` — nothing further will happen (cancelled, or we failed before ever
 * leaving), so the curtain must come down. Getting this backwards strands the
 * user behind a full-screen overlay with no way out, which is worse than the
 * double-tap bug the curtain exists to prevent.
 */
type SignInOutcome = 'navigating' | 'aborted'

/** Minimal shape of a Capacitor listener handle — avoids importing @capacitor/core. */
type Removable = { remove: () => Promise<void> }

// These stay local rather than moving to `lib/platform.ts` (#1002). That module
// answers an analytics question — which of five surfaces is this — while the
// three-way auth branch below needs a raw Capacitor platform string, and this is
// a native-contract file that reaches installed shells without an App Store
// review in between. Deduplication isn't worth touching it for.

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
): Promise<SignInOutcome> {
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
  if (!idToken) {
    track('sign_in_failed', { reason: 'apple_no_id_token', provider: 'apple', path: 'ios_native' })
    return 'aborted'
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken,
    nonce: rawNonce,
  })
  if (error) {
    track('sign_in_failed', { reason: 'id_token_rejected', provider: 'apple', path: 'ios_native' })
    return 'aborted'
  }

  // Bypasses /auth/callback, so replay its attribution here (best-effort).
  // This is a server action — on a slow link it is seconds during which the page
  // is still the sign-in form, which is exactly why the curtain covers it.
  await recordNativeAuthConversion({ from: ctx.from, anonId: getAnonId() })

  // `next` comes from the query string — safeSameOriginUrl refuses anything
  // that would leave this origin (e.g. `@evil.com`, `//evil.com`).
  window.location.href = safeSameOriginUrl(window.location.origin, ctx.next)
  return 'navigating'
}

/** Android-native: in-app browser OAuth + custom-scheme deep link back. */
async function browserOAuthSignIn(
  supabase: ReturnType<typeof createClient>,
  provider: Provider,
  ctx: { next: string; from: string | null },
): Promise<SignInOutcome> {
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
  if (!data.url) {
    track('sign_in_failed', { reason: 'no_oauth_url', provider, path: 'capacitor_browser' })
    return 'aborted'
  }

  let settle!: (outcome: SignInOutcome) => void
  const outcome = new Promise<SignInOutcome>((resolve) => {
    settle = resolve
  })

  // Both listeners have to be torn down by whichever one fires, and each needs
  // to remove the other — collecting them in one array sidesteps the
  // declaration order problem that referring to them by name would create.
  const listeners: Removable[] = []
  let done = false
  const finish = async (result: SignInOutcome) => {
    if (done) return
    done = true
    for (const listener of listeners.splice(0)) await listener.remove()
    settle(result)
  }

  // Registered BEFORE Browser.open so the deep link cannot arrive while we are
  // still awaiting registration. The old post-open order was safe in practice
  // (the user has to authorise first), but the ordering costs nothing.
  listeners.push(
    await App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(`${CAPACITOR_SCHEME}://`)) return
      if (done) return
      // Not our OAuth callback (or shaped to escape this origin): ignore it
      // rather than finishing — a stray link must not tear down a live attempt.
      const target = nativeCallbackUrl(window.location.origin, url, CAPACITOR_SCHEME)
      if (target === null) return
      await finish('navigating')
      await Browser.close()
      window.location.href = target
    }),
  )

  // The user dismissed the in-app browser without authorising — swiped it away,
  // pressed back, or cancelled at the provider. No deep link will ever arrive,
  // so this is the ONLY signal that the attempt is over; without it the curtain
  // would hang forever. Our own Browser.close() above fires this too, which the
  // `done` guard in finish() absorbs.
  listeners.push(
    await Browser.addListener('browserFinished', async () => {
      await finish('aborted')
    }),
  )

  await Browser.open({ url: data.url })
  return outcome
}

/** Web: ordinary OAuth redirect through /auth/callback. */
async function webOAuthSignIn(
  supabase: ReturnType<typeof createClient>,
  provider: Provider,
  ctx: { next: string; from: string | null },
): Promise<SignInOutcome> {
  const redirectTo = buildAuthCallbackUrl(window.location.origin, {
    next: ctx.next,
    from: ctx.from,
    anonId: getAnonId(),
  })
  // On success this never returns normally — Supabase navigates away. An error
  // here means we never even left for the provider, which is exactly the shape
  // #972 is investigating on iOS Safari, so it must not stay silent.
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
  if (error) {
    track('sign_in_failed', { reason: 'oauth_redirect_failed', provider, path: 'web' })
    return 'aborted'
  }
  return 'navigating'
}

export function SignInButton({
  provider,
  label,
  pending,
  onStart,
  onAbort,
}: {
  provider: Provider
  label: string
  /** True while EITHER provider has an attempt in flight — both buttons lock together. */
  pending: boolean
  onStart: () => void
  onAbort: () => void
}) {
  const handleSignIn = async () => {
    // The curtain already blocks pointer input; this covers the keyboard path
    // (Enter on a focused button) and any race before React repaints.
    if (pending) return
    onStart()

    const search = new URLSearchParams(window.location.search)
    const next = search.get('next') ?? '/dashboard'
    const from = search.get('from')

    track('sign_in_started', { entry_source: entrySourceFromParam(from), provider })

    const supabase = createClient()
    const ctx = { next, from }
    let outcome: SignInOutcome = 'aborted'

    try {
      if (provider === 'apple' && getPlatform() === 'ios') {
        try {
          outcome = await appleNativeSignIn(supabase, ctx)
        } catch (err) {
          // The native sheet failed. Until #935 this path had no catch at all,
          // so a missing `com.apple.developer.applesignin` entitlement made the
          // button look dead on every TestFlight build. Never leave it silent.
          if (isUserCancelled(err)) {
            outcome = 'aborted'
          } else {
            track('sign_in_failed', { reason: 'apple_native_unavailable', provider, path: 'ios_native' })
            console.error('[sign-in] native Apple failed, falling back to browser OAuth', err)
            // Same flow Google already uses on this platform, and it reaches the
            // same Apple authorize page the web build uses — so a reviewer or user
            // can still get in even when the native sheet refuses to present.
            outcome = await browserOAuthSignIn(supabase, provider, ctx)
          }
        }
      } else if (isCapacitor()) {
        outcome = await browserOAuthSignIn(supabase, provider, ctx)
      } else {
        outcome = await webOAuthSignIn(supabase, provider, ctx)
      }
    } catch (err) {
      // A throw here reaches nothing the user can see, so at minimum record it.
      track('sign_in_failed', { reason: 'unexpected', provider, path: getPlatform() })
      console.error('[sign-in] unexpected failure', err)
      outcome = 'aborted'
    } finally {
      // Only 'navigating' keeps the curtain — see SignInOutcome.
      if (outcome === 'aborted') onAbort()
    }
  }

  const isApple = provider === 'apple'

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={pending}
      aria-busy={pending}
      // Height and radius follow DESIGN.md's button spec (#1161): `rounded-bubble`
      // (14px) and `h-control-lg` (52px, the hero-CTA control height). `oik-btn`
      // brings the shared ember focus-visible ring and nothing else.
      className="oik-btn w-full h-control-lg rounded-bubble border-0 text-sm font-medium cursor-pointer flex items-center justify-center gap-2 disabled:cursor-default"
      style={
        // Sign in with Apple 的按鈕外觀由 Apple 品牌規範（HIG）強制：只允許
        // 純黑／純白／白底描邊，不得換成產品色。這裡的 #000/#fff 是刻意繞過
        // DESIGN.md §2 的 Pure-Black-and-White Ban，不是疏漏。(#1159)
        // 改成 var(--ink) 不會被 CI、type check 或 build 擋下來，也不會在送審時
        // 被發現——會直接出貨，代價落在下一次 App Store 審查。
        // 本檔是 CLAUDE.md 列的原生契約面：改動即時打到所有已安裝的殼。
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
