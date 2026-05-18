/**
 * Per-source field mappers: raw CSV row → `PartialImportRow`.
 *
 * Mappers are *permissive* — they normalise whatever they can and leave the
 * rest as `undefined` for the validator to flag. Amount sign is consumed here
 * (negative → `type: 'expense'`, positive → `'income'`) and stored as a
 * positive integer to match Futari's schema (CashTransactions /
 * IncomeTransactions both store positive integers; the table choice carries
 * the sign).
 */

import { isValidCategoryId } from '@/lib/categories'
import type {
  HeaderMap,
  ImportRowType,
  PartialImportRow,
} from './types'

// ──────────────────────────── Date parsing ────────────────────────────

const RE_DASH    = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const RE_SLASH   = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/
const RE_US      = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/      // Honeydue ships US M/D/YYYY
const RE_COMPACT = /^(\d{4})(\d{2})(\d{2})$/
const RE_NUM     = /^\d+$/                                 // CWMoney i_date = Unix ms

function mkLocalDate(y: number, m: number, d: number): Date | null {
  // Construct via UTC then adjust — JS `new Date(y, m, d)` uses local TZ which
  // is fine but rolls over for invalid days (e.g. Feb 30 → Mar 2). Validate.
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const result = new Date(y, m - 1, d)
  if (result.getFullYear() !== y || result.getMonth() !== m - 1 || result.getDate() !== d) {
    return null
  }
  return result
}

export function parseDate(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  let m: RegExpMatchArray | null
  if ((m = s.match(RE_DASH))    !== null) return mkLocalDate(+m[1]!, +m[2]!, +m[3]!)
  if ((m = s.match(RE_SLASH))   !== null) return mkLocalDate(+m[1]!, +m[2]!, +m[3]!)
  if ((m = s.match(RE_COMPACT)) !== null) return mkLocalDate(+m[1]!, +m[2]!, +m[3]!)
  if ((m = s.match(RE_US))      !== null) return mkLocalDate(+m[3]!, +m[1]!, +m[2]!)
  if (RE_NUM.test(s)) {
    const n = parseInt(s, 10)
    // > 10^11 ≈ year 1973 in seconds; treat as milliseconds. Otherwise seconds.
    const ms = n > 1e11 ? n : n * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }
  // Last resort — let JS try. Returns Invalid Date for unparseable strings.
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

// ──────────────────────────── Amount parsing ────────────────────────────

export interface AmountParse {
  value: number      // absolute integer (rounded if input had decimals)
  isNegative: boolean
}

export function parseAmount(raw: string): AmountParse | null {
  const s = raw.replace(/,/g, '').trim()
  if (!s) return null
  const isNegative = s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'))
  const cleaned = s
    .replace(/^[+-]/, '')
    .replace(/^\((.*)\)$/, '$1')
    .replace(/[$¥€£NT$]/g, '')
    .trim()
  const n = Number(cleaned)
  if (!isFinite(n)) return null
  return { value: Math.round(Math.abs(n)), isNegative }
}

// ──────────────────────────── Category mapping ────────────────────────────

/**
 * Best-effort synonym table for non-Futari category strings. Keyed by lowercase
 * trimmed value. Unmapped strings fall through to 'other' so import never
 * blocks on an unknown category — the mapping wizard UI can refine later.
 */
const CATEGORY_SYNONYMS: Record<string, string> = {
  // Honeydue / Spendee English
  'food & dining':   'dining',
  'food and drink':  'dining',
  'restaurants':     'dining',
  'groceries':       'dining',
  'dining':          'dining',
  'shopping':        'clothing',
  'clothing':        'clothing',
  'apparel':         'clothing',
  'home':            'housing',
  'rent':            'housing',
  'mortgage':        'housing',
  'utilities':       'housing',
  'housing':         'housing',
  'transportation':  'transit',
  'transport':       'transit',
  'auto':            'transit',
  'gas':             'transit',
  'fuel':            'transit',
  'transit':         'transit',
  'entertainment':   'entertainment',
  'travel':          'entertainment',
  'recreation':      'entertainment',
  'health':          'health',
  'medical':         'health',
  'healthcare':      'health',
  'education':       'education',
  'school':          'education',
  'tuition':         'education',
  'fees':            'financial',
  'bank':            'financial',
  'financial':       'financial',
  'insurance':       'financial',
  // CWMoney 繁中
  '飲食':            'dining',
  '餐飲':            'dining',
  '吃飯':            'dining',
  '伙食':            'dining',
  '服飾':            'clothing',
  '衣服':            'clothing',
  '購物':            'clothing',
  '居住':            'housing',
  '房租':            'housing',
  '水電':            'housing',
  '家居':            'housing',
  '交通':            'transit',
  '油資':            'transit',
  '通勤':            'transit',
  '教育':            'education',
  '學費':            'education',
  '娛樂':            'entertainment',
  '休閒':            'entertainment',
  '旅遊':            'entertainment',
  '醫療':            'health',
  '保健':            'health',
  '金融':            'financial',
  '保險':            'financial',
}

export function mapCategory(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return 'other'
  if (isValidCategoryId(trimmed)) return trimmed
  const lower = trimmed.toLowerCase()
  return CATEGORY_SYNONYMS[lower] ?? CATEGORY_SYNONYMS[trimmed] ?? 'other'
}

// ──────────────────────────── Mappers ────────────────────────────

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (k in row && row[k] !== undefined && row[k] !== '') return row[k]!
  }
  return ''
}

function typeFromString(s: string): ImportRowType | null {
  const t = s.trim().toLowerCase()
  if (t === 'expense' || t === '支出' || t === 'debit' || t === 'out')   return 'expense'
  if (t === 'income'  || t === '收入' || t === 'credit' || t === 'in')   return 'income'
  return null
}

/** Honeydue exports: `Date, Name, Category, Amount, Account` with US M/D/YYYY
 *  dates and negative amounts for expenses. */
export function mapHoneydue(row: Record<string, string>): PartialImportRow {
  const date = parseDate(pick(row, 'Date', 'date'))
  const amt = parseAmount(pick(row, 'Amount', 'amount'))
  const out: PartialImportRow = {
    category: mapCategory(pick(row, 'Category', 'category')),
    description: pick(row, 'Name', 'Description', 'Memo', 'name', 'description').trim(),
    paidBy: 'viewer',
    splitType: 'half',
  }
  if (date) out.date = date
  if (amt) {
    out.amount = amt.value
    out.type = amt.isNegative ? 'expense' : 'income'
  }
  return out
}

/** Spendee exports: `Date, Wallet, Type, Category name, Amount, Currency, Note`.
 *  `Type` column is authoritative for expense/income (amounts are positive). */
export function mapSpendee(row: Record<string, string>): PartialImportRow {
  const date = parseDate(pick(row, 'Date', 'date'))
  const amt = parseAmount(pick(row, 'Amount', 'amount'))
  const typeStr = pick(row, 'Type', 'type')
  const explicitType = typeFromString(typeStr)
  const currency = pick(row, 'Currency', 'currency').trim()
  const out: PartialImportRow = {
    category: mapCategory(pick(row, 'Category name', 'Category', 'category')),
    description: pick(row, 'Note', 'Description', 'note', 'description').trim(),
    paidBy: 'viewer',
    splitType: 'half',
  }
  if (date) out.date = date
  if (amt) {
    out.amount = amt.value
    out.type = explicitType ?? (amt.isNegative ? 'expense' : 'income')
  }
  if (currency) {
    out.originalCurrency = currency.toUpperCase()
    if (amt) out.originalAmount = amt.value
  }
  return out
}

/** CWMoney exports: 中文 headers (`日期, 類別, 項目, 金額, 帳戶`) or the raw
 *  `i_date / i_kind / i_money / i_note` schema from VIP exports. */
export function mapCwmoney(row: Record<string, string>): PartialImportRow {
  const date = parseDate(pick(row, '日期', 'Date', 'i_date', 'date'))
  const amt = parseAmount(pick(row, '金額', 'Amount', 'i_money', 'amount'))
  // CWMoney's i_type is '0' for expense, '1' for income (per research notes).
  const rawType = pick(row, 'i_type', '類型', 'Type', 'type').trim()
  let explicitType: ImportRowType | null = null
  if (rawType === '0') explicitType = 'expense'
  else if (rawType === '1') explicitType = 'income'
  else explicitType = typeFromString(rawType)
  const out: PartialImportRow = {
    category: mapCategory(pick(row, '類別', 'Category', 'i_kind', 'category')),
    description: pick(row, '項目', '備註', 'Note', 'i_note', 'description').trim(),
    paidBy: 'viewer',
    splitType: 'half',
  }
  if (date) out.date = date
  if (amt) {
    out.amount = amt.value
    // CWMoney rarely uses negative amounts (it has i_type); fall back to sign
    // only when i_type is absent. Default-default is 'expense' (most rows).
    out.type = explicitType ?? (amt.isNegative ? 'expense' : 'expense')
  }
  return out
}

/** User-provided `HeaderMap` for arbitrary CSV layouts. */
export function mapGeneric(
  row: Record<string, string>,
  headerMap: HeaderMap,
): PartialImportRow {
  const date = parseDate(row[headerMap.date] ?? '')
  const amt = parseAmount(row[headerMap.amount] ?? '')
  const explicitType = headerMap.type
    ? typeFromString(row[headerMap.type] ?? '')
    : null
  const currency = headerMap.currency
    ? (row[headerMap.currency] ?? '').trim()
    : ''
  const out: PartialImportRow = {
    category: mapCategory(headerMap.category ? row[headerMap.category] : ''),
    description: (headerMap.description ? row[headerMap.description] ?? '' : '').trim(),
    paidBy: 'viewer',
    splitType: 'half',
  }
  if (date) out.date = date
  if (amt) {
    out.amount = amt.value
    out.type = explicitType ?? (amt.isNegative ? 'expense' : 'income')
  }
  if (currency) {
    out.originalCurrency = currency.toUpperCase()
    if (amt) out.originalAmount = amt.value
  }
  return out
}
