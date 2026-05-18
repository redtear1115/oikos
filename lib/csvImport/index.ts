/**
 * `lib/csvImport/` — the validator + mapper layer that closes issue #553.
 *
 * Composes the four sub-modules into one entrypoint: a `File` goes in,
 * structured `ImportRow[]` + stats + per-row errors come out. Pure async —
 * no DB, no React, no UI. The import action and the preview UI both consume
 * this output.
 *
 * Auto-detect honours #561's marketing-side sniffer; when the file doesn't
 * match a known source it falls through to `'generic'` and the caller is
 * expected to supply a `HeaderMap` via the mapping wizard.
 */

export type { DetectedSource } from './detector'
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

export { detectEncoding, detectSeparator, parseCsvBuffer, parseCsvText } from './parser'
export { detectSource } from './detector'
export {
  mapCategory,
  mapCwmoney,
  mapGeneric,
  mapHoneydue,
  mapSpendee,
  parseAmount,
  parseDate,
} from './mapper'
export { validateRow } from './validator'
export { computeHash, deduplicateRows } from './dedup'
export type { DedupResult, DedupStatus } from './dedup'

import { parseCsvBuffer } from './parser'
import { detectSource, type DetectedSource } from './detector'
import {
  mapCwmoney,
  mapGeneric,
  mapHoneydue,
  mapSpendee,
} from './mapper'
import { validateRow } from './validator'
import { computeHash } from './dedup'
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
  /**
   * Dedup hash per row, parallel-indexed to `rows`. Lets the UI fetch the
   * group's existing hashes (via `getExistingTransactionHashes`) and flag
   * duplicates before the user commits to the import. See `dedup.ts`.
   */
  hashes: string[]
}

function pickMapper(source: DetectedSource, headerMap?: HeaderMap) {
  switch (source) {
    case 'honeydue': return (r: Record<string, string>) => mapHoneydue(r)
    case 'spendee':  return (r: Record<string, string>) => mapSpendee(r)
    case 'cwmoney':  return (r: Record<string, string>) => mapCwmoney(r)
    case 'generic':
      if (!headerMap) {
        throw new Error('headerMap is required when source is "generic"')
      }
      return (r: Record<string, string>) => mapGeneric(r, headerMap)
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
  return processBuffer(buffer, options)
}

/** Buffer-level entry — useful for tests and for callers that already hold bytes. */
export function processBuffer(
  buffer: ArrayBuffer,
  options: ProcessOptions = {},
): ProcessResult {
  const { headers, rows: rawRows } = parseCsvBuffer(buffer)
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
      hashes: [],
    }
  }
  const mapper = pickMapper(source, options.headerMap)

  const rows: ImportRow[] = []
  const hashes: string[] = []
  const errors: RowError[] = []
  const warnings: RowError[] = []
  const catCounts = new Map<string, number>()
  let dateMin: Date | null = null
  let dateMax: Date | null = null

  for (let i = 0; i < rawRows.length; i++) {
    const partial = mapper(rawRows[i]!)
    const result = validateRow(partial, i)
    if (result.warnings.length > 0) {
      warnings.push({ rowIndex: i, errors: result.warnings })
    }
    if (!result.ok || !isComplete(partial)) {
      errors.push({ rowIndex: i, errors: result.errors })
      continue
    }
    rows.push(partial)
    hashes.push(computeHash(partial))
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
      total: rawRows.length,
      valid: rows.length,
      invalid: errors.length,
      dateRange: dateMin && dateMax ? { from: dateMin, to: dateMax } : null,
      topCategories,
    },
    hashes,
  }
}
