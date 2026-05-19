/**
 * OFX (Open Financial Exchange) → `PartialImportRow[]`.
 *
 * Handles both OFX 1.x (SGML — leaf tags have no closing tag) and OFX 2.x
 * (well-formed XML). We don't pull in a full SGML/XML parser because the
 * subset we care about — `<STMTTRN>` blocks with `TRNAMT` / `DTPOSTED` /
 * `MEMO` / `NAME` / `TRNTYPE` leaves — is regex-friendly and the canonical
 * `ofx-js` library brings in a lot of weight for what amounts to ~5 fields.
 *
 * Sign convention matches Honeydue's CSV: negative TRNAMT → expense, positive
 * → income. The `amount` we emit is always the positive integer (the table
 * choice in the import action carries the sign).
 *
 * Returns `PartialImportRow[]` rather than `ImportRow[]` so it composes with
 * the same `validateRow` pipeline the CSV mappers use — bad rows surface as
 * row-indexed errors instead of throwing.
 */

import type { PartialImportRow } from './types'

const STMTTRN_RE = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi

export function parseOfx(content: string): PartialImportRow[] {
  const rows: PartialImportRow[] = []
  let match: RegExpExecArray | null
  STMTTRN_RE.lastIndex = 0
  while ((match = STMTTRN_RE.exec(content)) !== null) {
    const row = parseStmttrn(match[1]!)
    if (row) rows.push(row)
  }
  return rows
}

/**
 * Read a leaf value for `tag`. Tries XML form (`<TAG>v</TAG>`) first, then
 * falls back to SGML form (`<TAG>v` until newline or next `<`).
 */
function getTag(block: string, tag: string): string | null {
  const xml = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(block)
  if (xml) return decodeEntities(xml[1]!.trim())
  const sgml = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block)
  if (sgml) return decodeEntities(sgml[1]!.trim())
  return null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/** OFX dates: YYYYMMDD, YYYYMMDDHHMMSS, optionally with `.XXX[±HH:NAME]`. */
function parseOfxDate(raw: string): Date | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  const y = +m[1]!, mo = +m[2]!, d = +m[3]!
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const result = new Date(y, mo - 1, d)
  if (
    result.getFullYear() !== y ||
    result.getMonth() !== mo - 1 ||
    result.getDate() !== d
  ) {
    return null
  }
  return result
}

function parseStmttrn(block: string): PartialImportRow | null {
  const trnAmt = getTag(block, 'TRNAMT')
  const dtPosted = getTag(block, 'DTPOSTED')
  if (!trnAmt || !dtPosted) return null
  const date = parseOfxDate(dtPosted)
  if (!date) return null
  const n = Number(trnAmt.replace(/,/g, ''))
  if (!isFinite(n)) return null
  const isNegative = n < 0
  const amount = Math.round(Math.abs(n))
  const memo = getTag(block, 'MEMO') ?? ''
  const name = getTag(block, 'NAME') ?? ''
  const description = (memo || name).trim()
  return {
    date,
    amount,
    type: isNegative ? 'expense' : 'income',
    category: 'other',
    description,
    paidBy: 'viewer',
    splitType: 'half',
  }
}
