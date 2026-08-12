---
last_updated: 2026-08-12
status: shipped
first_shipped_in: v1.3.0
updates:
  - v1.3.2 — CMS/data-driven refactor (sources.ts + [source]/page.tsx); Taiwan pages + screenshot→ChatGPT→CSV (#839 #852)
  - v1.5.4 — /migrate hub/index page; landing + footer cross-links to lift per-source pages out of "discovered, not indexed" (#939)
related_issues:
  - https://github.com/redtear1115/oikos/issues/852
  - https://github.com/redtear1115/oikos/issues/839
  - https://github.com/redtear1115/oikos/issues/939
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

Central source of truth for language-agnostic competitor facts（每個 source 的 slug / 品牌名 / comparison rows / optional 特殊區塊如 cwmoney 的 Excel template download）。實作見 [lib/migrate/sources.ts](../../../lib/migrate/sources.ts)。

**Comparison table labels** are written directly in Chinese in `sources.ts` and are not translated. This is intentional — the migrate pages' primary audience is Taiwanese, and the labels are mostly symbol-based (✓/△/✕) with short phrases that don't meaningfully differ across languages.

**Special sections**（例如 cwmoney 的 Excel template download）表達成 `SourceDef` 上的 optional 欄位，而不是頁面 template 裡的 per-source if-branch。Template 檢查欄位是否存在，不檢查 source 是誰——這樣新增一個「有特殊區塊」的 source 不需要改 template 的分支邏輯。

### Layer 2: Locale Files

**Removed from locale files:**
- `migrate.pages.[source].comparison` — moved to `sources.ts`
- `migrate.sources.[source]` display names — derived from `MIGRATE_SOURCES[slug].name`

**Remains in locale files（仍然翻譯）：** hero copy、differentiators、steps、FAQ 等情感文案（`MigrateBasePageCopy` type），實作見 [lib/i18n/locales/zh-TW.ts](../../../lib/i18n/locales/zh-TW.ts)。

**Type safety：** `migrate.pages` 的型別是 `Record<MigrateSlug, MigrateBasePageCopy>`，`MigrateSlug` 衍生自 `MIGRATE_SOURCES` 的 key。新增一個 slug 到 `MIGRATE_SOURCES` 會自動讓 `MigrateSlug` 擴張，導致四個 locale 檔在補上翻譯前 TypeScript 報錯——不需要手動更新 union type，型別系統自己會逼你補齊翻譯。

### Layer 3: Dynamic Route

**Replaces** all individual `app/[locale]/migrate/[source]/page.tsx` files with a single dynamic route，用 `generateStaticParams()` 在 build time 產生完整靜態 HTML（對 Google 而言與個別頁面檔案無異，沒有 SEO 影響）。

**Special section rendering** 一樣走 optional 欄位存在與否判斷，不判斷 source identity。`MigrateComparison` 元件直接吃 `def.comparison.rows`；`otherLabel` 來自 `def.name`；locale 裡的 `comparisonHeading` 樣板字串（`'Futari vs {other}'`）用 `def.name` 代入 `{other}`。

實作見 `app/[locale]/migrate/[source]/page.tsx`。

---

## Extension to `/use-case/*`

The same pattern applies to the persona landing pages (#851). A `lib/use-case/personas.ts` file would define `PersonaDef` objects, and `app/[locale]/use-case/[persona]/page.tsx` would be the single dynamic route. Design for that is out of scope here but the architecture is intentionally compatible.

---

## Hub / index page — `/migrate` (v1.5.4, #939)

### Why

Google Search Console reported the per-source pages as "Discovered – currently not indexed". One contributing factor was a shallow internal link graph: only 3 sources (honeydue / spendee / cwmoney) were linked from the landing page; the rest were reachable only via cross-links between migrate pages and the `ItemList` JSON-LD — effectively orphaned, far from the homepage. There was no single crawlable page listing every guide.

### What

A static index page at `app/[locale]/migrate/page.tsx` that lists **every** source in `MIGRATE_SOURCES` as a card, so each per-source page sits one click from a crawlable hub.

- **Auto-derived from the registry** — `Object.keys(MIGRATE_SOURCES)`. Pruning or adding a competitor updates the hub (and its `ItemList`) with no edit here. This keeps the hub decoupled from the competitor-pruning work in #940.
- **Inherits the existing `migrate/layout.tsx` shell** (logo / back link / language switcher / background / centred container), so the page renders only hero + grid + trust/footer.
- **Card reuse** — the source card was extracted from `MigrateOtherSources` into a shared `MigrateSourceCard`. The hub shows all sources; `MigrateOtherSources` still filters out the current one. Both use the existing `migrate.otherSources.items` copy, so **no new per-source copy** was needed.
- **New copy** is minimal: `migrate.hub.{heroKicker,heroTitle,heroSubtitle,heading}` + `seo.migrateHub.{title,description,ogDescription}` + a `migrate.migrateSection.seeAll` landing/footer label — all ×4 locales (en/ja flagged for native review).
- **Structured data** — emits a `CollectionPage` wrapping an `ItemList` of every guide, giving the hub an identity distinct from each per-source page.
- **SEO wiring** — `generateMetadata` uses `buildAlternates('/migrate', locale)` for canonical + hreflang; `/migrate` added to `sitemap.ts` (4 locales) and to `robots.ts` `PUBLIC_PATHS` (explicit allow).

### Internal linking

- Landing `MigrateLinksSection` keeps its 3 featured cards and gains a "see all" link to the hub.
- The landing footer's legal-links row (already there for inbound link equity from a high-authority crawlable page) gains a hub link.
- Each per-source page already cross-links the others via `MigrateOtherSources`.
