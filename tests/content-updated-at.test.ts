// 內容 hash 護欄（#1005）——防止「改了 migrate source / use-case 內容，卻忘記
// bump contentUpdatedAt」再度發生。app/sitemap.ts 的 lastmod 直接讀
// contentUpdatedAt，漏 bump 等於對 Google 送出錯誤的抓取優先度訊號（見 #1004）。
//
// 做法：對每個 source / case 的「內容欄位」算穩定 hash，存進
// tests/__snapshots__/content-updated-at.snapshot.json 進版控。
// hash 變了但 contentUpdatedAt 沒變 → fail，並指名是哪個 source/case。
//
// 涵蓋範圍：sources.ts / cases.ts 的內容欄位（comparison rows / features），
// 加上 4 個 locale 檔裡 per-slug 的 i18n 子樹——migrate.pages.<slug> 與
// useCase.pages.<slug>，也就是 hero / intro / differentiators / faq 等頁面
// 實際文案所在。刻意不納入整個 locale 檔或整個 migrate / useCase 物件：那樣
// 會讓任何一次 i18n 動作（哪怕跟這些頁面無關）都觸發，訊號雜訊比太差，是前一
// 版刻意避開的取捨；只看每個 slug 自己的子樹才精準對應「這個頁面的內容變了」。
import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { MIGRATE_SOURCES, resolveComparisonRows, type SourceDef } from '@/lib/migrate/sources'
import { USE_CASES } from '@/lib/use-case/cases'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { en } from '@/lib/i18n/locales/en'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { ja } from '@/lib/i18n/locales/ja'

const LOCALES = { zhTW, en, zhCN, ja } as const

/** 取出 4 個 locale 裡 migrate.pages.<slug> 子樹，依 locale key 排序組成一個
 *  物件，作為該 slug 的 i18n 內容。缺某個 locale 的 slug 時該欄位是
 *  undefined，一樣會被納入 hash（等同「內容從有變沒有」）。 */
function collectMigrateI18n(slug: string) {
  const result: Record<string, unknown> = {}
  for (const [localeKey, locale] of Object.entries(LOCALES)) {
    result[localeKey] = (locale.migrate.pages as Record<string, unknown>)[slug]
  }
  return result
}

/** 比較表的 cell 有一部分是 `{ i18n }` 參照（#1185），真正的字串在 4 個 locale
 *  的 migrate.comparisonText。hash 解析後的 per-locale 表格，這樣改譯文也會
 *  觸發護欄——只 hash sources.ts 裡的 key 參照會漏掉這種變更。 */
function collectComparisonRows(rows: SourceDef['comparison']['rows']) {
  const result: Record<string, unknown> = {}
  for (const [localeKey, locale] of Object.entries(LOCALES)) {
    result[localeKey] = resolveComparisonRows(rows, locale.migrate.comparisonText)
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

const SNAPSHOT_PATH = resolve(
  __dirname,
  '__snapshots__/content-updated-at.snapshot.json',
)

/** JSON.stringify with sorted object keys, so key reordering in sources.ts
 *  never produces a false-positive hash change. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function hashContent(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

type Snapshot = {
  migrateSources: Record<string, { contentHash: string; contentUpdatedAt: string }>
  useCases: Record<string, { contentHash: string; contentUpdatedAt: string }>
}

function readSnapshot(): Snapshot {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as Snapshot
}

const UPDATE_CMD = 'npx tsx scripts/update-content-updated-at-snapshot.ts'

describe('contentUpdatedAt 護欄 (#1005)', () => {
  const snapshot = readSnapshot()

  describe('lib/migrate/sources.ts', () => {
    for (const [key, source] of Object.entries(MIGRATE_SOURCES) as [
      string,
      SourceDef,
    ][]) {
      it(`${key} 的內容 hash 與 snapshot 一致`, () => {
        // 只 hash「內容」欄位，刻意排除 contentUpdatedAt 本身——否則 hash 會
        // 自我滿足（bump 日期本身就會讓 hash 對不上，測不出真正的漏更）。
        const contentOnly = {
          name: source.name,
          comparisonRows: collectComparisonRows(source.comparison.rows),
          templateDownload: source.templateDownload ?? null,
          screenshotWorkflow: source.screenshotWorkflow ?? false,
          i18n: collectMigrateI18n(key),
        }
        const contentHash = hashContent(contentOnly)
        const expected = snapshot.migrateSources[key]

        expect(
          expected,
          `snapshot 缺少 migrate source "${key}"。請執行 ${UPDATE_CMD} 更新 snapshot。`,
        ).toBeDefined()

        if (contentHash !== expected.contentHash) {
          // 內容變了（comparison 欄位或 i18n 文案）。此時 contentUpdatedAt
          // 至少要跟 snapshot 記錄的不一樣，否則代表改了內容卻忘記 bump 日期。
          expect(
            source.contentUpdatedAt,
            `${key} 的內容變了（comparison 欄位或 i18n 文案），但 contentUpdatedAt 仍是 ${expected.contentUpdatedAt}。` +
              `請更新該欄位，並重跑 \`${UPDATE_CMD}\`。`,
          ).not.toBe(expected.contentUpdatedAt)
        }
      })
    }

    it('snapshot 不含已刪除的 source', () => {
      const currentKeys = new Set(Object.keys(MIGRATE_SOURCES))
      for (const key of Object.keys(snapshot.migrateSources)) {
        expect(
          currentKeys.has(key),
          `snapshot 仍記錄已不存在的 migrate source "${key}"。請重跑 ${UPDATE_CMD} 更新 snapshot。`,
        ).toBe(true)
      }
    })
  })

  describe('lib/use-case/cases.ts', () => {
    for (const [key, useCase] of Object.entries(USE_CASES)) {
      it(`${key} 的內容 hash 與 snapshot 一致`, () => {
        const contentOnly = {
          features: useCase.features,
          i18n: collectUseCaseI18n(key),
        }
        const contentHash = hashContent(contentOnly)
        const expected = snapshot.useCases[key]

        expect(
          expected,
          `snapshot 缺少 use-case "${key}"。請執行 ${UPDATE_CMD} 更新 snapshot。`,
        ).toBeDefined()

        if (contentHash !== expected.contentHash) {
          expect(
            useCase.contentUpdatedAt,
            `${key} 的內容變了（features 欄位或 i18n 文案），但 contentUpdatedAt 仍是 ${expected.contentUpdatedAt}。` +
              `請更新該欄位，並重跑 \`${UPDATE_CMD}\`。`,
          ).not.toBe(expected.contentUpdatedAt)
        }
      })
    }

    it('snapshot 不含已刪除的 use-case', () => {
      const currentKeys = new Set(Object.keys(USE_CASES))
      for (const key of Object.keys(snapshot.useCases)) {
        expect(
          currentKeys.has(key),
          `snapshot 仍記錄已不存在的 use-case "${key}"。請重跑 ${UPDATE_CMD} 更新 snapshot。`,
        ).toBe(true)
      }
    })
  })
})
