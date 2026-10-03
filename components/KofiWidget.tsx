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
export const SOURCE = 'futari'

export const KOFI_USERNAME = 'ray19841115'

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
export function getCapacitorPlatform(): string {
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

// #1304: a same-origin iframe's click does NOT bubble to the top document
// (verified by reading overlay-widget.js's `write()` — it always builds BOTH
// a desktop and a mobile donate button, each inside its own iframe; neither
// is ever attached to the top document). A delegated `document` click
// listener therefore can never see this click — that was the bug: GA's
// `kofi_widget_click` sat flat at 0 with no error anywhere, because nothing
// throws, the listener is just never invoked. Fix: attach the listener
// directly inside each iframe, on the button node itself.
//
// `write()` also rebuilds the iframe wrapper's innerHTML wholesale on every
// `draw()` call (not just the first), so a second `draw()` (e.g. Script's
// onLoad firing twice) produces brand-new, unbound button elements — the old
// ones are detached from the DOM and their listeners go with them. This set
// only needs to guard against calling this function more than once for the
// SAME still-attached button (e.g. a stray MutationObserver re-entry); it
// can't cause a double-fire across a real re-draw because the button that
// exists after a re-draw is never the same object this set has already seen.
const clickBoundDonateButtons = new WeakSet<Element>()

/**
 * Wire the `kofi_widget_click` GA event onto every Ko-fi-injected donate
 * button (desktop + mobile), reaching inside their iframes directly since a
 * top-document listener can never see these clicks (see comment above).
 */
export function attachKofiClickListeners(source: string): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll<HTMLIFrameElement>(KOFI_IFRAME_SELECTOR).forEach((iframe) => {
    const button = iframe.contentDocument?.querySelector('.floatingchat-donate-button')
    if (!button || clickBoundDonateButtons.has(button)) return
    clickBoundDonateButtons.add(button)
    button.addEventListener('click', () => {
      window.gtag?.('event', 'kofi_widget_click', { source })
    })
  })
}

// #1525 placement (brand pages only, i.e. when `revealAfterId` is passed).
// Ko-fi positions its own wrapper `position: fixed; left: 16px; bottom: 16px`,
// and the landing's content gutter is 64px (80px at 1440). A 167px "Support me"
// pill therefore sat on the section headings and feature rows (failure looks
// like: the pill covers "01 雙人記帳" or an H2 at 1440x900). We draw
// icon-only at every width, trim the pill's padding, and from `md` up pull it
// to left: 8px so it ends at ~63px, inside the gutter. Below `md` the gutter is 24px and a fixed
// button always crosses scrolling content briefly; that is the same trade-off
// as any floating action button.
const KOFI_STYLE_ID = 'futari-kofi-style'
const KOFI_HERO_ATTR = 'data-kofi-hero'
const KOFI_BRAND_CSS = [
  // Hidden while the hero is in view, so the pill never sits on hero copy when
  // the visitor scrolls back up. `visibility` also drops pointer events.
  `html[${KOFI_HERO_ATTR}] .floatingchat-container-wrap,html[${KOFI_HERO_ATTR}] .floatingchat-container-wrap-mobi{visibility:hidden}`,
  '@media (min-width:768px){.floatingchat-container-wrap,.floatingchat-container-wrap-mobi{left:8px!important}}',
  // Ko-fi animates its wrappers (transition: all .6s); no entrance motion for
  // people who ask for none. The in-iframe button gets the same in handleLoad.
  '@media (prefers-reduced-motion:reduce){.floatingchat-container-wrap,.floatingchat-container-wrap *,.floatingchat-container-wrap-mobi,.floatingchat-container-wrap-mobi *{transition:none!important;animation:none!important}}',
].join('')
const KOFI_IFRAME_COMPACT_CSS =
  '.floatingchat-donate-button{padding:0 4px!important}' +
  '@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}'

function installKofiBrandStyle(): () => void {
  if (document.getElementById(KOFI_STYLE_ID)) return () => {}
  const style = document.createElement('style')
  style.id = KOFI_STYLE_ID
  style.textContent = KOFI_BRAND_CSS
  document.head.appendChild(style)
  return () => {
    style.remove()
    document.documentElement.removeAttribute(KOFI_HERO_ATTR)
  }
}

/** Trim the icon-only donate button's padding inside every Ko-fi iframe. */
function compactKofiDonateButtons(): void {
  document.querySelectorAll<HTMLIFrameElement>(KOFI_IFRAME_SELECTOR).forEach((iframe) => {
    const doc = iframe.contentDocument
    if (!doc || doc.getElementById(KOFI_STYLE_ID)) return
    const style = doc.createElement('style')
    style.id = KOFI_STYLE_ID
    style.textContent = KOFI_IFRAME_COMPACT_CSS
    doc.head.appendChild(style)
  })
}

/**
 * Bottom-right floating Ko-fi widget. Click opens a Ko-fi-hosted modal so the
 * donation completes without leaving the site.
 *
 * Scope (#917): the widget lives only where this component is mounted — the
 * public landing only (Settings uses a plain link row instead, #1516). On
 * unmount (e.g. client navigation away from the landing) the effect cleanup removes the injected DOM
 * (iframes included, so any click listener bound inside them goes with it),
 * so it doesn't bleed into the rest of the app or accumulate listeners across
 * visits.
 *
 * On click, fires the cross-product `kofi_widget_click` GA event with
 * `source: SOURCE` so we can split traffic per site in GA reports. The event
 * call is a no-op until `window.gtag` is loaded (PR #896 + Vercel prod env).
 * The listener is wired inside Ko-fi's iframe, not on the top document — see
 * `attachKofiClickListeners` (#1304).
 */
export function KofiWidget({
  buttonText,
  frameTitle,
  revealAfterId,
}: {
  buttonText: string
  frameTitle: string
  /**
   * #1525: id of the hero element. When set, nothing Ko-fi (script, its Google
   * Fonts CSS, its own CSS) is requested until that element has scrolled out of
   * the top of the viewport; omitted → load right away (the old behaviour).
   * Failure looks like: the donate pill sitting on the hero copy at first
   * paint, and Ko-fi's requests competing with LCP. Visitors who never scroll
   * never load Ko-fi — accepted by the owner.
   */
  revealAfterId?: string
}) {
  // Apple Guideline 3.1.1 (#848): hide the tip jar inside the iOS native shell.
  // Detected via the `Capacitor` global the webview injects (same approach as
  // SignInButton) so the public web bundle doesn't pull in @capacitor/core, and
  // so jsdom tests — where the global is absent — default to showing the widget.
  // Starts false to match SSR (which always renders the <Script>); the effect
  // flips it on the iOS shell after mount, avoiding a hydration mismatch.
  const [isIosNative, setIsIosNative] = useState(false)
  // #1525: SSR and first client render never include the <Script> when
  // `revealAfterId` is set; once armed it stays armed (never un-loaded).
  const [armed, setArmed] = useState(!revealAfterId)

  useEffect(() => {
    if (!revealAfterId) return
    // Never arm inside the iOS shell (Apple 3.1.1): the Ko-fi script must not
    // even be requested there, not merely hidden.
    if (getCapacitorPlatform() === 'ios') return
    const hero = document.getElementById(revealAfterId)
    // No hero element or no IntersectionObserver: fall back to always-available
    // rather than a donate button that can never appear.
    if (!hero || typeof IntersectionObserver === 'undefined') {
      setArmed(true)
      return
    }
    const removeStyle = installKofiBrandStyle()
    const root = document.documentElement
    // IntersectionObserver, not a scroll listener: no main-thread work per
    // scroll. `top < 0` distinguishes "scrolled past" from "not yet reached".
    // Armed is one-way (once loaded it stays loaded); the attribute follows
    // the hero so the pill is only hidden while the hero is on screen.
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1]
      const past = !e.isIntersecting && e.boundingClientRect.top < 0
      if (past) {
        setArmed(true)
        root.removeAttribute(KOFI_HERO_ATTR)
      } else {
        root.setAttribute(KOFI_HERO_ATTR, '')
      }
    })
    io.observe(hero)
    return () => {
      io.disconnect()
      removeStyle()
    }
  }, [revealAfterId])

  useEffect(() => {
    if (getCapacitorPlatform() === 'ios') {
      setIsIosNative(true)
      teardownKofiWidget()
      return
    }

    // #1304: no delegated listener on `document` here. Ko-fi's donate button
    // always lives inside a same-origin, src-less iframe (verified by reading
    // overlay-widget.js — see the comment above `attachKofiClickListeners`),
    // and an iframe's click never bubbles to the top document, so a listener
    // registered here could never fire. The GA click listener is instead
    // attached directly inside the iframe, from `handleLoad` right after
    // `draw()` (where the button node is guaranteed to already exist).

    // The iframe is injected asynchronously (after the script loads + draws),
    // so we can't set its `title` inline. Watch <body> for the injection and
    // label it once it lands. Same scope/teardown contract as the rest of the
    // component (#917) — the observer disconnects on unmount.
    titleKofiIframes(frameTitle)
    const observer = new MutationObserver(() => titleKofiIframes(frameTitle))
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      // No iframe click listener to remove here: teardownKofiWidget() below
      // removes the wrapper divs that contain Ko-fi's iframes (#917 scope),
      // which detaches the iframes (and their contentDocument, and whatever
      // listeners attachKofiClickListeners bound inside them) from the DOM
      // entirely — nothing is left to keep firing after unmount.
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
    // #1525: brand-page placement is icon-only at every width (see above).
    const iconOnly = isMobileViewport || !!revealAfterId

    window.kofiWidgetOverlay.draw(KOFI_USERNAME, {
      'type': 'floating-chat',
      'floating-chat.donateButton.text': iconOnly ? '' : buttonText,
      // --color-warm-base (#FBEDE0) / --ink (#322B23) — keep the lamp warm,
      // not Ko-fi default cobalt which collides with the brand palette.
      'floating-chat.donateButton.background-color': '#FBEDE0',
      'floating-chat.donateButton.text-color': '#322B23',
    })

    // #1304: wire the GA click listener now — by the time draw() returns,
    // the donate button already exists inside its iframe (both the desktop
    // and mobile copies `draw()` builds, regardless of `isMobileViewport`;
    // CSS is what decides which one is visible).
    attachKofiClickListeners(SOURCE)

    // Icon-only button has no accessible name from Ko-fi's own markup (empty
    // span, alt-less <img>) — restore one from the full label we would have shown.
    if (iconOnly) labelKofiDonateButtons(buttonText)
    if (revealAfterId) compactKofiDonateButtons()
  }, [buttonText, revealAfterId])

  if (isIosNative || !armed) return null

  return (
    <Script
      src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"
      strategy="afterInteractive"
      onLoad={handleLoad}
    />
  )
}
