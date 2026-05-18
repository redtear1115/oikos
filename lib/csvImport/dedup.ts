/**
 * Hash-based duplicate detection for the CSV import pipeline (issue #555).
 *
 * Hash identity per row:
 *   sha256(YYYY-MM-DD | amount | paidBy | category | description[:10])
 *
 * `paidBy` stays as the logical 'viewer' / 'partner' marker that the mapper
 * emits — the DB-side equivalent (`lib/db/queries/csvImport.ts`) maps stored
 * profile UUIDs back to the same marker via `viewerProfileId` so the two
 * sides hash to the same value.
 *
 * Two duplicate classes are surfaced so the UI can label them differently:
 *   - `duplicate_db`    — hash already exists in the group's history
 *   - `duplicate_batch` — same row appears earlier in the same CSV
 *
 * DB duplicates take precedence: a row that matches an existing record stays
 * `duplicate_db` even if a later row in the batch would also collide with it.
 *
 * Uses `node:crypto` — this module is server-only. The anonymous /migrate
 * preview path keeps using `lib/migrate/csv.ts` and does not import this file.
 */

import { createHash } from 'node:crypto'
import type { ImportRow } from './types'

export type DedupStatus = 'new' | 'duplicate_db' | 'duplicate_batch'

export interface DedupResult {
  row: ImportRow
  hash: string
  status: DedupStatus
}

const DESCRIPTION_PREFIX_LEN = 10

export function computeHash(row: ImportRow): string {
  const dateStr = row.date.toISOString().slice(0, 10)
  const descPrefix = row.description.slice(0, DESCRIPTION_PREFIX_LEN)
  const payload = `${dateStr}|${row.amount}|${row.paidBy}|${row.category}|${descPrefix}`
  return createHash('sha256').update(payload).digest('hex')
}

export function deduplicateRows(
  rows: ImportRow[],
  existingHashes: Set<string>,
): DedupResult[] {
  const seenInBatch = new Set<string>()
  const out: DedupResult[] = []
  for (const row of rows) {
    const hash = computeHash(row)
    let status: DedupStatus
    if (existingHashes.has(hash)) {
      status = 'duplicate_db'
    } else if (seenInBatch.has(hash)) {
      status = 'duplicate_batch'
    } else {
      status = 'new'
      seenInBatch.add(hash)
    }
    out.push({ row, hash, status })
  }
  return out
}
