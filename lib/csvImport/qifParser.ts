/**
 * QIF (Quicken Interchange Format) → `PartialImportRow[]`.
 *
 * QIF is a line-oriented text format. Records are delimited by `^`, fields
 * are single-letter prefixed:
 *   D — date
 *   T — amount (negative = expense)
 *   M — memo
 *   P — payee
 *   L — category (or `[account]` for transfers; we ignore the transfer brace)
 *
 * Quicken's date dialects are messy: US `M/D/YY`, `M/D/YYYY`, apostrophe
 * shorthand `M/D'YY` (means 20YY), and ISO `YYYY-MM-DD` (some modern
 * exporters). 2-digit years pivot on 50: <50 → 20YY, ≥50 → 19YY.
 *
 * Like ofxParser, returns `PartialImportRow[]` so the same `validateRow`
 * pipeline can surface row-level issues to the import UI.
 */

import { mapCategory } from './mapper'
import type { PartialImportRow } from './types'

interface QifRecord {
  D?: string
  T?: string
  M?: string
  P?: string
  L?: string
}

export function parseQif(content: string): PartialImportRow[] {
  const rows: PartialImportRow[] = []
  let current: QifRecord = {}
  let hasField = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('!')) continue // !Type:Bank, !Account, !Option etc.
    if (line === '^') {
      if (hasField) {
        const row = buildRow(current)
        if (row) rows.push(row)
      }
      current = {}
      hasField = false
      continue
    }
    const code = line[0]!
    const value = line.slice(1)
    if (code === 'D' || code === 'T' || code === 'M' || code === 'P' || code === 'L') {
      current[code] = value
      hasField = true
    }
  }
  // Trailing record without a closing `^` (some exporters skip the last one)
  if (hasField) {
    const row = buildRow(current)
    if (row) rows.push(row)
  }
  return rows
}

function mkDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const result = new Date(y, m - 1, d)
  if (
    result.getFullYear() !== y ||
    result.getMonth() !== m - 1 ||
    result.getDate() !== d
  ) {
    return null
  }
  return result
}

function parseQifDate(raw: string): Date | null {
  const s = raw.trim()
  // Apostrophe shorthand: 1/15'26 → 2026
  let m = s.match(/^(\d{1,2})\/(\d{1,2})'(\d{2})$/)
  if (m) return mkDate(2000 + +m[3]!, +m[1]!, +m[2]!)
  // ISO yyyy-MM-dd
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return mkDate(+m[1]!, +m[2]!, +m[3]!)
  // US M/D/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return mkDate(+m[3]!, +m[1]!, +m[2]!)
  // US M/D/YY  — pivot on 50
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (m) {
    const yy = +m[3]!
    return mkDate(yy < 50 ? 2000 + yy : 1900 + yy, +m[1]!, +m[2]!)
  }
  return null
}

function buildRow(rec: QifRecord): PartialImportRow | null {
  if (!rec.D || !rec.T) return null
  const date = parseQifDate(rec.D)
  if (!date) return null
  const cleaned = rec.T.replace(/,/g, '').trim()
  const n = Number(cleaned)
  if (!isFinite(n) || n === 0) return null
  const isNegative = n < 0
  const amount = Math.round(Math.abs(n))
  // QIF transfer category notation: `[Account Name]` — treat as no category
  // so it falls back to 'other' rather than polluting the synonym table.
  const rawCategory = rec.L?.startsWith('[') ? '' : rec.L
  const category = mapCategory(rawCategory)
  const description = (rec.M ?? rec.P ?? '').trim()
  return {
    date,
    amount,
    type: isNegative ? 'expense' : 'income',
    category,
    description,
    paidBy: 'viewer',
    splitType: 'half',
  }
}
