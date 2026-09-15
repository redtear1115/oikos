// #1225 — 產生「殼內離線頁」：`out/offline.html`。
//
// 為什麼要有這個檔
// ----------------
// 原生殼是薄殼，`capacitor.config.ts` 的 `server.url` 指向 prod。沒網路時
// WebView 連第一個 byte 都拿不到，任何 web 端程式碼都不會執行——使用者看到的是
// 系統的 WebView 錯誤頁或一片空白。Capacitor 的 `server.errorPath` 是這個情境
// 唯一的掛勾點：主框架載入失敗時，改載入**殼內**的本地 HTML
// （iOS `capacitor://localhost/<errorPath>`、Android `https://localhost/<errorPath>`，
// 兩邊都由 bundled `public/` 目錄供應，也就是 `webDir` 的複本）。
//
// 為什麼不是手工放一個檔案在 out/
// --------------------------------
// `webDir` 是 `out`，而 `/out/` 有進 .gitignore：`server.url` 架構下沒有 web 產物
// 要打包，`out/` 平常根本不存在。就算把它加進版控，`cap copy` 每次都會
// `remove(nativeDir)` 再整包複製 webDir——所以真正的要求不是「檔案存在一次」，
// 而是「每次 copy 之前它都被重新產生」。因此本檔掛在 Capacitor 的
// `capacitor:copy:before` hook（package.json），`npx cap sync` / `npx cap copy`
// 都會先跑它，iOS 與 Android 兩邊都涵蓋。順帶把 `out/` 建出來，所以乾淨
// checkout 不再需要手動 `mkdir -p out`。
//
// 失效的樣子
// ----------
// 不會有任何紅燈。web 部署照樣全綠、`npm run dev` 正常、Vercel preview 正常，
// 連 `cap sync` 都會成功——只是殼裡少了一個檔案，而那個檔案只有在「沒網路 +
// 冷啟動」時才會被讀。使用者看到的是空白畫面，而且不會產生任何錯誤回報
// （Sentry 也收不到，因為根本沒有 JS 在跑）。所以護欄放在
// `__tests__/nativeOfflinePage.test.ts`，不是放在 build log。
//
// 語言怎麼決定
// ------------
// 這頁沒有 React、沒有 i18n runtime，也讀不到使用者在 app 裡選的語言：錯誤頁的
// origin 是 `capacitor://localhost` / `https://localhost`，跟
// `https://futari.southern-light.dev` 是不同 origin，localStorage / cookie 都看
// 不到。唯一能用的訊號是裝置語系（`navigator.language`）。所以四語全部烤進同一份
// HTML，`<html lang>` 決定顯示哪一份，head 裡的 inline script 在 body 解析前就把
// lang 換掉——不會有先閃一下中文再變日文的狀況。文案來源仍是
// `lib/i18n/locales/*.ts`，四語同步因此由 `tsc` 的 Translations interface 把關。
//
// 需要 Node ≥ 22.18（原生 TypeScript type stripping）才能直接執行 .ts。
// `.nvmrc` 是 24，CI 用同一份，所以這裡不額外裝 loader。

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zhTW } from '../lib/i18n/locales/zh-TW.ts'
import { zhCN } from '../lib/i18n/locales/zh-CN.ts'
import { en } from '../lib/i18n/locales/en.ts'
import { ja } from '../lib/i18n/locales/ja.ts'

/** 必須與 `capacitor.config.ts` 的 `server.errorPath` 一致（測試會比對）。 */
export const OFFLINE_PAGE_FILENAME = 'offline.html'

/** webDir。必須與 `capacitor.config.ts` 的 `webDir` 一致（測試會比對）。 */
export const WEB_DIR = 'out'

/** 必須與 `capacitor.config.ts` 的 `PROD_SERVER_URL` 一致（測試會比對）。
 *  沒辦法直接 import：capacitor.config.ts 由 Capacitor CLI 自己的 loader 載入，
 *  多一條 import 邊就多一個在 `cap sync` 當下才炸的方式。 */
export const PROD_SERVER_URL = 'https://futari.southern-light.dev'

/** 與 capacitor.config.ts 同一條 dev override（#990）：`CAP_SERVER_URL` 有值就
 *  用它，讓指到 localhost / Vercel preview 的殼，重試按鈕也回到同一個地方。 */
export function resolveServerUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return env.CAP_SERVER_URL?.trim() || PROD_SERVER_URL
}

const COPY = {
  'zh-TW': zhTW.nativeOfflinePage,
  'zh-CN': zhCN.nativeOfflinePage,
  en: en.nativeOfflinePage,
  ja: ja.nativeOfflinePage,
} as const

type OfflineLocale = keyof typeof COPY

/** 靜態預設語系：無法從 navigator.language 對到任何一語時的落點，也是 inline
 *  script 還沒跑（或被擋掉）時 `<html lang>` 的初始值。與 DEFAULT_LOCALE 一致。 */
const FALLBACK_LOCALE: OfflineLocale = 'zh-TW'

const LOCALE_ORDER: readonly OfflineLocale[] = ['zh-TW', 'zh-CN', 'en', 'ja']

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** JSON.stringify 已經處理引號與反斜線；`<` 也要跑掉，否則字串裡若出現 `</script`
 *  會提前關掉 inline script tag。 */
function toJsLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/** 每一語一份節點，靠 `<html lang>` + CSS 決定哪一份可見。四份都在 DOM 裡是
 *  刻意的：切換語言不需要 JS 寫入文字，所以不會有閃動。 */
function localizedBlock(tag: 'h1' | 'p' | 'span', key: 'title' | 'body' | 'retry'): string {
  return LOCALE_ORDER.map(
    (locale) =>
      `<${tag} lang="${locale}" data-l="${locale}">${escapeHtml(COPY[locale][key])}</${tag}>`,
  ).join('\n        ')
}

export function renderOfflinePage(serverUrl: string): string {
  const titles = Object.fromEntries(
    LOCALE_ORDER.map((locale) => [locale, COPY[locale].documentTitle]),
  )

  return `<!DOCTYPE html>
<!--
  自動產生，請勿手動編輯 — 來源：scripts/build-native-offline-page.ts（#1225）
  文案來源：lib/i18n/locales/*.ts › nativeOfflinePage
-->
<html lang="${FALLBACK_LOCALE}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="robots" content="noindex">
<title>${escapeHtml(COPY[FALLBACK_LOCALE].documentTitle)}</title>
<script>
// 在 body 解析之前決定語系，所以不會先閃一下預設語言。
(function () {
  var TITLES = ${toJsLiteral(titles)};
  function pick(tag) {
    var t = String(tag || '').toLowerCase();
    if (!t) return null;
    // 繁體圈（zh-TW / zh-Hant* / zh-HK / zh-MO）走 zh-TW，其餘 zh* 走 zh-CN。
    if (t.indexOf('zh') === 0) {
      return (t.indexOf('hant') >= 0 || t.indexOf('tw') >= 0 || t.indexOf('hk') >= 0 || t.indexOf('mo') >= 0)
        ? 'zh-TW'
        : 'zh-CN';
    }
    if (t.indexOf('ja') === 0) return 'ja';
    if (t.indexOf('en') === 0) return 'en';
    return null;
  }
  var tags = [];
  try {
    tags = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || [];
  } catch (e) {
    tags = [];
  }
  var locale = null;
  for (var i = 0; i < tags.length && !locale; i++) locale = pick(tags[i]);
  if (!locale) return; // 留在 <html lang> 的預設值
  document.documentElement.lang = locale;
  if (TITLES[locale]) document.title = TITLES[locale];
})();
</script>
<style>
  /* 色票取自 app/globals.css（--bg / --ink / --ink-2 / --surface / --hairline /
     --btn-primary-*）。這頁在 Tailwind 與 CSS 變數之外，值只能寫死；改色票時
     連這裡一起改。字體同理：Fraunces / Noto Sans TC 是網路字體，離線時拿不到，
     所以只用系統字。 */
  :root {
    --bg: #FBEDE0;
    --surface: #FFFFFF;
    --ink: #3A2419;
    --ink-2: #7A5848;
    --hairline: rgba(58, 36, 25, 0.10);
    --on-fill: #FFFFFF;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding:
      calc(env(safe-area-inset-top, 0px) + 24px)
      calc(env(safe-area-inset-right, 0px) + 24px)
      calc(env(safe-area-inset-bottom, 0px) + 24px)
      calc(env(safe-area-inset-left, 0px) + 24px);
    background: var(--bg);
    color: var(--ink);
    font-family: 'PingFang TC', 'PingFang SC', 'Hiragino Sans', 'Noto Sans CJK TC',
      'Microsoft JhengHei', system-ui, -apple-system, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  main {
    width: 100%;
    max-width: 320px;
    text-align: center;
  }
  .lamp {
    display: block;
    margin: 0 auto 20px;
    width: 56px;
    height: 56px;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 22px;
    font-weight: 500;
    line-height: 1.3;
  }
  p {
    margin: 0 0 32px;
    font-size: 16px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--ink-2);
  }
  .retry {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 20px;
    border-radius: 14px;
    background: var(--ink);
    color: var(--on-fill);
    font-size: 16px;
    font-weight: 500;
    line-height: 1;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }
  .retry:active { opacity: 0.88; }
  /* 語系切換：只有 <html lang> 對得上的那一份可見。四語都寫死在規則裡，
     沒有 :not() 或屬性前綴比對，避免任何一語漏掉時整頁變空白。 */
  [data-l] { display: none; }
  html[lang="zh-TW"] [data-l="zh-TW"],
  html[lang="zh-CN"] [data-l="zh-CN"],
  html[lang="en"] [data-l="en"],
  html[lang="ja"] [data-l="ja"] { display: revert; }
</style>
</head>
<body>
  <main>
    <!-- The Warm Lamp。純 inline SVG：離線頁拿不到任何外部資源，連 favicon 都不行。 -->
    <svg class="lamp" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M19 9 H29 L36 25 H12 Z" fill="#F8D9C2" stroke="#E08856" stroke-width="2" stroke-linejoin="round"/>
      <path d="M24 25 V33" stroke="#7A5848" stroke-width="2" stroke-linecap="round"/>
      <path d="M16 40 H32" stroke="#7A5848" stroke-width="2" stroke-linecap="round"/>
      <path d="M24 33 L18 40 M24 33 L30 40" stroke="#7A5848" stroke-width="2" stroke-linecap="round"/>
    </svg>
    ${localizedBlock('h1', 'title')}
    ${localizedBlock('p', 'body')}
    <a class="retry" href="${escapeHtml(serverUrl)}">
      ${localizedBlock('span', 'retry')}
    </a>
  </main>
</body>
</html>
`
}

function main(): void {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const outDir = join(repoRoot, WEB_DIR)
  const outFile = join(outDir, OFFLINE_PAGE_FILENAME)

  mkdirSync(outDir, { recursive: true })
  writeFileSync(outFile, renderOfflinePage(resolveServerUrl()), 'utf8')

  console.log(`[native-offline-page] wrote ${WEB_DIR}/${OFFLINE_PAGE_FILENAME}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
