'use client'

import Script from 'next/script'
import { useCallback } from 'react'

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

/**
 * Bottom-right floating Ko-fi widget. Click opens a Ko-fi-hosted modal so the
 * donation completes without leaving the site.
 *
 * On click, fires the cross-product `kofi_widget_click` GA event with
 * `source: SOURCE` so we can split traffic per site in GA reports. The event
 * call is a no-op until `window.gtag` is loaded (PR #896 + Vercel prod env).
 */
export function KofiWidget({ buttonText }: { buttonText: string }) {
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

    // Ko-fi script doesn't expose an onClick hook, so attach a delegated
    // listener on document — captures clicks regardless of when the widget
    // injects its DOM (and re-injections, if any). The widget button class
    // is `.floatingchat-donate-button` per Ko-fi's overlay-widget.js.
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement | null
        if (!target?.closest('.floatingchat-donate-button')) return
        window.gtag?.('event', 'kofi_widget_click', { source: SOURCE })
      },
      { passive: true },
    )
  }, [buttonText])

  return (
    <Script
      src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"
      strategy="afterInteractive"
      onLoad={handleLoad}
    />
  )
}
