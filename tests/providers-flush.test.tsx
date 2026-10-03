import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// Regression for #1014: `flushQueue()` must run even when `detectPlatform()`
// returns null — the pre-existing `if (!platform) return` early-return would
// otherwise skip the flush entirely on any page load where platform detection
// comes back empty (e.g. SSR-adjacent edge cases, or a genuinely undetectable
// UA). Mock `posthog-js` so `init()` is a harmless no-op and we can assert on
// `register`/`init` call order instead of hitting the real network.
const h = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
  capture: vi.fn(),
}))

vi.mock('posthog-js', () => ({
  default: { init: h.init, register: h.register, capture: h.capture },
}))

vi.mock('@/lib/platform', () => ({
  detectPlatform: vi.fn(() => null),
  isNativeApp: vi.fn(() => false),
}))

describe('PostHogProvider flush ordering (#1014)', () => {
  beforeEach(() => {
    vi.resetModules()
    h.init.mockClear()
    h.register.mockClear()
    h.capture.mockClear()
    // The gate is the deployment, not NODE_ENV (#1116) — see lib/deployEnv.ts.
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'test-key')
  })

  it('still flushes the queue when detectPlatform() returns null', async () => {
    const { track } = await import('@/lib/analytics/track')
    // Queue an event the way a child's on-mount effect would, before the
    // provider's own effect has run.
    track('queued_before_init')

    const { PostHogProvider } = await import('@/app/providers')
    render(<PostHogProvider>{null}</PostHogProvider>)

    // posthog-js is a dynamic import now (#1520), so init lands a tick later.
    await waitFor(() => expect(h.init).toHaveBeenCalledTimes(1))
    // detectPlatform() is null, so register() must NOT have been called...
    expect(h.register).not.toHaveBeenCalled()
    // ...but the queued event must still have been flushed regardless.
    expect(h.capture).toHaveBeenCalledWith('queued_before_init', undefined)
  })
})
