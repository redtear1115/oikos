/**
 * Source detection for the authenticated import flow.
 *
 * Thin wrapper around `lib/migrate/csv.ts`'s sniffer — the marketing preview
 * pages return 'unknown' so they can fall back to the URL hint, but the
 * authenticated importer routes 'unknown' through the generic header-map UI
 * so we surface it as 'generic'.
 *
 * `detectFormat` is the upstream sibling: it sniffs the file as a whole
 * (OFX / QIF / CSV) before we even know there are CSV headers. OFX and QIF
 * skip the CSV parser entirely and route to `ofxParser` / `qifParser`.
 */

import { detectSource as detectMigrateSource } from '@/lib/migrate/csv'

export type DetectedSource =
  | 'honeydue'
  | 'spendee'
  | 'cwmoney'
  | 'generic'
  | 'ofx'
  | 'qif'

export function detectSource(headers: readonly string[]): DetectedSource {
  const sniffed = detectMigrateSource(headers)
  return sniffed === 'unknown' ? 'generic' : sniffed
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
