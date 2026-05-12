import { lightenHex } from './colors'

export type CategoryId =
  | 'dining' | 'clothing' | 'housing' | 'transit'
  | 'education' | 'entertainment' | 'health' | 'financial'
  | 'other' | 'settle'

export interface Category {
  id: CategoryId
  label: string
  mono: string  // single-char monogram
  /** Primary identity color — used directly for donut slices and detail-bar
   *  fills. The lighter `tint` (chip bg) is mathematically derived from this
   *  so feed icons and the donut slice always read as the same hue. */
  color: string
  /** Chip background — derived from `color` via `lightenHex`. */
  tint: string
  /** Chip text — manually chosen darker variant for legible mono-on-tint. */
  ink: string
  /** Alias of `color`. Retained so existing chart / bar-fill callsites keep
   *  reading `.chart` without churn. */
  chart: string
}

/**
 * Single source of truth for category colors. Each entry declares one
 * primary `color` (= donut slice / chart accent) and a dark `ink` for chip
 * text; `tint` is derived so the chip in any feed always shares the donut
 * slice's hue family — that's the contract issue #149 enforces.
 */
const PALETTE: Array<Pick<Category, 'id' | 'label' | 'mono' | 'color' | 'ink'>> = [
  { id: 'dining',        label: '飲食', mono: '食', color: '#D4955F', ink: '#8A4A26' },
  { id: 'clothing',      label: '服飾', mono: '衣', color: '#7A7AB8', ink: '#3A3A78' },
  { id: 'housing',       label: '居住', mono: '住', color: '#A89274', ink: '#7A5A38' },
  { id: 'transit',       label: '交通', mono: '行', color: '#8E8AB8', ink: '#54527A' },
  { id: 'education',     label: '教育', mono: '育', color: '#C8A840', ink: '#7A6020' },
  { id: 'entertainment', label: '娛樂', mono: '樂', color: '#C97A8E', ink: '#8A3F50' },
  { id: 'health',        label: '醫療', mono: '醫', color: '#7AA48E', ink: '#3F6A56' },
  { id: 'financial',     label: '金融', mono: '融', color: '#607090', ink: '#2A3A60' },
  { id: 'other',         label: '其他', mono: '他', color: '#A8998A', ink: '#7A6A5A' },
  { id: 'settle',        label: '還款', mono: '↺', color: '#D17561', ink: '#A8542A' },
]

export const CATEGORIES: Category[] = PALETTE.map((c) => ({
  ...c,
  tint: lightenHex(c.color),
  chart: c.color,
}))

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
