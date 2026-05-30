/**
 * Source detection for the CSV import pipeline (issue #623 unified layer).
 *
 * `detectCsvSource` is the raw header sniffer — returns `null` when the file
 * doesn't match a known source. The two callers wrap it differently:
 *   - the authenticated importer maps `null` → `'generic'` so the mapping
 *     wizard can take over;
 *   - the anonymous /migrate preview maps `null` → `'unknown'` and falls back
 *     to the page-level URL hint.
 *
 * `detectFormat` is the upstream sibling: it sniffs the file as a whole
 * (OFX / QIF / CSV) before we know there are CSV headers. OFX and QIF skip the
 * CSV parser entirely and route to `ofxParser` / `qifParser`.
 */

import { type MigrateSlug } from '@/lib/migrate/sources'

export type KnownCsvSource = 'honeydue' | 'spendee' | 'cwmoney'
/**
 * Slugs that exist as /migrate landing pages but have no header-sniff
 * signature or dedicated mapper yet (#839 P1). The anonymous preview falls
 * back to the page hint to label them; the authenticated importer handles
 * their CSVs via the generic mapping wizard. Deliberately *not* part of
 * `KnownCsvSource` — that union is the detector + mapper contract.
 */
// All MIGRATE_SOURCES slugs that are not KnownCsvSource (no dedicated CSV parser)
export type MigratePageOnlySource = Exclude<MigrateSlug, KnownCsvSource>
export type MigrateSource = MigrateSlug | 'unknown'
export type DetectedSource = KnownCsvSource | 'generic' | 'futari_generic' | 'ofx' | 'qif'

/**
 * Best-effort source detection by header signature. Returns `null` rather
 * than guessing — callers decide how to label unknown files.
 */
export function detectCsvSource(headers: readonly string[]): KnownCsvSource | null {
  const lowered = headers.map(h => h.trim().toLowerCase())
  const has = (name: string) => lowered.includes(name)
  const hasAll = (...names: string[]) => names.every(has)

  // CWMoney: 中文欄位（日期 + 金額 + 類別）
  if (headers.some(h => h.includes('日期')) && headers.some(h => h.includes('金額'))) {
    return 'cwmoney'
  }
  // Spendee: distinctive "Category name" + "Wallet" pair
  if (hasAll('date', 'amount') && (has('category name') || has('wallet'))) {
    return 'spendee'
  }
  // Honeydue: Date + Name + Category + Amount + Account
  if (hasAll('date', 'amount') && has('account') && (has('name') || has('description'))) {
    return 'honeydue'
  }
  return null
}

export function detectSource(headers: readonly string[]): DetectedSource {
  return detectCsvSource(headers) ?? 'generic'
}

/**
 * File-level format detection from the decoded text. Used by `processBuffer`
 * before it commits to the CSV parsing path.
 *
 * OFX 1.x starts with `OFXHEADER:100\n…`; OFX 2.x is an XML document whose
 * processing instruction or root element is `<OFX>`. QIF always starts with
 * a `!Type:…` header (`!Type:Bank`, `!Type:CCard`, `!Account`, …).
 */
export function detectFormat(text: string): 'ofx' | 'qif' | 'csv' {
  const head = text.trimStart().slice(0, 512)
  if (/^OFXHEADER:/i.test(head)) return 'ofx'
  if (/^<\?xml[^?]*\?>/i.test(head) && /<OFX[>\s]/i.test(head)) return 'ofx'
  if (/^<OFX[>\s]/i.test(head)) return 'ofx'
  if (/^!Type:/i.test(head) || /^!Account\b/i.test(head)) return 'qif'
  return 'csv'
}
