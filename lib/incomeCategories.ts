import { lightenHex } from './colors'

export type IncomeCategoryId =
  | 'salary' | 'bonus' | 'maturity' | 'dividend' | 'survival_annuity' | 'claim'
  | 'gift' | 'refund' | 'sidehustle' | 'other'

export interface IncomeCategory {
  id: IncomeCategoryId
  label: string
  mono: string
  /** Primary identity color — donut slice / chart accent. Chip `tint` is
   *  derived from this (see issue #149). */
  color: string
  tint: string
  ink: string
  /** Alias of `color` — keeps existing chart callsites working. */
  chart: string
}

/**
 * Single source of truth for income category colors. Mirrors `categories.ts`:
 * one primary `color`, derived `tint`, manually picked `ink`.
 */
const PALETTE: Array<Pick<IncomeCategory, 'id' | 'label' | 'mono' | 'color' | 'ink'>> = [
  { id: 'salary',           label: '薪水',     mono: '薪', color: '#B8A85F', ink: '#7A6A2E' },
  { id: 'bonus',            label: '獎金',     mono: '獎', color: '#C99464', ink: '#8A5A28' },
  { id: 'maturity',         label: '滿期還本', mono: '期', color: '#9AA864', ink: '#5A6A38' },
  // v0.15.0 #132 — 生存金型儲蓄險 / 分紅保單 cash-flow buckets, sit
  // alongside 'maturity' so SavingsView can fold all three into 「已拿回」.
  { id: 'dividend',         label: '分紅',     mono: '分', color: '#A1B57A', ink: '#5F7A3E' },
  { id: 'survival_annuity', label: '生存金',   mono: '生', color: '#8FA682', ink: '#4F6A44' },
  { id: 'claim',            label: '保險理賠', mono: '賠', color: '#7AA48E', ink: '#3F6A56' },
  { id: 'gift',             label: '紅包禮金', mono: '紅', color: '#C97A6E', ink: '#8A4A40' },
  { id: 'refund',           label: '退稅',     mono: '退', color: '#A8997A', ink: '#6A5A38' },
  { id: 'sidehustle',       label: '副業',     mono: '副', color: '#85898F', ink: '#4F5258' },
  { id: 'other',            label: '其他',     mono: '其', color: '#A8998A', ink: '#7A6A5A' },
]

export const INCOME_CATEGORIES: IncomeCategory[] = PALETTE.map((c) => ({
  ...c,
  tint: lightenHex(c.color),
  chart: c.color,
}))

/**
 * v0.15.0 #132 — Categories that count as 「已拿回 (return)」 for a savings
 * insurance policy. SavingsView aggregates these and exposes per-bucket
 * breakdown when at least two are non-zero.
 *
 * Keep this list narrow on purpose — generic categories like 'claim' or
 * 'refund' are excluded because they don't represent the policy paying back
 * what was put in.
 */
export const SAVINGS_RETURN_CATEGORIES: IncomeCategoryId[] = [
  'maturity', 'dividend', 'survival_annuity',
]

const BY_ID = Object.fromEntries(INCOME_CATEGORIES.map(c => [c.id, c])) as Record<IncomeCategoryId, IncomeCategory>
const OTHER = BY_ID.other

export function getIncomeCategory(id: string): IncomeCategory {
  return BY_ID[id as IncomeCategoryId] ?? OTHER
}

export function isValidIncomeCategoryId(id: string): boolean {
  return id in BY_ID
}

export const PICKABLE_INCOME_CATEGORIES = INCOME_CATEGORIES
