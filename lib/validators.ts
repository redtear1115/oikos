import { isValidCategoryId, type CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'

/**
 * Validates a positive integer NTD amount. Returns the value or throws.
 */
export function validateAmount(amount: number, fieldLabel = '金額'): number {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${fieldLabel}必須是正整數`)
  }
  return amount
}

/**
 * Validates + trims a non-empty name (帳本名稱, 顯示名稱, etc.).
 * Defaults to 1-32 char range.
 */
export function validateName(name: string, fieldLabel: string, maxLen = 32): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(`${fieldLabel}不能為空`)
  if (trimmed.length > maxLen) throw new Error(`${fieldLabel}最長 ${maxLen} 字`)
  return trimmed
}

export interface TransactionInput {
  amount: number
  description: string
  category: string
  splitType: SplitType
  payerId: string
  transactedAt: Date
}

export interface ValidatedTransactionInput {
  amount: number
  description: string
  category: CategoryId
  splitType: SplitType
  payerId: string
  transactedAt: Date
}

/**
 * Validates a transaction input. Trims description, falls back unknown category to 'other',
 * rejects 'settle' (reserved for settlements). Throws on invalid amount or empty description.
 */
export function validateTransactionInput(input: TransactionInput): ValidatedTransactionInput {
  const amount = validateAmount(input.amount)
  const description = input.description.trim()
  if (!description) throw new Error('描述不能為空')
  const category: CategoryId = isValidCategoryId(input.category) ? input.category as CategoryId : 'other'
  if (category === 'settle') throw new Error('不可使用此分類')
  return {
    amount,
    description,
    category,
    splitType: input.splitType,
    payerId: input.payerId,
    transactedAt: input.transactedAt,
  }
}

export interface SettlementInput {
  amount: number
  payerId: string
  settledAt: Date
  note?: string
}

export interface ValidatedSettlementInput {
  amount: number
  payerId: string
  settledAt: Date
  note: string | null
}

/**
 * Validates a settlement input. Note is optional; empty/whitespace becomes null.
 */
export function validateSettlementInput(input: SettlementInput): ValidatedSettlementInput {
  const amount = validateAmount(input.amount)
  const note = input.note?.trim() || null
  return {
    amount,
    payerId: input.payerId,
    settledAt: input.settledAt,
    note,
  }
}
