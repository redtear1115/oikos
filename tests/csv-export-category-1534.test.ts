import { describe, it, expect } from 'vitest'
import { buildTransactionsCsv, type ExportTxnRow } from '@/lib/csv/transactions'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// #1534 — the CSV export looked up the category label with `t[key] ?? raw`.
// For an inherited key the lookup hit Object.prototype, so the category cell
// held function source ("function Object() { [native code] }") instead of a
// label. Unknown values are meant to pass through unchanged.
const labels = {
  columns: zhTW.csvExport.columns,
  category: zhTW.category,
  splitType: zhTW.splitType,
}

function row(category: string): ExportTxnRow {
  return {
    transactedAt: new Date('2026-09-21T04:00:00Z'),
    description: '午餐',
    amount: 120,
    category,
    splitType: 'half',
    paidByName: '小明',
    notes: null,
  }
}

function categoryCell(category: string): string {
  const csv = buildTransactionsCsv([row(category)], labels)
  const dataLine = csv.split('\r\n')[1]!
  // date, description, amount, category, … — no field here contains a comma.
  return dataLine.split(',')[3]!
}

describe('CSV export category cell with an inherited-key category', () => {
  it.each(['constructor', '__proto__', 'toString'])('%s passes through as the raw value', (category) => {
    const cell = categoryCell(category)
    expect(cell).toBe(`"${category}"`)
    expect(cell).not.toMatch(/function|native code|\[object/)
  })

  it('a real category still exports its label', () => {
    expect(categoryCell('dining')).toBe(`"${zhTW.category.dining}"`)
  })
})
