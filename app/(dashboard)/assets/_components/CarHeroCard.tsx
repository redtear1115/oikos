'use client'

import Link from 'next/link'
import { CarMark, isDarkColor, resolveCarColor } from './carColor'
import { formatAmount } from '@/lib/currency'
import { useTranslations } from '@/lib/i18n/client'

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
  compact?: boolean
  avgFuelEcon?: number | null
}

function FactChip({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 9px',
        borderRadius: 999,
        background: 'rgba(58,36,25,0.045)',
        color: 'var(--ink-2)',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </div>
  )
}

function fmtInt(n: number) {
  return n.toLocaleString('en-US')
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
  compact: _compact = false,
  avgFuelEcon,
}: Props) {
  const t = useTranslations()
  const swatch = resolveCarColor(color)

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

      {/* #259 — density aligned with AssetListItem: drop the bottom 本月/累計
       *  money panel and surface only the 本月 amount at the title row's right
       *  edge, mirroring how house/child/pet/plant/insurance/item cards render.
       *  累計 stays available on the car detail page. */}
      <div className="flex items-center gap-3 py-4 pr-5 pl-[22px]">
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
              style={{ fontSize: 'var(--fs-button)', color: 'var(--ink)', fontWeight: 600 }}
            >
              {name}
            </div>
            {plate && (
              <span
                className="shrink-0"
                style={{
                  fontSize: 'var(--fs-micro)',
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
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink-3)', marginTop: 2 }}
          >
            {subtitle}
          </div>
        </div>
        <div className="text-right shrink-0 ml-2">
          <div className="text-micro tracking-[0.4px]" style={{ color: 'var(--ink-3)' }}>{t.assetListItem.thisMonth}</div>
          <div className="tnum text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {formatAmount(monthAmount, 'twd')}
          </div>
        </div>
      </div>

      {avgFuelEcon != null && (
        <div
          style={{
            borderTop: '1px solid var(--hairline)',
            padding: '8px 16px 10px 22px',
            display: 'flex',
            gap: 8,
          }}
        >
          <FactChip label={`${avgFuelEcon.toFixed(1)} km/L`} />
        </div>
      )}
    </Link>
  )
}
