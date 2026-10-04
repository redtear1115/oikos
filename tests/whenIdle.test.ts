import { describe, it, expect, vi, afterEach } from 'vitest'
import { whenIdle } from '@/lib/whenIdle'

describe('whenIdle() first-interaction pull-forward (#1520)', () => {
  afterEach(() => vi.useRealTimers())

  it('runs once on the first pointerdown, before load + idle would have', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    whenIdle(cb)
    expect(cb).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('keydown'))
    expect(cb).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('still runs on the idle path when nobody interacts', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    whenIdle(cb)
    vi.advanceTimersByTime(1000 + 200)
    expect(cb).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('keydown'))
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
