/**
 * Client-side CSV parsing for the /migrate landing pages.
 *
 * Pure functions only — no DOM, no React, no I/O. The React hook lives in
 * `useCsvPreview.ts` and composes these helpers around a `File` object.
 *
 * Why client-side: the /migrate pages are anonymous SEO entry points. Users
 * preview their data without signing up; only the post-preview CTA pushes them
 * into account creation + the real importer (which lives behind auth).
 */

export type MigrateSource = 'honeydue' | 'spendee' | 'cwmoney' | 'unknown'
export type DetectedEncoding = 'utf-8' | 'utf-8-bom' | 'big5'

export interface CsvRow {
  [column: string]: string
}

export interface DecodeResult {
  text: string
  encoding: DetectedEncoding
}

export interface ParseResult {
  headers: string[]
  rows: CsvRow[]
}

export interface CsvStats {
  totalRows: number
  estimatedExpenseRows: number
  dateRange: { first: string; last: string } | null
  topCategories: Array<{ name: string; count: number }>
}

// ──────────────────────────── Decoding ────────────────────────────

/**
 * Decode raw file bytes into text, detecting UTF-8 (with/without BOM) or Big5.
 * Big5 fallback exists for CWMoney and other Taiwan-era exports that still
 * ship in legacy encoding; we try UTF-8 first with `fatal: true` so invalid
 * sequences trigger the fallback rather than silently producing mojibake.
 */
export function decodeBytes(buffer: ArrayBuffer): DecodeResult {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    const text = new TextDecoder('utf-8').decode(bytes.subarray(3))
    return { text, encoding: 'utf-8-bom' }
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text, encoding: 'utf-8' }
  } catch {
    const text = new TextDecoder('big5').decode(bytes)
    return { text, encoding: 'big5' }
  }
}

// ──────────────────────────── Parsing ────────────────────────────

/**
 * Minimal RFC 4180-ish CSV parser. Handles quoted fields with commas,
 * embedded newlines, and escaped double-quotes. Pads short rows to header
 * length so downstream stats code doesn't have to null-check.
 */
export function parseCsv(text: string): ParseResult {
  const records = tokenize(text)
  if (records.length === 0) return { headers: [], rows: [] }
  const headers = records[0]!
  const rows: CsvRow[] = []
  for (let i = 1; i < records.length; i++) {
    const fields = records[i]!
    if (fields.length === 1 && fields[0] === '') continue // skip blank line
    const row: CsvRow = {}
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]!] = fields[c] ?? ''
    }
    rows.push(row)
  }
  return { headers, rows }
}

function tokenize(text: string): string[][] {
  const records: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\r') {
      // CRLF or lone CR — both end the row.
      row.push(field); field = ''; records.push(row); row = []
      i += text[i + 1] === '\n' ? 2 : 1
      continue
    }
    if (ch === '\n') {
      row.push(field); field = ''; records.push(row); row = []
      i++; continue
    }
    field += ch; i++
  }
  // Flush trailing field/row if file didn't end with newline.
  if (field !== '' || row.length > 0) {
    row.push(field); records.push(row)
  }
  return records
}

// ──────────────────────────── Source detection ────────────────────────────

/**
 * Best-effort source detection by header signature. Returns 'unknown' rather
 * than guessing — per-source pages can still display useful previews via
 * the generic column-name heuristics in `computeStats`.
 */
export function detectSource(headers: readonly string[]): MigrateSource {
  const lowered = headers.map(h => h.trim().toLowerCase())
  const has = (name: string) => lowered.includes(name)
  const hasAll = (...names: string[]) => names.every(has)

  // CWMoney: 中文欄位（日期 + 金額 + 類別）
  if (headers.some(h => h.includes('日期')) && headers.some(h => h.includes('金額'))) {
    return 'cwmoney'
  }
  // Spendee: distinctive "Category name" + "Wallet" pair
  if (hasAll('date', 'amount') && (has('category name') || has('wallet'))) {
    return 'spendee'
  }
  // Honeydue: Date + Name + Category + Amount + Account
  if (hasAll('date', 'amount') && has('account') && (has('name') || has('description'))) {
    return 'honeydue'
  }
  return 'unknown'
}

// ──────────────────────────── Stats ────────────────────────────

const DATE_KEYS = ['date', 'Date', 'DATE', '日期', '日期 ', 'datetime', 'Datetime', 'transacted_at']
const AMOUNT_KEYS = ['amount', 'Amount', 'AMOUNT', '金額', 'value', 'Value']
const CATEGORY_KEYS = ['category', 'Category', 'Category name', '類別', 'type', 'Type', 'tag']

function pickColumn(row: CsvRow, candidates: readonly string[]): string | null {
  for (const k of candidates) if (k in row) return k
  return null
}

/**
 * Aggregate stats for the preview card. Heuristic over column names — handles
 * the three target sources plus any future CSV with date/amount/category
 * columns in common naming. Expense detection = amount string starts with '-'.
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
      // Negative-prefixed = expense in every source we currently handle.
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
