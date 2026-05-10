'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { getCategory, type CategoryId } from '@/lib/categories'
import type { CategoryStatRow, AssetStatRow } from '@/lib/db/queries/transactions'
import { MonthSwitcher } from './MonthSwitcher'
import { StatsBreakdownToggle, type BreakdownView } from './StatsBreakdownToggle'

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
  monthKey: string
  minMonthKey: string
  maxMonthKey: string
  view: BreakdownView
  rows: ReadonlyArray<CategoryStatRow | AssetStatRow>
  expenseTotal: number
  incomeTotal: number
}

export function MonthlyStatsView({
  userId,
  monthKey,
  minMonthKey,
  maxMonthKey,
  view,
  rows,
  expenseTotal,
  incomeTotal,
}: Props) {
  const t = useTranslations()
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

  const showCollapsed = mounted && collapsed
  const isEmpty = expenseTotal === 0 && incomeTotal === 0
  const hasExpenses = expenseTotal > 0

  return (
    <section className="px-5 pt-10 pb-2">
      <div className="flex items-baseline justify-between mb-3">
        <h2
          className="text-base font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {t.records.stats.title}
        </h2>
        {/* Collapse button at top-right only when expanded. In collapsed mode
            the expand button lives inline with the summary row below. */}
        {!isEmpty && !showCollapsed && (
          <ToggleButton onClick={toggle} ariaLabel={t.records.stats.collapse} expanded>
            −
          </ToggleButton>
        )}
      </div>

      <MonthSwitcher
        monthKey={monthKey}
        minMonthKey={minMonthKey}
        maxMonthKey={maxMonthKey}
      />

      {isEmpty ? (
        <div className="text-center py-10">
          <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {t.records.stats.empty}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
            {t.records.stats.emptySub}
          </div>
        </div>
      ) : (
        <>
          {/* Expanded chrome: stacked chart + total line */}
          {!showCollapsed && (
            <>
              {hasExpenses && (
                <div className="mt-5">
                  <StackedBar rows={rows} total={expenseTotal} view={view} />
                </div>
              )}
              <div className="text-sm tnum mt-3 mb-4" style={{ color: 'var(--ink-2)' }}>
                {t.records.stats.total.replace('{amount}', expenseTotal.toLocaleString('en-US'))}
              </div>
            </>
          )}

          {/* Combined row — summary text (collapsed only) + breakdown toggle +
              expand button (collapsed only). When expanded, only the toggle
              shows, right-aligned. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
            {showCollapsed && (
              <SummaryText
                expenseTotal={expenseTotal}
                incomeTotal={incomeTotal}
                t={t}
              />
            )}
            <div className="flex items-center gap-2 ml-auto">
              {hasExpenses && <StatsBreakdownToggle value={view} />}
              {showCollapsed && (
                <ToggleButton onClick={toggle} ariaLabel={t.records.stats.expand} expanded={false}>
                  +
                </ToggleButton>
              )}
            </div>
          </div>

          {/* Detail bars persist across collapsed/expanded — they're the
              concrete numbers, not the chart. Hidden when expense=0. */}
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

function StackedBar({
  rows,
  total,
  view,
}: {
  rows: ReadonlyArray<CategoryStatRow | AssetStatRow>
  total: number
  view: BreakdownView
}) {
  return (
    <div
      className="h-3 w-full rounded-full overflow-hidden flex"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      role="img"
      aria-label={`${total} stacked breakdown`}
    >
      {rows.map((r, i) => {
        const pct = (r.total / total) * 100
        const { chart } = colorForRow(r, view)
        const key = view === 'category'
          ? (r as CategoryStatRow).key
          : (r as AssetStatRow).key ?? `__none_${i}`
        return (
          <div
            key={key}
            style={{
              width: `${pct}%`,
              background: chart,
            }}
          />
        )
      })}
    </div>
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
        <span style={{ color: 'var(--ink)' }}>{label}</span>
        <span className="tnum text-micro" style={{ color: 'var(--ink-3)' }}>
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
