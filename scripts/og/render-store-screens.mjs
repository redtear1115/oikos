// Render the illustration-first store screenshots from store-screens.html.
//
// Each frame is laid out at 430×932 CSS px and rendered at deviceScaleFactor 3
// → 1290×2796, the App Store 6.7" size. Output has no alpha (omitBackground
// false), which both stores require.
//
// Usage:
//   cd scripts/og
//   node render-store-screens.mjs                      # zh, all frames
//   node render-store-screens.mjs --lang=en --out=/tmp/x
//   node render-store-screens.mjs --frames=1,3
//
// Default output: ../../docs/store-assets/story/<NN>-<lang>-ios-6.7.png

import puppeteer from 'puppeteer'
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = `file://${resolve(__dirname, 'store-screens.html')}`

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const lang = arg('lang', 'zh')
// Store sizes. iPhone 6.7" is 430×932 @3x; the 13" iPad is 1032×1376 @2x —
// the only sizes App Store Connect accepts for APP_IPHONE_67 /
// APP_IPAD_PRO_3GEN_129 (see docs/app-store-submission-runbook.md §I).
const FORMATS = {
  'ios-6.7': { w: 430, h: 932, dsr: 3 },
  'ipad-13': { w: 1032, h: 1376, dsr: 2 },
}
const formatKey = arg('format', 'ios-6.7')
const fmt = FORMATS[formatKey]
if (!fmt) { console.error(`unknown --format=${formatKey}; use ${Object.keys(FORMATS).join(' | ')}`); process.exit(1) }
const frames = arg('frames', '1,2,3,4,5').split(',')
const outDir = resolve(arg('out', resolve(__dirname, '..', '..', 'docs', 'store-assets', 'story')))

await mkdir(outDir, { recursive: true })
const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] })

try {
  for (const frame of frames) {
    const page = await browser.newPage()
    await page.setViewport({ width: fmt.w, height: fmt.h, deviceScaleFactor: fmt.dsr })
    await page.goto(`${TEMPLATE}?frame=${frame}&lang=${encodeURIComponent(lang)}&w=${fmt.w}&h=${fmt.h}`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    })
    // Without this wait the headline silently falls back to a system font.
    await page.waitForFunction(() => window.__OG_READY__ === true, { timeout: 15000 })
    const buf = await page.screenshot({ type: 'png', omitBackground: false })
    const name = `${frame.padStart(2, '0')}-${lang}-${formatKey}.png`
    await writeFile(resolve(outDir, name), buf)
    console.log(`✓ ${name}`)
    await page.close()
  }
} finally {
  await browser.close()
}
