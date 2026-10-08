'use client'

/**
 * Daily income/expense trend for the 收支 tab (#747). Replaces the donut on
 * that tab with a month-rhythm view:
 *
 *   - Expense bars point DOWN (warm orange), income bars point UP (green),
 *     sharing one zero line at the vertical centre.
 *   - A fold line traces the CUMULATIVE net (running Σ income − expense) from
 *     day 1, on its own scale so a month's drift stays on-chart even when it
 *     dwarfs any single day. Its end dot is green/orange by sign so you can
 *     read at a glance where the month landed.
 *   - Every day 1..N of the month is on the x-axis (zero-fill happens in the
 *     query), so gaps read as gaps rather than compressing the timeline.
 *
 * Kept dep-free (inline SVG) for the same reason the donut is — Recharts was
 * ruled out for mobile bundle size. See MonthlyStatsPieChart.
 */

import { useTranslations } from '@/lib/i18n/client'
import type { DailyTrendRow } from '@/lib/db/queries/transactions'
import { TREND_EXPENSE_COLOR, TREND_INCOME_COLOR } from '@/lib/chartPalette'

const VB_W = 320
const VB_H = 152 // plot only; day numbers are HTML below so they scale with text size
const PAD_X = 6
const PLOT_TOP = 6
const PLOT_BOTTOM = VB_H
const CENTER_Y = PLOT_TOP + (PLOT_BOTTOM - PLOT_TOP) / 2
const HALF_H = (PLOT_BOTTOM - PLOT_TOP) / 2 - 2 // tiny margin so bars don't kiss the edge
const INNER_W = VB_W - PAD_X * 2

export function DailyTrendChart({ data }: { data: ReadonlyArray<DailyTrendRow> }) {
  const t = useTranslations()
  if (data.length === 0) return null

  // Running cumulative net (income − expense) up to each day.
  const cumulative: number[] = []
  let running = 0
  for (const d of data) {
    running += d.totalIncome - d.totalExpense
    cumulative.push(running)
  }

  // Bars and line use independent scales sharing the zero line: bars by the
  // biggest single-day value, the line by the biggest cumulative swing.
  const maxDaily = Math.max(1, ...data.map((d) => Math.max(d.totalExpense, d.totalIncome)))
  const maxAbsCum = Math.max(1, ...cumulative.map((c) => Math.abs(c)))
  const barScale = HALF_H / maxDaily
  const lineScale = HALF_H / maxAbsCum

  const n = data.length
  const slotW = INNER_W / n
  const barW = Math.max(2, Math.min(slotW * 0.55, 6))
  const xOf = (i: number) => PAD_X + (i + 0.5) * slotW
  const yOfCum = (i: number) => CENTER_Y - cumulative[i] * lineScale

  const linePoints = data.map((_, i) => `${xOf(i).toFixed(1)},${yOfCum(i).toFixed(1)}`).join(' ')
  const lastCum = cumulative[n - 1]
  const endDotColor = lastCum >= 0 ? TREND_INCOME_COLOR : TREND_EXPENSE_COLOR

  // Sparse day ticks — labelling all 28–31 would be unreadable on mobile.
  const tickDays = Array.from(
    new Set([1, Math.round(n * 0.25), Math.round(n * 0.5), Math.round(n * 0.75), n]),
  ).filter((d) => d >= 1 && d <= n)

  return (
    <div className="mt-2 mb-3">
      <svg
        width="100%"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={t.records.stats.trendChartLabel}
        style={{ display: 'block' }}
      >
        {/* Zero baseline — bars hang off this, line crosses it on sign change. */}
        <line
          x1={PAD_X}
          y1={CENTER_Y}
          x2={VB_W - PAD_X}
          y2={CENTER_Y}
          stroke="var(--hairline)"
          strokeWidth={1}
        />

        {data.map((d, i) => {
          const x = xOf(i) - barW / 2
          const expH = d.totalExpense * barScale
          const incH = d.totalIncome * barScale
          return (
            <g key={d.day}>
              {incH > 0 && (
                <rect
                  x={x}
                  y={CENTER_Y - incH}
                  width={barW}
                  height={incH}
                  rx={1}
                  fill={TREND_INCOME_COLOR}
                />
              )}
              {expH > 0 && (
                <rect
                  x={x}
                  y={CENTER_Y}
                  width={barW}
                  height={expH}
                  rx={1}
                  fill={TREND_EXPENSE_COLOR}
                />
              )}
            </g>
          )
        })}

        {/* Cumulative-net fold line — the month's "where are we" story. */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={xOf(n - 1)} cy={yOfCum(n - 1)} r={2.5} fill={endDotColor} />

      </svg>

      {/* Day ticks (#1514). HTML, not SVG <text>: SVG text is sized in viewBox
          units, so at 2x system text the labels outgrew a fixed strip and the
          last one ("31") clipped at the right edge. Here the row grows with the
          text; first tick is start-anchored and last end-anchored so neither can
          cross the plot edge at any scale. The invisible nbsp holds the height. */}
      <div className="relative mt-1 text-xs tnum text-ink-3" aria-hidden="true">
        <span className="invisible">&nbsp;</span>
        {tickDays.map((day) => {
          const anchor = day === tickDays[0] ? 'start' : day === tickDays[tickDays.length - 1] ? 'end' : 'middle'
          return (
            <span
              key={day}
              data-tick-anchor={anchor}
              className={`absolute top-0 ${anchor === 'start' ? '' : anchor === 'end' ? '-translate-x-full' : '-translate-x-1/2'}`}
              style={{ left: `${((anchor === 'start' ? PAD_X : anchor === 'end' ? VB_W - PAD_X : xOf(day - 1)) / VB_W) * 100}%` }}
            >
              {day}
            </span>
          )
        })}
      </div>

      {/* Legend — colours decoded once, no per-bar labels. */}
      <div className="flex items-center justify-center gap-4 mt-1 text-xs" style={{ color: 'var(--ink-3)' }}>
        <LegendItem swatch={<span style={swatch(TREND_INCOME_COLOR)} />} label={t.records.stats.trendIncome} />
        <LegendItem swatch={<span style={swatch(TREND_EXPENSE_COLOR)} />} label={t.records.stats.trendExpense} />
        <LegendItem
          swatch={<span className="inline-block w-3 h-0" style={{ borderTop: '1.5px solid var(--ink)' }} />}
          label={t.records.stats.trendNet}
        />
      </div>
    </div>
  )
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      <span>{label}</span>
    </span>
  )
}

function swatch(color: string): React.CSSProperties {
  return { width: 9, height: 9, borderRadius: 2, background: color, display: 'inline-block' }
}
