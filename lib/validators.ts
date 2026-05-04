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

export interface CarInput {
  name: string
  plate: string
  purchasedAt?: string | null  // YYYY-MM-DD
  purchasePrice?: number | null
}

export interface ValidatedCarInput {
  name: string
  plate: string
  purchasedAt: string | null
  purchasePrice: number | null
}

/**
 * Validates a car asset input. Trims + max-length-checks name and plate, uppercases plate,
 * validates optional purchasedAt as a YYYY-MM-DD date and optional purchasePrice as a
 * positive integer. Returns the validated payload or throws.
 */
export function validateCarInput(input: CarInput): ValidatedCarInput {
  const name = validateName(input.name, '名稱', 32)
  const rawPlate = input.plate.trim().toUpperCase()
  if (!rawPlate) throw new Error('車牌不能為空')
  if (rawPlate.length > 16) throw new Error('車牌最長 16 字')

  let purchasedAt: string | null = null
  if (input.purchasedAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchasedAt)) {
      throw new Error('購入日期格式錯誤')
    }
    const parsed = new Date(input.purchasedAt + 'T00:00:00')
    if (isNaN(parsed.getTime())) throw new Error('購入日期格式錯誤')
    // Reject silent coercion (e.g. '2024-02-30' → Date '2024-02-29').
    // Use UTC slice to avoid timezone shifts since we anchored at local midnight,
    // but compare against the same local date components.
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    if (`${y}-${m}-${d}` !== input.purchasedAt) {
      throw new Error('購入日期不存在')
    }
    purchasedAt = input.purchasedAt
  }

  let purchasePrice: number | null = null
  if (input.purchasePrice !== null && input.purchasePrice !== undefined) {
    purchasePrice = validateAmount(input.purchasePrice, '購入價')
  }

  return { name, plate: rawPlate, purchasedAt, purchasePrice }
}
