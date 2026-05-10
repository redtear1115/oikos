'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from '@/lib/i18n/client'

/**
 * Horizontal snap carousel — one card per page, swipeable on touch and
 * scrollable on desktop. Uses native CSS scroll-snap so we don't need an
 * RAF/animation loop; the page indicator updates from a scroll listener.
 */
export function Carousel({ children }: { children: ReactNode }) {
  const t = useTranslations()
  const tr = t.monthlyReview

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const slides = Array.isArray(children) ? children : [children]
  const total = slides.length

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    let frame = 0
    function onScroll() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const scroller = scrollerRef.current
        if (!scroller) return
        const idx = Math.round(scroller.scrollLeft / scroller.clientWidth)
        setActiveIndex(Math.max(0, Math.min(total - 1, idx)))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [total])

  return (
    <div>
      <div
        ref={scrollerRef}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth"
        style={{
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className="snap-start shrink-0 w-full px-3"
            aria-roledescription="slide"
            aria-label={tr.carouselIndicator
              .replace('{current}', String(i + 1))
              .replace('{total}', String(total))}
          >
            {slide}
          </div>
        ))}
      </div>

      <div
        className="mt-3 flex items-center justify-center gap-1.5"
        aria-live="polite"
      >
        {slides.map((_, i) => (
          <span
            key={i}
            className="block h-1.5 rounded-full transition-all"
            style={{
              width: i === activeIndex ? 18 : 6,
              background: i === activeIndex ? 'var(--ink)' : 'var(--hairline)',
            }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  )
}
