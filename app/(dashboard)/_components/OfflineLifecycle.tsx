'use client'

import { useEffect } from 'react'
import { getOfflinePref } from '@/lib/offline/preference'
import { isSWSupported, registerSW, unregisterAllSW } from '@/lib/offline/swControl'

/**
 * On boot, reconcile the SW registration with the user's saved preference:
 *   - pref ON  → ensure SW is registered
 *   - pref OFF → ensure no SW is registered (clears stale SWs from a previous opt-in)
 *
 * Mounted inside the dashboard layout so it only runs after a user is signed in.
 */
export function OfflineLifecycle() {
  useEffect(() => {
    if (!isSWSupported()) return
    const enabled = getOfflinePref()
    if (enabled) {
      registerSW().catch(() => {
        // SW registration is best-effort; failure leaves the app in fully-online mode.
      })
    } else {
      unregisterAllSW().catch(() => {})
    }
  }, [])

  return null
}
