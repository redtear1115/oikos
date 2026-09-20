---
last_updated: 2026-09-20
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
| `screenshots/*-ios-6.7.png` | 1290×2796、無 alpha | App Store 6.7"（必填），4 張 | ✅ |
| `screenshots/*-play.png` | 1080×1920、無 alpha | Play 手機截圖（必填 ≥2），4 張 | ✅ |
| `screenshots/*-tablet.png` | 1080×1920、無 alpha | Play 平板截圖（7 吋 / 10 吋），4 張 | ✅ |
| `screenshots/*-ipad-13.png` | 2064×2752、無 alpha | App Store 13" iPad（必填），4 張 | ✅ |
| `story/0N-zh-ios-6.7.png` | 1290×2796、無 alpha | **插畫故事圖**（zh-TW），5 張 | ✅ 待上傳 |
| `story/0N-zh-ipad-13.png` | 2064×2752、無 alpha | 同上，13" iPad | ✅ 待上傳 |

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

```bash
cd scripts/og
node capture-screens.mjs --login          # 首次：開視窗，人工登入一次
node capture-screens.mjs                  # headless 截全部尺寸
node capture-screens.mjs --only=ipad-13   # 只補某一組
```

⚠️ 不加 `--only` 會**覆寫全部** 16 張。已上架的那幾組是 2026-08-07 用當時整理過的
dev 帳本截的，且 `SCREENS` 裡的 trip UUID 是寫死的 —— 資料漂移後重跑不保證截得一樣。
補新尺寸時請用 `--only`。

> **repo 與商店是兩個狀態，別把前者當後者。**
> repo 裡的 16 張已於 2026-09-20 全部重截：沒有 dev overlay 的「N」浮標、頭像是首字圓圈、
> 名稱是示範名（見下方「截圖前的帳本準備」）。
>
> **但已上傳到 Play 的那批還是 2026-08 的舊圖**——左下角有「N」浮標，而且帶著真人頭像與真實姓名。
> 換掉它需要到 Play Console 重新上傳，這件事還沒做。App Store 那批同樣是舊圖，換圖要先有一個
> 可編輯的版本（見下方「上傳到 App Store Connect」）。

四個畫面照敘事順序：餘額一覽 → 紀錄與分攤 → 旅行帳本（內頁）→ 愛物。

**為什麼分這麼多種尺寸**：App Store 6.7" 必須**正好** 1290×2796（Apple 嚴格檢查）。
13" iPad 同樣嚴格，只收 2064×2752 或 2048×2732 —— 只要 `project.pbxproj` 的
`TARGETED_DEVICE_FAMILY` 含 `2`（宣告支援 iPad），這格就是必填，不能只交 iPhone 截圖。
Play 則寫「顯示比例**應為** 16:9 或 9:16」——是建議不是硬性下限：本專案 2026-06-02
上傳的手機截圖是 1080×2400（比例 2.222），Play 照收。所以 Play 這組出 1080×1920
是為了貼合建議值，不是因為 1290×2796 會被退。

> 平板欄位（7 吋 / 10 吋）另有**短邊下限**：10 吋要求每邊 1,080 px 至 7,680 px，
> 所以 1080×1920 剛好壓在下限，不能再小。

#### 換機器時怎麼重建

截圖環境有三個前置，順序不能顛倒：

1. **`.env.local`** —— 必須是**原檔搬過來**，不能重生。裡面的 `ENCRYPTION_KEY`
   要跟 dev DB 裡已加密的 PII 對得上；也不能用 `vercel env pull`，那會拉到 prod 的 key。
2. **dev server 跑起來**（`npm run dev`）—— profile 存的是 `localhost:3000` 的 session，
   沒有 server 就沒有東西可登入。
3. **`~/.futari-shots-profile`** —— **重建，不要搬**。它是完整的 Chrome profile，
   有一部分綁 Keychain 與機器，跨機器複製不保證有效，Google 也可能因為裝置變了而要求重驗。
   在新機器上跑一次 `node capture-screens.mjs --login` 重登比較快也比較可靠。

Node 版本走 repo 根目錄的 `.nvmrc`（Node 24 LTS）。若 `node -v` 不是 24，
檢查 PATH 有沒有被其他工具自帶的 Node 遮掉。

**為什麼要人工登入一次**：本 app 只有 Google / Apple OAuth，沒有 email 密碼表單，
程式拿不到 session。所以用專屬 userDataDir（`~/.futari-shots-profile`）登入一次後重複使用。
Google 會擋「宣告自己被自動化控制」的瀏覽器，故 script 用系統安裝的 Chrome
（`channel: 'chrome'`）並拿掉 `--enable-automation`。

**畫面資料來自 dev（oikos-dev）**，2026-08-07 為了截圖整理過（見下）。
`/review/[month]` 沒有收進來：2026-07 snapshot 無花費紀錄，畫面是空的。

#### 2026-08-07 對 dev 帳本做的整理

截圖用的 group：`3a896cf2-fe3c-4525-b5d6-789ce17e3e4e`。全部可還原：

| 動作 | 細節 | 還原方式 |
|---|---|---|
| 改帳本名 | `測試用帳本` → `我們的帳本` | 改回即可 |
| 補 8 月支出 | 11 筆（含 3 筆掛愛物） | 依 `description` 刪除 |
| soft delete 異常 settlement | 2 筆金額 3,610 萬的測試資料<br>`ae064b80-56ef-404b-aeb2-ecf3faaa74bd`<br>`8b09acf7-d3c9-45e1-ad45-8d85bc969ee7` | `deleted_at = NULL` |
| 跳過過期待確認 | 2 筆「零用錢」定期提案（6/9、7/9） | `skipped_at = NULL` |
| 愛物改名 | `LapoGINI`→`小白`、`Faralliiii`→`阿福`、`巨山蟻`→`麻糬`、<br>`測試單車`→`通勤單車`、`小廢車`×2→`小綿羊`/`舊速可達` | 改回即可 |

> ⚠️ 順帶發現：`GroupBalance` 的 cache 原本是 **0**，但照 `lib/db/queries/balance.ts`
> 的公式重算是 **36,116,560** —— cache 長期未同步。那兩筆三千六百萬的測試 settlement
> 是主因。dev 專屬問題，但值得確認 prod 沒有同樣的 cache 漂移。

## 插畫故事圖（story/）

2026-09-20 起的主打素材：不只是實機畫面，每張上方是一個兩人生活的場景插畫，下方接一段見證式文案與一塊裁過的實機畫面。

```bash
cd scripts/og
node render-store-screens.mjs                      # zh-TW、iPhone 6.7"
node render-store-screens.mjs --format=ipad-13     # 13" iPad
node render-store-screens.mjs --frames=2,4         # 只補某幾張
```

版型在 `scripts/og/store-screens.html`：構圖固定在 430×932，再等比縮放置中到目標尺寸，所以 iPad 是兩側留奶油底，不是把手機版拉寬。插畫在 `docs/store-assets/illustrations/`。

**文案與畫面裡的數字要對齊。** 第 4 張標題寫「陪伴 285 天」，那是截圖當下的實際值；示範帳本的天數每天都在長，重截時要一起更新標題，否則圖上兩個數字會打架。

### 實機畫面怎麼截

```bash
cd scripts/og
node capture-screens.mjs --connect=http://127.0.0.1:9222   # 連上已登入的 Chrome
node capture-screens.mjs --login                            # 或用自己的專用 profile 登入一次
```

`--connect` 接受任何 CDP endpoint（例如 superpowers-chrome 起的那個）。`deviceScaleFactor` 由 CDP 覆寫，所以輸出像素不受實體螢幕 DPI 影響。

**上傳到 App Store Connect**

```bash
cd scripts/og
node asc-screenshots.mjs            # dry-run：印出會刪什麼、傳什麼，不動 ASC
node asc-screenshots.mjs --apply    # 真的換圖
```

`--apply` 會**先刪掉該 display type 的既有截圖再上傳**，所以它同時檢查三件事才動手：ASC 上必須有
唯一一個 `PREPARE_FOR_SUBMISSION` 版本（`READY_FOR_SALE` 改不動截圖）、`story/` 裡要有對應檔案
（空清單時跳過而不是把線上截圖清光）、每張 PNG 的實際尺寸要符合該 display type。

**截圖前的帳本準備**（2026-09-20 實作）：
- dev 兩位 profile 設 `avatar_hidden = true`（#1328 的欄位），頭像變成首字圓圈，不會出現真人照片
- 顯示名稱改成 Futa／Tari——首字 F／T 有差別，圓圈才分得出兩個人
- 把示範紀錄的日期挪到近一週，feed 才會顯示「今天／昨天」而不是「14 天前」
- 定期提案先跳過，否則首頁上半部會被提案卡佔滿

### 語系

目前只有 zh-TW。**其他三個語系還是舊的純實機截圖**：故事圖的文案是中文，而 dev 帳本的紀錄名稱（貓砂和飼料、巷口那家晚餐）也是中文，直接配英文／日文標題會變成混語畫面。要做 en／ja 的故事圖，得先有一份對應語言的示範帳本。
