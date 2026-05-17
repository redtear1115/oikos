'use client'

/**
 * Inline SVG donut chart used by MonthlyStatsView (#512 PR 6).
 *
 * Kept dep-free per the original spec — Recharts (~50KB+) was ruled out for
 * mobile bundle size. Slice colors are sourced via a callback so the same
 * chart renders expense (category / asset) and income (category) breakdowns
 * with their respective palettes.
 *
 * The center renders the active total + a label (#153 — moved into the donut
 * from a separate line below so the number lives where the eye lands). When
 * the user taps a slice or the corresponding detail bar, the center swaps to
 * that slice's amount and non-active slices dim so the highlighted wedge
 * reads at a glance.
 *
 * Min visible slice: when one category dominates (e.g. 99% transit), the
 * natural arcs for everything else fall below 1° and visually disappear.
 * We bump every non-zero slice up to a minimum (~3°) and pay for the boost
 * by shaving large slices proportionally, so the pie still totals one
 * revolution. The exact percentages remain readable in the legend below.
 */

const MIN_FRACTION = 3 / 360  // ~3° minimum arc — enough to register colour

export function MonthlyStatsPieChart<R extends { total: number }>({
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
