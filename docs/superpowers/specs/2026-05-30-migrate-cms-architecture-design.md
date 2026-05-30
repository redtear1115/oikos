---
status: approved
first_shipped_in: ~v1.4.0
related_issues:
  - https://github.com/redtear1115/oikos/issues/852
related_specs:
  - csv-import-design.md
---

# Migrate Pages CMS-Style Architecture

## What

Refactor the `/migrate/*` landing pages from a verbose per-source i18n approach to a data-driven architecture where structural data (competitor facts, comparison table) lives in a central `sources.ts` file, and locale files only hold translated emotional copy.

## Why

Adding a new migrate source currently requires editing 4 locale files (~800–1200 lines total), updating 5 TypeScript union type definitions, and creating a new page file. Most of this is repeated structural data (comparison tables, feature rows) that doesn't meaningfully vary by language.

The new architecture reduces adding a source to: one object in `sources.ts` + translated hero/steps/FAQ copy in locale files. TypeScript enforces that locale files stay in sync with `sources.ts` automatically.

## Who

Engineering only. No user-facing behaviour changes — pages render identically after refactor.

---

## Architecture

### Layer 1: `lib/migrate/sources.ts`

Central source of truth for language-agnostic competitor facts.

```ts
export type FeatureTone = 'yes' | 'partial' | 'no' | 'unknown'

export type ComparisonRow = {
  feature: string                            // 中文，不翻譯
  futari: { label: string; tone: FeatureTone }
  other:  { label: string; tone: FeatureTone }
}

export type SourceDef = {
  slug: string
  name: string                               // 品牌名，不翻譯
  templateDownload?: {                       // cwmoney only
    href: string
    labelKey: keyof MigrateBasePageCopy
    noteKey:  keyof MigrateBasePageCopy
  }
  comparison: { rows: ComparisonRow[] }
}

export const MIGRATE_SOURCES = {
  honeydue:   { ... } satisfies SourceDef,
  spendee:    { ... } satisfies SourceDef,
  cwmoney:    { ..., templateDownload: { href: '/cwmoney-template.xlsx', labelKey: 'templateDownloadLabel', noteKey: 'templateNote' } } satisfies SourceDef,
  moneybook:  { ... } satisfies SourceDef,
  andromoney: { ... } satisfies SourceDef,
  mobills:    { ... } satisfies SourceDef,
  manebo:     { ... } satisfies SourceDef,
} satisfies Record<string, SourceDef>

export type MigrateSlug = keyof typeof MIGRATE_SOURCES
// Automatically: 'honeydue' | 'spendee' | 'cwmoney' | 'moneybook' | 'andromoney' | 'mobills' | 'manebo'
```

**Comparison table labels** are written directly in Chinese in `sources.ts` and are not translated. This is intentional — the migrate pages' primary audience is Taiwanese, and the labels are mostly symbol-based (✓/△/✕) with short phrases that don't meaningfully differ across languages.

**Special sections** (e.g., cwmoney's Excel template download) are expressed as optional fields on `SourceDef` rather than per-source if-branches in the page template. The template checks for field presence, not source identity.

### Layer 2: Locale Files

**Removed from locale files:**
- `migrate.pages.[source].comparison` — moved to `sources.ts`
- `migrate.sources.[source]` display names — derived from `MIGRATE_SOURCES[slug].name`

**Remains in locale files (still translated):**

```ts
// MigrateBasePageCopy — applies to all sources
type MigrateBasePageCopy = {
  heroKicker:    string
  heroTitle:     string
  heroSubtitle:  string
  differentiators: readonly [
    { title: string; body: string },
    { title: string; body: string },
    { title: string; body: string },
  ]
  stepsHeading: string
  step1:        string
  step2:        string
  step3:        string
  faq: readonly [
    { question: string; answer: string },
    { question: string; answer: string },
    { question: string; answer: string },
    { question: string; answer: string },
  ]
  // cwmoney only
  templateDownloadLabel?: string
  templateNote?:          string
}
```

**Type safety:** `migrate.pages` in the `Translations` type changes to:

```ts
import { type MigrateSlug } from '@/lib/migrate/sources'

pages: Record<MigrateSlug, MigrateBasePageCopy>
```

Adding a new slug to `MIGRATE_SOURCES` automatically expands `MigrateSlug`, which causes TypeScript errors in all four locale files until translations are added. No manual union type updates required.

### Layer 3: Dynamic Route

**Replaces** all individual `app/[locale]/migrate/[source]/page.tsx` files with a single dynamic route:

```
app/[locale]/migrate/[source]/page.tsx
```

```tsx
export function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap(locale =>
    Object.keys(MIGRATE_SOURCES).map(source => ({ locale, source }))
  )
}
```

`generateStaticParams()` produces fully static HTML at build time — identical to individual page files from Google's perspective. No SEO impact.

**Special section rendering** via optional field check (not source identity):

```tsx
const step2Content = def.templateDownload ? (
  <>
    <div>{page.step2}</div>
    <a href={def.templateDownload.href} download>
      {page[def.templateDownload.labelKey]}
    </a>
    <p>{page[def.templateDownload.noteKey]}</p>
  </>
) : page.step2
```

**`MigrateComparison` component** receives `rows: ComparisonRow[]` directly from `def.comparison.rows`. The `otherLabel` comes from `def.name`. The `comparisonHeading` template string in locale (`'Futari vs {other}'`) is still used, with `{other}` replaced by `def.name`.

---

## Files Changed

### New
- `lib/migrate/sources.ts`

### Modified
- `lib/i18n/locales/zh-TW.ts` — remove `comparison` from all sources, remove `sources.*` display names, change `pages` type to `Record<MigrateSlug, MigrateBasePageCopy>`
- `lib/i18n/locales/zh-CN.ts` — same
- `lib/i18n/locales/en.ts` — same
- `lib/i18n/locales/ja.ts` — same
- `app/[locale]/migrate/_components/MigrateComparison.tsx` — accept `rows` directly instead of via locale
- `app/[locale]/migrate/_components/MigrateOtherSources.tsx` — derive source names from `MIGRATE_SOURCES`
- `app/[locale]/migrate/_components/MigrateBreadcrumbJsonLd.tsx` — Source type derived from `MigrateSlug`
- `app/[locale]/migrate/_components/MigrateHowToJsonLd.tsx` — same
- `app/sitemap.ts` — derive paths from `MIGRATE_SOURCES` keys instead of hardcoded list
- `lib/csvImport/detector.ts` — `MigratePageOnlySource` derived from `MigrateSlug`

### Deleted
```
app/[locale]/migrate/honeydue/page.tsx
app/[locale]/migrate/spendee/page.tsx
app/[locale]/migrate/cwmoney/page.tsx
app/[locale]/migrate/moneybook/page.tsx
app/[locale]/migrate/andromoney/page.tsx
app/[locale]/migrate/mobills/page.tsx
app/[locale]/migrate/manebo/page.tsx
```

### Created
```
app/[locale]/migrate/[source]/page.tsx
```

---

## Migration Strategy

All-at-once (no parallel coexistence period):

1. Build `lib/migrate/sources.ts` with all 7 sources and their comparison rows
2. Create `app/[locale]/migrate/[source]/page.tsx`
3. Strip `comparison` from all locale files; remove `sources.*` display name entries
4. Update `MigrateBasePageCopy` type; change `pages` to `Record<MigrateSlug, MigrateBasePageCopy>`
5. Update components (`MigrateComparison`, `MigrateOtherSources`, `MigrateBreadcrumbJsonLd`, `MigrateHowToJsonLd`)
6. Update `sitemap.ts` and `detector.ts`
7. Delete 7 individual page files
8. Verify `generateStaticParams()` produces the correct URL set
9. Run `tsc --noEmit` to confirm no type errors

---

## Adding a New Source After This Refactor

1. Add one `SourceDef` object to `MIGRATE_SOURCES` in `lib/migrate/sources.ts`
2. TypeScript immediately errors in all 4 locale files
3. Add translated `MigrateBasePageCopy` to each locale file
4. Add SEO meta (`seo.migrate.[slug]`) to each locale file
5. `sitemap.ts`, routing, type unions, and components all update automatically

No page files to create. No union types to update manually.

---

## Extension to `/use-case/*`

The same pattern applies to the persona landing pages (#851). A `lib/use-case/personas.ts` file would define `PersonaDef` objects, and `app/[locale]/use-case/[persona]/page.tsx` would be the single dynamic route. Design for that is out of scope here but the architecture is intentionally compatible.
