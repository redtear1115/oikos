import { db } from '@/lib/db/client'
import { alias } from 'drizzle-orm/pg-core'
import { assets, carDetails, childDetails, houseDetails, insuranceDetails, profiles } from '@/lib/db/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { type FeedRow, type FeedKind, type TxnCursor, rowToFeedRow } from './transactions'
import type { EpochWindow } from './epoch'
import { andClause, cursorClause, epochClause } from './_predicates'
import type { AssetType } from '@/lib/assets'
import type { FuelType } from '@/lib/fuel'

const policyHolderProfile = alias(profiles, 'policy_holder_profile')
const insuredUserProfile = alias(profiles, 'insured_user_profile')
const insuredChildAsset = alias(assets, 'insured_child_asset')

export interface AssetWithCar {
  id: string
  groupId: string
  type: AssetType
  name: string
  notes: string | null
  deletedAt: Date | null
  createdAt: Date
  // #222 — template path. NULL for legacy assets; NOT NULL for template-based
  // ones (which always have type='item'). v1 ships only `general`.
  templateKey: 'general' | null
  templateFields: Record<string, string | number | null> | null
  // Car-only fields (null for non-car assets)
  plate: string | null
  purchasedAt: string | null
  purchasePrice: number | null
  // Slice 2 additions
  fuelType: FuelType | null
  primaryUserId: string | null
  // Extended car fields
  color: string | null
  year: number | null
  brand: string | null
  model: string | null
  initialOdometer: number | null
  // Insurance-only fields (null for non-insurance assets)
  insuranceType: string | null
  insurancePolicyNumber: string | null
  insuranceInsured: string | null
  insuranceInsuredChildId: string | null
  insuranceInsuredChildName: string | null
  insuranceInsuredUserId: string | null
  insuranceInsuredUserDisplayName: string | null
  insurancePolicyHolderUserId: string | null
  insurancePolicyHolderDisplayName: string | null
  insurancePolicyHolderAvatarUrl: string | null
  insuranceAnnualPremium: number | null
  insuranceSumInsured: number | null
  insuranceStartsAt: string | null
  insuranceExpiryDate: string | null
  insuranceTermYears: number | null
  insurancePayCycle: string | null
  insuranceReminderDaysBefore: number | null
  insuranceVehicleId: string | null
  insuranceInsurer: string | null
  // Child-only fields (null for non-child assets)
  childBirthday: string | null
  childHeightCm: number | null
  childWeightG: number | null
  // House-only fields (null for non-house assets)
  houseAddress: string | null
}

/**
 * List all non-deleted assets for a group with their car details joined.
 * Non-car assets have null car detail fields.
 */
export async function listAssetsForGroup(groupId: string): Promise<AssetWithCar[]> {
  const rows = await db
    .select({
      id: assets.id,
      groupId: assets.groupId,
      type: assets.type,
      name: assets.name,
      notes: assets.notes,
      templateKey: assets.templateKey,
      templateFields: assets.templateFields,
      deletedAt: assets.deletedAt,
      createdAt: assets.createdAt,
      plate: carDetails.plate,
      purchasedAt: carDetails.purchasedAt,
      purchasePrice: carDetails.purchasePrice,
      fuelType: carDetails.fuelType,
      primaryUserId: carDetails.primaryUserId,
      color: carDetails.color,
      year: carDetails.year,
      brand: carDetails.brand,
      model: carDetails.model,
      initialOdometer: carDetails.initialOdometer,
      insuranceType: insuranceDetails.insuranceType,
      insurancePolicyNumber: insuranceDetails.policyNumber,
      insuranceInsured: insuranceDetails.insured,
      insuranceInsuredChildId: insuranceDetails.insuredChildId,
      insuranceInsuredChildName: insuredChildAsset.name,
      insuranceInsuredUserId: insuranceDetails.insuredUserId,
      insuranceInsuredUserDisplayName: insuredUserProfile.displayName,
      insurancePolicyHolderUserId: insuranceDetails.policyHolderUserId,
      insurancePolicyHolderDisplayName: policyHolderProfile.displayName,
      insurancePolicyHolderAvatarUrl: policyHolderProfile.avatarUrl,
      insuranceAnnualPremium: insuranceDetails.annualPremium,
      insuranceSumInsured: insuranceDetails.sumInsured,
      insuranceStartsAt: insuranceDetails.startsAt,
      insuranceExpiryDate: insuranceDetails.expiryDate,
      insuranceTermYears: insuranceDetails.termYears,
      insurancePayCycle: insuranceDetails.payCycle,
      insuranceReminderDaysBefore: insuranceDetails.reminderDaysBefore,
      insuranceVehicleId: insuranceDetails.vehicleId,
      insuranceInsurer: insuranceDetails.insurer,
      childBirthday: childDetails.birthday,
      childHeightCm: childDetails.heightCm,
      childWeightG: childDetails.weightG,
      houseAddress: houseDetails.address,
    })
    .from(assets)
    .leftJoin(carDetails, eq(carDetails.assetId, assets.id))
    .leftJoin(childDetails, eq(childDetails.assetId, assets.id))
    .leftJoin(houseDetails, eq(houseDetails.assetId, assets.id))
    .leftJoin(insuranceDetails, eq(insuranceDetails.assetId, assets.id))
    .leftJoin(policyHolderProfile, eq(policyHolderProfile.id, insuranceDetails.policyHolderUserId))
    .leftJoin(insuredUserProfile, eq(insuredUserProfile.id, insuranceDetails.insuredUserId))
    .leftJoin(insuredChildAsset, eq(insuredChildAsset.id, insuranceDetails.insuredChildId))
    .where(and(
      eq(assets.groupId, groupId),
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
      notes: assets.notes,
      templateKey: assets.templateKey,
      templateFields: assets.templateFields,
      deletedAt: assets.deletedAt,
      createdAt: assets.createdAt,
      plate: carDetails.plate,
      purchasedAt: carDetails.purchasedAt,
      purchasePrice: carDetails.purchasePrice,
      fuelType: carDetails.fuelType,
      primaryUserId: carDetails.primaryUserId,
      color: carDetails.color,
      year: carDetails.year,
      brand: carDetails.brand,
      model: carDetails.model,
      initialOdometer: carDetails.initialOdometer,
      insuranceType: insuranceDetails.insuranceType,
      insurancePolicyNumber: insuranceDetails.policyNumber,
      insuranceInsured: insuranceDetails.insured,
      insuranceInsuredChildId: insuranceDetails.insuredChildId,
      insuranceInsuredChildName: insuredChildAsset.name,
      insuranceInsuredUserId: insuranceDetails.insuredUserId,
      insuranceInsuredUserDisplayName: insuredUserProfile.displayName,
      insurancePolicyHolderUserId: insuranceDetails.policyHolderUserId,
      insurancePolicyHolderDisplayName: policyHolderProfile.displayName,
      insurancePolicyHolderAvatarUrl: policyHolderProfile.avatarUrl,
      insuranceAnnualPremium: insuranceDetails.annualPremium,
      insuranceSumInsured: insuranceDetails.sumInsured,
      insuranceStartsAt: insuranceDetails.startsAt,
      insuranceExpiryDate: insuranceDetails.expiryDate,
      insuranceTermYears: insuranceDetails.termYears,
      insurancePayCycle: insuranceDetails.payCycle,
      insuranceReminderDaysBefore: insuranceDetails.reminderDaysBefore,
      insuranceVehicleId: insuranceDetails.vehicleId,
      insuranceInsurer: insuranceDetails.insurer,
      childBirthday: childDetails.birthday,
      childHeightCm: childDetails.heightCm,
      childWeightG: childDetails.weightG,
      houseAddress: houseDetails.address,
    })
    .from(assets)
    .leftJoin(carDetails, eq(carDetails.assetId, assets.id))
    .leftJoin(childDetails, eq(childDetails.assetId, assets.id))
    .leftJoin(houseDetails, eq(houseDetails.assetId, assets.id))
    .leftJoin(insuranceDetails, eq(insuranceDetails.assetId, assets.id))
    .leftJoin(policyHolderProfile, eq(policyHolderProfile.id, insuranceDetails.policyHolderUserId))
    .leftJoin(insuredUserProfile, eq(insuredUserProfile.id, insuranceDetails.insuredUserId))
    .leftJoin(insuredChildAsset, eq(insuredChildAsset.id, insuranceDetails.insuredChildId))
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
export async function getAssetSummary(
  assetId: string,
  groupId: string,
  epochWindow: EpochWindow,
): Promise<AssetSummary> {
  const epoch = andClause(epochClause('created_at', epochWindow))
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
      ${epoch}
  `)
  const r = rows[0] ?? { month_amount: 0, total_amount: 0 }
  return { monthAmount: r.month_amount ?? 0, totalAmount: r.total_amount ?? 0 }
}

/**
 * Batched variant of getAssetSummary — aggregates per-asset month/total in a
 * single GROUP BY query. Used by the asset list page to avoid N round-trips
 * when rendering the list. Assets with no transactions are absent from the
 * result; callers should default to { monthAmount: 0, totalAmount: 0 }.
 */
export async function getAssetSummariesBatch(
  assetIds: string[],
  groupId: string,
  epochWindow: EpochWindow,
): Promise<Map<string, AssetSummary>> {
  const out = new Map<string, AssetSummary>()
  if (assetIds.length === 0) return out
  const epoch = andClause(epochClause('created_at', epochWindow))
  const rows = await db.execute<{
    asset_id: string
    month_amount: number | null
    total_amount: number | null
  }>(sql`
    SELECT
      asset_id,
      COALESCE(SUM(amount) FILTER (
        WHERE date_trunc('month', (transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp)
            = date_trunc('month', (now() AT TIME ZONE 'Asia/Taipei')::timestamp)
      ), 0)::int AS month_amount,
      COALESCE(SUM(amount), 0)::int AS total_amount
    FROM "CashTransactions"
    WHERE asset_id IN (${sql.join(assetIds.map((id) => sql`${id}`), sql`, `)})
      AND group_id = ${groupId}
      AND deleted_at IS NULL
      ${epoch}
    GROUP BY asset_id
  `)
  for (const r of rows) {
    out.set(r.asset_id, {
      monthAmount: r.month_amount ?? 0,
      totalAmount: r.total_amount ?? 0,
    })
  }
  return out
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
  epochWindow: EpochWindow,
): Promise<FeedRow[]> {
  const cursorCl = andClause(cursorClause('transacted_at', 'created_at', cursor))
  const epoch = andClause(epochClause('created_at', epochWindow))

  const rows = await db.execute<{
    id: string
    amount: number
    split_type: 'all_mine' | 'all_theirs' | 'half' | 'weighted'
    split_ratio_a: number | null
    description: string
    category: string
    paid_by: string
    asset_id: string | null
    fuel_log_id: string | null
    notes: string | null
    status: 'settled' | 'pending'
    transacted_at: Date | string
    created_at: Date | string
    kind: FeedKind
    original_currency: string | null
    original_amount: number | null
    rate_snapshot: string | null
    trip_id: string | null
  }>(sql`
    SELECT
      id, amount, split_type, split_ratio_a, description, category, paid_by,
      asset_id, fuel_log_id, notes, status, transacted_at, created_at,
      'transaction'::text AS kind,
      original_currency, original_amount, rate_snapshot, trip_id
    FROM "CashTransactions"
    WHERE asset_id = ${assetId}
      AND group_id = ${groupId}
      AND deleted_at IS NULL
      ${cursorCl}
      ${epoch}
    ORDER BY transacted_at DESC, created_at DESC
    LIMIT ${limit}
  `)

  return rows.map(rowToFeedRow)
}
