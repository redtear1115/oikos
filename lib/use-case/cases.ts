// lib/use-case/cases.ts
// Central registry for /use-case/<slug> situational SEO landing pages (#851).
// Parallel structure to lib/migrate/sources.ts.

export type UseCaseSlug = 'cohabitation' | 'newlyweds' | 'pet-owners'

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
} as const

export const USE_CASE_SLUGS = Object.keys(USE_CASES) as UseCaseSlug[]
