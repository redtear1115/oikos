/**
 * #1225 — 護欄：殼內離線頁（`server.errorPath`）。
 *
 * 這頁只有在「原生殼 + 沒網路 + 冷啟動」時才會被讀到，所以它壞掉的時候沒有任何
 * 紅燈：web 部署全綠、`cap sync` 成功、Sentry 收不到（那個情境根本沒有 JS 在跑）。
 * 唯一能在 CI 抓到的時機就是這裡，所以檢查的是「三個檔案有沒有對齊」與「產物有沒有
 * 依賴網路」，而不是渲染結果好不好看。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  OFFLINE_PAGE_FILENAME,
  PROD_SERVER_URL,
  WEB_DIR,
  renderOfflinePage,
  resolveServerUrl,
} from '../scripts/build-native-offline-page.ts'
import { SUPPORTED_LOCALES } from '../lib/i18n/locales-meta'
import { zhTW } from '../lib/i18n/locales/zh-TW'
import { zhCN } from '../lib/i18n/locales/zh-CN'
import { en } from '../lib/i18n/locales/en'
import { ja } from '../lib/i18n/locales/ja'

const repoRoot = resolve(__dirname, '..')
const capacitorConfig = readFileSync(resolve(repoRoot, 'capacitor.config.ts'), 'utf8')
const packageJson = JSON.parse(
  readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
) as { scripts: Record<string, string> }

const html = renderOfflinePage(PROD_SERVER_URL)

describe('native offline page — 與 capacitor.config.ts 對齊', () => {
  it('errorPath 指向產生出來的檔名', () => {
    expect(capacitorConfig).toContain(`errorPath: '${OFFLINE_PAGE_FILENAME}'`)
  })

  it('webDir 就是 script 寫入的目錄', () => {
    expect(capacitorConfig).toContain(`webDir: '${WEB_DIR}'`)
  })

  it('重試按鈕的預設目的地與 shell 載入的 prod URL 同一個', () => {
    // 兩邊各自寫死（見 script 檔頭：不跨 Capacitor CLI 的 loader 邊界 import），
    // 所以改了其中一個而忘了另一個，症狀是「重試按鈕把人帶到舊網址」。
    expect(capacitorConfig).toContain(`const PROD_SERVER_URL = '${PROD_SERVER_URL}'`)
  })

  it('cap copy 之前一定會重新產生這個檔', () => {
    // `cap copy` 每次都會砍掉並重建原生的 public/，所以檔案不能只產生一次。
    expect(packageJson.scripts['capacitor:copy:before']).toBeTruthy()
    expect(packageJson.scripts['cap:offline-page']).toContain(
      'scripts/build-native-offline-page.ts',
    )
  })
})

describe('native offline page — 自我包含', () => {
  it('沒有外部樣式表或外部 script', () => {
    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/<script[^>]+\bsrc\s*=/i)
    expect(html).not.toMatch(/@import/i)
  })

  it('唯一的絕對網址就是重試目的地', () => {
    const urls = [...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0])
    expect(new Set(urls)).toEqual(new Set([PROD_SERVER_URL]))
  })

  it('CAP_SERVER_URL override 也會帶進重試目的地（#990 的 dev 殼）', () => {
    expect(resolveServerUrl({ CAP_SERVER_URL: 'http://localhost:3000' })).toBe(
      'http://localhost:3000',
    )
    expect(resolveServerUrl({})).toBe(PROD_SERVER_URL)
    expect(renderOfflinePage('http://localhost:3000')).toContain(
      'href="http://localhost:3000"',
    )
  })
})

describe('native offline page — 四語', () => {
  const dictionaries = {
    'zh-TW': zhTW.nativeOfflinePage,
    'zh-CN': zhCN.nativeOfflinePage,
    en: en.nativeOfflinePage,
    ja: ja.nativeOfflinePage,
  }

  it('支援語系與 app 的 SUPPORTED_LOCALES 一致', () => {
    // 加了第五語卻沒動這個檔，症狀不是缺字，是那個語系的使用者看到**整頁空白**
    // （CSS 只讓對得上 <html lang> 的區塊顯示）。
    expect(Object.keys(dictionaries).sort()).toEqual([...SUPPORTED_LOCALES].sort())
  })

  for (const [locale, copy] of Object.entries(dictionaries)) {
    it(`${locale}：文案有烤進 HTML，且有對應的顯示規則`, () => {
      for (const text of [copy.title, copy.body, copy.retry]) {
        expect(html).toContain(text)
      }
      expect(html).toContain(`data-l="${locale}"`)
      expect(html).toContain(`html[lang="${locale}"] [data-l="${locale}"]`)
      expect(html).toContain(JSON.stringify(copy.documentTitle).slice(1, -1))
    })

    it(`${locale}：文案沒有驚嘆號（品牌文案準則）`, () => {
      for (const text of [copy.title, copy.body, copy.retry]) {
        expect(text).not.toMatch(/[!！]/)
      }
    })
  }
})

describe('native offline page — 依裝置語系挑語言', () => {
  // 頁面上唯一的邏輯。它挑錯的樣子不是報錯，是日文使用者看到中文；它整段沒跑的
  // 樣子是所有人都看到 zh-TW（<html lang> 的靜態預設值）。
  const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)![1]

  function runPicker(languages: readonly string[]): string {
    document.documentElement.lang = 'zh-TW'
    Object.defineProperty(window.navigator, 'languages', {
      value: languages,
      configurable: true,
    })
    Object.defineProperty(window.navigator, 'language', {
      value: languages[0] ?? '',
      configurable: true,
    })
    new Function(inlineScript)()
    return document.documentElement.lang
  }

  it.each([
    [['zh-TW'], 'zh-TW'],
    [['zh-Hant-TW'], 'zh-TW'],
    [['zh-HK'], 'zh-TW'],
    [['zh-Hant'], 'zh-TW'],
    [['zh-CN'], 'zh-CN'],
    [['zh-Hans-CN'], 'zh-CN'],
    [['zh'], 'zh-CN'],
    [['ja-JP'], 'ja'],
    [['en-US'], 'en'],
    // 第一個對不上就往下找，全部對不上就留在預設語系。
    [['ko-KR', 'ja-JP'], 'ja'],
    [['ko-KR'], 'zh-TW'],
    [[], 'zh-TW'],
  ])('%j → %s', (languages, expected) => {
    expect(runPicker(languages)).toBe(expected)
  })

  it('挑中的語系也會換掉 document.title', () => {
    runPicker(['ja-JP'])
    expect(document.title).toBe(ja.nativeOfflinePage.documentTitle)
  })
})
