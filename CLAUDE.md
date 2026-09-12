# Oikos — Agent Guide

> 家庭記帳工具，對使用者顯示為 **Futari**；codebase 用 Oikos。
> 固定兩人（夫妻／伴侶）使用。Mobile-first PWA。

這份是 agent 工作指南——架構、domain model、慣例、邊界。要把專案跑起來或部署，看 [README.md](README.md)。動文案、判讀指標、做產品取捨之前，看 [PRODUCT.md](PRODUCT.md)：各 surface 的意圖與「哪些低數字是預期的」寫在那裡。視覺 token 與元件規則在 [DESIGN.md](DESIGN.md)。後兩份由 Impeccable 維護，改動前先讀「設計脈絡（Impeccable）」那段。

---

## ⚠️ Next.js 版本提醒

This is **Next.js 16** with breaking changes. APIs, conventions, and file structure differ from your training data. Read `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## 目前狀態

**Latest released: v1.5.11** — 版本歷史見 [CHANGELOG.md](CHANGELOG.md)（1.0.0 起算；v0.x 只在 git tag）

## Backlog / 未釋出版本

`v0.x` 每版工時目標 ~2 週；`v1.0.0+` 是 phase 級別範圍，工時不固定。主題敘事用來決定 changelog 文案與 release 重點。每個版本對應一個 GitHub milestone — 詳細 issues 進度看 milestone 頁面，不在本檔維護。

| 版本 | 主題 |
|---|---|
| [v1.6.0](https://github.com/redtear1115/oikos/milestone/55) | 出團多人旅行（付費功能） |
| [v1.7.0](https://github.com/redtear1115/oikos/milestone/60) | 出遊．揪團一起記——多方分帳的擴散獲客 |
| [v2.0.0](https://github.com/redtear1115/oikos/milestone/2) | 買斷層．長線一起守 |
| [v3.0.0](https://github.com/redtear1115/oikos/milestone/3) | 訂閱層．AI 與資產管家 |

→ 沒指派 milestone 的候選：[no-milestone issues](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+no%3Amilestone) · [`backlog` 標籤](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+label%3Abacklog)

---

> 策略背景與市場分析見 [oikos-competitive-analysis.md](docs/superpowers/oikos-competitive-analysis.md) · [user-feedback-analysis.md](docs/superpowers/user-feedback-analysis.md)

---

## 架構速查

```
寫入路徑：Client → Server Action → Drizzle → Supabase Postgres
讀取路徑：Server Component → Drizzle → Postgres
Realtime：Client subscribes → React state mutation
```

- Server Actions：`actions/`
- DB queries：`lib/db/queries/`
- Validators：`lib/validators.ts`
- Realtime：`app/(dashboard)/_components/RealtimeProvider.tsx`
- i18n：`lib/i18n/`（server `getTranslations()` → dashboard layout `<TranslationsProvider>` → client `useTranslations()`；cookie-based locale，4 語）
- Migrate（競品搬遷 SEO 頁）：`lib/migrate/sources.ts`（source registry：competitor facts + comparison + `screenshotWorkflow` flag）→ 單一動態路由 `app/[locale]/migrate/[source]/page.tsx`；sitemap / cross-link / JSON-LD 全部自動衍生。非匯出 App 走截圖→ChatGPT→CSV（`futari_generic` parser，見 `lib/csvImport/`）。spec: [migrate-pages-design.md](docs/superpowers/specs/migrate-pages-design.md)
- Schema：`lib/db/schema.ts`
- Migrations：`drizzle/`
- Specs：`docs/superpowers/specs/`
- 觀測：Sentry 錯誤追蹤（client `instrumentation-client.ts`／server `sentry.server.config.ts`＋edge `sentry.edge.config.ts`，由 `instrumentation.ts` 的 `register()` + `onRequestError` 載入；`next.config.ts` 以 `withSentryConfig` 包裹）＋ PostHog 分析（`app/providers.tsx`）。皆只在 `NODE_ENV === 'production'` 送出。**做數據分析前先讀下面「觀測的邊界」。**

### 觀測的邊界（分析前必讀）

> 這幾條是結構性限制，不是資料不足。不知道的話會算出看似合理、實際無意義的數字——已經各發生過一次（#1018）。

- **server 與 client 事件不 join**：`captureServer`（`lib/analytics/server.ts`）用 userId 當 distinct_id；client 在 `person_profiles: 'identified_only'` + `persistence: 'memory'`（cookieless）下是匿名 id。跨兩邊的漏斗**算不出來**，單邊分析才成立。**症狀是查詢靜默回 0 筆、沒有任何錯誤**——那是結構限制，不是你 SQL 寫錯，也不是資料不足。
  - **例外：若兩邊事件都帶同一個業務 key，用那個 key 配對就能繞過 person 斷裂。** person 不通不代表事件無法關聯。實例：`invite_created` 與 `partner_joined` 都帶 `group_id`，藉此算出「建立群組 → 夥伴加入」的時間差（#1017），那是純 person join 拿不到的。**放棄之前先找有沒有共同的業務 key。**
- **`platform` 只在 client 事件上**：`detectPlatform()`（`lib/platform.ts`）在 SSR 回 `null`（server render 沒有平台可言）。server 端的 `signed_in` / `signed_up` 要改用 `path`（`web_oauth` / `ios_native`）分辨。所以「iOS 殼使用者的登入成功率」這類跨維度問題無解。
- **匿名訪客數是膨脹的**：cookieless 下每個 session 算新 person。已登入用戶走 identify 所以人數可靠。訪客絕對值不可用，只有同類頁面的**相對**比較有效。
- **維度不回填**：`platform` 自 v1.5.7 部署起才有，`path` 自 v1.5.6 起。更早的事件永遠沒有，事後無法用 SQL 補。
- **UA 分不出平台**：iOS WKWebView 被 PostHog 歸類為 Mobile Safari（實測佔 iOS 流量 43%），原生殼／PWA／其他 App 內嵌瀏覽器三者在 UA 上同形。一律改看 `platform`。

### 讀數據的紀律

> 2026-09-12 一天之內有六個結論被推翻。**沒有一個是算錯數字。**

**第 0 條先做，它不需要判斷力：引用任何事件指標之前，先 grep 它的發送點。**

不是問「這個數字代表什麼」，是問「這行 `track()` 在哪、什麼條件下會跑」。實例：`landing_cta_clicked` 全站只有 `app/[locale]/_landing/LandingCtaLink.tsx:45` 一處發送，migrate 頁的 header 是裸 `<Link>`——所以被引用一整天的「migrate 頁 CTA 轉換率 26% vs 6.5%」，量的其實是「訪客願不願意退回首頁再點一次」。一次 grep、10 秒就能發現。

這條和下面三條性質不同：下面三條要你**在對的時機想起來**，而人不會知道自己正處在該用它的時機；第 0 條無條件執行，所以它不會失效。它擋掉的也是最貴的錯——不是讀錯數字，是**數字根本不是那個量**，而且那種錯沒有任何內部矛盾會讓人起疑。

其餘三條：

1. **極端值（0 / 1 / 100%）先問預期值。** 極端值最像洞見，也最常是誤讀。`import_completed` 90 天只有 1 筆看起來像功能壞了，實際上那個頁面從來不以它為 KPI（見 [PRODUCT.md](PRODUCT.md) 的 Surface Intents）。先問「這個數字本來該長什麼樣」，再問它為什麼偏離。
2. **看到百分比，先還原成分子分母。** 分子是個位數或十位數時，任何比例都是雜訊。「手機 CTR 3.05% vs 桌機 6.20%」看起來像腰斬，實際是 8/262 vs 8/129，Fisher exact **p = 0.175**。`3.05%` 有三位有效數字、讀起來像精密測量——**百分比這個呈現格式本身隱藏了脆弱性**。同一件事寫成「262 次曝光只有 8 個人點」，任何人都會先問「8 個人夠判斷嗎」。
3. **下結論前，檢查手上是否已有能否證它的資料。** 不是缺資料，是資料在手上卻沒被用進判斷。

新增測量點會製造一個**看起來像成效的斷層**（例：#1027 補上 migrate 頁的 CTA 之後，`landing_cta_clicked` 會跳升，那不是改善，是終於有東西可以量了）。跨部署的前後比較一律無效，基準要從部署日重算。

### Balance 計算規則

- 金額單位依 base currency 而異：TWD / CNY / JPY 為整數（無小數）；USD 以 *100 儲存為整數（即 1.50 USD 存為 150）。Balance 計算永遠看 base 幣別的 raw integer 值。
- Base currency 預設 TWD（可選 TWD / CNY / USD / JPY），當前 epoch 無 record 時可改
- 每次寫入後全量重算，cache 在 `GroupBalance`
- 計算實作：`lib/balance.ts` + `lib/db/queries/balance.ts`
- GroupBalance 欄位 `balance`：`> 0` = member_b 欠 member_a；`< 0` = member_a 欠 member_b（權威在 `lib/balance.ts` 開頭的 `Positive = member_b owes member_a`；本段是這份文件裡唯一展開它的地方）

### 編輯模式

「編輯」= soft delete + insert（atomic DB transaction）。DB 層不支援 UPDATE。`deleted_at` 超過 1 年由 pg_cron 物理刪除。

---

## Domain Model 速查

> Schema 真相在 `lib/db/schema.ts`，這裡只說「entity 是什麼 + 怎麼接」。

### 主要 entity

- **`OikosGroups`（Group）** — 兩人帳本本體。`member_a` notNull / `member_b` nullable（solo 模式 = `member_b IS NULL`）。`current_epoch_started_at` 標記目前章節起點；`default_split_ratio_a` 為 group 預設依比例分；`guardian_beta_enabled` 控制守護模組可見性（單一閘門 `lib/guardian.ts#canAccessGuardian`，將來付費層 cut-over 只動該函式）；`base_currency` 為 group 主體幣別（TWD/CNY/USD/JPY，當前 epoch 無 record 時可改）。
- **`Profiles`（OikosUser）** — mirror `auth.users.id` 的使用者 profile（displayName / avatar / `default_split_type`）。
- **`GroupEpochs`** — 關係章節歷史。每個 group 同時間恰好一筆 `endedAt IS NULL`（current epoch）；swap 不開新 epoch、leave 才會關舊開新。`/records` / stats / dashboard 預設只看當前 chapter，`/past-times` 翻歷史。
- **`CashTransactions`** — 核心支出紀錄。`group_id` + `paid_by` + `amount`（base 幣別整數）+ `split_type`（`all_mine` / `all_theirs` / `half` / `weighted`）+ `category` + optional `asset_id` / `fuel_log_id` / `trip_id`。`status: 'settled' | 'pending'`（pending 不計入 balance）。多幣別 record 另存 `original_currency` / `original_amount` / `rate_snapshot`（NULL = base native）；balance 計算永遠看 base 幣別 `amount`。
- **`IncomeTransactions`** — 進帳紀錄。`recipient_id` + `category`（獨立 income category）+ optional `asset_id`；不進 balance。
- **`Settlements`** — 還款紀錄。`paid_by` 給對方的金額，反向影響 balance。強制 base 幣別。
- **`GroupBalance`** — balance cache（per-group 單列）。每次寫入後由 `lib/balance.ts` 全量重算；幣別無感（永遠 base 幣別整數）。`balance` 的正負號語意見上面「Balance 計算規則」，此處不複述。
- **`CurrencyRates`** — ⚠️ **Deprecated since v0.17.4 (#410)**。Trip-scoped 匯率已移入 `Trips.rate_snapshot`（free-text code + rate entries）；此表僅為相容舊 trip 資料保留，新 trip 不再寫入。見 `lib/db/schema.ts`。
- **`Trips`** — 旅行子帳本。`epoch_id` notNull（**強制單一 epoch**：trip 不可跨章節）、`start_date >= currentEpochStartedAt`；`default_currency` 為 records 表單 currency selector 預設值；`status: 'active' | 'ended' | 'archived'`。`leaveGroup` 若有 active trip 則 reject「請先結束旅行」。spec: [trip-multi-currency-design.md](docs/superpowers/specs/trip-multi-currency-design.md)
- **`TripExpenses`** — 旅行隔離帳本（issue #42）。`trip_id` + `paid_by` + `amount`（base 幣別整數）+ optional `original_currency` / `original_amount`（free-text trip code，須對應 parent `Trips.rate_snapshot`）+ `category` + `split_type` + optional `split_ratio`（**payer's share %**，注意與 `CashTransactions.split_ratio_a`「member A 的 %」語意不同）。Trip UI 讀這張表；主帳本（/records、stats、balance）讀 `CashTransactions` 看不到這些 row。Trip end 時會寫**最多兩筆** summary `CashTransaction`（每個付款人各一筆；solo group 只有一筆）把 trip 折回主帳本——實作 `lib/tripSummary.ts`、入口 `actions/trip.ts#endTrip`。
- **`Assets`（愛物）** — 共用 base table（`type` enum: `car` / `house` / `child` / `pet` / `plant` / `insurance` / `item`），舊 6 種用 1:1 子表存細節：`CarDetails` / `HouseDetails` / `ChildDetails` / `PetDetails` / `PlantDetails` / `InsuranceDetails`；`item` 走 template path (`template_key` + `template_fields` jsonb)，不開子表。
- **`FuelLogs`** — 車輛加油紀錄；與 `CashTransactions` 透過 `fuel_log_id` 雙寫關聯。
- **`RecurringIncomeRules` / `RecurringExpenseRules`** — 定期收支規則；pg_cron 每日依 `next_occurrence_at` 產生 `PendingIncomeOccurrences` / `PendingExpenseOccurrences`，使用者 confirm 才落地成真實 transaction。
- **`MonthlyReviewSnapshots` / `MonthlyReviewMessages`** — 月初 cron 凍結的雙人月度回顧資料。
- **`PartnerQuizSessions` / `PartnerQuizAnswers`** — 伴侶問答（v0.15.2）。問題池抽 3 題，雙方獨立作答，全部到齊後 reveal。每個 group 目前只有一份 session（MVP 鎖定）。見 `lib/db/schema.ts`。
- **`ImportBatches` / `ImportErrors`** — CSV import 批次紀錄（v1.1.0）。每次匯入一筆 `ImportBatches`；`CashTransactions.importBatchId` + `IncomeTransactions.importBatchId` FK 讓整批可 rollback。`ImportErrors` 存失敗行原始資料供用戶下載修正後再傳。見 `lib/db/schema.ts`。
- **`InvoiceCredentials` / `InvoiceImportSnapshots` / `InvoiceImportRuns`** — 雲端發票匯入（spec: [cloud-invoice](docs/superpowers/specs/cloud-invoice-design.md)，`status: blocked`）。Schema 已建立，功能卡在財政部 APP_ID 申請。見 `lib/db/schema.ts`。

### Entity 關係

```
Profiles ─┬─< OikosGroups.member_a, member_b
          ├─< CashTransactions.paid_by
          ├─< IncomeTransactions.recipient_id
          └─< InsuranceDetails.policy_holder_user_id / insured_user_id

OikosGroups ─┬─< GroupEpochs (1 open + N closed) ─< Trips (epoch-bound) ─< TripExpenses
             ├─< CashTransactions / IncomeTransactions / Settlements
             ├─< Assets ─┬─< CarDetails ─< FuelLogs
             │           ├─< HouseDetails / ChildDetails / PetDetails / PlantDetails
             │           └─< InsuranceDetails (可 FK 回 Asset: vehicle_id / insured_child_id)
             ├─< ImportBatches ─< ImportErrors
             ├─< PartnerQuizSessions ─< PartnerQuizAnswers
             ├─< InvoiceCredentials / InvoiceImportRuns (blocked feature)
             ├─< CurrencyRates (⚠️ deprecated since v0.17.4)
             └─── GroupBalance (1:1)

CashTransactions.importBatchId / IncomeTransactions.importBatchId → ImportBatches (rollback FK)
```

- Asset 屬於 Group，**沒有** `owner_user_id`；個別 owner 語意各 type 自己定義（`CarDetails.primary_user_id` / `HouseDetails.owner` / `InsuranceDetails.policy_holder_user_id`）。
- CashTransaction 可 optional 關聯 `asset_id`（哪個愛物的支出）+ `fuel_log_id`（加油雙寫）+ `trip_id`（屬於哪段旅行）。
- Epoch 是「時間軸 slice」不是 entity owner：transactions / settlements 透過 **`created_at`** 落在哪個 epoch 來歸屬章節——是「何時被記下」，不是「何時發生」。章節是關係的分期，補記昨天的收據、匯入十年前的 CSV，都仍屬於當下這段關係。單一入口 `lib/db/queries/_predicates.ts#epochClause`（所有 call site 一律傳 `created_at`）＋ `lib/db/queries/balance.ts` 的 inline SQL。**call-site 盤點不在這裡複述**——權威在 `lib/db/queries/balance.ts` 開頭 docstring，它與被描述的程式同檔同 MR，漂移風險最低。
- **兩個時間戳分工**——選錯不會報錯，只會靜默算少：

  | 問題 | 用哪個 | 入口 |
  |---|---|---|
  | 這筆屬於哪個章節？ | `created_at` | `epochClause` |
  | 那個月花了／收了多少？ | CashTransactions `transacted_at`／Settlements `settled_at`／IncomeTransactions `occurred_at` | `dateRangeClause` / `dateColumnClause`、`compute_monthly_review_snapshot`（`drizzle/0061_*.sql`） |

  `transactedAt` **沒有**「必須落在當前 epoch」的約束（`lib/validators.ts` 只驗格式）：手動 backdating、CSV 匯入（`actions/import.ts:225` 用來源檔日期）、定期支出確認（`actions/recurringExpense.ts` 用 `proposedDate`）都會在當前 epoch 寫入 `transacted_at` 很舊的 row。
- **拿 `transacted_at` 當 epoch 邊界的失效長這樣**：feed 照常顯示那些 row、balance 把它們整批漏掉（剛匯入的帳本 balance 讀 0），**全程沒有任何錯誤訊息**。#1030 第一輪就是照舊版文件這樣寫而被 verifier 判 REFUTED。理由全文見 `lib/db/queries/balance.ts` 開頭 docstring。

### 分類色 token

> 每個分類只宣告一個 primary `color`，chip 用的 `tint` 由 `lightenHex()` 推得，確保同一分類在 feed icon 與 donut slice 之間共用同一 hue family。

- 支出分類：`lib/categories.ts` — 每個 `Category` 自帶 primary `color` + derived `tint` + `ink` + `mono`；`chart` 為 `color` 的 alias，舊 callsite 不動。
- 收入分類：`lib/incomeCategories.ts` — 同結構；另有 `SAVINGS_RETURN_CATEGORIES` 標記「已拿回」桶（maturity / dividend / survival_annuity）。
- 收入模式整體色票：`lib/incomePalettes.ts`（mint / gold / cream）— `ink` / `tint` / `glow` / `whisper` / `sheetBg` 五階。
- 愛物 type token：`app/globals.css` 的 `--asset-color-{car,house,child,pet,plant,insurance,item}` 為主色；`--asset-tint-*` 透過 `color-mix(in srgb, var(--asset-color-*) 35%, white)` 推導，list rail 與未來愛物 donut 共用同一 hue family。
- 圖表專用色票：`lib/chartPalette.ts` — chart 自己挑的色（per-asset hash palette `ASSET_PALETTE`、未歸屬 fallback `ASSET_NULL_COLOR`、active bar track `ACTIVE_BAR_TRACK`）；donut 與 detail bars 共用同一 source of truth。分類／收入分類 slice 色不在此，仍在各自 domain 檔。
- 派生 helper：`lib/colors.ts#lightenHex(hex, amount = 0.35)` — chip `tint` 從每個 `Category.color` deterministic 推得；新增分類只需給 `color` + `ink`，不必再挑 tint。

### Worktree 工作流

- **修改一律開 worktree**：任何會寫檔或動 git 狀態的任務（feature / fix / chore / docs）都先開 worktree，在裡面做事；main checkout 只做讀取。原因：main checkout 被多個平行 session 共用，HEAD 可能在指令之間被切走。
- **位置統一 `.claude/worktrees/{issue_no}-{slug}/`**（例 `.claude/worktrees/946-solo-trip-epoch/`；沒有對應 issue 就只留 slug）。feature branch 名取自任務上下文（`feat/...` / `fix/...` / `chore/...`），開 worktree 時直接 `git worktree add .claude/worktrees/<dir> -b <branch> main`。
- 工作模式不變：在本 session 依序做（一次一個任務）；平行背景 agent 只在明確要求時用，且各自有自己的 worktree。委派與否依全域 Orchestration 政策。
- **兩套 worktree 各管各的情境**：主 session 的任務 worktree 用上述 `.claude/worktrees/{issue_no}-{slug}/` 手動慣例；平行 subagent 的隔離交給 harness 的 `isolation: "worktree"`（自動建立與回收，不落在此路徑）。
- Worktree 缺 `.env.local` 時從 main checkout `ln -s`，不要 copy（copy 會在 key 輪替後 silently drift）。
- 做 iOS 原生工作的 worktree，開完先 `mkdir -p out && npx cap sync ios`（`cap sync` 產物沒進版控，乾淨 checkout 缺這步 Xcode 會開不起來）。
- Worktree 與 main repo 共用 git history；PR merge 後 worktree 連同 branch 一起清掉。

---

## 三平台架構（Web / iOS / Android）

Next.js 16 web app + Capacitor 8 **薄殼**：`capacitor.config.ts` 的 `server.url` 指向 prod（`https://futari.southern-light.dev`），iOS / Android 殼只是載入線上網站的 WebView。**web 改動經 Vercel 部署即時觸達三平台**，不必重送商店；只有動到原生輸入才要重新送審。

送審步驟、Xcode／Gradle 雷點、ASC API 用法見 [docs/app-store-submission-runbook.md](docs/app-store-submission-runbook.md)。

### 需要重新送審的 trigger

- `ios/**`、`android/**`
- `capacitor.config.ts`
- `patches/**`
- `package.json` 中 `@capacitor/*` 或 `@capacitor-community/*` 依賴變動
- app icon / splash
- 商店 metadata（`docs/store-assets/`、App Store Connect / Play Console 欄位）

### 原生契約面（web 端，改動即時生效）

以下是 Capacitor-aware 的 web 程式，**沒有送審這道防線**：改了就即時打到所有已安裝的殼（含舊版）。動到時要在真機殼內驗證，不能只看瀏覽器。

- `lib/pushNotifications.ts`
- `components/KofiWidget.tsx`（iOS IAP gate）
- `app/[locale]/sign-in/SignInButton.tsx`
- `app/[locale]/_landing/LandingStandaloneRedirect.tsx`
- `app/[locale]/_landing/Landing.tsx`
- `app/(dashboard)/_components/PushTokenRegistrar.tsx`

### 版本號

使用者可見版號（`MARKETING_VERSION` / `versionName`）與商店遞增計數（`CURRENT_PROJECT_VERSION` / `versionCode`）分離；計數每次上傳 +1、與 semver 脫鉤，日常 web release **不動**原生版本號。規則見 runbook §E。

### 原生 build 雷點

- Android 需 JDK 21：`export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`
  - 「21」是 Capacitor 8 `sourceCompatibility` 的**下限，不是上限**。Android Studio 內附的 JBR 會隨 Studio 更新往上漂，看到它比 21 新不代表這行過期——2026-09-13 實測 JBR 已是 JDK 25，Gradle 8.14.3 + AGP 8.13 下 `assembleDebug` 245 個 task 全過。**不要為了湊「21」另外裝 JDK**（Gradle 官方支援矩陣只寫到 24，照著推會得出「JBR 太新不能用」的錯誤結論，實際不會發生）。
- 乾淨 checkout / worktree 做 iOS 工作前先 `mkdir -p out && npx cap sync ios`

---

## 環境

| env | project | URL |
|---|---|---|
| prod | `oikos` | https://cxbnlahuhdvrbwcnzoqo.supabase.co |
| dev  | `oikos-dev` | https://ufhcprrauwsxdmscbkrf.supabase.co |

兩個 Supabase project 完全獨立。Migration / realtime publication / pg_cron job 兩邊都要跑（`npm run db:migrate` 看本地 `.env.local` 指向哪個）。Vercel preview / prod 部署只連 prod project；本機 `npm run dev` 連 dev project。

Migration 慣例（手寫 SQL + 手動 journal）、prod migration 跑法、pg_cron 的 Vault 授權、Apple Sign In 雷點、GA 歸因等營運知識見 [docs/superpowers/ops-runbook.md](docs/superpowers/ops-runbook.md)。

---

## 部署流程

Branch 架構與 Vercel 對應見 [README.md](README.md)。

要 release 時：

1. 在 `chore/release-vX.Y.Z` 上跑 [`release`](.claude/skills/release/SKILL.md) skill（bump version + CHANGELOG + CLAUDE.md + README + tag）
2. 開 PR `chore/release-vX.Y.Z → main`，merge 後 push tag
3. 開 PR `main → release`，merge 後 Vercel 自動部 prod

本版動過「三平台架構」列的原生 trigger 路徑時，release 後要另外確認原生殼是否需要重送商店（skill 會在收尾 checklist 標示；流程見 [runbook](docs/app-store-submission-runbook.md)）。

---

## 常用指令

常用指令見 [README.md](README.md)。

## AI 開發協作規則

- **寫限制的時候，連它失效時長什麼樣子一起寫**：人是靠症狀認出問題的，不是靠機制推導。「跨 server/client 不能 join」要補一句「症狀是查詢靜默回 0 筆」；「手寫段落可能在 refresh 時遺失」要補一句「失效的樣子不是檔案被清空，是某段在看似正常的文件重整裡被壓縮掉」。只寫機制，讀者下次撞到時不會認出那就是文件警告過的事。
- **不要把沒解釋的選擇當疏忽**：看起來隨意的既有寫法，常是在一個沒被寫下來的約束底下的合理解。2026-09-12 踩了兩次——`pt-12` 看似魔術數字，實際是刻意大於 safe-area inset；safe-area guard 的檔案級比對看似偷懶，實際是唯一能容納「wrapper 負責 pin、內層負責 padding」這個正確形狀的粒度。兩次都是先當它是疏忽、動手改了才發現約束存在。**改之前先問「如果這是對的，它在解什麼我沒看到的問題」。**
- **撤回一個論證之後，要掃所有引用它的地方**：結論被推翻了，但引用它的段落還活著、而且看起來仍然合理。撤回本身也值得留在文件裡——它標示了哪條推論路徑會出錯，而下一個人很可能會重新推導出同一個錯誤結論。
- **偏好透過 subagent roles 分工**：開發任務優先委派給 subagent（有對應 role 就用 role，如 pilotfish 的 scout / executor / verifier；需要指定 model 時用 ad-hoc subagent），主 session 負責 framing、brief、驗收與整合。平行 subagent 各自用 worktree 隔離（見「Worktree 工作流」）。
- **commit 自主、push 延到 PR-time**：每完成一個邏輯單位（PR / feature）即自動 commit，不必問；但**不要每個 commit 都 push**——本機累積，只在「要開 PR / 更新已開的 PR」時才 push。原因：`vercel.json` 沒有 git/deploy 設定，Vercel 預設「任何 branch 每次 push 都建一個 preview deployment」，逐 commit push 會產生大量不必要的 build。**例外**：當任務本身需要 preview 部署才能進行（例如測試已部署的 endpoint），iterative push 是必要且合理的。
- **`main` / `release` 是 protected**：絕對不要直接 push 到這兩條，要進去都走 PR merge 流程。`gh pr merge --admin`（任何繞過 branch protection 的 merge）也要明確指令才執行。
- **destructive ops**：動 prod 資料、force push 到 main/release、`reset --hard` 之類仍要明確確認 scope 後才執行。force-push（含 `--force-with-lease`）到 feature branch 在 rebase 後可自動執行。
- **issue / PR 必須指定 milestone**：開 issue 或開 PR 時一律加上 `--milestone` 參數，不得省略。milestone 選當前正在開發的版本；若不確定歸屬，選最近的未關閉 milestone。

---

## 品牌文案準則（Futari Copy Guidelines）

> 任何涉及 copy 的 PR，動筆前先對照以下原則。

### 流量分層 × tone 對應

| 流量層 | 進入點 | 用戶狀態 | 核心任務 | tone |
|---|---|---|---|---|
| Landing | `/` | 陌生人，搜尋到達 | 建立情感認同，讓人願意試試 | 有溫度的清醒 |
| Sign-in | `/sign-in` | 有信任基礎（朋友推薦） | 減少摩擦，說清楚「接下來會發生什麼」 | 安靜的邀請 |
| App 內功能 | dashboard, records… | 已是用戶 | 清楚操作，不干擾 | 簡潔中性 |
| App 內情感節點 | 空狀態、首次設定、結算… | 已是用戶 | 溫和的見證，不說教 | 溫和的見證者 |

### Landing — 寫作規則

- **Hero copy 不放功能列表**：「記帳 / 分攤 / 圖表」不是 hero 要說的事，hero 要說的是「為什麼這兩個人要一起記帳」
- `heroKicker` 不放 SEO 語法（`·` / 斜線關鍵字），交給 `<meta>`
- Trust row 排序：免費 → 裝置 → 加密（加密是最強 claim，放最後）
- 情境感 > 功能感：「回頭看會很暖」比「追蹤花費」更對

### Sign-in — 寫作規則

- Tagline 不重複 landing 的「what is this」，要說「what happens next」
- 不以感嘆號製造興奮感
- 不用「開始」「立即」「免費試用」等 conversion 語言

### Solo 模式 — 寫作規則

- 不預設「他還沒加入」的性別（用「對方」「你的伴侶」）
- 不用「還在等」製造焦慮感；solo 本身不是問題狀態
- `soloHint` / `soloBanner` / `sendInviteHint` 每次改動都要對照此原則

### App 內 — 禁用詞

在 dashboard / app 情境中，以下詞匯**禁止使用**：

- 「管理」→ 改用「查看」「記錄」「整理」
- 「追蹤」→ 改用「記下」「看見」
- 「監控」→ 禁用，無替換
- 感嘆號（`！` / `!`）→ 禁用於 UI copy

### i18n 同步規則

- 任何 copy 改動一律 4 語同步（zh-TW / zh-CN / en / ja）
- zh-TW 是主稿；zh-CN 跟進但保留繁簡差異，不要機翻
- en / ja 如無 native reviewer，PR description 列出建議譯文，標記「待確認」

---

## 設計脈絡（Impeccable）

任何 UI／視覺工作開始前，先讀 [`PRODUCT.md`](PRODUCT.md)（策略層：who／what／why、register、anti-references、5 條設計原則）與 [`DESIGN.md`](DESIGN.md)（視覺系統：色票、字體、elevation、元件、Do's/Don'ts，採 Stitch 六段格式）。兩檔由 Impeccable design skill 每個指令載入；`.impeccable/design.json` 是延伸層（色階 ramp、陰影、動態、可渲染的元件 snippet）。

- 改動 UI 時以 `DESIGN.md` 為視覺準則；文案仍依上方「品牌文案準則」。
- Register＝`product`；Creative North Star＝「The Warm Lamp」。
- **DESIGN.md 與 PRODUCT.md 由 Impeccable 維護，refresh 是「model 全檔重寫」，不是機械產生。** `/impeccable document` 重寫 DESIGN.md、`/impeccable teach` 重寫 PRODUCT.md；真正機械地從 `app/globals.css` 抄過去的只有 `.impeccable/design.json` 的 token 值。工具不會靜默覆蓋（偵測到既有檔會先問要 refresh 哪一份），但**手寫段落能不能留下來，取決於當時跑 refresh 的 agent 有沒有先讀過現檔、刻意逐段帶過去**——那是判斷，不是保證。
  - 所以：**跑 refresh 前先讀現檔，逐段帶過，不要從零生成。** PRODUCT.md 的 Surface Intents、DESIGN.md 的任何手動補充都屬於這類。
  - 失效的樣子不是檔案被清空，而是某一段在一次看起來很正常的「文件重整」裡被壓縮掉。所以控制點是 git diff，不是工具。
  - 另一條邊緣路徑：任何 impeccable 指令偵測到 PRODUCT.md 缺失、空白、少於 200 字元或含 `[TODO]` 時，會把 teach 當成 setup blocker 自動拉起來。現況遠大於該門檻，實務上踩不到。
- **Token 紀律（硬性，見 DESIGN.md §3 The Existing-Token-First / Even-Px Rule）**：
  - 字級一律偶數 px，且必對應 `text-*` class；11/13/15 已廢除，落在中間就取最近偶數。
  - 任何視覺值先找既有 token：型別 `text-*`、間距 Tailwind utility＋`--sheet-*`、圓角 `--radius-*`、顏色 `--color-*` / `var(--ink*)`。
  - **禁止 inline `style` 寫 token 已涵蓋的靜態值**（`fontSize` / `padding` / `margin` / `borderRadius` / 顏色）；inline 只留給真正動態值（計算 transform、資料驅動尺寸）。
  - **不得自行新增字級／間距／圓角／token**；既有 scale 真的表達不了時，先停下來問使用者。

---

## 規格文件位置

所有 feature 設計 spec 都在 `docs/superpowers/specs/`。入口是 [`docs/superpowers/specs/INDEX.md`](docs/superpowers/specs/INDEX.md)，含：

- 寫作原則（what / why / who，不寫 how）
- Frontmatter schema（`status` / `first_shipped_in` / `updates` / `related_specs` / `related_issues` / `blocked_on`）
- 拆分原則 + 檔案命名
- Spec 清單分組：架構 / 記帳核心 / 體驗 / 提案與匯入 / 愛物 / 守護

版本歷史看 [`CHANGELOG.md`](CHANGELOG.md)；版本對應 issue 看 GitHub milestones。

---

## 專案內建 skill

`.claude/skills/` 有四個進版控的 repo-scoped skill，換機器 / cloud session / worktree subagent 都帶得走：

- [`run-oikos`](.claude/skills/run-oikos/SKILL.md) — 啟動並 smoke test dev server（`npm install` + `npm run dev` + curl），收錄冷機啟動會踩的雷（缺 `@next/bundle-analyzer`、缺 `.env.local`、port 3000 佔用、Turbopack lazy-compile 404）。
- [`ja-i18n`](.claude/skills/ja-i18n/SKILL.md) — 維護 `lib/i18n/locales/ja.ts`：偵測未翻譯 key、辨識合法漢字的假陽性、更新漢字白名單。
- [`release`](.claude/skills/release/SKILL.md) — 發版（bump version + CHANGELOG + CLAUDE.md + README + 本地 tag），附原生影響掃描與收尾 checklist；不 push、不碰 protected branch。
- [`ship-native`](.claude/skills/ship-native/SKILL.md) — 原生殼重送（版本計數 +1 → iOS archive/export/upload、Android AAB + 驗簽 → 實機驗證 checklist）；build 可自動跑，上傳前必停下來確認。
