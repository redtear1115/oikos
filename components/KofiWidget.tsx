'use client'

import Script from 'next/script'
import { useCallback, useEffect, useState } from 'react'

// ============================================================================
// CROSS-SITE FORK POINT — change this constant when copying to another site.
// The `kofi_widget_click` GA event uses `source` to split traffic per product
// in the GA realtime / events report. Each product must own a distinct value:
//
//   - this repo (Futari):     SOURCE = 'futari'
//   - wildcard repo:           SOURCE = 'wildcard'
//   - blog (southern-light):   SOURCE = 'southern-light'   (or 'blog')
//
// If two sites ship the same SOURCE, their traffic blurs together in GA and
// you can't tell which site drove the click. Forgetting to change this line is
// the most common bug — do it FIRST when forking.
//
// ⚠️ iOS App Store gate (#848): Apple Guideline 3.1.1 effectively bans tip-jar
// flows that don't go through Apple IAP. The widget is therefore hidden inside
// the iOS native shell (see the runtime gate in KofiWidget below). The gate
// MUST be runtime, not a build-time env flag: the same prod deployment serves
// the web site plus the Android and iOS Capacitor shells (all load the remote
// server.url), so only `Capacitor.getPlatform()` can tell iOS apart at render
// time. Google Play is lenient for donation-framed widgets, so Android keeps it.
// ============================================================================
const SOURCE = 'futari'

const KOFI_USERNAME = 'ray19841115'

declare global {
  interface Window {
    kofiWidgetOverlay?: {
      draw: (username: string, opts: Record<string, unknown>) => void
    }
    gtag?: (...args: unknown[]) => void
  }
}

// Ko-fi's overlay-widget.js appends its widget to <body>, OUTSIDE React's
// tree — so App Router client navigation never tears it down. Without explicit
// cleanup the floating button leaks across the whole app after the first page
// that mounts <KofiWidget> (#917). These are the top-level elements the script
// injects; removing them fully clears the widget.
const KOFI_INJECTED_SELECTOR =
  '.floatingchat-container-wrap, .floatingchat-container-wrap-mobi, [id^="kofi-popup-iframe"], .kofi-wo-container, .kofi-wo-container-mobi'

/**
 * Capacitor's platform string ('ios' | 'android' | 'web'), read from the global
 * the native webview injects. Returns 'web' off-shell (browser, SSR, jsdom).
 */
function getCapacitorPlatform(): string {
  if (typeof window === 'undefined') return 'web'
  const cap = (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor
  return cap?.getPlatform?.() ?? 'web'
}

/** Remove every Ko-fi-injected top-level element from the document. */
export function teardownKofiWidget(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll(KOFI_INJECTED_SELECTOR).forEach((el) => el.remove())
}

// Ko-fi injects a floating iframe (id starts with `kofi-wo-container`, class
// `floatingchat-container-mobi`) with no `title`, which fails the a11y
// frame-title check (#919). We can't touch Ko-fi's markup, so we label the
// iframe ourselves once it appears.
const KOFI_IFRAME_SELECTOR =
  'iframe[id^="kofi-wo-container"], iframe.floatingchat-container-mobi'

/** Give every Ko-fi-injected iframe an accessible `title` if it lacks one. */
export function titleKofiIframes(title: string): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll<HTMLIFrameElement>(KOFI_IFRAME_SELECTOR).forEach((iframe) => {
    if (!iframe.getAttribute('title')) iframe.setAttribute('title', title)
  })
}

// Below `md` (#1276), the donate button is drawn icon-only — see handleLoad.
// Match Tailwind's `md` breakpoint so it lines up with every other
// mobile/desktop split in the app (e.g. the LandingCtaLink `md:hidden` pair).
const KOFI_MOBILE_MEDIA_QUERY = '(max-width: 767px)'

// Ko-fi's donate button (`.floatingchat-donate-button`) isn't appended to the
// top document — it's written into a same-origin, src-less iframe via a
// synchronous `document.write()` inside `draw()` (verified by reading
// overlay-widget.js: `iframeContainerElement.write(buttonBody); ...close()`).
// A src-less iframe inherits the parent's origin, so `contentDocument` is
// reachable — this is NOT a cross-origin frame, and by the time `draw()`
// returns the button node already exists.
/**
 * Label the icon-only donate button for accessibility once its text is blanked
 * out (#1276). Ko-fi's `<img>` has no `alt`, and the `<span>` carrying the
 * label goes empty, so without this the button has no accessible name.
 */
export function labelKofiDonateButtons(label: string): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll<HTMLIFrameElement>(KOFI_IFRAME_SELECTOR).forEach((iframe) => {
    const button = iframe.contentDocument?.querySelector('.floatingchat-donate-button')
    if (button && !button.hasAttribute('aria-label')) button.setAttribute('aria-label', label)
  })
}

/**
 * Bottom-right floating Ko-fi widget. Click opens a Ko-fi-hosted modal so the
 * donation completes without leaving the site.
 *
 * Scope (#917): the widget lives only where this component is mounted — the
 * public landing and, when signed in, the Settings page. On unmount (e.g.
 * navigating away from /settings) the effect cleanup removes both the injected
 * DOM and the delegated click listener, so it doesn't bleed into the rest of
 * the app or accumulate listeners across visits.
 *
 * On click, fires the cross-product `kofi_widget_click` GA event with
 * `source: SOURCE` so we can split traffic per site in GA reports. The event
 * call is a no-op until `window.gtag` is loaded (PR #896 + Vercel prod env).
 */
export function KofiWidget({
  buttonText,
  frameTitle,
}: {
  buttonText: string
  frameTitle: string
}) {
  // Apple Guideline 3.1.1 (#848): hide the tip jar inside the iOS native shell.
  // Detected via the `Capacitor` global the webview injects (same approach as
  // SignInButton) so the public web bundle doesn't pull in @capacitor/core, and
  // so jsdom tests — where the global is absent — default to showing the widget.
  // Starts false to match SSR (which always renders the <Script>); the effect
  // flips it on the iOS shell after mount, avoiding a hydration mismatch.
  const [isIosNative, setIsIosNative] = useState(false)

  useEffect(() => {
    if (getCapacitorPlatform() === 'ios') {
      setIsIosNative(true)
      teardownKofiWidget()
      return
    }

    // Ko-fi script doesn't expose an onClick hook, so attach a delegated
    // listener on document — captures clicks regardless of when the widget
    // injects its DOM. The button class is `.floatingchat-donate-button` per
    // Ko-fi's overlay-widget.js. Registered on mount (not on script load) so
    // we hold a stable reference to remove on unmount.
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest('.floatingchat-donate-button')) return
      window.gtag?.('event', 'kofi_widget_click', { source: SOURCE })
    }
    document.addEventListener('click', onClick, { passive: true })

    // The iframe is injected asynchronously (after the script loads + draws),
    // so we can't set its `title` inline. Watch <body> for the injection and
    // label it once it lands. Same scope/teardown contract as the rest of the
    // component (#917) — the observer disconnects on unmount.
    titleKofiIframes(frameTitle)
    const observer = new MutationObserver(() => titleKofiIframes(frameTitle))
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick)
      teardownKofiWidget()
    }
  }, [frameTitle])

  const handleLoad = useCallback(() => {
    if (typeof window === 'undefined') return
    // Belt-and-suspenders: if the script resolves before the iOS gate unmounts
    // this component, don't draw the widget on iOS.
    if (getCapacitorPlatform() === 'ios') return
    if (!window.kofiWidgetOverlay) return

    // #1276: on narrow viewports the expanded "Support me" pill sat on top of
    // the landing hero title. Draw icon-only below `md` instead of hiding the
    // text at the CSS layer, because Ko-fi sizes/positions the pill from this
    // config at draw time, not from later layout.
    const isMobileViewport = window.matchMedia(KOFI_MOBILE_MEDIA_QUERY).matches

    window.kofiWidgetOverlay.draw(KOFI_USERNAME, {
      'type': 'floating-chat',
      'floating-chat.donateButton.text': isMobileViewport ? '' : buttonText,
      // --color-warm-base (#FBEDE0) / --ink (#322B23) — keep the lamp warm,
      // not Ko-fi default cobalt which collides with the brand palette.
      'floating-chat.donateButton.background-color': '#FBEDE0',
      'floating-chat.donateButton.text-color': '#322B23',
    })

    // Icon-only button has no accessible name from Ko-fi's own markup (empty
    // span, alt-less <img>) — restore one from the full label we would have shown.
    if (isMobileViewport) labelKofiDonateButtons(buttonText)
  }, [buttonText])

  if (isIosNative) return null

  return (
    <Script
      src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"
      strategy="afterInteractive"
      onLoad={handleLoad}
    />
  )
}
