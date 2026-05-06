'use client'

import { useEffect, useState } from 'react'

/**
 * Renders a fake home-bar pill to mask the iOS home indicator that crosses
 * our bottom nav. Only relevant when (a) installed as PWA AND (b) running
 * on iOS — Android PWAs don't have the same hardware artifact, and a browser
 * tab has its own chrome below us. Returns null otherwise.
 */
export function HomeIndicator() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setShow(isStandalone && isIOS)
  }, [])

  if (!show) return null

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[81] h-[22px] flex justify-center items-end pb-[6px] pointer-events-none">
      <div className="w-[130px] h-1 rounded-full" style={{ background: 'rgba(31,27,22,0.32)' }} />
    </div>
  )
}
