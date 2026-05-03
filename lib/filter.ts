import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'

/** Single-select dimensions use 'all' to mean "no filter". Multi-select dimensions use empty Set. */
export type PayerFilter = 'all' | 'mine' | 'theirs'
export type SplitFilter = 'all' | SplitType  // 'all' | 'all_mine' | 'all_theirs' | 'half'

export interface TxnFilter {
  payer: PayerFilter
  split: SplitFilter
  /** Empty set = no category filter. Includes only transaction CategoryIds; 'settle' is never selectable. */
  categories: Set<CategoryId>
}

export function defaultFilter(): TxnFilter {
  return { payer: 'all', split: 'all', categories: new Set() }
}

/** True if any dimension would narrow the feed. */
export function isFilterActive(f: TxnFilter): boolean {
  return f.payer !== 'all' || f.split !== 'all' || f.categories.size > 0
}

/** True if ANY transaction-only dimension is active (split or categories). Used to decide
 *  whether settlements should be hidden — settlements have no split_type / category, so
 *  applying those dims to them is meaningless and the safest UX is to hide them. */
export function hidesSettlements(f: TxnFilter): boolean {
  return f.split !== 'all' || f.categories.size > 0
}

/** Serialize for transport over server-action boundary (Sets aren't structured-clonable
 *  through Server Action arg serialization in some Next versions; we send arrays). */
export interface TxnFilterWire {
  payer: PayerFilter
  split: SplitFilter
  categories: CategoryId[]
}

export function toWire(f: TxnFilter): TxnFilterWire {
  return { payer: f.payer, split: f.split, categories: Array.from(f.categories) }
}

export function fromWire(w: TxnFilterWire): TxnFilter {
  return { payer: w.payer, split: w.split, categories: new Set(w.categories) }
}

/** Minimal row shape for filter matching — fields any feed row will have. */
export interface FilterableRow {
  paidBy: string
  splitType: SplitType | null   // null for settlements
  category: string              // 'settle' for settlements
  kind: 'transaction' | 'settlement'
}

/**
 * Returns whether a row passes the given filter.
 *
 * @param row - The row to test
 * @param filter - The active filter
 * @param viewerId - The signed-in user's id (used to resolve 'mine'/'theirs')
 * @param partnerId - The partner's user id (or null if no partner yet)
 */
export function matchesFilter(
  row: FilterableRow,
  filter: TxnFilter,
  viewerId: string,
  partnerId: string | null,
): boolean {
  // 誰付 dimension applies to both transactions and settlements
  if (filter.payer === 'mine' && row.paidBy !== viewerId) return false
  if (filter.payer === 'theirs') {
    if (!partnerId || row.paidBy !== partnerId) return false
  }

  // Settlements pass through if no transaction-only dim is active.
  // If split or categories filter is active, settlements are dropped entirely
  // (they have no split_type / category).
  if (row.kind === 'settlement') {
    return !hidesSettlements(filter)
  }

  // 分攤 dimension — transactions only
  if (filter.split !== 'all' && row.splitType !== filter.split) return false

  // 分類 dimension — transactions only
  if (filter.categories.size > 0 && !filter.categories.has(row.category as CategoryId)) {
    return false
  }

  return true
}
