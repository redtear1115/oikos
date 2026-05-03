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
  transactedAt: string  // ISO
  createdAt: string     // ISO
  deletedAt: string | null  // ISO when soft-deleted
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

export type RealtimeEvent =
  | { kind: 'txn-insert'; row: TxnRowPayload }
  | { kind: 'txn-update'; row: TxnRowPayload }   // soft-delete shows up here too (deletedAt becomes set)
  | { kind: 'settle-insert'; row: SettleRowPayload }
  | { kind: 'settle-update'; row: SettleRowPayload }
  | { kind: 'balance-change'; balance: number; version: number }
  | { kind: 'reconnect' }   // emitted after WebSocket reconnect — subscribers should refetch
