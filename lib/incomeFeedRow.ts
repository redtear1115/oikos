import type { PagedIncomeRow } from '@/actions/income'
import type { PagedTxnRow } from '@/actions/transaction'
import type { IncomeCursor } from '@/lib/db/queries/incomes'
import type { TxnCursor } from '@/lib/db/queries/transactions'
import { loadMoreIncomes } from '@/actions/income'

export function incomeToFeedRow(r: PagedIncomeRow): PagedTxnRow {
  return {
    id: r.id,
    amount: r.amount,
    splitType: null,
    splitRatioA: null,
    description: r.source ?? '',
    category: r.category,
    paidBy: r.recipientId,
    transactedAt: r.occurredAt + 'T00:00:00.000Z',
    createdAt: r.createdAt,
    kind: 'income' as const,
    assetId: r.assetId,
    fuelLogId: null,
    notes: null,
  }
}

export function makeIncomeLoader(limit = 20, monthKey?: string) {
  return async (cursor: TxnCursor | null): Promise<PagedTxnRow[]> => {
    const incomeCursor: IncomeCursor | null = cursor
      ? { occurredAt: cursor.transactedAt.substring(0, 10), createdAt: cursor.createdAt }
      : null
    const rows = await loadMoreIncomes(incomeCursor, limit, monthKey)
    return rows.map(incomeToFeedRow)
  }
}
