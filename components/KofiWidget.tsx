'use client'

import Script from 'next/script'
import { useCallback, useEffect } from 'react'

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
// flows that don't go through Apple IAP. Before shipping the iOS wrapper, this
// component MUST be excluded from the iOS build (env flag at the mount sites in
// app/[locale]/page.tsx and app/(dashboard)/settings/page.tsx). Google Play is
// lenient for donation-framed widgets so Android stays as-is.
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

/** Remove every Ko-fi-injected top-level element from the document. */
export function teardownKofiWidget(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll(KOFI_INJECTED_SELECTOR).forEach((el) => el.remove())
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
export function KofiWidget({ buttonText }: { buttonText: string }) {
  useEffect(() => {
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

    return () => {
      document.removeEventListener('click', onClick)
      teardownKofiWidget()
    }
  }, [])

  const handleLoad = useCallback(() => {
    if (typeof window === 'undefined') return
    if (!window.kofiWidgetOverlay) return

    window.kofiWidgetOverlay.draw(KOFI_USERNAME, {
      'type': 'floating-chat',
      'floating-chat.donateButton.text': buttonText,
      // --color-warm-base (#FBEDE0) / --ink (#322B23) — keep the lamp warm,
      // not Ko-fi default cobalt which collides with the brand palette.
      'floating-chat.donateButton.background-color': '#FBEDE0',
      'floating-chat.donateButton.text-color': '#322B23',
    })
  }, [buttonText])

  return (
    <Script
      src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"
      strategy="afterInteractive"
      onLoad={handleLoad}
    />
  )
}
