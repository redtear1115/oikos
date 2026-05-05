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

/**
 * Parses a YYYY-MM-DD date string into a Date anchored at local midnight.
 * Returns null on format/calendar errors (e.g. '2024-02-30' silently coerced
 * by `new Date(...)` is rejected). Caller decides which error message to throw.
 */
export function parseDateString(input: string): Date | null {
  if (!input || typeof input !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null
  const parsed = new Date(input + 'T00:00:00')
  if (isNaN(parsed.getTime())) return null
  // Reject silent coercion (e.g. '2024-02-30' → Date '2024-02-29').
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  if (`${y}-${m}-${d}` !== input) return null
  return parsed
}

export interface TransactionInput {
  amount: number
  description: string
  category: string
  splitType: SplitType
  payerId: string
  transactedAt: Date
  assetId?: string | null
}

export interface ValidatedTransactionInput {
  amount: number
  description: string
  category: CategoryId
  splitType: SplitType
  payerId: string
  transactedAt: Date
  assetId: string | null
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
    assetId: input.assetId ?? null,
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
  primaryUserId?: string | null
  fuelType?: '92' | '95' | '98' | 'diesel'
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  initialOdometer?: number | null
}

export interface ValidatedCarInput {
  name: string
  plate: string
  purchasedAt: string | null
  purchasePrice: number | null
  primaryUserId: string | null
  fuelType: '92' | '95' | '98' | 'diesel'
  color: string | null
  year: number | null
  brand: string | null
  model: string | null
  initialOdometer: number | null
}

const CAR_FUEL_TYPES = ['92', '95', '98', 'diesel'] as const

/**
 * Validates a car asset input. Trims + max-length-checks name and plate, uppercases plate,
 * validates optional purchasedAt as a YYYY-MM-DD date and optional purchasePrice as a
 * positive integer. primaryUserId is optional (null when absent/empty). fuelType defaults
 * to '95' when undefined so existing Slice 1 callers keep working; carDetails CAN have
 * 'electric' (only the FuelLog flow rejects it). Extended Slice 3 fields: color, year,
 * brand, model, initialOdometer. Returns the validated payload or throws.
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
    const parsed = parseDateString(input.purchasedAt)
    if (!parsed) {
      // Distinguish "doesn't exist" (e.g. 2024-02-30) — format already passed regex.
      throw new Error('購入日期不存在')
    }
    purchasedAt = input.purchasedAt
  }

  let purchasePrice: number | null = null
  if (input.purchasePrice !== null && input.purchasePrice !== undefined) {
    purchasePrice = validateAmount(input.purchasePrice, '購入價')
  }

  const primaryUserId =
    typeof input.primaryUserId === 'string' && input.primaryUserId.length > 0
      ? input.primaryUserId
      : null

  const fuelType = input.fuelType ?? '95'
  if (!CAR_FUEL_TYPES.includes(fuelType)) {
    throw new Error('油種無效')
  }

  // color — store as-is (UI enforces valid keys), max 32 chars
  const color = input.color?.trim() || null

  // year — integer 1900–2100
  let year: number | null = null
  if (input.year !== null && input.year !== undefined) {
    if (!Number.isInteger(input.year) || input.year < 1900 || input.year > 2100) {
      throw new Error('年份無效（1900–2100）')
    }
    year = input.year
  }

  // brand — max 32 chars
  let brand: string | null = null
  if (input.brand) {
    const b = input.brand.trim()
    if (b.length > 32) throw new Error('品牌最長 32 字')
    brand = b || null
  }

  // model — max 32 chars
  let model: string | null = null
  if (input.model) {
    const m = input.model.trim()
    if (m.length > 32) throw new Error('型號最長 32 字')
    model = m || null
  }

  // initialOdometer — non-negative integer
  let initialOdometer: number | null = null
  if (input.initialOdometer !== null && input.initialOdometer !== undefined) {
    if (!Number.isInteger(input.initialOdometer) || input.initialOdometer < 0) {
      throw new Error('里程必須是非負整數')
    }
    initialOdometer = input.initialOdometer
  }

  return {
    name,
    plate: rawPlate,
    purchasedAt,
    purchasePrice,
    primaryUserId,
    fuelType,
    color,
    year,
    brand,
    model,
    initialOdometer,
  }
}

export interface FuelLogInputRaw {
  assetId: string
  liters: number | string
  odometer: number
  cost: number
  fuelType: string
  loggedAt: string  // YYYY-MM-DD
  station: string | null
  paidBy: string
  splitType: 'all_mine' | 'all_theirs' | 'half'
}

export interface FuelLogInputValidated {
  assetId: string
  liters: number      // numeric, > 0
  odometer: number    // >= 0
  cost: number        // > 0
  fuelType: '92' | '95' | '98' | 'diesel'
  loggedAt: Date
  station: string | null
  paidBy: string
  splitType: 'all_mine' | 'all_theirs' | 'half'
}

const FUEL_TYPES_GAS = ['92', '95', '98', 'diesel'] as const

/**
 * Validates a FuelLog input. FuelLog is gas-only per EV1 spec — electric cars
 * track charging via a separate flow (not implemented in Slice 2). Throws on:
 * missing assetId/paidBy, non-positive liters/cost, negative odometer, invalid
 * fuelType, station > 100 chars, malformed loggedAt, unknown splitType.
 */
export function validateFuelLogInput(input: FuelLogInputRaw): FuelLogInputValidated {
  // assetId — basic uuid presence check
  if (!input.assetId || typeof input.assetId !== 'string') {
    throw new Error('資產 ID 缺失')
  }

  // liters — numeric > 0 (accept string for form input convenience)
  const liters = typeof input.liters === 'string' ? parseFloat(input.liters) : input.liters
  if (!Number.isFinite(liters) || liters <= 0) {
    throw new Error('油量必須大於 0')
  }

  // odometer — integer >= 0
  if (!Number.isInteger(input.odometer) || input.odometer < 0) {
    throw new Error('里程必須是非負整數')
  }

  // cost — reuse existing validateAmount (positive integer)
  const cost = validateAmount(input.cost, '金額')

  // fuelType — must be one of gas types
  if (input.fuelType === 'electric') {
    throw new Error('電車不支援加油記錄')
  }
  if (!FUEL_TYPES_GAS.includes(input.fuelType as typeof FUEL_TYPES_GAS[number])) {
    throw new Error('油種無效')
  }

  // station — optional, max 100 chars
  let station: string | null = null
  if (input.station !== null && input.station !== undefined) {
    const s = input.station.trim()
    if (s.length === 0) {
      station = null
    } else if (s.length > 100) {
      throw new Error('加油站名稱過長（上限 100 字）')
    } else {
      station = s
    }
  }

  // loggedAt — YYYY-MM-DD
  const loggedAt = parseDateString(input.loggedAt)
  if (!loggedAt) {
    throw new Error('日期格式無效')
  }

  // paidBy — string presence
  if (!input.paidBy || typeof input.paidBy !== 'string') {
    throw new Error('付款人缺失')
  }

  // splitType — enum check
  if (!['all_mine', 'all_theirs', 'half'].includes(input.splitType)) {
    throw new Error('分攤方式無效')
  }

  return {
    assetId: input.assetId,
    liters,
    odometer: input.odometer,
    cost,
    fuelType: input.fuelType as '92' | '95' | '98' | 'diesel',
    loggedAt,
    station,
    paidBy: input.paidBy,
    splitType: input.splitType,
  }
}

export interface LifeEntityInput {
  type: 'child' | 'pet' | 'plant'
  name: string
}

export function validateLifeEntityInput(input: LifeEntityInput): LifeEntityInput {
  const name = input.name.trim()
  if (!name) throw new Error('名稱不可為空')
  if (name.length > 32) throw new Error('名稱最多 32 字')
  return { type: input.type, name }
}
