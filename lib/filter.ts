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
