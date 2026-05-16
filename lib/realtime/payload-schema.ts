/**
 * Runtime validation for Supabase Realtime row payloads.
 *
 * Why: Supabase delivers `payload.new` as untyped `Record<string, unknown>`.
 * Without runtime validation, a schema drift (column renamed, column type
 * changed, RLS allowing an unexpected row through) surfaces as `undefined`
 * field access deep in feed / hero rendering — easy to miss in dev, ugly in
 * prod. These schemas parse the camelCased payload (post `rowFromPayload`)
 * and `null`-reject anything that doesn't match the expected shape, so
 * RealtimeProvider can drop the event with a console.warn instead of
 * dispatching a malformed row downstream.
 *
 * Notes:
 * - `v.object()` is the loose variant in valibot v1 — extra keys are silently
 *   stripped, which matches our convention of "realtime carries DB row, but
 *   consumers only read the typed subset". Fields like `originalCurrency` /
 *   `rateSnapshot` are deliberately absent here because the wire-protocol
 *   doesn't promise them and downstream code already treats them as null
 *   (see TransactionFeed.tsx where the comment is explicit).
 * - We accept `v.string()` for ISO date columns rather than `v.pipe(v.string(),
 *   v.isoDateTime())` — Realtime returns Postgres' raw timestamptz formatting
 *   which can vary slightly, and downstream code parses with `new Date(...)`
 *   so a stricter format check would gain little and risk false-rejects.
 */

import * as v from 'valibot'
import type {
  TxnRowPayload,
  SettleRowPayload,
  AssetRowPayload,
  FuelLogRowPayload,
  IncomeRowPayload,
} from './event'

const SPLIT_TYPE = v.picklist(['all_mine', 'all_theirs', 'half', 'weighted'])
const RECORD_STATUS = v.picklist(['settled', 'pending'])
const ASSET_TYPE = v.picklist(['car', 'house', 'child', 'insurance', 'pet', 'plant', 'item'])
const FUEL_TYPE = v.picklist(['92', '95', '98', 'diesel'])

const TxnRowSchema = v.object({
  id: v.string(),
  groupId: v.string(),
  paidBy: v.string(),
  amount: v.number(),
  splitType: SPLIT_TYPE,
  splitRatioA: v.nullable(v.number()),
  description: v.string(),
  category: v.string(),
  notes: v.nullable(v.string()),
  status: RECORD_STATUS,
  transactedAt: v.string(),
  createdAt: v.string(),
  deletedAt: v.nullable(v.string()),
  assetId: v.nullable(v.string()),
})

const SettleRowSchema = v.object({
  id: v.string(),
  groupId: v.string(),
  paidBy: v.string(),
  amount: v.number(),
  note: v.nullable(v.string()),
  settledAt: v.string(),
  createdAt: v.string(),
  deletedAt: v.nullable(v.string()),
})

const AssetRowSchema = v.object({
  id: v.string(),
  groupId: v.string(),
  type: ASSET_TYPE,
  name: v.string(),
  createdAt: v.string(),
  deletedAt: v.nullable(v.string()),
})

const FuelLogRowSchema = v.object({
  id: v.string(),
  assetId: v.string(),
  // `liters` is `numeric(_, 2)` in Postgres. Supabase Realtime serializes
  // numeric columns as JSON numbers (verified on Realtime v2 — both integer
  // and decimal values come through as `number`, not `string`). Drizzle's
  // SSR fetch path still types `liters` as `string` because the JS driver
  // wraps numeric, so realtime payload and SSR row shape diverge here; the
  // sole consumer (`fuel-log-changed` → `router.refresh()`) only reads
  // `assetId`, never `liters`, so the divergence is harmless.
  liters: v.number(),
  fuelType: FUEL_TYPE,
  odometer: v.number(),
  station: v.nullable(v.string()),
  loggedAt: v.string(),
  createdAt: v.string(),
  deletedAt: v.nullable(v.string()),
})

const IncomeRowSchema = v.object({
  id: v.string(),
  groupId: v.string(),
  recipientId: v.string(),
  amount: v.number(),
  category: v.string(),
  source: v.nullable(v.string()),
  assetId: v.nullable(v.string()),
  occurredAt: v.string(),
  createdAt: v.string(),
  deletedAt: v.nullable(v.string()),
})

const BalanceUpdateSchema = v.object({
  balance: v.number(),
  version: v.number(),
})

export type BalanceUpdatePayload = v.InferOutput<typeof BalanceUpdateSchema>

function makeParser<TOutput>(
  label: string,
  schema: v.GenericSchema<unknown, TOutput>,
): (raw: unknown) => TOutput | null {
  return (raw) => {
    const result = v.safeParse(schema, raw)
    if (!result.success) {
      // Drop the event; surface the schema drift in console for dev.
      // Realtime is best-effort UX — dropping is safer than rendering
      // undefined into the feed / hero.
      console.warn(`[realtime] dropped ${label} payload — schema mismatch`, {
        raw,
        issues: result.issues,
      })
      return null
    }
    return result.output
  }
}

export const parseTxnRow = makeParser<TxnRowPayload>('CashTransactions', TxnRowSchema)
export const parseSettleRow = makeParser<SettleRowPayload>('Settlements', SettleRowSchema)
export const parseAssetRow = makeParser<AssetRowPayload>('Assets', AssetRowSchema)
export const parseFuelLogRow = makeParser<FuelLogRowPayload>('FuelLogs', FuelLogRowSchema)
export const parseIncomeRow = makeParser<IncomeRowPayload>('IncomeTransactions', IncomeRowSchema)
export const parseBalanceUpdate = makeParser<BalanceUpdatePayload>('GroupBalance', BalanceUpdateSchema)
