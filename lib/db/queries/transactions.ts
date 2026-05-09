import { db } from '@/lib/db/client'
import { cashTransactions, profiles } from '@/lib/db/schema'
import { and, eq, isNull, desc, sql } from 'drizzle-orm'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import type { RecordStatus } from '@/lib/validators'

export type FeedKind = 'transaction' | 'settlement' | 'income'

export interface FeedRow {
  id: string
  amount: number
  splitType: 'all_mine' | 'all_theirs' | 'half' | null  // null for settlements
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
  splitType: 'all_mine' | 'all_theirs' | 'half'
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

  const setPayer = filter?.paidBy ? sql`AND paid_by = ${filter.paidBy}` : sql``

  // Drop the settlements branch entirely when 分攤 / 分類 dims are active.
  const settlementsBranch = filter?.excludeSettlements
    ? sql``
    : sql`
      UNION ALL

      SELECT
        id, amount,
        NULL::split_type AS split_type,
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
    `

  const rows = await db.execute<{
    id: string
    amount: number
    split_type: 'all_mine' | 'all_theirs' | 'half' | null
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
        id, amount, split_type, description, category, paid_by,
        asset_id, fuel_log_id, notes, status, transacted_at, created_at,
        'transaction'::text AS kind
      FROM "CashTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${txCursor}
      ${txPayer}
      ${txSplit}
      ${txCategory}
      ${settlementsBranch}
    ) AS feed
    ORDER BY transacted_at DESC, created_at DESC
    LIMIT ${limit}
  `)

  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.split_type,
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
): Promise<FeedRow[]> {
  const cur = cursor
    ? sql`AND (sort_at, sort_created) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
    : sql``

  const rows = await db.execute<{
    id: string
    amount: number
    split_type: 'all_mine' | 'all_theirs' | 'half' | null
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
        id, amount, split_type, description, category, paid_by,
        asset_id, fuel_log_id, notes, status,
        transacted_at AS sort_at, created_at AS sort_created,
        'transaction'::text AS kind
      FROM "CashTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL

      UNION ALL

      SELECT
        id, amount, NULL::split_type, COALESCE(note, '還款'), 'settle',
        paid_by, NULL::uuid, NULL::uuid, NULL::text, 'settled'::record_status,
        settled_at AS sort_at, created_at AS sort_created,
        'settlement'::text AS kind
      FROM "Settlements"
      WHERE group_id = ${groupId} AND deleted_at IS NULL

      UNION ALL

      SELECT
        id, amount, NULL::split_type, COALESCE(source, ''), category,
        recipient_id AS paid_by, asset_id, NULL::uuid, NULL::text, 'settled'::record_status,
        occurred_at::timestamptz AS sort_at, created_at AS sort_created,
        'income'::text AS kind
      FROM "IncomeTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
    ) AS feed
    WHERE TRUE ${cur}
    ORDER BY sort_at DESC, sort_created DESC
    LIMIT ${limit}
  `)

  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.split_type,
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