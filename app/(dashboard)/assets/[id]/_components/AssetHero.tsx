'use client'

import { resolveCarColor } from '../../_components/carColor'
import { useTranslations } from '@/lib/i18n/client'
import { avgEconHint } from '@/lib/fuelEconHint'
import { formatAmount, formatAmountParts } from '@/lib/currency'
import type { FuelType } from '@/lib/fuel'

interface AssetHeroProps {
  /** When omitted the card renders without the name/subtitle header row (headless mode). */
  name?: React.ReactNode
  brand: string | null
  model: string | null
  year: number | null
  fuelType: FuelType | null
  color: string | null
  monthAmount: number
  totalAmount: number
  avgEcon: number | null
  /**
   * Newest fuel log's `loggedAt` (ISO) in the current chapter, null when the
   * chapter has none. Replaces the old `fuelLogCount` (#1097): the count alone
   * could not tell 「窗內不足 2 筆」 from 「窗外有 5 筆、窗內 0 筆」, so a car
   * parked for half a year was told it needed at least 2 logs.
   */
  lastFuelAt: string | null
  /**
   * Past chapter view. #1338 — both aggregates are already scoped to the
   * chapter by `getAssetSummary`, so in a past chapter 「本月」 is 0 by
   * construction. Showing it there put 「本月 NT$0」 on the page, which is the
   * same quiet-zero the list stopped showing in #1323; the chapter total is
   * the only number that means anything once the chapter has closed.
   */
  isPast: boolean
  onEdit?: () => void
}

function EditPencilButton({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-[30px] h-[30px] rounded-chip shrink-0 inline-flex items-center justify-center align-middle ml-1.5 before:absolute before:-inset-[7px] before:content-[''] border-none"
      style={{ background: 'rgba(58,36,25,0.08)' }}
      aria-label={ariaLabel}
    >
      <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M8.2 1.8l2 2-6.4 6.4-2.4.4.4-2.4 6.4-6.4z"
          stroke="var(--ink)" strokeWidth="1.2"
          strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </button>
  )
}

export function AssetHero({
  name, brand, model, year, fuelType, color,
  monthAmount, totalAmount, avgEcon, lastFuelAt, isPast, onEdit,
}: AssetHeroProps) {
  const t = useTranslations()
  const isElectric = fuelType === 'electric'
  const econHint = avgEconHint(avgEcon, lastFuelAt ? new Date(lastFuelAt) : null)
  const swatch = resolveCarColor(color)

  // Shared subtitle — brand model · year. The plate is intentionally absent
  // here (#826): it's PII, masked + revealed in the dedicated 車牌 row below,
  // never rendered inline in the hero.
  const subtitle = (
    <div className="text-xs mt-1 tracking-[1px] flex items-center gap-1.5 text-ink-3 font-numeric">
      {(brand || model) && (
        <span>{[brand, model].filter(Boolean).join(' ')}</span>
      )}
      {year && (brand || model) && <span>·</span>}
      {year && <span>{year}</span>}
    </div>
  )

  // Shared header — serif name + edit pencil. The back button lives in a
  // sticky strip rendered by AssetDetailClient above this hero so it stays
  // visible while the page scrolls (#250).
  const header = (
    <div className="flex items-center">
      <div className="text-2xl font-medium tracking-tight min-w-0 font-serif text-ink">
        {name}
      </div>
      {onEdit && <EditPencilButton onClick={onEdit} ariaLabel={t.assetDetail.editAriaLabel} />}
    </div>
  )

  /**
   * Wrapping border in the car's color — replaces the previous left stripe +
   * dashed echo. The hero card now reads like a framed photo: the car's color
   * is the frame, contents stay neutral so numbers and text don't fight.
   */
  const FRAME_STYLE: React.CSSProperties = {
    border: `2.5px solid ${swatch}`,
  }

  if (isElectric) {
    return (
      <div className="px-3 pt-4 pb-3">
        <div className="px-5 pt-5 pb-5 rounded-3xl" style={FRAME_STYLE}>
          {name && header}
          {name && subtitle}
          <div className={`flex items-baseline gap-7 ${name ? 'mt-6' : ''}`}>
            {!isPast && (
              <>
                <Stat label={t.assetDetail.money.thisMonth} amount={monthAmount} accent={false} />
                <div className="w-px h-9 bg-hairline" />
              </>
            )}
            <Stat label={t.assetDetail.money.thisChapter} amount={totalAmount} accent />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 pt-4 pb-3">
      <div className="px-5 pt-5 pb-5 rounded-3xl" style={FRAME_STYLE}>
        {name && header}
        {name && subtitle}

        <div className="text-center mt-5 pb-1">
          <div className="text-xs font-mono uppercase tracking-[1.5px] text-ink-3">{t.assetDetail.car.avgEcon}</div>
          <div className="inline-flex items-baseline gap-1.5 mt-1.5">
            <span
              className="text-amount-lg font-medium tabular-nums leading-none text-ink"
              style={{ letterSpacing: '-2px' }}
            >
              {avgEcon !== null ? avgEcon.toFixed(1) : '—'}
            </span>
            <span className="text-sm font-medium text-ink-3">km/L</span>
          </div>
          <div className="text-xs font-mono mt-1 text-ink-3">
            {econHint === 'noLog'
              ? t.assetDetail.car.avgEconNoLog
              : econHint === 'stale'
              ? t.assetDetail.car.avgEconStale
              : econHint === 'needMore'
              ? t.assetDetail.car.avgEconNeedMore
              : t.assetDetail.car.avgEconRecent}
          </div>
        </div>

        {/* TODO(v0.17 currency): 'twd' hard-coded. #1399 blocks wiring a real
             baseCurrency: the main ledger stores whole units as typed, but
             formatAmountParts divides USD by 100 (cents semantics), so a
             USD-base group would render this at 1/100th its actual size
             until that's fixed — on top of AssetHero having no
             base-currency prop path today either. */}
        <div
          className="mt-5 flex rounded-2xl px-4 py-3 gap-2 border border-hairline"
          style={{ background: 'rgba(58,36,25,0.04)' }}
        >
          {!isPast && (
            <>
              <MiniStat label={t.assetDetail.money.thisMonth} value={formatAmount(monthAmount, 'twd')} />
              <div className="w-px bg-hairline" />
            </>
          )}
          <MiniStat label={t.assetDetail.money.thisChapter} value={formatAmount(totalAmount, 'twd')} />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, amount, accent }: { label: string; amount: number; accent: boolean }) {
  const dim = amount === 0
  // TODO(v0.17 currency): 'twd' hard-coded — #1399, see the MiniStat block above for why.
  const { symbol, digits } = formatAmountParts(amount, 'twd')
  return (
    <div>
      <div className="text-xs tracking-label mb-1 text-ink-3">{label}</div>
      <div
        // #1174 — 32 was off the type scale; the secondary stat drops to the
        // nearest static tier below (text-page, 26). 40 is only a clamp() floor.
        className={`font-numeric font-medium tnum tracking-[-1px] leading-none ${accent ? 'text-amount-md' : 'text-page'}`}
        style={{
          color: dim ? 'var(--ink-3)' : 'var(--ink)',
        }}
      >
        <span className="text-base mr-0.5 text-ink-2 font-medium">{symbol}</span>
        {digits}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1">
      <div className="text-xs font-mono tracking-wider text-ink-3">{label}</div>
      <div className="text-base font-medium tabular-nums mt-0.5 text-ink">{value}</div>
    </div>
  )
}
