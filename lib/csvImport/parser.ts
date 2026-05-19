/**
 * Buffer → parsed CSV — the canonical CSV reader for both the authenticated
 * import wizard and the anonymous /migrate preview pages (issue #623).
 *
 * Encoding detection covers UTF-8 (with/without BOM) and Big5 — the Big5
 * fallback exists for CWMoney and other Taiwan-era exports that still ship in
 * legacy encoding; we try UTF-8 first with `fatal: true` so invalid sequences
 * trigger the fallback rather than silently producing mojibake.
 *
 * The tokenizer is parameterised by separator so the wizard can accept TSV
 * paste-ins from Numbers / Google Sheets; the marketing preview always sees
 * comma CSVs and ignores the detected separator.
 */

export type DetectedEncoding = 'utf-8' | 'utf-8-bom' | 'big5'
export type Separator = ',' | '\t'

export interface DecodeResult {
  text: string
  encoding: DetectedEncoding
}

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
  separator: Separator
}

// ──────────────────────────── Decoding ────────────────────────────

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

export function detectEncoding(buffer: ArrayBuffer): DetectedEncoding {
  return decodeBytes(buffer).encoding
}

// ──────────────────────────── Parsing ────────────────────────────

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
