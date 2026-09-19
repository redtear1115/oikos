import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// #1315 — on Android the OAuth deep link finishes the Custom Tab, so
// `browserFinished` lands ~10 ms before `appUrlOpen`. Aborting on the spot
// removed the listener that the real callback needed; the flow now waits
// CALLBACK_GRACE_MS (1500 ms) before calling it a cancel.
//
// Shared state lives in `vi.hoisted` so the plugin mocks below can reach it,
// and fake timers only start once the listeners are registered — the mocked
// `import()` inside `importWithRetry` has to resolve on real time first.

const h = vi.hoisted(() => ({
  listeners: {} as Record<string, (payload?: unknown) => unknown>,
  removed: [] as string[],
  closed: 0,
}))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/analytics/track', () => ({ track: vi.fn(), getAnonId: () => 'anon-1' }))
vi.mock('@/actions/auth', () => ({ recordNativeAuthConversion: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithOAuth: async () => ({ data: { url: 'https://idp.test/authorize' } }) },
  }),
}))

const addListener = async (event: string, cb: (payload?: unknown) => unknown) => {
  h.listeners[event] = cb
  return { remove: async () => { h.removed.push(event) } }
}
vi.mock('@capacitor/browser', () => ({
  Browser: { addListener, open: async () => {}, close: async () => { h.closed++ } },
}))
vi.mock('@capacitor/app', () => ({ App: { addListener } }))
vi.mock('@capacitor-community/apple-sign-in', () => ({ SignInWithApple: {} }))

import { SignInButton } from '@/app/[locale]/sign-in/SignInButton'

const w = window as unknown as Record<string, unknown>

async function tapGoogleUntilBrowserOpen(onAbort: () => void) {
  h.listeners = {}
  h.removed = []
  h.closed = 0
  w.Capacitor = { getPlatform: () => 'android' }
  render(<SignInButton provider="google" label="Google" pending={false} onStart={() => {}} onAbort={onAbort} />)
  fireEvent.click(screen.getByRole('button', { name: 'Google' }))
  await vi.waitFor(() => expect(h.listeners.browserFinished).toBeTypeOf('function'))
  // Let `Browser.open` settle on real time before freezing the clock.
  await new Promise((resolve) => setTimeout(resolve, 20))
  vi.useFakeTimers()
}

afterEach(() => {
  delete w.Capacitor
  vi.useRealTimers()
})

describe('Android Custom Tab callback race (#1315)', () => {
  it('follows the deep link when browserFinished arrives first', async () => {
    const onAbort = vi.fn()
    await tapGoogleUntilBrowserOpen(onAbort)

    h.listeners.browserFinished()
    await vi.advanceTimersByTimeAsync(10)
    // The scheme + /auth/callback path is what nativeCallbackUrl accepts.
    await h.listeners.appUrlOpen({ url: 'dev.southernlight.futari://login-callback/auth/callback?code=abc&next=%2Fdashboard' })
    await vi.advanceTimersByTimeAsync(3000)

    // The appUrlOpen handler ran (it closes the in-app browser before
    // navigating), and the delayed abort was absorbed by the `done` guard.
    expect(h.closed).toBe(1)
    expect(onAbort).not.toHaveBeenCalled()
  })

  it('treats browserFinished with no callback as a cancel after the grace period', async () => {
    const onAbort = vi.fn()
    await tapGoogleUntilBrowserOpen(onAbort)

    h.listeners.browserFinished()
    await vi.advanceTimersByTimeAsync(1400)
    expect(onAbort).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(onAbort).toHaveBeenCalledTimes(1)
    expect([...h.removed].sort()).toEqual(['appUrlOpen', 'browserFinished'])
    expect(h.closed).toBe(0)
  })
})
