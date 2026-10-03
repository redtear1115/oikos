import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

// #1525: the Ko-fi script (and the Google Fonts / CSS it drags in) must not be
// requested until the hero has scrolled out of the top of the viewport.
let scriptMounts = 0
vi.mock('next/script', () => ({
  default: () => {
    scriptMounts += 1
    return <i data-testid="kofi-script" />
  },
}))

import { KofiWidget } from '@/components/KofiWidget'

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void
let ioCallback: IOCallback | undefined
const disconnect = vi.fn()

beforeEach(() => {
  scriptMounts = 0
  ioCallback = undefined
  disconnect.mockClear()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IOCallback) {
        ioCallback = cb
      }
      observe() {}
      disconnect = disconnect
    },
  )
  const hero = document.createElement('section')
  hero.id = 'hero'
  document.body.appendChild(hero)
})

afterEach(() => {
  cleanup()
  document.getElementById('hero')?.remove()
  document.documentElement.removeAttribute('data-kofi-hero')
  delete (window as { Capacitor?: unknown }).Capacitor
  vi.unstubAllGlobals()
})

const mount = () => render(<KofiWidget revealAfterId="hero" buttonText="Support" frameTitle="Ko-fi" />)
const fire = (isIntersecting: boolean, top: number) =>
  act(() => ioCallback!([{ isIntersecting, boundingClientRect: { top } as DOMRectReadOnly }]))

describe('KofiWidget reveal-after-hero (#1525)', () => {
  it('does not render the Ko-fi script while the hero is in view or not yet reached', () => {
    const { queryByTestId } = mount()
    expect(queryByTestId('kofi-script')).toBeNull()
    fire(true, 0)
    expect(queryByTestId('kofi-script')).toBeNull()
    // below the viewport (not scrolled past): still no script
    fire(false, 900)
    expect(queryByTestId('kofi-script')).toBeNull()
    expect(scriptMounts).toBe(0)
  })

  it('renders the script once the hero has scrolled out of the top, and keeps it on scroll back', () => {
    const { queryByTestId } = mount()
    fire(false, -120)
    expect(queryByTestId('kofi-script')).not.toBeNull()
    expect(document.documentElement.hasAttribute('data-kofi-hero')).toBe(false)
    // Scrolling back up: stays loaded, the pill is only hidden via the attribute.
    fire(true, 0)
    expect(queryByTestId('kofi-script')).not.toBeNull()
    expect(document.documentElement.hasAttribute('data-kofi-hero')).toBe(true)
  })

  it('loads immediately when there is no hero element (never leaves the donate button unreachable)', () => {
    document.getElementById('hero')!.remove()
    const { queryByTestId } = mount()
    expect(queryByTestId('kofi-script')).not.toBeNull()
  })

  it('never arms inside the iOS shell, even after the hero is scrolled past (Apple 3.1.1)', () => {
    ;(window as unknown as { Capacitor: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => 'ios',
    }
    const { queryByTestId } = mount()
    expect(ioCallback).toBeUndefined()
    expect(queryByTestId('kofi-script')).toBeNull()
    expect(scriptMounts).toBe(0)
  })

  it('without revealAfterId it still loads right away (old behaviour)', () => {
    const { queryByTestId } = render(<KofiWidget buttonText="Support" frameTitle="Ko-fi" />)
    expect(queryByTestId('kofi-script')).not.toBeNull()
  })

  it('removes its style and attribute on unmount', () => {
    const { unmount } = mount()
    expect(document.getElementById('futari-kofi-style')).not.toBeNull()
    unmount()
    expect(document.getElementById('futari-kofi-style')).toBeNull()
    expect(disconnect).toHaveBeenCalled()
  })
})
