import { describe, it, expect, vi, beforeEach } from 'vitest'

// `track()` / `flushQueue()` gate on `POSTHOG_ENABLED`, a build-time const in
// `lib/analytics/enabled.ts` (production *deployment* + key — #1116). Vitest
// runs off Vercel, so mock that leaf module directly rather than juggling
// `vi.stubEnv` + `vi.resetModules` — this also sidesteps pulling in
// `posthog-js/react` and `lib/platform` just to read one boolean.
const h = vi.hoisted(() => ({
  capture: vi.fn(),
}))

// posthog-js is no longer imported by track.ts (#1520): the provider hands the
// loaded instance to flushQueue(), so the test does the same.
const ph = { capture: h.capture, get_distinct_id: () => 'anon-1' }

vi.mock('@/lib/analytics/enabled', () => ({
  POSTHOG_ENABLED: true,
}))

describe('track() pre-init queue (#1014)', () => {
  beforeEach(async () => {
    vi.resetModules()
    h.capture.mockClear()
  })

  it('queues events fired before flushQueue() and does not send them', async () => {
    const { track } = await import('@/lib/analytics/track')

    track('event_a', { x: 1 })
    track('event_b')

    expect(h.capture).not.toHaveBeenCalled()
  })

  it('sends queued events in original order once flushQueue() is called', async () => {
    const { track, flushQueue } = await import('@/lib/analytics/track')

    track('event_a', { x: 1 })
    track('event_b', { y: 2 })
    flushQueue(ph as never)

    expect(h.capture).toHaveBeenNthCalledWith(1, 'event_a', expect.objectContaining({ x: 1 }))
    expect(h.capture).toHaveBeenNthCalledWith(2, 'event_b', expect.objectContaining({ y: 2 }))
    expect(h.capture).toHaveBeenCalledTimes(2)
  })

  it('stamps queued events with the page they happened on, not the page they flush on (#1520)', async () => {
    const { track, flushQueue } = await import('@/lib/analytics/track')

    window.history.pushState({}, '', '/zh-TW?utm_source=x')
    track('landing_cta_clicked')
    track('$pageview', { $current_url: 'https://example.test/zh-TW' })
    window.history.pushState({}, '', '/zh-TW/sign-in')
    flushQueue(ph as never)

    expect(h.capture).toHaveBeenNthCalledWith(
      1,
      'landing_cta_clicked',
      expect.objectContaining({
        $pathname: '/zh-TW',
        $host: window.location.host,
        $current_url: `${window.location.origin}/zh-TW?utm_source=x`,
        $referrer: '$direct',
      }),
    )
    // Caller-supplied properties win over the captured location.
    expect(h.capture.mock.calls[1][1]).toMatchObject({
      $current_url: 'https://example.test/zh-TW',
      $pathname: '/zh-TW',
    })
  })

  it('does not stamp events sent live after init', async () => {
    const { track, flushQueue } = await import('@/lib/analytics/track')
    flushQueue(ph as never)
    track('live', { a: 1 })
    expect(h.capture).toHaveBeenCalledWith('live', { a: 1 })
  })

  it('sends events fired after flushQueue() immediately, without re-sending old ones', async () => {
    const { track, flushQueue } = await import('@/lib/analytics/track')

    track('before_flush')
    flushQueue(ph as never)
    expect(h.capture).toHaveBeenCalledTimes(1)

    track('after_flush')
    expect(h.capture).toHaveBeenCalledTimes(2)
    expect(h.capture).toHaveBeenNthCalledWith(2, 'after_flush', undefined)
  })

  it('caps the queue at 50 entries, dropping the oldest first', async () => {
    const { track, flushQueue } = await import('@/lib/analytics/track')

    for (let i = 0; i < 55; i++) {
      track(`event_${i}`)
    }
    flushQueue(ph as never)

    expect(h.capture).toHaveBeenCalledTimes(50)
    // Oldest 5 (event_0..event_4) were dropped; the first flushed call should
    // be event_5.
    expect(h.capture).toHaveBeenNthCalledWith(1, 'event_5', expect.any(Object))
    expect(h.capture).toHaveBeenNthCalledWith(50, 'event_54', expect.any(Object))
  })

  it('flushQueue() is idempotent — calling it again does not re-send', async () => {
    const { track, flushQueue } = await import('@/lib/analytics/track')

    track('event_a')
    flushQueue(ph as never)
    expect(h.capture).toHaveBeenCalledTimes(1)

    flushQueue(ph as never)
    flushQueue(ph as never)
    expect(h.capture).toHaveBeenCalledTimes(1)
  })
})

describe('analyticsReady() / getAnonId() with lazy PostHog (#1520)', () => {
  beforeEach(() => {
    vi.resetModules()
    h.capture.mockClear()
  })

  it('asks the provider to start loading and resolves once flushQueue() runs', async () => {
    const { analyticsReady, registerAnalyticsInit, flushQueue, getAnonId } = await import('@/lib/analytics/track')
    const start = vi.fn()
    registerAnalyticsInit(start)

    expect(getAnonId()).toBeUndefined()
    const ready = analyticsReady(5000)
    expect(start).toHaveBeenCalledTimes(1)
    flushQueue(ph as never)
    await ready
    expect(getAnonId()).toBe('anon-1')
  })

  it('gives up after the timeout rather than blocking the tap', async () => {
    const { analyticsReady } = await import('@/lib/analytics/track')
    await expect(analyticsReady(10)).resolves.toBeUndefined()
  })
})
