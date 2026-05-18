/**
 * Source detection for the authenticated import flow.
 *
 * Thin wrapper around `lib/migrate/csv.ts`'s sniffer — the marketing preview
 * pages return 'unknown' so they can fall back to the URL hint, but the
 * authenticated importer routes 'unknown' through the generic header-map UI
 * so we surface it as 'generic'.
 */

import { detectSource as detectMigrateSource } from '@/lib/migrate/csv'

export type DetectedSource = 'honeydue' | 'spendee' | 'cwmoney' | 'generic'

export function detectSource(headers: readonly string[]): DetectedSource {
  const sniffed = detectMigrateSource(headers)
  return sniffed === 'unknown' ? 'generic' : sniffed
}
