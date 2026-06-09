import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// next/script needs the Next runtime; stub it to a no-op so the component
// renders in jsdom. The widget's real injection comes from Ko-fi's external
// script (unavailable here), which we simulate by hand in the tests below.
vi.mock('next/script', () => ({ default: () => null }))

import { KofiWidget, teardownKofiWidget, titleKofiIframes } from '@/components/KofiWidget'

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

  // The floating iframe Ko-fi injects with no `title` attribute (#919).
  const iframe = document.createElement('iframe')
  iframe.id = 'kofi-wo-container-mobi-xyz'
  iframe.className = 'floatingchat-container-mobi'
  document.body.appendChild(iframe)
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
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

describe('KofiWidget unmount (leaving /settings)', () => {
  it('removes the injected widget DOM when the component unmounts', () => {
    const { unmount } = render(<KofiWidget buttonText="Support" frameTitle="Ko-fi support window" />)
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

    const { unmount } = render(<KofiWidget buttonText="Support" frameTitle="Ko-fi support window" />)
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

describe('titleKofiIframes (frame-title a11y, #919)', () => {
  it('labels Ko-fi iframes that have no title and leaves existing titles alone', () => {
    injectFakeKofiDom()
    const labelled = document.createElement('iframe')
    labelled.id = 'kofi-wo-container-pre'
    labelled.setAttribute('title', 'Already labelled')
    document.body.appendChild(labelled)

    titleKofiIframes('Ko-fi support window')

    const injected = document.querySelector(
      'iframe.floatingchat-container-mobi',
    ) as HTMLIFrameElement
    expect(injected.getAttribute('title')).toBe('Ko-fi support window')
    // pre-existing title is preserved
    expect(labelled.getAttribute('title')).toBe('Already labelled')
  })
})

describe('KofiWidget frame-title (async iframe injection)', () => {
  it('titles the iframe once Ko-fi injects it after mount', async () => {
    render(<KofiWidget buttonText="Support" frameTitle="Ko-fi support window" />)
    // Ko-fi draws the widget (incl. the iframe) only after its script loads.
    injectFakeKofiDom()

    // The MutationObserver fires on a microtask; wait a tick for it to run.
    await new Promise((resolve) => setTimeout(resolve, 0))

    const iframe = document.querySelector(
      'iframe.floatingchat-container-mobi',
    ) as HTMLIFrameElement
    expect(iframe.getAttribute('title')).toBe('Ko-fi support window')
  })
})
