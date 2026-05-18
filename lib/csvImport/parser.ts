/**
 * Buffer → parsed CSV for the authenticated import flow (issue #553).
 *
 * Reuses `lib/migrate/csv.ts` for encoding detection; adds tab-vs-comma
 * separator auto-detection that the anonymous /migrate preview doesn't need
 * (TSV exports are common from Numbers / Google Sheets copy-paste).
 */

import { decodeBytes, type DetectedEncoding } from '@/lib/migrate/csv'

export type { DetectedEncoding }
export type Separator = ',' | '\t'

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
  separator: Separator
}

export function detectEncoding(buffer: ArrayBuffer): DetectedEncoding {
  return decodeBytes(buffer).encoding
}

/** Pick whichever delimiter appears more often on the header line; ties go to comma. */
export function detectSeparator(firstLine: string): Separator {
  const commas = (firstLine.match(/,/g) ?? []).length
  const tabs = (firstLine.match(/\t/g) ?? []).length
  return tabs > commas ? '\t' : ','
}

export function parseCsvBuffer(buffer: ArrayBuffer): ParsedCsv {
  const { text } = decodeBytes(buffer)
  return parseCsvText(text)
}

export function parseCsvText(text: string): ParsedCsv {
  const firstBreak = text.search(/[\r\n]/)
  const firstLine = firstBreak === -1 ? text : text.slice(0, firstBreak)
  const separator = detectSeparator(firstLine)
  const records = tokenize(text, separator)
  if (records.length === 0) return { headers: [], rows: [], separator }
  const headers = records[0]!.map(h => h.trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < records.length; i++) {
    const fields = records[i]!
    if (fields.length === 1 && fields[0] === '') continue
    const row: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]!] = fields[c] ?? ''
    }
    rows.push(row)
  }
  return { headers, rows, separator }
}

/**
 * RFC 4180-ish tokenizer, parameterised by separator. Handles quoted fields
 * with embedded separators / newlines / escaped quotes.
 */
function tokenize(text: string, sep: Separator): string[][] {
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
    if (ch === sep) { row.push(field); field = ''; i++; continue }
    if (ch === '\r') {
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
  if (field !== '' || row.length > 0) {
    row.push(field); records.push(row)
  }
  return records
}
