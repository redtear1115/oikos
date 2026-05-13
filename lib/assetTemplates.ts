// v0.16.0 #222 — 愛物模板登錄表
//
// Templates declare a flat list of free-text/number/date fields. Values land
// in Assets.template_fields (jsonb) keyed by `name`. The template registry
// here is the source of truth for what fields exist, what types they have,
// and what i18n key labels them — no behavioural side-effects, ever.
//
// Scope of v1 (#222): the registry deliberately holds ONE template — `general`
// — used by the new "物品" entry in TypePicker. The five existing emotion-rich
// asset types (car / child / pet / plant / house) keep their dedicated
// SheetBody + Details subtables; `insurance` likewise stays on its own path
// (it's owned by 守護, not 愛物). Adding more templates later (e.g. a
// lightweight `pet` template) means: add the key here, declare its fields,
// and surface it in TypePicker.
//
// To add a new template:
//   1. Add the key to AssetTemplateKey + add the row in TEMPLATES below.
//   2. Add `assetTemplate.template.<key>.*` keys to all four locales.
//   3. (Schema) add the enum value to the `asset_template_key` enum.

export type AssetTemplateKey = 'general'

export const ASSET_TEMPLATE_KEYS: readonly AssetTemplateKey[] = ['general'] as const

export type AssetTemplateFieldType = 'text' | 'number' | 'date'

export interface AssetTemplateField {
  /** Stable key persisted as a JSON property in Assets.template_fields. */
  name: string
  type: AssetTemplateFieldType
  /** Caps on free-text length (chars) / numeric magnitude. */
  maxLength?: number
}

export interface AssetTemplate {
  key: AssetTemplateKey
  fields: readonly AssetTemplateField[]
}

// ── Templates ────────────────────────────────────────────────────────────────
// MVP holds one template — `general`, declaring no fields. The asset-level
// `name` and `notes` columns are shared across templates and are NOT declared
// here; they live on the Asset row directly.

const GENERAL_TEMPLATE: AssetTemplate = {
  key: 'general',
  fields: [],
}

export const TEMPLATES: Record<AssetTemplateKey, AssetTemplate> = {
  general: GENERAL_TEMPLATE,
}

export function getTemplate(key: AssetTemplateKey): AssetTemplate {
  return TEMPLATES[key]
}

export function isAssetTemplateKey(value: unknown): value is AssetTemplateKey {
  return typeof value === 'string' && (ASSET_TEMPLATE_KEYS as readonly string[]).includes(value)
}

// ── Validation ───────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TEXT_DEFAULT_MAX_LEN = 200
const NUMBER_MAX = 1_000_000_000_000 // 10^12 — keeps us inside safe integer range

/**
 * Validates + normalises a raw template_fields payload from the client against
 * the template's declared schema. Unknown keys are dropped. Empty / missing
 * values become null. Type errors throw.
 *
 * Returns an object keyed only by known field names, with each value being
 *   - string (trimmed, length-capped) for 'text'
 *   - integer for 'number'
 *   - 'YYYY-MM-DD' string for 'date'
 *   - null when the user left the field empty
 */
export function validateTemplateFields(
  templateKey: AssetTemplateKey,
  raw: Record<string, unknown> | null | undefined,
): Record<string, string | number | null> {
  const tpl = getTemplate(templateKey)
  const out: Record<string, string | number | null> = {}
  const input = raw ?? {}
  for (const field of tpl.fields) {
    const value = input[field.name]
    if (value === undefined || value === null || value === '') {
      out[field.name] = null
      continue
    }
    if (field.type === 'text') {
      if (typeof value !== 'string') {
        throw new Error(`${field.name} 必須是文字`)
      }
      const trimmed = value.trim()
      if (trimmed === '') {
        out[field.name] = null
        continue
      }
      const max = field.maxLength ?? TEXT_DEFAULT_MAX_LEN
      if (trimmed.length > max) {
        throw new Error(`${field.name} 最長 ${max} 字`)
      }
      out[field.name] = trimmed
    } else if (field.type === 'number') {
      const n = typeof value === 'string' ? Number(value) : value
      if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) {
        throw new Error(`${field.name} 必須是整數`)
      }
      if (n < 0 || n > NUMBER_MAX) {
        throw new Error(`${field.name} 超出可接受範圍`)
      }
      out[field.name] = n
    } else if (field.type === 'date') {
      if (typeof value !== 'string' || !DATE_RE.test(value)) {
        throw new Error(`${field.name} 必須是 YYYY-MM-DD`)
      }
      // Reject silent coercion (e.g. '2024-02-30' → '2024-02-29')
      const parsed = new Date(value + 'T00:00:00Z')
      const y = parsed.getUTCFullYear()
      const m = String(parsed.getUTCMonth() + 1).padStart(2, '0')
      const d = String(parsed.getUTCDate()).padStart(2, '0')
      if (`${y}-${m}-${d}` !== value) {
        throw new Error(`${field.name} 不是合法日期`)
      }
      out[field.name] = value
    }
  }
  return out
}
