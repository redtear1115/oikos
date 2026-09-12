import { describe, it, expect, vi, beforeEach } from 'vitest'

// `track()` / `flushQueue()` gate on `POSTHOG_ENABLED`, which is a build-time
// const in `app/providers.tsx` (`NODE_ENV === 'production' && ...`). Vitest
// runs with `NODE_ENV=test`, so mock the provider module directly rather than
// juggling `vi.stubEnv` + `vi.resetModules` — this also sidesteps pulling in
// `posthog-js/react` and `lib/platform` just to read one boolean.
const h = vi.hoisted(() => ({
  capture: vi.fn(),
}))

vi.mock('posthog-js', () => ({
  default: { capture: h.capture },
}))

vi.mock('@/app/providers', () => ({
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
    flushQueue()

    expect(h.capture).toHaveBeenNthCalledWith(1, 'event_a', { x: 1 })
    expect(h.capture).toHaveBeenNthCalledWith(2, 'event_b', { y: 2 })
    expect(h.capture).toHaveBeenCalledTimes(2)
  })

  it('sends events fired after flushQueue() immediately, without re-sending old ones', async () => {
    const { track, flushQueue } = await import('@/lib/analytics/track')

    track('before_flush')
    flushQueue()
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
    flushQueue()

    expect(h.capture).toHaveBeenCalledTimes(50)
    // Oldest 5 (event_0..event_4) were dropped; the first flushed call should
    // be event_5.
    expect(h.capture).toHaveBeenNthCalledWith(1, 'event_5', undefined)
    expect(h.capture).toHaveBeenNthCalledWith(50, 'event_54', undefined)
  })

  it('flushQueue() is idempotent — calling it again does not re-send', async () => {
    const { track, flushQueue } = await import('@/lib/analytics/track')

    track('event_a')
    flushQueue()
    expect(h.capture).toHaveBeenCalledTimes(1)

    flushQueue()
    flushQueue()
    expect(h.capture).toHaveBeenCalledTimes(1)
  })
})
