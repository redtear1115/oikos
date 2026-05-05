import { db } from '@/lib/db/client'
import { assets, carDetails } from '@/lib/db/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { FeedRow, FeedKind, TxnCursor } from './transactions'

export interface AssetWithCar {
  id: string
  groupId: string
  type: 'car' | 'house' | 'child' | 'insurance'
  name: string
  deletedAt: Date | null
  createdAt: Date
  // Car-only fields (null for non-car types — slice 1 only fetches cars)
  plate: string | null
  purchasedAt: string | null
  purchasePrice: number | null
  // Slice 2 additions
  fuelType: 'electric' | '92' | '95' | '98' | 'diesel' | null
  primaryUserId: string | null
}

/**
 * List all non-deleted assets for a group with their car details joined.
 * Slice 1 only returns cars (filter on type='car'); other types are added in
 * later slices when they get UI.
 */
export async function listAssetsForGroup(groupId: string): Promise<AssetWithCar[]> {
  const rows = await db
    .select({
      id: assets.id,
      groupId: assets.groupId,
      type: assets.type,
      name: assets.name,
      deletedAt: assets.deletedAt,
      createdAt: assets.createdAt,
      plate: carDetails.plate,
      purchasedAt: carDetails.purchasedAt,
      purchasePrice: carDetails.purchasePrice,
      fuelType: carDetails.fuelType,
      primaryUserId: carDetails.primaryUserId,
    })
    .from(assets)
    .leftJoin(carDetails, eq(carDetails.assetId, assets.id))
    .where(and(
      eq(assets.groupId, groupId),
      eq(assets.type, 'car'),
      isNull(assets.deletedAt),
    ))
    .orderBy(sql`${assets.createdAt} DESC`)
  return rows as AssetWithCar[]
}

/**
 * Get a single asset by id, **including soft-deleted** ones (so the AddSheet
 * can show "(已刪除)" labels on zombie asset references). Returns null if not
 * found or wrong group.
 */
export async function getAssetById(id: string, groupId: string): Promise<AssetWithCar | null> {
  const rows = await db
    .select({
      id: assets.id,
      groupId: assets.groupId,
      type: assets.type,
      name: assets.name,
      deletedAt: assets.deletedAt,
      createdAt: assets.createdAt,
      plate: carDetails.plate,
      purchasedAt: carDetails.purchasedAt,
      purchasePrice: carDetails.purchasePrice,
      fuelType: carDetails.fuelType,
      primaryUserId: carDetails.primaryUserId,
    })
    .from(assets)
    .leftJoin(carDetails, eq(carDetails.assetId, assets.id))
    .where(and(eq(assets.id, id), eq(assets.groupId, groupId)))
    .limit(1)
  return (rows[0] as AssetWithCar) ?? null
}

export interface AssetSummary {
  monthAmount: number
  totalAmount: number
}

/**
 * Aggregate active CashTransactions for an asset:
 *   monthAmount: sum of transactions in the current LOCAL month (UTC+8 — TW only)
 *   totalAmount: sum of all-time active transactions
 *
 * Both are coerced to 0 when null (asset with no transactions).
 */
export async function getAssetSummary(assetId: string, groupId: string): Promise<AssetSummary> {
  const rows = await db.execute<{ month_amount: number | null; total_amount: number | null }>(sql`
    SELECT
      COALESCE(SUM(amount) FILTER (
        WHERE date_trunc('month', (transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp)
            = date_trunc('month', (now() AT TIME ZONE 'Asia/Taipei')::timestamp)
      ), 0)::int AS month_amount,
      COALESCE(SUM(amount), 0)::int AS total_amount
    FROM "CashTransactions"
    WHERE asset_id = ${assetId}
      AND group_id = ${groupId}
      AND deleted_at IS NULL
  `)
  const r = rows[0] ?? { month_amount: 0, total_amount: 0 }
  return { monthAmount: r.month_amount ?? 0, totalAmount: r.total_amount ?? 0 }
}

/**
 * Page through active transactions for a specific asset (newest first), using
 * the same composite (transactedAt, createdAt) cursor shape as
 * listTransactionsPaged. Settlements are never associated with assets so the
 * settlements branch is omitted entirely (returns FeedRow with kind='transaction'
 * only).
 */
export async function listTransactionsPagedForAsset(
  assetId: string,
  groupId: string,
  cursor: TxnCursor | null,
  limit = 20,
): Promise<FeedRow[]> {
  const cursorClause = cursor
    ? sql`AND (transacted_at, created_at) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
    : sql``

  const rows = await db.execute<{
    id: string
    amount: number
    split_type: 'all_mine' | 'all_theirs' | 'half'
    description: string
    category: string
    paid_by: string
    asset_id: string | null
    fuel_log_id: string | null
    transacted_at: Date | string
    created_at: Date | string
    kind: FeedKind
  }>(sql`
    SELECT
      id, amount, split_type, description, category, paid_by,
      asset_id, fuel_log_id, transacted_at, created_at,
      'transaction'::text AS kind
    FROM "CashTransactions"
    WHERE asset_id = ${assetId}
      AND group_id = ${groupId}
      AND deleted_at IS NULL
      ${cursorClause}
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
    transactedAt: r.transacted_at instanceof Date ? r.transacted_at : new Date(r.transacted_at),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    kind: r.kind,
  }))
}
