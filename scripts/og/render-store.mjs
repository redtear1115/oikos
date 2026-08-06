// Render the Play Store feature graphic from store-graphic.html via Puppeteer.
//
// Outputs go to ../../docs/store-assets/graphics/:
//   - play-feature-graphic.png       1024 × 500   · zh-TW (primary listing)
//   - play-feature-graphic-en.png    1024 × 500   · en
//   - play-feature-graphic-ja.png    1024 × 500   · ja
//   - play-feature-graphic-zh-CN.png 1024 × 500   · zh-CN
//
// Play requires exactly 1024×500 with no alpha channel, so every target
// renders at deviceScaleFactor 1 and screenshots with omitBackground false.
//
// Usage:
//   cd scripts/og
//   npm install
//   node render-store.mjs

import puppeteer from 'puppeteer'
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = `file://${resolve(__dirname, 'store-graphic.html')}`
const OUT_DIR = resolve(__dirname, '..', '..', 'docs', 'store-assets', 'graphics')

const W = 1024
const H = 500

/** @type {Array<{name: string, lang: string}>} */
const targets = [
  { name: 'play-feature-graphic.png', lang: 'zh' },
  { name: 'play-feature-graphic-zh-CN.png', lang: 'zh-CN' },
  { name: 'play-feature-graphic-en.png', lang: 'en' },
  { name: 'play-feature-graphic-ja.png', lang: 'ja' },
]

await mkdir(OUT_DIR, { recursive: true })

const browser = await puppeteer.launch({ headless: 'new' })

try {
  for (const t of targets) {
    const page = await browser.newPage()
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
    const url = `${TEMPLATE}?w=${W}&h=${H}&s=1&lang=${encodeURIComponent(t.lang)}`
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
    // Wait for webfonts — without this Fraunces silently falls back to Georgia.
    await page.waitForFunction(() => window.__OG_READY__ === true, {
      timeout: 15000,
    })
    const buf = await page.screenshot({
      type: 'png',
      omitBackground: false,
      clip: { x: 0, y: 0, width: W, height: H },
    })
    const outPath = resolve(OUT_DIR, t.name)
    await writeFile(outPath, buf)
    console.log(`✓ ${t.name} → ${outPath}  (${W}×${H} px)`)
    await page.close()
  }
} finally {
  await browser.close()
}
