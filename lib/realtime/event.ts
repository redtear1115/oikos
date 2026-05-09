/**
 * Discriminated union for realtime events flowing from the RealtimeProvider's
 * channel subscriptions to the page-level subscribers (TransactionFeed, BalanceHero).
 *
 * Each event includes the new row (for INSERT/UPDATE) or just the id (for DELETE).
 * Settlements use the same shape as transactions where applicable.
 */

import type { SplitType } from '@/lib/balance'

export interface TxnRowPayload {
  id: string
  groupId: string
  paidBy: string
  amount: number
  splitType: SplitType
  description: string
  category: string
  notes: string | null
  transactedAt: string  // ISO
  createdAt: string     // ISO
  deletedAt: string | null  // ISO when soft-deleted
  assetId: string | null
}

export interface SettleRowPayload {
  id: string
  groupId: string
  paidBy: string
  amount: number
  note: string | null
  settledAt: string     // ISO
  createdAt: string     // ISO
  deletedAt: string | null
}

export interface AssetRowPayload {
  id: string
  groupId: string
  type: 'car' | 'house' | 'child' | 'insurance'
  name: string
  createdAt: string  // ISO
  deletedAt: string | null  // ISO when soft-deleted
}

export interface FuelLogRowPayload {
  id: string
  assetId: string
  liters: string
  // 'electric' excluded — EV cars cannot have FuelLog entries (EV1 spec constraint)
  fuelType: '92' | '95' | '98' | 'diesel'
  odometer: number
  station: string | null
  loggedAt: string    // ISO
  createdAt: string   // ISO
  deletedAt: string | null  // ISO when soft-deleted
}

export interface IncomeRowPayload {
  id: string
  groupId: string
  recipientId: string
  amount: number
  category: string
  source: string | null
  assetId: string | null
  occurredAt: string    // YYYY-MM-DD
  createdAt: string     // ISO timestamp
  deletedAt: string | null  // ISO when soft-deleted
}

export type RealtimeEvent =
  | { kind: 'txn-insert'; row: TxnRowPayload }
  | { kind: 'txn-update'; row: TxnRowPayload }   // soft-delete shows up here too (deletedAt becomes set)
  | { kind: 'settle-insert'; row: SettleRowPayload }
  | { kind: 'settle-update'; row: SettleRowPayload }
  | { kind: 'balance-change'; balance: number; version: number }
  | { kind: 'group-updated' }   // OikosGroups row changed (e.g. member_b set after invite acceptance)
  | { kind: 'asset-changed'; row: AssetRowPayload }
  | { kind: 'fuel-log-changed'; row: FuelLogRowPayload }  // FuelLog INSERT/UPDATE/soft-delete
  | { kind: 'income-insert'; row: IncomeRowPayload }
  | { kind: 'income-update'; row: IncomeRowPayload }  // soft-delete shows up here (deletedAt set)
  | { kind: 'recurring-income-changed' }   // RecurringIncomeRules row changed
  | { kind: 'pending-occurrence-changed' } // PendingIncomeOccurrences row changed (cron insert, partner confirm/skip, edit-confirm)
  | { kind: 'recurring-expense-changed' }  // RecurringExpenseRules row changed
  | { kind: 'pending-expense-occurrence-changed' } // PendingExpenseOccurrences row changed
  | { kind: 'reconnect' }   // emitted after WebSocket reconnect — subscribers should refetch
