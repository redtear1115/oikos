'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { whenIdle } from '@/lib/whenIdle'

/**
 * Renders `children` only once the page has settled (`whenIdle`: load + grace +
 * idle, or the first interaction).
 *
 * For decorative images just below the fold on brand pages (#1520 / #1524).
 * `loading="lazy"` is not enough there: Chrome's lazy-load distance threshold
 * is 1250–2500 px, so an image one screen down is fetched alongside the first
 * paint, and Lighthouse's simulated LCP counts it. Measured on /sign-in: the
 * dev-log illustration crop moved the median from 2.47 s to 2.54 s, over the
 * 2.5 s gate. Failing to defer looks like nothing — no error, the page just
 * scores worse — so the parent must give the slot a fixed size, or the late
 * image becomes a layout shift instead.
 */
export function AfterPaint({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => whenIdle(() => setReady(true)), [])
  return ready ? <>{children}</> : null
}
