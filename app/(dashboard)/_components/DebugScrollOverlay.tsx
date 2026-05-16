'use client'

import { useEffect, useState } from 'react'

// Diagnostic overlay for the AddSheet / IncomeSheet scroll-on-open bug
// (#442). Enabled by adding `?debug=scroll` to any dashboard URL.
//
// Iterates ALL mounted sheet dialogs (AddSheet / IncomeSheet /
// SettlementSheet — they're always-mounted with translateY toggling
// open/closed), picks the most-open one as "primary", and reports its
// scrollTop, the focused element, the panel's transform + rect, and
// window / visualViewport metrics. Renders a compact summary of every
// sheet so we can tell which one's data is being shown. Hidden when
// the query param is absent. Removable in a single revert.

interface SheetInfo {
  label: string
  translateY: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  panelRectTop: number
  panelRectBottom: number
  containsActive: boolean
}

interface Snapshot {
  sheets: SheetInfo[]
  primaryIndex: number
  activeTag: string
  activeLabel: string
  activeInputMode: string
  windowScrollY: number
  innerHeight: number
  vvHeight: number
  vvOffsetTop: number
  vvPageTop: number
}

function parseTranslateY(transform: string): number {
  // CSS transform: "matrix(a, b, c, d, tx, ty)" — ty is the 6th value.
  const match = transform.match(
    /matrix\(\s*[-\d.]+\s*,\s*[-\d.]+\s*,\s*[-\d.]+\s*,\s*[-\d.]+\s*,\s*[-\d.]+\s*,\s*([-\d.]+)\s*\)/,
  )
  if (match) return parseFloat(match[1])
  // matrix3d has 16 values; tx/ty are 13th/14th.
  const m3d = transform.match(/matrix3d\(([^)]+)\)/)
  if (m3d) {
    const parts = m3d[1].split(',').map((s) => parseFloat(s.trim()))
    if (parts.length >= 14) return parts[13]
  }
  return 0
}

function snapshot(): Snapshot | null {
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"]'),
  )
  // Filter to dialogs that have an overflow-auto.flex-1 inside — that's our
  // sheet shape (AddSheet / IncomeSheet / SettlementSheet). Other dialogs
  // like ConfirmModal don't, so they're skipped.
  const candidates = dialogs
    .map((panel) => {
      const scroller = panel.querySelector<HTMLElement>('.overflow-auto.flex-1')
      if (!scroller) return null
      return { panel, scroller }
    })
    .filter((x): x is { panel: HTMLElement; scroller: HTMLElement } => !!x)

  if (candidates.length === 0) return null

  const active = document.activeElement as HTMLElement | null

  const sheets: SheetInfo[] = candidates.map(({ panel, scroller }) => {
    const transform = getComputedStyle(panel).transform
    const ty = parseTranslateY(transform)
    const rect = panel.getBoundingClientRect()
    return {
      label: panel.getAttribute('aria-label') ?? '(no label)',
      translateY: Math.round(ty),
      scrollTop: Math.round(scroller.scrollTop),
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      panelRectTop: Math.round(rect.top),
      panelRectBottom: Math.round(rect.bottom),
      containsActive: !!active && panel.contains(active),
    }
  })

  // "Primary" = the most-open sheet. Pick the one with the smallest
  // |translateY|. Ties broken by whichever contains the active element.
  let primaryIndex = 0
  for (let i = 1; i < sheets.length; i++) {
    const cur = sheets[primaryIndex]
    const cand = sheets[i]
    if (Math.abs(cand.translateY) < Math.abs(cur.translateY)) primaryIndex = i
    else if (
      Math.abs(cand.translateY) === Math.abs(cur.translateY) &&
      cand.containsActive &&
      !cur.containsActive
    )
      primaryIndex = i
  }

  return {
    sheets,
    primaryIndex,
    activeTag: active?.tagName ?? '-',
    activeLabel: active?.getAttribute('aria-label') ?? '',
    activeInputMode: active?.getAttribute('inputmode') ?? '',
    windowScrollY: Math.round(window.scrollY),
    innerHeight: window.innerHeight,
    vvHeight: Math.round(window.visualViewport?.height ?? 0),
    vvOffsetTop: Math.round(window.visualViewport?.offsetTop ?? 0),
    vvPageTop: Math.round(window.visualViewport?.pageTop ?? 0),
  }
}

export function DebugScrollOverlay() {
  const [enabled, setEnabled] = useState(false)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [peakScrollTop, setPeakScrollTop] = useState(0)
  const [peakWindowScrollY, setPeakWindowScrollY] = useState(0)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setEnabled(params.get('debug') === 'scroll')
  }, [])

  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      const next = snapshot()
      setSnap(next)
      if (next) {
        const primary = next.sheets[next.primaryIndex]
        if (primary && primary.scrollTop > peakScrollTop)
          setPeakScrollTop(primary.scrollTop)
        if (next.windowScrollY > peakWindowScrollY)
          setPeakWindowScrollY(next.windowScrollY)
      }
    }
    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [enabled, peakScrollTop, peakWindowScrollY])

  if (!enabled) return null

  const primary = snap ? snap.sheets[snap.primaryIndex] : null

  return (
    <div
      style={{
        position: 'fixed',
        top: 'max(8px, env(safe-area-inset-top))',
        right: 8,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.9)',
        color: '#fff',
        font: '500 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '6px 8px',
        borderRadius: 6,
        pointerEvents: 'none',
        maxWidth: 260,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
      aria-hidden="true"
    >
      <div style={{ fontWeight: 700, color: '#FFE066', marginBottom: 2 }}>
        debug=scroll
      </div>
      {!snap || !primary ? (
        <div style={{ opacity: 0.6 }}>no sheet mounted</div>
      ) : (
        <>
          <div style={{ color: '#7BFF8C' }}>
            primary: {primary.label}{' '}
            {primary.containsActive && (
              <span style={{ color: '#FFD27B' }}>(focused)</span>
            )}
          </div>
          <div>
            scrollTop:{' '}
            <b style={{ color: primary.scrollTop > 0 ? '#FF7575' : '#7BFF8C' }}>
              {primary.scrollTop}
            </b>{' '}
            peak: <b>{peakScrollTop}</b>
          </div>
          <div>
            scrollH/clientH: {primary.scrollHeight}/{primary.clientHeight}
          </div>
          <div>
            panel.rect: top={primary.panelRectTop} bot=
            {primary.panelRectBottom}
          </div>
          <div>
            translateY:{' '}
            <b
              style={{
                color:
                  Math.abs(primary.translateY) < 10 ? '#7BFF8C' : '#FF7575',
              }}
            >
              {primary.translateY}
            </b>
          </div>

          <div style={{ marginTop: 4, color: '#FFD27B' }}>focus</div>
          <div>
            tag: {snap.activeTag}
            {snap.activeInputMode ? ` [${snap.activeInputMode}]` : ''}
          </div>
          {snap.activeLabel && (
            <div>label: {snap.activeLabel.slice(0, 30)}</div>
          )}

          <div style={{ marginTop: 4, color: '#FFD27B' }}>viewport</div>
          <div>
            window.scrollY:{' '}
            <b
              style={{
                color: snap.windowScrollY > 0 ? '#FF7575' : '#7BFF8C',
              }}
            >
              {snap.windowScrollY}
            </b>{' '}
            peak: <b>{peakWindowScrollY}</b>
          </div>
          <div>
            innerH/vvH: {snap.innerHeight}/{snap.vvHeight}{' '}
            <span style={{ opacity: 0.6 }}>
              (kbd≈{snap.innerHeight - snap.vvHeight})
            </span>
          </div>
          <div>
            vv.offsetTop: {snap.vvOffsetTop} pageTop: {snap.vvPageTop}
          </div>

          <div style={{ marginTop: 4, color: '#FFD27B' }}>
            all sheets ({snap.sheets.length})
          </div>
          {snap.sheets.map((s, i) => (
            <div
              key={i}
              style={{
                opacity: i === snap.primaryIndex ? 1 : 0.6,
                fontSize: 9,
              }}
            >
              [{i}] {s.label.slice(0, 12)} ty={s.translateY}{' '}
              top={s.panelRectTop}
              {s.containsActive ? ' *' : ''}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
