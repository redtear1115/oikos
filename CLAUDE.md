# Oikos — Agent Guide

> 家庭記帳工具，對使用者顯示為 **Futari**；codebase 用 Oikos。
> 固定兩人（夫妻／伴侶）使用。Mobile-first PWA。

---

## ⚠️ Next.js 版本提醒

This is **Next.js 16** with breaking changes. APIs, conventions, and file structure differ from your training data. Read `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## 目前狀態

**Latest released: v1.2.3**（tag on origin）— prod migration 狀態獨立追蹤。完整版本歷史見 [CHANGELOG.md](CHANGELOG.md)

## Backlog / 未釋出版本

`v0.x` 每版工時目標 ~2 週；`v1.0.0+` 是 phase 級別範圍，工時不固定。主題敘事用來決定 changelog 文案與 release 重點。每個版本對應一個 GitHub milestone — 詳細 issues 進度看 milestone 頁面，不在本檔維護。

| 版本 | 主題 |
|---|---|
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
- Schema：`lib/db/schema.ts`
- Migrations：`drizzle/`
- Specs：`docs/superpowers/specs/`
- 觀測：Sentry 錯誤追蹤（client `instrumentation-client.ts`／server `sentry.server.config.ts`＋edge `sentry.edge.config.ts`，由 `instrumentation.ts` 的 `register()` + `onRequestError` 載入；`next.config.ts` 以 `withSentryConfig` 包裹）＋ PostHog 分析（`app/providers.tsx`）。皆只在 `NODE_ENV === 'production'` 送出。

### Balance 計算規則

- 金額單位依 base currency 而異：TWD / CNY / JPY 為整數（無小數）；USD 以 *100 儲存為整數（即 1.50 USD 存為 150）。Balance 計算永遠看 base 幣別的 raw integer 值。
- Base currency 預設 TWD（可選 TWD / CNY / USD / JPY），當前 epoch 無 record 時可改
- 每次寫入後全量重算，cache 在 `GroupBalance`
- 計算實作：`lib/balance.ts` + `lib/db/queries/balance.ts`
- GroupBalance 欄位 `balance`：`> 0` = member_b 欠 member_a；`< 0` = member_a 欠 member_b

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
- **`GroupBalance`** — balance cache（per-group 單列）。`balance` `> 0` = member_b 欠 member_a，`< 0` = member_a 欠 member_b；每次寫入後由 `lib/balance.ts` 全量重算；幣別無感（永遠 base 幣別整數）。
- **`CurrencyRates`** — ⚠️ **Deprecated since v0.17.4 (#410)**。Trip-scoped 匯率已移入 `Trips.rate_snapshot`（free-text code + rate entries）；此表僅為相容舊 trip 資料保留，新 trip 不再寫入。見 `lib/db/schema.ts`。
- **`Trips`** — 旅行子帳本。`epoch_id` notNull（**強制單一 epoch**：trip 不可跨章節）、`start_date >= currentEpochStartedAt`；`default_currency` 為 records 表單 currency selector 預設值；`status: 'active' | 'ended' | 'archived'`。`leaveGroup` 若有 active trip 則 reject「請先結束旅行」。
- **`TripExpenses`** — 旅行隔離帳本（issue #42）。`trip_id` + `paid_by` + `amount`（base 幣別整數）+ optional `original_currency` / `original_amount`（free-text trip code，須對應 parent `Trips.rate_snapshot`）+ `category` + `split_type` + optional `split_ratio`（**payer's share %**，注意與 `CashTransactions.split_ratio_a`「member A 的 %」語意不同）。Trip UI 讀這張表；主帳本（/records、stats、balance）讀 `CashTransactions` 看不到這些 row。Trip end 時會寫一筆 summary `CashTransaction` 把 trip 折回主帳本。
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
- Epoch 是「時間軸 slice」不是 entity owner：transactions / settlements 透過 `transacted_at` 落在哪個 epoch 來歸屬章節。

### 分類色 token

> 每個分類只宣告一個 primary `color`，chip 用的 `tint` 由 `lightenHex()` 推得，確保同一分類在 feed icon 與 donut slice 之間共用同一 hue family。

- 支出分類：`lib/categories.ts` — 每個 `Category` 自帶 primary `color` + derived `tint` + `ink` + `mono`；`chart` 為 `color` 的 alias，舊 callsite 不動。
- 收入分類：`lib/incomeCategories.ts` — 同結構；另有 `SAVINGS_RETURN_CATEGORIES` 標記「已拿回」桶（maturity / dividend / survival_annuity）。
- 收入模式整體色票：`lib/incomePalettes.ts`（mint / gold / cream）— `ink` / `tint` / `glow` / `whisper` / `sheetBg` 五階。
- 愛物 type token：`app/globals.css` 的 `--asset-color-{car,house,child,pet,plant,insurance}` 為主色；`--asset-tint-*` 透過 `color-mix(in srgb, var(--asset-color-*) 35%, white)` 推導，list rail 與未來愛物 donut 共用同一 hue family。
- 圖表專用色票：`lib/chartPalette.ts` — chart 自己挑的色（per-asset hash palette `ASSET_PALETTE`、未歸屬 fallback `ASSET_NULL_COLOR`、active bar track `ACTIVE_BAR_TRACK`）；donut 與 detail bars 共用同一 source of truth。分類／收入分類 slice 色不在此，仍在各自 domain 檔。
- 派生 helper：`lib/colors.ts#lightenHex(hex, amount = 0.35)` — chip `tint` 從每個 `Category.color` deterministic 推得；新增分類只需給 `color` + `ink`，不必再挑 tint。

### Worktree 工作流

- 開發在 `.claude/worktrees/<adjective-name>-<hash>/` 的 git worktree 做事，每條 feature branch 一個 worktree，**不在 main repo 直接動**。
- Worktree branch 命名 `claude/<adjective-name>-<hash>`；feature branch 名（要開 PR 用的）取自任務上下文（如 `chore/...` / `feat/...`），在 worktree 內 `git checkout -b` 切過去。
- Worktree 與 main repo 共用 git history；PR merge 後 worktree 連同 branch 一起清掉。

---

## 環境

| env | project | URL |
|---|---|---|
| prod | `oikos` | https://cxbnlahuhdvrbwcnzoqo.supabase.co |
| dev  | `oikos-dev` | https://ufhcprrauwsxdmscbkrf.supabase.co |

兩個 Supabase project 完全獨立。Migration / realtime publication / pg_cron job 兩邊都要跑（`npm run db:migrate` 看本地 `.env.local` 指向哪個）。Vercel preview / prod 部署只連 prod project；本機 `npm run dev` 連 dev project。

---

## 部署流程

Branch 架構與 Vercel 對應見 [README.md](README.md)。

要 release 時：

1. 在 `chore/release-vX.Y.Z` 上跑 `git-develop:release` skill（bump version + CHANGELOG + CLAUDE.md + tag）
2. 開 PR `chore/release-vX.Y.Z → main`，merge 後 push tag
3. 開 PR `main → release`，merge 後 Vercel 自動部 prod

---

## 常用指令

常用指令見 [README.md](README.md)。

## AI 開發協作規則

- **commit + push 自主**：每完成一個邏輯單位（PR / feature）即自動 commit，並自動 push 到當前 feature branch，不必問。
- **`main` / `release` 是 protected**：絕對不要直接 push 到這兩條，要進去都走 PR merge 流程。`gh pr merge --admin`（任何繞過 branch protection 的 merge）也要明確指令才執行。
- **destructive ops**：動 prod 資料、force push 到 main/release、`reset --hard` 之類仍要明確確認 scope 後才執行。force-push（含 `--force-with-lease`）到 feature branch 在 rebase 後可自動執行。

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
- DESIGN.md 是掃描現有 `app/globals.css` tokens 產生的；token 變動後可重跑 `/impeccable document` 同步。

---

## 規格文件位置

所有 feature 設計 spec 都在 `docs/superpowers/specs/`。入口是 [`docs/superpowers/specs/INDEX.md`](docs/superpowers/specs/INDEX.md)，含：

- 寫作原則（what / why / who，不寫 how）
- Frontmatter schema（`status` / `first_shipped_in` / `updates` / `related_specs` / `related_issues` / `blocked_on`）
- 拆分原則 + 檔案命名
- Spec 清單分組：架構 / 記帳核心 / 體驗 / 提案與匯入 / 愛物 / 守護

版本歷史看 [`CHANGELOG.md`](CHANGELOG.md)；版本對應 issue 看 GitHub milestones。
