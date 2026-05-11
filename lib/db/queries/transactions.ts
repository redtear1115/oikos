import { db } from '@/lib/db/client'
import { cashTransactions, profiles } from '@/lib/db/schema'
import { and, eq, isNull, desc, sql } from 'drizzle-orm'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { monthRangeIso } from '@/lib/monthKey'
import type { DrillFilter } from '@/lib/drill'
import type { RecordStatus } from '@/lib/validators'

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
 * 分攤 / categories arrive as concrete arrays (empty array = no filter).
 */
export interface ResolvedTxnFilter {
  paidBy: string | null
  splitTypes: SplitType[]   // empty = all
  categories: CategoryId[]  // empty = all
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

  // Page-level month scope: feed shows only the selected calendar month
  // (Asia/Taipei). When monthKey is omitted the feed remains all-time.
  const monthRange = monthKey ? monthRangeIso(monthKey) : null
  const txMonth = monthRange
    ? sql`AND (transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp >= ${monthRange.startIso}::timestamp
          AND (transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp <  ${monthRange.endIso}::timestamp`
    : sql``
  const setMonth = monthRange
    ? sql`AND (settled_at AT TIME ZONE 'Asia/Taipei')::timestamp >= ${monthRange.startIso}::timestamp
          AND (settled_at AT TIME ZONE 'Asia/Taipei')::timestamp <  ${monthRange.endIso}::timestamp`
    : sql``

  // Drop the settlements branch entirely when 分攤 / 分類 dims are active OR
  // when a drill-down is active (a category/asset drill never matches a
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
): Promise<FeedRow[]> {
  const cur = cursor
    ? sql`AND (sort_at, sort_created) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
    : sql``

  // Page-level month scope. CashTransactions/Settlements use timestamptz columns
  // (Asia/Taipei conversion); IncomeTransactions uses a date column so the range
  // compares against bare YYYY-MM-DD.
  const monthRange = monthKey ? monthRangeIso(monthKey) : null
  const txMonth = monthRange
    ? sql`AND (transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp >= ${monthRange.startIso}::timestamp
          AND (transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp <  ${monthRange.endIso}::timestamp`
    : sql``
  const setMonth = monthRange
    ? sql`AND (settled_at AT TIME ZONE 'Asia/Taipei')::timestamp >= ${monthRange.startIso}::timestamp
          AND (settled_at AT TIME ZONE 'Asia/Taipei')::timestamp <  ${monthRange.endIso}::timestamp`
    : sql``
  const incMonth = monthRange
    ? sql`AND occurred_at >= ${monthRange.startIso.slice(0, 10)}::date
          AND occurred_at <  ${monthRange.endIso.slice(0, 10)}::date`
    : sql``

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
 * Sum active CashTransactions for a group within a local-Taipei calendar month,
 * grouped by category, ordered by total desc.
 *
 * Excludes Settlements / IncomeTransactions (純支出視角) and soft-deleted rows.
 * Reused by #44 monthly review — keep the shape stable.
 */
export async function monthlyStatsByCategory(
  groupId: string,
  monthKey: string,
): Promise<CategoryStatRow[]> {
  const { startIso, endIso } = monthRangeIso(monthKey)
  const rows = await db.execute<{ category: string; total: number; count: number }>(sql`
    SELECT
      category,
      SUM(amount)::int AS total,
      COUNT(*)::int AS count
    FROM "CashTransactions"
    WHERE group_id = ${groupId}
      AND deleted_at IS NULL
      AND (transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp >= ${startIso}::timestamp
      AND (transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp <  ${endIso}::timestamp
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
 */
export async function monthlyStatsByAsset(
  groupId: string,
  monthKey: string,
): Promise<AssetStatRow[]> {
  const { startIso, endIso } = monthRangeIso(monthKey)
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
      AND (ct.transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp >= ${startIso}::timestamp
      AND (ct.transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp <  ${endIso}::timestamp
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