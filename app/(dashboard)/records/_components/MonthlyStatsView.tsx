'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { getCategory, type CategoryId } from '@/lib/categories'
import { getIncomeCategory, type IncomeCategoryId } from '@/lib/incomeCategories'
import type { CategoryStatRow, AssetStatRow } from '@/lib/db/queries/transactions'
import type { IncomeCategoryStatRow } from '@/lib/db/queries/incomes'
import { StatsBreakdownToggle, type BreakdownView } from './StatsBreakdownToggle'
import { useRecordsTab } from './TabContext'
import { ToggleButton } from '@/app/(dashboard)/_components/ToggleButton'
import {
  applyDrillToParams,
  parseDrillFromSearchParams,
  type DrillFilter,
} from '@/lib/drill'

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
  /** Expense breakdown rows. Used on 全部 / 支出 tabs (and shape varies by view). */
  rows: ReadonlyArray<CategoryStatRow | AssetStatRow>
  /** Income breakdown rows (always by category). Used on 收入 tab. */
  incomeRows: ReadonlyArray<IncomeCategoryStatRow>
  expenseTotal: number
  incomeTotal: number
  /** When true (e.g. user scrolled to a month before group creation), the card
   *  is forced into compact mode and the toggle / expand button disappear. */
  forceCompact?: boolean
  /**
   * When true, the StatsBreakdownToggle hides its「愛物」option — set when
   * the structured filter has 愛物 active, which would degenerate the
   * by-asset breakdown to a single bar. The server has already auto-switched
   * `view` to 'category' in this case; the toggle just reflects that there's
   * nothing useful to switch to.
   */
  assetToggleHidden?: boolean
}

export function MonthlyStatsView({
  userId,
  view,
  rows,
  incomeRows,
  expenseTotal,
  incomeTotal,
  forceCompact = false,
  assetToggleHidden = false,
}: Props) {
  const t = useTranslations()
  const tab = useRecordsTab()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Active drill (URL-driven). Used to highlight the matching bar — clicking
  // it again clears the drill (toggle), clicking another bar swaps to it.
  const activeDrill = useMemo<DrillFilter | null>(
    () => parseDrillFromSearchParams(searchParams),
    [searchParams],
  )

  const setDrill = useCallback(
    (next: DrillFilter | null) => {
      const params = new URLSearchParams(searchParams.toString())
      applyDrillToParams(params, next)
      const qs = params.toString()
      router.replace(`/records${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [router, searchParams],
  )

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

  // Forced compact only for pre-creation months (no data worth visualising).
  const showCollapsed = forceCompact || (mounted && collapsed)
  const allowToggle = !forceCompact
  const isEmpty = expenseTotal === 0 && incomeTotal === 0
  const isIncomeTab = tab === 'income'

  // Pick which dataset drives the donut + detail bars. Income tab uses the
  // income breakdown; everywhere else uses expense (filtered by view toggle).
  const breakdownTotal = isIncomeTab ? incomeTotal : expenseTotal
  const hasBreakdown = breakdownTotal > 0

  const title =
    tab === 'all' ? t.records.stats.titleAll
    : tab === 'income' ? t.records.stats.titleIncome
    : t.records.stats.title

  // Donut center text — total when no drill, or the active slice's amount +
  // label when the user has tapped a slice or its corresponding bar. The
  // matching index lookup is the same shape used to render the bars, so the
  // chart center and the highlighted bar always stay in sync.
  const activeRowIndex = useMemo(() => {
    if (!activeDrill || !hasBreakdown) return -1
    if (isIncomeTab) {
      if (activeDrill.kind !== 'income') return -1
      return incomeRows.findIndex((r) => r.key === activeDrill.categoryId)
    }
    if (view === 'category') {
      if (activeDrill.kind !== 'category') return -1
      return (rows as CategoryStatRow[]).findIndex((r) => r.key === activeDrill.categoryId)
    }
    if (activeDrill.kind !== 'asset') return -1
    return (rows as AssetStatRow[]).findIndex((r) => r.key === activeDrill.assetId)
  }, [activeDrill, hasBreakdown, isIncomeTab, view, rows, incomeRows])

  const center = useMemo(() => {
    if (activeRowIndex < 0) {
      return {
        amount: breakdownTotal,
        label: t.records.stats.donutCenterTotal,
      }
    }
    if (isIncomeTab) {
      const r = incomeRows[activeRowIndex]
      const cat = getIncomeCategory(r.key)
      return { amount: r.total, label: t.incomeCategory[cat.id] ?? cat.label }
    }
    if (view === 'category') {
      const r = (rows as CategoryStatRow[])[activeRowIndex]
      const cat = getCategory(r.key)
      return { amount: r.total, label: t.category[cat.id] ?? cat.label }
    }
    const r = (rows as AssetStatRow[])[activeRowIndex]
    const label = r.key === null ? t.records.stats.otherSpend : r.name ?? t.records.stats.otherSpend
    return { amount: r.total, label }
  }, [activeRowIndex, breakdownTotal, isIncomeTab, view, rows, incomeRows, t])

  return (
    <section className="px-5 pt-4 pb-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-base font-semibold tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {title}
        </h2>
        {/* Title-row controls. The +/− button stays here in both states
            (collapsed and expanded) so the eye doesn't chase it. The
            breakdown toggle (分類/愛物) only shows in expanded mode and is
            also hidden on the income tab — income only has a category view
            (no asset breakdown query yet). */}
        {!isEmpty && allowToggle && (
          <div className="flex items-center gap-2">
            {!showCollapsed && hasBreakdown && !isIncomeTab && (
              <StatsBreakdownToggle value={view} hideAsset={assetToggleHidden} />
            )}
            <ToggleButton
              onClick={toggle}
              ariaLabel={showCollapsed ? t.records.stats.expand : t.records.stats.collapse}
              expanded={!showCollapsed}
            >
              {showCollapsed ? '+' : '−'}
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
        // Collapsed: summary line only. Expand button lives in the title row
        // (固定位置) so the user's eye doesn't have to chase it.
        <SummaryText expenseTotal={expenseTotal} incomeTotal={incomeTotal} t={t} />
      ) : (
        // Expanded: donut chart on top (with total / active-slice amount in
        // the center), then the detail-bar legend below — each bar's coloured
        // chip matches its pie slice. The bottom-of-chart total line was
        // removed when we moved the number into the donut center (#153).
        <>
          {hasBreakdown && (
            <div className="flex justify-center mt-2 mb-4">
              {isIncomeTab ? (
                <PieChart
                  rows={incomeRows}
                  total={breakdownTotal}
                  getSliceColor={(row) => getIncomeCategory((row as IncomeCategoryStatRow).key).chart}
                  getSliceKey={(row) => (row as IncomeCategoryStatRow).key}
                  activeIndex={activeRowIndex}
                  onSliceClick={(_row, i) => {
                    const r = incomeRows[i]
                    if (!r) return
                    const same =
                      activeDrill?.kind === 'income' && activeDrill.categoryId === r.key
                    setDrill(same ? null : { kind: 'income', categoryId: r.key as IncomeCategoryId })
                  }}
                  centerAmount={center.amount}
                  centerLabel={center.label}
                />
              ) : (
                <PieChart
                  rows={rows}
                  total={breakdownTotal}
                  getSliceColor={(row) => colorForRow(row, view).chart}
                  getSliceKey={(row, i) =>
                    view === 'category'
                      ? (row as CategoryStatRow).key
                      : (row as AssetStatRow).key ?? `__none_${i}`
                  }
                  activeIndex={activeRowIndex}
                  onSliceClick={(_row, i) => {
                    if (view === 'category') {
                      const r = (rows as CategoryStatRow[])[i]
                      if (!r) return
                      const same =
                        activeDrill?.kind === 'category' && activeDrill.categoryId === r.key
                      setDrill(same ? null : { kind: 'category', categoryId: r.key as CategoryId })
                      return
                    }
                    const r = (rows as AssetStatRow[])[i]
                    if (!r) return
                    const same =
                      activeDrill?.kind === 'asset' && activeDrill.assetId === r.key
                    setDrill(same ? null : { kind: 'asset', assetId: r.key })
                  }}
                  centerAmount={center.amount}
                  centerLabel={center.label}
                />
              )}
            </div>
          )}
          {hasBreakdown && (
            <ul className="space-y-3">
              {isIncomeTab
                ? incomeRows.map((r) => {
                    const active =
                      activeDrill?.kind === 'income' && activeDrill.categoryId === r.key
                    return (
                      <IncomeCategoryBar
                        key={r.key}
                        row={r}
                        total={breakdownTotal}
                        active={active}
                        onSelect={() =>
                          setDrill(active ? null : { kind: 'income', categoryId: r.key as IncomeCategoryId })
                        }
                        t={t}
                      />
                    )
                  })
                : view === 'category'
                  ? (rows as CategoryStatRow[]).map((r) => {
                      const active =
                        activeDrill?.kind === 'category' && activeDrill.categoryId === r.key
                      return (
                        <CategoryBar
                          key={r.key}
                          row={r}
                          total={breakdownTotal}
                          active={active}
                          onSelect={() =>
                            setDrill(active ? null : { kind: 'category', categoryId: r.key as CategoryId })
                          }
                          t={t}
                        />
                      )
                    })
                  : (rows as AssetStatRow[]).map((r) => {
                      const active =
                        activeDrill?.kind === 'asset' && activeDrill.assetId === r.key
                      return (
                        <AssetBar
                          key={r.key ?? '__none__'}
                          row={r}
                          total={breakdownTotal}
                          otherLabel={t.records.stats.otherSpend}
                          active={active}
                          onSelect={() =>
                            setDrill(active ? null : { kind: 'asset', assetId: r.key })
                          }
                        />
                      )
                    })}
            </ul>
          )}
        </>
      )}
    </section>
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
  incomeCategory: Record<IncomeCategoryId, string>
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
  // TODO(v0.17 currency): three bare digits + one trailing NT$ anchor (per
  // spec). formatAmount returns a fully-symbolized string, so we keep
  // toLocaleString here until formatAmount gains a digits-only mode.
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
 * (Recharts ~50KB+ ruled out for mobile bundle size). Slice colors are
 * sourced via a callback so the same chart renders expense (category /
 * asset) and income (category) breakdowns with their respective palettes.
 *
 * The center of the donut renders the active total + a label (#153 — moved
 * from a separate line below the chart so the number lives where the eye
 * lands). When the user taps a slice or the corresponding detail bar the
 * center swaps to that slice's amount, and non-active slices dim so the
 * highlighted wedge reads at a glance.
 */
function PieChart<R extends { total: number }>({
  rows,
  total,
  getSliceColor,
  getSliceKey,
  centerAmount,
  centerLabel,
  activeIndex = -1,
  onSliceClick,
  size = 156,
  innerRatio = 0.55,
}: {
  rows: ReadonlyArray<R>
  total: number
  getSliceColor: (row: R, i: number) => string
  getSliceKey: (row: R, i: number) => string
  centerAmount: number
  centerLabel: string
  /** Index (into `valued`-mapped rows) of the currently-active slice, or -1. */
  activeIndex?: number
  onSliceClick?: (row: R, i: number) => void
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
  const hasActive = activeIndex >= 0 && activeIndex < valued.length

  const renderCenter = () => (
    <CenterText cx={cx} cy={cy} amount={centerAmount} label={centerLabel} />
  )

  // Single-slice fast path (full ring) — avoids the 0-degree arc edge case.
  if (valued.length === 1) {
    const chart = getSliceColor(valued[0], 0)
    const onClick = onSliceClick ? () => onSliceClick(valued[0], 0) : undefined
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="pie chart">
        <circle
          cx={cx}
          cy={cy}
          r={rOuter}
          fill={chart}
          style={onClick ? { cursor: 'pointer' } : undefined}
          onClick={onClick}
        />
        <circle cx={cx} cy={cy} r={rInner} fill="var(--bg)" />
        {renderCenter()}
      </svg>
    )
  }

  // Min visible slice: when one category dominates (e.g. 99% transit), the
  // natural arcs for everything else fall below 1° and visually disappear.
  // We bump every non-zero slice up to MIN_FRACTION and pay for the boost by
  // shaving large slices proportionally, so the pie still totals one
  // revolution. The exact percentages are still readable in the legend below.
  const MIN_FRACTION = 3 / 360  // ~3° minimum arc — enough to register colour
  const naturalFractions = valued.map((r) => r.total / total)
  const isSmall = naturalFractions.map((f) => f < MIN_FRACTION)
  const totalBoost = naturalFractions.reduce(
    (sum, f, i) => sum + (isSmall[i] ? MIN_FRACTION - f : 0),
    0,
  )
  const largeSum = naturalFractions.reduce(
    (sum, f, i) => sum + (isSmall[i] ? 0 : f),
    0,
  )
  const fractions = largeSum > totalBoost
    ? naturalFractions.map((f, i) =>
        isSmall[i] ? MIN_FRACTION : f - (f / largeSum) * totalBoost,
      )
    : naturalFractions  // edge: every slice is below min — fall back to natural

  // Prefix-sum cumulative fractions so each slice has stable start/end without
  // mutating across map iterations (react-hooks/immutability).
  const cumulatives = fractions.reduce<number[]>(
    (acc, f) => { acc.push((acc.at(-1) ?? 0) + f); return acc },
    [0],
  )
  const slices = valued.map((row, i) => {
    const fraction = fractions[i]
    const startAngle = cumulatives[i] * 2 * Math.PI - Math.PI / 2
    const endAngle = cumulatives[i + 1] * 2 * Math.PI - Math.PI / 2

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

    // Dim non-active slices when one is selected — keeps the highlighted
    // wedge clearly readable while leaving the rest visible in context.
    const dim = hasActive && i !== activeIndex
    const onClick = onSliceClick ? () => onSliceClick(row, i) : undefined
    return (
      <path
        key={getSliceKey(row, i)}
        d={path}
        fill={getSliceColor(row, i)}
        style={{
          opacity: dim ? 0.35 : 1,
          cursor: onClick ? 'pointer' : undefined,
          transition: 'opacity 150ms',
        }}
        onClick={onClick}
      />
    )
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
      {renderCenter()}
    </svg>
  )
}

/**
 * Two-line text block centered inside the donut. The amount uses the serif
 * face (matches the page title family) so the number reads as a "headline,"
 * while the label below sits in the muted secondary color. Kept as plain
 * SVG `<text>` (not foreignObject) so font sizing remains predictable across
 * mobile WebKit / Android Chrome.
 */
function CenterText({
  cx,
  cy,
  amount,
  label,
}: {
  cx: number
  cy: number
  amount: number
  label: string
}) {
  return (
    <g aria-hidden>
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 18,
          fontWeight: 500,
          fill: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {amount.toLocaleString('en-US')}
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        style={{
          fontSize: 11,
          fill: 'var(--ink-3)',
        }}
      >
        {label}
      </text>
    </g>
  )
}

function CategoryBar({
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

function IncomeCategoryBar({
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

function AssetBar({
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
  const { tint, chart } = colorForRow(row, 'asset')
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
        className="w-full text-left flex flex-col gap-1 cursor-pointer rounded-[10px] -mx-2 px-2 py-1 transition-colors duration-150"
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
          <span className="tnum text-micro shrink-0" style={{ color: 'var(--ink-3)' }}>
            {/* Bare amount — currency anchored once on the total / summary line above. */}
            {pct.toFixed(0)}% · {amount.toLocaleString('en-US')}
          </span>
        </div>
        <div
          className="relative h-2 rounded-full overflow-hidden"
          style={{ background: active ? '#ffffff80' : tint }}
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
