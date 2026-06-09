import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// next/script needs the Next runtime; stub it to a no-op so the component
// renders in jsdom. The widget's real injection comes from Ko-fi's external
// script (unavailable here), which we simulate by hand in the tests below.
vi.mock('next/script', () => ({ default: () => null }))

import { KofiWidget, teardownKofiWidget } from '@/components/KofiWidget'

/** Mimic the top-level DOM Ko-fi's overlay-widget.js appends to <body>. */
function injectFakeKofiDom() {
  const wrap = document.createElement('div')
  wrap.className = 'floatingchat-container-wrap'
  wrap.innerHTML = '<button class="floatingchat-donate-button">Support</button>'
  document.body.appendChild(wrap)

  const popup = document.createElement('div')
  popup.id = 'kofi-popup-iframe-container'
  document.body.appendChild(popup)

  const wo = document.createElement('div')
  wo.className = 'kofi-wo-container'
  document.body.appendChild(wo)
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  delete (window as { Capacitor?: unknown }).Capacitor
})

describe('teardownKofiWidget', () => {
  it('removes every Ko-fi-injected top-level element', () => {
    injectFakeKofiDom()
    const keep = document.createElement('div')
    keep.id = 'app-content'
    document.body.appendChild(keep)

    teardownKofiWidget()

    expect(document.querySelector('.floatingchat-container-wrap')).toBeNull()
    expect(document.querySelector('#kofi-popup-iframe-container')).toBeNull()
    expect(document.querySelector('.kofi-wo-container')).toBeNull()
    // unrelated app DOM is untouched
    expect(document.querySelector('#app-content')).not.toBeNull()
  })
})

describe('iOS App Store gate (#848, Apple Guideline 3.1.1)', () => {
  it('does not wire up the tip jar inside the iOS native shell', () => {
    // Simulate the Capacitor global the iOS webview injects.
    ;(window as unknown as { Capacitor: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => 'ios',
    }
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag

    render(<KofiWidget buttonText="Support" />)
    // Even if Ko-fi's DOM somehow appeared, no click listener is attached on
    // iOS, so the donate button is inert and the widget stays hidden.
    injectFakeKofiDom()
    const btn = document.querySelector('.floatingchat-donate-button') as HTMLElement
    btn.click()
    expect(gtag).not.toHaveBeenCalled()
  })

  it('still wires up the widget on web / Android (no Capacitor or non-ios)', () => {
    ;(window as unknown as { Capacitor: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => 'android',
    }
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag

    render(<KofiWidget buttonText="Support" />)
    injectFakeKofiDom()
    const btn = document.querySelector('.floatingchat-donate-button') as HTMLElement
    btn.click()
    expect(gtag).toHaveBeenCalledTimes(1)
  })
})

describe('KofiWidget unmount (leaving /settings)', () => {
  it('removes the injected widget DOM when the component unmounts', () => {
    const { unmount } = render(<KofiWidget buttonText="Support" />)
    // Simulate Ko-fi having drawn its widget after the script loaded.
    injectFakeKofiDom()
    expect(document.querySelector('.floatingchat-container-wrap')).not.toBeNull()

    unmount()

    expect(document.querySelector('.floatingchat-container-wrap')).toBeNull()
    expect(document.querySelector('#kofi-popup-iframe-container')).toBeNull()
  })

  it('stops firing kofi_widget_click after unmount (no listener leak)', () => {
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag

    const { unmount } = render(<KofiWidget buttonText="Support" />)
    injectFakeKofiDom()
    const btn = document.querySelector('.floatingchat-donate-button') as HTMLElement

    btn.click()
    expect(gtag).toHaveBeenCalledTimes(1)

    unmount()
    // Re-inject a button (as a fresh page would) and click — the old listener
    // must be gone, so no further events fire from this unmounted instance.
    injectFakeKofiDom()
    const btn2 = document.querySelector('.floatingchat-donate-button') as HTMLElement
    btn2.click()
    expect(gtag).toHaveBeenCalledTimes(1)
  })
})
