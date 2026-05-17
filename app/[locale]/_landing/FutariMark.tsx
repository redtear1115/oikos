// Brand mark — lifted exactly from /public/favicon.svg. Two stylised figures
// (head + leaf body) facing each other: one ink, one accent. The "two" of
// Futari, drawn once.

type Props = {
  size?: number
  className?: string
  /** Optional override; defaults to var(--ink). */
  inkColor?: string
  /** Optional override; defaults to var(--accent). */
  accentColor?: string
}

export function FutariMark({
  size = 32,
  className,
  inkColor = 'var(--ink)',
  accentColor = 'var(--accent)',
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(16 18.5) scale(0.55)">
        <path
          d="M 0 16 C -7 11, -15 6, -15 -2 C -15 -7, -11 -10, -7 -10 C -3 -10, -1 -8, 0 -5 Z"
          fill={inkColor}
        />
        <circle cx="-9" cy="-13" r="4" fill={inkColor} />
        <path
          d="M 0 16 C 7 11, 15 6, 15 -2 C 15 -7, 11 -10, 7 -10 C 3 -10, 1 -8, 0 -5 Z"
          fill={accentColor}
        />
        <circle cx="9" cy="-13" r="4" fill={accentColor} />
      </g>
    </svg>
  )
}

// Inline feature glyphs — intentionally simple, all stroke-based so they
// inherit chip color. Use `currentColor`.

export function DuoGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 19c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 19c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function AssetGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11 L12 5 L20 11 V19 H4 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="10" y="13" width="4" height="6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function ShieldGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 L20 6 V12 C 20 16.5 16.5 19.5 12 21 C 7.5 19.5 4 16.5 4 12 V 6 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.5 12 L11 14.5 L15.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function StatsGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19 V 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 19 V 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 19 V 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M22 19 V 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function ShieldOutlineGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size + 2} viewBox="0 0 12 14" fill="none" aria-hidden="true">
      <path
        d="M6 0.5 L11.5 3 V7 C 11.5 10.3 9 12.7 6 13.5 C 3 12.7 0.5 10.3 0.5 7 V 3 Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  )
}

export function ArrowRightGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12 H 19 M 13 6 L 19 12 L 13 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
