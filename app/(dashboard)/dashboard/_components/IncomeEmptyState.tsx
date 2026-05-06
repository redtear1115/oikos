'use client'

import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'

interface Props {
  onAdd?: () => void
}

export function IncomeEmptyState({ onAdd }: Props) {
  const P = DEFAULT_INCOME_PALETTE  // mint

  // Constellation dot positions (scattered around the central halo)
  // Relative positions based on the design reference
  const dots = [
    { x: 22, y: 18, r: 1.6, o: 0.30 },
    { x: 78, y: 14, r: 2.2, o: 0.22 },
    { x: 12, y: 38, r: 1.2, o: 0.18 },
    { x: 90, y: 30, r: 1.8, o: 0.28 },
    { x: 32, y: 60, r: 2.4, o: 0.32 },
    { x: 70, y: 64, r: 1.5, o: 0.20 },
    { x: 18, y: 78, r: 1.8, o: 0.24 },
    { x: 82, y: 82, r: 1.2, o: 0.18 },
    { x: 50, y: 25, r: 1.4, o: 0.22 },
    { x: 60, y: 88, r: 2.0, o: 0.26 },
  ]

  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {/* Constellation SVG */}
      <div style={{ position: 'relative', width: '100%', height: 220, marginBottom: 24 }}>
        <svg
          width="100%"
          height="220"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0 }}
        >
          {/* Constellation dots */}
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill={P.ink}
              opacity={d.o}
            />
          ))}

          {/* Central halo — layered glow effect */}
          <circle cx="50" cy="50" r="12" fill={P.glow} opacity="0.6" />
          <circle cx="50" cy="50" r="8" fill={P.glow} opacity="0.4" />
          <circle cx="50" cy="50" r="5" fill={P.ink} opacity="0.25" />

          {/* Small center dot */}
          <circle cx="50" cy="50" r="2" fill={P.ink} opacity="0.7" />
        </svg>
      </div>

      {/* Caption */}
      <p
        className="text-sm mb-5"
        style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}
      >
        還沒記過家裡的進帳
      </p>

      {/* CTA — conditionally rendered */}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="h-10 px-6 rounded-full text-sm font-semibold cursor-pointer border-0"
          style={{
            background: P.tint,
            color: P.ink,
            border: `1px solid ${P.ink}30`,
          }}
        >
          記第一筆
        </button>
      )}
    </div>
  )
}
