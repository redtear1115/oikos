'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** Custom property every page-level sticky header reads as its `top`. Declared
 *  with a 0px fallback in globals.css so SSR and a JS-less first paint behave
 *  like an empty stack, which is what they are. */
const HEIGHT_VAR = '--top-stack-h'

/**
 * #1037 — the single container that owns the top of the dashboard.
 *
 * The bug this exists for: `position: sticky` elements do not yield to each
 * other. The update notice, the deletion banner and a page's own sticky header
 * were three separate `top-0` elements in three different React trees, so on a
 * notched phone they landed in the same place — and the one that lost was
 * whichever had the lower z-index, which for the deletion banner means the
 * cancel button for a 14-day destructive countdown sitting behind something
 * else. None of it reproduces in a browser; only a shell with a notch shows it.
 *
 * Everything shell-level goes inside, in priority order, and the container
 * pins as one unit — children are in normal flow relative to each other, so
 * they stack the way markup order says they do, with no measuring involved.
 *
 * The one thing that cannot be expressed in flow is the third layer: a page's
 * sticky header lives inside `{children}`, several trees away, and it must pin
 * *below* the stack. A portal would move it in here, but the /records header
 * carries the whole filter bar and has a server-rendered skeleton
 * (`records/loading.tsx`) that has to match it pixel for pixel — portaling it
 * would make the top of that page appear only after hydration. So the height
 * travels instead of the element: this component publishes its own measured
 * height as `--top-stack-h`, and the page header pins at that offset.
 */
export function ShellTopStack({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const publish = () => {
      // Round: sub-pixel heights would make the header's `top` fight the
      // stack's bottom edge by a fraction and show a hairline of scrolled
      // content between them.
      const h = Math.round(el.getBoundingClientRect().height)
      document.documentElement.style.setProperty(HEIGHT_VAR, `${h}px`)
    }

    publish()

    // The stack changes height at runtime, not just on resize: the update
    // notice arrives after an async version check, the banner disappears on
    // cancel, and either band rewraps to two lines in a longer locale.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty(HEIGHT_VAR)
    }
  }, [])

  return (
    <div ref={ref} className="shell-top-stack sticky top-0 z-40">
      {children}
    </div>
  )
}
