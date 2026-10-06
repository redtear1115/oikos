import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// #1552 — when the iOS Apple native sheet fails (error 1000 on a device with no
// Apple ID), the flow falls back to the in-app browser. Until now every way
// that fallback could end without signing in looked the same as never having
// tried, and PostHog saw nothing past `apple_native_unavailable`. These pin:
// (a) the retry hint shows on every aborted fallback outcome and nowhere else,
// (b) the Android callback-first ordering of #1315 is never counted as a
//     dismissal, (c) a throwing `track` cannot block either hazard site,
// (d) `id_token_rejected` carries a classifiable cause but never the message,
// (e) every new event's property keys are exactly the fixed, URL-free set.

const h = vi.hoisted(() => ({
  listeners: {} as Record<string, (payload?: unknown) => unknown>,
  removed: [] as string[],
  closed: 0,
  opened: 0,
}))

const track = vi.fn()
vi.mock('@/lib/analytics/track', () => ({
  track: (...a: unknown[]) => track(...a),
  getAnonId: () => 'anon-1',
  analyticsReady: async () => {},
}))
vi.mock('@/lib/observability/sentryClient', () => ({ captureException: vi.fn() }))
vi.mock('@/actions/auth', () => ({ recordNativeAuthConversion: vi.fn(async () => ({ ok: true })) }))

const signInWithOAuth = vi.fn()
const signInWithIdToken = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth, signInWithIdToken } }),
}))

const addListener = async (event: string, cb: (payload?: unknown) => unknown) => {
  h.listeners[event] = cb
  return { remove: async () => { h.removed.push(event) } }
}
vi.mock('@capacitor/browser', () => ({
  Browser: { addListener, open: async () => { h.opened++ }, close: async () => { h.closed++ } },
}))
vi.mock('@capacitor/app', () => ({ App: { addListener } }))
const authorize = vi.fn()
vi.mock('@capacitor-community/apple-sign-in', () => ({ SignInWithApple: { authorize: (...a: unknown[]) => authorize(...a) } }))

import { SignInButton } from '@/app/[locale]/sign-in/SignInButton'
import { SignInActions } from '@/app/[locale]/sign-in/SignInActions'
import { idTokenErrorLabel } from '@/lib/auth/idTokenErrorLabel'
import { appleAuthorizationErrorCode, isUserCancelled } from '@/lib/auth/appleSignInError'

const HINT = 'APPLE_FALLBACK_HINT'
const ORIGIN = 'https://futari.test'
const OAUTH_URL = 'https://idp.test/authorize?client_id=x&code_challenge=SECRET_PKCE'
const DEEP_LINK = 'dev.southernlight.futari://login-callback/auth/callback?code=SECRET_CODE&next=%2Fdashboard'
const TARGET = `${ORIGIN}/auth/callback?code=SECRET_CODE&next=%2Fdashboard`
// The shape the plugin rejects with when the sheet cannot present (#935, #1552).
const APPLE_1000 = new Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)')
const APPLE_1001 = new Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)')

const w = window as unknown as Record<string, unknown>
const originalLocation = window.location

const realTime = () => new Promise((resolve) => setTimeout(resolve, 20))

beforeEach(() => {
  vi.clearAllMocks()
  track.mockImplementation(() => {})
  h.listeners = {}
  h.removed = []
  h.closed = 0
  h.opened = 0
  signInWithOAuth.mockResolvedValue({ data: { url: OAUTH_URL } })
  authorize.mockRejectedValue(APPLE_1000)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { origin: ORIGIN, search: '', href: `${ORIGIN}/sign-in` },
  })
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  delete w.Capacitor
  delete w.webkit
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
})

function setPlatform(platform: 'ios' | 'android') {
  // Same as the #1314 test: real @capacitor/core can get loaded along the way
  // and re-detect the platform from the native bridge, so provide it.
  if (platform === 'ios') w.webkit = { messageHandlers: { bridge: { postMessage: () => {} } } }
  w.Capacitor = { getPlatform: () => platform }
}

async function renderActionsAndTap(platform: 'ios' | 'android', button: 'Apple' | 'Google') {
  setPlatform(platform)
  render(<SignInActions googleLabel="Google" appleLabel="Apple" pendingLabel="…" appleFallbackHint={HINT} />)
  // Let the mount-time warm-up imports settle before the tap (see #1314 test).
  await realTime()
  fireEvent.click(screen.getByRole('button', { name: button }))
}

/** Waits for the in-app browser to be open, then freezes the clock. */
async function untilBrowserOpen() {
  await vi.waitFor(() => expect(h.opened).toBe(1))
  await realTime()
  vi.useFakeTimers()
}

/** The user swipes the in-app browser away and nothing comes back. */
async function dismissBrowser() {
  await untilBrowserOpen()
  h.listeners.browserFinished()
  await vi.advanceTimersByTimeAsync(1600)
  vi.useRealTimers()
}

function calls(event: string, reason?: string) {
  return track.mock.calls.filter(
    ([e, p]) => e === event && (reason === undefined || (p as Record<string, unknown>)?.reason === reason),
  )
}

describe('retry hint after the iOS Apple browser fallback (#1552) — (a)', () => {
  it('shows when the fallback browser is dismissed (grace timer)', async () => {
    await renderActionsAndTap('ios', 'Apple')
    await dismissBrowser()
    await waitFor(() => expect(screen.getByText(HINT)).toBeTruthy())
    // The curtain is down: the buttons are usable again.
    expect(screen.getByRole('button', { name: 'Apple' }).hasAttribute('disabled')).toBe(false)
  })

  it('shows when the fallback throws', async () => {
    signInWithOAuth.mockRejectedValue(new Error('fetch failed'))
    await renderActionsAndTap('ios', 'Apple')
    await waitFor(() => expect(screen.getByText(HINT)).toBeTruthy())
    expect(calls('sign_in_failed', 'unexpected')).toHaveLength(1)
  })

  it('shows when the fallback gets no OAuth URL', async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: null } })
    await renderActionsAndTap('ios', 'Apple')
    await waitFor(() => expect(screen.getByText(HINT)).toBeTruthy())
    expect(calls('sign_in_failed', 'no_oauth_url')[0][1]).toEqual({
      reason: 'no_oauth_url',
      provider: 'apple',
      path: 'capacitor_browser',
      via: 'apple_fallback',
    })
  })

  it('hides again when a new attempt starts', async () => {
    await renderActionsAndTap('ios', 'Apple')
    await dismissBrowser()
    await waitFor(() => expect(screen.getByText(HINT)).toBeTruthy())
    h.opened = 0
    fireEvent.click(screen.getByRole('button', { name: 'Google' }))
    expect(screen.queryByText(HINT)).toBeNull()
  })

  it('does not show when the user cancels the native Apple sheet (1001)', async () => {
    authorize.mockRejectedValue(APPLE_1001)
    expect(isUserCancelled(APPLE_1001)).toBe(true)
    await renderActionsAndTap('ios', 'Apple')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apple' }).hasAttribute('disabled')).toBe(false))
    await realTime()
    expect(screen.queryByText(HINT)).toBeNull()
    expect(signInWithOAuth).not.toHaveBeenCalled()
  })

  it('does not show when iOS Google is dismissed', async () => {
    await renderActionsAndTap('ios', 'Google')
    await dismissBrowser()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Google' }).hasAttribute('disabled')).toBe(false))
    expect(screen.queryByText(HINT)).toBeNull()
  })

  it.each(['Google', 'Apple'] as const)('does not show when Android %s is dismissed', async (button) => {
    await renderActionsAndTap('android', button)
    await dismissBrowser()
    await waitFor(() => expect(screen.getByRole('button', { name: button }).hasAttribute('disabled')).toBe(false))
    expect(screen.queryByText(HINT)).toBeNull()
    expect(authorize).not.toHaveBeenCalled()
    // Unlabelled callers emit none of the fallback telemetry.
    expect(track.mock.calls.map(([e]) => e)).toEqual(['sign_in_started'])
  })

  it.each(['Google', 'Apple'] as const)('does not show when Android %s gets no OAuth URL', async (button) => {
    signInWithOAuth.mockResolvedValue({ data: { url: null } })
    await renderActionsAndTap('android', button)
    await waitFor(() => expect(calls('sign_in_failed', 'no_oauth_url')).toHaveLength(1))
    await realTime()
    expect(screen.queryByText(HINT)).toBeNull()
    expect(calls('sign_in_failed', 'no_oauth_url')[0][1]).not.toHaveProperty('via')
  })
})

describe('fallback telemetry (#1552)', () => {
  async function tapAppleButton(onAbort: (reason?: string) => void) {
    setPlatform('ios')
    render(<SignInButton provider="apple" label="Apple" pending={false} onStart={() => {}} onAbort={onAbort} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apple' }))
  }

  it('(b) callback-first ordering (#1315) emits no dismissal and still navigates', async () => {
    const onAbort = vi.fn()
    await tapAppleButton(onAbort)
    await untilBrowserOpen()

    h.listeners.browserFinished()
    await vi.advanceTimersByTimeAsync(10)
    await h.listeners.appUrlOpen({ url: DEEP_LINK })
    await vi.advanceTimersByTimeAsync(3000)

    expect(window.location.href).toBe(TARGET)
    expect(h.closed).toBe(1)
    expect(onAbort).not.toHaveBeenCalled()
    expect(calls('sign_in_failed', 'fallback_dismissed')).toHaveLength(0)
    expect(calls('sign_in_fallback_callback')).toHaveLength(1)
  })

  it('(b) Android Google success emits no sign_in_failed and still navigates', async () => {
    const onAbort = vi.fn()
    setPlatform('android')
    render(<SignInButton provider="google" label="Google" pending={false} onStart={() => {}} onAbort={onAbort} />)
    fireEvent.click(screen.getByRole('button', { name: 'Google' }))
    await untilBrowserOpen()

    h.listeners.browserFinished()
    await vi.advanceTimersByTimeAsync(10)
    await h.listeners.appUrlOpen({ url: DEEP_LINK })
    await vi.advanceTimersByTimeAsync(3000)

    expect(window.location.href).toBe(TARGET)
    expect(onAbort).not.toHaveBeenCalled()
    expect(calls('sign_in_failed')).toHaveLength(0)
    expect([...h.removed].sort()).toEqual(['appUrlOpen', 'browserFinished'])
  })

  it('(c1) a throwing track in the grace timer does not block the abort', async () => {
    track.mockImplementation((event: string, props?: Record<string, unknown>) => {
      if (event.startsWith('sign_in_fallback') || props?.reason === 'fallback_dismissed') throw new Error('boom')
    })
    const onAbort = vi.fn()
    await tapAppleButton(onAbort)
    await dismissBrowser()

    await waitFor(() => expect(onAbort).toHaveBeenCalledTimes(1))
    expect(onAbort).toHaveBeenCalledWith('apple_fallback_failed')
    expect(calls('sign_in_failed', 'fallback_dismissed')).toHaveLength(1)
    expect([...h.removed].sort()).toEqual(['appUrlOpen', 'browserFinished', 'browserPageLoaded'])
  })

  it('(c2) a throwing track on the callback does not block the navigation', async () => {
    track.mockImplementation((event: string) => {
      if (event.startsWith('sign_in_fallback')) throw new Error('boom')
    })
    const onAbort = vi.fn()
    await tapAppleButton(onAbort)
    await untilBrowserOpen()

    await h.listeners.appUrlOpen({ url: DEEP_LINK })
    await vi.advanceTimersByTimeAsync(3000)

    expect(calls('sign_in_fallback_callback')).toHaveLength(1)
    expect(window.location.href).toBe(TARGET)
    expect(h.closed).toBe(1)
    expect([...h.removed].sort()).toEqual(['appUrlOpen', 'browserFinished', 'browserPageLoaded'])
    expect(onAbort).not.toHaveBeenCalled()
  })

  it('(e) every new event carries exactly its fixed, URL-free keys', async () => {
    const onAbort = vi.fn()
    await tapAppleButton(onAbort)
    await untilBrowserOpen()
    h.listeners.browserPageLoaded()
    h.listeners.browserPageLoaded()
    // A stray deep link is ignored, not followed, and not quoted.
    await h.listeners.appUrlOpen({ url: 'dev.southernlight.futari://elsewhere?token=SECRET_STRAY' })
    h.listeners.browserFinished()
    await vi.advanceTimersByTimeAsync(1600)
    vi.useRealTimers()
    await waitFor(() => expect(onAbort).toHaveBeenCalledWith('apple_fallback_failed'))

    const keys = (event: string, reason?: string) => {
      const found = calls(event, reason)
      expect(found).toHaveLength(1)
      return Object.keys(found[0][1] as object).sort()
    }
    expect(calls('sign_in_failed', 'apple_native_unavailable')[0][1]).toEqual({
      reason: 'apple_native_unavailable',
      provider: 'apple',
      path: 'ios_native',
      apple_error_code: 1000,
    })
    expect(calls('sign_in_fallback_opened')[0][1]).toEqual({ provider: 'apple', via: 'apple_fallback' })
    expect(keys('sign_in_fallback_page_loaded')).toEqual(['elapsed_ms', 'provider', 'via'])
    expect(calls('sign_in_failed', 'callback_ignored')[0][1]).toEqual({
      reason: 'callback_ignored',
      provider: 'apple',
      path: 'capacitor_browser',
      via: 'apple_fallback',
    })
    expect(keys('sign_in_failed', 'fallback_dismissed')).toEqual(
      ['elapsed_ms', 'page_loaded', 'path', 'provider', 'reason', 'via'],
    )
    expect(calls('sign_in_failed', 'fallback_dismissed')[0][1]).toMatchObject({ page_loaded: true, via: 'apple_fallback' })

    // Nothing that left the device quotes a URL, a query string or a secret.
    for (const [, props] of track.mock.calls) {
      for (const value of Object.values((props ?? {}) as Record<string, unknown>)) {
        expect(['string', 'number', 'boolean']).toContain(typeof value)
        if (typeof value === 'string') {
          expect(value).not.toMatch(/:\/\/|\?|SECRET/)
        }
      }
    }
  })

  it('(e) the callback event carries only provider / via / elapsed_ms', async () => {
    await tapAppleButton(vi.fn())
    await untilBrowserOpen()
    await h.listeners.appUrlOpen({ url: DEEP_LINK })
    const [[, props]] = calls('sign_in_fallback_callback')
    expect(Object.keys(props as object).sort()).toEqual(['elapsed_ms', 'provider', 'via'])
    expect(typeof (props as Record<string, unknown>).elapsed_ms).toBe('number')
  })

  it('omits apple_error_code when the native error has no code', async () => {
    authorize.mockRejectedValue(new Error('Something else'))
    await tapAppleButton(vi.fn())
    await untilBrowserOpen()
    expect(calls('sign_in_failed', 'apple_native_unavailable')[0][1]).toEqual({
      reason: 'apple_native_unavailable',
      provider: 'apple',
      path: 'ios_native',
    })
  })
})

describe('id_token_rejected (#1552) — (d)', () => {
  it('sends picked fields and a label, never the message', async () => {
    authorize.mockResolvedValue({ response: { identityToken: 'id.token.value' } })
    // The audience variant echoes the token's claim back in the message.
    const error = Object.assign(new Error('Unacceptable audience in id_token: [secret.client.id]'), {
      name: 'AuthApiError',
      status: 400,
      code: undefined,
      originalError: { body: 'SECRET_BODY' },
    })
    signInWithIdToken.mockResolvedValue({ data: {}, error })
    const onAbort = vi.fn()
    setPlatform('ios')
    render(<SignInButton provider="apple" label="Apple" pending={false} onStart={() => {}} onAbort={onAbort} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apple' }))

    await waitFor(() => expect(onAbort).toHaveBeenCalledTimes(1))
    // Not the fallback: no reason, so no hint.
    expect(onAbort).toHaveBeenCalledWith()
    const [[, props]] = calls('sign_in_failed', 'id_token_rejected')
    expect(props).toEqual({
      reason: 'id_token_rejected',
      provider: 'apple',
      path: 'ios_native',
      error_name: 'AuthApiError',
      error_status: 400,
      error_code: null,
      error_label: 'audience',
    })
    expect(props).not.toHaveProperty('message')
    expect(JSON.stringify(props)).not.toMatch(/secret|SECRET/)
  })

  it.each([
    ['Nonces mismatch', 'nonce_mismatch'],
    ['Unacceptable audience in id_token: [dev.southernlight.futari]', 'audience'],
    ['Bad ID token', 'bad_id_token'],
    ['Passed nonce and nonce in id_token should either both exist or not.', 'nonce_missing'],
    ['Provider (issuer "https://appleid.apple.com") is not enabled', 'other'],
    ['', 'other'],
  ])('classifies GoTrue %j as %s', (message, label) => {
    expect(idTokenErrorLabel(message)).toBe(label)
  })

  it('classifies a non-string as other', () => {
    expect(idTokenErrorLabel(undefined)).toBe('other')
    expect(idTokenErrorLabel({ message: 'Nonces mismatch' })).toBe('other')
  })
})

describe('appleAuthorizationErrorCode (#1552)', () => {
  it('reads the trailing AuthorizationError code', () => {
    expect(appleAuthorizationErrorCode(APPLE_1000)).toBe(1000)
    expect(appleAuthorizationErrorCode(APPLE_1001)).toBe(1001)
  })

  it('returns undefined when there is no code', () => {
    expect(appleAuthorizationErrorCode(new Error('nope'))).toBeUndefined()
    expect(appleAuthorizationErrorCode(undefined)).toBeUndefined()
  })
})
