'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  /** Per-user scope so multiple users on the same device keep independent state. */
  userId: string
  children: React.ReactNode
}

const KEY_PREFIX = 'oikos_stats_collapsed_'

export function StatsCollapsible({ userId, children }: Props) {
  const t = useTranslations()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Read persisted state on mount. Server / first-paint render is always
  // "expanded" so SSR markup is stable; if localStorage says collapsed, we flip
  // after hydration. Slight flash for collapsed users — acceptable trade-off
  // given this is a per-device preference, not a critical page chrome.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`${KEY_PREFIX}${userId}`)
      if (stored === 'true') setCollapsed(true)
    } catch {
      // localStorage may throw in private mode / disabled storage. Stay expanded.
    }
    setMounted(true)
  }, [userId])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      window.localStorage.setItem(`${KEY_PREFIX}${userId}`, String(next))
    } catch {
      // Best-effort persistence; ignore failures.
    }
  }

  // Until mounted, show expanded to match SSR. After mount, defer to state.
  const showCollapsed = mounted && collapsed

  return (
    <section className="px-5 pt-10 pb-2">
      <div className="flex items-baseline justify-between mb-3">
        <h2
          className="text-base font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {t.records.stats.title}
        </h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!showCollapsed}
          aria-label={showCollapsed ? t.records.stats.expand : t.records.stats.collapse}
          className="h-7 w-7 grid place-items-center rounded-full cursor-pointer bg-transparent"
          style={{
            color: 'var(--ink-2)',
            border: '1px solid var(--hairline)',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          {showCollapsed ? '+' : '−'}
        </button>
      </div>

      {!showCollapsed && children}
    </section>
  )
}
