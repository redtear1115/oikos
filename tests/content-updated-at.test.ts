// 內容 hash 護欄（#1005）——防止「改了 migrate source / use-case 內容，卻忘記
// bump contentUpdatedAt」再度發生。app/sitemap.ts 的 lastmod 直接讀
// contentUpdatedAt，漏 bump 等於對 Google 送出錯誤的抓取優先度訊號（見 #1004）。
//
// 做法：對每個 source / case 的「內容欄位」算穩定 hash，存進
// tests/__snapshots__/content-updated-at.snapshot.json 進版控。
// hash 變了但 contentUpdatedAt 沒變 → fail，並指名是哪個 source/case。
//
// 刻意排除 lib/i18n/locales/*.ts：那些檔案很大（4 語 × 全站文案），把它們納入
// hash 會讓這個測試對任何一次 i18n 動作都敏感，訊號雜訊比太差。migrate /
// use-case 頁面的「主要內容」（comparison rows / features）已經直接存在
// sources.ts / cases.ts 裡，這個測試只看這兩個檔案就足以捕捉本次 issue
// 描述的漏更情境。i18n 文案本身的 lastmod 精確度是已知取捨，留給未來如果
// 真的需要再處理。
import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { MIGRATE_SOURCES, type SourceDef } from '@/lib/migrate/sources'
import { USE_CASES } from '@/lib/use-case/cases'

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
          comparisonRows: source.comparison.rows,
          templateDownload: source.templateDownload ?? null,
          screenshotWorkflow: source.screenshotWorkflow ?? false,
        }
        const contentHash = hashContent(contentOnly)
        const expected = snapshot.migrateSources[key]

        expect(
          expected,
          `snapshot 缺少 migrate source "${key}"。請執行 ${UPDATE_CMD} 更新 snapshot。`,
        ).toBeDefined()

        if (contentHash !== expected.contentHash) {
          // 內容變了。此時 contentUpdatedAt 至少要跟 snapshot 記錄的不一樣，
          // 否則代表改了內容卻忘記 bump 日期。
          expect(
            source.contentUpdatedAt,
            `${key} 的內容變了，但 contentUpdatedAt 仍是 ${expected.contentUpdatedAt}。` +
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
        const contentOnly = { features: useCase.features }
        const contentHash = hashContent(contentOnly)
        const expected = snapshot.useCases[key]

        expect(
          expected,
          `snapshot 缺少 use-case "${key}"。請執行 ${UPDATE_CMD} 更新 snapshot。`,
        ).toBeDefined()

        if (contentHash !== expected.contentHash) {
          expect(
            useCase.contentUpdatedAt,
            `${key} 的內容變了，但 contentUpdatedAt 仍是 ${expected.contentUpdatedAt}。` +
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
