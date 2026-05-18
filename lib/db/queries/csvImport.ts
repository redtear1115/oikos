/**
 * Dedup-side queries for CSV import (issue #555).
 *
 * Returns the set of dedup hashes already present in a group's
 * `CashTransactions`, so the import preview can flag rows that collide with
 * existing history before the user confirms.
 *
 * The hash format mirrors `lib/csvImport/dedup.ts#computeHash` exactly —
 * keep the two in sync. paid_by UUIDs are mapped back to the logical
 * 'viewer' / 'partner' marker via `viewerProfileId` so the two sides match.
 *
 * Includes soft-deleted rows (no `deleted_at` filter): per the #555 spec,
 * a previously-deleted record still counts as "曾經有過" — re-importing it
 * should be flagged. Restricted to a rolling window (caller picks `fromDate`,
 * typically 3 years) to keep the working set small on large groups.
 */

import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { cashTransactions } from '@/lib/db/schema'

const DESCRIPTION_PREFIX_LEN = 10

export async function getExistingTransactionHashes(
  groupId: string,
  viewerProfileId: string,
  fromDate: Date,
): Promise<Set<string>> {
  const rows = await db
    .select({
      transactedAt: cashTransactions.transactedAt,
      amount: cashTransactions.amount,
      paidBy: cashTransactions.paidBy,
      category: cashTransactions.category,
      description: cashTransactions.description,
    })
    .from(cashTransactions)
    .where(
      and(
        eq(cashTransactions.groupId, groupId),
        gte(cashTransactions.transactedAt, fromDate),
      ),
    )

  const hashes = new Set<string>()
  for (const r of rows) {
    const dateStr = r.transactedAt.toISOString().slice(0, 10)
    const paidByMarker = r.paidBy === viewerProfileId ? 'viewer' : 'partner'
    const descPrefix = r.description.slice(0, DESCRIPTION_PREFIX_LEN)
    const payload = `${dateStr}|${r.amount}|${paidByMarker}|${r.category}|${descPrefix}`
    hashes.add(createHash('sha256').update(payload).digest('hex'))
  }
  return hashes
}
