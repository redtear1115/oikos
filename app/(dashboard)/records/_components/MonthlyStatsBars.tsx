'use client'

/**
 * Detail-bar legend rows for MonthlyStatsView (#512 PR 6).
 *
 * One row per breakdown slice — colored chip (matching its donut slice),
 * label, percentage, raw amount, and a horizontal bar showing share. The
 * whole row is one tap target that fires `onSelect` for drill-down.
 *
 * Three variants share the underlying `Bar` primitive:
 *   - CategoryBar (expense category, tinted by lib/categories palette)
 *   - IncomeCategoryBar (income category, tinted by lib/incomeCategories)
 *   - AssetBar (per-asset color hashed from id; 未歸屬 → muted)
 *
 * `categoryColor` / `assetColor` are exported for callers that need the chart
 * palette to drive pie slices alongside these bars.
 */

import { getCategory, type CategoryId } from '@/lib/categories'
import { getIncomeCategory, type IncomeCategoryId } from '@/lib/incomeCategories'
import { ASSET_PALETTE, ASSET_NULL_COLOR, ACTIVE_BAR_TRACK } from '@/lib/chartPalette'
import type { CategoryStatRow, AssetStatRow } from '@/lib/db/queries/transactions'
import type { IncomeCategoryStatRow } from '@/lib/db/queries/incomes'

export function categoryColor(row: CategoryStatRow): { tint: string; chart: string } {
  const cat = getCategory(row.key)
  return { tint: cat.tint, chart: cat.chart }
}

export function assetColor(row: AssetStatRow): { tint: string; chart: string } {
  if (row.key === null) {
    return { tint: 'var(--surface)', chart: ASSET_NULL_COLOR }
  }
  const idx = hashStr(row.key) % ASSET_PALETTE.length
  return { tint: 'var(--surface)', chart: ASSET_PALETTE[idx] }
}

// djb2 — stable per asset_id, used purely for color hashing.
function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h
}

export function CategoryBar({
  row,
  total,
  active,
  onSelect,
  t,
}: {
  row: CategoryStatRow
  total: number
  active: boolean
  onSelect: () => void
  t: { category: Record<CategoryId, string>; records: { stats: { drillFilterLabel: string; drillClearLabel: string } } }
}) {
  const cat = getCategory(row.key)
  const label = t.category[cat.id] ?? cat.label
  const pct = total > 0 ? (row.total / total) * 100 : 0
  return (
    <Bar
      label={label}
      pct={pct}
      amount={row.total}
      tint={cat.tint}
      chart={cat.chart}
      active={active}
      onSelect={onSelect}
      a11yLabel={
        active
          ? t.records.stats.drillClearLabel.replace('{label}', label)
          : t.records.stats.drillFilterLabel.replace('{label}', label)
      }
      data-category={cat.id}
    />
  )
}

export function IncomeCategoryBar({
  row,
  total,
  active,
  onSelect,
  t,
}: {
  row: IncomeCategoryStatRow
  total: number
  active: boolean
  onSelect: () => void
  t: { incomeCategory: Record<IncomeCategoryId, string>; records: { stats: { drillFilterLabel: string; drillClearLabel: string } } }
}) {
  const cat = getIncomeCategory(row.key)
  const label = t.incomeCategory[cat.id] ?? cat.label
  const pct = total > 0 ? (row.total / total) * 100 : 0
  return (
    <Bar
      label={label}
      pct={pct}
      amount={row.total}
      tint={cat.tint}
      chart={cat.chart}
      active={active}
      onSelect={onSelect}
      a11yLabel={
        active
          ? t.records.stats.drillClearLabel.replace('{label}', label)
          : t.records.stats.drillFilterLabel.replace('{label}', label)
      }
      data-income-category={cat.id}
    />
  )
}

export function AssetBar({
  row,
  total,
  otherLabel,
  active,
  onSelect,
}: {
  row: AssetStatRow
  total: number
  otherLabel: string
  active: boolean
  onSelect: () => void
}) {
  const label = row.key === null ? otherLabel : row.name ?? otherLabel
  const pct = total > 0 ? (row.total / total) * 100 : 0
  const { tint, chart } = assetColor(row)
  return (
    <Bar
      label={label}
      pct={pct}
      amount={row.total}
      tint={tint}
      chart={chart}
      active={active}
      onSelect={onSelect}
      a11yLabel={label}
      data-asset-id={row.key ?? ''}
    />
  )
}

function Bar({
  label,
  pct,
  amount,
  tint,
  chart,
  active,
  onSelect,
  a11yLabel,
  ...rest
}: {
  label: string
  pct: number
  amount: number
  tint: string
  chart: string
  active: boolean
  onSelect: () => void
  a11yLabel: string
} & React.HTMLAttributes<HTMLLIElement>) {
  // Floor of 2% so a non-zero amount is always visible at low share.
  const barPct = amount > 0 ? Math.max(pct, 2) : 0
  return (
    <li {...rest} className="list-none">
      {/* The whole row is one tap target — wrapping the existing layout in a
          full-width button (transparent / unstyled defaults) keeps the visual
          identical when not active and gives us a focus ring + keyboard
          activation for free. The active state borrows the bar's tint as a
          backdrop so the highlight reads even at a glance. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        aria-label={a11yLabel}
        className="w-full text-left flex flex-col gap-1 cursor-pointer rounded-chip -mx-2 px-2 py-1 transition-colors duration-150"
        style={{
          background: active ? tint : 'transparent',
          border: 'none',
        }}
      >
        <div className="flex items-baseline justify-between text-sm">
          <span className="flex items-center gap-2 min-w-0">
            {/* Colored chip — matches the corresponding pie slice exactly so this
                row functions as the chart's legend. */}
            <span
              aria-hidden
              className="inline-block rounded-full shrink-0"
              style={{ width: 10, height: 10, background: chart }}
            />
            <span
              style={{
                color: 'var(--ink)',
                fontWeight: active ? 600 : 400,
              }}
              className="truncate"
            >
              {label}
            </span>
          </span>
          <span className="tnum text-xs shrink-0" style={{ color: 'var(--ink-3)' }}>
            {/* Bare amount — currency anchored once on the total / summary line above. */}
            {pct.toFixed(0)}% · {amount.toLocaleString('en-US')}
          </span>
        </div>
        <div
          className="relative h-2 rounded-full overflow-hidden"
          style={{ background: active ? ACTIVE_BAR_TRACK : tint }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${barPct}%`,
              background: chart,
            }}
          />
        </div>
      </button>
    </li>
  )
}
