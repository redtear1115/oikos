'use client'

import { useEffect, useReducer } from 'react'
import { useTranslations } from '@/lib/i18n/client'

const HINT_KEY = 'futari_header_hint_v1'

type Phase = 'idle' | 'entering' | 'visible' | 'exiting'
type Action = { type: 'enter' } | { type: 'show' } | { type: 'exit' } | { type: 'done' }

function reducer(phase: Phase, action: Action): Phase {
  switch (action.type) {
    case 'enter': return phase === 'idle' ? 'entering' : phase
    case 'show':  return phase === 'entering' ? 'visible' : phase
    case 'exit':  return phase === 'visible' || phase === 'entering' ? 'exiting' : phase
    case 'done':  return 'idle'
    default:      return phase
  }
}

/**
 * One-time first-use floating labels below the BrandHeader icon buttons (#765).
 *
 * Two small pill callouts appear below the ✈ and avatar-stack buttons on the
 * user's first visit. They auto-dismiss after 3.5 s or on the first tap/click
 * anywhere. The `futari_header_hint_v1` localStorage key prevents re-display.
 *
 * Positioned absolute inside the BrandHeader's right `relative` container so
 * each callout sits naturally below its respective button. Respects
 * `prefers-reduced-motion`.
 */
export function BrandHeaderHint({ showTripButton }: { showTripButton: boolean }) {
  const t = useTranslations()
  const [phase, dispatch] = useReducer(reducer, 'idle')

  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_KEY)) return
    } catch {
      return
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Delay slightly so the dashboard paint settles before the hint appears
    const enterTimer = setTimeout(
      () => dispatch({ type: 'enter' }),
      prefersReduced ? 0 : 500,
    )
    const showTimer = setTimeout(
      () => dispatch({ type: 'show' }),
      prefersReduced ? 0 : 700, // 500 ms delay + 200 ms animation
    )
    const exitTimer = setTimeout(
      () => dispatch({ type: 'exit' }),
      4200, // 700 ms enter + 3500 ms read time
    )

    function dismiss() {
      dispatch({ type: 'exit' })
      try {
        localStorage.setItem(HINT_KEY, '1')
      } catch {
        // private-mode storage failure: worst case re-shows next visit
      }
    }

    window.addEventListener('touchstart', dismiss, { passive: true, once: true })
    window.addEventListener('click', dismiss, { once: true })

    return () => {
      clearTimeout(enterTimer)
      clearTimeout(showTimer)
      clearTimeout(exitTimer)
      window.removeEventListener('touchstart', dismiss)
      window.removeEventListener('click', dismiss)
    }
  }, [])

  // After exit animation completes, reset to idle
  useEffect(() => {
    if (phase !== 'exiting') return
    const t = setTimeout(() => dispatch({ type: 'done' }), 200)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === 'idle') return null

  const isEntering = phase === 'entering'
  const isExiting = phase === 'exiting'
  const opacity = isEntering || isExiting ? 0 : 1
  const translateY = isEntering ? 4 : isExiting ? 2 : 0

  return (
    <div
      aria-hidden="true"
      className="absolute right-0 top-full flex items-start gap-2 pt-1.5 pointer-events-none"
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        transition: isEntering
          ? 'opacity 200ms ease-out, transform 200ms ease-out'
          : 'opacity 150ms ease-in, transform 150ms ease-in',
      }}
    >
      {showTripButton && <Callout label={t.dashboard.headerHint.trip} />}
      <Callout label={t.dashboard.headerHint.settings} />
    </div>
  )
}

function Callout({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-[2px]">
      {/* Upward arrow caret */}
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderBottom: '4px solid var(--hairline)',
        }}
      />
      {/* Pill label */}
      <div
        className="px-2 py-[2px] rounded-full text-[11px] tracking-wide whitespace-nowrap"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          color: 'var(--ink-2)',
        }}
      >
        {label}
      </div>
    </div>
  )
}
