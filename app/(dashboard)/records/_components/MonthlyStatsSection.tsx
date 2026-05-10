import { getTranslations } from '@/lib/i18n/t'
import { getCategory, type CategoryId } from '@/lib/categories'
import {
  monthlyStatsByCategory,
  monthlyStatsByAsset,
  type CategoryStatRow,
  type AssetStatRow,
} from '@/lib/db/queries/transactions'
import { MonthSwitcher } from './MonthSwitcher'
import { StatsBreakdownToggle, type BreakdownView } from './StatsBreakdownToggle'

// Color palette reused for the asset breakdown so stacked-chart segments and
// detail bars share a stable hue per asset_id (assets have no canonical color
// like categories do). Pulled from category.chart values for visual coherence.
const ASSET_PALETTE = [
  '#D4955F', '#7AA48E', '#C97A8E', '#7A7AB8',
  '#C8A840', '#A89274', '#607090', '#A8998A',
]
const ASSET_NULL_COLOR = '#B5B5C0'  // neutral for the "其他支出" (asset_id IS NULL) bucket

interface Props {
  groupId: string
  monthKey: string
  /** Inclusive lower bound — usually the group's creation month. Caller clamps. */
  minMonthKey: string
  /** Inclusive upper bound — usually the current Taipei month. Caller clamps. */
  maxMonthKey: string
  view: BreakdownView
}

export async function MonthlyStatsSection({ groupId, monthKey, minMonthKey, maxMonthKey, view }: Props) {
  const t = await getTranslations()

  const rows = view === 'asset'
    ? await monthlyStatsByAsset(groupId, monthKey)
    : await monthlyStatsByCategory(groupId, monthKey)

  const total = rows.reduce((acc, r) => acc + r.total, 0)

  return (
    <>
      <MonthSwitcher
        monthKey={monthKey}
        minMonthKey={minMonthKey}
        maxMonthKey={maxMonthKey}
      />

      {total === 0 ? (
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
          {/* Stacked horizontal bar — one segment per row, colored from the same
              palette the detail list uses below so the chart and list stay in sync. */}
          <div className="mt-5">
            <StackedBar rows={rows} total={total} view={view} />
          </div>

          <div className="text-sm tnum mt-3 mb-4" style={{ color: 'var(--ink-2)' }}>
            {t.records.stats.total.replace('{amount}', total.toLocaleString('en-US'))}
          </div>

          <div className="flex justify-end mb-3">
            <StatsBreakdownToggle value={view} />
          </div>

          <ul className="space-y-3">
            {view === 'category'
              ? (rows as CategoryStatRow[]).map((r) => (
                  <CategoryBar key={r.key} row={r} total={total} t={t} />
                ))
              : (rows as AssetStatRow[]).map((r) => (
                  <AssetBar
                    key={r.key ?? '__none__'}
                    row={r}
                    total={total}
                    otherLabel={t.records.stats.otherSpend}
                  />
                ))}
          </ul>
        </>
      )}
    </>
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

// djb2 — stable, fast, no crypto dep needed. Used purely for color hashing.
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
  // Floor of 2% so a bar with non-zero amount is always visible at low share.
  const barPct = amount > 0 ? Math.max(pct, 2) : 0
  return (
    <li {...rest} className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span style={{ color: 'var(--ink)' }}>{label}</span>
        <span className="tnum text-micro" style={{ color: 'var(--ink-3)' }}>
          {pct.toFixed(0)}% · NT${amount.toLocaleString('en-US')}
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
