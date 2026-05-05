'use client'

import Link from 'next/link'
import { CarMark, carBandBackground, carForeground, FALLBACK_CAR_COLOR } from './carColor'

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
  compact = false,
}: Props) {
  const swatch = color ?? FALLBACK_CAR_COLOR
  const fg = carForeground(swatch)
  const bandBg = carBandBackground(swatch)

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
          background: bandBg,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CarMark
          size={compact ? 60 : 84}
          stroke={fg.markStroke}
          accent={fg.markAccent}
          orbitOpacity={fg.orbitOpacity}
        />
        {plate && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              right: 10,
              fontSize: 11,
              color: fg.plateInk,
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: 0.8,
              background: fg.plateBg,
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
