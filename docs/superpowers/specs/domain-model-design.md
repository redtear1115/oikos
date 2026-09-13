---
last_updated: 2026-09-13
status: shipped
first_shipped_in: v0.1.0
updates:
  - v1.5.11: 自 `CLAUDE.md` 搬入（入口檔固定 token 稅，#1086）；內容逐字保留，只改相對連結路徑
related_specs: [product, transactions, trip-multi-currency, aibutsu, csv-import, epoch-readonly]
related_issues: ["#1086"]
---

# Domain Model 速查 — Entity 目錄、Balance 規則與色 token

> Schema 真相在 `lib/db/schema.ts`，這裡只說「entity 是什麼 + 怎麼接」。

動資料模型、寫 balance 相關程式、或要知道某張表接在哪裡時讀這份。原本住在 `CLAUDE.md`，因為只有動資料模型時才需要、卻每個任務都在付它的 token 稅而搬出（#1086）。

---

## Balance 計算規則

- 金額單位依 base currency 而異：TWD / CNY / JPY 為整數（無小數）；USD 以 *100 儲存為整數（即 1.50 USD 存為 150）。Balance 計算永遠看 base 幣別的 raw integer 值。
- Base currency 預設 TWD（可選 TWD / CNY / USD / JPY），當前 epoch 無 record 時可改
- 每次寫入後全量重算，cache 在 `GroupBalance`
- 計算實作：`lib/balance.ts` + `lib/db/queries/balance.ts`
- GroupBalance 欄位 `balance`：`> 0` = member_b 欠 member_a；`< 0` = member_a 欠 member_b（權威在 `lib/balance.ts` 開頭的 `Positive = member_b owes member_a`；本段是這份文件裡唯一展開它的地方）

---

## 主要 entity

- **`OikosGroups`（Group）** — 兩人帳本本體。`member_a` notNull / `member_b` nullable（solo 模式 = `member_b IS NULL`）。`current_epoch_started_at` 標記目前章節起點；`default_split_ratio_a` 為 group 預設依比例分；`guardian_beta_enabled` 控制守護模組可見性（單一閘門 `lib/guardian.ts#canAccessGuardian`，將來付費層 cut-over 只動該函式）；`base_currency` 為 group 主體幣別（TWD/CNY/USD/JPY，當前 epoch 無 record 時可改）。
- **`Profiles`（OikosUser）** — mirror `auth.users.id` 的使用者 profile（displayName / avatar / `default_split_type`）。
- **`GroupEpochs`** — 關係章節歷史。每個 group 同時間恰好一筆 `endedAt IS NULL`（current epoch）；swap 不開新 epoch、leave 才會關舊開新。`/records` / stats / dashboard 預設只看當前 chapter，`/past-times` 翻歷史。
- **`CashTransactions`** — 核心支出紀錄。`group_id` + `paid_by` + `amount`（base 幣別整數）+ `split_type`（`all_mine` / `all_theirs` / `half` / `weighted`）+ `category` + optional `asset_id` / `fuel_log_id` / `trip_id`。`status: 'settled' | 'pending'`（pending 不計入 balance）。多幣別 record 另存 `original_currency` / `original_amount` / `rate_snapshot`（NULL = base native）；balance 計算永遠看 base 幣別 `amount`。
- **`IncomeTransactions`** — 進帳紀錄。`recipient_id` + `category`（獨立 income category）+ optional `asset_id`；不進 balance。
- **`Settlements`** — 還款紀錄。`paid_by` 給對方的金額，反向影響 balance。強制 base 幣別。
- **`GroupBalance`** — balance cache（per-group 單列）。每次寫入後由 `lib/balance.ts` 全量重算；幣別無感（永遠 base 幣別整數）。`balance` 的正負號語意見上面「Balance 計算規則」，此處不複述。
- **`CurrencyRates`** — ⚠️ **Deprecated since v0.17.4 (#410)**。Trip-scoped 匯率已移入 `Trips.rate_snapshot`（free-text code + rate entries）；此表僅為相容舊 trip 資料保留，新 trip 不再寫入。見 `lib/db/schema.ts`。
- **`Trips`** — 旅行子帳本。`epoch_id` notNull（**強制單一 epoch**：trip 不可跨章節）、`start_date >= currentEpochStartedAt`；`default_currency` 為 records 表單 currency selector 預設值；`status: 'active' | 'ended' | 'archived'`。`leaveGroup` 若有 active trip 則 reject「請先結束旅行」。spec: [trip-multi-currency-design.md](trip-multi-currency-design.md)
- **`TripExpenses`** — 旅行隔離帳本（issue #42）。`trip_id` + `paid_by` + `amount`（base 幣別整數）+ optional `original_currency` / `original_amount`（free-text trip code，須對應 parent `Trips.rate_snapshot`）+ `category` + `split_type` + optional `split_ratio`（**payer's share %**，注意與 `CashTransactions.split_ratio_a`「member A 的 %」語意不同）。Trip UI 讀這張表；主帳本（/records、stats、balance）讀 `CashTransactions` 看不到這些 row。Trip end 時會寫**最多兩筆** summary `CashTransaction`（每個付款人各一筆；solo group 只有一筆）把 trip 折回主帳本——實作 `lib/tripSummary.ts`、入口 `actions/trip.ts#endTrip`。
- **`Assets`（愛物）** — 共用 base table（`type` enum: `car` / `house` / `child` / `pet` / `plant` / `insurance` / `item`），舊 6 種用 1:1 子表存細節：`CarDetails` / `HouseDetails` / `ChildDetails` / `PetDetails` / `PlantDetails` / `InsuranceDetails`；`item` 走 template path (`template_key` + `template_fields` jsonb)，不開子表。
- **`FuelLogs`** — 車輛加油紀錄；與 `CashTransactions` 透過 `fuel_log_id` 雙寫關聯。
- **`RecurringIncomeRules` / `RecurringExpenseRules`** — 定期收支規則；pg_cron 每日依 `next_occurrence_at` 產生 `PendingIncomeOccurrences` / `PendingExpenseOccurrences`，使用者 confirm 才落地成真實 transaction。
- **`MonthlyReviewSnapshots` / `MonthlyReviewMessages`** — 月初 cron 凍結的雙人月度回顧資料。
- **`PartnerQuizSessions` / `PartnerQuizAnswers`** — 伴侶問答（v0.15.2）。問題池抽 3 題，雙方獨立作答，全部到齊後 reveal。每個 group 目前只有一份 session（MVP 鎖定）。見 `lib/db/schema.ts`。
- **`ImportBatches` / `ImportErrors`** — CSV import 批次紀錄（v1.1.0）。每次匯入一筆 `ImportBatches`；`CashTransactions.importBatchId` + `IncomeTransactions.importBatchId` FK 讓整批可 rollback。`ImportErrors` 存失敗行原始資料供用戶下載修正後再傳。見 `lib/db/schema.ts`。
- **`InvoiceCredentials` / `InvoiceImportSnapshots` / `InvoiceImportRuns`** — 雲端發票匯入（spec: [cloud-invoice](cloud-invoice-design.md)，`status: blocked`）。Schema 已建立，功能卡在財政部 APP_ID 申請。見 `lib/db/schema.ts`。

---

## Entity 關係

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

  `transactedAt` **沒有**「必須落在當前 epoch」的約束（`lib/validators.ts` 只驗格式）：手動 backdating、CSV 匯入（`actions/import.ts:232` 用來源檔日期）、定期支出確認（`actions/recurringExpense.ts` 用 `proposedDate`）都會在當前 epoch 寫入 `transacted_at` 很舊的 row。
- **拿 `transacted_at` 當 epoch 邊界的失效長這樣**：feed 照常顯示那些 row、balance 把它們整批漏掉（剛匯入的帳本 balance 讀 0），**全程沒有任何錯誤訊息**。#1030 第一輪就是照舊版文件這樣寫而被 verifier 判 REFUTED。理由全文見 `lib/db/queries/balance.ts` 開頭 docstring。

---

## 分類色 token

> 每個分類只宣告一個 primary `color`，chip 用的 `tint` 由 `lightenHex()` 推得，確保同一分類在 feed icon 與 donut slice 之間共用同一 hue family。

- 支出分類：`lib/categories.ts` — 每個 `Category` 自帶 primary `color` + derived `tint` + `ink` + `mono`；`chart` 為 `color` 的 alias，舊 callsite 不動。
- 收入分類：`lib/incomeCategories.ts` — 同結構；另有 `SAVINGS_RETURN_CATEGORIES` 標記「已拿回」桶（maturity / dividend / survival_annuity）。
- 收入模式整體色票：`lib/incomePalettes.ts`（mint / gold / cream）— `ink` / `tint` / `glow` / `whisper` / `sheetBg` 五階。
- 愛物 type token：`app/globals.css` 的 `--asset-color-{car,house,child,pet,plant,insurance,item}` 為主色；`--asset-tint-*` 透過 `color-mix(in srgb, var(--asset-color-*) 35%, white)` 推導，list rail 與未來愛物 donut 共用同一 hue family。
- 圖表專用色票：`lib/chartPalette.ts` — chart 自己挑的色（per-asset hash palette `ASSET_PALETTE`、未歸屬 fallback `ASSET_NULL_COLOR`、active bar track `ACTIVE_BAR_TRACK`）；donut 與 detail bars 共用同一 source of truth。分類／收入分類 slice 色不在此，仍在各自 domain 檔。
- 派生 helper：`lib/colors.ts#lightenHex(hex, amount = 0.35)` — chip `tint` 從每個 `Category.color` deterministic 推得；新增分類只需給 `color` + `ink`，不必再挑 tint。
