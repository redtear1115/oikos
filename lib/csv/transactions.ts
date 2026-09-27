// CSV 匯出的欄位取捨與 Excel 相容性決定（BOM、CRLF、台北時區日期）見
// docs/superpowers/specs/csv-export-design.md。注意這支是「匯出」，匯入在
// lib/csvImport/。
import type { SplitType } from '@/lib/balance'
import type { CategoryId } from '@/lib/categories'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

// UTF-8 BOM (﻿). Excel needs this to detect UTF-8 and avoid mojibake on CJK fields.
const BOM = '﻿'
const CRLF = '\r\n'

/** RFC 4180: wrap fields containing comma/quote/CR/LF in double quotes; escape inner quotes by doubling. */
function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * A text cell a spreadsheet would read as a formula: its first visible
 * character is `=` `+` `-` `@` (or the full-width forms), possibly after
 * leading whitespace — `\s` covers space, tab, CR, LF, NBSP, U+3000 and
 * U+FEFF; the zero-width characters are listed explicitly. A cell that
 * itself starts with a tab or CR is also treated as unsafe.
 */
const FORMULA_LIKE = /^[\s\u200B-\u200D\u2060]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|^[\t\r]/

/**
 * Text cells come from what people typed (description, notes, names) or
 * from labels, so they are made spreadsheet-safe: a formula-looking cell
 * gets a leading `'`, which spreadsheets treat as "this is text", and every
 * text cell is quoted. The generated cells — date and integer amount — are
 * left as they are so they still open as a date and a number.
 */
function textField(value: string): string {
  const safe = FORMULA_LIKE.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

/** YYYY-MM-DD in Asia/Taipei (TW-only product; matches the rest of the codebase). */
const TAIPEI_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function toTaipeiYmd(d: Date): string {
  // en-CA emits YYYY-MM-DD already; safer than manual offset arithmetic.
  return TAIPEI_FORMATTER.format(d)
}

export interface ExportTxnRow {
  transactedAt: Date
  description: string
  amount: number
  category: string  // raw enum value (CategoryId) from DB
  splitType: SplitType
  paidByName: string
  notes: string | null
}

export interface ExportLabels {
  columns: Translations['csvExport']['columns']
  category: Translations['category']
  splitType: Translations['splitType']
}

function categoryLabel(raw: string, t: Translations['category']): string {
  // CategoryId values map 1:1 to t.category keys; unknown values pass through.
  const key = raw as CategoryId
  return t[key] ?? raw
}

function splitTypeLabel(raw: SplitType, t: Translations['splitType']): string {
  switch (raw) {
    case 'half':       return t.even
    case 'all_mine':   return t.allMine
    case 'all_theirs': return t.allPartners
    case 'weighted':   return (t as Record<string, string>).weighted ?? raw
  }
}

/**
 * Build a UTF-8 CSV string (with BOM + CRLF) for the cash-transactions export.
 * Pure function — no I/O, easy to unit-test.
 */
export function buildTransactionsCsv(rows: readonly ExportTxnRow[], labels: ExportLabels): string {
  const c = labels.columns
  const header = [c.date, c.description, c.amount, c.category, c.paidBy, c.splitType, c.notes]
    .map(textField).join(',')
  const body = rows.map(r => [
    escapeField(toTaipeiYmd(r.transactedAt)),
    textField(r.description),
    escapeField(String(r.amount)),
    textField(categoryLabel(r.category, labels.category)),
    textField(r.paidByName),
    textField(splitTypeLabel(r.splitType, labels.splitType)),
    textField(r.notes ?? ''),
  ].join(','))
  return BOM + [header, ...body].join(CRLF) + CRLF
}

/** Filename stem + today's local date (Asia/Taipei) → e.g. `futari-transactions-2026-05-09.csv` */
export function buildExportFilename(prefix: string, now: Date = new Date()): string {
  return `${prefix}-${toTaipeiYmd(now)}.csv`
}
