import {
  cutsExpense,
  cutsIncome,
  hidesSettlements,
  splitFilterToTypes,
  type TxnFilter,
} from './filter'
import type { ResolvedTxnFilter } from './db/queries/transactions'
import type { ResolvedIncomeFilter } from './db/queries/incomes'

/**
 * Shared resolution of a domain `TxnFilter` (URL/UI shape) into the query-layer
 * `ResolvedTxnFilter` / `ResolvedIncomeFilter`. Previously inlined in both
 * `app/(dashboard)/records/page.tsx` (SSR feed + stats) and
 * `actions/transaction.ts` (pagination loaders); keeping one copy means the
 * 誰付→uuid collapse, burden resolution, and cross-kind cut rules can't drift
 * between the initial paint and the page-through.
 */

/**
 * Sentinel uuid used for 「誰付 = 對方」when the group is solo (no partner). The
 * `paid_by = ?` predicate then matches zero rows instead of erroring on a null
 * id — the correct semantic ("there is no partner whose rows to show").
 */
export const NO_PARTNER_SENTINEL = '00000000-0000-0000-0000-000000000000'

export interface ResolverGroup {
  memberA: string
  memberB: string | null
}

/** The other member of the pair from the viewer's perspective (null when solo). */
function partnerOf(group: ResolverGroup, viewerId: string): string | null {
  return group.memberA === viewerId ? group.memberB : group.memberA
}

/** Collapse the 誰付 dimension to a concrete user id, or null for "no filter". */
function resolvePayer(
  filter: TxnFilter,
  viewerId: string,
  partnerId: string | null,
): string | null {
  if (filter.payer === 'mine') return viewerId
  if (filter.payer === 'theirs') return partnerId ?? NO_PARTNER_SENTINEL
  return null
}

export function resolveTxnFilter(
  filter: TxnFilter,
  viewerId: string,
  group: ResolverGroup,
): ResolvedTxnFilter {
  const partnerId = partnerOf(group, viewerId)
  return {
    paidBy: resolvePayer(filter, viewerId, partnerId),
    splitTypes: splitFilterToTypes(filter.split),
    burden:
      filter.burden === 'all'
        ? null
        : { side: filter.burden, viewerId, partnerId },
    categories: Array.from(filter.categories),
    incomeCategories: Array.from(filter.incomeCategories),
    assetIds: Array.from(filter.assetIds),
    amountMin: filter.amountMin,
    amountMax: filter.amountMax,
    status: filter.status === 'all' ? null : filter.status,
    excludeSettlements: hidesSettlements(filter),
    cutAll: cutsExpense(filter),
  }
}

export function resolveIncomeFilter(
  filter: TxnFilter,
  viewerId: string,
  group: ResolverGroup,
): ResolvedIncomeFilter {
  const partnerId = partnerOf(group, viewerId)
  return {
    recipientId: resolvePayer(filter, viewerId, partnerId),
    assetIds: Array.from(filter.assetIds),
    incomeCategories: Array.from(filter.incomeCategories),
    amountMin: filter.amountMin,
    amountMax: filter.amountMax,
    cutAll: cutsIncome(filter),
  }
}
