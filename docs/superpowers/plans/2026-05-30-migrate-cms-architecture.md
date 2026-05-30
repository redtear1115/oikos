# Migrate Pages CMS Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `/migrate/*` pages from 7 individual page files + verbose per-source i18n comparison data to a data-driven architecture with a central `sources.ts` and a single dynamic route.

**Architecture:** `lib/migrate/sources.ts` holds competitor facts and comparison tables (not translated). Locale files keep hero/steps/FAQ copy but lose `comparison` blocks. A single `app/[locale]/migrate/[source]/page.tsx` replaces 7 individual files via `generateStaticParams()`.

**Tech Stack:** Next.js 16 dynamic routes, TypeScript `satisfies`, existing migrate component library.

**Spec:** `docs/superpowers/specs/2026-05-30-migrate-cms-architecture-design.md`

---

## File Map

**Create:**
- `lib/migrate/sources.ts` — all competitor facts + comparison rows
- `app/[locale]/migrate/[source]/page.tsx` — single dynamic route

**Modify:**
- `lib/i18n/locales/zh-TW.ts` — remove comparison types + data, add optional fields to `MigrateBasePageCopy`, type `pages` as `Record<MigrateSlug, MigrateBasePageCopy>`
- `lib/i18n/locales/zh-CN.ts` — same data changes
- `lib/i18n/locales/en.ts` — same data changes
- `lib/i18n/locales/ja.ts` — same data changes
- `app/[locale]/migrate/_components/MigrateOtherSources.tsx` — use `MigrateSlug` + derive list from `MIGRATE_SOURCES`
- `app/[locale]/migrate/_components/MigrateBreadcrumbJsonLd.tsx` — use `MigrateSlug`
- `app/[locale]/migrate/_components/MigrateHowToJsonLd.tsx` — use `MigrateSlug`
- `app/sitemap.ts` — derive `/migrate/*` paths from `MIGRATE_SOURCES`
- `lib/csvImport/detector.ts` — derive `MigratePageOnlySource` from `MigrateSlug`

**Delete:**
- `app/[locale]/migrate/honeydue/page.tsx`
- `app/[locale]/migrate/spendee/page.tsx`
- `app/[locale]/migrate/cwmoney/page.tsx`
- `app/[locale]/migrate/moneybook/page.tsx`
- `app/[locale]/migrate/andromoney/page.tsx`
- `app/[locale]/migrate/mobills/page.tsx`
- `app/[locale]/migrate/manebo/page.tsx`

---

## Task 1: Create `lib/migrate/sources.ts`

**Files:**
- Create: `lib/migrate/sources.ts`

- [ ] **Step 1: Create the file with all types and source definitions**

```ts
// lib/migrate/sources.ts

export type CellTone = 'yes' | 'partial' | 'no'

export type ComparisonRow = {
  feature: string
  futari: { label: string; tone: CellTone }
  other:  { label: string; tone: CellTone }
}

export type SourceDef = {
  slug: string
  name: string
  /** cwmoney only — renders a download link inside step 2 */
  templateDownload?: { href: string }
  comparison: { rows: ComparisonRow[] }
}

export const MIGRATE_SOURCES = {
  honeydue: {
    slug: 'honeydue',
    name: 'Honeydue',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✓ 支援',     tone: 'yes'     } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '△ 基本對半', tone: 'partial' } },
        { feature: '持續維護更新', futari: { label: '✓ 每兩週發版', tone: 'yes'   }, other: { label: '△ 節奏放緩', tone: 'partial' } },
        { feature: '多幣別記帳',   futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '端對端資料加密', futari: { label: '✓ 支援',   tone: 'yes'     }, other: { label: '未說明',     tone: 'no'      } },
      ],
    },
  },
  spendee: {
    slug: 'spendee',
    name: 'Spendee',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 免費內建',   tone: 'yes'     }, other: { label: '△ 需付費解鎖',     tone: 'partial' } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式',   tone: 'yes'     }, other: { label: '✕ 無原生支援',     tone: 'no'      } },
        { feature: '即時同步',     futari: { label: '✓ 支援',       tone: 'yes'     }, other: { label: '△ 限付費版',       tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',       tone: 'yes'     }, other: { label: '△ 基本版有限制',   tone: 'partial' } },
        { feature: 'CSV 資料匯入', futari: { label: '✓ 直接上傳',   tone: 'yes'     }, other: { label: '需自行整理',       tone: 'partial' } },
      ],
    },
  },
  cwmoney: {
    slug: 'cwmoney',
    name: 'CWMoney',
    templateDownload: { href: '/cwmoney-template.xlsx' },
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計', tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',       tone: 'no'      } },
        { feature: '多幣別記帳',   futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✓ 支援',     tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ VIP 解鎖', tone: 'partial' } },
        { feature: '即時雲端同步', futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: '△ 需 VIP',   tone: 'partial' } },
      ],
    },
  },
  moneybook: {
    slug: 'moneybook',
    name: 'Moneybook',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計',     tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',           tone: 'no'      } },
        { feature: 'CSV 資料匯入', futari: { label: '✓ 直接上傳', tone: 'yes'     }, other: { label: '✓ 可匯出',       tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ 部分功能付費', tone: 'partial' } },
        { feature: '端對端資料加密', futari: { label: '✓ 支援',   tone: 'yes'     }, other: { label: '未說明',         tone: 'no'      } },
      ],
    },
  },
  andromoney: {
    slug: 'andromoney',
    name: 'AndroMoney',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計',       tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',             tone: 'no'      } },
        { feature: '即時雲端同步', futari: { label: '✓ 即時',     tone: 'yes'     }, other: { label: '△ 需手動備份',     tone: 'partial' } },
        { feature: '多幣別記帳',   futari: { label: '✓ 支援',     tone: 'yes'     }, other: { label: '✓ 支援',           tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ 含廣告／付費版', tone: 'partial' } },
      ],
    },
  },
  mobills: {
    slug: 'mobills',
    name: 'Mobills',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '✕ 單人設計',   tone: 'no'      } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',         tone: 'no'      } },
        { feature: '介面語言',     futari: { label: '✓ 中英日四語', tone: 'yes'  }, other: { label: '△ 以英文為主', tone: 'partial' } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ 進階需訂閱', tone: 'partial' } },
        { feature: 'CSV 資料匯入', futari: { label: '✓ 直接上傳', tone: 'yes'     }, other: { label: '✓ 可匯出',     tone: 'yes'     } },
      ],
    },
  },
  manebo: {
    slug: 'manebo',
    name: 'Manebo',
    comparison: {
      rows: [
        { feature: '雙人共同帳本', futari: { label: '✓ 預設模式', tone: 'yes'     }, other: { label: '△ 需設定共享',   tone: 'partial' } },
        { feature: '費用分攤模式', futari: { label: '✓ 多種模式', tone: 'yes'     }, other: { label: '✕ 無',           tone: 'no'      } },
        { feature: 'CSV 資料匯入', futari: { label: '✓ 直接上傳', tone: 'yes'     }, other: { label: '✓ 可匯出',       tone: 'yes'     } },
        { feature: '完全免費',     futari: { label: '✓ 永久',     tone: 'yes'     }, other: { label: '△ 部分功能付費', tone: 'partial' } },
        { feature: '端對端資料加密', futari: { label: '✓ 支援',   tone: 'yes'     }, other: { label: '未說明',         tone: 'no'      } },
      ],
    },
  },
} satisfies Record<string, SourceDef>

export type MigrateSlug = keyof typeof MIGRATE_SOURCES
// → 'honeydue' | 'spendee' | 'cwmoney' | 'moneybook' | 'andromoney' | 'mobills' | 'manebo'
```

- [ ] **Step 2: Commit**

```bash
git add lib/migrate/sources.ts
git commit -m "feat: add lib/migrate/sources.ts — competitor facts + comparison rows (#852)"
```

---

## Task 2: Update type definitions in `zh-TW.ts`

**Files:**
- Modify: `lib/i18n/locales/zh-TW.ts` (lines 1–61 — type section only)

The goal is to:
1. Remove `MigrateCellTone` and `MigrateComparisonCopy` types (no longer needed in locale)
2. Remove `comparison: MigrateComparisonCopy` from `MigrateBasePageCopy`
3. Add optional special-section fields to `MigrateBasePageCopy`
4. In `Translations`, replace per-source types (honeydue/spendee/cwmoney custom blocks) with `Record<MigrateSlug, MigrateBasePageCopy>`
5. Remove `migrate.sources.*` type entries

- [ ] **Step 1: Replace the top-of-file type block (lines 1–61)**

Replace:
```ts
/** Comparison-table copy for /migrate/<source> pages (#599).
 *  Each cell carries a localized `label` and a structural `tone` that
 *  drives the visual treatment in `<MigrateComparison />`. */
export type MigrateCellTone = 'yes' | 'partial' | 'no'
export type MigrateComparisonCopy = {
  otherLabel: string
  rows: readonly [...]  // 5-element tuple
}

/** Base copy shape for the Taiwan P1 migrate pages (#839)... */
export type MigrateBasePageCopy = {
  heroKicker: string
  heroTitle: string
  heroSubtitle: string
  differentiators: readonly [...]
  stepsHeading: string
  step1: string
  step2: string
  step3: string
  faq: readonly [...]
  comparison: MigrateComparisonCopy   // ← REMOVE THIS LINE
}
```

With:
```ts
/** Base copy shape for all /migrate/<source> pages.
 *  `comparison` has moved to lib/migrate/sources.ts (#852).
 *  Optional fields are source-specific extras — only honeydue has `intro`,
 *  only spendee has `formatHint*`, only cwmoney has `templateDownload*`. */
export type MigrateBasePageCopy = {
  heroKicker: string
  heroTitle: string
  heroSubtitle: string
  /** honeydue only — objective background paragraph rendered above differentiators */
  intro?: string
  differentiators: readonly [
    { title: string; body: string },
    { title: string; body: string },
    { title: string; body: string },
  ]
  stepsHeading: string
  step1: string
  step2: string
  step3: string
  /** spendee only — CSV column hint rendered inside step 1 */
  formatHintLabel?: string
  formatHintHeaders?: string
  formatHintNote?: string
  /** cwmoney only — Excel template download rendered inside step 2 */
  templateDownloadLabel?: string
  templateNote?: string
  faq: readonly [
    { question: string; answer: string },
    { question: string; answer: string },
    { question: string; answer: string },
    { question: string; answer: string },
  ]
}
```

- [ ] **Step 2: Update `Translations.migrate.sources` type — remove per-source display names**

Find in the `Translations` type:
```ts
    sources: {
      honeydue: string
      spendee: string
      cwmoney: string
      moneybook: string
      andromoney: string
      mobills: string
      manebo: string
      unknown: string
    }
```

Replace with (keep only `unknown` — all brand names now come from `sources.ts`):
```ts
    sources: {
      /** Fallback shown when header sniffer + page hint both fail. */
      unknown: string
    }
```

- [ ] **Step 3: Update `Translations.migrate.pages` type**

Find:
```ts
    pages: {
      honeydue: {
        heroKicker: string
        heroTitle: string
        heroSubtitle: string
        intro: string
        differentiators: readonly [...]
        stepsHeading: string
        step1: string
        step2: string
        step3: string
        faq: readonly [...]
        comparison: MigrateComparisonCopy
      }
      spendee: {
        heroKicker: string
        heroTitle: string
        heroSubtitle: string
        differentiators: readonly [...]
        stepsHeading: string
        step1: string
        step2: string
        step3: string
        formatHintLabel: string
        formatHintHeaders: string
        formatHintNote: string
        faq: readonly [...]
        comparison: MigrateComparisonCopy
      }
      cwmoney: {
        heroKicker: string
        heroTitle: string
        heroSubtitle: string
        differentiators: readonly [...]
        stepsHeading: string
        step1: string
        step2: string
        step3: string
        templateDownloadLabel: string
        templateNote: string
        faq: readonly [...]
        comparison: MigrateComparisonCopy
      }
      moneybook: MigrateBasePageCopy
      andromoney: MigrateBasePageCopy
      mobills: MigrateBasePageCopy
      manebo: MigrateBasePageCopy
    }
```

Replace with:
```ts
    pages: Record<import('@/lib/migrate/sources').MigrateSlug, MigrateBasePageCopy>
```

- [ ] **Step 4: Verify `tsc --noEmit` now produces errors only in implementation sections (locale data)**

Run:
```bash
cd /Users/ray-lee/Projects/freedom-project/oikos && npx tsc --noEmit 2>&1 | head -40
```

Expected: TypeScript errors in the `zhTW.migrate.pages.*` implementation and `zhTW.migrate.sources.*` — that is correct and will be fixed in Task 3.

- [ ] **Step 5: Commit the type changes**

```bash
git add lib/i18n/locales/zh-TW.ts
git commit -m "refactor: update MigrateBasePageCopy type — remove comparison, add optional fields (#852)"
```

---

## Task 3: Strip comparison data from all 4 locale files

**Files:**
- Modify: `lib/i18n/locales/zh-TW.ts` (implementation section)
- Modify: `lib/i18n/locales/zh-CN.ts`
- Modify: `lib/i18n/locales/en.ts`
- Modify: `lib/i18n/locales/ja.ts`

For each locale file, make these changes to the `migrate:` implementation object:

**A. Remove `migrate.sources.*` display names** (keep only `unknown`)

Before (zh-TW example):
```ts
    sources: {
      honeydue: 'Honeydue',
      spendee: 'Spendee',
      cwmoney: 'CWMoney',
      moneybook: 'Moneybook',
      andromoney: 'AndroMoney',
      mobills: 'Mobills',
      manebo: 'Manebo',
      unknown: '其他',
    },
```

After:
```ts
    sources: {
      unknown: '其他',     // zh-TW
      // unknown: 'Other',  // en
      // unknown: '其他',   // zh-CN
      // unknown: 'その他', // ja
    },
```

**B. Remove `comparison: { otherLabel, rows }` from all 7 sources in `pages`**

For each source (honeydue, spendee, cwmoney, moneybook, andromoney, mobills, manebo), delete the entire `comparison: { ... }` block. The block spans ~25 lines per source.

Also delete the `otherLabel` field from sources that had it at the top of `comparison`.

**C. For honeydue**: `intro` changes from required to optional — no code change needed, it's already present.

**D. For spendee**: `formatHintLabel/Headers/Note` change from required to optional — no code change needed.

**E. For cwmoney**: `templateDownloadLabel/Note` change from required to optional — no code change needed.

- [ ] **Step 1: Edit `zh-TW.ts` — remove `sources.*` display names and all `comparison` blocks**

Use search-replace to find and delete each `comparison: {` block. Each block looks like:
```ts
        comparison: {
          otherLabel: '...',
          rows: [
            { feature: '...', futari: { label: '...', tone: '...' }, other: { label: '...', tone: '...' } },
            { feature: '...', futari: { label: '...', tone: '...' }, other: { label: '...', tone: '...' } },
            { feature: '...', futari: { label: '...', tone: '...' }, other: { label: '...', tone: '...' } },
            { feature: '...', futari: { label: '...', tone: '...' }, other: { label: '...', tone: '...' } },
            { feature: '...', futari: { label: '...', tone: '...' }, other: { label: '...', tone: '...' } },
          ],
        },
```

After all removals in zh-TW.ts, the `pages.honeydue` object ends with `faq: [...]`, the `pages.spendee` object ends with `faq: [...]`, and so on.

- [ ] **Step 2: Edit `zh-CN.ts` — same removals**

- [ ] **Step 3: Edit `en.ts` — same removals**

- [ ] **Step 4: Edit `ja.ts` — same removals**

- [ ] **Step 5: Run `tsc --noEmit` — should be clean**

```bash
cd /Users/ray-lee/Projects/freedom-project/oikos && npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors (or only pre-existing unrelated errors).

- [ ] **Step 6: Commit**

```bash
git add lib/i18n/locales/zh-TW.ts lib/i18n/locales/zh-CN.ts lib/i18n/locales/en.ts lib/i18n/locales/ja.ts
git commit -m "refactor: strip comparison data from all locale files — moved to sources.ts (#852)"
```

---

## Task 4: Update shared migrate components

**Files:**
- Modify: `app/[locale]/migrate/_components/MigrateOtherSources.tsx`
- Modify: `app/[locale]/migrate/_components/MigrateBreadcrumbJsonLd.tsx`
- Modify: `app/[locale]/migrate/_components/MigrateHowToJsonLd.tsx`

All three files define a local `type Source = 'honeydue' | 'spendee' | ...` union. Replace with `MigrateSlug` from `sources.ts`.

- [ ] **Step 1: Update `MigrateOtherSources.tsx`**

Replace:
```ts
type Source = 'honeydue' | 'spendee' | 'cwmoney' | 'moneybook' | 'andromoney' | 'mobills'

const ALL_SOURCES: readonly Source[] = [
  'honeydue',
  'spendee',
  'cwmoney',
  'moneybook',
  'andromoney',
  'mobills',
]

type OtherSources = Translations['migrate']['otherSources']
```

With:
```ts
import { MIGRATE_SOURCES, type MigrateSlug } from '@/lib/migrate/sources'

type Source = MigrateSlug

const ALL_SOURCES = Object.keys(MIGRATE_SOURCES) as MigrateSlug[]

type OtherSources = Translations['migrate']['otherSources']
```

Also update `currentSource` and `copy.items` usage — `copy.items[source]` still works because `otherSources.items` in locale still has per-source entries. But we need to add `manebo` to `otherSources.items` in locale if not already there (check with `tsc`).

- [ ] **Step 2: Update `MigrateBreadcrumbJsonLd.tsx`**

Replace:
```ts
type Source = 'honeydue' | 'spendee' | 'cwmoney' | 'moneybook' | 'andromoney' | 'mobills'

const SOURCE_NAMES: Record<Source, string> = {
  honeydue: 'Honeydue',
  spendee: 'Spendee',
  cwmoney: 'CWMoney',
  moneybook: 'Moneybook',
  andromoney: 'AndroMoney',
  mobills: 'Mobills',
}
```

With:
```ts
import { MIGRATE_SOURCES, type MigrateSlug } from '@/lib/migrate/sources'

type Source = MigrateSlug
```

Update the JSON-LD line that used `SOURCE_NAMES[source]`:
```ts
// Before:
name: SOURCE_NAMES[source],
// After:
name: MIGRATE_SOURCES[source].name,
```

- [ ] **Step 3: Update `MigrateHowToJsonLd.tsx`**

Replace:
```ts
type Source = 'honeydue' | 'spendee' | 'cwmoney' | 'moneybook' | 'andromoney' | 'mobills'
```

With:
```ts
import { type MigrateSlug } from '@/lib/migrate/sources'
type Source = MigrateSlug
```

- [ ] **Step 4: Run `tsc --noEmit` — verify no errors**

```bash
cd /Users/ray-lee/Projects/freedom-project/oikos && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add app/[locale]/migrate/_components/MigrateOtherSources.tsx \
        app/[locale]/migrate/_components/MigrateBreadcrumbJsonLd.tsx \
        app/[locale]/migrate/_components/MigrateHowToJsonLd.tsx
git commit -m "refactor: migrate components use MigrateSlug from sources.ts (#852)"
```

---

## Task 5: Create dynamic `[source]/page.tsx`

**Files:**
- Create: `app/[locale]/migrate/[source]/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// app/[locale]/migrate/[source]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales, ogImage } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { MIGRATE_SOURCES, type MigrateSlug } from '@/lib/migrate/sources'
import { MigrateTool } from '../_components/MigrateTool'
import { MigrateHero, MigrateSteps } from '../_components/MigrateSteps'
import { MigrateIntroCallout } from '../_components/MigrateIntroCallout'
import { MigrateDifferentiators } from '../_components/MigrateDifferentiators'
import { MigrateTrustBlock, MigrateFooter } from '../_components/MigrateTrustFooter'
import { MigrateBreadcrumbJsonLd } from '../_components/MigrateBreadcrumbJsonLd'
import { MigrateHowToJsonLd } from '../_components/MigrateHowToJsonLd'
import { MigrateFaq } from '../_components/MigrateFaq'
import { MigrateComparison } from '../_components/MigrateComparison'
import { MigrateOtherSources } from '../_components/MigrateOtherSources'

type Params = Promise<{ locale: string; source: string }>

// Build-time expansion: all locale × source combinations → pure static HTML.
// SEO is identical to individual page files.
export function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap((locale) =>
    Object.keys(MIGRATE_SOURCES).map((source) => ({ locale, source })),
  )
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: rawLocale, source } = await params
  if (!isLocale(rawLocale) || !(source in MIGRATE_SOURCES)) return {}
  const locale: Locale = rawLocale
  const slug = source as MigrateSlug
  const t = dictionaries[locale].seo.migrate[slug]
  const path = `/migrate/${slug}` as const
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates(path, locale),
    openGraph: {
      title: t.title,
      description: t.ogDescription,
      url: localizedHref(path, locale),
      siteName: 'Futari · 雙人記帳',
      type: 'website',
      locale: ogLocale(locale),
      alternateLocale: alternateOgLocales(locale),
      images: [{ url: ogImage(locale), width: 1200, height: 630, alt: t.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.ogDescription,
      images: [ogImage(locale)],
    },
  }
}

export default async function MigrateSourcePage({ params }: { params: Params }) {
  const { locale: rawLocale, source } = await params
  if (!isLocale(rawLocale) || !(source in MIGRATE_SOURCES)) notFound()
  const locale: Locale = rawLocale as Locale
  const slug = source as MigrateSlug

  const def = MIGRATE_SOURCES[slug]
  const t = dictionaries[locale].migrate
  const page = t.pages[slug]
  const signInHref = localizedHref('/sign-in', locale)

  // spendee: CSV format hint injected inside step 1
  const step1Content =
    page.formatHintLabel ? (
      <>
        <div>{page.step1}</div>
        <div className="mt-3 space-y-1.5">
          <div className="text-caption" style={{ color: 'var(--ink-2)' }}>
            {page.formatHintLabel}
          </div>
          <code
            className="block px-3 py-2 rounded-[8px] text-[11.5px] leading-[1.6] break-all"
            style={{
              background: 'var(--surface)',
              color: 'var(--ink-2)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {page.formatHintHeaders}
          </code>
          <p className="text-caption mt-1.5 m-0" style={{ color: 'var(--ink-3)' }}>
            {page.formatHintNote}
          </p>
        </div>
      </>
    ) : (
      page.step1
    )

  // cwmoney: Excel template download injected inside step 2
  const step2Content =
    def.templateDownload ? (
      <>
        <div>{page.step2}</div>
        <a
          href={def.templateDownload.href}
          download
          className="inline-flex items-center gap-2 mt-2 text-meta"
          style={{
            color: 'var(--ink)',
            textDecoration: 'underline',
            textDecorationColor: 'var(--accent)',
            textUnderlineOffset: '4px',
          }}
        >
          <span aria-hidden>↓</span>
          <span>{page.templateDownloadLabel}</span>
        </a>
        <p className="text-caption mt-1.5 m-0" style={{ color: 'var(--ink-3)' }}>
          {page.templateNote}
        </p>
      </>
    ) : (
      page.step2
    )

  return (
    <div className="space-y-10 md:space-y-14">
      <MigrateBreadcrumbJsonLd locale={locale} source={slug} />
      <MigrateHowToJsonLd
        locale={locale}
        source={slug}
        name={page.heroTitle}
        description={page.heroSubtitle}
        steps={[page.step1, page.step2, page.step3]}
      />
      <MigrateHero kicker={page.heroKicker} title={page.heroTitle} subtitle={page.heroSubtitle} />

      {page.intro && <MigrateIntroCallout text={page.intro} />}

      <MigrateDifferentiators heading={t.differentiatorsHeading} items={page.differentiators} />

      <MigrateSteps
        heading={page.stepsHeading}
        steps={[step1Content, step2Content, page.step3]}
      />

      <MigrateTool t={t} signInHref={signInHref} hint={slug} />

      <MigrateComparison
        heading={t.comparisonHeading.replace('{other}', def.name)}
        futariLabel="Futari"
        otherLabel={def.name}
        rows={def.comparison.rows}
      />

      <MigrateFaq locale={locale} heading={t.faqHeading} items={page.faq} />

      <MigrateOtherSources locale={locale} currentSource={slug} copy={t.otherSources} />

      <MigrateTrustBlock heading={t.trust.heading} items={t.trust.items} />

      <MigrateFooter
        trustNote={t.footerTrust}
        legalLinks={{
          termsHref: localizedHref('/terms', locale),
          termsLabel: dictionaries[locale].signIn.termsLink,
          privacyHref: localizedHref('/privacy', locale),
          privacyLabel: dictionaries[locale].signIn.privacyLink,
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Run `tsc --noEmit` — verify no errors in new file**

```bash
cd /Users/ray-lee/Projects/freedom-project/oikos && npx tsc --noEmit 2>&1 | grep "\[source\]" | head -20
```

Expected: 0 errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/migrate/[source]/page.tsx"
git commit -m "feat: add dynamic migrate/[source]/page.tsx — replaces 7 individual pages (#852)"
```

---

## Task 6: Update `sitemap.ts` and `detector.ts`

**Files:**
- Modify: `app/sitemap.ts`
- Modify: `lib/csvImport/detector.ts`

- [ ] **Step 1: Update `sitemap.ts` — derive migrate paths from `MIGRATE_SOURCES`**

Add import at top of `sitemap.ts`:
```ts
import { MIGRATE_SOURCES } from '@/lib/migrate/sources'
```

Replace the hardcoded migrate path entries:
```ts
  { path: '/migrate/honeydue',   changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-20' },
  { path: '/migrate/spendee',    changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-20' },
  { path: '/migrate/cwmoney',    changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-20' },
  { path: '/migrate/moneybook',  changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-30' },
  { path: '/migrate/andromoney', changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-30' },
  { path: '/migrate/mobills',    changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-30' },
```

With:
```ts
  // migrate pages — auto-derived from MIGRATE_SOURCES (#852)
  ...Object.keys(MIGRATE_SOURCES).map((slug) => ({
    path: `/migrate/${slug}` as const,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
    lastModified: '2026-05-30',
  })),
```

Also remove the manebo entry if it was added manually.

- [ ] **Step 2: Update `detector.ts` — derive `MigratePageOnlySource` from `MigrateSlug`**

Current:
```ts
export type KnownCsvSource = 'honeydue' | 'spendee' | 'cwmoney'
export type MigratePageOnlySource = 'moneybook' | 'andromoney' | 'mobills'
export type MigrateSource = KnownCsvSource | MigratePageOnlySource | 'unknown'
```

Replace with:
```ts
import { type MigrateSlug } from '@/lib/migrate/sources'

export type KnownCsvSource = 'honeydue' | 'spendee' | 'cwmoney'
// All slugs in MIGRATE_SOURCES that are NOT KnownCsvSource
export type MigratePageOnlySource = Exclude<MigrateSlug, KnownCsvSource>
export type MigrateSource = MigrateSlug | 'unknown'
```

- [ ] **Step 3: Run `tsc --noEmit` — clean**

```bash
cd /Users/ray-lee/Projects/freedom-project/oikos && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/sitemap.ts lib/csvImport/detector.ts
git commit -m "refactor: derive migrate paths + detector types from MIGRATE_SOURCES (#852)"
```

---

## Task 7: Delete individual page files

**Files:**
- Delete: 7 individual page files

- [ ] **Step 1: Delete all individual migrate page files**

```bash
rm "app/[locale]/migrate/honeydue/page.tsx" \
   "app/[locale]/migrate/spendee/page.tsx" \
   "app/[locale]/migrate/cwmoney/page.tsx" \
   "app/[locale]/migrate/moneybook/page.tsx" \
   "app/[locale]/migrate/andromoney/page.tsx" \
   "app/[locale]/migrate/mobills/page.tsx" \
   "app/[locale]/migrate/manebo/page.tsx"
```

- [ ] **Step 2: Remove now-empty directories**

```bash
rmdir "app/[locale]/migrate/honeydue" \
      "app/[locale]/migrate/spendee" \
      "app/[locale]/migrate/cwmoney" \
      "app/[locale]/migrate/moneybook" \
      "app/[locale]/migrate/andromoney" \
      "app/[locale]/migrate/mobills" \
      "app/[locale]/migrate/manebo"
```

- [ ] **Step 3: Run `tsc --noEmit` — still clean**

```bash
cd /Users/ray-lee/Projects/freedom-project/oikos && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 4: Verify `generateStaticParams` produces correct URL set**

```bash
cd /Users/ray-lee/Projects/freedom-project/oikos && node -e "
const { MIGRATE_SOURCES } = require('./lib/migrate/sources.ts')
const { SUPPORTED_LOCALES } = require('./lib/i18n/locales-meta.ts')
const params = SUPPORTED_LOCALES.flatMap(l => Object.keys(MIGRATE_SOURCES).map(s => ({ locale: l, source: s })))
console.log('Total params:', params.length)
console.log('Expected:', SUPPORTED_LOCALES.length, 'locales ×', Object.keys(MIGRATE_SOURCES).length, 'sources =', SUPPORTED_LOCALES.length * Object.keys(MIGRATE_SOURCES).length)
" 2>&1 || echo "Note: verify via next build output instead"
```

Expected: 4 locales × 7 sources = 28 static pages.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete 7 individual migrate page files — replaced by [source]/page.tsx (#852)"
```

---

## Task 8: Final check and PR

**Files:** none

- [ ] **Step 1: Run full TypeScript check**

```bash
cd /Users/ray-lee/Projects/freedom-project/oikos && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 2: Run `next build` to confirm all 28 static pages render**

```bash
cd /Users/ray-lee/Projects/freedom-project/oikos && npm run build 2>&1 | grep -E "migrate|error|Error" | head -30
```

Expected: lines like:
```
○ /zh-TW/migrate/honeydue
○ /zh-TW/migrate/spendee
...
○ /ja/migrate/manebo
```
28 migrate routes total, 0 errors.

- [ ] **Step 3: Push and open PR**

```bash
git push origin feat/seo-1.3.2
```

Open PR: `feat/seo-1.3.2 → main`, title: `feat: migrate pages CMS architecture (#852)`.

PR body should note:
- 28 static pages still generated (SEO unchanged)
- 7 individual page files deleted
- New source = 1 object in `sources.ts` + locale copy only
- `tsc` enforces locale completeness automatically
