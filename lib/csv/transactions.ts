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

function toRow(fields: readonly string[]): string {
  return fields.map(escapeField).join(',')
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
  }
}

/**
 * Build a UTF-8 CSV string (with BOM + CRLF) for the cash-transactions export.
 * Pure function — no I/O, easy to unit-test.
 */
export function buildTransactionsCsv(rows: readonly ExportTxnRow[], labels: ExportLabels): string {
  const c = labels.columns
  const header = toRow([c.date, c.description, c.amount, c.category, c.paidBy, c.splitType, c.notes])
  const body = rows.map(r => toRow([
    toTaipeiYmd(r.transactedAt),
    r.description,
    String(r.amount),
    categoryLabel(r.category, labels.category),
    r.paidByName,
    splitTypeLabel(r.splitType, labels.splitType),
    r.notes ?? '',
  ]))
  return BOM + [header, ...body].join(CRLF) + CRLF
}

/** Filename stem + today's local date (Asia/Taipei) → e.g. `futari-transactions-2026-05-09.csv` */
export function buildExportFilename(prefix: string, now: Date = new Date()): string {
  return `${prefix}-${toTaipeiYmd(now)}.csv`
}
