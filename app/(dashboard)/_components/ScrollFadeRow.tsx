'use client'

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

interface Props {
  children: ReactNode
  className?: string
  /**
   * Color the edge fade blends into. Defaults to var(--bg); pass the
   * surrounding sheet's bg when it differs (e.g. IncomeSheet uses palette
   * sheetBg) so the gradient lands seamlessly on the underlying surface.
   */
  fadeTo?: string
  fadeWidth?: number
  style?: CSSProperties
}

/**
 * Horizontal scroll container with edge fades that only appear when there is
 * actually more content to scroll to in that direction. Replaces the old
 * always-on right-edge overlay that was eaten by the chip row's px-5 padding
 * and never registered as a scroll affordance — testers thought the visible
 * chips were the entire list (#197).
 */
export function ScrollFadeRow({
  children,
  className,
  fadeTo = 'var(--bg)',
  fadeWidth = 48,
  style,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [{ left, right }, setEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      setEdges({
        left: el.scrollLeft > 1,
        right: el.scrollLeft < el.scrollWidth - el.clientWidth - 1,
      })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    // ResizeObserver covers (a) the sheet expanding when content changes and
    // (b) viewport rotation — both can flip whether there's overflow to fade.
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="relative">
      <div
        ref={ref}
        className={className}
        style={{ overflowX: 'auto', scrollbarWidth: 'none', ...style }}
      >
        {children}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 h-full transition-opacity duration-200"
        style={{
          width: fadeWidth,
          background: `linear-gradient(to right, ${fadeTo}, transparent)`,
          opacity: left ? 1 : 0,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 h-full transition-opacity duration-200"
        style={{
          width: fadeWidth,
          background: `linear-gradient(to right, transparent, ${fadeTo})`,
          opacity: right ? 1 : 0,
        }}
      />
    </div>
  )
}
