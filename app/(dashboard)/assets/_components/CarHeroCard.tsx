'use client'

import Link from 'next/link'

interface Props {
  id: string
  name: string
  plate: string | null
  color: string | null
  year: number | null
  brand: string | null
  model: string | null
  latestOdometer: number | null
  monthAmount: number
  totalAmount: number
  avgFuelEcon: number | null
  compact?: boolean
}

const FALLBACK_COLOR = '#E8E4D8'

function fmtInt(n: number) {
  return n.toLocaleString('en-US')
}

function CarMark({ size, color, accent }: { size: number; color: string; accent: string }) {
  const sw = 1.8
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="29.5" stroke={accent} strokeOpacity="0.3"
        strokeWidth="1.3" strokeDasharray="1.5 3" fill="none" />
      <path d="M 12 38 L 14 30 C 14.5 27, 16 25.5, 19 25 L 27 23.5 C 30.5 23, 33.5 23, 37 23.5 L 45 25 C 48 25.5, 49.5 27, 50 30 L 52 38"
        stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M 10 42 L 10 38 L 54 38 L 54 42"
        stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M 20 30 L 23 25 M 44 30 L 41 25" stroke={color} strokeWidth={sw * 0.8}
        strokeLinecap="round" fill="none" opacity="0.55" />
      <circle cx="20" cy="44" r="3.5" fill={color} />
      <circle cx="44" cy="44" r="3.5" fill={accent} />
    </svg>
  )
}

function Stat({
  label,
  value,
  unit,
  align = 'left',
}: {
  label: string
  value: string
  unit: string
  align?: 'left' | 'center' | 'right'
}) {
  return (
    <div style={{ flex: 1, textAlign: align }}>
      <div
        style={{
          fontSize: 9,
          color: 'var(--ink-3)',
          letterSpacing: 1,
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        {label}
      </div>
      <div
        className="tnum"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--ink)',
          marginTop: 2,
        }}
      >
        {value}{' '}
        <span style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 500 }}>{unit}</span>
      </div>
    </div>
  )
}

/**
 * Determine if a hex color is "dark" enough that we should use light foreground.
 * Approximation via simple sRGB luminance threshold; matches the design
 * reference which switches mark/badge styling around `#3A2419`.
 */
function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  // Rec. 601 luma
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  return luma < 128
}

export function CarHeroCard({
  id,
  name,
  plate,
  color,
  year,
  brand,
  model,
  latestOdometer,
  monthAmount,
  totalAmount,
  avgFuelEcon,
  compact = false,
}: Props) {
  const swatch = color ?? FALLBACK_COLOR
  const dark = isDark(swatch)
  const markColor = dark ? '#FFFFFF' : '#3A2419'
  const accentColor = dark ? '#E08856' : '#8A7B5A'

  const subtitleParts: string[] = []
  if (year != null) subtitleParts.push(String(year))
  const brandModel = [brand, model].filter(Boolean).join(' ')
  if (brandModel) subtitleParts.push(brandModel)
  subtitleParts.push(`${latestOdometer != null ? fmtInt(latestOdometer) : '—'} km`)
  const subtitle = subtitleParts.join(' · ')

  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline"
      style={{
        background: 'var(--surface)',
        borderRadius: 18,
        border: '1px solid var(--hairline)',
        overflow: 'hidden',
        color: 'var(--ink)',
      }}
    >
      <div
        style={{
          height: compact ? 90 : 130,
          background: swatch,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CarMark size={compact ? 60 : 84} color={markColor} accent={accentColor} />
        {plate && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              right: 10,
              fontSize: 11,
              color: dark ? '#FFF6EC' : '#3A2419',
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: 0.8,
              background: dark ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.55)',
              padding: '3px 8px',
              borderRadius: 5,
            }}
          >
            {plate}
          </div>
        )}
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="truncate"
              style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}
            >
              {name}
            </div>
            <div
              className="truncate"
              style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}
            >
              {subtitle}
            </div>
          </div>
          <span
            aria-hidden="true"
            style={{ color: 'var(--ink-3)', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
          >
            ›
          </span>
        </div>
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(58,36,25,0.04)',
          }}
        >
          <Stat
            label="平均油耗"
            value={avgFuelEcon != null ? avgFuelEcon.toFixed(1) : '—'}
            unit="km/L"
          />
          <div style={{ width: 1, background: 'var(--hairline)' }} />
          <Stat label="本月" value={fmtInt(monthAmount)} unit="NT$" align="center" />
          <div style={{ width: 1, background: 'var(--hairline)' }} />
          <Stat label="累計" value={fmtInt(totalAmount)} unit="NT$" align="right" />
        </div>
      </div>
    </Link>
  )
}
