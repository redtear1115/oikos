'use client'

import { useEffect, useState } from 'react'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import { getOfflinePref } from '@/lib/offline/preference'
import { useTranslations } from '@/lib/i18n/client'

/**
 * Slim top banner shown only when offline browsing is enabled AND the device
 * reports it has lost network. Hidden entirely when the user has opted out
 * (matches their expectation that nothing offline-related happens).
 */
export function OfflineBanner() {
  const t = useTranslations()
  const online = useOnlineStatus()
  const [prefOn, setPrefOn] = useState(false)

  useEffect(() => {
    setPrefOn(getOfflinePref())
    // Keep in sync if Settings flips it in another tab.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'offline-browsing-enabled') setPrefOn(getOfflinePref())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (!prefOn || online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 px-4 py-2 text-xs text-center"
      style={{
        background: 'var(--ink-3)',
        color: 'var(--bg)',
        opacity: 0.92,
      }}
    >
      {t.offlineBanner.text}
    </div>
  )
}
