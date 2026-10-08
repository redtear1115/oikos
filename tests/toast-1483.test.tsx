// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { ToastProvider, useToast } from '@/components/Toast'

function Trigger({ ms }: { ms?: number }) {
  const { showToast } = useToast()
  return <button onClick={() => showToast('hello', ms)}>go</button>
}

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('#1483 shared Toast', () => {
  it('renders the exact markup the Dashboard toast had, then disappears', () => {
    vi.useFakeTimers()
    render(<ToastProvider><Trigger /></ToastProvider>)
    act(() => { screen.getByText('go').click() })
    const el = screen.getByRole('status')
    expect(el.outerHTML).toBe(
      '<div role="status" aria-live="polite" class="fixed left-1/2 top-4 z-top-toast -translate-x-1/2 w-[calc(100%-32px)] max-w-[calc(28rem-32px)] px-4 py-3 rounded-bubble text-sm text-white text-center" style="background: var(--ink);">hello</div>',
    )
    act(() => { vi.advanceTimersByTime(2499) })
    expect(screen.queryByRole('status')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(2) })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('honours a custom duration', () => {
    vi.useFakeTimers()
    render(<ToastProvider><Trigger ms={1500} /></ToastProvider>)
    act(() => { screen.getByText('go').click() })
    act(() => { vi.advanceTimersByTime(1501) })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
