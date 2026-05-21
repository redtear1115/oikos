'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { getCategory, type CategoryId } from '@/lib/categories'
import { getIncomeCategory, type IncomeCategoryId } from '@/lib/incomeCategories'
import type { CategoryStatRow, AssetStatRow } from '@/lib/db/queries/transactions'
import type { IncomeCategoryStatRow } from '@/lib/db/queries/incomes'
import { StatsBreakdownToggle, type BreakdownView } from './StatsBreakdownToggle'
import { MonthlyStatsPieChart } from './MonthlyStatsPieChart'
import { AssetBar, CategoryBar, IncomeCategoryBar, assetColor, categoryColor } from './MonthlyStatsBars'
import { useRecordsTab } from './TabContext'
import { ToggleButton } from '@/app/(dashboard)/_components/ToggleButton'
import {
  applyDrillToParams,
  parseDrillFromSearchParams,
  type DrillFilter,
} from '@/lib/drill'
import { statsCollapsedCookieName, writeBoolCookie } from '@/lib/uiPrefsCookie'

interface Props {
  /** Per-user scope — multiple users on the same device keep independent state. */
  userId: string
  /** Collapse state read from the cookie server-side so SSR matches the client. */
  initialCollapsed: boolean
  view: BreakdownView
  /** Expense breakdown by category — populated when `view === 'category'`; empty otherwise. */
  categoryRows: ReadonlyArray<CategoryStatRow>
  /** Expense breakdown by asset — populated when `view === 'asset'`; empty otherwise. */
  assetRows: ReadonlyArray<AssetStatRow>
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
  initialCollapsed,
  view,
  categoryRows,
  assetRows,
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
  const [collapsed, setCollapsed] = useState(initialCollapsed)

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

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    writeBoolCookie(statsCollapsedCookieName(userId), next)
  }

  // Forced compact only for pre-creation months (no data worth visualising).
  const showCollapsed = forceCompact || collapsed
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
      return categoryRows.findIndex((r) => r.key === activeDrill.categoryId)
    }
    if (activeDrill.kind !== 'asset') return -1
    return assetRows.findIndex((r) => r.key === activeDrill.assetId)
  }, [activeDrill, hasBreakdown, isIncomeTab, view, categoryRows, assetRows, incomeRows])

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
      const r = categoryRows[activeRowIndex]
      const cat = getCategory(r.key)
      return { amount: r.total, label: t.category[cat.id] ?? cat.label }
    }
    const r = assetRows[activeRowIndex]
    const label = r.key === null ? t.records.stats.otherSpend : r.name ?? t.records.stats.otherSpend
    return { amount: r.total, label }
  }, [activeRowIndex, breakdownTotal, isIncomeTab, view, categoryRows, assetRows, incomeRows, t])

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
                <MonthlyStatsPieChart
                  rows={incomeRows}
                  total={breakdownTotal}
                  getSliceColor={(row) => getIncomeCategory(row.key).chart}
                  getSliceKey={(row) => row.key}
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
              ) : view === 'category' ? (
                <MonthlyStatsPieChart
                  rows={categoryRows}
                  total={breakdownTotal}
                  getSliceColor={(row) => categoryColor(row).chart}
                  getSliceKey={(row) => row.key}
                  activeIndex={activeRowIndex}
                  onSliceClick={(_row, i) => {
                    const r = categoryRows[i]
                    if (!r) return
                    const same =
                      activeDrill?.kind === 'category' && activeDrill.categoryId === r.key
                    setDrill(same ? null : { kind: 'category', categoryId: r.key as CategoryId })
                  }}
                  centerAmount={center.amount}
                  centerLabel={center.label}
                />
              ) : (
                <MonthlyStatsPieChart
                  rows={assetRows}
                  total={breakdownTotal}
                  getSliceColor={(row) => assetColor(row).chart}
                  getSliceKey={(row, i) => row.key ?? `__none_${i}`}
                  activeIndex={activeRowIndex}
                  onSliceClick={(_row, i) => {
                    const r = assetRows[i]
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
                  ? categoryRows.map((r) => {
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
                  : assetRows.map((r) => {
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

