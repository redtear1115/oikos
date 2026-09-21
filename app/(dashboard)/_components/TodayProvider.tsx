'use client'

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { localTodayISO } from '@/lib/local-date'
import { syncTimeZoneCookie } from '@/lib/today'

// See lib/today.ts for why this exists (#1360).

const TodayContext = createContext<string | null>(null)

const noopSubscribe = () => () => {}

/**
 * Hands the server's "today" (computed in the device's zone from the `futari_tz`
 * cookie) to client components, and keeps that cookie current.
 */
export function TodayProvider({ todayYMD, children }: { todayYMD: string; children: ReactNode }) {
  // After hydration, so the write can't affect this render. Only writes when
  // the device zone differs from the cookie: the first visit, or after the
  // device has moved zones.
  useEffect(() => {
    syncTimeZoneCookie()
  }, [])
  return <TodayContext.Provider value={todayYMD}>{children}</TodayContext.Provider>
}

/**
 * Today as 'YYYY-MM-DD'. Use this — not `todayLocalDate()` / `localTodayISO()`
 * — for anything rendered, in a client component that is server-rendered.
 *
 * While hydrating, React uses the server snapshot: the server's value, so
 * the markup matches. From then on it reads the device clock on every render,
 * exactly as `localTodayISO()` did, so a PWA left open past midnight still
 * rolls over. When the cookie matches the device zone — every visit after
 * the first — the two are equal and nothing re-renders.
 *
 * Outside a TodayProvider (tests, pages outside the dashboard layout) the
 * server snapshot falls back to the runtime clock — the pre-#1360 behaviour,
 * mismatch included.
 */
export function useToday(): string {
  const serverToday = useContext(TodayContext)
  return useSyncExternalStore(
    noopSubscribe,
    localTodayISO,
    () => serverToday ?? localTodayISO(),
  )
}
