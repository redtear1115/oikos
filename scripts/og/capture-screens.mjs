// 擷取商店螢幕截圖 —— 從本機 dev server 的實際畫面截，輸出到
// ../../docs/store-assets/screenshots/。
//
// 為什麼要獨立 profile：puppeteer 預設開全新瀏覽器，沒有登入狀態；
// 而本 app 只支援 Google / Apple OAuth，無法用程式取得 session。
// 所以用一個專用的 userDataDir，人工登入一次後重複使用。
//
//   cd scripts/og
//   node capture-screens.mjs --login       # 首次：開視窗，你手動登入
//   node capture-screens.mjs               # 之後：headless 截全部尺寸
//   node capture-screens.mjs --only=ipad-13  # 只補某一組，不動已驗過的圖
//
// 各組尺寸不能共用：
//   App Store 6.7" 必須正好 1290×2796（比例 2.167:1）
//   App Store 13" iPad 必須正好 2064×2752（或 2048×2732）—— 宣告支援 iPad 就是必填
//   Play 手機截圖長邊不得超過短邊 2 倍 —— 2.167 會被退，故另出 1080×1920

import puppeteer from 'puppeteer'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', '..', 'docs', 'store-assets', 'screenshots')
const PROFILE = join(homedir(), '.futari-shots-profile')
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const LOGIN_MODE = process.argv.includes('--login')
// 連上一個已經在跑、而且已經登入的 Chrome（例：superpowers-chrome 的 CDP endpoint），
// 取代 --login 那套專用 profile。deviceScaleFactor 走 CDP 的 Emulation 覆寫，
// 所以輸出像素仍然精確，不受實體螢幕 DPI 影響。
//   node capture-screens.mjs --connect=http://127.0.0.1:9222
const CONNECT = (process.argv.find((a) => a.startsWith('--connect=')) || '').replace('--connect=', '')

// --connect 拿掉了「這一定是專用 profile」這個保證：連到哪個瀏覽器，就截到那個
// 瀏覽器當下登入的帳本。指到日常 Chrome 就會把真實帳本渲染進公開 repo 與商店頁。
// 失效的樣子不是報錯，是截圖看起來完全正常、只是內容是別人的生活。
// 這個檢查要的是「示範帳本的樣子」：頭像是首字圓圈（沒有 <img>），不是真人照片。
async function assertDemoLedger(page) {
  const real = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img[src]'))
    return imgs.filter((i) => /googleusercontent|gravatar|\/avatars?\//.test(i.src)).length
  })
  if (real > 0) {
    throw new Error(
      `畫面上有 ${real} 張真人頭像 —— 這個瀏覽器登入的不是示範帳本。\n` +
      '把示範帳號的 profile 設成 avatar_hidden（#1328），或改用 --login 的專用 profile。',
    )
  }
}
// 只截某幾組尺寸，例：--only=ipad-13。不給就全部重截。
// 存在的理由：已上架那幾組是用整理過的 dev 帳本截的，重跑會整批覆寫；
// 補一個新尺寸時沒有理由連帶重截已驗過的圖。
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '')
  .replace('--only=', '')
  .split(',')
  .filter(Boolean)

// 敘事順序（見 docs/app-store-listing.md §8）：說故事，不是功能清單。
const SCREENS = [
  { name: '01-dashboard', path: '/dashboard', label: '餘額一覽' },
  { name: '02-records', path: '/records', label: '紀錄與分攤' },
  // 旅行截內頁而非 /trips 清單：清單只有幾行標題然後一大片空白，
  // 多幣別與分攤這些真正的賣點都在內頁。大阪7日有 11 筆支出 + 3 種匯率。
  { name: '03-trip', path: '/trips/0eeb2477-aee5-47d9-bcb2-74699abecb9a', label: '旅行帳本' },
  { name: '04-assets', path: '/assets', label: '愛物' },
]

// 月度回顧（/review/[month]）暫不收進商店截圖：2026-07 的 snapshot 沒有花費
// 紀錄，卡片只會顯示「這個月沒留下花費紀錄」，留言區也是空的。等真的累積了
// 資料再補 —— 商店截圖隨時可換。

// deviceScaleFactor 乘上 viewport 得到實際輸出像素。
const FORMATS = [
  { key: 'ios-6.7', width: 430, height: 932, dsr: 3 },      // → 1290×2796
  { key: 'play', width: 360, height: 640, dsr: 3 },         // → 1080×1920
  // Play 的平板欄位（7 吋 / 10 吋）也要求 16:9 或 9:16，所以輸出像素與手機同為
  // 1080×1920；差別在 CSS viewport 給 720px 寬，版面是用平板寬度算出來的。
  { key: 'tablet', width: 720, height: 1280, dsr: 1.5, tablet: true }, // → 1080×1920
  // App Store 13" iPad：project.pbxproj 的 TARGETED_DEVICE_FAMILY = "1,2" 宣告支援
  // iPad，App Store Connect 就強制要這格。1032×1376pt @2x 正是 13" iPad Pro 的
  // logical size，乘 2 得到 Apple 唯一接受的 2064×2752。
  { key: 'ipad-13', width: 1032, height: 1376, dsr: 2, tablet: true }, // → 2064×2752
]

async function login() {
  // Google 會擋「宣告自己被自動化控制」的瀏覽器（「這個瀏覽器或應用程式可能有安全疑慮」），
  // 即使登入的是使用者自己的帳號。所以改用系統安裝的 Chrome，並拿掉 automation 旗標。
  const browser = await puppeteer.launch({
    headless: false,
    channel: 'chrome',
    userDataDir: PROFILE,
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--window-size=480,900',
      '--disable-blink-features=AutomationControlled',
    ],
  })
  const [page] = await browser.pages()
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })

  console.log('\n瀏覽器已開啟。請在視窗裡用 Google 帳號登入。')
  console.log('登入完成、看到 dashboard 之後，這支程式會自己往下走（最多等 5 分鐘）。\n')

  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    if (page.url().includes('/dashboard')) {
      // 多等一下讓 auth cookie 確實落盤
      await new Promise((r) => setTimeout(r, 3000))
      console.log('✓ 登入成功，profile 已保存：' + PROFILE)
      await browser.close()
      return true
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.error('✗ 等待逾時，沒有偵測到 /dashboard。')
  await browser.close()
  return false
}

async function capture() {
  await mkdir(OUT_DIR, { recursive: true })
  // 與 login() 用同一個 channel —— profile 由 Chrome stable 建立，
  // 換成 puppeteer 自帶的 Chromium 可能因版本不符而讀不到。
  const browser = CONNECT
    ? await puppeteer.connect({ browserURL: CONNECT, defaultViewport: null })
    : await puppeteer.launch({
        headless: 'new',
        channel: 'chrome',
        userDataDir: PROFILE,
      })
  const results = []

  const formats = ONLY.length ? FORMATS.filter((f) => ONLY.includes(f.key)) : FORMATS
  if (!formats.length) {
    throw new Error(
      `--only=${ONLY.join(',')} 沒有對應的 format。可用：${FORMATS.map((f) => f.key).join(', ')}`
    )
  }

  try {
    for (const fmt of formats) {
      for (const screen of SCREENS) {
        const page = await browser.newPage()
        await page.setViewport({
          width: fmt.width,
          height: fmt.height,
          deviceScaleFactor: fmt.dsr,
          // 平板不宣告 isMobile，讓版面走桌機/寬螢幕分支（若 app 有的話）。
          isMobile: !fmt.tablet,
          hasTouch: true,
        })
        const res = await page.goto(`${BASE}${screen.path}`, {
          waitUntil: 'networkidle0',
          timeout: 30000,
        })

        // 沒有這道檢查的話，404 會被當成正常畫面存成一張全黑的圖 —— 實際發生過。
        if (res && res.status() >= 400) {
          throw new Error(`${screen.path} 回應 HTTP ${res.status()}，路由可能錯了`)
        }

        // 被導去登入頁 = profile 沒有有效 session，直接中止比截出一堆
        // 登入頁截圖有用。
        if (/sign-in/.test(page.url())) {
          throw new Error(
            `未登入（${screen.path} 被導向 ${page.url()}）。先跑 node capture-screens.mjs --login`
          )
        }

        // 登入了不等於登入的是示範帳本（--connect 尤其如此，見檔頭）。
        await assertDemoLedger(page)

        // 隱藏捲軸 + Next.js dev overlay 的浮標 + 等動畫與字體收斂。
        // dev indicator 那顆黑色「N」是 dev server 才有的東西，2026-08 那批截圖
        // 沒擋掉，在 *-play.png 裡直接壓住「首頁」tab 圖示。
        await page.addStyleTag({
          content:
            '*::-webkit-scrollbar{display:none!important}' +
            'nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}',
        })
        await page.evaluate(() => document.fonts.ready)
        await new Promise((r) => setTimeout(r, 1200))

        const buf = await page.screenshot({ type: 'png' })
        const file = `${screen.name}-${fmt.key}.png`
        await writeFile(join(OUT_DIR, file), buf)
        const px = `${fmt.width * fmt.dsr}×${fmt.height * fmt.dsr}`
        console.log(`✓ ${file}  (${px})  ${screen.label}`)
        results.push(file)
        await page.close()
      }
    }
  } finally {
    // 連上別人的 Chrome 時只中斷連線，不要把使用者的視窗關掉。
    if (CONNECT) await browser.disconnect()
    else await browser.close()
  }

  console.log(`\n共 ${results.length} 張 → ${OUT_DIR}`)
}

if (LOGIN_MODE) {
  const ok = await login()
  process.exit(ok ? 0 : 1)
} else {
  await capture()
}
