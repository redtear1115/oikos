'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { clearTextScale, syncTextScale } from '@/lib/textScale'

/**
 * Keeps `--text-scale` on <html> in step with the iOS system text size while
 * the dashboard is mounted (#1490, mechanism in lib/textScale.ts). The first
 * paint is handled by the inline script in the dashboard layout; this covers
 * client-side entry, returning from the background (the user can change the
 * size in Settings or Control Center while the app is suspended), and cleanup.
 *
 * Cleanup matters: sign-out is a soft navigation under the shared root layout,
 * so <html> survives it. Without the removal, the landing page and sign-in
 * would keep the scaled text.
 */
export function TextScale() {
  useEffect(() => {
    syncTextScale()
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncTextScale()
    }
    document.addEventListener('visibilitychange', onVisible)

    let cancelled = false
    let removeResume: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app')
        .then(({ App }) => App.addListener('resume', () => syncTextScale()))
        .then(handle => {
          if (cancelled) void handle.remove()
          else removeResume = () => void handle.remove()
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      removeResume?.()
      clearTextScale()
    }
  }, [])

  return null
}
