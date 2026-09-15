import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  OFFLINE_ANNOUNCE_DELAY_MS,
  useDelayedOnlineStatus,
} from '@/lib/hooks/useOnlineStatus'

/**
 * #1244 — a Wi-Fi → cellular handover fires `offline` and `online` about a
 * second apart, and the dashboard's disconnect band flashed once on every one
 * of them. The band now waits the drop out.
 *
 * What is asserted here is the asymmetry, which is the whole point: the
 * offline edge is delayed, the online edge is not.
 */

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

function fire(event: 'online' | 'offline') {
  setOnLine(event === 'online')
  act(() => {
    window.dispatchEvent(new Event(event))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  setOnLine(true)
})

afterEach(() => {
  vi.useRealTimers()
  setOnLine(true)
})

describe('useDelayedOnlineStatus', () => {
  it('reports online before anything happens', () => {
    const { result } = renderHook(() => useDelayedOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('swallows a drop shorter than the delay', () => {
    const { result } = renderHook(() => useDelayedOnlineStatus())

    fire('offline')
    act(() => { vi.advanceTimersByTime(OFFLINE_ANNOUNCE_DELAY_MS - 1) })
    expect(result.current).toBe(true)  // nothing announced yet

    fire('online')
    act(() => { vi.advanceTimersByTime(OFFLINE_ANNOUNCE_DELAY_MS * 2) })
    // The pending announcement was cancelled, not merely postponed — this is
    // the flash the issue is about.
    expect(result.current).toBe(true)
  })

  it('reports a drop that outlasts the delay', () => {
    const { result } = renderHook(() => useDelayedOnlineStatus())

    fire('offline')
    act(() => { vi.advanceTimersByTime(OFFLINE_ANNOUNCE_DELAY_MS) })
    expect(result.current).toBe(false)
  })

  it('reports the recovery immediately, with no delay on the way back', () => {
    const { result } = renderHook(() => useDelayedOnlineStatus())

    fire('offline')
    act(() => { vi.advanceTimersByTime(OFFLINE_ANNOUNCE_DELAY_MS) })
    expect(result.current).toBe(false)

    fire('online')
    expect(result.current).toBe(true)  // same tick, no timer advanced
  })

  it('does not fire a stale announcement after unmount', () => {
    const { result, unmount } = renderHook(() => useDelayedOnlineStatus())

    fire('offline')
    unmount()
    // Would warn / update a dead hook if the timer outlived the component.
    act(() => { vi.advanceTimersByTime(OFFLINE_ANNOUNCE_DELAY_MS * 2) })
    expect(result.current).toBe(true)
  })

  it('honours a caller-supplied delay', () => {
    const { result } = renderHook(() => useDelayedOnlineStatus(5000))

    fire('offline')
    act(() => { vi.advanceTimersByTime(OFFLINE_ANNOUNCE_DELAY_MS) })
    expect(result.current).toBe(true)

    act(() => { vi.advanceTimersByTime(5000 - OFFLINE_ANNOUNCE_DELAY_MS) })
    expect(result.current).toBe(false)
  })
})
