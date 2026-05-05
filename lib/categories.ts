export type CategoryId =
  | 'dining' | 'clothing' | 'housing' | 'transit'
  | 'education' | 'entertainment' | 'health' | 'financial'
  | 'other' | 'settle'

export interface Category {
  id: CategoryId
  label: string
  mono: string  // single-char monogram
  tint: string  // chip background
  ink: string   // chip text
  chart: string // analysis charts
}

export const CATEGORIES: Category[] = [
  { id: 'dining',        label: '飲食', mono: '食', tint: '#FBDCC4', ink: '#8A4A26', chart: '#D4955F' },
  { id: 'clothing',      label: '服飾', mono: '衣', tint: '#DDE0F0', ink: '#3A3A78', chart: '#7A7AB8' },
  { id: 'housing',       label: '居住', mono: '住', tint: '#EFE3D0', ink: '#7A5A38', chart: '#A89274' },
  { id: 'transit',       label: '交通', mono: '行', tint: '#E2E0F0', ink: '#54527A', chart: '#8E8AB8' },
  { id: 'education',     label: '教育', mono: '育', tint: '#F5EAC8', ink: '#7A6020', chart: '#C8A840' },
  { id: 'entertainment', label: '娛樂', mono: '樂', tint: '#F7D8DD', ink: '#8A3F50', chart: '#C97A8E' },
  { id: 'health',        label: '醫療', mono: '醫', tint: '#D7E5DC', ink: '#3F6A56', chart: '#7AA48E' },
  { id: 'financial',     label: '金融', mono: '融', tint: '#D8DFF0', ink: '#2A3A60', chart: '#607090' },
  { id: 'other',         label: '其他', mono: '他', tint: '#EDE3D7', ink: '#7A6A5A', chart: '#A8998A' },
  { id: 'settle',        label: '還款', mono: '↺', tint: '#F8DCC9', ink: '#A8542A', chart: '#D17561' },
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
