'use client'

import Link from 'next/link'
import { isDarkColor, resolveCarColor } from './carColor'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { formatAmount } from '@/lib/currency'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  id: string
  name: string
  /** #837 — true when an encrypted plate is stored; renders the masked chip.
   *  Plaintext never reaches the client (reveal happens on the detail page). */
  hasPlate: boolean
  color: string | null
  year: number | null
  brand: string | null
  model: string | null
  latestOdometer: number | null
  monthAmount: number
  compact?: boolean
  avgFuelEcon?: number | null
  lastFuelDate?: string | null
}

type ChipTone = 'neutral' | 'warning' | 'destructive' | 'saving'

const CHIP_TONES: Record<ChipTone, { bg: string; fg: string }> = {
  neutral:     { bg: 'rgba(58,36,25,0.045)', fg: 'var(--ink-2)' },
  warning:     { bg: 'var(--warning-soft)',     fg: 'var(--warning)' },
  destructive: { bg: 'var(--destructive-soft)', fg: 'var(--destructive)' },
  saving:      { bg: 'var(--saving-soft)',       fg: 'var(--saving)' },
}

function FactChip({ label, tone = 'neutral' }: { label: string; tone?: ChipTone }) {
  const { bg, fg } = CHIP_TONES[tone]
  return (
    <div
      className="px-2 py-1 rounded-full text-xs"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: bg,
        color: fg,
        fontWeight: 500,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </div>
  )
}

/** Solid-color square mark — matches design v2 CarCard icon mark. */
function CarListMark({ swatch, size = 40 }: { swatch: string; size?: number }) {
  const dark = isDarkColor(swatch)
  return (
    <div
      className="rounded-chip"
      style={{
        width: size,
        height: size,
        background: swatch,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 0 0 1px rgba(58,36,25,0.10)',
      }}
    >
      <AssetIcon
        type="car"
        size={Math.round(size * 0.5)}
        color={dark ? '#FFF6EC' : '#3A2419'}
      />
    </div>
  )
}

function fmtInt(n: number) {
  return n.toLocaleString('en-US')
}

export function CarHeroCard({
  id,
  name,
  hasPlate,
  color,
  year,
  brand,
  model,
  latestOdometer,
  monthAmount,
  compact = false,
  avgFuelEcon,
  lastFuelDate,
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
      className="block no-underline rounded-2xl"
      style={{
        background: 'var(--surface)',
        border: `1px solid color-mix(in srgb, ${swatch} 25%, transparent)`,
        overflow: 'hidden',
        color: 'var(--ink)',
      }}
    >
      <div className="flex items-center gap-3 py-4 px-5">
        <div className="shrink-0" aria-hidden="true">
          <CarListMark swatch={swatch} size={compact ? 36 : 44} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="flex items-center gap-2">
            <div
              className="truncate text-base"
              style={{ color: 'var(--ink)', fontWeight: 500 }}
            >
              {name}
            </div>
            {hasPlate && (
              // #826 — list context: the plate chip is rendered masked. The
              // detail page is where the user reveals via tap. We keep the
              // chip shape so the row's visual rhythm doesn't shift; only
              // the characters become opaque.
              <span
                // #1174 — the bullets are not a name; role="img" lets the
                // localized label replace them for screen readers.
                className="shrink-0 text-xs px-2 py-0.5 rounded-sm"
                role="img"
                aria-label={t.assetListItem.plateMaskedAriaLabel}
                style={{
                  color: 'var(--ink-3)',
                  fontFamily: '"JetBrains Mono", monospace',
                  letterSpacing: 0.8,
                  background: 'rgba(58,36,25,0.06)',
                }}
              >
                ●●●●●●
              </span>
            )}
          </div>
          <div
            className="truncate text-xs mt-0.5"
            style={{ color: 'var(--ink-3)' }}
          >
            {subtitle}
          </div>
        </div>
        <div className="text-right shrink-0 ml-2">
          <div className="text-xs tracking-[0.4px]" style={{ color: 'var(--ink-3)' }}>{t.assetListItem.thisMonth}</div>
          <div className="tnum text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {formatAmount(monthAmount, 'twd')}
          </div>
        </div>
      </div>

      {!compact && (avgFuelEcon != null || lastFuelDate != null) && (
        <div
          className="pt-2 pr-4 pb-2.5 pl-5.5"
          style={{
            borderTop: '1px solid var(--hairline)',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {avgFuelEcon != null && <FactChip label={`${avgFuelEcon.toFixed(1)} km/L`} />}
          {lastFuelDate != null && <FactChip label={t.assetListItem.lastRefuel.replace('{date}', lastFuelDate)} />}
        </div>
      )}
    </Link>
  )
}
