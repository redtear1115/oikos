/**
 * `lib/csvImport/` — the unified CSV layer (issue #623) that backs both the
 * authenticated import wizard and the anonymous /migrate preview pages.
 *
 * Composes the sub-modules into one entrypoint: a `File` goes in, structured
 * `ImportRow[]` + stats + per-row errors come out. Pure async — no DB, no
 * React, no UI. The import action and the preview UI both consume this output.
 *
 * Auto-detect uses the shared header sniffer in `detector.ts`; when the file
 * doesn't match a known source it falls through to `'generic'` and the caller
 * is expected to supply a `HeaderMap` via the mapping wizard.
 *
 * OFX / QIF take a separate codepath: `detectFormat` sniffs the decoded text
 * for `OFXHEADER:` / `<OFX>` / `!Type:`, and the file skips the CSV parser
 * to go straight to `ofxParser` / `qifParser` (issue #586).
 */

export type { DetectedSource, KnownCsvSource, MigrateSource } from './detector'
export type { DecodeResult, DetectedEncoding, ParsedCsv, Separator } from './parser'
export type { CsvRow, CsvStats } from './stats'
export type {
  HeaderMap,
  ImportPaidBy,
  ImportRow,
  ImportRowType,
  ImportSplitType,
  PartialImportRow,
  RowError,
  ValidationResult,
} from './types'

export {
  decodeBytes,
  detectEncoding,
  detectSeparator,
  parseCsvBuffer,
  parseCsvText,
} from './parser'
export { detectCsvSource, detectFormat, detectSource } from './detector'
export { computeStats } from './stats'
export {
  mapCategory,
  mapCwmoney,
  mapFutariGeneric,
  mapGeneric,
  mapHoneydue,
  mapSpendee,
  parseAmount,
  parseDate,
} from './mapper'
export { parseOfx } from './ofxParser'
export { parseQif } from './qifParser'
export { validateRow } from './validator'

import { decodeBytes, parseCsvText } from './parser'
import { detectFormat, detectSource, type DetectedSource } from './detector'
import {
  mapCwmoney,
  mapFutariGeneric,
  mapGeneric,
  mapHoneydue,
  mapSpendee,
} from './mapper'
import { parseOfx } from './ofxParser'
import { parseQif } from './qifParser'
import { validateRow } from './validator'
import type {
  HeaderMap,
  ImportRow,
  PartialImportRow,
  RowError,
} from './types'

export interface ProcessOptions {
  /** Force a specific source. Skips header sniffing. */
  source?: DetectedSource
  /** Required when source resolves to `'generic'`. */
  headerMap?: HeaderMap
}

export interface ProcessStats {
  total: number
  valid: number
  invalid: number
  dateRange: { from: Date; to: Date } | null
  topCategories: { key: string; count: number }[]
}

export interface ProcessResult {
  source: DetectedSource
  rows: ImportRow[]
  errors: RowError[]
  warnings: RowError[]
  stats: ProcessStats
}

function pickMapper(source: DetectedSource, headerMap?: HeaderMap) {
  switch (source) {
    case 'honeydue': return (r: Record<string, string>) => mapHoneydue(r)
    case 'spendee':  return (r: Record<string, string>) => mapSpendee(r)
    case 'cwmoney':  return (r: Record<string, string>) => mapCwmoney(r)
    case 'futari_generic': return (r: Record<string, string>) => mapFutariGeneric(r)
    case 'generic':
      if (!headerMap) {
        throw new Error('headerMap is required when source is "generic"')
      }
      return (r: Record<string, string>) => mapGeneric(r, headerMap)
    case 'ofx':
    case 'qif':
      throw new Error(`${source} does not use the CSV mapper path`)
  }
}

function isComplete(row: PartialImportRow): row is ImportRow {
  return (
    row.date instanceof Date &&
    typeof row.amount === 'number' &&
    typeof row.type === 'string' &&
    typeof row.category === 'string' &&
    typeof row.description === 'string' &&
    typeof row.paidBy === 'string' &&
    typeof row.splitType === 'string'
  )
}

export async function processFile(
  file: File,
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  const buffer = await file.arrayBuffer()
  // Filename hint: .ofx / .qif extensions force the format even if the
  // content sniff misses (e.g. unusual encoding stripped the header line).
  // Content sniff still runs and wins for the CSV vs CSV-with-weird-name case.
  if (!options.source) {
    const name = file.name.toLowerCase()
    if (name.endsWith('.ofx')) options = { ...options, source: 'ofx' }
    else if (name.endsWith('.qif')) options = { ...options, source: 'qif' }
  }
  return processBuffer(buffer, options)
}

/** Buffer-level entry — useful for tests and for callers that already hold bytes. */
export function processBuffer(
  buffer: ArrayBuffer,
  options: ProcessOptions = {},
): ProcessResult {
  const { text } = decodeBytes(buffer)
  // Format dispatch: explicit option wins, then content sniff.
  const format =
    options.source === 'ofx' || options.source === 'qif'
      ? options.source
      : detectFormat(text)
  if (format === 'ofx') return runNonCsv(parseOfx(text), 'ofx')
  if (format === 'qif') return runNonCsv(parseQif(text), 'qif')
  return runCsv(text, options)
}

function runCsv(text: string, options: ProcessOptions): ProcessResult {
  const { headers, rows: rawRows } = parseCsvText(text)
  const source = options.source ?? detectSource(headers)
  // Empty file: nothing to map. Bail before requiring a headerMap so callers
  // can probe the file shape without committing to a mapper choice.
  if (rawRows.length === 0) {
    return {
      source,
      rows: [],
      errors: [],
      warnings: [],
      stats: { total: 0, valid: 0, invalid: 0, dateRange: null, topCategories: [] },
    }
  }
  const mapper = pickMapper(source, options.headerMap)
  const partials = rawRows.map(r => mapper(r))
  return validatePartials(partials, source)
}

function runNonCsv(partials: PartialImportRow[], source: DetectedSource): ProcessResult {
  return validatePartials(partials, source)
}

function validatePartials(
  partials: PartialImportRow[],
  source: DetectedSource,
): ProcessResult {
  const rows: ImportRow[] = []
  const errors: RowError[] = []
  const warnings: RowError[] = []
  const catCounts = new Map<string, number>()
  let dateMin: Date | null = null
  let dateMax: Date | null = null

  for (let i = 0; i < partials.length; i++) {
    const partial = partials[i]!
    const result = validateRow(partial, i)
    if (result.warnings.length > 0) {
      warnings.push({ rowIndex: i, errors: result.warnings })
    }
    if (!result.ok || !isComplete(partial)) {
      errors.push({ rowIndex: i, errors: result.errors })
      continue
    }
    rows.push(partial)
    const key = partial.category
    catCounts.set(key, (catCounts.get(key) ?? 0) + 1)
    if (dateMin === null || partial.date < dateMin) dateMin = partial.date
    if (dateMax === null || partial.date > dateMax) dateMax = partial.date
  }

  const topCategories = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => ({ key, count }))

  return {
    source,
    rows,
    errors,
    warnings,
    stats: {
      total: partials.length,
      valid: rows.length,
      invalid: errors.length,
      dateRange: dateMin && dateMax ? { from: dateMin, to: dateMax } : null,
      topCategories,
    },
  }
}
