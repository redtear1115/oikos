'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { useMember } from './MemberContext'
import { parseQuickAddHash, parseQuickAddSchemeUrl, type QuickAddPrefill } from '@/lib/quickAdd'

/**
 * Quick add from an iOS Shortcut (#1488) — the one place that turns an
 * outside URL into "open 記一筆 prefilled". Parsing lives in lib/quickAdd.ts;
 * this owns delivery:
 *
 *   - shell: the `appUrlOpen` listener + `App.getLaunchUrl()` (cold start);
 *   - web / PWA: the `/dashboard#add=expense&…` fragment, stripped on read.
 *
 * The prefill is handed to the dashboard IN MEMORY (this context); navigation
 * is only ever to plain `/dashboard`. Dashboard.tsx reads `pending`, opens
 * AddSheet in create mode, and clears it. Nothing is written until the user
 * taps save.
 *
 * Gates, checked when a URL arrives — a failed gate drops it with no
 * navigation and no sheet:
 *   1. something modal is open (`[aria-modal="true"]`: every SheetFrame and
 *      ConfirmModal, on any dashboard route) — never yank the user out of a
 *      half-edited record;
 *   2. the viewer is pinned to a past chapter — that view is read-only and
 *      the write would be refused (`過去章節不可編輯`).
 *
 * Handled-URL record (sessionStorage, key = the URL): `getLaunchUrl` is never
 * cleared by Capacitor (iOS: last opened URL; Android: the launch intent for
 * the activity's lifetime), so every remount / reload would replay it. A
 * launch URL opens only if unrecorded. Warm `appUrlOpen` events always open —
 * running the same Shortcut twice for two equal payments is legitimate — and
 * are recorded. On a cold start iOS delivers the URL both as a retained event
 * and as the launch URL; whichever arrives first opens, the other is dropped.
 *
 * Failure looks like: the sheet re-opening with an old amount after a reload
 * or a /records → /dashboard hop (record missing), or opening twice on a cold
 * start (cold-start de-dup missing). Neither throws — they just reappear.
 *
 * Never clear every listener on the App plugin: SignInButton (OAuth callback)
 * and TextScale hold their own listeners on it. Remove only our own handle.
 * (tests/quick-add-provider-1488.test.tsx has a grep guard for it.)
 */

/** sessionStorage key prefix for the handled-URL record. */
export const QUICK_ADD_HANDLED_PREFIX = 'futari:quickAdd:handled:'
/** Window in which a second delivery of the cold-start URL counts as the same launch. */
export const QUICK_ADD_COLD_START_DEDUPE_MS = 2000
/** A pending prefill nobody consumed (navigation abandoned) is dropped after this. */
export const QUICK_ADD_PENDING_TTL_MS = 30_000

interface QuickAddContextValue {
  pending: QuickAddPrefill | null
  clear: () => void
}

const NOOP: QuickAddContextValue = { pending: null, clear: () => {} }
const QuickAddContext = createContext<QuickAddContextValue>(NOOP)

export function useQuickAdd(): QuickAddContextValue {
  return useContext(QuickAddContext)
}

/** true / false, or null when storage is unavailable (private mode, blocked). */
function isRecorded(url: string): boolean | null {
  try {
    return window.sessionStorage.getItem(QUICK_ADD_HANDLED_PREFIX + url) !== null
  } catch {
    return null
  }
}

function record(url: string): boolean {
  try {
    window.sessionStorage.setItem(QUICK_ADD_HANDLED_PREFIX + url, '1')
    return true
  } catch {
    return false
  }
}

function modalIsOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null
}

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isPast } = useMember()
  const [pending, setPending] = useState<QuickAddPrefill | null>(null)

  // The shell listener is registered once; it reads the latest route / pin
  // through refs rather than re-subscribing on every navigation.
  const pathnameRef = useRef(pathname)
  const isPastRef = useRef(isPast)
  const routerRef = useRef(router)
  useEffect(() => {
    pathnameRef.current = pathname
    isPastRef.current = isPast
    routerRef.current = router
  })

  const deliver = useCallback((prefill: QuickAddPrefill) => {
    if (modalIsOpen()) return
    if (isPastRef.current) return
    setPending(prefill)
    if (pathnameRef.current !== '/dashboard') routerRef.current.push('/dashboard')
  }, [])

  const clear = useCallback(() => setPending(null), [])

  useEffect(() => {
    if (!pending) return
    const id = setTimeout(() => setPending(null), QUICK_ADD_PENDING_TTL_MS)
    return () => clearTimeout(id)
  }, [pending])

  // ── web / PWA: `/dashboard#add=expense&…` ──────────────────────────────
  useEffect(() => {
    if (pathname !== '/dashboard') return
    const readHash = () => {
      if (window.location.pathname !== '/dashboard') return
      const hash = window.location.hash
      if (!hash) return
      if (!new URLSearchParams(hash.slice(1)).has('add')) return
      // Strip first, so a reload or Back can never replay it — even when a
      // gate drops it or a value fails to parse.
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      const prefill = parseQuickAddHash(hash)
      if (prefill) deliver(prefill)
    }
    readHash()
    // A Shortcut run while this tab already shows /dashboard is a same-document
    // fragment navigation: no reload, only `hashchange`.
    window.addEventListener('hashchange', readHash)
    return () => window.removeEventListener('hashchange', readHash)
  }, [pathname, deliver])

  // ── native shell: `dev.southernlight.futari://add?…` ───────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let cancelled = false
    let removeOwn: (() => void) | undefined
    // The cold-start URL, as first handled; a second delivery of the same URL
    // inside the window is that same launch, not a new Shortcut run.
    let coldStart: { url: string; at: number } | null = null
    const isColdStartDuplicate = (url: string) =>
      coldStart !== null && coldStart.url === url && Date.now() - coldStart.at < QUICK_ADD_COLD_START_DEDUPE_MS

    const onEvent = (url: string) => {
      if (cancelled) return
      // Not ours (e.g. the OAuth login-callback): return before any side effect.
      const prefill = parseQuickAddSchemeUrl(url)
      if (!prefill) return
      if (isColdStartDuplicate(url)) {
        coldStart = null
        return
      }
      coldStart = { url, at: Date.now() }
      record(url)
      deliver(prefill)
    }

    const onLaunchUrl = (url: string) => {
      if (cancelled) return
      const prefill = parseQuickAddSchemeUrl(url)
      if (!prefill) return
      if (isColdStartDuplicate(url)) return
      // Unknown (storage unavailable) or already handled → do not open: a
      // launch URL that cannot be recorded would reopen on every reload.
      if (isRecorded(url) !== false) return
      if (!record(url)) return
      coldStart = { url, at: Date.now() }
      deliver(prefill)
    }

    import('@capacitor/app')
      .then(async ({ App }) => {
        if (cancelled) return
        // Listener first: on iOS the retained cold-start event is delivered as
        // soon as the listener count goes 0 → 1.
        const handle = await App.addListener('appUrlOpen', ({ url }) => onEvent(url))
        if (cancelled) {
          void handle.remove()
          return
        }
        removeOwn = () => void handle.remove()
        const launch = await App.getLaunchUrl()
        if (launch?.url) onLaunchUrl(launch.url)
      })
      .catch(() => {})

    return () => {
      cancelled = true
      removeOwn?.()
    }
  }, [deliver])

  const value = useMemo(() => ({ pending, clear }), [pending, clear])
  return <QuickAddContext.Provider value={value}>{children}</QuickAddContext.Provider>
}
