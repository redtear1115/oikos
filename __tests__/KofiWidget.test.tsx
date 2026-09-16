import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// next/script needs the Next runtime; stub it to a no-op so the component
// renders in jsdom. The widget's real injection comes from Ko-fi's external
// script (unavailable here), which we simulate by hand in the tests below.
// onLoad is captured so tests can invoke it manually (mirrors the real
// `<Script onLoad>` firing once overlay-widget.js has loaded).
let capturedOnLoad: (() => void) | undefined
vi.mock('next/script', () => ({
  default: (props: { onLoad?: () => void }) => {
    capturedOnLoad = props.onLoad
    return null
  },
}))

import {
  KofiWidget,
  teardownKofiWidget,
  titleKofiIframes,
  labelKofiDonateButtons,
  attachKofiClickListeners,
} from '@/components/KofiWidget'

/** jsdom has no real `matchMedia`; stub it to answer a fixed viewport width. */
function stubMatchMedia(matchesNarrow: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matchesNarrow && query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

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

/**
 * Mimic Ko-fi's real DOM shape (#1304): the donate button is NOT a child of
 * the top document — it's written into a same-origin, src-less iframe's
 * `contentDocument` (see the KofiWidget.tsx comment above
 * `attachKofiClickListeners` for the overlay-widget.js source evidence).
 * Wrapped in `.floatingchat-container-wrap` like the real widget, so
 * `teardownKofiWidget()` (matched on that class) actually removes it —
 * exercising the same DOM shape the #917 unmount contract relies on.
 */
function injectFakeKofiIframeWithButton(idSuffix = ''): HTMLIFrameElement {
  const wrap = document.createElement('div')
  wrap.className = 'floatingchat-container-wrap'
  document.body.appendChild(wrap)

  const iframe = document.createElement('iframe')
  iframe.id = `kofi-wo-container${idSuffix}`
  wrap.appendChild(iframe)
  const doc = iframe.contentDocument!
  const button = doc.createElement('div')
  button.className = 'floatingchat-donate-button'
  doc.body.appendChild(button)
  return iframe
}

/**
 * Stand-in for `window.kofiWidgetOverlay.draw()`. Ko-fi's real `write()`
 * replaces the button wrapper's innerHTML wholesale on every call (not just
 * the first) — so a second `draw()` tears down the previous iframe/button and
 * builds a brand-new one. Mimic that by removing any previously-injected
 * iframe before creating a fresh one, so tests can prove a repeated
 * `handleLoad` doesn't leave stale, doubly-bound buttons around.
 */
function simulateKofiDraw(): HTMLIFrameElement {
  document.querySelectorAll('.floatingchat-container-wrap').forEach((el) => el.remove())
  return injectFakeKofiIframeWithButton()
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  delete (window as { Capacitor?: unknown }).Capacitor
  delete (window as { kofiWidgetOverlay?: unknown }).kofiWidgetOverlay
  capturedOnLoad = undefined
  vi.unstubAllGlobals()
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
    const draw = vi.fn(() => simulateKofiDraw())
    ;(window as unknown as { kofiWidgetOverlay: { draw: typeof draw } }).kofiWidgetOverlay = {
      draw,
    }

    render(<KofiWidget buttonText="Support" frameTitle="Ko-fi support window" />)
    // handleLoad bails out on iOS before calling draw() at all (belt-and-
    // suspenders), so even if Ko-fi's DOM somehow appeared, no click listener
    // is ever attached and the donate button stays inert.
    capturedOnLoad?.()
    expect(draw).not.toHaveBeenCalled()

    injectFakeKofiIframeWithButton()
    const iframe = document.querySelector('iframe[id^="kofi-wo-container"]') as HTMLIFrameElement
    const btn = iframe.contentDocument!.querySelector('.floatingchat-donate-button') as HTMLElement
    btn.click()
    expect(gtag).not.toHaveBeenCalled()
  })

  it('still wires up the widget on web / Android (no Capacitor or non-ios)', () => {
    ;(window as unknown as { Capacitor: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => 'android',
    }
    stubMatchMedia(false)
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    const draw = vi.fn(() => simulateKofiDraw())
    ;(window as unknown as { kofiWidgetOverlay: { draw: typeof draw } }).kofiWidgetOverlay = {
      draw,
    }

    render(<KofiWidget buttonText="Support" frameTitle="Ko-fi support window" />)
    capturedOnLoad?.()

    const iframe = document.querySelector('iframe[id^="kofi-wo-container"]') as HTMLIFrameElement
    const btn = iframe.contentDocument!.querySelector('.floatingchat-donate-button') as HTMLElement
    btn.click()
    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith('event', 'kofi_widget_click', { source: 'futari' })
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
    stubMatchMedia(false)
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    const draw = vi.fn(() => simulateKofiDraw())
    ;(window as unknown as { kofiWidgetOverlay: { draw: typeof draw } }).kofiWidgetOverlay = {
      draw,
    }

    const { unmount } = render(<KofiWidget buttonText="Support" frameTitle="Ko-fi support window" />)
    capturedOnLoad?.()
    const iframe = document.querySelector('iframe[id^="kofi-wo-container"]') as HTMLIFrameElement
    const btn = iframe.contentDocument!.querySelector('.floatingchat-donate-button') as HTMLElement

    btn.click()
    expect(gtag).toHaveBeenCalledTimes(1)

    unmount()
    // teardownKofiWidget() (run on unmount) removes the `.floatingchat-
    // container-wrap` div — the iframe (and the button + listener inside it)
    // goes with it, so there is nothing left in the document to click.
    expect(document.querySelector('iframe[id^="kofi-wo-container"]')).toBeNull()

    // A freshly-mounted instance's own draw+attach still works afterwards —
    // this isn't a globally broken WeakSet or module-level lockout from the
    // unmounted instance.
    injectFakeKofiIframeWithButton('-fresh')
    const freshIframe = document.getElementById('kofi-wo-container-fresh') as HTMLIFrameElement
    const freshBtn = freshIframe.contentDocument!.querySelector(
      '.floatingchat-donate-button',
    ) as HTMLElement
    attachKofiClickListeners('futari')
    freshBtn.click()
    expect(gtag).toHaveBeenCalledTimes(2)
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

describe('labelKofiDonateButtons (icon-only a11y, #1276)', () => {
  it('sets aria-label on the donate button written inside the iframe', () => {
    const iframe = injectFakeKofiIframeWithButton()

    labelKofiDonateButtons('請喝杯咖啡')

    const button = iframe.contentDocument!.querySelector('.floatingchat-donate-button')
    expect(button?.getAttribute('aria-label')).toBe('請喝杯咖啡')
  })

  it('does not overwrite an aria-label the button already has', () => {
    const iframe = injectFakeKofiIframeWithButton()
    const button = iframe.contentDocument!.querySelector('.floatingchat-donate-button')!
    button.setAttribute('aria-label', 'existing')

    labelKofiDonateButtons('請喝杯咖啡')

    expect(button.getAttribute('aria-label')).toBe('existing')
  })
})

describe('attachKofiClickListeners (#1304 — GA click fires from inside the iframe)', () => {
  it('fires kofi_widget_click exactly once when the donate button inside the iframe is clicked', () => {
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    const iframe = injectFakeKofiIframeWithButton()

    attachKofiClickListeners('futari')

    const button = iframe.contentDocument!.querySelector('.floatingchat-donate-button') as HTMLElement
    button.click()

    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith('event', 'kofi_widget_click', { source: 'futari' })
  })

  it('does not double-bind when called again on the same still-attached button', () => {
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    const iframe = injectFakeKofiIframeWithButton()

    attachKofiClickListeners('futari')
    attachKofiClickListeners('futari') // e.g. a stray MutationObserver re-entry

    const button = iframe.contentDocument!.querySelector('.floatingchat-donate-button') as HTMLElement
    button.click()

    expect(gtag).toHaveBeenCalledTimes(1)
  })

  it('a click on the top document (outside any iframe) never fires the event', () => {
    // Regression guard for #1304 itself: proves there is no leftover
    // delegated `document` listener resurrecting the old (broken) behavior.
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    // Mount the real component so any document-level listener it registers
    // is live; otherwise this passes even with the old delegated listener.
    render(<KofiWidget buttonText="Support" frameTitle="Ko-fi support window" />)
    injectFakeKofiDom() // old-shape fake: button as a direct child of <body>

    const topLevelButton = document.querySelector('.floatingchat-donate-button') as HTMLElement
    topLevelButton.click()

    expect(gtag).not.toHaveBeenCalled()
  })
})

describe('KofiWidget GA click wiring end-to-end (#1304)', () => {
  it('fires kofi_widget_click when the real draw()-injected button is clicked', () => {
    stubMatchMedia(false)
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    const draw = vi.fn(() => simulateKofiDraw())
    ;(window as unknown as { kofiWidgetOverlay: { draw: typeof draw } }).kofiWidgetOverlay = {
      draw,
    }

    render(<KofiWidget buttonText="Support" frameTitle="Ko-fi support window" />)
    capturedOnLoad?.()

    const iframe = document.querySelector('iframe[id^="kofi-wo-container"]') as HTMLIFrameElement
    const button = iframe.contentDocument!.querySelector('.floatingchat-donate-button') as HTMLElement
    button.click()

    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith('event', 'kofi_widget_click', { source: 'futari' })
  })

  it('handleLoad firing twice (e.g. Script onLoad re-firing) still produces one call per click', () => {
    stubMatchMedia(false)
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    // Mirrors overlay-widget.js's real write(): every draw() replaces the
    // previous button wrapper wholesale with a brand-new iframe/button.
    const draw = vi.fn(() => simulateKofiDraw())
    ;(window as unknown as { kofiWidgetOverlay: { draw: typeof draw } }).kofiWidgetOverlay = {
      draw,
    }

    render(<KofiWidget buttonText="Support" frameTitle="Ko-fi support window" />)
    capturedOnLoad?.()
    capturedOnLoad?.()

    expect(draw).toHaveBeenCalledTimes(2)
    // Only the latest iframe/button should exist and be wired.
    expect(document.querySelectorAll('iframe[id^="kofi-wo-container"]').length).toBe(1)

    const iframe = document.querySelector('iframe[id^="kofi-wo-container"]') as HTMLIFrameElement
    const button = iframe.contentDocument!.querySelector('.floatingchat-donate-button') as HTMLElement
    button.click()

    expect(gtag).toHaveBeenCalledTimes(1)
  })
})

describe('KofiWidget handleLoad — icon-only draw below `md` (#1276)', () => {
  it('draws with empty donateButton.text under a narrow (mobile) viewport', () => {
    stubMatchMedia(true)
    const draw = vi.fn()
    ;(window as unknown as { kofiWidgetOverlay: { draw: typeof draw } }).kofiWidgetOverlay = {
      draw,
    }

    render(<KofiWidget buttonText="請喝杯咖啡" frameTitle="Ko-fi support window" />)
    capturedOnLoad?.()

    expect(draw).toHaveBeenCalledTimes(1)
    const [, opts] = draw.mock.calls[0]
    expect(opts['floating-chat.donateButton.text']).toBe('')
  })

  it('draws with the full buttonText under a wide (desktop) viewport', () => {
    stubMatchMedia(false)
    const draw = vi.fn()
    ;(window as unknown as { kofiWidgetOverlay: { draw: typeof draw } }).kofiWidgetOverlay = {
      draw,
    }

    render(<KofiWidget buttonText="請喝杯咖啡" frameTitle="Ko-fi support window" />)
    capturedOnLoad?.()

    expect(draw).toHaveBeenCalledTimes(1)
    const [, opts] = draw.mock.calls[0]
    expect(opts['floating-chat.donateButton.text']).toBe('請喝杯咖啡')
  })

  it('still skips draw() entirely on iOS, regardless of viewport', () => {
    ;(window as unknown as { Capacitor: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => 'ios',
    }
    stubMatchMedia(true)
    const draw = vi.fn()
    ;(window as unknown as { kofiWidgetOverlay: { draw: typeof draw } }).kofiWidgetOverlay = {
      draw,
    }

    render(<KofiWidget buttonText="請喝杯咖啡" frameTitle="Ko-fi support window" />)
    capturedOnLoad?.()

    expect(draw).not.toHaveBeenCalled()
  })
})
