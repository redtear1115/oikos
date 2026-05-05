export type IncomeCategoryId =
  | 'labor' | 'investment' | 'rental' | 'interest'
  | 'subsidy' | 'sale' | 'loan' | 'business' | 'other'

export interface IncomeCategory {
  id: IncomeCategoryId
  label: string
  mono: string
  tint: string
  ink: string
  chart: string
}

export const INCOME_CATEGORIES: IncomeCategory[] = [
  { id: 'labor',      label: '勞務', mono: '勞', tint: '#F0EACA', ink: '#6A5820', chart: '#B09840' },
  { id: 'investment', label: '投資', mono: '投', tint: '#D8EDD8', ink: '#2A5A2A', chart: '#5A9A5A' },
  { id: 'rental',     label: '租金', mono: '租', tint: '#EDE0D0', ink: '#7A5030', chart: '#B08060' },
  { id: 'interest',   label: '利息', mono: '息', tint: '#D0E5E8', ink: '#2A5A60', chart: '#5A9AA0' },
  { id: 'subsidy',    label: '補助', mono: '補', tint: '#EAD8EC', ink: '#5A3870', chart: '#9878B0' },
  { id: 'sale',       label: '售產', mono: '售', tint: '#D8E5F0', ink: '#2A4A6A', chart: '#5A80A8' },
  { id: 'loan',       label: '借貸', mono: '貸', tint: '#DDD8EC', ink: '#3A3060', chart: '#7070A8' },
  { id: 'business',   label: '業務', mono: '業', tint: '#F0E0CA', ink: '#7A4820', chart: '#C07840' },
  { id: 'other',      label: '其他', mono: '他', tint: '#EDE3D7', ink: '#7A6A5A', chart: '#A8998A' },
]

const BY_ID = Object.fromEntries(INCOME_CATEGORIES.map(c => [c.id, c])) as Record<IncomeCategoryId, IncomeCategory>
const OTHER = BY_ID.other

export function getIncomeCategory(id: string): IncomeCategory {
  return BY_ID[id as IncomeCategoryId] ?? OTHER
}

export function isValidIncomeCategoryId(id: string): boolean {
  return id in BY_ID
}

// All income categories are user-pickable (no system-reserved equivalent of 'settle')
export const PICKABLE_INCOME_CATEGORIES = INCOME_CATEGORIES
