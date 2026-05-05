import { db } from '@/lib/db/client'
import { fuelLogs } from '@/lib/db/schema'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'

export interface FuelLogRow {
  id: string
  assetId: string
  liters: string  // Drizzle numeric returns string; caller parses
  fuelType: '92' | '95' | '98' | 'diesel' | 'electric'
  odometer: number
  station: string | null
  loggedAt: Date
  createdAt: Date
}

/**
 * List active fuel logs for an asset, sorted by loggedAt desc.
 */
export async function listFuelLogsForAsset(assetId: string): Promise<FuelLogRow[]> {
  const rows = await db
    .select()
    .from(fuelLogs)
    .where(and(eq(fuelLogs.assetId, assetId), isNull(fuelLogs.deletedAt)))
    .orderBy(desc(fuelLogs.loggedAt))
  return rows.map((r) => ({
    id: r.id,
    assetId: r.assetId,
    liters: r.liters,
    fuelType: r.fuelType,
    odometer: r.odometer,
    station: r.station,
    loggedAt: r.loggedAt,
    createdAt: r.createdAt,
  }))
}

/**
 * Same as listFuelLogsForAsset but each row includes prevOdometer (for FuelRow
 * km/L badge computation). Uses LAG window function ordered by loggedAt asc so
 * each row's prevOdometer = the immediately preceding (older) fill-up's odometer.
 */
export interface FuelLogWithPrev extends FuelLogRow {
  prevOdometer: number | null
}

export async function listFuelLogsWithPrev(assetId: string): Promise<FuelLogWithPrev[]> {
  const rows = await db.execute<{
    id: string
    asset_id: string
    liters: string
    fuel_type: '92' | '95' | '98' | 'diesel' | 'electric'
    odometer: number
    station: string | null
    logged_at: Date | string
    created_at: Date | string
    prev_odometer: number | null
  }>(sql`
    SELECT
      id, asset_id, liters, fuel_type, odometer, station,
      logged_at, created_at,
      LAG(odometer) OVER (ORDER BY logged_at ASC, created_at ASC) AS prev_odometer
    FROM "FuelLogs"
    WHERE asset_id = ${assetId} AND deleted_at IS NULL
    ORDER BY logged_at DESC, created_at DESC
  `)

  return rows.map((r) => ({
    id: r.id,
    assetId: r.asset_id,
    liters: r.liters,
    fuelType: r.fuel_type,
    odometer: r.odometer,
    station: r.station,
    // db.execute() returns timestamps as strings (postgres-js default), unlike
    // Drizzle's typed select which yields Date — coerce here so callers get a
    // uniform Date contract.
    loggedAt: r.logged_at instanceof Date ? r.logged_at : new Date(r.logged_at),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    prevOdometer: r.prev_odometer,
  }))
}

/**
 * Sum of CashTransactions linked to this asset's fuel logs (本月加油 / 累計加油).
 * Month boundary uses Asia/Taipei (TW-only product) for consistency with
 * getAssetSummary in asset.ts. Returns 0 when no fuel transactions exist.
 */
export async function fuelStatsForAsset(assetId: string): Promise<{
  monthFuel: number
  totalFuel: number
}> {
  const rows = await db.execute<{ month_fuel: number | null; total_fuel: number | null }>(sql`
    SELECT
      COALESCE(SUM(amount) FILTER (
        WHERE date_trunc('month', (transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp)
            = date_trunc('month', (now() AT TIME ZONE 'Asia/Taipei')::timestamp)
      ), 0)::int AS month_fuel,
      COALESCE(SUM(amount), 0)::int AS total_fuel
    FROM "CashTransactions"
    WHERE asset_id = ${assetId}
      AND fuel_log_id IS NOT NULL
      AND deleted_at IS NULL
  `)
  const r = rows[0] ?? { month_fuel: 0, total_fuel: 0 }
  return { monthFuel: r.month_fuel ?? 0, totalFuel: r.total_fuel ?? 0 }
}
