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
    <section className="px-5 pt-10 pb-2">
      <div className="flex items-baseline justify-between mb-3">
        <h2
          className="text-base font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {t.records.stats.title}
        </h2>
        <StatsBreakdownToggle value={view} />
      </div>

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
          <div className="text-sm tnum mt-4 mb-3" style={{ color: 'var(--ink-2)' }}>
            {t.records.stats.total.replace('{amount}', total.toLocaleString('en-US'))}
          </div>
          <ul className="space-y-3">
            {view === 'category'
              ? (rows as CategoryStatRow[]).map((r) => (
                  <CategoryBar key={r.key} row={r} total={total} t={t} />
                ))
              : (rows as AssetStatRow[]).map((r) => (
                  <AssetBar key={r.key ?? '__none__'} row={r} total={total} otherLabel={t.records.stats.otherSpend} />
                ))}
          </ul>
        </>
      )}
    </section>
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
  return (
    <Bar
      label={label}
      pct={pct}
      amount={row.total}
      tint="var(--surface)"
      chart="var(--ink-2)"
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
