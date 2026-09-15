'use client'

// 連線狀態如何影響離線瀏覽與 realtime 重連，見
// docs/superpowers/specs/offline-browsing-design.md 與 realtime-design.md。
import { useEffect, useRef, useState } from 'react'

/**
 * How long the device has to stay offline before anything announces it (#1244).
 *
 * Bounded from both sides rather than picked:
 *  - Lower bound — the thing being suppressed is a Wi-Fi → cellular handover,
 *    where `offline` and `online` fire around a second apart while the route
 *    is re-established. A sub-second threshold would still let that flash
 *    through on the slow end of the handover.
 *  - Upper bound — `app/sw.ts` sets `networkTimeoutSeconds: 3` for HTML, the
 *    point at which the app itself stops waiting for the network and serves
 *    the cached page. The banner has to be up by then, or a genuinely offline
 *    reader gets a stale page with no explanation.
 *
 * 2s sits between the two. It is an initial value: nothing in this repo
 * measures a real handover, so it wants calibrating against a device on a
 * weak Wi-Fi edge before it is treated as settled.
 */
export const OFFLINE_ANNOUNCE_DELAY_MS = 2000

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

/**
 * `useOnlineStatus` with the offline edge delayed by `delayMs` (#1244).
 *
 * Asymmetric on purpose: going offline has to hold for `delayMs` before it is
 * reported, coming back online is reported immediately. That is the shape the
 * flash needs — a blip never gets announced, and a recovery is never held back.
 *
 * Deliberately a separate hook rather than a change to `useOnlineStatus`: the
 * other caller (`TransactionFeed`) reads the flag at the moment a page fetch
 * fails, to decide whether to say "再多紀錄需連線取得". A delayed value there
 * would have it explain a failure with a connection state from two seconds ago.
 */
export function useDelayedOnlineStatus(delayMs = OFFLINE_ANNOUNCE_DELAY_MS): boolean {
  const immediate = useOnlineStatus()
  const [settled, setSettled] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (immediate) {
      setSettled(true)
      return
    }
    timerRef.current = setTimeout(() => setSettled(false), delayMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [immediate, delayMs])

  return settled
}
