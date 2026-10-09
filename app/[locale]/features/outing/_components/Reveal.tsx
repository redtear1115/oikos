'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { f } from './feature-outing-css'

type Phase = 'idle' | 'armed' | 'in'

/**
 * One-shot entrance when the block scrolls into view (#1633). The phases keep
 * the page honest without a script: server HTML and a no-JS visit have no
 * `data-reveal` and show the resting picture; the block is hidden ("armed")
 * only after hydration has seen it is off-screen, and only when motion is
 * allowed. A block already in view at load is never hidden, so nothing
 * flashes. Reduced motion never arms (and the CSS strips transitions anyway).
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPhase('in')
          io.disconnect()
        } else {
          setPhase((p) => (p === 'idle' ? 'armed' : p))
        }
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={[f.reveal, className].filter(Boolean).join(' ')}
      data-reveal={phase === 'idle' ? undefined : phase}
    >
      {children}
    </div>
  )
}
