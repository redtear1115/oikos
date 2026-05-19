/**
 * Heuristic stats over raw CSV rows (issue #623 unified layer).
 *
 * Used by the anonymous /migrate preview to summarise an uploaded file before
 * the user signs up. Operates on the loose `Record<string, string>` rows
 * produced by `parser.ts` — no validation, no normalisation; the column-name
 * candidates cover the three target sources plus any future CSV with
 * date/amount/category columns in common naming.
 *
 * The authenticated importer has its own stats pass (`validatePartials` in
 * `index.ts`) that operates on already-validated `ImportRow[]`; this one is
 * the only stats path that runs against unvalidated rows.
 */

export interface CsvRow {
  [column: string]: string
}

export interface CsvStats {
  totalRows: number
  estimatedExpenseRows: number
  dateRange: { first: string; last: string } | null
  topCategories: Array<{ name: string; count: number }>
}

const DATE_KEYS = ['date', 'Date', 'DATE', '日期', 'datetime', 'Datetime', 'transacted_at']
const AMOUNT_KEYS = ['amount', 'Amount', 'AMOUNT', '金額', 'value', 'Value']
const CATEGORY_KEYS = ['category', 'Category', 'Category name', '類別', 'type', 'Type', 'tag']

function pickColumn(row: CsvRow, candidates: readonly string[]): string | null {
  for (const k of candidates) if (k in row) return k
  return null
}

/**
 * Aggregate stats for the preview card. Expense detection = amount string
 * starts with '-', which holds for every source the marketing flow currently
 * targets (Honeydue / Spendee / CWMoney).
 */
export function computeStats(rows: readonly CsvRow[]): CsvStats {
  if (rows.length === 0) {
    return { totalRows: 0, estimatedExpenseRows: 0, dateRange: null, topCategories: [] }
  }
  const first = rows[0]!
  const dateKey = pickColumn(first, DATE_KEYS)
  const amountKey = pickColumn(first, AMOUNT_KEYS)
  const categoryKey = pickColumn(first, CATEGORY_KEYS)

  let expenseCount = 0
  let dateMin: string | null = null
  let dateMax: string | null = null
  const catCounts = new Map<string, number>()

  for (const row of rows) {
    if (amountKey) {
      const raw = (row[amountKey] ?? '').trim()
      if (raw.startsWith('-')) expenseCount++
    }
    if (dateKey) {
      const d = (row[dateKey] ?? '').trim()
      if (d) {
        if (dateMin === null || d < dateMin) dateMin = d
        if (dateMax === null || d > dateMax) dateMax = d
      }
    }
    if (categoryKey) {
      const c = (row[categoryKey] ?? '').trim()
      if (c) catCounts.set(c, (catCounts.get(c) ?? 0) + 1)
    }
  }

  const topCategories = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  return {
    totalRows: rows.length,
    estimatedExpenseRows: expenseCount,
    dateRange: dateMin && dateMax ? { first: dateMin, last: dateMax } : null,
    topCategories,
  }
}
