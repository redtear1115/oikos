import { db } from '@/lib/db/client'
import { cashTransactions } from '@/lib/db/schema'
import { and, eq, desc, isNull } from 'drizzle-orm'
import { PICKABLE_CATEGORIES, type CategoryId } from '@/lib/categories'

/**
 * #1822 — merchant memory for category suggestions.
 *
 * Finds the most recent transaction (by created_at) with a matching description
 * (normalized: case-insensitive, NFKC, trimmed) in the group. Returns the
 * category from that transaction, or undefined if no match exists.
 *
 * Only active (non-deleted) transactions are considered; soft-deleted rows
 * never surface.
 *
 * Normalized matching: "７−ＥＬＥＶＥＮ" (fullwidth) matches "7-eleven"
 * (halfwidth), and case is ignored. NFKC normalization handles fullwidth/
 * halfwidth and most compatibility characters; trimming removes leading/
 * trailing whitespace.
 */

/**
 * Normalize a merchant name for matching: NFKC (fullwidth/halfwidth), lowercase, trim.
 * Exported so the test suite can verify the real logic without duplicating it.
 */
export function normalizeMerchant(merchant: string): string {
  return merchant.normalize('NFKC').toLowerCase().trim()
}

export async function getCategoryForMerchant(
  groupId: string,
  merchant: string,
  dbOrTx: Pick<typeof db, 'select'> = db,
): Promise<CategoryId | undefined> {
  if (!merchant.trim()) return undefined

  // Normalize the search term the same way we'll normalize the stored values.
  // NFKC: fullwidth/halfwidth normalization ("７" → "7", "ＥＬＥＶＥＮ" → "ELEVEN")
  // toLowerCase: case-insensitive matching
  // trim: ignore leading/trailing whitespace
  const normalized = normalizeMerchant(merchant)
  if (!normalized) return undefined

  // Fetch recent non-deleted transactions for this group. We cannot rely solely
  // on LOWER(TRIM(description)) in SQL because PostgreSQL does not apply NFKC
  // normalization (it only does case folding). If the stored description has
  // fullwidth characters ("７−ＥＬＥＶＥＮ") and the incoming merchant is
  // halfwidth ("7-eleven"), or vice versa, a raw SQL comparison would miss the
  // match. So we fetch candidate rows (ordered by recency) and match their
  // descriptions client-side using the same normalizeMerchant logic.
  //
  // We normalize on read rather than storing a normalized column because:
  // 1. This query is only run on quick-add / pending-shortcut paths (low frequency)
  // 2. Description is user-visible and must preserve original casing/width
  // 3. Adding a normalized column would bloat every row for a rare query
  const rows = await dbOrTx
    .select({
      description: cashTransactions.description,
      category: cashTransactions.category,
    })
    .from(cashTransactions)
    .where(
      and(
        eq(cashTransactions.groupId, groupId),
        isNull(cashTransactions.deletedAt),
      ),
    )
    .orderBy(desc(cashTransactions.createdAt), desc(cashTransactions.transactedAt))
    .limit(100)  // fetch enough to handle typical variety; first match wins

  // Find the first row whose normalized description matches the normalized search term.
  const match = rows.find((row) => normalizeMerchant(row.description) === normalized)
  if (!match) return undefined

  const { category } = match
  // Only return the category if it's still a pickable id; if the category was
  // removed from PICKABLE_CATEGORIES since the record was written, treat it as
  // no match (the caller falls back to the URL/payload category or default).
  return PICKABLE_CATEGORIES.find((c) => c.id === category)?.id
}
