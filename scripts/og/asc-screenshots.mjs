// App Store Connect 截圖上傳（#1334）。
//
// 為什麼要這支：ASC 的截圖上傳是三步（POST 拿 uploadOperations → 依 byte range
// PUT → PATCH 設 uploaded + MD5），在網頁上逐張拖拉很容易漏掉某個語系或某個
// display type，而漏掉的樣子是「送審才被退」。runbook §I 記過一次實況：README
// 寫「截圖已產出」，ASC 上掛的卻還是三個月前用手機拍的圖。
//
// 這支預設 **dry-run**：只讀 ASC、印出打算做什麼，不寫入。加 --apply 才真的上傳。
//
//   node asc-screenshots.mjs                      # 看現況與計畫
//   node asc-screenshots.mjs --apply              # 真的換圖
//   node asc-screenshots.mjs --locale=zh-Hant     # 只處理一個語系
//
// 先決條件：ASC 上要有一個「可編輯」的版本（PREPARE_FOR_SUBMISSION）。
// READY_FOR_SALE 的版本改不動截圖 —— 這是 Apple 的限制，不是這支的問題。

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORY_DIR = path.resolve(__dirname, '..', '..', 'docs', 'store-assets', 'story')
const APP_ID = '6779264784'
const APPLY = process.argv.includes('--apply')
const ONLY_LOCALE = (process.argv.find((a) => a.startsWith('--locale=')) || '').replace('--locale=', '')

// 每個 display type 對應一組檔案。story/ 目前只有 zh-TW 一套，所以其他語系
// 要嘛沿用（混語，不建議），要嘛先準備該語言的示範帳本再產一套。
const SETS = {
  APP_IPHONE_67: { suffix: 'ios-6.7', expect: [1290, 2796] },
  APP_IPAD_PRO_3GEN_129: { suffix: 'ipad-13', expect: [2064, 2752] },
}
const LOCALES = ['zh-Hant']

function env() {
  const raw = fs.readFileSync('/Volumes/Futari Secrets/env/.env', 'utf8')
  return Object.fromEntries(
    raw.split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
}

/** ES256 JWT，不用第三方套件：openssl 簽名後把 DER 的 SEQUENCE{r,s} 轉 raw 64 bytes。 */
function token() {
  const e = env()
  const keyId = e.ASC_KEY_ID
  let keyPath = (e.ASC_KEY_PATH || '').replace('~', process.env.HOME)
  if (!keyPath || !fs.existsSync(keyPath)) {
    keyPath = `${process.env.HOME}/.appstoreconnect/private_keys/AuthKey_${keyId}.p8`
  }
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const input = `${b64({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${b64({ iss: e.ASC_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })}`
  const der = execFileSync('openssl', ['dgst', '-sha256', '-sign', keyPath], { input: Buffer.from(input) })
  let i = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2
  const readInt = () => {
    const len = der[i + 1]
    let v = der.subarray(i + 2, i + 2 + len)
    i += 2 + len
    while (v.length > 32) v = v.subarray(1)
    return Buffer.concat([Buffer.alloc(32 - v.length), v])
  }
  return `${input}.${Buffer.concat([readInt(), readInt()]).toString('base64url')}`
}

const JWT = token()
async function api(pathname, init = {}) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  if (res.status === 204) return null
  const body = await res.text()
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${pathname} → ${res.status}\n${body.slice(0, 500)}`)
  return body ? JSON.parse(body) : null
}

const versions = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=5&fields[appStoreVersions]=versionString,appStoreState`)
const editable = versions.data.find((v) => v.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION')
console.log('版本：', versions.data.map((v) => `${v.attributes.versionString} (${v.attributes.appStoreState})`).join(', '))
if (!editable) {
  console.error('\n沒有 PREPARE_FOR_SUBMISSION 的版本 —— 截圖改不動。')
  console.error('先在 ASC 建一個新版本並附上 build（見 .claude/skills/ship-native），再跑這支。')
  process.exit(1)
}
console.log('要改的版本：', editable.attributes.versionString, editable.id)

const locs = await api(`/v1/appStoreVersions/${editable.id}/appStoreVersionLocalizations?limit=20&fields[appStoreVersionLocalizations]=locale`)
for (const loc of locs.data) {
  const locale = loc.attributes.locale
  if (!LOCALES.includes(locale) || (ONLY_LOCALE && locale !== ONLY_LOCALE)) {
    console.log(`\n${locale}: 跳過（story/ 沒有這個語系的素材）`)
    continue
  }
  for (const [displayType, spec] of Object.entries(SETS)) {
    const files = fs.readdirSync(STORY_DIR)
      .filter((f) => f.endsWith(`-zh-${spec.suffix}.png`))
      .sort()
      .map((f) => path.join(STORY_DIR, f))
    console.log(`\n${locale} / ${displayType}: ${files.length} 張`)
    files.forEach((f) => console.log('   ', path.basename(f)))
    if (!APPLY) continue

    const sets = await api(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=20&fields[appScreenshotSets]=screenshotDisplayType`)
    let set = sets.data.find((s) => s.attributes.screenshotDisplayType === displayType)
    if (!set) {
      set = (await api('/v1/appScreenshotSets', {
        method: 'POST',
        body: JSON.stringify({ data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: displayType }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } }),
      })).data
    }
    // 舊圖先刪，否則新圖只是追加在後面，商店會顯示兩套混在一起。
    const existing = await api(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=20&fields[appScreenshots]=fileName`)
    for (const shot of existing.data) {
      await api(`/v1/appScreenshots/${shot.id}`, { method: 'DELETE' })
      console.log('    刪除舊圖', shot.attributes.fileName)
    }
    for (const file of files) {
      const bytes = fs.readFileSync(file)
      const created = (await api('/v1/appScreenshots', {
        method: 'POST',
        body: JSON.stringify({ data: { type: 'appScreenshots', attributes: { fileName: path.basename(file), fileSize: bytes.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } }),
      })).data
      for (const op of created.attributes.uploadOperations) {
        const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]))
        const part = bytes.subarray(op.offset, op.offset + op.length)
        const res = await fetch(op.url, { method: op.method, headers, body: part })
        if (!res.ok) throw new Error(`上傳失敗 ${path.basename(file)}: ${res.status}`)
      }
      await api(`/v1/appScreenshots/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: { type: 'appScreenshots', id: created.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') } } }),
      })
      console.log('    ✓', path.basename(file))
    }
  }
}
console.log(APPLY ? '\n完成。回 ASC 目視確認順序與裁切，再送審。' : '\n以上是計畫（dry-run）。加 --apply 才會真的動 ASC。')
