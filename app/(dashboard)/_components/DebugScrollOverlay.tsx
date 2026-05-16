'use client'

import { useEffect, useState } from 'react'

// Diagnostic overlay for the AddSheet / IncomeSheet scroll-on-open bug
// (#442). Enabled by adding `?debug=scroll` to any dashboard URL.
//
// Polls the currently-visible scrollable sheet container 10x/sec and
// renders its scrollTop, the focused element, and visualViewport
// dimensions in a small top-right HUD. Hidden when no sheet is open and
// when the query param is absent. Removable in a single revert.

interface Snapshot {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  activeTag: string
  activeLabel: string
  activeInputMode: string
  vvHeight: number
  innerHeight: number
  panelTransformY: string
}

function snapshot(): Snapshot | null {
  // Same selector the bug reproduction uses: AddSheet / IncomeSheet's
  // inner container is the only `.overflow-auto.flex-1` on the page,
  // and `offsetParent !== null` rules out the closed (translateY(100%))
  // copy if both sheets are mounted.
  const scrollers = Array.from(
    document.querySelectorAll<HTMLElement>('.overflow-auto.flex-1'),
  )
  const sheet = scrollers.find((el) => el.getBoundingClientRect().height > 0)
  if (!sheet) return null

  const active = document.activeElement as HTMLElement | null
  const panel = sheet.closest<HTMLElement>('[role="dialog"]')
  const transform = panel ? getComputedStyle(panel).transform : 'none'

  return {
    scrollTop: Math.round(sheet.scrollTop),
    scrollHeight: sheet.scrollHeight,
    clientHeight: sheet.clientHeight,
    activeTag: active?.tagName ?? '-',
    activeLabel: active?.getAttribute('aria-label') ?? '',
    activeInputMode: active?.getAttribute('inputmode') ?? '',
    vvHeight: Math.round(window.visualViewport?.height ?? 0),
    innerHeight: window.innerHeight,
    panelTransformY: transform,
  }
}

export function DebugScrollOverlay() {
  const [enabled, setEnabled] = useState(false)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [peakScrollTop, setPeakScrollTop] = useState(0)

  // Resolve enabled state on mount only, to avoid SSR/CSR hydration mismatch
  // from reading window.location during render.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setEnabled(params.get('debug') === 'scroll')
  }, [])

  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      const next = snapshot()
      setSnap(next)
      if (next && next.scrollTop > peakScrollTop) setPeakScrollTop(next.scrollTop)
    }
    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [enabled, peakScrollTop])

  if (!enabled) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 'max(8px, env(safe-area-inset-top))',
        right: 8,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.88)',
        color: '#fff',
        font: '500 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '6px 8px',
        borderRadius: 6,
        pointerEvents: 'none',
        maxWidth: 220,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
      aria-hidden="true"
    >
      <div style={{ fontWeight: 700, marginBottom: 2, color: '#FFE066' }}>
        debug=scroll
      </div>
      {snap ? (
        <>
          <div>
            scrollTop:{' '}
            <b style={{ color: snap.scrollTop > 0 ? '#FF7575' : '#7BFF8C' }}>
              {snap.scrollTop}
            </b>
            {' '}peak: <b>{peakScrollTop}</b>
          </div>
          <div>
            scrollH/clientH: {snap.scrollHeight}/{snap.clientHeight}
          </div>
          <div>
            active: {snap.activeTag}
            {snap.activeInputMode ? ` [${snap.activeInputMode}]` : ''}
          </div>
          {snap.activeLabel && <div>label: {snap.activeLabel.slice(0, 28)}</div>}
          <div>
            vv/win: {snap.vvHeight}/{snap.innerHeight}
          </div>
          <div style={{ fontSize: 10, opacity: 0.6, wordBreak: 'break-all' }}>
            {snap.panelTransformY.slice(0, 40)}
          </div>
        </>
      ) : (
        <div style={{ opacity: 0.6 }}>no open sheet</div>
      )}
    </div>
  )
}
