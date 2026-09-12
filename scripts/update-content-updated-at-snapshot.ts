// 更新 tests/content-updated-at.test.ts 用的內容 hash snapshot（#1005）。
//
// 用法：改完 lib/migrate/sources.ts / lib/use-case/cases.ts 的內容欄位，或
// 4 個 locale 檔裡對應 slug 的 migrate.pages.<slug> / useCase.pages.<slug>
// 文案、也 bump 了 contentUpdatedAt 之後，跑：
//
//   npx tsx scripts/update-content-updated-at-snapshot.ts
//
// 這個 hash 刻意不含 contentUpdatedAt 本身——它只描述「內容」，讓測試能
// 判斷「內容變了，但日期沒動」這個漏更情境。
import { createHash } from 'crypto'
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import { MIGRATE_SOURCES, type SourceDef } from '../lib/migrate/sources'
import { USE_CASES } from '../lib/use-case/cases'
import { zhTW } from '../lib/i18n/locales/zh-TW'
import { en } from '../lib/i18n/locales/en'
import { zhCN } from '../lib/i18n/locales/zh-CN'
import { ja } from '../lib/i18n/locales/ja'

const LOCALES = { zhTW, en, zhCN, ja } as const

function collectMigrateI18n(slug: string) {
  const result: Record<string, unknown> = {}
  for (const [localeKey, locale] of Object.entries(LOCALES)) {
    result[localeKey] = (locale.migrate.pages as Record<string, unknown>)[slug]
  }
  return result
}

function collectUseCaseI18n(slug: string) {
  const result: Record<string, unknown> = {}
  for (const [localeKey, locale] of Object.entries(LOCALES)) {
    result[localeKey] = (locale.useCase.pages as Record<string, unknown>)[slug]
  }
  return result
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    return `{${keys
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify(
            (value as Record<string, unknown>)[k],
          )}`,
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function hashContent(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

const migrateSources: Record<
  string,
  { contentHash: string; contentUpdatedAt: string }
> = {}
for (const [key, source] of Object.entries(MIGRATE_SOURCES) as [
  string,
  SourceDef,
][]) {
  const contentOnly = {
    name: source.name,
    comparisonRows: source.comparison.rows,
    templateDownload: source.templateDownload ?? null,
    screenshotWorkflow: source.screenshotWorkflow ?? false,
    i18n: collectMigrateI18n(key),
  }
  migrateSources[key] = {
    contentHash: hashContent(contentOnly),
    contentUpdatedAt: source.contentUpdatedAt,
  }
}

const useCases: Record<
  string,
  { contentHash: string; contentUpdatedAt: string }
> = {}
for (const [key, useCase] of Object.entries(USE_CASES)) {
  const contentOnly = {
    features: useCase.features,
    i18n: collectUseCaseI18n(key),
  }
  useCases[key] = {
    contentHash: hashContent(contentOnly),
    contentUpdatedAt: useCase.contentUpdatedAt,
  }
}

const outPath = resolve(
  __dirname,
  '../tests/__snapshots__/content-updated-at.snapshot.json',
)
writeFileSync(
  outPath,
  JSON.stringify({ migrateSources, useCases }, null, 2) + '\n',
)
console.log(`已更新 ${outPath}`)
