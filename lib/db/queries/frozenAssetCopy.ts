import { randomUUID } from 'node:crypto'
import { sql, type SQL } from 'drizzle-orm'
import type { db } from '@/lib/db/client'
import { frozenCopyVisibleClause } from './_predicates'

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * #1442 — after leaveGroup has split one ledger into two, re-point every row
 * that references a 愛物 now living in the *other* ledger at a frozen copy of
 * that 愛物 created in the row's own ledger.
 *
 * Covers the seven link columns: CashTransactions.asset_id,
 * CashTransactions.fuel_log_id (by the FuelLog's own car), IncomeTransactions
 * .asset_id, InsuranceDetails.vehicle_id / insured_child_id (by the policy's
 * ledger), RecurringExpenseRules.asset_id, RecurringIncomeRules.asset_id.
 * Rows of every state (soft-deleted too) are re-pointed, so afterwards no row
 * in either ledger references an asset of the other one.
 *
 * Copies:
 *   - exactly one per (ledger, source asset);
 *   - display fields only, by an explicit column list: type, name,
 *     template_key. Never name_encrypted / notes / template_fields, never a
 *     *Details row — a copy must not carry PII (the child's real name lives in
 *     name_encrypted) into a ledger whose member may later change;
 *   - frozen_at = the leave boundary; created_at and deleted_at mirrored from
 *     the source, so chapter-scoped reads (`createdBefore`) and "(已刪除)"
 *     labels resolve exactly as they did for the source, and the FuelLogs
 *     purge cron never meets a live row pointing at a deleted copy.
 *   - no column pointing back at the source: that would itself be a
 *     cross-ledger reference (#1457).
 *   - copy of a copy (#1484 F2): when the source is itself a frozen copy, the
 *     new copy gets frozen_at = the boundary only if `leaverId` may resolve
 *     the source (frozenCopyVisibleClause — a member of its ledger at its
 *     freeze moment). Otherwise it keeps the source's frozen_at, which no
 *     chapter of the new ledger covers (that ledger's first chapter starts at
 *     this boundary), so it resolves for no one there. Without this, a later
 *     partner could re-link a copy they may not see and leave, and get a
 *     fresh copy they may. Not a plain COALESCE: that would also lock out a
 *     leaver who legitimately saw the copy (left, rejoined, left again).
 *     Frozen copies never move between ledgers (they have no *Details row to
 *     be moved by), so a frozen source is always in the old ledger and its
 *     copy in the leaver's new one.
 * FuelLogs: only the fuel logs actually referenced by a re-pointed record are
 * copied (onto the car's frozen copy), and the record's fuel_log_id follows.
 *
 * Recurring rules that get re-pointed are also paused (unless already
 * paused): a rule must not keep generating records on a read-only 愛物.
 * resumeRule refuses while the link is frozen.
 *
 * Emits no analytics event: a copy is not a user-created 愛物.
 *
 * Must run inside the leaveGroup transaction, after the assets and rows have
 * moved, under the epoch-close lock.
 */
export async function freezeCrossLedgerLinks(
  tx: DbTransaction,
  groupA: string,
  groupB: string,
  boundary: SQL,
  leaverId: string,
): Promise<{ assetCopies: number; fuelLogCopies: number }> {
  const groups = sql`(${groupA}::uuid, ${groupB}::uuid)`

  // 1. Every (row ledger, referenced asset) pair where the asset sits in the
  //    other ledger of the two.
  const pairs = await tx.execute<{ target_group: string; source_id: string }>(sql`
    WITH g(row_group, other_group) AS (
      VALUES (${groupA}::uuid, ${groupB}::uuid), (${groupB}::uuid, ${groupA}::uuid)
    ),
    refs(target_group, source_id) AS (
      SELECT group_id, asset_id FROM "CashTransactions"
        WHERE group_id IN ${groups} AND asset_id IS NOT NULL
      UNION
      SELECT group_id, asset_id FROM "IncomeTransactions"
        WHERE group_id IN ${groups} AND asset_id IS NOT NULL
      UNION
      SELECT group_id, asset_id FROM "RecurringExpenseRules"
        WHERE group_id IN ${groups} AND asset_id IS NOT NULL
      UNION
      SELECT group_id, asset_id FROM "RecurringIncomeRules"
        WHERE group_id IN ${groups} AND asset_id IS NOT NULL
      UNION
      SELECT ia.group_id, d.vehicle_id FROM "InsuranceDetails" d
        JOIN "Assets" ia ON ia.id = d.asset_id
        WHERE ia.group_id IN ${groups} AND d.vehicle_id IS NOT NULL
      UNION
      SELECT ia.group_id, d.insured_child_id FROM "InsuranceDetails" d
        JOIN "Assets" ia ON ia.id = d.asset_id
        WHERE ia.group_id IN ${groups} AND d.insured_child_id IS NOT NULL
      UNION
      SELECT ct.group_id, f.asset_id FROM "CashTransactions" ct
        JOIN "FuelLogs" f ON f.id = ct.fuel_log_id
        WHERE ct.group_id IN ${groups}
    )
    SELECT DISTINCT refs.target_group, refs.source_id
    FROM refs
    JOIN g ON g.row_group = refs.target_group
    JOIN "Assets" s ON s.id = refs.source_id AND s.group_id = g.other_group
  `)
  if (pairs.length === 0) return { assetCopies: 0, fuelLogCopies: 0 }

  const copyIdOf = new Map<string, string>()
  const key = (targetGroup: string, sourceId: string) => `${targetGroup}:${sourceId}`
  const mapping = pairs.map((p) => {
    const copyId = randomUUID()
    copyIdOf.set(key(p.target_group, p.source_id), copyId)
    return { copyId, sourceId: p.source_id, targetGroup: p.target_group }
  })
  const assetMap = sql`(VALUES ${sql.join(
    mapping.map((m) => sql`(${m.copyId}::uuid, ${m.sourceId}::uuid, ${m.targetGroup}::uuid)`),
    sql`, `,
  )}) AS m(copy_id, source_id, target_group)`

  // 2. The copies. Explicit column list on both sides — never SELECT *.
  await tx.execute(sql`
    INSERT INTO "Assets" (id, group_id, type, name, template_key, frozen_at, created_at, deleted_at)
    SELECT m.copy_id, m.target_group, s.type, s.name, s.template_key,
      CASE WHEN ${frozenCopyVisibleClause('s', leaverId)} THEN ${boundary} ELSE s.frozen_at END,
      s.created_at, s.deleted_at
    FROM ${assetMap}
    JOIN "Assets" s ON s.id = m.source_id
  `)

  // 3. Fuel logs referenced by records whose fuel log's car is in the other
  //    ledger. Decided by the FuelLog's own asset_id: a record's asset_id can
  //    differ from its fuel log's car after editFuelLog.
  const fuelPairs = await tx.execute<{ target_group: string; fuel_log_id: string; car_id: string }>(sql`
    SELECT DISTINCT ct.group_id AS target_group, f.id AS fuel_log_id, f.asset_id AS car_id
    FROM "CashTransactions" ct
    JOIN "FuelLogs" f ON f.id = ct.fuel_log_id
    JOIN "Assets" car ON car.id = f.asset_id
    WHERE ct.group_id IN ${groups}
      AND car.group_id IN ${groups}
      AND car.group_id <> ct.group_id
  `)
  if (fuelPairs.length > 0) {
    const fuelMapping = fuelPairs.map((p) => {
      const carCopyId = copyIdOf.get(key(p.target_group, p.car_id))
      // Step 1 collects every fuel log's car for these exact rows, so a miss
      // means the two queries disagree; fail the whole leave rather than
      // leave a cross-ledger reference behind.
      if (!carCopyId) throw new Error('frozen_copy_missing_car')
      return { copyId: randomUUID(), sourceId: p.fuel_log_id, carCopyId, targetGroup: p.target_group }
    })
    const fuelMap = sql`(VALUES ${sql.join(
      fuelMapping.map((m) => sql`(${m.copyId}::uuid, ${m.sourceId}::uuid, ${m.carCopyId}::uuid, ${m.targetGroup}::uuid)`),
      sql`, `,
    )}) AS fm(copy_id, source_id, car_copy_id, target_group)`

    await tx.execute(sql`
      INSERT INTO "FuelLogs" (id, asset_id, liters, fuel_type, odometer, station, logged_at, deleted_at, created_at)
      SELECT fm.copy_id, fm.car_copy_id, f.liters, f.fuel_type, f.odometer, f.station, f.logged_at, f.deleted_at, f.created_at
      FROM ${fuelMap}
      JOIN "FuelLogs" f ON f.id = fm.source_id
    `)
    await tx.execute(sql`
      UPDATE "CashTransactions" t
      SET fuel_log_id = fm.copy_id
      FROM ${fuelMap}
      WHERE t.group_id = fm.target_group AND t.fuel_log_id = fm.source_id
    `)
  }

  // 4. Re-point the asset links.
  await tx.execute(sql`
    UPDATE "CashTransactions" t SET asset_id = m.copy_id
    FROM ${assetMap}
    WHERE t.group_id = m.target_group AND t.asset_id = m.source_id
  `)
  await tx.execute(sql`
    UPDATE "IncomeTransactions" t SET asset_id = m.copy_id
    FROM ${assetMap}
    WHERE t.group_id = m.target_group AND t.asset_id = m.source_id
  `)
  await tx.execute(sql`
    UPDATE "RecurringExpenseRules" t
    SET asset_id = m.copy_id, paused_at = COALESCE(t.paused_at, ${boundary})
    FROM ${assetMap}
    WHERE t.group_id = m.target_group AND t.asset_id = m.source_id
  `)
  await tx.execute(sql`
    UPDATE "RecurringIncomeRules" t
    SET asset_id = m.copy_id, paused_at = COALESCE(t.paused_at, ${boundary})
    FROM ${assetMap}
    WHERE t.group_id = m.target_group AND t.asset_id = m.source_id
  `)
  await tx.execute(sql`
    UPDATE "InsuranceDetails" d SET vehicle_id = m.copy_id
    FROM ${assetMap}, "Assets" ia
    WHERE ia.id = d.asset_id AND ia.group_id = m.target_group AND d.vehicle_id = m.source_id
  `)
  await tx.execute(sql`
    UPDATE "InsuranceDetails" d SET insured_child_id = m.copy_id
    FROM ${assetMap}, "Assets" ia
    WHERE ia.id = d.asset_id AND ia.group_id = m.target_group AND d.insured_child_id = m.source_id
  `)

  return { assetCopies: mapping.length, fuelLogCopies: fuelPairs.length }
}
