'use client'

import { getCategory } from '@/lib/categories'
import { getIncomeCategory } from '@/lib/incomeCategories'
import { useTranslations } from '@/lib/i18n/client'
import type { DrillFilter } from '@/lib/drill'

interface Props {
  drill: DrillFilter
  /**
   * Asset name resolved server-side (in `page.tsx`) so the chip can read it
   * synchronously. Only meaningful when `drill.kind === 'asset'` and
   * `drill.assetId !== null` — `null` means the「其他」bar (no asset). When
   * the drill is a category / income kind, this is ignored.
   */
  assetName?: string | null
  onClear: () => void
}

/**
 * Filter chip rendered above the records feed when a stats-bar drill is
 * active. Displays a small colour swatch (matching the bar's chart colour for
 * visual continuity), the human label, and an inline X button to clear.
 *
 * Only renders meaningful drills — the parent decides whether to mount us at
 * all (e.g. it skips us on tabs where the drill doesn't apply).
 */
export function DrillFilterChip({ drill, assetName, onClear }: Props) {
  const t = useTranslations()

  let label: string
  let chart: string
  let tint: string
  if (drill.kind === 'category') {
    const cat = getCategory(drill.categoryId)
    label = t.category[cat.id] ?? cat.label
    chart = cat.chart
    tint = cat.tint
  } else if (drill.kind === 'income') {
    const cat = getIncomeCategory(drill.categoryId)
    label = t.incomeCategory[cat.id] ?? cat.label
    chart = cat.chart
    tint = cat.tint
  } else {
    // Asset kind — null is the「其他」bar; for a real asset, fall back to the
    // generic「未命名」label only if SSR lookup truly came back empty (asset
    // hard-deleted, which is unusual but defensible — UI shouldn't crash).
    label =
      drill.assetId === null
        ? t.records.stats.otherSpend
        : (assetName ?? t.records.stats.drillAssetUnknown)
    chart = 'var(--ink-2)'
    tint = 'var(--surface)'
  }

  return (
    <div
      className="inline-flex items-center gap-2 h-8 pl-2 pr-1 rounded-full text-xs font-medium"
      style={{
        background: tint,
        color: 'var(--ink)',
        border: '1px solid var(--toggle-border)',
      }}
    >
      <span
        aria-hidden
        className="inline-block rounded-full"
        style={{ width: 8, height: 8, background: chart }}
      />
      <span>{t.records.stats.drillChipPrefix}</span>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={t.records.stats.drillChipClear}
        className="oik-toggle h-6 w-6 grid place-items-center rounded-full bg-transparent border-0 cursor-pointer"
        style={{
          color: 'var(--ink-2)',
          transition: `background var(--toggle-transition), color var(--toggle-transition)`,
        }}
      >
        ×
      </button>
    </div>
  )
}
