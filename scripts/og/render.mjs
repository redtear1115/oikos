// Render the Futari OG images from template.html via Puppeteer.
//
// Outputs go to ../../public/ (i.e. oikos/public/):
//   - og-image.png      1200 × 630   · default OG (zh-TW / zh-CN)
//   - og-image-en.png   1200 × 630   · English OG
//   - og-image-ja.png   1200 × 630   · Japanese OG
//   - og-line.png       1200 × 600   · LINE share image
//   - og-square.png     1200 × 1200  · IG / Threads square
//
// Usage:
//   cd scripts/og
//   npm install
//   node render.mjs
//
// Requires Node 18+ (for top-level await + fs/promises) and downloads its
// own Chromium via Puppeteer on `npm install`.

import puppeteer from 'puppeteer'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = `file://${resolve(__dirname, 'template.html')}`
const OUT_DIR = resolve(__dirname, '..', '..', 'public')

/** @type {Array<{name: string, w: number, h: number, layout: 'wide'|'square', lang: string, dsr: number}>} */
const targets = [
  { name: 'og-image.png',    w: 1200, h: 630,  layout: 'wide',   lang: 'zh', dsr: 1 },
  { name: 'og-image-en.png', w: 1200, h: 630,  layout: 'wide',   lang: 'en', dsr: 1 },
  { name: 'og-image-ja.png', w: 1200, h: 630,  layout: 'wide',   lang: 'ja', dsr: 1 },
  { name: 'og-line.png',     w: 1200, h: 600,  layout: 'wide',   lang: 'zh', dsr: 1 },
  { name: 'og-square.png',   w: 1200, h: 1200, layout: 'square', lang: 'zh', dsr: 1 },
]

const browser = await puppeteer.launch({ headless: 'new' })

try {
  for (const t of targets) {
    const page = await browser.newPage()
    await page.setViewport({ width: t.w, height: t.h, deviceScaleFactor: t.dsr })
    const url = `${TEMPLATE}?w=${t.w}&h=${t.h}&s=1&layout=${t.layout}&lang=${t.lang}`
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
    // Wait for fonts to finish loading — the template sets __OG_READY__ on
    // document.fonts.ready. Without this, Fraunces falls back to Times.
    await page.waitForFunction(() => window.__OG_READY__ === true, {
      timeout: 15000,
    })
    const buf = await page.screenshot({
      type: 'png',
      omitBackground: false,
      clip: { x: 0, y: 0, width: t.w, height: t.h },
    })
    const outPath = resolve(OUT_DIR, t.name)
    await writeFile(outPath, buf)
    console.log(`✓ ${t.name} → ${outPath}  (${t.w * t.dsr}×${t.h * t.dsr} px)`)
    await page.close()
  }
} finally {
  await browser.close()
}
