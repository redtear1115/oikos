---
last_updated: 2026-08-06
---

# Store assets — Futari

上架用的圖形素材。文案在 [app-store-listing.md](../app-store-listing.md)，
操作流程在 [app-store-submission-runbook.md](../app-store-submission-runbook.md)，
追蹤 issue [#935](https://github.com/redtear1115/oikos/issues/935)。

## 現況

| 檔案 | 規格 | 用途 | 狀態 |
|---|---|---|---|
| `icons/play-icon-512.png` | 512×512、無 alpha | Play Console 應用程式圖示（必填） | ✅ |
| `graphics/play-feature-graphic.png` | 1024×500、無 alpha | Play Feature graphic（必填）— zh-TW | ✅ |
| `graphics/play-feature-graphic-zh-CN.png` | 同上 | zh-CN 商店本地化 | ✅ |
| `graphics/play-feature-graphic-en.png` | 同上 | en 商店本地化 | ✅ |
| `graphics/play-feature-graphic-ja.png` | 同上 | ja 商店本地化 | ✅ |
| `screenshots/` | Play 手機 ≥2 張；App Store 6.7"（1290×2796） | 兩商店必填 | ⬜ 未產出 |

## 怎麼重新產生

### Feature graphic（四語）

```bash
cd scripts/og
npm install          # 首次；puppeteer 會用 ~/.cache/puppeteer 既有的 Chromium
node render-store.mjs
```

版型在 `scripts/og/store-graphic.html`，與 OG 圖共用同一組 mark SVG 與品牌色，
但**不共用 render 腳本**——OG 圖輸出到 `public/`，商店素材輸出到本資料夾。
改文案改 `store-graphic.html` 裡的 `copy` 物件（四語同步，見 CLAUDE.md i18n 規則）。

版面刻意留白：Play 在部分版位會裁掉外緣、並可能在正中疊播放鍵，
所以主要內容都靠左、圖形靠右，中央與四邊不放承重元素。

### Play icon 512×512

從 iOS 的 1024 母檔縮：

```bash
sips -Z 512 ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png \
  --out docs/store-assets/icons/play-icon-512.png
```

母檔本身就是滿版奶油底（四角 `#FCE5C9`，非透明），縮完直接符合 Play 規格——
Play 會自行套圓角遮罩，不需要我們先裁圓角。

### 截圖

尚未產出。需要一個已登入且有資料的 session；規劃見 runbook §A-6 / §B-4，
建議畫面順序（說故事而非功能清單）見 [app-store-listing.md §8](../app-store-listing.md)。
