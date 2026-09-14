import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// captureServer/aliasServer used to `catch {}` outright, so a broken PostHog
// ingestion path produced zero signal anywhere (#973). They must still never
// throw at the caller, but the failure now has to reach Sentry.

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  alias: vi.fn(),
  flush: vi.fn(async () => {}),
  captureException: vi.fn(),
}))

vi.mock('posthog-node', () => ({
  PostHog: class {
    capture = h.capture
    alias = h.alias
    flush = h.flush
  },
}))

vi.mock('@sentry/nextjs', () => ({ captureException: h.captureException }))

// server.ts imports the db client for an unrelated helper; keep it inert.
vi.mock('@/lib/db/client', () => ({ db: {} }))

/** Import fresh so the module-level enablement gate re-reads the stubbed env. */
async function loadModule() {
  vi.resetModules()
  // The gate is the deployment, not NODE_ENV (#1116) — see lib/deployEnv.ts.
  vi.stubEnv('NEXT_PUBLIC_DEPLOY_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test')
  return import('@/lib/analytics/server')
}

beforeEach(() => {
  vi.clearAllMocks()
  h.flush.mockImplementation(async () => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('captureServer', () => {
  it('reports a flush failure to Sentry instead of swallowing it', async () => {
    const { captureServer } = await loadModule()
    h.flush.mockRejectedValueOnce(new Error('ingestion down'))

    await captureServer('user-1', 'signed_in')

    expect(h.captureException).toHaveBeenCalledOnce()
    const [err, ctx] = h.captureException.mock.calls[0]
    expect((err as Error).message).toBe('ingestion down')
    expect(ctx).toMatchObject({ tags: { area: 'analytics', op: 'capture:signed_in' } })
  })

  it('still does not throw at the caller', async () => {
    const { captureServer } = await loadModule()
    h.flush.mockRejectedValueOnce(new Error('ingestion down'))

    await expect(captureServer('user-1', 'signed_in')).resolves.toBeUndefined()
  })

  it('stays quiet when the capture succeeds', async () => {
    const { captureServer } = await loadModule()

    await captureServer('user-1', 'signed_in')

    expect(h.capture).toHaveBeenCalledOnce()
    expect(h.captureException).not.toHaveBeenCalled()
  })
})

describe('aliasServer', () => {
  it('reports a failure to Sentry and does not throw', async () => {
    const { aliasServer } = await loadModule()
    h.flush.mockRejectedValueOnce(new Error('alias failed'))

    await expect(aliasServer('user-1', 'anon-1')).resolves.toBeUndefined()

    expect(h.captureException).toHaveBeenCalledOnce()
    expect(h.captureException.mock.calls[0][1]).toMatchObject({
      tags: { area: 'analytics', op: 'alias' },
    })
  })
})
