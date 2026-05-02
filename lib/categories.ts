export type CategoryId =
  | 'food' | 'transit' | 'daily' | 'fun'
  | 'health' | 'home' | 'gift' | 'other' | 'settle'

export interface Category {
  id: CategoryId
  label: string
  mono: string  // single-char monogram
  tint: string  // chip background
  ink: string   // chip text
  chart: string // analysis charts
}

export const CATEGORIES: Category[] = [
  { id: 'food',    label: '餐飲',   mono: '餐', tint: '#FBDCC4', ink: '#8A4A26', chart: '#D4955F' },
  { id: 'transit', label: '交通',   mono: '交', tint: '#E2E0F0', ink: '#54527A', chart: '#8E8AB8' },
  { id: 'daily',   label: '日用品', mono: '日', tint: '#F4E5C8', ink: '#7A5A28', chart: '#C9A664' },
  { id: 'fun',     label: '娛樂',   mono: '娛', tint: '#F7D8DD', ink: '#8A3F50', chart: '#C97A8E' },
  { id: 'health',  label: '醫療',   mono: '醫', tint: '#D7E5DC', ink: '#3F6A56', chart: '#7AA48E' },
  { id: 'home',    label: '居家',   mono: '家', tint: '#EFE3D0', ink: '#7A5A38', chart: '#A89274' },
  { id: 'gift',    label: '禮物',   mono: '禮', tint: '#E9D8EE', ink: '#5F3F76', chart: '#9E7AB2' },
  { id: 'other',   label: '其他',   mono: '其', tint: '#EDE3D7', ink: '#7A6A5A', chart: '#A8998A' },
  { id: 'settle',  label: '還款',   mono: '↺', tint: '#F8DCC9', ink: '#A8542A', chart: '#D17561' },
]

const BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c])) as Record<CategoryId, Category>
const OTHER = BY_ID.other

export function getCategory(id: string): Category {
  return BY_ID[id as CategoryId] ?? OTHER
}

export function isValidCategoryId(id: string): boolean {
  return id in BY_ID
}

// Categories shown in Add sheet (excludes 'settle' — auto-applied for settlements only)
export const PICKABLE_CATEGORIES = CATEGORIES.filter(c => c.id !== 'settle')
