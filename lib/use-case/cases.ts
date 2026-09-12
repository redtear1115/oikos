// lib/use-case/cases.ts
// Central registry for /use-case/<slug> situational SEO landing pages (#851).
// Parallel structure to lib/migrate/sources.ts.

export type UseCaseSlug =
  | 'cohabitation'
  | 'newlyweds'
  | 'pet-owners'
  | 'travel'
  | 'roommates'
  | 'monthly-bills'
  | 'big-purchases'
  | 'dining'
  | 'parenting'
  | 'aa-split'

export type UseCaseDef = {
  slug: UseCaseSlug
  /** Content last-changed date (YYYY-MM-DD) for sitemap lastmod. (#1004) */
  contentUpdatedAt: string
  /** Which Futari features are highlighted for this use case (icon keys). */
  features: readonly ('split' | 'trip' | 'asset' | 'realtime' | 'encrypt' | 'history')[]
}

export const USE_CASES: Record<UseCaseSlug, UseCaseDef> = {
  cohabitation: {
    slug: 'cohabitation',
    contentUpdatedAt: '2026-05-30',
    features: ['split', 'realtime', 'encrypt', 'history'],
  },
  newlyweds: {
    slug: 'newlyweds',
    contentUpdatedAt: '2026-05-30',
    features: ['split', 'asset', 'realtime', 'history'],
  },
  'pet-owners': {
    slug: 'pet-owners',
    contentUpdatedAt: '2026-05-30',
    features: ['asset', 'split', 'history', 'encrypt'],
  },
  travel: {
    slug: 'travel',
    contentUpdatedAt: '2026-05-31',
    features: ['trip', 'split', 'realtime', 'history'],
  },
  roommates: {
    slug: 'roommates',
    contentUpdatedAt: '2026-05-31',
    features: ['split', 'realtime', 'encrypt', 'history'],
  },
  'monthly-bills': {
    slug: 'monthly-bills',
    contentUpdatedAt: '2026-05-31',
    features: ['split', 'realtime', 'history', 'encrypt'],
  },
  'big-purchases': {
    slug: 'big-purchases',
    contentUpdatedAt: '2026-05-31',
    features: ['asset', 'split', 'history', 'realtime'],
  },
  dining: {
    slug: 'dining',
    contentUpdatedAt: '2026-05-31',
    features: ['split', 'realtime', 'history', 'encrypt'],
  },
  parenting: {
    slug: 'parenting',
    contentUpdatedAt: '2026-05-31',
    features: ['asset', 'split', 'realtime', 'history'],
  },
  'aa-split': {
    slug: 'aa-split',
    contentUpdatedAt: '2026-05-31',
    features: ['split', 'realtime', 'encrypt', 'history'],
  },
} as const

export const USE_CASE_SLUGS = Object.keys(USE_CASES) as UseCaseSlug[]
