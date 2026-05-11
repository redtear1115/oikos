import { db } from '@/lib/db/client'
import { cashTransactions, profiles } from '@/lib/db/schema'
import { and, eq, isNull, desc, sql, type SQL } from 'drizzle-orm'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { monthRangeIso } from '@/lib/monthKey'
import type { DrillFilter } from '@/lib/drill'
import type { RecordStatus } from '@/lib/validators'
import { ASSET_FILTER_NONE, type DateRange } from '@/lib/filter'

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
}

/**
 * Resolved filter: 誰付 dimension is collapsed to a concrete user id (or null = no filter).
 * 分攤 / categories / assetIds arrive as concrete arrays (empty array = no filter).
 */
export interface ResolvedTxnFilter {
  paidBy: string | null
  splitTypes: SplitType[]   // empty = all
  categories: CategoryId[]  // empty = all
  /**
   * Empty = all. Members are uuids OR ASSET_FILTER_NONE for the「未歸屬」bucket.
   * The query expands the sentinel into an `assetId IS NULL` predicate alongside
   * any uuid `IN (...)` clause, so a filter like `[uuidA, '__none__']` matches
   * "uuidA OR no-asset" the way the user expects from the chip UI.
   */
  assetIds: string[]
  /** True when settlements should be excluded entirely. */
  excludeSettlements: boolean
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

/** Fetch most recent N active transactions for a group. */
export async function listRecentTransactions(
  groupId: string,
  limit = 5,
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
 * Resolve `dateRange` to SQL bounds for a Postgres timestamptz column. The
 * column is converted to local Asia/Taipei time for comparison so a query like
 * "May 2026" actually means May 1 00:00 → June 1 00:00 in Taipei. Returns
 * `sql\`\`` when the scope is `all`, allowing the caller to drop the clause.
 *
 * Precedence: `dateRange` overrides `monthKey`. Both undefined → no scope.
 */
function timestamptzScopeSql(
  column: 'transacted_at' | 'settled_at',
  monthKey: string | undefined,
  dateRange: DateRange | undefined | null,
): SQL {
  if (dateRange) {
    if (dateRange.kind === 'all') return sql``
    if (dateRange.kind === 'range') {
      // end is inclusive day → exclusive day = next day
      const next = nextDayIso(dateRange.end)
      return sql`AND (${sql.raw(column)} AT TIME ZONE 'Asia/Taipei')::timestamp >= ${dateRange.start}::timestamp
                 AND (${sql.raw(column)} AT TIME ZONE 'Asia/Taipei')::timestamp <  ${next}::timestamp`
    }
    // month: convert to ISO range below via monthRangeIso
    monthKey = dateRange.monthKey
  }
  if (!monthKey) return sql``
  const { startIso, endIso } = monthRangeIso(monthKey)
  return sql`AND (${sql.raw(column)} AT TIME ZONE 'Asia/Taipei')::timestamp >= ${startIso}::timestamp
             AND (${sql.raw(column)} AT TIME ZONE 'Asia/Taipei')::timestamp <  ${endIso}::timestamp`
}

/**
 * Same as timestamptzScopeSql but for the IncomeTransactions.occurred_at date
 * column (no tz conversion — it's already day-level).
 */
function dateColumnScopeSql(
  monthKey: string | undefined,
  dateRange: DateRange | undefined | null,
): SQL {
  if (dateRange) {
    if (dateRange.kind === 'all') return sql``
    if (dateRange.kind === 'range') {
      const next = nextDayIso(dateRange.end)
      return sql`AND occurred_at >= ${dateRange.start}::date
                 AND occurred_at <  ${next}::date`
    }
    monthKey = dateRange.monthKey
  }
  if (!monthKey) return sql``
  const { startIso, endIso } = monthRangeIso(monthKey)
  return sql`AND occurred_at >= ${startIso.slice(0, 10)}::date
             AND occurred_at <  ${endIso.slice(0, 10)}::date`
}

function nextDayIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * Build the SQL clause for the asset-multi-select filter. Splits the input
 * into `__none__` (→ `IS NULL`) and uuid members (→ `IN (...)`), then unions
 * them with OR so the user's mental model "match A or B or 未歸屬" maps
 * directly to one row predicate. Returns empty SQL when no asset filter is
 * active.
 */
function assetIdsScopeSql(assetIds: string[]): SQL {
  if (assetIds.length === 0) return sql``
  const uuids: string[] = []
  let includeNone = false
  for (const id of assetIds) {
    if (id === ASSET_FILTER_NONE) includeNone = true
    else uuids.push(id)
  }
  // Construct the OR-pair without leaving a stray "OR" if one side is empty.
  if (uuids.length === 0 && includeNone) {
    return sql`AND asset_id IS NULL`
  }
  if (uuids.length > 0 && !includeNone) {
    return sql`AND asset_id IN (${sql.join(uuids.map((u) => sql`${u}::uuid`), sql`, `)})`
  }
  return sql`AND (asset_id IS NULL OR asset_id IN (${sql.join(uuids.map((u) => sql`${u}::uuid`), sql`, `)}))`
}

/**
 * Page through active transactions + settlements (newest first) using a composite
 * (transactedAt/settledAt, createdAt) cursor. Pass `cursor=null` for the first page.
 *
 * Settlements are normalized into the same row shape as transactions: settledAt → transactedAt,
 * COALESCE(note,'還款') → description, 'settle' → category, NULL → splitType.
 */
export async function listTransactionsPaged(
  groupId: string,
  cursor: TxnCursor | null,
  limit = 20,
  filter?: ResolvedTxnFilter,
  monthKey?: string,
  drill?: DrillFilter | null,
  dateRange?: DateRange | null,
): Promise<FeedRow[]> {
  const txCursor = cursor
    ? sql`AND (transacted_at, created_at) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
    : sql``
  const setCursor = cursor
    ? sql`AND (settled_at, created_at) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
    : sql``

  // Per-branch filter clauses
  const txPayer = filter?.paidBy ? sql`AND paid_by = ${filter.paidBy}` : sql``
  const txSplit = filter && filter.splitTypes.length > 0
    ? sql`AND split_type IN (${sql.join(filter.splitTypes.map(s => sql`${s}::split_type`), sql`, `)})`
    : sql``
  const txCategory = filter && filter.categories.length > 0
    ? sql`AND category IN (${sql.join(filter.categories.map(c => sql`${c}`), sql`, `)})`
    : sql``
  const txAssetIds = filter ? assetIdsScopeSql(filter.assetIds) : sql``

  // Drill-down clauses (mutually exclusive with one another). Income drill is
  // not meaningful in this query (it only targets IncomeTransactions), so it
  // falls through to a no-op.
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

  const setPayer = filter?.paidBy ? sql`AND paid_by = ${filter.paidBy}` : sql``

  // Page-level date scope: feed shows only the selected window. Custom range
  // (from FilterSheet) takes precedence over the legacy single-month param.
  const txMonth = timestamptzScopeSql('transacted_at', monthKey, dateRange)
  const setMonth = timestamptzScopeSql('settled_at', monthKey, dateRange)

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
        'settlement'::text AS kind
      FROM "Settlements"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${setCursor}
      ${setPayer}
      ${setMonth}
    `

  // Income-kind drill on a cash-transaction query: short-circuit to empty
  // rather than returning unrelated cash rows. The page-1 refetch on this
  // tab will see zero results, which matches the "this drill has no rows
  // for this tab" contract.
  if (drill?.kind === 'income') return []

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
  }>(sql`
    SELECT * FROM (
      SELECT
        id, amount, split_type, split_ratio_a, description, category, paid_by,
        asset_id, fuel_log_id, notes, status, transacted_at, created_at,
        'transaction'::text AS kind
      FROM "CashTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${txCursor}
      ${txPayer}
      ${txSplit}
      ${txCategory}
      ${txAssetIds}
      ${txDrillCategory}
      ${txDrillAsset}
      ${txMonth}
      ${settlementsBranch}
    ) AS feed
    ORDER BY transacted_at DESC, created_at DESC
    LIMIT ${limit}
  `)

  return rows.map((r) => ({
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
    // db.execute() returns timestamps as strings (postgres-js default), not Date —
    // unlike Drizzle's typed select. Coerce to Date here so the FeedRow contract
    // matches what the page projections expect.
    transactedAt: r.transacted_at instanceof Date ? r.transacted_at : new Date(r.transacted_at),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    kind: r.kind,
  }))
}

/**
 * Records 'all' tab feed: UNION CashTransactions + Settlements + IncomeTransactions
 * (active only). Cursor uses (transactedAt, createdAt) where IncomeTransactions
 * maps occurred_at → transacted_at (cast to timestamptz at midnight local UTC).
 *
 * Income rows have null splitType, kind='income'.
 */
export async function listFeedAllPaged(
  groupId: string,
  cursor: TxnCursor | null,
  limit = 20,
  monthKey?: string,
  drill?: DrillFilter | null,
  filter?: ResolvedTxnFilter,
  dateRange?: DateRange | null,
): Promise<FeedRow[]> {
  const cur = cursor
    ? sql`AND (sort_at, sort_created) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
    : sql``

  // Page-level date scope. CashTransactions/Settlements use timestamptz
  // (Asia/Taipei conversion); IncomeTransactions uses a date column.
  const txMonth = timestamptzScopeSql('transacted_at', monthKey, dateRange)
  const setMonth = timestamptzScopeSql('settled_at', monthKey, dateRange)
  const incMonth = dateColumnScopeSql(monthKey, dateRange)

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

  // Per-branch structured-filter clauses. Settlements have no
  // split/category/asset; if any of those dims is active, the branch is
  // dropped wholesale (excludeSettlements). Income rows have no split, but
  // do have asset and a category column — we apply payer + assetIds + a
  // FALSE-cut for any expense-only category filter (income has its own
  // category vocabulary, so an expense-category filter shouldn't return
  // income rows).
  const txFilterPayer = filter?.paidBy ? sql`AND paid_by = ${filter.paidBy}` : sql``
  const txFilterSplit = filter && filter.splitTypes.length > 0
    ? sql`AND split_type IN (${sql.join(filter.splitTypes.map(s => sql`${s}::split_type`), sql`, `)})`
    : sql``
  const txFilterCategory = filter && filter.categories.length > 0
    ? sql`AND category IN (${sql.join(filter.categories.map(c => sql`${c}`), sql`, `)})`
    : sql``
  const txFilterAssets = filter ? assetIdsScopeSql(filter.assetIds) : sql``

  const setFilterPayer = filter?.paidBy ? sql`AND paid_by = ${filter.paidBy}` : sql``

  const incFilterRecipient = filter?.paidBy
    ? sql`AND recipient_id = ${filter.paidBy}`
    : sql``
  const incFilterAssets = filter ? assetIdsScopeSql(filter.assetIds) : sql``
  // If any expense-category filter is active, drop income rows: income has
  // its own category vocabulary so the filter wouldn't match anything
  // meaningful and rows leaking through would surprise the user.
  const incFilterCategoryCut = filter && filter.categories.length > 0 ? sql`AND FALSE` : sql``
  // 分攤 only exists on cash transactions; if the user picked one, drop income.
  const incFilterSplitCut = filter && filter.splitTypes.length > 0 ? sql`AND FALSE` : sql``

  const settlementsBranch = filter?.excludeSettlements
    ? sql``
    : sql`
      UNION ALL

      SELECT
        id, amount, NULL::split_type, NULL::integer AS split_ratio_a,
        COALESCE(note, '還款'), 'settle',
        paid_by, NULL::uuid, NULL::uuid, NULL::text, 'settled'::record_status,
        settled_at AS sort_at, created_at AS sort_created,
        'settlement'::text AS kind
      FROM "Settlements"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${setMonth}
      ${setDrill}
      ${setFilterPayer}
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
  }>(sql`
    SELECT * FROM (
      SELECT
        id, amount, split_type, split_ratio_a, description, category, paid_by,
        asset_id, fuel_log_id, notes, status,
        transacted_at AS sort_at, created_at AS sort_created,
        'transaction'::text AS kind
      FROM "CashTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${txMonth}
      ${txDrill}
      ${txFilterPayer}
      ${txFilterSplit}
      ${txFilterCategory}
      ${txFilterAssets}

      ${settlementsBranch}

      UNION ALL

      SELECT
        id, amount, NULL::split_type, NULL::integer AS split_ratio_a,
        COALESCE(source, ''), category,
        recipient_id AS paid_by, asset_id, NULL::uuid, NULL::text, 'settled'::record_status,
        occurred_at::timestamptz AS sort_at, created_at AS sort_created,
        'income'::text AS kind
      FROM "IncomeTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${incMonth}
      ${incDrill}
      ${incFilterRecipient}
      ${incFilterAssets}
      ${incFilterCategoryCut}
      ${incFilterSplitCut}
    ) AS feed
    WHERE TRUE ${cur}
    ORDER BY sort_at DESC, sort_created DESC
    LIMIT ${limit}
  `)

  return rows.map((r) => ({
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
    transactedAt: r.sort_at instanceof Date ? r.sort_at : new Date(r.sort_at),
    createdAt: r.sort_created instanceof Date ? r.sort_created : new Date(r.sort_created),
    kind: r.kind,
  }))
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
  const a = tableAlias ? `${tableAlias}.` : ''
  const dateClause = timestamptzScopeSql(
    `${a}transacted_at` as 'transacted_at',
    monthKey,
    dateRange,
  )
  const payer = filter?.paidBy
    ? sql`AND ${sql.raw(`${a}paid_by`)} = ${filter.paidBy}`
    : sql``
  const split = filter && filter.splitTypes.length > 0
    ? sql`AND ${sql.raw(`${a}split_type`)} IN (${sql.join(filter.splitTypes.map(s => sql`${s}::split_type`), sql`, `)})`
    : sql``
  const cats = filter && filter.categories.length > 0
    ? sql`AND ${sql.raw(`${a}category`)} IN (${sql.join(filter.categories.map(c => sql`${c}`), sql`, `)})`
    : sql``
  // Reuse assetIdsScopeSql but with table-aliased column. The helper hard-codes
  // `asset_id` so for the joined query we expand the logic inline here.
  const assets = (() => {
    if (!filter || filter.assetIds.length === 0) return sql``
    const uuids: string[] = []
    let includeNone = false
    for (const id of filter.assetIds) {
      if (id === ASSET_FILTER_NONE) includeNone = true
      else uuids.push(id)
    }
    const col = sql.raw(`${a}asset_id`)
    if (uuids.length === 0 && includeNone) return sql`AND ${col} IS NULL`
    if (uuids.length > 0 && !includeNone) {
      return sql`AND ${col} IN (${sql.join(uuids.map((u) => sql`${u}::uuid`), sql`, `)})`
    }
    return sql`AND (${col} IS NULL OR ${col} IN (${sql.join(uuids.map((u) => sql`${u}::uuid`), sql`, `)}))`
  })()
  return sql`${dateClause} ${payer} ${split} ${cats} ${assets}`
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
  dateRange?: DateRange | null,
  filter?: ResolvedTxnFilter,
): Promise<CategoryStatRow[]> {
  const scope = statsScopeClauses(monthKey, dateRange, filter)
  const rows = await db.execute<{ category: string; total: number; count: number }>(sql`
    SELECT
      category,
      SUM(amount)::int AS total,
      COUNT(*)::int AS count
    FROM "CashTransactions"
    WHERE group_id = ${groupId}
      AND deleted_at IS NULL
      ${scope}
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
  dateRange?: DateRange | null,
  filter?: ResolvedTxnFilter,
): Promise<AssetStatRow[]> {
  const scope = statsScopeClauses(monthKey, dateRange, filter, 'ct')
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
