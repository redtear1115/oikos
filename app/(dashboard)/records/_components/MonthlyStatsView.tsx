'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { getCategory, type CategoryId } from '@/lib/categories'
import type { CategoryStatRow, AssetStatRow } from '@/lib/db/queries/transactions'
import { StatsBreakdownToggle, type BreakdownView } from './StatsBreakdownToggle'
import { useRecordsTab } from './TabContext'

const KEY_PREFIX = 'oikos_stats_collapsed_'

// Stable per-asset color for asset breakdown view. Picked from the same hue
// family as category.chart values so the chart and detail bars feel coherent
// regardless of which view is active.
const ASSET_PALETTE = [
  '#D4955F', '#7AA48E', '#C97A8E', '#7A7AB8',
  '#C8A840', '#A89274', '#607090', '#A8998A',
]
const ASSET_NULL_COLOR = '#B5B5C0'

interface Props {
  /** Per-user scope — multiple users on the same device keep independent state. */
  userId: string
  view: BreakdownView
  rows: ReadonlyArray<CategoryStatRow | AssetStatRow>
  expenseTotal: number
  incomeTotal: number
  /** When true (e.g. user scrolled to a month before group creation), the card
   *  is forced into compact mode and the toggle / expand button disappear. */
  forceCompact?: boolean
}

export function MonthlyStatsView({
  userId,
  view,
  rows,
  expenseTotal,
  incomeTotal,
  forceCompact = false,
}: Props) {
  const t = useTranslations()
  const tab = useRecordsTab()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Read persisted state on mount. SSR / first paint always renders expanded;
  // if localStorage says collapsed we flip after hydration (slight flash for
  // collapsed users — acceptable for a per-device preference).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`${KEY_PREFIX}${userId}`)
      if (stored === 'true') setCollapsed(true)
    } catch {
      // localStorage may throw in private mode / disabled storage. Stay expanded.
    }
    setMounted(true)
  }, [userId])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      window.localStorage.setItem(`${KEY_PREFIX}${userId}`, String(next))
    } catch {
      // Best-effort persistence; ignore failures.
    }
  }

  // Forced compact wins over user preference. Two triggers:
  // - server flag (pre-creation month — no data worth visualising)
  // - income tab — we don't have income-category breakdown yet, so the only
  //   meaningful surface is the summary line.
  const effectiveForceCompact = forceCompact || tab === 'income'
  const showCollapsed = effectiveForceCompact || (mounted && collapsed)
  const allowToggle = !effectiveForceCompact
  const isEmpty = expenseTotal === 0 && incomeTotal === 0
  const hasExpenses = expenseTotal > 0

  const title =
    tab === 'all' ? t.records.stats.titleAll
    : tab === 'income' ? t.records.stats.titleIncome
    : t.records.stats.title

  return (
    <section className="px-5 pt-4 pb-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-base font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {title}
        </h2>
        {/* Title-row controls only when expanded AND has content AND toggle
            is allowed. In collapsed mode the controls live inline with the
            summary row. */}
        {!isEmpty && !showCollapsed && allowToggle && (
          <div className="flex items-center gap-2">
            {hasExpenses && <StatsBreakdownToggle value={view} />}
            <ToggleButton onClick={toggle} ariaLabel={t.records.stats.collapse} expanded>
              −
            </ToggleButton>
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="text-center py-6">
          <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {t.records.stats.empty}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
            {t.records.stats.emptySub}
          </div>
        </div>
      ) : showCollapsed ? (
        // Collapsed: a single inline row replaces every visualisation.
        // Layout: [summary text]  [breakdown toggle]  [expand button].
        // breakdown toggle and expand button are hidden when forceCompact —
        // there's nothing to switch / expand into.
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <SummaryText expenseTotal={expenseTotal} incomeTotal={incomeTotal} t={t} />
          {allowToggle && (
            <div className="flex items-center gap-2 ml-auto">
              {hasExpenses && <StatsBreakdownToggle value={view} />}
              <ToggleButton onClick={toggle} ariaLabel={t.records.stats.expand} expanded={false}>
                +
              </ToggleButton>
            </div>
          )}
        </div>
      ) : (
        // Expanded: donut chart on top, then total line, then detail-bar
        // legend (each bar's coloured chip matches its pie slice). Stacked
        // bar dropped — the donut conveys the same proportion.
        <>
          {hasExpenses && (
            <div className="flex justify-center mt-2 mb-4">
              <PieChart rows={rows} total={expenseTotal} view={view} />
            </div>
          )}
          <div className="text-sm tnum mt-2 mb-4" style={{ color: 'var(--ink-2)' }}>
            {t.records.stats.total.replace('{amount}', expenseTotal.toLocaleString('en-US'))}
          </div>
          {hasExpenses && (
            <ul className="space-y-3">
              {view === 'category'
                ? (rows as CategoryStatRow[]).map((r) => (
                    <CategoryBar key={r.key} row={r} total={expenseTotal} t={t} />
                  ))
                : (rows as AssetStatRow[]).map((r) => (
                    <AssetBar
                      key={r.key ?? '__none__'}
                      row={r}
                      total={expenseTotal}
                      otherLabel={t.records.stats.otherSpend}
                    />
                  ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function ToggleButton({
  onClick,
  ariaLabel,
  expanded,
  children,
}: {
  onClick: () => void
  ariaLabel: string
  expanded: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={ariaLabel}
      className="h-7 w-7 grid place-items-center rounded-full cursor-pointer bg-transparent"
      style={{
        color: 'var(--ink-2)',
        border: '1px solid var(--hairline)',
        fontSize: 14,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

type StatsT = {
  records: {
    stats: {
      summaryExpense: string
      summaryIncome: string
      summaryNetIncome: string
      summaryNetExpense: string
      summaryNetEven: string
      otherSpend: string
    }
  }
  category: Record<CategoryId, string>
}

function SummaryText({
  expenseTotal,
  incomeTotal,
  t,
}: {
  expenseTotal: number
  incomeTotal: number
  t: StatsT
}) {
  const net = incomeTotal - expenseTotal
  const expenseStr = t.records.stats.summaryExpense.replace(
    '{amount}',
    expenseTotal.toLocaleString('en-US'),
  )
  const incomeStr = t.records.stats.summaryIncome.replace(
    '{amount}',
    incomeTotal.toLocaleString('en-US'),
  )
  const netStr =
    net === 0
      ? t.records.stats.summaryNetEven
      : net > 0
        ? t.records.stats.summaryNetIncome.replace('{amount}', net.toLocaleString('en-US'))
        : t.records.stats.summaryNetExpense.replace('{amount}', Math.abs(net).toLocaleString('en-US'))

  return (
    <div className="text-xs tnum" style={{ color: 'var(--ink-2)' }}>
      <span>{expenseStr}</span>
      <span className="mx-1.5" style={{ color: 'var(--ink-3)' }}>·</span>
      <span>{incomeStr}</span>
      <span className="mx-1.5" style={{ color: 'var(--ink-3)' }}>·</span>
      <span style={{ fontWeight: 500 }}>{netStr}</span>
      {/* One currency mark per line, at the end (per spec). The three numbers
          above are bare; this NT$ anchors them all. */}
      <span className="ml-1.5" style={{ color: 'var(--ink-3)' }}>NT$</span>
    </div>
  )
}

function colorForRow(
  row: CategoryStatRow | AssetStatRow,
  view: BreakdownView,
): { tint: string; chart: string } {
  if (view === 'category') {
    const cat = getCategory((row as CategoryStatRow).key)
    return { tint: cat.tint, chart: cat.chart }
  }
  const assetRow = row as AssetStatRow
  if (assetRow.key === null) {
    return { tint: 'var(--surface)', chart: ASSET_NULL_COLOR }
  }
  const idx = hashStr(assetRow.key) % ASSET_PALETTE.length
  return { tint: 'var(--surface)', chart: ASSET_PALETTE[idx] }
}

// djb2 — stable per asset_id, used purely for color hashing.
function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h
}

/**
 * Inline SVG donut chart — kept dep-free per the original spec
 * (Recharts ~50KB+ ruled out for mobile bundle size). Slice colors come from
 * the same `colorForRow` helper as the detail-bar legend dots, so the chart
 * and the legend stay visually coupled regardless of breakdown view.
 */
function PieChart({
  rows,
  total,
  view,
  size = 156,
  innerRatio = 0.55,
}: {
  rows: ReadonlyArray<CategoryStatRow | AssetStatRow>
  total: number
  view: BreakdownView
  size?: number
  innerRatio?: number
}) {
  if (total <= 0) return null
  const valued = rows.filter((r) => r.total > 0)
  if (valued.length === 0) return null

  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2 - 2
  const rInner = rOuter * innerRatio

  // Single-slice fast path (full ring) — avoids the 0-degree arc edge case.
  if (valued.length === 1) {
    const { chart } = colorForRow(valued[0], view)
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="pie chart">
        <circle cx={cx} cy={cy} r={rOuter} fill={chart} />
        <circle cx={cx} cy={cy} r={rInner} fill="var(--bg)" />
      </svg>
    )
  }

  let cumulative = 0
  const slices = valued.map((row, i) => {
    const fraction = row.total / total
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2
    cumulative += fraction
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2

    const xo1 = cx + rOuter * Math.cos(startAngle)
    const yo1 = cy + rOuter * Math.sin(startAngle)
    const xo2 = cx + rOuter * Math.cos(endAngle)
    const yo2 = cy + rOuter * Math.sin(endAngle)
    const xi1 = cx + rInner * Math.cos(endAngle)
    const yi1 = cy + rInner * Math.sin(endAngle)
    const xi2 = cx + rInner * Math.cos(startAngle)
    const yi2 = cy + rInner * Math.sin(startAngle)

    const largeArc = fraction > 0.5 ? 1 : 0
    // Donut wedge: outer arc → inner arc (reversed) → close
    const path = [
      `M ${xo1} ${yo1}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${xo2} ${yo2}`,
      `L ${xi1} ${yi1}`,
      `A ${rInner} ${rInner} 0 ${largeArc} 0 ${xi2} ${yi2}`,
      'Z',
    ].join(' ')

    const { chart } = colorForRow(row, view)
    const key = view === 'category'
      ? (row as CategoryStatRow).key
      : (row as AssetStatRow).key ?? `__none_${i}`
    return <path key={key} d={path} fill={chart} />
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Pie chart of ${valued.length} segments`}
    >
      {slices}
    </svg>
  )
}

function CategoryBar({
  row,
  total,
  t,
}: {
  row: CategoryStatRow
  total: number
  t: { category: Record<CategoryId, string> }
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
      data-category={cat.id}
    />
  )
}

function AssetBar({
  row,
  total,
  otherLabel,
}: {
  row: AssetStatRow
  total: number
  otherLabel: string
}) {
  const label = row.key === null ? otherLabel : row.name ?? otherLabel
  const pct = total > 0 ? (row.total / total) * 100 : 0
  const { tint, chart } = colorForRow(row, 'asset')
  return (
    <Bar
      label={label}
      pct={pct}
      amount={row.total}
      tint={tint}
      chart={chart}
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
  ...rest
}: {
  label: string
  pct: number
  amount: number
  tint: string
  chart: string
} & React.HTMLAttributes<HTMLLIElement>) {
  // Floor of 2% so a non-zero amount is always visible at low share.
  const barPct = amount > 0 ? Math.max(pct, 2) : 0
  return (
    <li {...rest} className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="flex items-center gap-2 min-w-0">
          {/* Colored chip — matches the corresponding pie slice exactly so this
              row functions as the chart's legend. */}
          <span
            aria-hidden
            className="inline-block rounded-full shrink-0"
            style={{ width: 10, height: 10, background: chart }}
          />
          <span style={{ color: 'var(--ink)' }} className="truncate">{label}</span>
        </span>
        <span className="tnum text-micro shrink-0" style={{ color: 'var(--ink-3)' }}>
          {/* Bare amount — currency anchored once on the total / summary line above. */}
          {pct.toFixed(0)}% · {amount.toLocaleString('en-US')}
        </span>
      </div>
      <div
        className="relative h-2 rounded-full overflow-hidden"
        style={{ background: tint }}
        aria-label={label}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${barPct}%`,
            background: chart,
          }}
        />
      </div>
    </li>
  )
}
