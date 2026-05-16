'use server'

import { db } from '@/lib/db/client'
import { assets, carDetails, cashTransactions, fuelLogs } from '@/lib/db/schema'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { validateFuelLogInput, type FuelLogInputRaw } from '@/lib/validators'
import { eq, and, isNull } from 'drizzle-orm'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { getViewerWriteContext } from '@/lib/actionContext'
import { revalidateAfterTransactionMutation } from '@/lib/revalidate'
import type { FuelType } from '@/lib/fuel'

/**
 * Atomic dual-write for a new fuel-up event:
 *   FuelLog (the canonical record) + CashTransaction (with fuelLogId FK)
 *   + recalcGroupBalance — all inside one DB transaction.
 *
 * Description is auto-generated: '加油 · {station}' if station present, else '加油'.
 * paidBy / splitType are taken from form input (Q4 B1 — user picks per-fill).
 */
export async function createFuelLog(input: FuelLogInputRaw): Promise<{ id: string }> {
  const { group } = await getViewerWriteContext()

  const validated = validateFuelLogInput(input)

  // Asset must belong to the viewer's group and not be soft-deleted.
  const [asset] = await db
    .select({ id: assets.id, deletedAt: assets.deletedAt })
    .from(assets)
    .where(and(
      eq(assets.id, validated.assetId),
      eq(assets.groupId, group.id),
      eq(assets.type, 'car'),
    ))
    .limit(1)
  if (!asset) throw new Error('關聯資產不在家計簿內')
  if (asset.deletedAt) throw new Error('關聯資產已刪除')

  // Payer must be a current group member.
  if (validated.paidBy !== group.memberA && validated.paidBy !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }

  const description = validated.station ? `加油 · ${validated.station}` : '加油'

  const result = await db.transaction(async (tx) => {
    const [newLog] = await tx
      .insert(fuelLogs)
      .values({
        assetId: validated.assetId,
        // Drizzle numeric column: pass as string with fixed precision so
        // 36.2 doesn't round-trip as 36.19999...
        liters: validated.liters.toFixed(2),
        fuelType: validated.fuelType,
        odometer: validated.odometer,
        station: validated.station,
        loggedAt: validated.loggedAt,
      })
      .returning({ id: fuelLogs.id })

    const [newTxn] = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        assetId: validated.assetId,
        fuelLogId: newLog.id,
        paidBy: validated.paidBy,
        amount: validated.cost,
        splitType: validated.splitType,
        category: 'transit',
        description,
        transactedAt: validated.loggedAt,
      })
      .returning({ id: cashTransactions.id })

    await recalcGroupBalance(group.id, tx)

    return { id: newLog.id, txnId: newTxn.id }
  })

  revalidateAfterTransactionMutation({ assetId: validated.assetId })

  return { id: result.id }
}

export interface EditFuelLogInput extends FuelLogInputRaw {
  id: string  // fuelLog id to edit
}

/**
 * Atomic edit of a fuel-up event:
 *   UPDATE FuelLogs in place (no balance impact, so no soft-delete + insert)
 *   + Phase 1 editTransaction pattern on the linked CashTransaction:
 *     SOFT-DELETE old row + INSERT new row carrying the same fuelLogId
 *   + recalcGroupBalance — all inside one DB transaction.
 *
 * Throws if the fuel log is missing or already soft-deleted, if the asset is
 * not in viewer's group, or if the payer is not a current group member.
 */
export async function editFuelLog(input: EditFuelLogInput): Promise<{ id: string }> {
  const { group } = await getViewerWriteContext()

  const validated = validateFuelLogInput(input)

  // Look up existing fuel log; reject if missing or already soft-deleted.
  const [existingLog] = await db
    .select({ id: fuelLogs.id, assetId: fuelLogs.assetId, deletedAt: fuelLogs.deletedAt })
    .from(fuelLogs)
    .where(eq(fuelLogs.id, input.id))
    .limit(1)
  if (!existingLog || existingLog.deletedAt) {
    throw new Error('加油記錄已刪除或不存在')
  }

  // Verify the (possibly newly-assigned) asset belongs to viewer's group and is not soft-deleted.
  const [asset] = await db
    .select({ id: assets.id, deletedAt: assets.deletedAt })
    .from(assets)
    .where(and(
      eq(assets.id, validated.assetId),
      eq(assets.groupId, group.id),
      eq(assets.type, 'car'),
    ))
    .limit(1)
  if (!asset) throw new Error('關聯資產不在家計簿內')
  if (asset.deletedAt) throw new Error('關聯資產已刪除')

  // Payer must be a current group member.
  if (validated.paidBy !== group.memberA && validated.paidBy !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }

  // Find the active linked CashTransaction (one per fuel log under normal flow).
  const [oldTxn] = await db
    .select({ id: cashTransactions.id })
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.fuelLogId, input.id),
      isNull(cashTransactions.deletedAt),
    ))
    .limit(1)

  const description = validated.station ? `加油 · ${validated.station}` : '加油'

  const result = await db.transaction(async (tx) => {
    // 1. UPDATE FuelLogs in place — FuelLog has no balance impact, so soft-delete +
    //    insert isn't needed. The fuelLogId stays the same so the new CashTransaction
    //    can carry it forward unchanged.
    await tx
      .update(fuelLogs)
      .set({
        liters: validated.liters.toFixed(2),
        fuelType: validated.fuelType,
        odometer: validated.odometer,
        station: validated.station,
        loggedAt: validated.loggedAt,
      })
      .where(eq(fuelLogs.id, input.id))

    // 2. Phase 1 editTransaction pattern: soft-delete the old txn (if any) and
    //    INSERT a new one carrying the same fuelLogId. The .returning() / length
    //    check guards against a partner concurrently soft-deleting the row.
    if (oldTxn) {
      const deleted = await tx
        .update(cashTransactions)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(cashTransactions.id, oldTxn.id),
          isNull(cashTransactions.deletedAt),
        ))
        .returning({ id: cashTransactions.id })
      if (deleted.length === 0) throw new Error('找不到該筆加油交易')
    }

    const [newTxn] = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        assetId: validated.assetId,
        fuelLogId: input.id,  // carry the FK over from the old txn
        paidBy: validated.paidBy,
        amount: validated.cost,
        splitType: validated.splitType,
        category: 'transit',
        description,
        transactedAt: validated.loggedAt,
      })
      .returning({ id: cashTransactions.id })

    await recalcGroupBalance(group.id, tx)

    return { id: input.id, txnId: newTxn.id }
  })

  // Revalidate both old and new asset pages in case the fuel log moved between cars.
  revalidateAfterTransactionMutation({
    assetId: validated.assetId,
    previousAssetId: existingLog.assetId,
  })

  return { id: result.id }
}

/**
 * Atomic soft-delete of a fuel-up event:
 *   UPDATE FuelLogs SET deleted_at=NOW()
 *   UPDATE CashTransactions SET deleted_at=NOW() WHERE fuel_log_id = … AND deleted_at IS NULL
 *   recalcGroupBalance — all inside one DB transaction.
 *
 * Idempotent: throws if the fuel log is missing or already soft-deleted (matches
 * Phase 1 softDeleteTransaction semantics — no silent no-op on stale clicks).
 */
export async function softDeleteFuelLog(fuelLogId: string): Promise<void> {
  const { group } = await getViewerWriteContext()

  // Look up the fuel log; reject if missing or already soft-deleted (idempotency).
  const [existingLog] = await db
    .select({ id: fuelLogs.id, assetId: fuelLogs.assetId, deletedAt: fuelLogs.deletedAt })
    .from(fuelLogs)
    .where(eq(fuelLogs.id, fuelLogId))
    .limit(1)
  if (!existingLog || existingLog.deletedAt) {
    throw new Error('加油記錄已刪除或不存在')
  }

  // Verify the fuel log's asset belongs to viewer's group (ownership check).
  const [asset] = await db
    .select({ id: assets.id, deletedAt: assets.deletedAt })
    .from(assets)
    .where(and(
      eq(assets.id, existingLog.assetId),
      eq(assets.groupId, group.id),
      eq(assets.type, 'car'),
    ))
    .limit(1)
  if (!asset) throw new Error('關聯資產不在家計簿內')

  await db.transaction(async (tx) => {
    const now = new Date()

    // 1. Soft-delete the FuelLog. .returning() + length check guards against a
    //    partner concurrently soft-deleting between our lookup and this UPDATE.
    const deletedLog = await tx
      .update(fuelLogs)
      .set({ deletedAt: now })
      .where(and(
        eq(fuelLogs.id, fuelLogId),
        isNull(fuelLogs.deletedAt),
      ))
      .returning({ id: fuelLogs.id })
    if (deletedLog.length === 0) throw new Error('加油記錄已刪除或不存在')

    // 2. Soft-delete the linked CashTransaction(s). Under normal flow there's
    //    exactly one active row per fuelLogId, but matching `deleted_at IS NULL`
    //    keeps this safe if an editFuelLog left zombies. No length check —
    //    a missing linked txn shouldn't block deletion of the fuel log itself.
    await tx
      .update(cashTransactions)
      .set({ deletedAt: now })
      .where(and(
        eq(cashTransactions.fuelLogId, fuelLogId),
        isNull(cashTransactions.deletedAt),
      ))
      .returning({ id: cashTransactions.id })

    await recalcGroupBalance(group.id, tx)
  })

  revalidateAfterTransactionMutation({ assetId: existingLog.assetId })
}

export interface FuelLogDetail {
  id: string
  assetId: string
  liters: string
  odometer: number
  station: string | null
  fuelType: FuelType
  loggedAt: string    // ISO
  carName: string
  carPlate: string | null
  carFuelType: FuelType | null
  carPrimaryUserId: string | null
}

/**
 * Load a single fuel log with its car details for the edit sheet.
 * Verifies the fuel log belongs to an asset in the viewer's group.
 */
export async function getFuelLogById(id: string): Promise<FuelLogDetail | null> {
  const { group } = await requireViewerGroup()

  const [row] = await db
    .select({
      id: fuelLogs.id,
      assetId: fuelLogs.assetId,
      liters: fuelLogs.liters,
      odometer: fuelLogs.odometer,
      station: fuelLogs.station,
      fuelType: fuelLogs.fuelType,
      loggedAt: fuelLogs.loggedAt,
      assetName: assets.name,
      assetGroupId: assets.groupId,
      carPlate: carDetails.plate,
      carFuelType: carDetails.fuelType,
      carPrimaryUserId: carDetails.primaryUserId,
    })
    .from(fuelLogs)
    .innerJoin(assets, eq(assets.id, fuelLogs.assetId))
    .leftJoin(carDetails, eq(carDetails.assetId, fuelLogs.assetId))
    .where(and(
      eq(fuelLogs.id, id),
      isNull(fuelLogs.deletedAt),
    ))
    .limit(1)

  if (!row || row.assetGroupId !== group.id) return null

  return {
    id: row.id,
    assetId: row.assetId,
    liters: row.liters,
    odometer: row.odometer,
    station: row.station,
    fuelType: row.fuelType,
    loggedAt: row.loggedAt instanceof Date ? row.loggedAt.toISOString() : String(row.loggedAt),
    carName: row.assetName,
    carPlate: row.carPlate,
    carFuelType: row.carFuelType,
    carPrimaryUserId: row.carPrimaryUserId,
  }
}
