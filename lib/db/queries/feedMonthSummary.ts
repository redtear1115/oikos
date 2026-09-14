/**
 * Per-Asia/Taipei-month aggregate for a records-feed tab, mirroring exactly
 * what that tab's pager (`listTransactionsPaged` / `listFeedAllPaged` /
 * `listIncomesPaged`) would show for rows in that calendar month — so the
 * month header in the feed never disagrees with the rows underneath it, and
 * never changes as more pages load (#1208).
 *
 * Defined in its own module (rather than alongside one of the three pagers)
 * so `lib/db/queries/transactions.ts` and `lib/db/queries/incomes.ts` can both
 * import it without an import cycle — `transactions.ts` already imports
 * `ResolvedIncomeFilter` from `incomes.ts`.
 */
export interface FeedMonthSummary {
  /** 'YYYY-MM', Asia/Taipei. */
  monthKey: string
  /** All rows the feed would show in that month, incl. settlements. */
  count: number
  /** SUM(amount) of kind='transaction' rows only. */
  expenseTotal: number
  /** SUM(amount) of kind='income' rows only. */
  incomeTotal: number
}
