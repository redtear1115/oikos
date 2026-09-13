import { describe, it, expect, vi, afterEach } from 'vitest'

// #1116 — the gate that decides whether telemetry reaches the production
// projects. Getting the *unknown* case wrong is what caused the bug this
// module exists to fix, so that case is tested explicitly rather than assumed.

/** Import fresh so the module-level const re-reads the stubbed env. */
async function loadWith(value: string | undefined) {
  vi.resetModules()
  if (value === undefined) {
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_ENV', '')
  } else {
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_ENV', value)
  }
  return import('@/lib/deployEnv')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('DEPLOY_ENV', () => {
  it('reports the production deployment', async () => {
    const { DEPLOY_ENV, IS_PROD_DEPLOY } = await loadWith('production')
    expect(DEPLOY_ENV).toBe('production')
    expect(IS_PROD_DEPLOY).toBe(true)
  })

  it('keeps preview deployments out of the production projects', async () => {
    const { DEPLOY_ENV, IS_PROD_DEPLOY } = await loadWith('preview')
    expect(DEPLOY_ENV).toBe('preview')
    expect(IS_PROD_DEPLOY).toBe(false)
  })

  it('treats an unset value as local, not as production', async () => {
    // A local `next build && next start` is NODE_ENV=production but has no
    // VERCEL_ENV. Defaulting this case to production is precisely how 84 of 85
    // events in the prod Sentry feed ended up being localhost traffic.
    const { DEPLOY_ENV, IS_PROD_DEPLOY } = await loadWith(undefined)
    expect(DEPLOY_ENV).toBe('local')
    expect(IS_PROD_DEPLOY).toBe(false)
  })

  it('treats an unrecognised value as local rather than guessing', async () => {
    const { DEPLOY_ENV, IS_PROD_DEPLOY } = await loadWith('development')
    expect(DEPLOY_ENV).toBe('local')
    expect(IS_PROD_DEPLOY).toBe(false)
  })
})

describe('POSTHOG_ENABLED', () => {
  it('stays off on a production deployment with no key configured', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
    const { POSTHOG_ENABLED } = await import('@/lib/analytics/enabled')
    expect(POSTHOG_ENABLED).toBe(false)
  })

  it('is on only when the deployment is production and a key is present', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test')
    const { POSTHOG_ENABLED } = await import('@/lib/analytics/enabled')
    expect(POSTHOG_ENABLED).toBe(true)
  })

  it('is off on preview even with a key present', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_ENV', 'preview')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test')
    const { POSTHOG_ENABLED } = await import('@/lib/analytics/enabled')
    expect(POSTHOG_ENABLED).toBe(false)
  })
})
