export type IncomeCategoryId =
  | 'salary' | 'bonus' | 'maturity' | 'claim'
  | 'gift' | 'refund' | 'sidehustle' | 'other'

export interface IncomeCategory {
  id: IncomeCategoryId
  label: string
  mono: string
  tint: string
  ink: string
  chart: string
}

export const INCOME_CATEGORIES: IncomeCategory[] = [
  { id: 'salary',     label: '薪水',     mono: '薪', tint: '#F2EAD3', ink: '#7A6A2E', chart: '#B8A85F' },
  { id: 'bonus',      label: '獎金',     mono: '獎', tint: '#F4DEC2', ink: '#8A5A28', chart: '#C99464' },
  { id: 'maturity',   label: '滿期還本', mono: '期', tint: '#E5E8D0', ink: '#5A6A38', chart: '#9AA864' },
  { id: 'claim',      label: '保險理賠', mono: '賠', tint: '#DDE6DA', ink: '#3F6A56', chart: '#7AA48E' },
  { id: 'gift',       label: '紅包禮金', mono: '紅', tint: '#F5E0DA', ink: '#8A4A40', chart: '#C97A6E' },
  { id: 'refund',     label: '退稅',     mono: '退', tint: '#E8E2D8', ink: '#6A5A38', chart: '#A8997A' },
  { id: 'sidehustle', label: '副業',     mono: '副', tint: '#E0E2E5', ink: '#4F5258', chart: '#85898F' },
  { id: 'other',      label: '其他',     mono: '其', tint: '#EDE3D7', ink: '#7A6A5A', chart: '#A8998A' },
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
