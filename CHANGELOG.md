# Changelog

All notable changes to Oikos (Futari) are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

每版分兩小節：
- **使用者可見變化** — 使用者實際感知到的功能 / 修正，一句話、不寫技術細節
- **技術變更** — 技術決定、重構、schema migration、breaking change（沒有的話省略）

---

## [Unreleased]

_Nothing unreleased yet._

## [0.17.4] - 2026-05-16

主題：**旅行幣別 self-serve．Settings 結構收束．子頁面語言對齊**——v0.17.0 把多幣別 × 旅行的骨架立起來、v0.17.2 把旅行子帳本收斂完成，這版把「幣別 self-serve」最後一哩補齊：trip 自己挑要追蹤哪些幣別（不再綁 group base），AddSheet 在 trip context 出現對應的 currency picker，TripSheet 從 schema → UI → a11y/touch → 視覺密度 → 文案方向（rate direction）完整 polish 一輪，detail page 改成「fold preview 在上、per-currency × per-member 在下」更好掃讀。Settings 同步做了一輪結構收束——recurring 收入/支出合併成一個 tab 入口、帳本 vs 預設分攤拆成兩個 section、display/data 群組整理、subpage header + FAB 規則統一（extract `SubpageHeader` 共用於 /trips 與 Settings 子頁）。其他細修：愛物列表密度對齊 /records、a11y 多處（SplitTypeSelector、AssetSheet Field、InsuranceListItem、manifest）、SEO（metadata × JSON-LD × noindex × hreflang）、AddSheet reset deps 穩定化、i18n locale key coverage 加 test gate。

完整 diff：[v0.17.3...v0.17.4](https://github.com/redtear1115/oikos/compare/v0.17.3...v0.17.4)

### 使用者可見變化

#### 旅行幣別 self-serve（#410 epic + follow-ups）

- **Trip-scoped self-serve currencies**：每段旅行可自選要追蹤哪些原始幣別（不再綁 group base 衍生），schema foundation + 設定 UI 在 TripSheet 內（#410：2b90c7e、757f4db）。
- **AddSheet trip-scoped currency picker**：在 trip context 開啟 AddSheet 時，currency picker 只列該 trip 已啟用的幣別，並附 snapshot-based preview（#410：9fb2a54）。
- **Trip default = base currency + mid-trip rate edits**：新增 trip 時預設幣別 = group base、旅行進行中也能調整心理匯率（既有記錄維持 rate_snapshot 不動，新記錄套新匯率）（#410 fu：edd3a52）。
- **退場全域匯率 UI**：Settings 不再放心理匯率入口（v0.17.3 已從頂層移到 trip 詳情；這版徹底退掉相關 global UI），點過去的位置會回引到 trips（#410：27f7334）。
- **TripSheet 視覺與互動全面 polish**：a11y/touch target 補齊 + header hoist（c4ea75f）、視覺密度 + i18n 全 hoist（bc49a79）、rate direction 文案釐清「from → to」（99083e2）、edit 操作收到 header pencil + end-trip 走 destructive 確認流程（4bdaf48）、ended trip 隱藏 edit/end CTA（c02e0f5）、trip 詳情按返回回到原本進入頁面（0111036）。
- **Trip detail page 結構**：上半部 fold 出 preview，下半部用 per-currency × per-member 兩軸鋪開，混幣別 + 雙人 trip 一眼看完支出輪廓（3bc6a9d）。

#### Settings 結構收束

- **Recurring 收入 / 支出合併成一個 tab 入口**：原本兩個分散入口收進同一頁，tab 切換 支出 / 收入；income tab FAB 改用收入綠以區隔（34d4608、0db199e）。
- **帳本 vs 預設分攤拆兩個 section**：`帳本` section 只放 group-level 設定，`預設分攤方式` 獨立成自己的 section，視覺與語意都更清楚（2b66144、3ae3a14、3b085fb、461118c）。
- **Display / data 群組整理**：把 display 與 data 兩類設定 row 重新分群、消掉冗餘 subtitle（b8c5537）。
- **子頁 header + FAB 規則統一**：abstracted `SubpageHeader` 元件，/trips 與 Settings 各子頁共用同一個 header pattern；FAB 規則對齊（#402：9367e99；#411：7b88746）。

#### 愛物列表細修

- **行高密度對齊 /records**：愛物列表 row 從原本較寬鬆密度收緊到與 /records 一致（eea00c3）。
- **標題位置對齊**：頁面標題 vertical 對齊 /settings 與 /records 的位置（e60e566）。

#### 其他修正

- **a11y 多處補強**：SplitTypeSelector、AssetSheet Field、InsuranceListItem、PWA manifest（00c8257）。
- **SEO 清理**：metadata / JSON-LD / noindex / hreflang 統一收斂（5c40c3d）。
- **AddSheet 穩定化**：reset 依賴穩定化 + setTimeout 清理，避免 stale closure 與 timer leak（#386、#387：e0ce4c1）。

### 技術變更

- **i18n locale key coverage test**：新增 vitest test 確保 4 個 locale（zh-TW / zh-CN / en / ja）key 集合一致，遺漏會在 CI 擋下（#379：eaf4a41）。
- **文件結構**：版本歷史表從 CLAUDE.md 搬到 README，CLAUDE.md 只保留 `Latest released` 單行 pointer（#423：9b6028f）。

## [0.17.3] - 2026-05-15

主題：**Settings 收束 × 旅行感知 × AddSheet 守護分層．細節讓操作更貼手**——四個獨立改善讓使用者在三個地方少一步：Settings 把「語言」與「主體幣別」合在同一區（都是選一次就好的初始設定）、心理匯率從 Settings 頂層移進旅行詳情頁（匯率設定只在旅行 context 有意義）、Dashboard 在有 active trip 時浮出 ActiveTripBanner（主動告訴你有段旅行在進行）、AddSheet 的愛物選擇器在 Guardian beta 開啟時拆成愛物 / 守護兩個 tab（讓兩個模組各自清晰）。Spec 層面同步收束：原本混在一起的「多幣別 × 旅行」與「i18n」拆成兩份各自立場清晰的 spec（[trip-multi-currency](docs/superpowers/specs/trip-multi-currency-design.md)「邊界複雜，日常無感」、[locale-currency](docs/superpowers/specs/locale-currency-design.md)「保持簡單，選一次就好」）。

完整 diff：[v0.17.2...v0.17.3](https://github.com/redtear1115/oikos/compare/v0.17.2...v0.17.3)

### 使用者可見變化

#### Settings：語言 & 幣別合為一區（PR #371 closes #365）

Settings 新增「語言 & 幣別」section，把原本分散的 LanguageSwitcher 與主體幣別 row 合在同一個視覺區塊。兩者都是「進來一次設好、之後不必再動」的初始決策，並排在同一區比散落在不同 section 更讓人一眼看到。

#### 心理匯率從 Settings 移到旅行詳情頁（PR #372 closes #366）

設定心理匯率只在「要開始一段旅行」時才需要，放在 Settings 頂層讓它變成一個日常都看得到的選項，反而讓人困惑。現在移到 `/trips/[id]` 詳情頁，在 active trip + 非過去章節時顯示「調整心理匯率 →」連結，確保匯率調整在正確的 context 出現。

#### Dashboard ActiveTripBanner（PR #374 closes #367）

有 active trip 時，Dashboard 在 MonthlyReviewBanner 同層顯示 ActiveTripBanner：單一進行中旅行時顯示名稱 + 起始日 + 幣別，點進 `/trips/{id}`；多段旅行時改為「{N} 段旅行進行中」+ 連到 `/trips`。過去章節不顯示。Settings 旅行 row 加一行 secondary text（「N 段進行中 · 過去 M 段」），讓旅行入口在沒有旅行時也有意義。

#### AddSheet 愛物選擇器拆 tab（PR #373 closes #368）

Guardian beta 開啟時，AddSheet 的愛物選擇器拆成「愛物」與「守護」兩個 tab（未開啟時維持原有一欄清單）。分類邏輯：`type === 'insurance'` → 守護 tab；其他 → 愛物 tab。預設開「愛物」tab；每次打開重置；「不關聯」保留在兩個 tab 最頂。

### 技術變更

#### Spec 重組：trip-multi-currency + locale-currency（PR #370 closes #364）

原本的 `multi-currency-trip-design.md`（多幣別 + 旅行一份）和 `i18n-design.md` 各自混了兩種設計立場。拆成：

- `trip-multi-currency-design.md`——**邊界複雜，日常無感**：旅行子帳本 isolated sandbox、rate_snapshot、end-trip fold、心理匯率「兩人共同的一把尺」
- `locale-currency-design.md`——**保持簡單，選一次就好**：4 語 cookie-based locale + group base_currency，兩者完全獨立決策、onboarding 不擋完成

舊的 `multi-currency-trip-design.md` / `i18n-design.md` 刪除；INDEX.md + cross-refs 對齊新 key。

## [0.17.2] - 2026-05-15

主題：**旅行從沙盒到收斂．多幣別視角也站穩**——v0.17.0 把多幣別 × 旅行的底盤一次到位用 tag-style（`CashTransactions.trip_id`），出貨後重新檢視「Trip 子 ledger 不做」這個決定發現用 `TripExpenses` 隔離 table 比 tag 更乾淨：trip UI / 主帳本 query 路徑天然分離、`split_type` 完整支援、結束時收斂語意明確。這版四個 phase 把這條路走完——schema → backend → UI → 結束 fold 為主帳本 2 筆 summary `CashTransaction`，主帳本 balance 計算完全不必知道 trip 存在。順手把「幣別視角刻意分層」的立場寫進 spec：主帳本（dashboard / records / balance / AddSheet）守單一幣別、UI 不暴露幣別 picker；多幣別只在旅行子帳本出現——`complexity at the boundary, simplicity in daily use`。Pending 文案從「信用卡待扣」改為「待結算」（綁信用卡的框架誤導了實際語意），CWV LCP 三件套（Supabase preconnect / Google OAuth preconnect / lazy InAppBrowserGuard）把公開頁的 LCP 再壓一段，AI 爬蟲拿到 `llms-full.txt` 長介紹給 Perplexity / ChatGPT Search 引用。

完整 diff：[v0.17.1...v0.17.2](https://github.com/redtear1115/oikos/compare/v0.17.1...v0.17.2)

### 使用者可見變化

#### 旅行子帳本完整收斂（refs #42）

- **Trip detail FAB**：`/trips/[id]` 在 active trip + 非過去章節時 BottomNav FAB 解開隱藏，點開的 AddSheet 帶著當前 trip 預選（TripSelector 在這個 context 自動隱藏，trip 由頁面 implicit 帶入），currency 預設用 trip `default_currency`、ratio 預設用 group `default_split_ratio_a`。即使 trip 的 `start_date` 在未來，FAB 也會把記錄落到這個 trip（`prefilledTripId` 比日期 auto-detect 優先）。
- **「依幣別」與「誰花了多少」兩段 summary**：trip 詳情頁在 records list 上方多出兩段 summary card。混幣別時上面那段秀每個原始幣別的小計（native total + base 等值，照 base value 排序）；雙人 trip 下面那段秀每位成員的實際 cash out + 分攤後負擔，per-side 計算對齊 `lib/balance.transactionDelta()` 讓這個視圖跟 group balance 一致。單幣別 trip 沒有上半段；solo trip 沒有下半段。
- **記錄改寫到 `TripExpenses` 獨立 table**：在 trip context 建立 / 編輯記錄時走 `TripExpense` table，**不**進入 `CashTransactions`、**不**影響 `GroupBalance` 與主帳本 feed。trip 詳情頁讀的是 `TripExpenses`；v0.17.0 era 用 `CashTransactions.trip_id` tag 的舊紀錄留在主帳本，不再出現在 `/trips/[id]`（編輯時可清掉 tag）。
- **End trip 自動產 2 筆 summary CashTransaction**：trip 結束時把 `TripExpenses` fold 回主帳本——以每位實際 fronted money 的 member 為 `paid_by`、`amount` 為其總 out-of-pocket（base 幣別、用 `Trips.rate_snapshot` 換算）、`category='entertainment'`、`description='${trip.name} 結算'`、保留 `trip_id` 作為來源標記。`split_type` / `split_ratio_a` 自動挑選讓 `lib/balance.ts` 重算產生的 balance delta = trip 淨效果（整數 ratio 精度導致最多 ~trip_total/100 漂移，已在 `lib/tripSummary.ts` 內 brute-force 0–100 挑最小誤差 ratio；0% / 100% 自動 collapse 成 `all_mine` / `all_theirs`）。Solo group 永遠走 1 筆 `all_mine` summary，balance 維持 0。
- **End trip sheet 四語化**：新增 14 個 `tripDetail.*` i18n key（zh-TW / zh-CN / en / ja），日期驗證錯誤訊息 inline 帶入 `{date}`。

#### Pending 狀態文案：「信用卡待扣」→「待結算」（PR #361 closes #360）

Pending 不只是「信用卡待扣」——也可能是還沒實際付出去、或借據式 IOU。文案把「信用卡」綁進來會誤導使用者以為這個 status 專門給信用卡用。4 個 locale × 5 處 hardcoded copy（form `statusPending` + hint、`compactRow.pendingBadge`、trip 的 `perSideHint`、filter `statusPending`）全部對齊：

| Locale | Before | After |
|---|---|---|
| zh-TW | 信用卡待扣 / 待扣款 | 待結算 |
| zh-CN | 信用卡待扣 / 待扣款 | 待结算 |
| en | Credit card pending / Card pending | Pending |
| ja | カード引落待ち / 未確定 | 未精算 |

Hint 文字也跟著去掉「信用卡」框架；trip 的 `perSideHint` 同步更新。DB enum (`pending` | `settled`)、`lib/validators.ts`、balance 計算邏輯都不動——純文案。

#### CWV LCP 三件套（PR #357 closes #352）

公開頁 (`/`、`/sign-in`) 的 LCP 收斂：

- **`<head>` preconnect 到 Supabase**：warm TLS 到 `NEXT_PUBLIC_SUPABASE_URL`，Sign-In OAuth 點擊 / dashboard 首次 realtime / auth 請求都不必付完整 handshake。所有頁面覆蓋。
- **`/sign-in` preconnect 到 `accounts.google.com`**：warm Google OAuth redirect target。僅 sign-in 頁。
- **`InAppBrowserGuard` lazy load**：UA-match regex list + 全螢幕 modal 改用 `next/dynamic({ ssr: false })` 包成 ~3.1KB 的獨立 chunk，初始 layout bundle 不再 ship。~95% 訪客不在 in-app WebView，post-hydration delay 實際看不到。

#### `public/llms-full.txt` 給 AI 爬蟲引用（PR #356 closes #347）

`public/llms.txt` 之外加長版 `public/llms-full.txt`（~20KB Markdown）供 Perplexity / ChatGPT Search / Google AI Overview 在回答「雙人記帳 app?」這類 query 時有更準確內容可引用：產品 overview、功能列表（split modes / income / settlements / recurring / 愛物 / trips / 多幣別 / chapters / 月度回顧 / Guardian / PWA / i18n / solo mode）、給誰用 vs 不給誰用、5 個 use-case 場景、FAQ（定價 / 對比 Honeydue/Splitwise/YNAB / 資料留存 / 為什麼不接銀行 / 多幣別 / break-up 處理 / privacy / export）、競品定位 + 設計哲學（lamp metaphor / 光 × 顏色）、技術備註（stack / 整數金額精度 / soft-delete 語意）。`middleware.ts` 把 `/llms-full.txt` 加進排除清單（與 `llms.txt` / `robots.txt` / `sitemap.xml` 並列），避免被 307 導去 sign-in。

### 技術變更

#### 為什麼 v0.17.2 把 v0.17.0 的「Trip = tag」改成「Trip = isolated table」

v0.17.0 出貨時 `CashTransactions.trip_id` tag-style 是最少 schema migration 的設計：trip UI 只是 main ledger 的 `WHERE trip_id = ?` view、不另開 table、reuse 既有的 split / balance / feed 邏輯。出貨後重新檢視這個決定發現幾個摩擦點：

- **Main ledger 每個 query 都要 `WHERE trip_id IS NULL`** 才不污染 dashboard / `/records` / balance recompute——這條 invariant 靠人記，漏接一次就會看到旅行紀錄混在日常 feed
- **Trip 結束時的「收斂」語意難寫**：tag-style 下「結束」只是 status 變更，但 trip 結束後的紀錄應該以什麼樣的形態存在於主帳本？要保留每一筆？還是要 fold 成一筆？tag 不給結構回答這個問題
- **Trip-scoped split / weighted ratio 跟 main ledger 共用一套 `lib/balance.ts`** 太黏，trip 期間想另外做事（例如未來的 trip-scoped balance）會卡到主帳本

v0.17.2 改為 **isolated sandbox**：trip 期間記錄落 `TripExpenses`、主帳本不知道；trip 結束時自動 fold 為主帳本 2 筆 summary `CashTransactions`（`split_type` / `split_ratio_a` 自動挑使 balance delta = trip 淨效果）。主帳本 balance 計算 0 修改。完整設計見 [docs/superpowers/specs/multi-currency-trip-design.md § v0.17.2 Architecture](docs/superpowers/specs/multi-currency-trip-design.md)。

#### Phase 1 — Schema migration 0039（PR #340）

`drizzle/0039_trip_expense.sql`：
- 新表 `TripExpenses`：`id` / `trip_id` FK / `paid_by` FK / `amount` (base 幣別整數) / `original_currency` + `original_amount` (nullable, all-or-nothing CHECK) / `category` / `split_type` / `split_ratio` (payer 自己的 share %，0–100，CHECK 對應 `split_type='weighted'`) / `description` / `transacted_at` / `deleted_at` / `created_at`
- 不需要 `group_id`（透過 `trip_id → Trips.group_id` 解析）、`status`（trip 結束時批次收斂無需 pending）、`asset_id`（旅行支出通常不關聯愛物）、`fuel_log_id`（旅行不做加油雙寫）、`notes`（簡化）
- Partial indexes：`(trip_id) WHERE deleted_at IS NULL`、`(paid_by) WHERE deleted_at IS NULL`、`(deleted_at) WHERE deleted_at IS NOT NULL`
- `Trips.rate_snapshot jsonb`：trip 建立時從 group `CurrencyRates` 複製當時匯率（key uppercase `${FROM}_${TO}` 例如 `"USD_TWD"`、value numeric）；trip 內所有 expenses 換算都用這份 snapshot，group `CurrencyRates` 後續改動不會 drift 已開始的 trip

#### Phase 2 — Backend actions + queries（PR #341）

- `actions/tripExpense.ts`：`createTripExpense`（foreign-currency 用 `trip.rate_snapshot` 即時換算成 base，不再 read `CurrencyRates`——FX 鎖在 trip 建立時）、`editTripExpense`（atomic soft-delete-then-insert via `db.transaction()`，race guard 用 `.returning()` 長度檢查同 `actions/transaction.ts` 風格）、`softDeleteTripExpense`
- `lib/db/queries/tripExpense.ts`：`listTripExpenses(tripId)` / `getTripExpenseById(id)`
- `actions/trip.ts#createTrip`：讀 group 的 `CurrencyRates` rows、builds jsonb payload（uppercase keys）、寫進 `Trips.rate_snapshot`；empty rates → `{}`
- 15 個整合測試（real dev DB）：rate snapshot 正確、native vs foreign 幣別換算、weighted ratio validation、各 reject case、edit / soft delete

#### Phase 3 — UI wiring（PR #342）

- AddSheet `kind` discriminator：trip context 走 `createTripExpense` / `editTripExpense` / `softDeleteTripExpense`，非 trip context 維持走 `createTransaction`
- 舊 v0.17.0 era 用 `CashTransactions.trip_id` tag 的紀錄：留在主帳本，不再出現在 `/trips/[id]`（detail page 改讀 `TripExpenses`）；編輯時可清掉 tag
- Ratio 雙視角映射：`TripExpenses.splitRatio` 存 **payer 自己的 share %**（與 `CashTransactions.split_ratio_a` 不同；後者存 memberA 的 share %）。`/trips/[id]/page.tsx` 在讀取時根據 `group.memberA` 反向 frame 給 `CompactRow`；AddSheet 在 save 時用 `viewerIsA` + `payerWho` 反向轉
- `TripExpense` schema 沒有 `notes` / `status` / `assetId` 欄位——AddSheet form fields 仍顯示但 trip context 下 save 時被丟棄

#### Phase 4 — End trip fold 為主帳本 summary（PR #343）

- `actions/trip.ts#endTrip`：把 `TripExpenses` 收斂為 0–2 筆主帳本 `CashTransactions`、recalc balance；trip status `active → ended` 同 transaction 內完成；solo group 永遠走 1 筆 `all_mine` summary（balance 不受影響）；error 路徑 `'找不到進行中的旅行'` 不做 DB writes
- `lib/tripSummary.ts`：`bestRatioA(splits, totals)` brute-force 0–100 挑使 `lib/balance.ts` 重算的 delta 與真實 per-expense delta 差距最小的整數 ratio；0% / 100% 自動 collapse 成 `all_mine` / `all_theirs`；漂移 bound `~trip_total / 100` 在 unit test 內 assert
- Summary record 帶 `trip_id` 作為來源標記，Records feed 可以未來標示「東京之旅結算」

#### `multi-currency-trip-design.md` 與 `product-design.md` 加入「幣別視角刻意分層」立場（PR #359）

- `product-design.md` 新增 **§ 4 設計立場** section：「幣別視角刻意分層」這條跨功能域取捨——主帳本（dashboard / records / balance / AddSheet）= 單一幣別視角、UI 不暴露幣別 picker；旅行子帳本（TripExpenses / TripExpenseSheet）= 多幣別；旅行結束 fold 回主帳本單幣別
- `multi-currency-trip-design.md` 不採用 section 同步補一條 ❌ 主帳本幣別 picker、cross-link 回 `product-design.md#4-設計立場`
- 立場：**complexity at the boundary, simplicity in daily use**——守住「記錄要素低認知負擔」，日常每筆記帳不必做幣別決定，多幣別複雜度只在有明確時間邊界（旅行）的 context 才出現
- 配套 PR #358 把 AddSheet 主帳本路徑的 currency picker 拿掉、僅 trip-sub-ledger path 出現

## [0.17.1] - 2026-05-15

主題：**UX × 效能 × a11y × 快取．細節讓體驗更順**——v0.17.0 把多幣別 × 旅行的底盤一次到位之後，這版回頭把幾條「能用但不夠順」的縫細收掉：`/trips` 從 stub 級往上拉成跟其他頁面同一套視覺語言；`/settings/currency` 把鎖住主體幣別的原因說清楚、把心理匯率的「為什麼叫心理」用三塊 hint card 鋪好；landing 文字色把對比拉過 WCAG AA；中文字型不再 preload 11 個 woff2 搶關鍵路徑；ES2019+ polyfill 在現代瀏覽器全部砍掉；公開頁的 Cache-Control 從 middleware 搬到 Vercel edge 才真的吃得到。沒有新功能，只有把現有的東西打磨到該有的樣子——這就是 0.x.1 的意義。

完整 diff：[v0.17.0...v0.17.1](https://github.com/redtear1115/oikos/compare/v0.17.0...v0.17.1)

### 使用者可見變化

#### `/trips` UX 全面對齊（PR #332 closes #327 #328 #329 #330 #331）

- **List page**：共用 page-header（serif h1 + soft subtitle）、FAB via `BottomNav`、空狀態插圖；past trips 換成透明背景而非灰底，與 active trips 區分但不死灰。
- **TripSheet 重建在 `SheetShell` 之上**：Escape / backdrop tap / body scroll lock / chrome 一致行為都白送；加上 end ≥ start 的 inline 日期驗證；支援編輯模式讓 detail page 重用同一個 sheet。
- **Detail page**：sticky back bar（對齊 `AssetDetailClient`）；內容底部 `pb-[var(--bottom-nav-offset)]` 不被 BottomNav 遮住；「編輯」「結束旅行」作為 inline CTA（past-epoch 隱藏）；結束 trip 走確認 sheet，日期選擇器以 trip `startDate` 為下限。
- **Records list 改用 `CompactRow`**：分類 chip / payer + share 線 / dual-currency 主行原始幣別、副小字 base——與整個 app 一致。
- **總額卡片文案**：「總額（base）」→「這趟一共花了」；外幣換算註腳改寫成 user-facing 語氣。

#### `/settings/currency` UX pass（PR #333 closes #322 #323 #324 #325 #326）

- **Sticky page header + 回鍵 + 「貨幣」title**（#322），hero `<h1>` 讓頁面可被識別。
- **Design token 全面對齊**（#323）：原本散落的 `text-gray-500` / `text-red-600` / `bg-white` / `rounded border` 改成 `--ink-*` / `--surface-*` / `--hairline` / `--debit`；主體幣別選擇器從原生 `<select>` 換成 unified segmented selector（與 #263 toggle 家族同套 `--toggle-*` token）。
- **主體幣別被鎖住時的解釋卡**（#324）：原本只有不起眼的灰色註腳——改成 hint card 用陪伴語解釋「為什麼鎖住」+ 指向「開新章節重設」的替代路徑。
- **匯率每行 debounced save + 個別狀態**（#325）：每行 500ms debounce 自動儲存，顯示「儲存中…」「已存下」；個別 row 出錯只在那一行顯示，不再用一條紅字蓋掉全部。
- **「心理匯率」三塊 hint card**（#326）：解釋為什麼叫「心理」/ USD→TWD 具體例子 / 改 rate 後對歷史紀錄的行為，讓第一次看到這個概念的人知道要填什麼。
- 四語（zh-TW / zh-CN / en / ja）全部更新。

#### Landing 文字色過 WCAG AA + `llms.txt`（PR #334 closes #315 #316）

- **Landing 文字對比拉過 AA**（#315）：`--ink-3` (`#B89C8B`) on `--bg` (`#FBEDE0`) 的 ~2.23:1 對 normal text (4.5:1) 與 large text (3:1) 都過不了 AA，Lighthouse 在 landing 標 10 個 fail。`app/_landing/Landing.tsx`、`PhonePreview.tsx` 內所有文字使用點從 `--ink-3` 改用 `--ink-2` (`#7A5848`, ~5.5:1)。token 層的 `--ink-3` 沒動——它還是 `--btn-secondary-border` / `--btn-disabled-bg` / 裝飾邊框 / `RuleListItem` rail 等非文字用途的色，那些不適用 AA 對比規則。
- **`public/llms.txt` for AI crawlers**（#316）：給 LLM 爬蟲一份簡介（這是什麼產品 / 給誰用 / 不是什麼 / 連結）。`middleware.ts` 把 `llms.txt` 加進排除清單（與 `robots.txt` / `sitemap.xml` 並列），未登入請求不會被 307 導到 `/sign-in`。

### 技術變更

#### Vercel edge cache 改由 `vercel.json` 接手（PR #335 closes #314）

v0.16.3 在 middleware 加 `/`、`/sign-in`、`/terms`、`/privacy` 四條 public route 的 Cache-Control override（`public, s-maxage=3600, stale-while-revalidate=86400`），結果發現 Next.js dynamic rendering 對碰到 cookie 的 response 會把 header 蓋回 `private, no-store`——middleware 寫的 header 永遠不會到 browser / CDN，bf-cache + Google WRS 從來沒生效。把這四條搬到 `vercel.json`，因為 Vercel edge 在 Next.js 之後跑，它的 header 不會被覆蓋。`middleware.ts` 內的 override 拿掉，留一個 pointer comment 避免將來重新撞牆。`next.config.ts` 的 `/sw.js` `no-store` 不動（不同 static path）。

#### Build 三件套：polyfills + CSS blocking + font subset（PR #336 closes #317 #318 #319）

- **#317 browserslist**：`package.json` 加 `browserslist` field 鎖 Chrome/Firefox/Edge ≥ 100、Safari/iOS ≥ 16。SWC 不再對現代瀏覽器塞 `Array.prototype.at` / `flat` / `flatMap`、`Object.fromEntries`、`String.prototype.trimEnd` / `trimStart` 等 polyfill——7 個 ES2019+ 之中 6 個移除，只剩 ES2022 的 `Object.hasOwn`。
- **#319 fonts**：Noto Sans TC 在 `app/layout.tsx` 加 `preload: false`。`@font-face` metadata 仍在 CSS，但 `<link rel="preload">` 不再搶 11 個 ~770 KiB woff2 的關鍵路徑頻寬。CJK 首屏靠 globals.css 既有的 PingFang TC / Microsoft JhengHei / Noto Sans CJK TC fallback chain 立即 render；Noto Sans TC 走 async + `display: swap` 補上來。Fraunces 維持預設 preload（landing hero LCP-critical）。
- **#318 render-blocking CSS**：上面 #319 的 preload 改動同時把 render-blocking-insight savings 從 5,030ms 拉回 < 1,000ms。

## [0.17.0] - 2026-05-14

主題：**架構先行．多幣別 × 旅行子帳本一次到位**——Futari 從 i18n 的 ja 開始就把日本市場放在心上，但金額一直硬寫 TWD 整數，是進入日本市場、跨境家庭、海外薪資情境的硬卡點；另一頭「東京 5 日花了多少」「今年聖誕假期總共多少」這類雙人最有感的旅行子帳本需求也擱了很久。這版選擇把兩個耦合的 feature 綁在同一個 schema migration window 裡一起出——schema 一次到位、UI 走 minimal——避免將來再痛一次；同時把所有 amount 顯示路徑改成 currency-aware（TypeScript compile-time guard 防止漏接 currency 參數），讓底盤穩定下來迎接後續幣別擴張。匯率走「自訂心理匯率」（不接 API、不讓數字每天跳動讓人焦慮）+「snapshot 語意」（改 rate 後過去紀錄保留當時匯率），與 Futari「兩人共同對齊的一把尺」哲學一致。Trip 是 tag-style record 標籤（不另開子 ledger），強制單一 epoch（trip 不可跨章節），leave 群組時有 active trip 會被擋住。順手把 #299 也收掉：定期收支 list item 加上「誰的 + 分攤方式」第三條 meta 行。

完整 diff：[v0.16.3...v0.17.0](https://github.com/redtear1115/oikos/compare/v0.16.3...v0.17.0)

### 使用者可見變化

#### 多幣別支援（closes #68）

- **Group 主體幣別（4 選 1：TWD / CNY / USD / JPY）**：Settings → 貨幣可改主體幣別；balance / settlement / report 全圍繞此幣別。當前 epoch 已有紀錄時鎖住不可改（避免歷史紀錄 base currency 漂移）；新建 group 或剛開新 epoch 的群組能補設定。
- **自訂心理匯率**：Settings → 貨幣三個匯率輸入欄（依主體幣別動態 render，例如主體 TWD 顯示「1 TWD = ___ JPY/USD/CNY」），小數三位，最小 0.001。Futari 走「兩人共同對齊的一把尺」差異化——不接外部 API、數字不每天跳動讓人焦慮。
- **記帳表單 currency selector + 即時換算 preview**：AddSheet 新增 currency selector（4 選 1），若 currency ≠ base 幣別則金額輸入旁顯示「≈ NT$ X 換算」即時 preview。USD 走 cent 精度（`$12.50` ↔ `1250`），其他幣別存整數。
- **Records 列表多幣別 row dual-display**：多幣別 record 主行顯示原始幣別、副小字 base 等值；同幣別 row 照常 single line。
- **Snapshot 語意鎖在每筆 record**：每筆多幣別 record 寫入瞬間鎖定當時匯率（`rate_snapshot`），之後改 Settings 匯率不影響歷史紀錄等值；balance 計算永遠看 base 幣別整數，與幣別無關。

#### 旅行子帳本（refs #42）

- **`/trips` 列表 + 詳情頁**：active trips（按 start_date desc）+ past trips；點進去看單一 trip 的 records list（filter by trip_id）+ 總額。Settings 新增「旅行」入口。
- **建立 / 結束 / 軟刪 trip**：name + start_date + end_date(opt) + default_currency(opt) + budget(opt) 五個欄位。結束 trip 把 status 改 `'ended'` + 填 `ended_at`。
- **記帳表單 trip selector**：AddSheet 新增 trip selector（active trips dropdown + 「無旅行」），若有 active trip 且 transactedAt 在範圍內 → 預設選該 trip（可改）；trip 有 `default_currency` 時 cascade 到 currency selector。沒有 active trip 時 selector 自動隱藏。
- **強制單一 epoch**：trip 建立時 `start_date` 必須 ≥ `currentEpochStartedAt`（不可建在過去章節），DB 層 `Trips.epoch_id` 是 notNull FK 把這條 invariant 變成結構性保證。
- **離開帳本 / 接受邀請 reject active trip**：`leaveGroup` 若當前 epoch 有 `status='active'` 的 trip → reject「請先結束旅行再離開章節」+ 提供 trip 結束捷徑連結（注意 swap 不算結束 epoch，所以 swap 不檢查 trip）。
- **過去章節的 trip 沿用 epoch-readonly**：pin 在 past epoch 時 trip 相關 UI 唯讀，與其他 transaction 一致。

#### 定期收支 list 顯示誰的 + 分攤方式（PR #300 closes #299）

- **`/settings/recurring-expense` 和 `/settings/recurring-income` list item 加第三條 meta 行**：掃一眼就能看出規則屬於誰（avatar + displayName，沿用 dashboard `CompactRow` 慣例——memberA 深色、memberB 橘色）、以及分攤方式（split chip：對等分 / 全部我的 / 全部對方的 / 依比例分）。
- **`all_mine` / `all_theirs` 標籤對 viewer 視角**：避免「我看到 partner 規則寫『全部我的』」的歧義——永遠以 viewer 為「我」，必要時 swap label。
- **Solo 模式整條 meta 隱藏**：單人沒對方、沒分攤，indicator 沒意義。
- **收入無 split chip**：收入只有 recipient，沒有分攤概念。

### 技術變更

#### v0.17.0 為什麼把多幣別 × 旅行綁一起出（"架構先行" bundle）

兩個 feature 在邏輯上獨立，但：
- Schema migration 共用 window，分開做等於做兩次 migration
- 記帳表單同時新增 currency selector 與 trip selector，trip 的 `default_currency` 提供 currency selector 預設值（單向弱耦合）
- 整體立場一致：底層 schema 一次到位、UI 只做最小可用；先例如 v0.15.3 [epoch-readonly](docs/superpowers/specs/epoch-readonly-design.md)（Part 1 政策 + Part 2 型別防呆）

完整設計在 [docs/superpowers/specs/multi-currency-trip-design.md](docs/superpowers/specs/multi-currency-trip-design.md)（含 locked decisions / 不採用清單 / 風險與緩解 / acceptance criteria）。

#### Phase 1 — `lib/currency.ts` foundation（PR #298）

新模組 `lib/currency.ts` 集中所有 currency-aware 邏輯：`formatAmount(amount, currency)` 顯示用（處理 cent ↔ 整數、千分位、幣別符號）、`convertAmount({ amount, from, to, rates })` 換算（含 cent ↔ 整數 normalize）、`currencyPrecision(currency)` USD 為 2 其他為 0、`CURRENCIES: readonly CurrencyCode[]` 排序與 i18n key 對應。TypeScript 強制 `formatAmount` 必傳 currency 參數 → compile-time guard 防漏接。

#### Phase 2 — `NT$` callsite migration（PR #302）

把所有散落在 codebase 裡的 `NT$${amount.toLocaleString()}` 寫死樣板改成 `formatAmount(amount, currency)` callsite。純 refactor、TypeScript pass。為 Phase 3 schema 出來後的 currency-aware 顯示鋪路。

#### Phase 3 — Schema migration 0038（PR #303）

`drizzle/0038_multi_currency_and_trips.sql`：
- 新 enum `currency_code` (`twd / cny / usd / jpy`)、`trip_status` (`active / ended / archived`)
- `OikosGroups` 加 `base_currency currency_code NOT NULL DEFAULT 'twd'`
- 新表 `CurrencyRates`：per-group 心理匯率，PK `(group_id, from_currency, to_currency)`，rate `numeric(10,3)`；只存當前匯率、不存歷史
- 新表 `Trips`：`epoch_id` notNull FK to `GroupEpochs`、`status` + `start_date` + `end_date` + `default_currency` + `budget_amount` + `budget_currency` + `cover_photo_url`（欄位先加，UI 不做上傳）
- `CashTransactions` 加 `original_currency` / `original_amount` / `rate_snapshot` / `trip_id` 四欄
- `IncomeTransactions` 加 `original_currency` / `original_amount` / `rate_snapshot` 三欄（**UI v0.17.0 不接**，但欄位先加避免未來再 migration）
- `Settlements` 不動（強制 base 幣別）

#### Phase 4 — Settings 貨幣 page + server actions（PR #304）

- `app/(dashboard)/settings/currency/` page + `_components/CurrencySettings.tsx`
- `actions/currency.ts`：`setBaseCurrency`（守「當前 epoch 無 record 時可改」guard）、`setRate`、`listRates`
- `lib/db/queries/currencyRates.ts`：currency rate queries
- i18n: zh-TW「貨幣 / 主體貨幣 / 匯率」/ zh-CN「货币」/ en「Currency」/ ja「通貨」

#### Phase 5 — Trip CRUD + leaveGroup guard + /trips pages（PR #309）

- `actions/trip.ts`：`createTrip`（含 single-epoch guard: `start_date >= currentEpochStartedAt`）、`endTrip`、`updateTrip`、`softDeleteTrip`
- `lib/db/queries/trips.ts`：`listActiveTrips` / `listAllTrips` / `getTripById` / `hasActiveTrip` / `listTripRecords`
- `actions/membership.ts#leaveGroup`：reject with `active_trip_exists` 若當前 epoch 有 active trip
- `app/(dashboard)/trips/page.tsx` + `_components/{TripList,TripSheet}.tsx` + `[id]/page.tsx`：list + create sheet + detail
- `Trips.epoch_id` FK 把「trip 單一 epoch」invariant 從靠記憶變成結構性保證；past-epoch trips 沿用既有 epoch-readonly UI 行為（list page 只 query currentEpoch）

#### Phase 6 — AddSheet integration + dual-currency display + e2e（PR #313 closes #68）

- `actions/transaction.ts#createTransaction`：accept `currency` + `tripId`；用 `convertAmount()` 把 foreign amount 換成 base 幣別寫入 `amount` 欄位；snapshot 當時 rate 到 `rate_snapshot`；驗證 trip 屬於同一 group + 同一 epoch
- `CurrencySelector` + `TripSelector` 元件（`app/(dashboard)/dashboard/_components/`）：TripSelector 沒有 active trips 時自動隱藏
- `AddSheet.tsx`：currency selector + trip selector + real-time conversion preview（例如「≈ NT$110」）；auto-select 今日的 active trip 並 cascade 其 `defaultCurrency`；從 `dashboard/page.tsx` 透過 `Dashboard.tsx` prop-drill
- `CompactRow`：多幣別 row 主行原始幣別、副小字 base 等值
- 所有 feed query helpers（`transactions.ts` / `asset.ts` / `insurance.ts` / `incomeFeedRow.ts` / `TransactionFeed.tsx`）擴 4 個 nullable 欄位讓 `PagedTxnRow` / `FeedRow` shape 一致
- i18n: `幣別 / 旅行 / 無旅行`（zh-TW）、`货别 / 旅行 / 无旅行`（zh-CN）、`Currency / Trip / No trip`（en）、`通貨 / 旅行 / なし`（ja）
- E2E golden path test（`__tests__/actions/multiCurrencyTrip.e2e.test.ts`）：seed group → createTrip(Tokyo/JPY) → setRate(JPY→TWD 0.220) → createTransaction(500 JPY) → assert DB row (`amount=110, originalCurrency=jpy, originalAmount=500, rateSnapshot=0.220`) → assert balance=0 → endTrip → hasActiveTrip=false → softDeleteTrip → getTripById=null

#### 其他

- **定期收支 list item 加第三條 meta 行**（PR #300 #299）：`RuleListItem.tsx`（recurring-expense / recurring-income 各一份）加 avatar16 + displayName + split chip；i18n 沿用既有 `splitType.even / allMine / allPartners / weighted` + `common.you / partner` 四語 key（無需新增）。
- **Doc keeper pass**（commit 1 of release PR）：刪除 v0.16.0 殘留的重複 spec `asset-templates-design.md`（已被 `aibutsu-templates-design.md` 取代但舊檔沒清掉）；`multi-currency-trip-design.md` frontmatter `planned → shipped`；INDEX.md 記帳核心 section 加 multi-currency-trip 連結；CLAUDE.md Domain Model 補 `base_currency` / `CurrencyRates` / `Trips` 三個 entity 語意 + 多幣別欄位在 `CashTransactions` / `IncomeTransactions` 的角色；Entity 關係圖加入 Trips（epoch-bound）+ CurrencyRates。

## [0.16.3] - 2026-05-14

主題：**在搜尋裡也被看見．sitemap × canonical × middleware × cache 訊號收斂**——Google Search Console 開始持續回報 `LHR failed to render`。本機跑 Lighthouse 13.3.0 不會重現（runtimeError 為 null），但檢查站台四個 SEO/PWA 訊號發現一組互相矛盾的設定：sitemap 把 `/sign-in` 標 priority 1.0 卻沒列首頁、所有頁面的 `rel=canonical` 都寫死指 `/`、middleware 把 `/sw.js` 跟 `/manifest.webmanifest` 攔截 307 → `/sign-in`、所有公開頁面都帶 `Cache-Control: private, no-store`。PSI 跑完 LHR 試圖合成 page-experience signal 時遇到這些訊號矛盾就 bail out → 回 `LHR failed to render`。這版把四條訊號全部對齊，搜尋引擎才能重新讀懂 Futari。

完整 diff：[v0.16.2...v0.16.3](https://github.com/redtear1115/oikos/compare/v0.16.2...v0.16.3)

### 使用者可見變化

本版沒有使用者可見的 UI 或功能變化。SEO / PWA 訊號修正後，Google Search Console 應能恢復索引；當有人搜尋「家庭記帳」「夫妻共享帳本」「雙人記帳 PWA」等關鍵字，Futari 才有可能出現在結果裡——「被找到」是另一種陪伴的開始。

### 技術變更（PR #310 closes #305 #306 #307 #308）

- **sitemap + canonical 訊號矛盾收斂（closes #305）**：[`app/sitemap.ts`](app/sitemap.ts) 加入 `/`（priority 1.0），`/sign-in` 降至 0.7；[`app/layout.tsx`](app/layout.tsx) 移除全站 `alternates.canonical: '/'`，改在 [`app/page.tsx`](app/page.tsx)、[`app/sign-in/page.tsx`](app/sign-in/page.tsx)、[`app/terms/page.tsx`](app/terms/page.tsx)、[`app/privacy/page.tsx`](app/privacy/page.tsx) 各自宣告自己的 canonical。Lighthouse `canonical` audit 由 score 0（"Points to the domain's root URL... instead of equivalent page"）回到 score 1，`/sign-in` 的 SEO 分數 0.92 → 1.00。
- **middleware 攔截 PWA 資源（closes #306）**：[`middleware.ts`](middleware.ts) matcher 排除清單加入 `sw.js`、`service-worker.js`、`manifest.(json|webmanifest)`、`woff2?`、`gif`。原本 bundle 內含的 `navigator.serviceWorker.register('/sw.js')` 收到 307 → `/sign-in` HTML → MIME mismatch → SW 註冊被 `try{}` 吞掉、靜默失敗。修補後 `/sw.js` 回 200 + `content-type: application/javascript`，SW 才真的有註冊。
- **manifest `start_url` 指向 auth 牆內（closes #307）**：[`public/manifest.json`](public/manifest.json) `start_url` 從 `/dashboard` 改成 `/`。原本未登入裝置從 home screen 開 PWA 會被 307 → /sign-in，PWA installable audit 因 redirect chain 降級。
- **公開頁面 Cache-Control 阻擋 bf-cache（closes #308）**：[`middleware.ts`](middleware.ts) 對 `PUBLIC_PATHS`（`/`、`/sign-in`、`/terms`、`/privacy`）覆寫 `Cache-Control` 為 `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400`。原本 Supabase cookie ops 讓所有回應被套上 `private, no-store`，Lighthouse `bf-cache` audit 因主資源 `no-store` 失敗（`MainResourceHasCacheControlNoStore`）。修補後 bf-cache audit 通過、Vercel edge cache 對 public 路徑生效。

驗證：本機 build + Lighthouse 13.3.0 跑 `/` 與 `/sign-in`，runtimeError 為 null、`/sign-in` SEO 1.00、`/` bf-cache score 1，四個 fix 透過 `curl` 確認 response headers 已對齊。

## [0.16.2] - 2026-05-14

主題：**設計語言收束．第一張公開臉．效能更輕**——v0.16.0 / v0.16.1 把守護模組獨立化、設定頁重新分組、模板系統 v1 落地之後，這版集中收掉幾個跨表面的視覺裂縫：button 顏色、destructive 按鈕、Settings 按鈕、三種 toggle（switch / chip / segment）、收入支出兩個 sheet、保險卡 badge、愛物卡片資訊密度、Records 日期顯示——全部走同一份 design token 之後，視覺權重終於穩定下來。同期 `/` 從 redirect 升級為真正的 landing page，第一次面對未登入訪客有自己的臉；OG image 同步換成 Editorial direction 的「兩個人，一本帳」。效能側也順手收兩條：Noto Sans TC 移除 weight 600（render-blocking CSS −93KB）、Dashboard 首屏 query 用 `React.cache()` 去重 + `Promise.all` 合併。最後是一票 /records 與 sheet 細節 polish：篩選分類加全選 chip + 色點、分擔金額補回、大額用億/兆縮寫、Escape 鍵關 sheet、edit-mode CTA 文案、sticky 返回按鈕、定期收支 chip scroll fade 等。

完整 diff：[v0.16.1...v0.16.2](https://github.com/redtear1115/oikos/compare/v0.16.1...v0.16.2)

### 使用者可見變化

#### 設計語言收束：button / toggle / form / card / badge / date 全部走 token（PR #280 #281 #283 #285 #286 #288 #293、closes #258 #262 #261 #259 #260 #257 #293、含 #251）
- **Button 顏色語意分層**（PR #280 closes #258）：新增 `--btn-{primary,secondary,destructive,accent}-{bg,text,border}` 一整組 token 取代散落在元件裡的硬編 hex / `var(--accent)` 直用。同顏色但語意不同的按鈕（primary 完成 vs accent 邀請對方）從這版開始可以單獨改而不影響另一個。
- **Destructive 按鈕統一使用 `--btn-destructive-*`**（PR #281 closes #262）：填底紅字白的刪除按鈕全部接 token；text-only destructive（LogoutButton、各 sheet 內的「刪除這筆」連結）、警告 chip / 邊框、DangerZone 軟性入口刻意保留原樣，視覺權重維持階層差。
- **Settings 按鈕語意差異化**（PR #283 closes #261）：邀請 CTA 接 `--btn-accent-*`、LeaveGroupFlow / SwapPending 的取消 / 拒絕 / 返回接 `--btn-secondary-*`（outlined）、Save / Settle / 同意換伴侶接 `--btn-primary-*`、Card4 yes / FinalConfirm leave 接 `--btn-destructive-*`。同畫面內 primary / destructive 一起出現時對比終於回到正確。
- **三種 toggle 元件外觀統一（switch / chip / segment）**（PR #293 closes #293）：iOS 風 switch、單選 chip、segmented control 各自演化出不同的高亮 / 邊框 / hover 狀態。這版收斂成同一套 token，每種 toggle 在 on / off / hover / focus 之間的視覺反饋一致。
- **收入 / 支出表單視覺語言對齊**（PR #288 closes #257）：之前 IncomeSheet 有 LightDot + radial halo + mono uppercase labels + glow amount + gradient divider + plain-link delete，AddSheet 全沒有，兩個 sheet 像兩個產品。這版把裝飾差異全拿掉、section label 統一 `text-xs tracking-[0.6px]`、欄位順序對齊（amount + recipient → category → policy → date → note → delete）、note 改成標準 textarea、delete 改成 outlined destructive 按鈕。AddSheet amount 補上千分位格式化。Mode 差異（mint sheetBg / P.ink 強調色）保留。
- **保險卡 badge 統一顯示**（PR #286 closes #260）：之前部分保險卡有 badge（繳費剩 N 天 / 已到期 / 繳費期滿）、部分沒有，無 badge 看起來像「被隱藏」的狀態。改成每張卡一律渲染一個 badge，預設「繳費中」用保險愛物 tint 做低權重底色；urgency / destructive / saving 三層之上多了一個 baseline，視覺權重清楚。多年期保單到期改顯示「已到期」saving 色票，避免 badge 與副標互相矛盾。
- **愛物卡片資訊密度統一**（PR #285 closes #259）：/assets 列表上車輛 hero card 之前顯示「本月 / 累計」雙欄，其他類型只有「本月」單欄，車輛變成資訊量特例。這版車輛去掉累計、本月改成與 AssetListItem 同款的右側對齊小 stat；累計 stat 留在車輛詳情頁。跨類別資訊一致性比個別類別資訊豐富更重要。
- **日期顯示規則統一**（PR #277 closes #251）：`lib/format-date.ts` 收斂成四個 formatter 對應四種情境（Records 列表的相對日 / dashboard 詳列 / sheet 內絕對日 / past chapter 切片），跨頁面看到的「同一天」終於是同一個字串。

#### 第一張公開臉：landing page + OG image refresh（PR #282 closes #269）
- **`/` 從 redirect 升級為真正的 landing page**：未登入訪客之前直接被踢到 /sign-in，沒有任何「Futari 是什麼」的訊息；這版把 `/` 改成 server-rendered landing：mobile-first 單欄 + 2×2 feature grid、md+ 升級為兩欄 hero + 4 欄 feature row。已登入 CTA → /dashboard、未登入 CTA → /sign-in。所有顏色復用既有 globals.css token（`--bg` / `--ink` / `--accent` / `--asset-color-*` / `--saving` / `--hairline` / `--font-fraunces`），沒新增 CSS。
- **OG image 換 Editorial direction「兩個人，一本帳」**：新增 `scripts/og/` Puppeteer 渲染器，從單一來源產生 4 種社群分享圖片（og-image / og-image-2x / og-line / og-square）。`app/layout.tsx` 的 `alternates.canonical` 改為 `/`、`openGraph.url` 改為 `/`、`openGraph.images` 加入 landscape / LINE 適用的 og-line + square 變體。Landing namespace（hero / CTA / trust pills / features / footer trust 共 19 個字串）四語齊備。

#### 效能更輕（PR #291 #292、closes #290 #289）
- **Noto Sans TC 移除 weight 600，render-blocking CSS −93KB**（PR #292 closes #289）：font weight 600 全站只在極少數位置出現，移除後 CSS 體積大幅縮減；視覺降級到 500 / 700 已驗證可接受。LCP / FCP 在實機上感覺更輕。
- **Dashboard 首屏 `React.cache()` 去重 + `Promise.all` 合併**（PR #291 closes #290）：同一 request 內 server components 多次呼叫同一個 query 不再各跑一次 DB；dashboard 的多個獨立 query 改成 `Promise.all` 並行而非 sequential。最大 wins 在 dashboard SSR 首屏時間。

#### /records 與 sheet 細節 polish
- **篩選分類加全選 chip + 分類色點**（PR #276 closes #254）：篩選 sheet 的分類列開頭一顆「全選」chip 可一鍵把該類分類全選 / 全取消；每個 chip 前面加 4px 分類色點，視覺辨識度跟 feed icon 對齊。
- **補回 Records 分攤金額顯示**（PR #278）：CompactRow 在 v0.16.1 拿掉「我 $X」徽章時意外帶走了某些 case 的分攤金額；補回 split_type=weighted / all_theirs 等需要呈現的數字。
- **金額欄 shrink-0 + 大額用億/兆縮寫**（PR #267 closes #249）：CompactRow 在窄螢幕 + 大額（≥ 1 億）時金額會被擠壓；金額欄改 `shrink-0`、≥ 1 億用億、≥ 1 兆用兆縮寫，row 不再因金額長度斷版。
- **主 scroll 容器加 FAB clearance**（PR #268 closes #253）：底部 FAB 區之前會壓到列表最末筆；加上 padding-bottom，最末筆永遠看得到。
- **/assets sticky 返回按鈕**（PR #274 closes #250）：愛物詳情頁的返回按鈕改 sticky，捲動到底也持續可見，不必再滑回頂端。
- **Edit-mode CTA 文案「更新」**（PR #272 closes #252）：所有 sheet 在 edit mode 的 CTA 從「儲存」改成「更新」，跟 create mode 的「新增」拉開語意。
- **Escape 鍵關閉 sheet / modal**（PR #271 closes #255）：篩選面板、加帳 sheet、收入 sheet、結算 sheet、愛物 sheet、定期收支 sheet、確認對話框等所有 overlay 現在都可以按 Escape 關閉。多層巢狀每按一次只關最上層。IME 組字中的 Escape 跳過，不影響中文輸入。
- **定期收支 sheet 分類 chip scroll fade**（PR #287 closes #265）：定期支出 / 定期收入規則 sheet 的分類 chip 改用共用的 `ScrollFadeRow`，捲動有視覺提示，與 AddSheet / IncomeSheet 對齊。
- **定期收支 shortcut 卡可點擊性**（PR #275 closes #264）：強化 hit target，整張卡都可點而非只有中間文字。
- **寵物詳情頁 species enum 翻譯**（PR #270 closes #256）：cat / dog / 等英文 enum 在詳情頁顯示為翻譯後的字串。

### 技術變更

- **Button color design tokens**（PR #280 #258）：在 `globals.css` 新增 `--btn-{primary,secondary,destructive,accent}-{bg,text,border}` token family；後續 PR #281 / #283 把現有 callsite 逐批 migrate 過去。Token values 對應原本的 brand red / `--accent` / `--ink` 等，輸出 byte-identical，純 wire-up。
- **Toggle 元件統一**（PR #293）：iOS 風 switch / 單選 chip / segmented control 共用同一份 on / off / hover / focus state token，元件內不再各自 hard-code。
- **Form sheets 視覺合流**（PR #288 #257）：IncomeSheet 拿掉 LightDot / radial halo / mono uppercase label / glow amount / gradient divider / plain-link delete 等裝飾差異；section label 統一 `text-xs tracking-[0.6px]`；新增 `titleEdit` / `noteLabel` i18n key（四語）。
- **`renderBadge` 每張保險卡都渲染一個 badge**（PR #286 #260）：`InsuranceListItem` 加 active 預設 state 用 `--asset-tint-insurance` 作低權重底色；多年期保單 yearsPassed ≥ termYears 時 badge 改顯示 `i.savingsMaturedBadge` 對齊副標的「已到期」文案。
- **車輛 hero card 改用 AssetListItem 同款 stat**（PR #285 #259）：移除車輛 hero card 的底部 money panel + chevron + 累計欄；累計 stat 保留在 `/assets/[id]` 的 AssetHero。跨類別資訊一致性優先。
- **`lib/format-date.ts` 收斂為四個 formatter**（PR #277 #251）：`formatDateRelative`（Records 列表 / dashboard recent，今天 / 昨天 / 月日 / 年月日）與其他絕對日 / sheet 內格式分離；既有 callsite 全部 migrate 走同一份規則。
- **`/` page 改 server component + 移除 redirect**（PR #282 #269）：新增 `app/_landing/{Landing,PhonePreview,FutariMark}.tsx`；`app/page.tsx` 用 `getCurrentUser()` 決定 CTA href；`app/layout.tsx` 的 `alternates.canonical` 改 `/`、`openGraph.url` 改 `/`、`openGraph.images` 擴成 og-image + og-line + og-square 三條。Middleware `isPublic` 已含 `/` 不需動。
- **OG image render pipeline**（PR #282 within #269）：新增 `scripts/og/template.html` + `scripts/og/render.mjs`（Puppeteer），單一來源產生 og-image / og-image-2x / og-line / og-square 四種變體。
- **Noto Sans TC weight 600 移除**（PR #292 #289）：font-face declarations 砍掉 600；render-blocking CSS 縮減 93KB（lighthouse 量測）。
- **`React.cache()` + dashboard `Promise.all`**（PR #291 #290）：把 dashboard SSR 期間會被多個 server component 重複呼叫的 query 用 `React.cache()` 包一層去重；dashboard 首屏多個獨立 query 從 sequential await 改 `Promise.all`。
- **`useEscapeToClose` hook + 模組層 stack**（PR #271 #255）：在 `app/(dashboard)/_components/useEscapeToClose.ts` 加新的 hook，挂在 `SheetBackdrop`（14 個 sheet 共用）與 `AssetPickerSheet`（自帶 backdrop）。stack 模型確保只有最上層 open 的 handler 響應。IME 組字（`isComposing` / keyCode 229）跳過。`InAppBrowserGuard` 是 security blocker，刻意不接此 hook。
- **`ScrollFadeRow` 套用到定期收支 sheet**（PR #287 #265）：定期支出 sheet fade 接 `var(--bg)`、定期收入 sheet 接 `P.sheetBg`（DEFAULT_INCOME_PALETTE，跟 IncomeSheet 對齊）。
- **CompactRow 補回 split amount + 大額縮寫**（PR #278 / PR #267 #249）：v0.16.1 移除「我 $X」徽章時誤刪了 weighted / all_theirs 的分攤金額 render，補回；金額欄 `shrink-0`、`formatAmount` 對 ≥ 1 億 / ≥ 1 兆 以億 / 兆 縮寫。
- **AssetSheet key 顯式傳遞**（PR #273 closes #266）：原本透過 `{...sharedProps}` spread `key`，React 19 改 warning；改為顯式 `key={...}`。
- **`docs(specs): restructure with INDEX + writing guide`**（PR #247）：specs 目錄重整為 INDEX 入口 + 統一 frontmatter schema + 拆分原則；merge 早期合集 spec、拆出 epoch-readonly / guardian / aibutsu-templates 等獨立 spec、新增 realtime / savings-view 等。內容只動結構，不改 lock 決策。

## [0.16.1] - 2026-05-13

主題：**守護後的細節收尾．角色色 × 收入篩選 × 被保人自己/對方 × 兩條清理**——v0.16.0 把守護模組獨立化、設定頁重新分組、愛物模板與篩選分組一次到位之後，這版專注收掉幾個 surface 上的小裂縫：守護 beta 開了之後愛物頁不該再讓你選保險（兩條建立保單路徑會回到 v0.15.x 的混亂）；Dashboard 切到收入模式時 filter 入口不見了（spec 早就講過要 parity，這版補實作）；雙人帳本的頭像顏色從「以你視角左/右」改成「以絕對角色」（深咖啡 / 橘對到愛心 icon 兩瓣，跨頁面看到的我永遠是同一個顏色）；被保人原本只能選孩子愛物或自行輸入文字，這版把 schema 早就埋好的 group member FK 接到 UI，補上「我 / 對方」兩個選項；支出列每列右上的「我 $X」徽章在單人視角是冗餘訊息，拆掉留純粹。

完整 diff：[v0.16.0...v0.16.1](https://github.com/redtear1115/oikos/compare/v0.16.0...v0.16.1)

### 使用者可見變化

#### 守護開了之後，愛物頁不再 surface 保險（PR #241 closes #236）
- **愛物 FAB → TypePicker 不再有「保險」選項**：v0.16.0 第一輪在 ON 時把保險 tile 放進「更多」展開區，導致同時存在兩條建立保單路徑（愛物 FAB → 保險 vs 守護 tab FAB → 保險），心智上回到 v0.15.x 那種「保險到底屬於愛物還是守護」的混亂。這版直接把保險從 TypePicker 完全拿掉。
- **守護 tab FAB 改直接開保單 sheet**：守護 tab 是進入保險的唯一前門，按 FAB 不再多看一頁 TypePicker（裡面也沒有它了），AssetSheet 直接 mount `InsuranceSheetBody`。既有保單編輯流程不動。

#### Dashboard 收入模式補上 filter 入口（PR #242 closes #235）
- **Dashboard 切到收入模式，「篩選 ›」按鈕現在會出現**：v0.15.0 lite-mode FilterSheet 從一開始就是 mode-agnostic 的設計，但 Dashboard 實作把按鈕用 `mode === 'expense' &&` 包起來、收入 loader 也是 module-level 拿不到 filter 物件——切到收入模式 entry point 整個消失。修掉之後 expense / income 兩個 mode 走同一條 filter wire：payer / 金額範圍 / status 都能套，套了之後 feed 立刻收斂。
- 維度顯示沿用既有 lite-mode 規則（payer / amount / status 顯示，date / 愛物 / 分類 hidden），跟支出側一致。

#### 頭像顏色改為依絕對角色（PR #243 closes #238）
- **`member_a` 永遠是深咖啡（`--ink` #3A2419），`member_b` 永遠是橘色（`--accent` #E08856）**：兩個顏色已經是 `FutariMark` 愛心 icon 的兩瓣，這版把同一份 brand token 跨頁面套到所有頭像。先前是 viewer-relative —— 自己看自己永遠是某一色，看對方永遠是另一色，但雙方各自打開 Futari 看到的「自己 / 對方」恰好相反，跨裝置截圖比對會錯亂。改成絕對角色之後，兩個人在任何頁面看到同一個成員的頭像都是同一個顏色。
- 影響範圍涵蓋 BrandHeader / BalanceHero / 支出列付款人頭像 / PayerToggle / IncomeSheet recipient toggle / Settings 成員列表 / SoloBanner 佔位頭像 / 月度回顧編輯器與過去訊息，13 個 callsite 全部對齊。

#### 支出列拿掉「分擔的我」徽章（PR #240 closes #239）
- **支出列右上不再顯示「我 $X」/「對方 $X」徽章**：Futari 是單人視角的 app，每列已經有「你付」/「對方付」+ 金額 + pending badge，再多一塊「我這份是多少」的小徽章是冗餘訊息，視覺也讓 row 變擠。拆掉之後 row 回到純粹。資料層沒動——`split_type` / 比例還在，未來如果決定再呈現會走另一個位置。

#### 守護被保人支援自己/對方（PR #245 closes #237）
- **被保人 picker 補上「我」和「對方」兩個選項**：人身保險 / 旅平險 / 失能扶助這些常見的「被保人 = 自己或對方」情境，原本只能當成 freeform 文字填，FK 接不回 group 成員。這版把 schema 早就埋好的 `insured_user_id` 接到 UI，picker chip row 在現有的 Child 愛物 chips 與「自行輸入」之間多出「我」+「對方」（solo mode 隱藏「對方」）。
- **四個來源互斥，列卡與詳情頁優先顯示成員 displayName**：被保人四個來源（自己 / 對方 / 孩子愛物 / 自行輸入）UI 上互斥，選任何一個都把其他三個清空；action 層 `resolveInsuredFields()` 以同樣的 precedence（孩子 > 成員 > 文字）再防一層，DB 永遠只留一份真相。InsuranceListItem 與 SavingsView / InsuranceDetailClientLegacy 顯示時依同樣順序選 displayName。

### 技術變更

- **TypePicker 移除保險 + 守護 FAB 跳過 TypePicker**（PR #241 #236）：`TypePicker.tsx` 從 `SECONDARY_TYPES` 拿掉 `'insurance'`；`AssetSheet/index.tsx` 對 `initialType='insurance'` 的開啟流程跳過 TypePicker、直接 render `InsuranceSheetBody`。Server-side `createInsurance` 仍 throw `guardian_disabled` 作為防線。Edit flow 不動（`/assets/[id]` 對既有保單照常編輯）。詳見 [guardian-design.md](docs/superpowers/specs/guardian-design.md) 的「為什麼保險不在愛物 TypePicker」取捨小節。
- **Dashboard 收入模式 filter wire**（PR #242 #235）：`Dashboard.tsx` 拿掉 `mode === 'expense' &&` gate；`DashboardFeed` 的 income loader 改 `useMemo` 包進元件內，closure 帶住 filter ref，filter 變動時 ref 重建——`TransactionFeed` 既有的 filter-change refetch effect 自動接走。同 effect 順手擴成「有 custom loader 時 `loader(null)`、否則才走 cash-only `loadMoreTransactions`」；income 永遠 settled，`status='pending'` 透過既有 `cutAll` 規則 drop，無害。詳見 [structured-filter-design.md](docs/superpowers/specs/structured-filter-design.md) 的 lite mode 段落。
- **`Avatar` API: viewer-relative `who` → absolute `memberRole`**（PR #243 #238）：`Avatar.tsx` 的 prop 從 `who: 'M' \| 'T'` 換成 `memberRole: 'a' \| 'b'`，`bg` 直接讀 `--ink` / `--accent` brand token；`MemberContext` 加 `whoToMemberRole(who, viewerIsA)` helper 給仍以 viewer 視角思考的 callsite 用。13 個 callsite 全部更新；SoloBanner 的佔位頭像顯式設為 `memberRole='b'`（缺席的伴侶概念上 = member_b）。
- **`CompactRow` 移除 myShare 計算 + i18n key 清掉**（PR #240 #239）：刪除 `delta` / `myShare` / `showMyShare` / `myShareColor` derivation 與徽章 render；移除 4 語的 `compactRow.myShareLabel` key + zh-TW 的 shared interface 宣告。data layer 完全不動。
- **被保人接上 `insured_user_id` FK**（PR #245 #237）：`insurance_details.insured_user_id` 與 `insured_type='user'` discriminator 早就在 schema 內、`leaveGroup` 也已經依 `insured_user_id` 把保單帶走，但 form 一直沒 write path——這版補上**不需要 migration**。`actions/asset.ts` 新增 `resolveInsuredFields()` 把三個來源（child / member / text）收斂成一份正準，`assertInsuredUserInGroup()` 守 member FK 只能是 `member_a` / `member_b`；`InsuranceSheetBody` picker 加「我 / 對方」buttons，state 改成三個互斥 source；queries 加 `insuredUserProfile` LEFT JOIN 撈 displayName 給列卡與詳情頁。
- **Doc keeper pass**（commit 1 of release PR）：`guardian-design.md` Surface 表 TypePicker 行更新 + 新增「為什麼保險不在愛物 TypePicker」取捨段；`structured-filter-design.md` shipped_in 追加 v0.16.1 #235、lite mode 段落補 Dashboard 雙 mode parity。

## [0.16.0] - 2026-05-13

主題：**守護成為自己的模組．物品也記得進來．設定頁長出新分組**——v0.15.2 才把保險從愛物清單切到「守護」tab，這版直接把守護升格為獨立模組：per-group beta flag 控制可見性、單一 `canAccessGuardian()` 是將來付費層 cut-over 唯一要動的地方、beta 關掉時用一張友善的 GatedView 而不是 silent fallback。同期愛物模板系統 v1 ship 出「物品」這第七種 type，相機、單車、紀念物這些只想被記得、不需要任何後端行為的東西終於有地方去。設定頁重新分組成 帳本 / 成員 / 個人 / 應用 / 資料 / 守護 / 離開帳本，每個 toggle 都長在它該長的層級裡；篩選器愛物 chip 也按類型分成 sub-section，可以一鍵「全選車輛」「全選生命」。順手把 v0.15.0 那條 pending balance bug 也收掉。

完整 diff：[v0.15.3...v0.16.0](https://github.com/redtear1115/oikos/compare/v0.15.3...v0.16.0)

### 使用者可見變化

#### 守護模組獨立化（PR #225 closes #220 #221、PR #229 closes #227）
- **守護從愛物頁升級為獨立模組 + per-group Beta toggle**：保險不再是「愛物頁的另一個 tab」，而是「將來付費才能用的工具」的第一張卡。新帳本預設關閉；在 設定 → 守護（Beta） 一鍵打開，TabBar 的「守護」tab、TypePicker 的保險選項、`/records` 篩選器的守護 sub-section 同時出現。group-level flag 保證兩人視野永遠一致。
- **Beta 關掉時用 GatedView 取代 silent redirect**：先前 `/assets?tab=guardian` 會默默 fallback 回愛物 tab，`/assets/<insurance-id>` detail 頁會被 redirect 到 dashboard——關掉後分享連結 / 書籤 / 既有保單看起來像消失了。改成在原位顯示「守護目前是 Beta，到設定打開」一張溫和的卡，加 CTA → 設定。資料安全感維持、用戶知道東西還在。

#### 愛物模板系統 v1：物品（PR #226 closes #222）
- **TypePicker 加第七個選項「物品」**：相機、單車、紀念物這種「只想記得、不需要任何後端行為」的東西終於有地方去——選「物品」、填名稱 + 備註，就結束。**舊 6 種愛物（車 / 房 / 孩子 / 寵物 / 植物 / 保險）的建立與編輯流程完全沒變**。
- **愛物列表新增「物品」section**：與「財產 / 生命 / 守護」並列分組，每種愛物都有自己的光。

#### 設定頁重新分組（PR #228 closes #91）
- **設定頁按心智模型分成 7 個 section**：帳本（含分攤比例，從個人移過來——它本來就是 group 設定）→ 成員 → 個人（只剩 viewer-only 偏好）→ 應用（加到主畫面 / 語言 / 離線瀏覽，全 device/app 層級）→ 資料（定期收入 / 定期支出 / 過去的時光 / 匯出 / 資料安全）→ 守護（Beta）→ 離開帳本。每個 toggle 都長在它該長的層級裡。

#### 篩選器愛物分組（PR #230 closes #223）
- **`/records` 篩選器愛物 chip 按類型分 sub-section**：車輛 / 房子 / 生命（孩子 + 寵物 + 植物）/ 物品 / 守護 五個 sub-section，每個開頭一顆「全選」chip 可以一鍵把該類愛物全選 / 全取消，其他類不受影響。「我這個月所有車的支出」「最近半年所有生命的紀錄」終於不必逐個點。

#### 補修
- **「結算後」projection view 不再讓你按結算**（PR #224 closes #208）：先前在 結算後 view 按「結算」會把 settled + pending 的浮報金額帶進結算單，造成 `GroupBalance` cache 偏離 `±pendingDelta`，連續按下還會雪球（觀察到 3,610 → 36,103,610）。Fix：projection view 隱藏結算按鈕；想結算回到 現在 view（吻合 cache 的 settled-only 數字）。

### 技術變更

- **`OikosGroups.guardian_beta_enabled boolean NOT NULL DEFAULT false`**（PR #225 #220）：migration `0036_guardian_beta_flag.sql`；新 helper `lib/guardian.ts#canAccessGuardian(group)` 是唯一閘門，將來付費層只改該函式（`return hasSubscription(group) || group.guardianBetaEnabled`），所有 callsite 自動受益。`toggleGuardianBeta(enabled)` server action 透過 `requireViewerGroup()` 限定 group member 操作。
- **GatedView pattern**（PR #229 #227）：新增 `app/(dashboard)/_components/GatedView.tsx` + `InsuranceGatedClient.tsx`；`AssetsListClient` 對 `?tab=guardian` 而非 silent fallback、`/assets/[id]/page.tsx` 對 insurance asset 改 render Gated client 而非 `redirect('/dashboard')`；`createInsurance` server action 仍 throw `guardian_disabled` 作 defence in depth。
- **`asset_type` enum 擴充到 7 值 + `asset_template_key` enum + `Assets.template_key` + `Assets.template_fields jsonb`**（PR #226 #222）：migration `0036_asset_templates.sql`；舊愛物（`template_key IS NULL`）走原有 type → 子表路徑，模板愛物（`template_key IS NOT NULL`）一律 `type='item'` 走 `TemplateSheetBody` / `TemplateAssetDetailClient`，不接任何既有自動化（無 FuelLog 雙寫 / 無 InsuranceDetails / 無 cron）。v1 只宣告 `general` 模板（無欄位）；validator 已實作 text / number / date 三型別分支供未來模板擴充。
- **Settings UI 重組**（PR #228 #91）：i18n key `sectionDevice` → `sectionApp`（4 語同步），「分攤比例」block 從個人 section 搬到帳本 section、「加到主畫面 / 語言 / 離線瀏覽」收進新的應用 section。
- **FilterSheet 愛物 chip 分組**（PR #230 #223）：純 UI 層擴充，不動 URL / 資料模型 / SQL；「全選」chip 把該組 asset uuid 全部加進現有的 `fAssets` Set（語意冪等）。Share link 保留 snapshot 語意——之後新建同 type 愛物不會自動納入對方視圖。新增 i18n key `filterSheet.assetGroupSelectAll` + `filterSheet.assetGroup.{car,house,living,item,coverage}`（4 語）。
- **`isProjectionView` flag gates `canSettle`**（PR #224 #208）：`useBalanceWithPendingToggle` 派生 `isProjectionView = includePendingView && hasPending`；單一 derived flag，blast radius 為零（沒動 `debtAmount` / `createSettlement` 語意）。
- **Doc keeper pass**（commit 1 of release PR）：新增 `guardian-design.md`（守護模組獨立化的 WHY、`canAccessGuardian()` cut-over 計畫、GatedView vs silent redirect 取捨）；`aibutsu-design.md` 加 v0.16.0 chips；`product-design.md` schema 主要 tables 補 `guardian_beta_enabled` / `template_key` / 7 個 asset_type + spec links 補齊到所有 tracked spec；`CLAUDE.md` Domain Model 速查更新。

## [0.15.3] - 2026-05-13

主題：**章節邊界長進結構裡．過去章節變唯讀 + 投資型保單帳戶價值**——v0.15.0 才剛建立的關係章節（epoch）框架，這版把「pin 在過去章節時還能編輯紀錄、結果整筆從過去章節人間蒸發」這條 bug 收掉，並把背後的 read/write 兩端 epoch boundary 變成型別防呆，讓「transaction 完整歸屬於某段 epoch」從靠記憶變成結構性保證。同期把 v0.9.0 的儲蓄險詳情頁延伸到「投資型保單」家族——新增目前帳戶價值欄位，並讓保險可以自動產生 RecurringIncome 規則，滿期金 / 分紅金不再需要每次手動建。

完整 diff：[v0.15.2...v0.15.3](https://github.com/redtear1115/oikos/compare/v0.15.2...v0.15.3)

### 使用者可見變化

#### 過去章節 read-only（PR #207，closes #194/#195/#197/#198/#199/#200/#201/#202/#206）
- **過去章節整段變唯讀**：pin 在 past epoch 時，所有 transaction（cash / income / settlement / fuelLog）的編輯與刪除按鈕都隱藏；想動就回到當前章節。設計理由：過去章節是「已經發生的歷史」，不該被改寫；同時擋住「在過去章節點編輯 → 新 row 落到當前章節 window → 在過去章節 view 整筆紀錄消失」的 ghost migration bug。
- **Dashboard 本月進帳數值修正**：BalanceHero「本月進帳」總額先前在收錄模式（pin 在 past epoch）會吃進其他 epoch 的進帳，造成跨章節數字漂移；修掉後總額只算當下 view 的章節範圍。

#### 投資型保單帳戶價值 × 自動化（PR #212，closes #166）
- **投資型保單詳情頁顯示「目前帳戶價值」**：savings framing 新增一條 informational row，承載「投資型保單的當下市值」——與累計繳 / 已拿回兩條主軸數字並排但不混入，使用者根據對帳單自行更新。傳統儲蓄型保單沒這個概念，欄位空白不顯示。
- **保險可自動產生定期收入規則**：建立保單時若有設定預期滿期金 / 分紅，系統會自動建一條 `RecurringIncomeRule`，到期日由 cron 產 pending 卡片，使用者一鍵 confirm 落 IncomeTransaction；滿期金 / 分紅金不再需要每次手動建紀錄。

### 技術變更

- **`epochWindow` 型別防呆 across all transaction reads**（PR #207）：所有 transaction-class query（`listIncomesPaged` / `listIncomeMonthSummary` / `monthlyIncomeStatsByCategory` / 等價的 cash / settlement / fuelLog 查詢）改為 required `epochWindow` 參數，從 caller 強制傳入；先前 `listIncomeMonthSummary` 漏接 `epochWindow` 造成的 Dashboard 數值漂移從根本擋掉。
- **Write-side past-epoch guard**（PR #207）：`createTransaction` / `editTransaction` / `softDeleteTransaction` / `createIncome` / `editIncome` / `softDeleteIncome` / settlement / fuelLog 等所有 write server actions 加 past-epoch cookie 檢查，pin 在過去章節時直接 throw；同時 UI 收掉編輯/刪除按鈕作為第一道 guard。
- **`InsuranceDetails.account_value` 欄位新增**（PR #212，#166）：migration `0035_insurance_account_value` 加 `account_value integer NULL`（純加 nullable column、metadata-only DDL）；只對投資型保單 (`insuranceType === 'savings'` 且 isInvestmentLinked) 顯示。
- **`RecurringIncomeRules.source_type` / `source_ref_id` 跨 feature 來源欄位**（PR #212，#166）：在 `RecurringIncomeRules` schema 加上「這條規則是哪個 feature 自動產的」欄位，保險自動建立的規則會標 `source_type='insurance' / source_ref_id=<asset_id>`；後續刪除保單時可連動清掉對應規則。
- **Doc keeper pass**（PR #217）：epoch-readonly-design.md 從 design → shipped；recurring-income-design.md 補 v0.15.3 註腳；CLAUDE.md spec table 新增 epoch-readonly-design.md 一列。

## [0.15.2] - 2026-05-13

主題：**問答、跨章節與守護的下一步**——v0.15.0 才剛上線的關係章節（epoch）延伸成可跨 group 翻看的「過去」；保險脫離愛物清單獨立為「守護」tab、被保人也可以關聯 Child 愛物，讓保險紀錄真的長進了關係裡；PartnerQuiz 雙人異步問答 ship 出第一個小儀式；篩選器 v2 把金額範圍 + status 也納進來；底下三條 refactor（SQL predicate / AssetSheet 拆分 / auth/group 樣板統一）為之後的 v0.16 多幣別工作打底。

完整 diff：[v0.15.1...v0.15.2](https://github.com/redtear1115/oikos/compare/v0.15.1...v0.15.2)

### 使用者可見變化

#### 雙人陪伴
- **PartnerQuiz 雙人異步問答**（PR #187，closes #163）：兩人各自輪流回答關於對方的問題，答完才比對；想了解伴侶又不想直接問的小儀式。

#### 守護愛物升級
- **愛物頁加「愛物 / 守護」tab，保險併入守護**（PR #184，closes #178）：保險不再混在愛物清單裡，獨立為守護 tab，視覺與語意都跟其他愛物區分開。
- **保險被保人關聯 Child 愛物**（PR #180，closes #167）：保險詳情可指定被保人為自己 group 的 Child 愛物，`insured_child_id` wiring 建立 Child ↔ 保險的雙向關聯。

#### 紀錄與篩選
- **`/records` 結構化篩選器 v2：金額範圍 + status**（PR #185，closes #165）：篩選器加上金額區間（min/max）與 `settled / pending` status；URL-synced 可分享。
- **Balance toggle：settled vs include-pending**（PR #179，closes #164）：可切換 balance 只看已結算的金額，還是把 pending 簽帳也計入；對「信用卡這個月會扣多少」有具體判讀。
- **`/past-times` 跨 group 章節歷史**（PR #181，closes #141）：翻過去章節時不再被當前 group 鎖住，跨多段關係章節都看得到。
- **CompactRow 零分擔時 hide「我 $XXX」chip + 染色回復**（PR #182）：分攤 0% 那側不再硬塞 0 元 chip；分擔金額顏色從 PR #148 的灰恢復為支出紅 / 收入綠，掃讀時方向感回來。

### 技術變更

- **`PartnerQuizSessions` + `PartnerQuizAnswers` schema**（PR #187，#163）：新增雙人異步問答的 session + answer 兩 table，RLS + Realtime publication；migration `0034_partner_quiz`。
- **`InsuranceDetails.insured_child_id` FK → Assets**（PR #180，#167）：限制被保人指向同 group 的 Child 愛物；同步覆蓋 `validateInsuranceInput` 與 server actions。
- **`/records` filter schema 擴充**（PR #185，#165）：URL search params 新增 `amount_min` / `amount_max` / `status`；server-side WHERE clause 同步擴。
- **Refactor: SQL predicate helpers + `ListPagedOptions`**（PR #192，closes #188）：把分散在 query 層的 paged + filter 範本抽成共用 helpers；新增 `lib/db/queries/_predicates.ts` + 兩支 unit test。
- **Refactor: 統一 action / page auth/group 樣板 + 抽 revalidate helper**（PR #193，closes #190）：新增 `lib/auth/viewer.ts` + `lib/revalidate.ts`；server actions / pages 不再各自重複寫 auth + group lookup boilerplate。
- **Refactor: `AssetSheet` 拆成 per-type `*SheetBody`**（PR #191，closes #189）：原本一個巨大 sheet 拆成 Car / House / Child / Pet / Plant / Insurance 各自 body + 共用 shared/* 元件；之後新增愛物 type 不必動主 sheet。

## [0.15.1] - 2026-05-12

主題：**陪伴每處小細節更貼手．光的指認也更一致**——一輪跨頁 UX polish（Dashboard / Records / Assets list / 愛物詳情 / AddSheet 全家族），把這幾週累積的 UI/UX 審查回饋一次處理掉；底下用一份分類色 design token 把愛物與類別色彩收斂為「每個分類一個主色，chip tint 由主色推得」，鎖進「同一分類在哪都長同一個 hue」的承諾。

完整 diff：[v0.15.0...v0.15.1](https://github.com/redtear1115/oikos/compare/v0.15.0...v0.15.1)

### 使用者可見變化

#### 設計系統 / Token 收斂
- **分類色 design token 收斂**（PR #168，closes #149）：`lib/categories.ts` / `lib/incomeCategories.ts` 改為每個分類只宣告一個 primary `color`，chip 用的 `tint` 透過新增的 `lib/colors.ts#lightenHex()` deterministic 推導；`chart` 設為 `color` 的 alias，舊 callsite 不動。`globals.css` 同步把 `--asset-tint-*` 改寫成 `color-mix(in srgb, var(--asset-color-*) 35%, white)`，視覺值與先前一致但 6 個 asset type 也具備 `--asset-color-*` 主色 token，未來愛物 donut 可以對得上 list rail。設計理由：解決使用者在 feed icon 與 donut slice 之間缺乏顏色辨識的問題——同一分類在哪都長同一個 hue family。

#### Dashboard（PR #171，closes #146/#147/#148/#150）
- **BalanceHero 金額語意化**（closes #146）：對方欠你 → `--credit` 綠；你欠對方 → `--debit` 紅；平 → 中性；collapsed / expanded 兩種狀態都套用。
- **Settle 按鈕加標籤 + tap target ≥ 44px**（closes #147）：⇄ icon 旁加「結算 / Settle / 结算 / 精算」label；BalanceHero / MonthlyStatsView 共用的 `ToggleButton` 透過 `::before` 把點擊範圍擴到 44×44px，視覺環維持 28px。
- **CompactRow 常駐顯示「我的負擔」**（closes #148）：每筆紀錄都顯示「我 $XXX / You $XXX / 自分 $XXX」，從原本染色 delta 改為清楚的個人負擔金額；i18n key `compactRow.myShareLabel` 4 語譯齊。
- **Records feed 篩選按鈕降權**（closes #150）：標題列「篩選 ›」改 `font-normal` + `var(--ink-3)` 讓 section title 領主；active filter 小點仍保留作為視覺提示。

#### Records 頁 polish（PR #173，closes #151/#152/#153/#154）
- **月份切換箭頭 tap target ≥ 44px**（closes #151）：MonthSwitcher 的 `‹` `›` 按鈕從 36px 放大到 44px，符合 WCAG / iOS HIG 最小可點區域；容器 vertical padding 同步調整讓 pill 視覺高度維持原樣。
- **Donut chart 中央顯示總金額 + slice 切換**（closes #153）：先前總金額在圓圖下方一行小字，現在搬進 donut 圓心（serif 大字 + 標籤），第一眼即可讀；點任一 slice 或對應的 detail bar，圓心切換成該分類的金額與名稱，未選中的 slice dim 至 0.35 opacity。新增 i18n key `records.stats.donutCenterTotal`（4 語），移除已不再用到的 `records.stats.total`。
- **統計與 feed 之間視覺分隔強化**（closes #152）：stats section 的標題 weight 從 `font-medium` 升為 `font-semibold`；同時 #154 的 RecurringSectionCard 落在 stats 與 feed 之間，自然成為 section break。
- **「定期」入口從 popover 升為 section card**（closes #154）：原本標題列右側的 ⚙ 定期 popover 對 v0.13.0 才剛上線的功能來說太隱密，現在改為 stats 區塊與 feed 之間的橫向 section card，「定期支出」與「定期收入」各佔一個 44px 高的 tinted pill 連結；移除 `RecurringMenu` 組件與 `records.recurringMenuLabel` / `records.recurringMenuAriaLabel` i18n keys。

#### Assets list 頁 polish（PR #174，closes #158/#159/#160）
- **CarHeroCard 簡化**（closes #158）：list 卡片拿掉內聯平均油耗 stat，只放本月 / 累計 NT$（並排兩格），讓 list 維持 finance summary 定位；油耗詳情在 detail hero 已經有了。
- **InsuranceListItem 加付款倒數 badge**（closes #159）：多期保單（savings + multi-year protection）依 `startsAt + payCycle`（年 / 半年 / 季 / 月）計算下次扣款日，預設 `min(reminderDaysBefore, halfCycle)` 天內亮橘色 `繳費剩 N 天`；月繳保單因為門檻自動收斂到 halfCycle 不會永久亮燈，年繳走 30 天提醒。Savings 已滿期 / 單年期保單維持原本「繳費期滿 / 到期」徽章不重複。
- **Section headers 更清楚**（closes #160）：愛物分類標題改 serif `fs-button` 字級 + 各組 type tint 色點（house / child / insurance），取代原本不顯眼的 `xs ink-3` caption。

#### 愛物詳情 header 統一（PR #175，closes #161）
- **AibutsuHeader 採用 settings sub-page 三欄佈局**：`[← 返回] | [置中標題] | [編輯 ✎]`；移除 6 個 aibutsu 子頁面（Child / Pet / Plant / House / InsuranceLegacy / SavingsView）的 inline `AssetSwitcher`，跨愛物切換改回 /assets。Car detail 仍維持 AssetSwitcher。設計理由：原本 back arrow + AssetSwitcher chevron + edit pencil 三件擠在左邊，加上標題本身又是 dropdown trigger，跟 app 其他頁面慣例完全不一致；改成三欄佈局與 /settings 對齊。

#### AddSheet 家族 polish（PR #170，closes #155/#156/#157）
- **CategoryPicker overflow 提示**（closes #155）：分類 chips 右側加 fade overlay，讓使用者知道還能往右滑看更多。
- **Status 文案更清楚**（closes #156）：「已扣款 / 待扣款」改為「已付清 / 信用卡待扣」（4 語同步），helper text 與 CompactRow pending badge 一起對齊；「信用卡待扣不會算進兩個人的結算」這句話直接寫出來。
- **iOS home indicator 安全區**（closes #157）：AddSheet / IncomeSheet / SettlementSheet 底部 24px spacer 改 `calc(24px + env(safe-area-inset-bottom))`，notes textarea 與刪除按鈕不再被手勢列遮住。

#### Settings（PR #169，closes #162）
- **分攤比例 slider 10% snap**（closes #162）：把預設分攤比例 slider 從 step=1（1–99）改成 step=10（10–90），加上 `<datalist>` tick marks 視覺化 snap 點。設計理由：使用者實際需要的是 50/50、60/40、70/30 這類整數比例；step=1 看似彈性但實際讓人很難精準停在常用值。

### 技術變更

- **`lib/colors.ts` 新增**（PR #168）：`lightenHex(hex, amount = 0.35)` deterministic helper；對 malformed hex 在 module init 時 throw 而非 render 時 silently 壞掉。`Category` / `IncomeCategory` 介面新增 `color` field，`tint` 從 source 拿掉改為運算結果；callsite 透過 `chart` alias 維持 backward compatibility，無 churn。
- **`lib/insurance.ts` 新增 payCycle helper**（PR #174）：`payCycleMonths()` 把 enum 翻成月數；`computeNextPaymentDate(startsAt, payCycle, today)` 計算下一次扣款日，含月底 clamp（1/31 + 1 月 → 2/28）。9 個 unit tests 在 `__tests__/insurance-next-payment.test.ts`。`payCycle` 從 `listAssetsForGroup` query 一路串到 `InsuranceListItem.data`，**無新欄位**（`pay_cycle` 早已存在）。
- **`leaveGroup` 整合測試補完**（PR #172，closes #139）：新增 `__tests__/actions/leaveGroup.noOwnedAssets.test.ts` 覆蓋 viewer 沒有 owned 愛物時的 leave 路徑——驗證 epoch 正確關閉、`current_epoch_started_at` 更新、`OikosGroups.member_a/b` swap 邏輯。
- **`AssetSwitcher` 從 6 個 aibutsu 子頁面下架**（PR #175）：`page.tsx` 不再把 `allAssets` 透過 props 串給 5 個 aibutsu DetailClient + `SavingsView`；component 本身保留（car detail 仍 inline 使用）。`tests/PetDetailClient.test.tsx` 同步移除 AssetSwitcher mock。
- **CLAUDE.md domain model + worktree 工作流速查補完**（PR #176）：新增 entity 關係圖、Asset 沒有 owner_user_id 的設計理由、Epoch 是「時間軸 slice」而非 entity 的說明、worktree 命名與生命週期。CHANGELOG 兩小節格式（使用者可見變化／技術變更）正式定為 contract，每版皆需依此分節。

## [0.15.0] - 2026-05-12

主題：**離開也保留陪伴．pending 收斂**——把「兩人關係未必恆久」這件事正式收進 schema 與 UX：member_a/b 可換位、可離開、過往 chapter（epoch）不消失只是分章；同時把日常記帳的「賒帳 / 待扣款」獨立成 record status，不再混入 balance；外加保險愛物強化、PWA 離線回前景自動刷新、`/records` 結構化篩選器與 Inbox 概念註解。

完整 diff：[v0.14.2...v0.15.0](https://github.com/redtear1115/oikos/compare/v0.14.2...v0.15.0)

### 使用者可見變化

- **Pending（待扣款）紀錄**：信用卡簽完未過帳、預授權、IOU 可標為待扣款，feed 用低 opacity + 「待扣款」badge 顯示，不會混進兩人 balance（PR #122，closes #49）。
- **`/records` 結構化篩選器**：date range × 愛物 multi-select × 收入分類 multi-select，URL-synced 可分享連結；header 排版重整、「⚙ 定期」收進 popover（PR #124，closes #50）。
- **離開兩人帳本回到 solo mode**：Settings danger zone 入口 + 4 卡片 flow（資料分配 → 確認意願 → swap proposal → final confirm），過去的紀錄不消失只是收進「過去」（#79，PRs #123 / #130 / #135 / #134）。
- **`/past-times` 頁**：翻回過去的關係章節（PR #135）。
- **`AibutsuHintCard` mode-aware**：solo 模式不再顯示「邀請伴侶」勾子，改為陪伴繼續記（PR #134）。
- **對方離開後 dashboard 顯示「partner-left」卡片**；回 solo 後顯示「welcome-solo」卡片邀請繼續一個人的紀錄（PR #134）。
- **保險愛物強化**：險種家族 type-specific badge / 進度條 / framing（PR #129，closes #127）；單年期保單可自訂續保紅燈天數（預設 30）；儲蓄／還本險加「分紅」與「生存金」入帳分類並反映在累計拿回（PR #133，closes #132）；要保人關聯 Profile 自動同步 displayName + 頭像（PR #143，closes #142）。
- **iOS PWA 切回前景自動 refresh**：不用手動 pull-to-refresh 才能看到新紀錄（PR #125 / #128，closes #126）。
- **保險詳情頁進度條 hydration warning 修掉**（PR #136，closes #137）。

### 技術變更

- **`record_status` enum**（`'settled' | 'pending'`）+ `CashTransactions.status` 欄位；pending 不計入 `GroupBalance`，預設 `'settled'` 無需 backfill。
- **Chapter slicing（GroupEpochs）**：新增 `GroupEpochs` + `GroupBalanceEpochs` 兩 table；`cashTransactions` / `settlements` / `incomeTransactions` 全 epoch-scope 化；`/records` / stats / dashboard 預設只看當前 chapter。`OikosGroups` 加 pending swap 三欄 + `current_epoch_started_at`；新增 `swapMembers()` / `leaveGroup()` server actions。
- **`getActiveGroupForUser()` 收斂**（commit `31c3d80`）：分散的 active-group lookup 整合成單一 helper，為 epoch / swap / leave flow 提供 viewer-aware 一致解析。
- **Single-open-epoch invariant**（commit `f0552c6`）：accept invitation + layout pick 兩條路徑強制每 group 只一個 open epoch。
- **Inbox layer 概念註解**（PR #144，closes #101）：新增 `inbox-layer-design.md` spec 統一非使用者親手建立的資料邊界；v0.16.0 才實作 schema migration + UI。
- **保險 schema 強化**：`InsuranceDetails.reminder_days_before` (integer, 預設 30)；`policy_holder_user_id` (FK to `Profiles`)；要保人離開 group 可帶走政策、被保人保留 free text。
- **Migrations 0028–0033**：含校正性 migration 0032 修 0029/0030 把舊紀錄誤踢出 current epoch 的 bug（`DEFAULT now()` sentinel issue）。
- **Drizzle raw SQL casts 對 Date 參數**（commit `f249729`）：epoch Date 參數 stringify 後再 cast 避免 prepared-statement type 推斷錯誤。
- **Insurance subtype tint revert**（commit `52087d9` → `15b7564`）：嘗試 framing-based subtype tint 後改回 type-tinted border + avatar。
- **Solo-mode inline 新增按鈕移除**（commit `aeb8470`）：dashboard solo mode 改由 FAB 統一入口。

## [0.14.2] - 2026-05-11

主題：**紀錄可以更貼手**——v0.14.1 上完之後把當時暫時 revert 出來的兩件小事 ship 回去。

完整 diff：[v0.14.1...v0.14.2](https://github.com/redtear1115/oikos/compare/v0.14.1...v0.14.2)

### 使用者可見變化

- **AddSheet 描述自動完成**：輸入描述時即時 surface 同帳本歷史紀錄做 inline 建議，點選即填入（PR #114，closes #113）。
- **`/records` 月度統計 drill-down**：點 stats card detail bar（分類列 / 愛物列 / 收入分類列）直接把 transaction feed 套上對應 filter，配 `DrillFilterChip` 顯示「目前 filter 條件 + 一鍵清除」；同 row 再點清除（idempotent toggle）（PR #116，closes #102）。

### 技術變更

- 兩個 PR 都在 v0.14.1 release 時暫時 revert，本版 revert-the-revert 重新接回。
- 新增 `lib/db/queries/transactions.ts → suggestDescriptions()` query；`lib/drill.ts` 把 stats row `data-*` 翻成 feed `ResolvedTxnFilter`。
- 無 schema 變動。

## [0.14.1] - 2026-05-10

主題：**分擔可以不對半，陪伴的細節再收一輪**——v0.14.0 上完之後幾天衍生出的修補與小功能。

完整 diff：[v0.14.0...v0.14.1](https://github.com/redtear1115/oikos/compare/v0.14.0...v0.14.1)

### 使用者可見變化

- **依比例分（weighted split）**：自訂 1–99 整數分擔比例取代固定對半（剛好 50 顯示「平分」）；Settings 加 group 預設比例 slider（PR #115，closes #90）。
- **`/records` FAB 跟 tab 切色 + 切意義**：全部 / 支出 tab 維持深咖啡 ink 色開 AddSheet；收入 tab 變薄荷綠 accent 色開 IncomeSheet（PR #112，closes #110）。
- **Dashboard hero 可收起 + 排版穩固**：收合狀態 single-line 顯示我/對方欠款；settle ⇄ 按鈕固定在 +/− 左側不再跳位（PR #111，closes #109）。
- **prod Service Worker 註冊失敗修復**：Settings 離線開關被卡住的全 prod 使用者解開（PR #108，closes #107）。

### 技術變更

- **`split_type` enum 加 `'weighted'`**；`OikosGroups.default_split_ratio_a` / `CashTransactions.split_ratio_a` / `RecurringExpenseRules.split_ratio_a` / `PendingExpenseOccurrences.split_ratio_a` 全部加欄位（Migration 0027）。Postgres `ALTER TYPE ... ADD VALUE` 不能跑 in transaction，drizzle migrator 預設逐句執行即可。
- **Balance 算法**：付款人 A → B 欠 `ceil(amount × (100−ratioA) / 100)`；付款人 B → A 欠 `ceil(amount × ratioA / 100)`。`half` enum 保留作為 legacy，新舊紀錄都正確 render。
- **`/sw.js` Cache-Control: no-store**（`next.config.ts` headers）：Vercel CDN 把 SW 回 304 cache 導致 `register()` 靜默失敗。
- **延期到 v0.14.2**：PR #114（AddSheet 描述自動完成）與 PR #116（stats drill-down filter）在 main 上以 revert commits 暫時抽離。

## [0.14.0] - 2026-05-10

主題：**沒有訊號的時候，也還看得見**——把這個月攤開來一起看，網路斷了之後也看得見最近一次連線的樣子。

完整 diff：[v0.13.1...v0.14.0](https://github.com/redtear1115/oikos/compare/v0.13.1...v0.14.0)

### 使用者可見變化

- **`/records` inline 月度統計**：sticky 月份切換器同時控 stats card + transaction feed；三個 tab 各一張 donut 卡（全部 = 收支統計、支出 = 分類 / 愛物 toggle、收入 = 收入分類）（PR #93，closes #22）。
- **雙人月度回顧儀式**：每月 1 號 Taipei 00:05 自動凍結上月 snapshot；`/review/[YYYY-MM]` 4 張卡片 carousel + 兩人各自的「給下個月的我們」留言區（800ms debounce autosave、200 codepoint cap、月底鎖為 read-only）（PR #94，closes #44）。
- **離線瀏覽 PWA（opt-in）**：Settings 開啟後斷網仍可看最近一次連線的 dashboard / records / assets；離線時頁首顯示 `OfflineBanner`，新紀錄離線後重連會自動 refresh（PR #95，closes #19）。
- **Onboarding 桌面跑版修正**：philosophy cards 不再撐滿大螢幕（PR #98，closes #96）。
- **In-app browser 攔截 + 引導**：LINE / IG / Threads / FB / Messenger / WeChat / Telegram / X / LinkedIn / KakaoTalk 等 WebView 偵測到後 render blocker，提供「複製連結」與 iOS「在 Safari 開啟」按鈕，避免卡在 OAuth + SW + Supabase session 死巷（PR #99，closes #97）。

### 技術變更

- **新 schema**：`MonthlyReviewSnapshots`（denormalised paid_by name / asset names 凍結）+ `MonthlyReviewMessages`（lockable autosave）；`compute_monthly_review_snapshot(group, year, month)` plpgsql function；pg_cron `monthly-review-snapshot` 每月 1 號 16:00 UTC。Migration 0026。
- **Donut 用 inline SVG（~80 行）** 而非 Recharts / Chart.js：mobile bundle 不引入 ~50 KB+ 圖表 lib。
- **PWA 採 Serwist (`@serwist/next`)**，opt-in via Settings（preference 存 `localStorage` 非 Supabase — SW 是 per-device 而非 per-user 能力）；L1 precache app shell、L2 runtime cache NetworkFirst + 3s timeout（不 SWR — oikos 寫入路徑會 `revalidatePath`）；Sign-out 前 `caches.delete('dynamic-v1')` 防 PII 跨使用者。
- **Build script 改 `next build --webpack`**：Serwist 9.x 不相容 Next.js 16 預設 Turbopack production build；`app/sw.ts` 從主 tsconfig 排除（webworker 型別會把 `Navigator` 染成 `WorkerNavigator` 污染整個 client component typecheck）。
- **Snapshot 凍結語意**：軟刪除來源不回頭更新已凍的回顧頁；留言不加密、lock-after-cron 單向不可回頭改。
- **In-app browser blocker 在 root layout** 而非 dashboard layout：i18n 字串以 props 傳入（root layout 沒有 `TranslationsProvider`）。
- **Vercel Analytics + Speed Insights** 接通（commit `10acfe4`）。
- **`RealtimeProvider`** 聽 `online`/`offline` 事件呼叫 `disconnect()` / `connect()` 暫停 reconnect 迴圈。
- **不在 SW 攔截 server actions / 不預先 disable 寫入按鈕**：source of truth 是 server action response、不是 `navigator.onLine`。

## [0.13.1] - 2026-05-09

主題：**啟程之前的鋪陳**——v0.13.0 部署之後夾帶到 prod 的 polish 補上正式紀錄。

完整 diff：[v0.13.0...v0.13.1](https://github.com/redtear1115/oikos/compare/v0.13.0...v0.13.1)

### 使用者可見變化

- **Onboarding 哲學卡**：`sign-in → /setup` 之間插入 `/onboarding` 路由，5 張輕量哲學卡每張一個「光 × 顏色」視覺收尾（① Futari 不會問誰花得比較多 ②進到 Futari 的就是我們共同的 ③薪水進來的那天是兩個人一起感受的 ④保險是一起守護的承諾 ⑤就從第一筆慢慢開始），全部可跳過，看完 localStorage flag 第二次不再顯示（PR #83）。
- **Settings 法律連結修補**：原 `href="#"` 無效連結改為真實 `/terms` + `/privacy`（PR #84）。

### 技術變更

- **AI 協作規則放寬**（PR #85，doc-only）：commit + push 到 feature branch 都自動；main / release 仍 PR-only + protected；`gh pr merge --admin` 仍要明確指令。
- **這版是「補登」而非新部署**：v0.13.0 deploy PR 已把 PR #83 / #84 / #85 一併送上 prod，v0.13.1 release PR 純粹補 changelog + version bump、不再開 deploy PR、prod 不重新觸發。tag 打在 release HEAD（v0.13.0 deploy 的 merge commit）。

## [0.13.0] - 2026-05-09

主題：**陪伴 × 起點 × 定期支出**——兩個人都有自己的第一步、自己的第一筆，再到不必再記住的每月固定。

完整 diff：[v0.12.0...v0.13.0](https://github.com/redtear1115/oikos/compare/v0.12.0...v0.13.0)

### 使用者可見變化

- **邀請流程雙向確認儀式**：A 邀請者在 `/setup` 流程中 name → trust → invite 三步走，讀完三段承諾（加密／可攜／備份）按「這是我希望的」才建立邀請；B 受邀者點連結看到「{name} 已經承諾了這些」+ 同樣三段承諾，按「我也是」才 join（PR #73，#43 Phase E）。
- **第一筆 first-record 理念卡**：每位伴侶各自第一次記帳時出現，per-user 不重複觸發（PR #74，#43 Phase C）。
- **自訂定期支出（mirror 定期收入）**：`/settings/recurring-expense` 規則列表 + 新增/編輯/暫停/恢復/刪除；Dashboard `PendingExpenseStack` 「就這樣 / 改一下 / 跳過」三動作（PR #77 / #78，#18 closes）。
- **AddSheet「改一下」接通**：partial override 改一個欄位即送出，未填欄位 fallback pending occurrence snapshot；race 偵測「對方剛剛確認了這筆」toast（PR #78）。
- **`/records` sticky tab bar 加 inline 入口**：tab=expense → 「⚙ 設定定期支出 →」、tab=income → 「⚙ 設定定期進帳 →」、tab=all 不顯示。

### 技術變更

- **`actions/recurringExpense.ts`** mirror income 形狀：8 個 actions（create / update / pause / resume / softDelete / confirmPending / editAndConfirmPending / skipPending）+ `lib/db/queries/recurringExpense.ts`。
- **與 income 的差異**：rule 帶 `paid_by` + `split_type` + `description` (notNull) 而非 `recipient_id` + `source`；`confirmPending` 在同個 drizzle transaction 內寫 `CashTransactions` + 跑 `recalcGroupBalance`（mirror `createTransaction`，income 沒 balance impact 不需要）。**刻意不對稱**：抽共用層會讓 income 多扛不必要的 transaction overhead。
- **first-record signal 不增加 dashboard query**：`createTransaction` 回傳 `{ id, isFirstTransaction }`，trigger 在 insert path 一次 `count(*) WHERE paid_by = me`；per-user flag 存 `localStorage`（`oikos_first_record_card_seen_{userId}`）。
- **`RealtimeProvider`** 新增 `RecurringExpenseRules` + `PendingExpenseOccurrences` 兩個 event kinds。
- **Breaking**：`ModeTogglePlaceholder.pendingCount` → 拆 `incomePendingCount` + `expensePendingCount`，4 處 callsite 同 PR 替換。
- **`paid_by` 作為 row creator 代理**：CashTransactions 沒 `created_by` 欄位；first-record 場景是「記自己的支出」，代理對暖訊息文案足夠。

## [0.12.0] - 2026-05-09

主題：**陪伴 × 信任**——讓兩個人都安心把日子記下來。

### 使用者可見變化

- **信任宣示頁 + onboarding 信任卡**：`/settings/trust` 三段陪伴感文案（加密 / 可攜 / 備份），不講工程細節而是「連我們自己也讀不到」「我們替你們守著」這類軟性敘述（PR #62，closes #48 Phase A+B）。
- **CashTransactions 共同備註欄位**：AddSheet 日期下方加 multi-line textarea；列表 row 用引號樣式顯示一行（`line-clamp-2`）（PR #66，closes #34）。
- **MiniCalendar 三層導覽**：day → month → year，year view 改 3×4（1 leading overflow + 10 in-decade + 1 trailing overflow），對齊 iOS / Google Calendar pattern（PR #67，closes #65）。
- **CSV 匯出（v1：活躍 CashTransactions）**：Settings 加按鈕，純 client-side `fetch → blob → <a download>`；UTF-8 with BOM + CRLF + RFC 4180 跳脫；分類 + 分攤依 locale 4 語翻譯、誰付的用 display name（PR #70，closes #37）。
- **i18n 補完**：Settings 子頁（coming-soon + invite，PR #64，closes #21）；愛物 detail pages + AssetSheet（PR #69，closes #20）。
- **Solo mode 進帳模式 toggle 失效修復**：`SoloBanner` 漏 forward `mode` / `onChange` 導致 toggle 靜默 no-op（PR #63，closes #61）。

### 技術變更

- **Migration 0025**：`CashTransactions` 加 nullable `notes` text 欄位。
- `validateInviteAcceptance` 改回傳 `InviteAcceptError` code，不再吐 zh-TW 字串；`acceptInvite` race condition 訊息也 code 化由頁面 map。
- `MiniCalendar` props (`value`, `onChange`) 不變，5 個既有 caller 零 break。
- v1 CSV 範圍只匯出活躍 CashTransactions；Settlements / IncomeTransactions / 日期範圍 / Google Sheets OAuth 留後續。

## [0.11.4] - 2026-05-09

### 使用者可見變化

- **愛物 6 種類型分色 tint + 3px 左側 accent rail**（PR #30，closes #28）。
- **儲蓄險「儲蓄」badge**：`InsuranceDetails.insurance_type === 'savings'` 時 subtitle 列顯示 11px monospace badge（PR #30）。
- **`og-image.png` 從 768 KB 壓到 95 KB**：原圖超過社群平台 ~300 KB 抓取上限導致 Twitter / FB 預覽 fallback 無圖；ImageMagick 256-color palette quantize（PR #29，closes #25）。

### 技術變更

- `app/globals.css` 新增六色 CSS vars：`--asset-tint-{house,car,child,pet,plant,insurance}`。
- `listAssetsForGroup` LEFT JOIN `InsuranceDetails` 暴露 `insuranceType`，串到 `AssetListItem`。

## [0.11.3] - 2026-05-08

### 使用者可見變化

- **`/sign-in` 結構化資料 + 完整 SEO meta**：`SoftwareApplication` JSON-LD（`FinanceApplication`、`featureList`、4 語 `inLanguage`）+ keywords + canonical + 4 語 hreflang。
- **`robots.txt` / `sitemap.xml` 改 200 帶內容**（原為 307）：搜尋引擎可正常抓。
- **品牌語意 heading**：Futari 字由 `<div>` 改 `<h1>` + `sr-only` 副標「· 兩個人的家計簿｜伴侶／夫妻共享記帳 PWA」（視覺零變化）。

### 技術變更

- 新增 `app/robots.ts` + `app/sitemap.ts`（Next 16 `MetadataRoute.*`）。
- `middleware.ts` matcher 排除 `/robots.txt` 與 `/sitemap.xml`（原 matcher 漏掉這兩個，被 307→`/sign-in`）。
- `app/layout.tsx` metadata 全面重寫：title / description / keywords (22 個目標長尾詞) / alternates / robots / openGraph / Twitter card。
- **限制**：站內仍只有 `/sign-in` 一個公開可索引頁；要拉 SEO 流量天花板需要日後另開 `/` 公開 landing。

## [0.11.2] - 2026-05-08

### 使用者可見變化

- **冷啟動與切換更輕快**：`/settings` 與 `/records` RSC 並行化、`/assets` batch query、BottomNav 完整 prefetch（典型 5–8 個 asset → `/assets` RSC 預期省 120–560ms）。
- **CSS bundle 瘦身**：字型 weights 刪減後視覺零變化。

### 技術變更

- **`b315565`**：Noto Sans TC 4→3 weights、Fraunces 3→2 weights（Google Fonts 以 unicode-range 切片即使指定 `latin` subset 也帶全部 ~105 個 `@font-face`，單一未用 weight 膨脹 ~25%）；主 font CSS chunk 397 KB → 298 KB raw（-25%）／ 144 KB → 108 KB gzipped。
- **`da9309c`**：`/settings` RSC fetch 並行化（兩組 `Promise.all`）；省短查詢 ~30–80ms 等待。
- **`a46d676`**：BottomNav `prefetch={true}` 預取完整 RSC payload（含資料），保留 PR #2 的 idle gating。Next 16 中 `prefetch={undefined}` 在 dynamic route 上只預取到最近的 `loading.js` 邊界。
- **`2ecfeda`**：`/assets` 新增 `getAssetSummariesBatch`，單一 `SUM ... GROUP BY asset_id` 取代 N×round-trip；詳情頁 single 版 `getAssetSummary` 保留。

## [0.11.1] - 2026-05-08

### 使用者可見變化

- **i18n 4 語架構 ship**：zh-TW / zh-CN / en / ja，cookie-based locale，`?lang=` query param 入口 4 語都正確持久化；日期格式隨語系自動切換（PR #3 / #4 / #6 / #7）。
- **Settings 離線瀏覽 toggle UI ship**（SW 實作留到 v0.14.0）（PR #6）。
- **冷啟動更輕快**：RSC prefetch 不再 4 條同時打、Hero balance 先 paint、feed 後到（PR #1 / #2）。

### 技術變更

- **`middleware.ts` Locale 型別僅 2 語 → 修補為 4 語**：常數抽成 edge-safe 模組 `lib/i18n/locales-meta.ts`（不 import `next/headers`），middleware 與 `lib/i18n/t.ts` 共同匯入。
- **Date helpers 改用 `Intl.DateTimeFormat(locale)`**：`dateLabel` / `weekday` / `monthLabel` 由硬寫中文字串改 `Intl` API；`TranslationsProvider` 新增 `locale` prop + `useLocale()` hook。
- **Pages 改用 `getSession()` 跳過 Auth API 往返**（PR #1）：`middleware.ts` 仍用 `auth.getUser()` 作為 trust boundary；page / layout server component 改用 `getCurrentUser()`（內部 `getSession()`），省每頁 200–400ms HTTP 往返。Server actions 維持 `getUser()`。10 個 page / layout 改寫。
- **BottomNav 延遲 prefetch + Dashboard Suspense 邊界**（PR #2）。

## [0.10.0] - 2026-05-08

### 使用者可見變化

- **孩子愛物身分證／健保卡端到端加密**：詳情頁 `●●●●●●●●●●` 遮蔽 + 顯示 / 隱藏 toggle；編輯三態語意（留空＝不變更／清除按鈕＝清為空／輸入＝加密後覆蓋）。
- **MiniCalendar 兩級 year/month nav**：費用紀錄 / 進帳 / 結算 / 加油的 datepicker header 可點 → 12 月份格 → 10 年格。
- **6 種愛物詳情頁加備註區**：上限 2000 chars，trim 後空字串視為 null。
- **進帳 pending 指示器**：未確認的定期進帳數 > 0 時，進帳模式 tab 顯示薄荷綠小圓點。
- **小孩愛物暱稱優先顯示**：hero 與愛物清單改用 `nickname` 為主、法定名退為小灰字。
- **健保卡輸入 4-4-4 自動格式**：placeholder `0000 0000 0000`，每 4 位插空格、上限 12 位數字、`inputMode="numeric"`；不擋送出。
- **`PendingIncomeStack` 首屏改 2 筆 + 展開全部**（修 expand 標籤 off-by-one）。
- **`SavingsHero` 視覺微調**：sub-copy 字級 12px → 14px、進度條 8px → 10px。

### 技術變更

- **`childDetails.id_number_encrypted` 與 `insurance_id_encrypted`** 過去寫入未呼叫 `encrypt()`、讀取也直接 plaintext；本版補上加密／解密、改以 `revealChildPii` server action 按需解密。
- **既有 plaintext 已 wipe 為 NULL**：dev / prod 兩個 Supabase project 都 wipe，本版不需資料 migration。
- **Migration 0020**：`Assets.notes` 新增 nullable text column。
- 三條 hero 路徑（`BalanceHero` / Dashboard solo-dismissed / `SoloBanner`）均接通 pending 指示器，banner 開／關都一致。

## [0.9.0] - 2026-05-08

### 使用者可見變化

- **保險 SavingsView**：儲蓄型保單詳情頁全新視圖（`insuranceType = 'savings'`）——雙 bar hero（入：累計繳 / 估應繳總額；出：已拿回 / 估滿期金）、合約進度條 timeline、繳費 / 拿回紀錄分頁。
- **`MaturingSoonPrompt`（30 天前）+ `MaturedAwaitingPrompt`（滿期未收）**：含一鍵記滿期金；`returnRatio ≥ 1.05` 時自動隱藏「記滿期金 +」入口。
- **`AssetSheet` 險種 picker 加入「儲蓄」選項**，conditionally render 預估滿期金欄位。
- **保險詳情頁 hero 橫線修掉**：`InsuranceDetailClientLegacy` header 與 hero 之間的 subpixel gap（外層 `var(--bg)` 透出形成暗線）。

### 技術變更

- **Migration 0015**：`InsuranceDetails.expected_maturity_amount` (nullable)。
- 新增 `computeSavingsProgress` helper（`lib/insuranceProgress.ts`）+ 14 unit tests 覆蓋全部 edge cases。
- **`IncomeSheet`** 新增 `prefilledCategory` / `prefilledAmount` props 供 `MaturedAwaitingPrompt` 一鍵預填。
- 非 savings 險種 fallback 到 `InsuranceDetailClientLegacy`（維持原樣）。
- **Spec 文件 doc-keeper**：8 個 spec 由版本前綴命名改穩定 topic 命名（e.g. `0_7_0-insurance-detail-design.md` → `insurance-design.md`）；移除完成狀態表 / 路徑表 / 已 ship 驗收 checklist；CLAUDE.md spec 索引對應更新。

## [0.8.1] - 2026-05-08

### 使用者可見變化

- **愛物清單分群**：`/assets` 依「財產 / 生命體 / 保障」分群顯示，各群組附標題。
- **House hero card**：入住天數統計（`movedInAt` 起算）。
- **定期收入「改一下」接通**：`editAndConfirmPending` 完整串接——點「改一下」開 IncomeSheet 預填全欄（amount / category / recipient / occurredAt / source / assetId），送出時同步 confirm pending（原子性）。
- **Insurance / House 詳情頁 hero 統一樣式**（Insurance 顯示保障剩餘天數 / House 顯示入住天數）。
- **定期收入 Pending Realtime 修復**：INSERT / UPDATE event 拆分，解決 partner 確認 pending 時的 race condition；`IncomeSheet` race guard。

### 技術變更

- 新增 `DayPicker` 元件（7 欄 × 5 列 + `aria-pressed` / `aria-label`）。
- 新增 `RecurringRuleSheet` bottom sheet 取代獨立全頁表單。
- `/settings/recurring-income` 改為 server component（`RecurringIncomeContent` client shell）；`/new` 與 `/[id]` sub-routes 廢除改 redirect 回列表；`RuleForm.tsx` 刪除。
- **雲端發票匯入 schema 預置**（migrations 0017–0019）：`InvoiceCredentials` table + `cashTransactions.invoiceNumber`——功能因財政部 API 申請限制暫緩，不對使用者顯示。

## [0.8.0] - 2026-05-07

### 使用者可見變化

- **自訂定期收入 Phase 1**：規則 + 待確認卡片 preview→commit 模型；設定頁 `/settings/recurring-income` 規則列表 + 新增/編輯，pause/resume inline toggle。
- **Dashboard 進帳模式 pending card stack**：「就這樣 / 跳過」兩動作（「改一下」延後 Phase 2）。
- **Realtime 同步**：partner 端建立 / 編輯規則、確認 / 跳過 pending 都即時刷新。

### 技術變更

- **`RecurringIncomeRules` + `PendingIncomeOccurrences` schema** + RLS + Realtime publication。
- **`compute_next_occurrence` SQL helper**（PL/pgSQL，含月底 day clamp）+ `computeNextOccurrence` / `snapToFuture` / `firstAnchorFromStart` TS mirror helpers。
- **pg_cron `generate-pending-income`**：每日 16:00 UTC（= 台北 00:00），idempotent。
- 8 個 server actions（含 Phase 2 預留的 `editAndConfirmPending`）。
- `cleanup-soft-deleted` cron 擴充：規則 1 年後物理刪、skipped pending 90 天後物理刪。
- 新增 `docs/superpowers/specs/0_8_0-recurring-income-design.md`；spec 重命名 `0_8_0-cloud-invoice-design.md` → `0_9_0-cloud-invoice-design.md`、`0_8_0-insurance-detail-design.md` → `0_7_0-insurance-detail-design.md`。

## [0.7.0] - 2026-05-06

### 使用者可見變化

- **進帳（Income）ship**：`IncomeSheet`（slide-up、category chips、policy picker、numpad）+ Dashboard mode toggle（支出 / 進帳）+ `IncomeHero` card。
- **Records tab bar 三分頁**：全部 / 支出 / 進帳；income row mint glow；月份 header 顯示「進帳 − 支出」淨額。
- **Records income rows 點擊直接開 `IncomeSheet` 編輯**。
- **愛物 Onboarding Hint**：Pet / Child / Plant / House 詳細頁首次使用提示卡。
- **保險 ↔ 車輛雙向關聯**：兩端詳細頁互相顯示。

### 技術變更

- **`IncomeTransactions` schema** + RLS + Realtime publication + pg_cron cleanup；獨立 income category 定義 + mint palette token。
- 進帳 server actions（create / edit / softDelete + loadMoreIncomes）。
- `InsuranceDetails.vehicleId` FK；驗證保險只能關聯自己 group 的車。
- **Typography tokens**：新增 `--fs-*` scale，統一替換全站 inline `fontSize` / `text-[Xpx]`。
- `EditTextSheet` 改 bottom sheet，支援 keyboard push-up；bottom sheet radius 統一頂角 24px。
- Avatar bg 改用 `--ink` token，移除 `--me-color` / `--them-color` aliases。
- FuelLogs pg_cron cleanup 因 migration 順序導致的 regression 修復。

## [0.6.0] - 2026-05-06

### 使用者可見變化

- **House 愛物 ship**：詳細頁 + 列表 collapse 在「更多」下方 + house icon。
- **Insurance 愛物 ship**：詳細頁 + 列表 + `AssetIcon` insurance variant（shield+check）。
- **Asset Switcher**：詳細頁跨愛物快速切換（名稱變 switcher trigger）。
- **詳細頁 UI 統一**：所有詳細頁 name size / 30px height / back-name-edit-switcher 一致；hero 移除全色帶改用左側 accent stripe；愛物列表左側 accent stripe + dashed echo + inline mark。

### 技術變更

- `HouseDetails` schema + migration + `getHouseDetails` query + `validateHouseInput` + `createHouse` / `editHouse` server actions + `HouseDetailClient`。
- `InsuranceDetails` schema + CRUD actions + `InsuranceDetailClient`。
- `AssetSheet` 高度改 fixed height（移除 maxHeight）。

## [0.5.0] - 2026-05-05

### 使用者可見變化

- **Child / Pet / Plant 三種愛物 ship**：各自詳細頁 + 年齡 / 健康 / species 資訊。
- **「資產」全面改名為「愛物」**（UI 顯示層）。
- **`AibutsuHeader`** tinted 詳細頁 header，各類型色系。
- **`AssetSheet` type picker** 支援所有愛物類型。
- **Pet 三態性別 toggle**（公 / 母 / 不明）。
- **CarHeroCard** 單車 / 多車 layout（B1 car list）。

### 技術變更

- `ChildDetails` / `PetDetails` / `InsuranceDetails` / `PlantDetails` 子表 schema。
- 對應 validators（`validateChildInput` / `validatePetInput` / `validatePlantInput` / `validateInsuranceInput`）+ server actions（create / edit）。
- `asset_type` enum 補上 `pet` + `plant`；`listAssetsForGroup` 不再限制 `type='car'`。
- `AssetIcon` 新增 paw + plant SVG。

## [0.4.0] - 2026-05-05

### 使用者可見變化

- **FuelLog ship**：車輛詳細頁加油時間軸 + ActionBar + `NewFuelLog` sheet。
- **油耗計算**：singleEcon + 近 6 個月均值。
- **primaryUser 自動帶入**：車輛 `primaryUser` 自動帶 `paidBy` + `splitType`。
- **車輛擴展欄位**：color / year / brand / model / initialOdometer；hero 顯示 brand/model/year；color picker 存 hex。
- **NewFuelLog 表單新增「誰付的 + 分攤方式」欄位**。
- **車輛詳細頁 layout 整理**：edit pencil 移到名稱旁、其他花費進 timeline header、加油 FAB 回歸。

### 技術變更

- `FuelLog` table reshape + `cashTransactions.fuelLogId` + `carDetails.primaryUser` / `fuelType`。
- `createFuelLog` 雙寫 `FuelLog` + `CashTransaction`；`editFuelLog` / `softDeleteFuelLog`。
- `singleEcon` + `computeAvgEcon`（近 6 個月均值）helpers。
- `fuelType` enum：移除 `electric`，改 `92` / `95` / `98` / `diesel`（'92' legacy 留在 enum 因為 pg 無法 drop value）。
- `AssetDetailClient` 訂閱 `fuel-log-changed` realtime event；加油 station 欄位移除。

## [0.3.0] - 2026-05-05

### 使用者可見變化

- **愛物概念 + 「車」愛物 ship**：`/assets` 列表頁（空狀態 + accent FAB）+ `/assets/[id]` 詳細頁（hero + scoped feed）。
- **`AssetSheet`** bottom sheet：car create / edit / delete。
- **AddSheet 加關聯資產 picker**（`AssetPickerSheet`） + zombie label。
- **品牌資產 handoff**：icons / favicon / OG 圖片；`/terms` / `/privacy` 頁面 OG metadata。
- **PWA Install Guide**：platform-aware 加到主畫面說明 sheet。

### 技術變更

- `Assets` + `CarDetails` schema + RLS policies + Realtime publication。
- `validateCarInput`、`createCar`（含購車自動產 `CashTransaction`）、`editCar`、`softDeleteCar` server actions + queries（list / get / summary / paged transactions）。
- `editTransaction` 補上 soft-delete `.returning()` race guard。
- `PayerToggle` / `SplitTypeSelector` 抽出共用元件；Realtime payload 全面型別化。
- `BottomNav` 新增 `fabVariant` prop + `/assets` routing。
- AddSheet 切換資產時清除舊 `assetInfo`。

## [0.2.0] - 2026-05-03

### 使用者可見變化

- **Onboarding 兩步驟建帳本**：建立 → 邀請 / 跳過；品牌化 welcome screen。
- **Solo Mode（單人模式）**：`SoloBanner` 取代 `BalanceHero`；AddSheet 隱藏 payer / split UI，強制 `all_mine`；solo dismissable banner 關閉後 Settings 仍保有邀請入口。
- **預設分攤偏好**：Settings inline radio + `updateDefaultSplitType` server action。
- **Web Share API**：複製連結 fallback。
- **Filter 篩選**（Phase 1d）：`FilterSheet` + 伺服器端 UNION filter（誰付 / 分攤 / 分類）。
- **Settings 頁**（Phase 1d）：帳本名稱 / 顯示名稱編輯、Google 大頭貼、登出。
- **Settlement（還款）**（Phase 1c）：`BalanceHero` 展開 `SettlementForm` + 智慧 chip；tap row 可編輯 / 刪除。
- **Records 頁**（Phase 1b）：`/records` 分月份列表 + 分頁載入。
- **編輯既有紀錄**（Phase 1b）：tap `CompactRow` → AddSheet edit / delete 模式。
- **WCAG zoom / SPA nav / invite error / OAuth redirect 參數保留修復**。

### 技術變更

- **Realtime Phase 1e**：`RealtimeProvider` + event bus；`BalanceHero` cross-fade；`TransactionFeed` prepend + highlight on INSERT。
- **pg_cron 每週日 03:00** 物理刪除 `deleted_at > 1 year`。
- RLS SELECT policies 讓 Realtime 正常讀取。
- `OikosGroups` Realtime publication idempotent migration。
- Server Action 整合測試（transaction / settlement / group / profile）。
- `MiniCalendar` 月份導航修復。

## [0.1.0] - 2026-05-03

### 使用者可見變化

- **登入（Google OAuth）+ 建帳本 + 邀請伴侶**（7 天 token + group-full guard）。
- **Dashboard**：`BalanceHero` + 最近紀錄 + load-more（`TransactionFeed`）。
- **AddSheet 完整表單**：金額 / 說明 / 分類 / 誰付 / 分攤 / 日期 + numpad + `MiniCalendar`。
- **底部 Nav**：4 tabs + center FAB。
- **PWA manifest + meta tags**。
- **Futari 品牌**：design tokens、字型、manifest。

### 技術變更

- 專案骨架：Next.js 16 + Supabase + Drizzle ORM + Tailwind CSS v4 + Vitest。
- **AES-256-GCM 加密工具**（key 在 Vercel env，DB 只存 ciphertext）。
- Google OAuth + sign-in + callback route + auth middleware。
- Drizzle schema：`Profiles` / `OikosGroups` / `GroupInvites` / `GroupBalance` / `CashTransactions` / `Settlements`。
- RLS policies + Profiles trigger。
- Group 建立流程 + Balance 初始化。
- `createTransaction` / `softDeleteTransaction`：atomic + `GroupBalance` 重算。
- Balance math：pure 函式 + viewer-flipped perspective。
- Settlement chip math：快速還款金額計算。
- `FutariMark` / `Avatar` / `CategoryChip` 基礎元件。

---

[Unreleased]: https://github.com/redtear1115/oikos/compare/v0.17.4...HEAD
[0.17.4]: https://github.com/redtear1115/oikos/compare/v0.17.3...v0.17.4
[0.17.3]: https://github.com/redtear1115/oikos/compare/v0.17.2...v0.17.3
[0.17.2]: https://github.com/redtear1115/oikos/compare/v0.17.1...v0.17.2
[0.17.1]: https://github.com/redtear1115/oikos/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/redtear1115/oikos/compare/v0.16.3...v0.17.0
[0.16.3]: https://github.com/redtear1115/oikos/compare/v0.16.2...v0.16.3
[0.16.2]: https://github.com/redtear1115/oikos/compare/v0.16.1...v0.16.2
[0.16.1]: https://github.com/redtear1115/oikos/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/redtear1115/oikos/compare/v0.15.3...v0.16.0
[0.15.3]: https://github.com/redtear1115/oikos/compare/v0.15.2...v0.15.3
[0.15.2]: https://github.com/redtear1115/oikos/compare/v0.15.1...v0.15.2
[0.15.1]: https://github.com/redtear1115/oikos/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/redtear1115/oikos/compare/v0.14.2...v0.15.0
[0.14.2]: https://github.com/redtear1115/oikos/compare/v0.14.1...v0.14.2
[0.14.1]: https://github.com/redtear1115/oikos/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/redtear1115/oikos/compare/v0.13.1...v0.14.0
[0.13.1]: https://github.com/redtear1115/oikos/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/redtear1115/oikos/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/redtear1115/oikos/compare/v0.11.4...v0.12.0
[0.11.4]: https://github.com/redtear1115/oikos/compare/v0.11.3...v0.11.4
[0.11.3]: https://github.com/redtear1115/oikos/compare/v0.11.2...v0.11.3
[0.11.2]: https://github.com/redtear1115/oikos/compare/v0.11.1...v0.11.2
[0.11.1]: https://github.com/redtear1115/oikos/compare/v0.10.0...v0.11.1
[0.10.0]: https://github.com/redtear1115/oikos/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/redtear1115/oikos/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/redtear1115/oikos/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/redtear1115/oikos/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/redtear1115/oikos/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/redtear1115/oikos/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/redtear1115/oikos/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/redtear1115/oikos/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/redtear1115/oikos/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/redtear1115/oikos/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/redtear1115/oikos/releases/tag/v0.1.0
