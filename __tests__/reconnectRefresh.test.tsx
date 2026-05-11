import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

const refreshSpy = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy }),
}))

import { ReconnectRefresh } from '@/app/(dashboard)/_components/ReconnectRefresh'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

describe('ReconnectRefresh', () => {
  beforeEach(() => {
    refreshSpy.mockClear()
    setOnline(true)
    setVisibility('visible')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-11T00:00:00Z'))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('refreshes when the device comes back online', () => {
    render(<ReconnectRefresh />)
    expect(refreshSpy).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(refreshSpy).toHaveBeenCalledTimes(1)
  })

  it('refreshes when the tab becomes visible after the threshold while online', () => {
    render(<ReconnectRefresh />)

    // First trip across the threshold should refresh.
    vi.setSystemTime(new Date('2026-05-11T00:01:00Z'))
    act(() => {
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refreshSpy).toHaveBeenCalledTimes(1)
  })

  it('does not refresh on visibility change while offline', () => {
    render(<ReconnectRefresh />)
    setOnline(false)

    vi.setSystemTime(new Date('2026-05-11T00:01:00Z'))
    act(() => {
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('debounces rapid visibility refreshes within the threshold', () => {
    render(<ReconnectRefresh />)

    vi.setSystemTime(new Date('2026-05-11T00:01:00Z'))
    act(() => {
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refreshSpy).toHaveBeenCalledTimes(1)

    // 5 seconds later — well under the 30s threshold.
    vi.setSystemTime(new Date('2026-05-11T00:01:05Z'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refreshSpy).toHaveBeenCalledTimes(1)

    // 31s after the first refresh — threshold has elapsed.
    vi.setSystemTime(new Date('2026-05-11T00:01:31Z'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refreshSpy).toHaveBeenCalledTimes(2)
  })

  it('cleans up listeners on unmount', () => {
    const { unmount } = render(<ReconnectRefresh />)
    unmount()

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(refreshSpy).not.toHaveBeenCalled()
  })
})
