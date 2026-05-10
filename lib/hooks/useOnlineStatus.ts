'use client'

import { useEffect, useState } from 'react'

/**
 * Track `navigator.onLine`. Returns `true` while online, `false` while offline.
 * On the server (and during the first client render) it returns `true` to avoid
 * a misleading "you're offline" flash before hydration.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    setOnline(navigator.onLine)

    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}
