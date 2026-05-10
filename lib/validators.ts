import { isValidCategoryId, type CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { isValidIncomeCategoryId } from '@/lib/incomeCategories'

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
 * Validates an optional freeform notes field. Trim, treat empty/whitespace as null.
 * Caps at 2000 chars to prevent runaway input — this is the canonical absent
 * representation for the `Assets.notes` column (and any future twin).
 */
export const NOTES_MAX_LEN = 2000

export function validateNotes(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  if (trimmed.length > NOTES_MAX_LEN) {
    throw new Error(`備註最長 ${NOTES_MAX_LEN} 字`)
  }
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
  notes?: string | null
  splitRatioA?: number | null
}

export interface ValidatedTransactionInput {
  amount: number
  description: string
  category: CategoryId
  splitType: SplitType
  payerId: string
  transactedAt: Date
  assetId: string | null
  notes: string | null
  splitRatioA: number | null
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
  if (!['all_mine', 'all_theirs', 'half', 'weighted'].includes(input.splitType)) {
    throw new Error('分攤方式無效')
  }
  let splitRatioA: number | null = null
  if (input.splitType === 'weighted') {
    const r = input.splitRatioA
    if (r === null || r === undefined || !Number.isInteger(r) || r < 1 || r > 99) {
      throw new Error('分攤比例必須為 1–99 的整數')
    }
    splitRatioA = r
  }
  return {
    amount,
    description,
    category,
    splitType: input.splitType,
    payerId: input.payerId,
    transactedAt: input.transactedAt,
    assetId: input.assetId ?? null,
    notes: validateNotes(input.notes),
    splitRatioA,
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
  notes?: string | null
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
  notes: string | null
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

  // color — store as-is (UI enforces valid keys from CAR_COLORS)
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
    notes: validateNotes(input.notes),
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

// ── Child ──────────────────────────────────────────────────────────
export interface ChildInput {
  name: string
  nickname?: string | null
  gender?: 'male' | 'female' | 'other' | null
  birthday?: string | null
  // Trinary semantics for the two encrypted PII fields:
  //   undefined → "keep existing" (action ignores column)
  //   null      → "explicitly clear" (action sets column to NULL)
  //   string    → "set to this value" (action encrypts before insert)
  // create() callers should pass undefined / non-empty string; editChild
  // also accepts null to clear an existing encrypted value without revealing it.
  nationalId?: string | null
  nhiNo?: string | null
  bloodType?: string | null
  hospital?: string | null
  heightCm?: number | null
  weightG?: number | null
  notes?: string | null
}

export interface ValidatedChildInput {
  name: string
  nickname: string | null
  gender: 'male' | 'female' | 'other' | null
  birthday: string | null
  // Trinary preserved (see ChildInput): undefined = keep, null = clear, string = set.
  nationalId: string | null | undefined
  nhiNo: string | null | undefined
  bloodType: string | null
  hospital: string | null
  heightCm: number | null
  weightG: number | null
  notes: string | null
}

/**
 * Normalise a trinary PII field. `undefined` (key absent) means "no change" and
 * is preserved; an explicit `null` means "clear"; a string is trimmed and
 * collapsed to null when blank (treated as clear). Used for nationalId / nhiNo
 * — these flow through encrypt() before persisting, so we never coerce
 * undefined → null which would unintentionally clear the column on edit.
 */
function normalisePiiTrinary(input: string | null | undefined): string | null | undefined {
  if (input === undefined) return undefined
  if (input === null) return null
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function validateChildInput(input: ChildInput): ValidatedChildInput {
  const name = input.name?.trim()
  if (!name || name.length < 1) throw new Error('名稱不能空白')
  if (name.length > 32) throw new Error('名稱最長 32 字')

  const nickname = input.nickname?.trim() || null

  let gender: 'male' | 'female' | 'other' | null = null
  if (input.gender !== null && input.gender !== undefined) {
    if (input.gender !== 'male' && input.gender !== 'female' && input.gender !== 'other')
      throw new Error('性別無效')
    gender = input.gender
  }

  const birthday = input.birthday?.trim() || null
  // PII trinary — see normalisePiiTrinary docstring.
  // The 'in' check distinguishes "key absent" from "key present with undefined";
  // we treat both as "no change", but the explicit branch makes intent obvious.
  const nationalId = 'nationalId' in input ? normalisePiiTrinary(input.nationalId) : undefined
  const nhiNo = 'nhiNo' in input ? normalisePiiTrinary(input.nhiNo) : undefined
  const bloodType = input.bloodType?.trim() || null
  const hospital = input.hospital?.trim() || null

  let heightCm: number | null = null
  if (input.heightCm !== null && input.heightCm !== undefined) {
    if (!Number.isInteger(input.heightCm) || input.heightCm < 0)
      throw new Error('身高必須是非負整數（cm）')
    heightCm = input.heightCm
  }

  let weightG: number | null = null
  if (input.weightG !== null && input.weightG !== undefined) {
    if (!Number.isInteger(input.weightG) || input.weightG < 0)
      throw new Error('體重必須是非負整數（g）')
    weightG = input.weightG
  }

  return {
    name, nickname, gender, birthday, nationalId, nhiNo, bloodType, hospital, heightCm, weightG,
    notes: validateNotes(input.notes),
  }
}

// ── Pet ────────────────────────────────────────────────────────────
export interface PetInput {
  name: string
  species?: string | null
  breed?: string | null
  sex?: string | null
  birthDate?: string | null
  adoptedDate?: string | null
  purchaseCost?: number | null
  weightG?: number | null
  chipNo?: string | null
  vet?: string | null
  notes?: string | null
}

export interface ValidatedPetInput {
  name: string
  species: string | null
  breed: string | null
  sex: string | null
  birthDate: string | null
  adoptedDate: string | null
  purchaseCost: number | null
  weightG: number | null
  chipNo: string | null
  vet: string | null
  notes: string | null
}

export function validatePetInput(input: PetInput): ValidatedPetInput {
  const name = input.name?.trim()
  if (!name || name.length < 1) throw new Error('名稱不能空白')
  if (name.length > 32) throw new Error('名稱最長 32 字')

  const species = input.species?.trim() || null
  const breed = input.breed?.trim() || null
  const sex = input.sex?.trim() || null
  const birthDate = input.birthDate?.trim() || null
  const adoptedDate = input.adoptedDate?.trim() || null

  let purchaseCost: number | null = null
  if (input.purchaseCost !== null && input.purchaseCost !== undefined) {
    if (!Number.isInteger(input.purchaseCost) || input.purchaseCost < 0)
      throw new Error('金額必須是非負整數')
    purchaseCost = input.purchaseCost
  }

  let weightG: number | null = null
  if (input.weightG !== null && input.weightG !== undefined) {
    if (!Number.isInteger(input.weightG) || input.weightG < 0)
      throw new Error('體重必須是非負整數（g）')
    weightG = input.weightG
  }

  const chipNo = input.chipNo?.trim() || null
  const vet = input.vet?.trim() || null

  return {
    name, species, breed, sex, birthDate, adoptedDate, purchaseCost, weightG, chipNo, vet,
    notes: validateNotes(input.notes),
  }
}

// ── Plant ──────────────────────────────────────────────────────────
export interface PlantInput {
  name: string
  species?: string | null
  location?: string | null
  sproutedAt?: string | null
  cost?: number | null
  waterEvery?: number | null
  notes?: string | null
}

export interface ValidatedPlantInput {
  name: string
  species: string | null
  location: string | null
  sproutedAt: string | null
  cost: number | null
  waterEvery: number | null
  notes: string | null
}

export function validatePlantInput(input: PlantInput): ValidatedPlantInput {
  const name = input.name?.trim()
  if (!name || name.length < 1) throw new Error('名稱不能空白')
  if (name.length > 32) throw new Error('名稱最長 32 字')

  let species: string | null = null
  if (input.species) {
    const s = input.species.trim()
    if (s.length > 32) throw new Error('種類最長 32 字')
    species = s || null
  }

  let location: string | null = null
  if (input.location) {
    const l = input.location.trim()
    if (l.length > 32) throw new Error('位置最長 32 字')
    location = l || null
  }

  const sproutedAt = input.sproutedAt?.trim() || null

  let cost: number | null = null
  if (input.cost !== null && input.cost !== undefined) {
    if (!Number.isInteger(input.cost) || input.cost < 0)
      throw new Error('金額必須是非負整數')
    cost = input.cost
  }

  let waterEvery: number | null = null
  if (input.waterEvery !== null && input.waterEvery !== undefined) {
    if (!Number.isInteger(input.waterEvery) || input.waterEvery <= 0)
      throw new Error('澆水週期必須是正整數')
    waterEvery = input.waterEvery
  }

  return { name, species, location, sproutedAt, cost, waterEvery, notes: validateNotes(input.notes) }
}

// ── House ──────────────────────────────────────────────────────────
export interface HouseInput {
  name: string
  address?: string | null
  purchasedAt?: string | null  // YYYY-MM-DD
  purchasePrice?: number | null
  notes?: string | null
}

export interface ValidatedHouseInput {
  name: string
  address: string | null
  purchasedAt: string | null
  purchasePrice: number | null
  notes: string | null
}

export function validateHouseInput(input: HouseInput): ValidatedHouseInput {
  const name = validateName(input.name, '名稱', 32)

  let address: string | null = null
  if (input.address) {
    const a = input.address.trim()
    if (a.length > 80) throw new Error('地址最長 80 字')
    address = a || null
  }

  let purchasedAt: string | null = null
  if (input.purchasedAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchasedAt)) throw new Error('購入日期格式錯誤')
    const parsed = parseDateString(input.purchasedAt)
    if (!parsed) throw new Error('購入日期不存在')
    purchasedAt = input.purchasedAt
  }

  let purchasePrice: number | null = null
  if (input.purchasePrice !== null && input.purchasePrice !== undefined) {
    purchasePrice = validateAmount(input.purchasePrice, '金額')
  }

  return { name, address, purchasedAt, purchasePrice, notes: validateNotes(input.notes) }
}

// ── Insurance ──────────────────────────────────────────────────────
export interface InsuranceInput {
  name: string
  kind?: string | null
  insured?: string | null
  insurer?: string | null
  policyNo?: string | null
  annualPremium?: number | null
  sumInsured?: number | null
  payCycle?: string | null
  startsAt?: string | null
  endsAt?: string | null
  termYears?: number | null
  vehicleId?: string | null
  expectedMaturityAmount?: number | null
  notes?: string | null
}

export interface ValidatedInsuranceInput {
  name: string
  kind: string | null
  insured: string | null
  insurer: string | null
  policyNo: string | null
  annualPremium: number | null
  sumInsured: number | null
  payCycle: string | null
  startsAt: string | null
  endsAt: string | null
  termYears: number | null
  vehicleId: string | null
  expectedMaturityAmount: number | null
  notes: string | null
}

export function validateInsuranceInput(input: InsuranceInput): ValidatedInsuranceInput {
  const name = input.name?.trim()
  if (!name || name.length < 1) throw new Error('名稱不能空白')
  if (name.length > 64) throw new Error('名稱最長 64 字')

  const kind = input.kind?.trim() || null
  const insured = input.insured?.trim() || null
  const insurer = input.insurer?.trim() || null
  const policyNo = input.policyNo?.trim() || null

  let annualPremium: number | null = null
  if (input.annualPremium !== null && input.annualPremium !== undefined) {
    if (!Number.isInteger(input.annualPremium) || input.annualPremium < 0)
      throw new Error('保費必須是非負整數')
    annualPremium = input.annualPremium
  }

  let sumInsured: number | null = null
  if (input.sumInsured !== null && input.sumInsured !== undefined) {
    if (!Number.isInteger(input.sumInsured) || input.sumInsured < 0)
      throw new Error('保額必須是非負整數')
    sumInsured = input.sumInsured
  }

  const payCycle = input.payCycle?.trim() || null
  const startsAt = input.startsAt?.trim() || null
  const endsAt = input.endsAt?.trim() || null

  let termYears: number | null = null
  if (input.termYears !== null && input.termYears !== undefined) {
    if (!Number.isInteger(input.termYears) || input.termYears <= 0)
      throw new Error('年期必須是正整數')
    termYears = input.termYears
  }

  // Only retained when kind === 'savings'; cleared otherwise to prevent
  // stale values from leaking across kind switches.
  let expectedMaturityAmount: number | null = null
  if (kind === 'savings' && input.expectedMaturityAmount !== null && input.expectedMaturityAmount !== undefined) {
    if (!Number.isInteger(input.expectedMaturityAmount) || input.expectedMaturityAmount < 0)
      throw new Error('預估滿期金必須是非負整數')
    expectedMaturityAmount = input.expectedMaturityAmount
  }

  return {
    name, kind, insured, insurer, policyNo,
    annualPremium, sumInsured, payCycle,
    startsAt, endsAt, termYears,
    vehicleId: input.vehicleId?.trim() || null,
    expectedMaturityAmount,
    notes: validateNotes(input.notes),
  }
}

// ── Income ──────────────────────────────────────────────────────────────

export interface IncomeInput {
  amount: number
  category: string
  recipientId: string
  occurredAt: string  // YYYY-MM-DD (local)
  source?: string | null
  assetId?: string | null
}

export interface ValidatedIncomeInput {
  amount: number
  category: string
  recipientId: string
  occurredAt: string
  source: string | null
  assetId: string | null
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateIncomeInput(input: IncomeInput): ValidatedIncomeInput {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('金額必須是正整數')
  }

  const category = isValidIncomeCategoryId(input.category) ? input.category : 'other'

  const recipientId = input.recipientId?.trim()
  if (!recipientId) throw new Error('收入歸屬不可空白')

  const occurredAt = input.occurredAt?.trim()
  if (!occurredAt || !ISO_DATE_RE.test(occurredAt)) {
    throw new Error('日期格式錯誤')
  }

  let source: string | null = null
  if (input.source !== undefined && input.source !== null) {
    const s = input.source.trim()
    if (s.length > 64) throw new Error('備註最長 64 字')
    source = s.length > 0 ? s : null
  }

  const assetId = input.assetId?.trim() || null

  return {
    amount: input.amount,
    category,
    recipientId,
    occurredAt,
    source,
    assetId,
  }
}

// ── Invoice carrier (cloud invoice / 雲端發票) ─────────────────────────────

// Mobile barcode (cardType 3J0002): leading slash + 7 chars from
// {A-Z, 0-9, '.', '+', '-'}. Total length 8.
const BARCODE_RE = /^\/[A-Z0-9.+\-]{7}$/

// Verification code: exactly 8 alphanumeric chars (case-insensitive on input
// but uppercased before persisting so server-side comparison is deterministic).
const VERIFICATION_CODE_RE = /^[A-Z0-9]{8}$/

/**
 * Validates the mobile-barcode shape only. Throws on shape mismatch. Use this
 * standalone (e.g. UI typing feedback) or via validateInvoiceCarrierInput.
 */
export function validateBarcodeInput(barcode: string): string {
  const trimmed = (barcode ?? '').trim().toUpperCase()
  if (!trimmed) throw new Error('條碼不能為空')
  if (!BARCODE_RE.test(trimmed)) {
    throw new Error('條碼格式錯誤（需以 / 開頭、共 8 字元）')
  }
  return trimmed
}

export interface InvoiceCarrierInput {
  barcode: string
  verificationCode: string
  nickname?: string | null
}

export interface ValidatedInvoiceCarrierInput {
  barcode: string
  verificationCode: string  // uppercased; ready to encrypt
  nickname: string | null
}

/**
 * Validates a mobile-barcode carrier registration. Trims + uppercases barcode
 * and verification code. Nickname is optional (≤ 16 chars).
 */
export function validateInvoiceCarrierInput(
  input: InvoiceCarrierInput,
): ValidatedInvoiceCarrierInput {
  const barcode = validateBarcodeInput(input.barcode)

  const code = (input.verificationCode ?? '').trim().toUpperCase()
  if (!code) throw new Error('驗證碼不能為空')
  if (!VERIFICATION_CODE_RE.test(code)) {
    throw new Error('驗證碼需為 8 位英數字')
  }

  let nickname: string | null = null
  if (input.nickname !== null && input.nickname !== undefined) {
    const n = input.nickname.trim()
    if (n.length > 16) throw new Error('暱稱最長 16 字')
    nickname = n.length > 0 ? n : null
  }

  return { barcode, verificationCode: code, nickname }
}

// ── Recurring Income ────────────────────────────────────────────────────

export interface RecurringIncomeRuleInput {
  amount: number
  category: string
  recipientId: string
  intervalMonths: number
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
  source?: string | null
  assetId?: string | null
}

export interface ValidatedRecurringIncomeRuleInput {
  amount: number
  category: string
  recipientId: string
  intervalMonths: 1 | 3 | 6 | 12
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
  source: string | null
  assetId: string | null
}

const ALLOWED_INTERVALS = new Set([1, 3, 6, 12])

export function validateRecurringIncomeRuleInput(
  input: RecurringIncomeRuleInput,
): ValidatedRecurringIncomeRuleInput {
  const amount = validateAmount(input.amount)
  if (!isValidIncomeCategoryId(input.category)) {
    throw new Error('收入類別不在允許清單')
  }
  if (!input.recipientId) throw new Error('收入歸屬必填')
  if (!ALLOWED_INTERVALS.has(input.intervalMonths)) {
    throw new Error('週期僅支援每 1 / 3 / 6 / 12 個月')
  }
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31) {
    throw new Error('號數需介於 1 至 31')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn)) throw new Error('起始日格式不對')
  if (input.endsOn != null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endsOn)) throw new Error('結束日格式不對')
    if (input.endsOn < input.startsOn) throw new Error('結束日不可早於起始日')
  }
  const source = input.source?.trim() || null
  const assetId = input.assetId || null

  return {
    amount,
    category: input.category,
    recipientId: input.recipientId,
    intervalMonths: input.intervalMonths as 1 | 3 | 6 | 12,
    dayOfMonth: input.dayOfMonth,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    source,
    assetId,
  }
}

// ── Recurring Expense ───────────────────────────────────────────────────

export interface RecurringExpenseRuleInput {
  amount: number
  category: string
  paidBy: string
  splitType: SplitType
  description: string
  intervalMonths: number
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
  assetId?: string | null
  splitRatioA?: number | null
}

export interface ValidatedRecurringExpenseRuleInput {
  amount: number
  category: CategoryId
  paidBy: string
  splitType: SplitType
  description: string
  intervalMonths: 1 | 3 | 6 | 12
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
  assetId: string | null
  splitRatioA: number | null
}

const RECURRING_EXPENSE_DESC_MAX_LEN = 64
const SPLIT_TYPES: readonly SplitType[] = ['all_mine', 'all_theirs', 'half', 'weighted']

/**
 * Validates a recurring-expense rule input. Mirrors validateRecurringIncomeRuleInput
 * with three differences: paid_by + split_type required (cash semantics), description
 * is NOT NULL (matches CashTransactions.description), and category is restricted to
 * PICKABLE_CATEGORIES — `settle` is reserved for settlements and rejected here.
 */
export function validateRecurringExpenseRuleInput(
  input: RecurringExpenseRuleInput,
): ValidatedRecurringExpenseRuleInput {
  const amount = validateAmount(input.amount)

  if (!isValidCategoryId(input.category)) {
    throw new Error('支出類別不在允許清單')
  }
  if (input.category === 'settle') {
    throw new Error('不可使用此分類')
  }

  if (!input.paidBy) throw new Error('付款人必填')

  if (!SPLIT_TYPES.includes(input.splitType)) {
    throw new Error('分攤方式無效')
  }

  let splitRatioA: number | null = null
  if (input.splitType === 'weighted') {
    const r = input.splitRatioA
    if (r === null || r === undefined || !Number.isInteger(r) || r < 1 || r > 99) {
      throw new Error('分攤比例必須為 1–99 的整數')
    }
    splitRatioA = r
  }

  const description = input.description?.trim() ?? ''
  if (!description) throw new Error('描述不能為空')
  if (description.length > RECURRING_EXPENSE_DESC_MAX_LEN) {
    throw new Error(`描述最長 ${RECURRING_EXPENSE_DESC_MAX_LEN} 字`)
  }

  if (!ALLOWED_INTERVALS.has(input.intervalMonths)) {
    throw new Error('週期僅支援每 1 / 3 / 6 / 12 個月')
  }
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31) {
    throw new Error('號數需介於 1 至 31')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn)) throw new Error('起始日格式不對')
  if (input.endsOn != null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endsOn)) throw new Error('結束日格式不對')
    if (input.endsOn < input.startsOn) throw new Error('結束日不可早於起始日')
  }

  return {
    amount,
    category: input.category as CategoryId,
    paidBy: input.paidBy,
    splitType: input.splitType,
    description,
    intervalMonths: input.intervalMonths as 1 | 3 | 6 | 12,
    dayOfMonth: input.dayOfMonth,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    assetId: input.assetId || null,
    splitRatioA,
  }
}

export interface ConfirmPendingExpenseOverrides {
  amount?: number
  category?: string
  paidBy?: string
  splitType?: SplitType
  splitRatioA?: number | null
  description?: string
  transactedAt?: string  // YYYY-MM-DD
  assetId?: string | null
}

export interface ValidatedConfirmPendingExpense {
  amount?: number
  category?: CategoryId
  paidBy?: string
  splitType?: SplitType
  splitRatioA?: number | null
  description?: string
  transactedAt?: string
  assetId?: string | null
}

/**
 * Validates the optional override payload from `editAndConfirmPending`. Each
 * field is independent — undefined keeps the snapshot value, defined replaces
 * it. Used by the upcoming AddSheet "改一下" flow (PR #5); foundation only
 * surfaces the validator so the action layer in PR #2 can wire it directly.
 */
export function validateConfirmPendingExpenseInput(
  input: ConfirmPendingExpenseOverrides,
): ValidatedConfirmPendingExpense {
  const out: ValidatedConfirmPendingExpense = {}

  if (input.amount !== undefined) {
    out.amount = validateAmount(input.amount)
  }
  if (input.category !== undefined) {
    if (!isValidCategoryId(input.category)) throw new Error('支出類別不在允許清單')
    if (input.category === 'settle') throw new Error('不可使用此分類')
    out.category = input.category as CategoryId
  }
  if (input.paidBy !== undefined) {
    if (!input.paidBy) throw new Error('付款人必填')
    out.paidBy = input.paidBy
  }
  if (input.splitType !== undefined) {
    if (!SPLIT_TYPES.includes(input.splitType)) throw new Error('分攤方式無效')
    out.splitType = input.splitType
  }
  if (input.description !== undefined) {
    const trimmed = input.description.trim()
    if (!trimmed) throw new Error('描述不能為空')
    if (trimmed.length > RECURRING_EXPENSE_DESC_MAX_LEN) {
      throw new Error(`描述最長 ${RECURRING_EXPENSE_DESC_MAX_LEN} 字`)
    }
    out.description = trimmed
  }
  if (input.transactedAt !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.transactedAt)) throw new Error('日期格式錯誤')
    if (!parseDateString(input.transactedAt)) throw new Error('日期不存在')
    out.transactedAt = input.transactedAt
  }
  if (input.assetId !== undefined) {
    out.assetId = input.assetId || null
  }
  if (input.splitRatioA !== undefined) {
    if (input.splitRatioA !== null) {
      const r = input.splitRatioA
      if (!Number.isInteger(r) || r < 1 || r > 99) throw new Error('加權比例需為 1–99 的整數')
    }
    out.splitRatioA = input.splitRatioA
  }

  return out
}
