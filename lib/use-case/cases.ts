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
  /** Which Futari features are highlighted for this use case (icon keys). */
  features: readonly ('split' | 'trip' | 'asset' | 'realtime' | 'encrypt' | 'history')[]
}

export const USE_CASES: Record<UseCaseSlug, UseCaseDef> = {
  cohabitation: {
    slug: 'cohabitation',
    features: ['split', 'realtime', 'encrypt', 'history'],
  },
  newlyweds: {
    slug: 'newlyweds',
    features: ['split', 'asset', 'realtime', 'history'],
  },
  'pet-owners': {
    slug: 'pet-owners',
    features: ['asset', 'split', 'history', 'encrypt'],
  },
  travel: {
    slug: 'travel',
    features: ['trip', 'split', 'realtime', 'history'],
  },
  roommates: {
    slug: 'roommates',
    features: ['split', 'realtime', 'encrypt', 'history'],
  },
  'monthly-bills': {
    slug: 'monthly-bills',
    features: ['split', 'realtime', 'history', 'encrypt'],
  },
  'big-purchases': {
    slug: 'big-purchases',
    features: ['asset', 'split', 'history', 'realtime'],
  },
  dining: {
    slug: 'dining',
    features: ['split', 'realtime', 'history', 'encrypt'],
  },
  parenting: {
    slug: 'parenting',
    features: ['asset', 'split', 'realtime', 'history'],
  },
  'aa-split': {
    slug: 'aa-split',
    features: ['split', 'realtime', 'encrypt', 'history'],
  },
} as const

export const USE_CASE_SLUGS = Object.keys(USE_CASES) as UseCaseSlug[]
