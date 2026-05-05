'use client'

import Link from 'next/link'
import { CarMark, FALLBACK_CAR_COLOR, isDarkColor } from './carColor'

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

function fmtInt(n: number) {
  return n.toLocaleString('en-US')
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
  compact: _compact = false,
}: Props) {
  const swatch = color ?? FALLBACK_CAR_COLOR

  const subtitleParts: string[] = []
  if (year != null) subtitleParts.push(String(year))
  const brandModel = [brand, model].filter(Boolean).join(' ')
  if (brandModel) subtitleParts.push(brandModel)
  subtitleParts.push(`${latestOdometer != null ? fmtInt(latestOdometer) : '—'} km`)
  const subtitle = subtitleParts.join(' · ')

  return (
    <Link
      href={`/assets/${id}`}
      className="block no-underline relative"
      style={{
        background: 'var(--surface)',
        borderRadius: 18,
        border: '1px solid var(--hairline)',
        overflow: 'hidden',
        color: 'var(--ink)',
      }}
    >
      {/* Left accent — solid stripe + dashed echo, in the car color */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: 5,
          background: swatch,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 9, top: 8, bottom: 8,
          width: 0,
          borderLeft: `1.5px dashed ${swatch}`,
          opacity: 0.55,
        }}
      />

      <div style={{ padding: '14px 16px 16px 22px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {/* Inline car mark — silhouette stays in ink for light cars (so it's
           *  always visible on white surface); dashed orbit carries the color. */}
          <div className="shrink-0" aria-hidden="true">
            <CarMark
              size={40}
              stroke={isDarkColor(swatch) ? swatch : '#3A2419'}
              accent={swatch}
              orbitOpacity={0.55}
            />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="flex items-center gap-2">
              <div
                className="truncate"
                style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}
              >
                {name}
              </div>
              {plate && (
                <span
                  className="shrink-0"
                  style={{
                    fontSize: 10,
                    color: 'var(--ink-2)',
                    fontFamily: '"JetBrains Mono", monospace',
                    letterSpacing: 0.8,
                    background: 'rgba(58,36,25,0.06)',
                    padding: '2px 7px',
                    borderRadius: 5,
                  }}
                >
                  {plate}
                </span>
              )}
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
