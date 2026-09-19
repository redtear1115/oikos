import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// #1314 — on the iOS shell the Google tap sometimes died on a ChunkLoadError
// for @capacitor/browser, and the only trace was a Sentry *log*. These pin the
// three layers: preload on mount, retry once at tap time, report as an issue.

const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))

const track = vi.fn()
vi.mock('@/lib/analytics/track', () => ({
  track: (...a: unknown[]) => track(...a),
  getAnonId: () => 'anon-1',
}))
vi.mock('@/actions/auth', () => ({ recordNativeAuthConversion: vi.fn() }))

const signInWithOAuth = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth } }),
}))

const browserFactory = vi.fn()
vi.mock('@capacitor/browser', () => {
  browserFactory()
  return { Browser: { addListener: vi.fn(), open: vi.fn(), close: vi.fn() } }
})
const appFactory = vi.fn()
vi.mock('@capacitor/app', () => {
  appFactory()
  return { App: { addListener: vi.fn() } }
})
vi.mock('@capacitor-community/apple-sign-in', () => ({ SignInWithApple: { authorize: vi.fn() } }))

import { importWithRetry } from '@/app/[locale]/sign-in/SignInButton'
import { SignInActions } from '@/app/[locale]/sign-in/SignInActions'

function chunkLoadError(): Error {
  const e = new Error('Loading chunk 9176 failed.\n(error: https://x.test/_next/static/chunks/9176.js)')
  e.name = 'ChunkLoadError'
  return e
}

describe('importWithRetry (#1314)', () => {
  it('retries a ChunkLoadError once and returns the module', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(chunkLoadError())
      .mockResolvedValueOnce({ ok: true })
    await expect(importWithRetry(load)).resolves.toEqual({ ok: true })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('gives up after the second ChunkLoadError', async () => {
    const load = vi.fn().mockRejectedValue(chunkLoadError())
    await expect(importWithRetry(load)).rejects.toMatchObject({ name: 'ChunkLoadError' })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not retry other errors', async () => {
    const load = vi.fn().mockRejectedValue(new TypeError('nope'))
    await expect(importWithRetry(load)).rejects.toThrow('nope')
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('SignInActions in the iOS shell (#1314)', () => {
  // Real `@capacitor/core` gets loaded along the way and rebuilds
  // `window.Capacitor`, detecting the platform from the native bridge — so
  // provide the iOS bridge too, as WKWebView does, or core decides 'web'.
  const w = window as unknown as Record<string, unknown>
  beforeEach(() => {
    vi.clearAllMocks()
    w.webkit = { messageHandlers: { bridge: { postMessage: () => {} } } }
    w.Capacitor = { getPlatform: () => 'ios' }
  })
  afterEach(() => {
    delete w.Capacitor
    delete w.webkit
  })

  function renderActions() {
    render(<SignInActions googleLabel="Google" appleLabel="Apple" pendingLabel="…" />)
  }

  it('fetches the native plugin chunks on mount, before any tap', async () => {
    renderActions()
    await waitFor(() => {
      expect(browserFactory).toHaveBeenCalled()
      expect(appFactory).toHaveBeenCalled()
    })
    expect(signInWithOAuth).not.toHaveBeenCalled()
  })

  it('reports an unexpected failure as a Sentry issue with the query string stripped', async () => {
    signInWithOAuth.mockRejectedValue(
      new Error('fetch failed https://x.supabase.co/auth/v1/authorize?provider=google&state=SECRET'),
    )
    renderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Google' }))

    await waitFor(() => expect(captureException).toHaveBeenCalledTimes(1))
    const [sent, ctx] = captureException.mock.calls[0] as [Error, { tags: Record<string, string> }]
    expect(sent.message).toContain('https://x.supabase.co/auth/v1/authorize')
    expect(sent.message).not.toContain('SECRET')
    expect(sent.stack ?? '').not.toContain('SECRET')
    expect(ctx.tags).toMatchObject({ area: 'auth', op: 'sign_in_unexpected', provider: 'google' })
    expect(track).toHaveBeenCalledWith('sign_in_failed', {
      reason: 'unexpected',
      provider: 'google',
      path: 'ios',
      error_name: 'Error',
    })
    // The curtain came down — the button is usable again.
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})
