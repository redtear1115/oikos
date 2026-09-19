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
const frames = arg('frames', '1,2,3,4,5').split(',')
const outDir = resolve(arg('out', resolve(__dirname, '..', '..', 'docs', 'store-assets', 'story')))

await mkdir(outDir, { recursive: true })
const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] })

try {
  for (const frame of frames) {
    const page = await browser.newPage()
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 3 })
    await page.goto(`${TEMPLATE}?frame=${frame}&lang=${encodeURIComponent(lang)}`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    })
    // Without this wait the headline silently falls back to a system font.
    await page.waitForFunction(() => window.__OG_READY__ === true, { timeout: 15000 })
    const buf = await page.screenshot({ type: 'png', omitBackground: false })
    const name = `${frame.padStart(2, '0')}-${lang}-ios-6.7.png`
    await writeFile(resolve(outDir, name), buf)
    console.log(`✓ ${name}`)
    await page.close()
  }
} finally {
  await browser.close()
}
