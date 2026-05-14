import { db } from '@/lib/db/client'
import { cashTransactions, profiles } from '@/lib/db/schema'
import { and, eq, isNull, desc, sql, type SQL } from 'drizzle-orm'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import type { DrillFilter } from '@/lib/drill'
import type { RecordStatus } from '@/lib/validators'
import { type DateRange } from '@/lib/filter'
import type { EpochWindow } from './epoch'
import {
  amountClause,
  andClause,
  assetIdsClause,
  categoryInClause,
  cursorClause,
  dateColumnClause,
  dateRangeClause,
  eqValueClause,
  epochClause,
  splitTypeClause,
  statusClause,
} from './_predicates'

export type FeedKind = 'transaction' | 'settlement' | 'income'

export interface FeedRow {
  id: string
  amount: number
  splitType: 'all_mine' | 'all_theirs' | 'half' | 'weighted' | null  // null for settlements
  splitRatioA: number | null
  description: string
  category: string  // for settlements always 'settle'
  paidBy: string
  transactedAt: Date
  createdAt: Date
  kind: FeedKind
  assetId: string | null
  fuelLogId: string | null  // non-null when created by a FuelLog dual-write
  notes: string | null      // shared memo on a CashTransaction; always null for settlements/income
  status: RecordStatus      // 'pending' only on transactions; settlements/income are always 'settled'
  /** Original currency when this was a foreign-currency write. NULL for base-currency rows. */
  originalCurrency: string | null
  /** Original amount in the foreign currency's storage units. NULL for base-currency rows. */
  originalAmount: number | null
  /** Rate snapshot at write time. NULL for base-currency rows. */
  rateSnapshot: string | null
  /** Trip this transaction belongs to. NULL = no trip. */
  tripId: string | null
}

/**
 * Resolved filter: 誰付 dimension is collapsed to a concrete user id (or null = no filter).
 * 分攤 / categories / assetIds arrive as concrete arrays (empty array = no filter).
 */
export interface ResolvedTxnFilter {
  paidBy: string | null
  splitTypes: SplitType[]   // empty = all
  categories: CategoryId[]  // empty = all (expense categories)
  /**
   * Income categories. Used by `listFeedAllPaged` for the income branch of
   * the union (cash-only `listTransactionsPaged` ignores it). Empty = all
   * income passes. Carried on the same resolved filter rather than a
   * separate type so the caller can resolve once and pass once.
   */
  incomeCategories: string[]
  /**
   * Empty = all. Members are uuids OR ASSET_FILTER_NONE for the「未歸屬」bucket.
   * The query expands the sentinel into an `assetId IS NULL` predicate alongside
   * any uuid `IN (...)` clause, so a filter like `[uuidA, '__none__']` matches
   * "uuidA OR no-asset" the way the user expects from the chip UI.
   */
  assetIds: string[]
  /**
   * Inclusive amount bounds (NT$ integers). null on either side = open.
   * Applies to all kinds (cash / settlement / income) — every feed row has
   * `amount`, so this dim is orthogonal to the kind-cut rules.
   */
  amountMin: number | null
  amountMax: number | null
  /**
   * Cash-tx status filter. null = both pending and settled pass. A 'pending'
   * value forces `excludeSettlements=true` and the income branch to short-circuit
   * (handled via `cutAll` on the income side) — settlements + income are always
   * stored as 'settled'.
   */
  status: RecordStatus | null
  /** True when settlements should be excluded entirely. */
  excludeSettlements: boolean
  /**
   * True when an income-only dim is active without a compensating
   * expense-side dim (currently: incomeCategories set, expense categories
   * empty). The cash-transactions branch is short-circuited to nothing —
   * mirrors how the income query handles `cutAll` for expense-only dims.
   */
  cutAll?: boolean
}

export interface TxnRow {
  id: string
  amount: number
  splitType: 'all_mine' | 'all_theirs' | 'half' | 'weighted'
  splitRatioA: number | null
  description: string
  category: string
  paidBy: string
  transactedAt: Date
  assetId: string | null
  notes: string | null
  status: RecordStatus
}

/** Fetch most recent N active transactions for a group, scoped to an epoch window. */
export async function listRecentTransactions(
  groupId: string,
  limit = 5,
  epochWindow: EpochWindow,
): Promise<TxnRow[]> {
  const rows = await db
    .select({
      id: cashTransactions.id,
      amount: cashTransactions.amount,
      splitType: cashTransactions.splitType,
      splitRatioA: cashTransactions.splitRatioA,
      description: cashTransactions.description,
      category: cashTransactions.category,
      paidBy: cashTransactions.paidBy,
      transactedAt: cashTransactions.transactedAt,
      assetId: cashTransactions.assetId,
      notes: cashTransactions.notes,
      status: cashTransactions.status,
    })
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.groupId, groupId),
      isNull(cashTransactions.deletedAt),
      epochClause(cashTransactions.createdAt, epochWindow),
    ))
    .orderBy(desc(cashTransactions.transactedAt), desc(cashTransactions.createdAt))
    .limit(limit)
  return rows
}

export interface TxnCursor {
  transactedAt: string  // ISO
  createdAt: string     // ISO
}

/**
 * Options shape for the cash-tx feed page-through. Replaces the previous
 * positional signature — the param ordering had drifted between
 * `listTransactionsPaged` and `listFeedAllPaged` (filter / monthKey swapped)
 * which was a footgun for callers. All fields except `groupId` and `cursor`
 * are optional.
 */
export interface ListPagedOptions {
  groupId: string
  cursor: TxnCursor | null
  limit?: number
  filter?: ResolvedTxnFilter
  monthKey?: string
  drill?: DrillFilter | null
  dateRange?: DateRange | null
  epochWindow: EpochWindow
}

/**
 * Page through active transactions + settlements (newest first) using a composite
 * (transactedAt/settledAt, createdAt) cursor. Pass `cursor=null` for the first page.
 *
 * Settlements are normalized into the same row shape as transactions: settledAt → transactedAt,
 * COALESCE(note,'還款') → description, 'settle' → category, NULL → splitType.
 */
export async function listTransactionsPaged(opts: ListPagedOptions): Promise<FeedRow[]> {
  const { groupId, cursor, limit = 20, filter, monthKey, drill, dateRange, epochWindow } = opts

  // Income-kind drill on a cash-transaction query: short-circuit to empty
  // rather than returning unrelated cash rows. The page-1 refetch on this
  // tab will see zero results, which matches the "this drill has no rows
  // for this tab" contract.
  if (drill?.kind === 'income') return []
  // Same short-circuit for an income-only structured filter (e.g. user
  // picked an income category but no expense category — they're saying
  // "show me income only", so no cash rows should pass).
  if (filter?.cutAll) return []

  const epoch = andClause(epochClause('created_at', epochWindow))
  const txCursor = andClause(cursorClause('transacted_at', 'created_at', cursor))
  const setCursor = andClause(cursorClause('settled_at', 'created_at', cursor))

  // Per-branch filter clauses
  const txPayer = andClause(eqValueClause('paid_by', filter?.paidBy))
  const txSplit = andClause(filter ? splitTypeClause(filter.splitTypes) : undefined)
  const txCategory = andClause(filter ? categoryInClause(filter.categories) : undefined)
  const txAssetIds = andClause(filter ? assetIdsClause('asset_id', filter.assetIds) : undefined)
  const txAmount = andClause(filter ? amountClause(filter.amountMin, filter.amountMax) : undefined)
  const txStatus = andClause(filter ? statusClause(filter.status) : undefined)

  // Drill-down clauses (mutually exclusive with one another). Income drill is
  // handled by the short-circuit above.
  const txDrillCategory = drill?.kind === 'category'
    ? sql`AND category = ${drill.categoryId}`
    : sql``
  const txDrillAsset = drill?.kind === 'asset'
    ? (drill.assetId === null
        ? sql`AND asset_id IS NULL`
        : sql`AND asset_id = ${drill.assetId}::uuid`)
    : sql``
  // Any drill drops the settlements branch — settlements have no category /
  // asset_id, so a drill row would never match them anyway.
  const drillExcludesSettlements = drill !== undefined && drill !== null

  const setPayer = andClause(eqValueClause('paid_by', filter?.paidBy))
  // Settlements carry amount but no status / split / category / asset — only
  // amount range is meaningful for them. status='pending' already drops the
  // entire settlements branch via excludeSettlements.
  const setAmount = andClause(filter ? amountClause(filter.amountMin, filter.amountMax) : undefined)

  // Page-level date scope: feed shows only the selected window. Custom range
  // (from FilterSheet) takes precedence over the legacy single-month param.
  const txMonth = andClause(dateRangeClause('transacted_at', monthKey, dateRange))
  const setMonth = andClause(dateRangeClause('settled_at', monthKey, dateRange))

  // Drop the settlements branch entirely when 分攤 / 分類 / 愛物 dims are active
  // OR when a drill-down is active (a category/asset drill never matches a
  // settlement, and an income drill renders this query irrelevant — but we
  // still want zero settlements showing through alongside it).
  const settlementsBranch = filter?.excludeSettlements || drillExcludesSettlements
    ? sql``
    : sql`
      UNION ALL

      SELECT
        id, amount,
        NULL::split_type AS split_type,
        NULL::integer AS split_ratio_a,
        COALESCE(note, '還款') AS description,
        'settle' AS category,
        paid_by,
        NULL::uuid AS asset_id,
        NULL::uuid AS fuel_log_id,
        NULL::text AS notes,
        'settled'::record_status AS status,
        settled_at AS transacted_at,
        created_at,
        'settlement'::text AS kind,
        NULL::currency_code AS original_currency,
        NULL::integer AS original_amount,
        NULL::numeric AS rate_snapshot,
        NULL::uuid AS trip_id
      FROM "Settlements"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${setCursor}
      ${setPayer}
      ${setAmount}
      ${setMonth}
      ${epoch}
    `

  const rows = await db.execute<{
    id: string
    amount: number
    split_type: 'all_mine' | 'all_theirs' | 'half' | 'weighted' | null
    split_ratio_a: number | null
    description: string
    category: string
    paid_by: string
    asset_id: string | null
    fuel_log_id: string | null
    notes: string | null
    status: RecordStatus
    transacted_at: Date
    created_at: Date
    kind: FeedKind
    original_currency: string | null
    original_amount: number | null
    rate_snapshot: string | null
    trip_id: string | null
  }>(sql`
    SELECT * FROM (
      SELECT
        id, amount, split_type, split_ratio_a, description, category, paid_by,
        asset_id, fuel_log_id, notes, status, transacted_at, created_at,
        'transaction'::text AS kind,
        original_currency, original_amount, rate_snapshot, trip_id
      FROM "CashTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${txCursor}
      ${txPayer}
      ${txSplit}
      ${txCategory}
      ${txAssetIds}
      ${txAmount}
      ${txStatus}
      ${txDrillCategory}
      ${txDrillAsset}
      ${txMonth}
      ${epoch}
      ${settlementsBranch}
    ) AS feed
    ORDER BY transacted_at DESC, created_at DESC
    LIMIT ${limit}
  `)

  return rows.map(rowToFeedRow)
}

/**
 * Records 'all' tab feed: UNION CashTransactions + Settlements + IncomeTransactions
 * (active only). Cursor uses (transactedAt, createdAt) where IncomeTransactions
 * maps occurred_at → transacted_at (cast to timestamptz at midnight local UTC).
 *
 * Income rows have null splitType, kind='income'.
 */
export async function listFeedAllPaged(opts: ListPagedOptions): Promise<FeedRow[]> {
  const { groupId, cursor, limit = 20, filter, monthKey, drill, dateRange, epochWindow } = opts

  const epoch = andClause(epochClause('created_at', epochWindow))
  const cur = andClause(cursorClause('sort_at', 'sort_created', cursor))

  // Page-level date scope. CashTransactions/Settlements use timestamptz
  // (Asia/Taipei conversion); IncomeTransactions uses a date column.
  const txMonth = andClause(dateRangeClause('transacted_at', monthKey, dateRange))
  const setMonth = andClause(dateRangeClause('settled_at', monthKey, dateRange))
  const incMonth = andClause(dateColumnClause(monthKey, dateRange))

  // Per-drill predicates per branch. Each branch is either narrowed (the drill
  // is meaningful for that row kind) or short-circuited to FALSE (so it never
  // contributes rows). Drill kinds are mutually exclusive.
  const txDrill =
    drill?.kind === 'category'
      ? sql`AND category = ${drill.categoryId}`
      : drill?.kind === 'asset'
        ? (drill.assetId === null
            ? sql`AND asset_id IS NULL`
            : sql`AND asset_id = ${drill.assetId}::uuid`)
        : drill?.kind === 'income'
          ? sql`AND FALSE`
          : sql``
  // Settlements have no category/asset/income-category — any drill drops them.
  const setDrill = drill ? sql`AND FALSE` : sql``
  const incDrill =
    drill?.kind === 'income'
      ? sql`AND category = ${drill.categoryId}`
      : drill?.kind === 'asset'
        ? (drill.assetId === null
            ? sql`AND FALSE`  // income rows are not surfaced under the「其他」asset bar
            : sql`AND FALSE`)
        : drill?.kind === 'category'
          ? sql`AND FALSE`
          : sql``

  // Per-branch structured-filter clauses. See `lib/filter.ts` cutsExpense /
  // cutsIncome for the cross-kind-cut rules.
  const txFilterPayer = andClause(eqValueClause('paid_by', filter?.paidBy))
  const txFilterSplit = andClause(filter ? splitTypeClause(filter.splitTypes) : undefined)
  const txFilterCategory = andClause(filter ? categoryInClause(filter.categories) : undefined)
  const txFilterAssets = andClause(filter ? assetIdsClause('asset_id', filter.assetIds) : undefined)
  const txFilterAmount = andClause(filter ? amountClause(filter.amountMin, filter.amountMax) : undefined)
  const txFilterStatus = andClause(filter ? statusClause(filter.status) : undefined)
  // Income-only filter active → no cash rows.
  const txFilterCutByIncomeOnly = filter?.cutAll ? sql`AND FALSE` : sql``

  const setFilterPayer = andClause(eqValueClause('paid_by', filter?.paidBy))
  // Settlements carry amount but no status. status='pending' already drops the
  // branch via excludeSettlements upstream.
  const setFilterAmount = andClause(filter ? amountClause(filter.amountMin, filter.amountMax) : undefined)

  const incFilterRecipient = andClause(eqValueClause('recipient_id', filter?.paidBy))
  const incFilterAssets = andClause(filter ? assetIdsClause('asset_id', filter.assetIds) : undefined)
  const incFilterAmount = andClause(filter ? amountClause(filter.amountMin, filter.amountMax) : undefined)
  const incFilterIncomeCats = andClause(filter ? categoryInClause(filter.incomeCategories) : undefined)
  // Expense-category active → drop income UNLESS the user has also picked
  // an income category (in which case they want both kinds, each filtered).
  const expenseOnlyCatActive =
    filter !== undefined && filter.categories.length > 0 && filter.incomeCategories.length === 0
  const incFilterCategoryCut = expenseOnlyCatActive ? sql`AND FALSE` : sql``
  // 分攤 only exists on cash transactions; if the user picked one, drop income.
  const incFilterSplitCut = filter && filter.splitTypes.length > 0 ? sql`AND FALSE` : sql``
  // status='pending' is cash-only; income is always 'settled', so the income
  // branch is dropped wholesale.
  const incFilterStatusCut = filter?.status === 'pending' ? sql`AND FALSE` : sql``

  const settlementsBranch = filter?.excludeSettlements
    ? sql``
    : sql`
      UNION ALL

      SELECT
        id, amount, NULL::split_type, NULL::integer AS split_ratio_a,
        COALESCE(note, '還款'), 'settle',
        paid_by, NULL::uuid, NULL::uuid, NULL::text, 'settled'::record_status,
        settled_at AS sort_at, created_at AS sort_created,
        'settlement'::text AS kind,
        NULL::currency_code AS original_currency,
        NULL::integer AS original_amount,
        NULL::numeric AS rate_snapshot,
        NULL::uuid AS trip_id
      FROM "Settlements"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${setMonth}
      ${setDrill}
      ${setFilterPayer}
      ${setFilterAmount}
      ${epoch}
    `

  const rows = await db.execute<{
    id: string
    amount: number
    split_type: 'all_mine' | 'all_theirs' | 'half' | 'weighted' | null
    split_ratio_a: number | null
    description: string
    category: string
    paid_by: string
    asset_id: string | null
    fuel_log_id: string | null
    notes: string | null
    status: RecordStatus
    sort_at: Date | string
    sort_created: Date | string
    kind: 'transaction' | 'settlement' | 'income'
    original_currency: string | null
    original_amount: number | null
    rate_snapshot: string | null
    trip_id: string | null
  }>(sql`
    SELECT * FROM (
      SELECT
        id, amount, split_type, split_ratio_a, description, category, paid_by,
        asset_id, fuel_log_id, notes, status,
        transacted_at AS sort_at, created_at AS sort_created,
        'transaction'::text AS kind,
        original_currency, original_amount, rate_snapshot, trip_id
      FROM "CashTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${txMonth}
      ${txDrill}
      ${txFilterPayer}
      ${txFilterSplit}
      ${txFilterCategory}
      ${txFilterAssets}
      ${txFilterAmount}
      ${txFilterStatus}
      ${txFilterCutByIncomeOnly}
      ${epoch}

      ${settlementsBranch}

      UNION ALL

      SELECT
        id, amount, NULL::split_type, NULL::integer AS split_ratio_a,
        COALESCE(source, ''), category,
        recipient_id AS paid_by, asset_id, NULL::uuid, NULL::text, 'settled'::record_status,
        occurred_at::timestamptz AS sort_at, created_at AS sort_created,
        'income'::text AS kind,
        NULL::currency_code AS original_currency,
        NULL::integer AS original_amount,
        NULL::numeric AS rate_snapshot,
        NULL::uuid AS trip_id
      FROM "IncomeTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${incMonth}
      ${incDrill}
      ${incFilterRecipient}
      ${incFilterAssets}
      ${incFilterAmount}
      ${incFilterIncomeCats}
      ${incFilterCategoryCut}
      ${incFilterSplitCut}
      ${incFilterStatusCut}
      ${epoch}
    ) AS feed
    WHERE TRUE ${cur}
    ORDER BY sort_at DESC, sort_created DESC
    LIMIT ${limit}
  `)

  return rows.map(rowToFeedRow)
}

/**
 * Map an executed DB row (snake_case, possibly-string timestamps) to the
 * FeedRow contract. Shared by `listTransactionsPaged` / `listFeedAllPaged` /
 * `listTransactionsPagedForAsset` and any future feed-shaped query.
 */
export function rowToFeedRow(r: {
  id: string
  amount: number
  split_type: 'all_mine' | 'all_theirs' | 'half' | 'weighted' | null
  split_ratio_a: number | null
  description: string
  category: string
  paid_by: string
  asset_id: string | null
  fuel_log_id?: string | null
  notes: string | null
  status: RecordStatus | null | undefined
  transacted_at?: Date | string
  created_at?: Date | string
  sort_at?: Date | string
  sort_created?: Date | string
  kind: FeedKind
  original_currency?: string | null
  original_amount?: number | null
  rate_snapshot?: string | null
  trip_id?: string | null
}): FeedRow {
  const transacted = r.transacted_at ?? r.sort_at
  const created = r.created_at ?? r.sort_created
  return {
    id: r.id,
    amount: r.amount,
    splitType: r.split_type,
    splitRatioA: r.split_ratio_a ?? null,
    description: r.description,
    category: r.category,
    paidBy: r.paid_by,
    assetId: r.asset_id,
    fuelLogId: r.fuel_log_id ?? null,
    notes: r.notes,
    status: r.status ?? 'settled',
    transactedAt: transacted instanceof Date ? transacted : new Date(transacted as string),
    createdAt: created instanceof Date ? created : new Date(created as string),
    kind: r.kind,
    originalCurrency: r.original_currency ?? null,
    originalAmount: r.original_amount ?? null,
    rateSnapshot: r.rate_snapshot ?? null,
    tripId: r.trip_id ?? null,
  }
}

// ─── Monthly stats (Records 月度統計, spec: docs/superpowers/specs/stats-design.md) ─

export interface CategoryStatRow {
  /** Category id from CashTransactions.category. May fall outside CategoryId if data drifts. */
  key: string
  total: number
  count: number
}

export interface AssetStatRow {
  /** Asset id; null = transactions with no asset_id (歸 "其他支出"). */
  key: string | null
  /** Asset name, including soft-deleted assets (no deletedAt filter). null when key=null. */
  name: string | null
  total: number
  count: number
}

/**
 * Build the WHERE clauses shared by both stats queries: date scope (monthKey
 * or dateRange) + structured filter (payer / split / categories / assetIds).
 * Always references columns by `transacted_at` / `paid_by` / `split_type` /
 * `category` / `asset_id` so it's safe to inline into either GROUP BY query
 * (both alias the table or query it bare).
 *
 * `tableAlias` lets the caller scope the column refs (e.g. `'ct'` for the
 * by-asset query that joins Assets), avoiding "column reference is ambiguous"
 * errors when the JOIN exposes the same column name on both sides.
 */
function statsScopeClauses(
  monthKey: string | undefined,
  dateRange: DateRange | undefined | null,
  filter: ResolvedTxnFilter | undefined,
  tableAlias?: string,
): SQL {
  const prefix = tableAlias ? `${tableAlias}.` : ''
  return sql`
    ${andClause(dateRangeClause(`${prefix}transacted_at`, monthKey, dateRange))}
    ${andClause(eqValueClause(`${prefix}paid_by`, filter?.paidBy))}
    ${andClause(filter ? splitTypeClause(filter.splitTypes, `${prefix}split_type`) : undefined)}
    ${andClause(filter ? categoryInClause(filter.categories, `${prefix}category`) : undefined)}
    ${andClause(filter ? assetIdsClause(`${prefix}asset_id`, filter.assetIds) : undefined)}
    ${andClause(filter ? amountClause(filter.amountMin, filter.amountMax, `${prefix}amount`) : undefined)}
    ${andClause(filter ? statusClause(filter.status, `${prefix}status`) : undefined)}
  `
}

/**
 * Sum active CashTransactions for a group, grouped by category, ordered by
 * total desc. The default scope is the local-Taipei calendar month
 * (`monthKey`), but callers can pass `dateRange` to use a custom window or
 * `filter` to narrow by payer / split / categories / assetIds — kept in lock
 * step with the records feed so the stats card and the list always tell the
 * same story.
 *
 * Excludes Settlements / IncomeTransactions (純支出視角) and soft-deleted rows.
 * Reused by #44 monthly review — its callers pass only `groupId` + `monthKey`,
 * so back-compat is preserved.
 */
export async function monthlyStatsByCategory(
  groupId: string,
  monthKey: string | undefined,
  dateRange: DateRange | null | undefined,
  filter: ResolvedTxnFilter | undefined,
  epochWindow: EpochWindow,
): Promise<CategoryStatRow[]> {
  const scope = statsScopeClauses(monthKey, dateRange, filter)
  const epoch = andClause(epochClause('created_at', epochWindow))
  const rows = await db.execute<{ category: string; total: number; count: number }>(sql`
    SELECT
      category,
      SUM(amount)::int AS total,
      COUNT(*)::int AS count
    FROM "CashTransactions"
    WHERE group_id = ${groupId}
      AND deleted_at IS NULL
      ${scope}
      ${epoch}
    GROUP BY category
    ORDER BY total DESC
  `)
  return rows.map((r) => ({ key: r.category, total: r.total, count: r.count }))
}

/**
 * Same as monthlyStatsByCategory but grouped by asset_id. Includes a row with
 * key=null for transactions without an asset (rendered as "其他支出"). Asset names
 * are read from Assets without filtering deletedAt so soft-deleted assets still
 * show their original name instead of "未命名".
 *
 * Pinning the asset filter on this query is still allowed but the caller
 * normally avoids it — the breakdown would degenerate to one bar. The
 * MonthlyStatsSection auto-switches to the by-category breakdown when
 * `filter.assetIds` is non-empty so this query is rarely called in that state.
 */
export async function monthlyStatsByAsset(
  groupId: string,
  monthKey: string | undefined,
  dateRange: DateRange | null | undefined,
  filter: ResolvedTxnFilter | undefined,
  epochWindow: EpochWindow,
): Promise<AssetStatRow[]> {
  const scope = statsScopeClauses(monthKey, dateRange, filter, 'ct')
  // Asset stats query aliases the cash-tx table as `ct`, so the epoch column
  // ref needs the same alias to disambiguate from the joined Assets table.
  const epoch = andClause(epochClause('ct.created_at', epochWindow))
  const rows = await db.execute<{
    asset_id: string | null
    asset_name: string | null
    total: number
    count: number
  }>(sql`
    SELECT
      ct.asset_id,
      a.name AS asset_name,
      SUM(ct.amount)::int AS total,
      COUNT(*)::int AS count
    FROM "CashTransactions" ct
    LEFT JOIN "Assets" a ON a.id = ct.asset_id
    WHERE ct.group_id = ${groupId}
      AND ct.deleted_at IS NULL
      ${scope}
      ${epoch}
    GROUP BY ct.asset_id, a.name
    ORDER BY total DESC
  `)
  return rows.map((r) => ({
    key: r.asset_id,
    name: r.asset_name,
    total: r.total,
    count: r.count,
  }))
}

/**
 * The 'YYYY-MM' month a group was created in (Asia/Taipei). Used as the lower
 * bound for the stats month switcher — months before this have no data.
 */
export async function getGroupCreationMonthKey(groupId: string): Promise<string | null> {
  const rows = await db.execute<{ month: string }>(sql`
    SELECT to_char((created_at AT TIME ZONE 'Asia/Taipei'), 'YYYY-MM') AS month
    FROM "OikosGroups"
    WHERE id = ${groupId}
  `)
  return rows[0]?.month ?? null
}

export interface ExportTxnDbRow {
  transactedAt: Date
  description: string
  amount: number
  category: string
  splitType: SplitType
  paidByName: string
  notes: string | null
}

/**
 * Fetch every active CashTransaction in a group for CSV export.
 * Joins Profiles so the export shows display names instead of opaque UUIDs.
 * Caller is responsible for the group-membership check.
 */
export async function listAllActiveCashTransactionsForExport(
  groupId: string,
): Promise<ExportTxnDbRow[]> {
  return db
    .select({
      transactedAt: cashTransactions.transactedAt,
      description: cashTransactions.description,
      amount: cashTransactions.amount,
      category: cashTransactions.category,
      splitType: cashTransactions.splitType,
      paidByName: profiles.displayName,
      notes: cashTransactions.notes,
    })
    .from(cashTransactions)
    .innerJoin(profiles, eq(profiles.id, cashTransactions.paidBy))
    .where(and(
      eq(cashTransactions.groupId, groupId),
      isNull(cashTransactions.deletedAt),
    ))
    .orderBy(desc(cashTransactions.transactedAt), desc(cashTransactions.createdAt))
}

/**
 * Fetch unique CashTransaction descriptions for a group, ordered by frequency
 * (most-used first). Used by AddSheet's description autocomplete so partners
 * can quickly re-enter recurring labels ("早餐", "雜貨", "停車費"...). Empty /
 * whitespace-only descriptions are excluded; results are capped to keep the
 * payload small (autocomplete only needs a handful of matches anyway).
 */
export async function listDescriptionSuggestions(
  groupId: string,
  limit = 200,
): Promise<string[]> {
  const rows = await db
    .select({
      description: cashTransactions.description,
      freq: sql<number>`count(*)::int`,
    })
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.groupId, groupId),
      isNull(cashTransactions.deletedAt),
      sql`length(trim(${cashTransactions.description})) > 0`,
    ))
    .groupBy(cashTransactions.description)
    .orderBy(sql`count(*) desc`)
    .limit(limit)
  return rows.map((r) => r.description)
}
