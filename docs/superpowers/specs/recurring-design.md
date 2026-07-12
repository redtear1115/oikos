---
last_updated: 2026-05-13
status: shipped
first_shipped_in: v0.8.0
updates:
  - v0.8.0: Income — rules + cron + actions + Dashboard PendingIncomeStack + Settings 子頁
  - v0.8.1: polish + helpers shared
  - v0.13.0: Expense mirror — actions / queries / Settings 子頁 + Dashboard PendingExpenseStack + AddSheet 改一下 + Records 入口（PRs #76 #77 #78，closes #18）
  - v0.15.3: `source_type` / `source_ref_id` 跨 feature 來源欄位（給 [savings-view](savings-view-design.md) 自動化用，#166）
related_specs: [income, transactions, inbox-layer, savings-view, insurance, solo-mode]
related_issues: ["#18", "#166"]
---

# 自訂定期收支

> 規則一次設定 → cron 每日產生待確認 pending → 用戶按一下落帳成 transaction。
> 跨收入 + 支出兩條 ledger 的 preview→commit 模型；本 spec lock 兩邊共通決策 + 差異點。

---

## 背景與動機

家庭最痛的記帳場景是「每月都要記、金額幾乎不變」的固定收支：

- **收入側**：薪、期（保險滿期）、紅（季/年股息）、副、退、賠
- **支出側**：房租、房貸、水電、訂閱、保費、停車月票、學費、寵物食物宅配

手動每月記一次摩擦極高，但**全自動寫入**違反「克制」與「陪伴而不侵略」（CLAUDE.md 設計原則第 1 / 4 條）。

→ 採 **preview→commit** 模型：cron 產生「待確認 pending」，用戶在 Dashboard 上看到卡片、按一下才落 transaction。保留了「我還是有參與這筆紀錄」的儀式感，又免去金額 / 日期的手動輸入。

收入版 v0.8.0 先 ship，驗證 model；支出版 v0.13.0 鏡像 + 補上「誰付 / 分攤」維度。

---

## 共通設計（兩邊一致）

### Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 觸發模型 | **Preview → Commit**（cron 產 pending，user 確認落 tx） | 不違「不背景自動」原則；保留 ritual；infra 全在現成 |
| Pending 載體 | **獨立 Pending 表**（收入 / 支出各一張） | 維持兩條 ledger invariant=「已確認」；現有 query / Realtime / RLS 全不動 |
| 週期單位 | **`interval_months` 整數**（1=月 / 3=季 / 6=半年 / 12=年） | 一個欄位涵蓋所有實務月度週期；雙週延後處理 |
| 日期錨 | **`day_of_month` 1–31 + clamp 到當月最後一天** | 處理 31 號規則在二月的退化；不引入「最後一天」/「第一個工作日」這種複雜錨 |
| Cron 排程 | **每日 16:00 UTC**（= 台北 00:00） | 用戶醒來時 pending 已就位 |
| 三動作層級 | **就這樣（primary） / 改一下（secondary） / 跳過（tertiary）** | 默認最低摩擦路徑是「就這樣」；跳過要稍微費力，避免反射性消除 |
| Catch-up | **Pause→Resume**：0 期（snap next_occurrence 到未來）； **Cron outage**：自然每天補 1 張直到追上 | Pause 是用戶主動行為，不該有補登；Cron outage 是系統責任，那些期真的發生過該保留 |
| 規則刪除 | **soft delete + 級聯軟刪 active pending** | 用戶刪規則 = 「我不再要這個」，留著 pending 反而困惑 |
| Backfill 策略 | **不 backfill 過去**：規則 `startsOn` 即使在過去，第一張 pending 從建立規則「之後」的下一個錨點開始 | 避免新建規則一次跳 N 張卡片；過去的補登請走一般 AddSheet / IncomeSheet |
| 跳過後資料保留 | **keep `skippedAt`，pg_cron 90 天後物理刪** | 給審計／除錯短窗，不長期累積 |
| Solo Mode | Recipient（income）/ paid_by（expense）預設本人；split_type 鎖 `all_mine`、picker 隱藏 | mirror [solo-mode](solo-mode-design.md) 共通行為 |
| Snapshot vs Live | **規則金額變動時，已產 pending `proposed_amount` 不變**（snapshot at generate-time） | 下一期 cron 產的 pending 才用新金額；卡片上不顯示「規則已改」hint（YAGNI） |

### 不採用

- ❌ **Status 欄位塞回 IncomeTransactions / CashTransactions**（`confirmedAt` nullable）：每個既有 query 都得加 filter，漏一個就出 bug；invariant 變模糊
- ❌ **背景直接建 tx + glow**：違反「克制」原則；金額變動需回頭改的成本高
- ❌ **App-open lazy 提醒**（client-side 算 due）：多裝置 dedup 麻煩；當天沒開 app 就晚看到
- ❌ **Push notification**：infra 從零；MVP 用 Dashboard 卡片就夠
- ❌ **「自動套用未來幾期」toggle**：UI 複雜度高、價值低；用戶要改未來就直接編輯規則
- ❌ **「最後一天 / 第一個工作日」這類複雜錨**：用 day_of_month + clamp 已涵蓋 95% 場景
- ❌ **共用 RecurringRules 表（一張表 + `kind` 欄位）**：兩條 ledger 既有獨立 schema，pending 表也獨立；共用一張表會讓 RLS / query 複雜化、不對稱欄位（recipient_id vs paid_by）變 nullable 反而失去 type safety
- ❌ **Pending 卡片用紅／橘色警示**：違反陪伴語言；定期支出不是「逾期帳單」，是「等你確認的日常」

---

## 收入 vs 支出 差異

| 維度 | 定期收入 | 定期支出 |
|---|---|---|
| 寫入目標表 | `IncomeTransactions` | `CashTransactions` |
| 歸屬欄位 | `recipient_id`（誰收） | `paid_by` + `split_type`（誰付 + 分攤） |
| 自由文字欄 | `source` nullable（公司 A 月薪） | `description` NOT NULL（每月房租）|
| 類別範圍 | `INCOME_CATEGORIES`（8 種） | `PICKABLE_CATEGORIES`（9 種，排除 `settle`） |
| 視覺色系 | mint glow（`DEFAULT_INCOME_PALETTE`） | category-tint glow（卡片用該規則 category 的 tint） |
| Dashboard 顯示位置 | 進帳模式 hero 上方 | **支出模式 BalanceHero 上方**（預設 mode） |
| Pending dot on mode pill | 支出模式時，進帳 pill 上 dot | 進帳模式時，**支出 pill 上 dot** |
| Solo Mode 行為 | recipient 預設本人 | `paid_by` 預設本人 + `split_type='all_mine'`（鎖定） |
| 雙人模式 paid_by/recipient | recipient 預設建立者 | `paid_by` 預設建立者，picker 可選 partner |
| Asset 關聯 | 限 `type='insurance'`（連保單用） | **選填，不限 asset type** |
| Asset 已軟刪除的規則 | （無對應） | 規則自動 `paused_at`（cron 跑前 join 檢查） |
| Pending snapshot 欄位 | `proposed_amount` / `proposed_date` | + `proposed_description` / `proposed_paid_by` / `proposed_split_type` |
| 編輯 sheet | IncomeSheet | AddSheet（含 `pendingExpenseId` 模式） |
| Balance 影響 | 無 | 有（confirm 時 balance 重算，與 [transactions](transactions-design.md) 同 hook） |

設計動機差異說明：

- **`description` 為 NOT NULL on expense**：對齊 `CashTransactions.description` NOT NULL；income 的 `source` 是選填自由 metadata（不會破 ledger invariant）
- **Snapshot 範圍**：expense 走全 snapshot（`proposed_paid_by` / `proposed_split_type` 都 freeze 在 pending），不從 rule 動態 join。理由：rule 之後若改 paid_by / split_type，已產的 pending 應反映「當時規則狀態」（與 amount snapshot 邏輯一致）
- **Asset 不限 type on expense**：任何愛物都可能是定期支出對象（房租→house、房貸→house、保費→insurance、車貸/月票→car、學費→child、寵物保險→pet）；過早限制 type 會不必要地排除合理 use case
- **Asset 軟刪除 → 規則 paused on expense**：cron 跑前 join 檢查 `assets.deleted_at IS NULL`，asset 失效則 set paused_at；不強迫用戶刪規則，settings 列表頁的 paused 狀態文案明確「已暫停（關聯愛物已刪除）」

---

## v0.15.3 增量：`source_type` / `source_ref_id`

`RecurringIncomeRules` 加兩個欄位描述「這條規則的來源」：

- `source_type` text — `'manual'`（使用者手動建立）/ `'insurance_policy'`（從保單詳情頁建立的分紅 / 生存金 / 滿期金）
- `source_ref_id` uuid nullable — 對應的 asset id（保單）等

[savings-view](savings-view-design.md) 用這對欄位實現「inline list」+「prefill CTA」：保單詳情頁顯示已綁定此保單的 recurring rules，並提供「建立定期進帳」開 `RecurringRuleSheet` prefill `assetId=本保單`、`category='dividend'`、`source=保單名`。

設定頁 `/settings/recurring-income` 不動：rules 仍可集中管理；SavingsView 只是入口便利。

---

## 資料模型

詳細欄位以 `lib/db/schema.ts` 為準。本節說「為什麼這個結構」。

### Rules（兩張表，schema mirror）

- `interval_months` / `day_of_month` / `starts_on` / `ends_on` / `next_occurrence_at` — 排程錨點
- `paused_at` / `deleted_at` — soft states，cron 跑前過濾
- `next_occurrence_at` 維護：rule 建立時由 server action 計算（`startsOn` 之後第一個落在 `day_of_month` 的日期）；每次 cron 產 pending 後 += `interval_months`（並對 day_of_month 做 clamp）；`startsOn` / `interval_months` / `day_of_month` 改動時由 server action 重算

### Pending（兩張表）

- `period_start`（錨日，UNIQUE 鍵之一）
- `proposed_amount` / `proposed_date` — snapshot at generate-time（不跟著規則改動）
- 收入: `proposed_*` 簡版
- 支出: 多 `proposed_description` / `proposed_paid_by` / `proposed_split_type`
- `skipped_at` / `resolved_tx_id` — 狀態旗標
- `UNIQUE (rule_id, period_start)` 保證 idempotency

**狀態語意**：

- `skipped_at IS NULL AND resolved_tx_id IS NULL` → **active pending**（顯示卡片）
- `resolved_tx_id IS NOT NULL` → **已確認**（保留作為審計指標；卡片消失）
- `skipped_at IS NOT NULL` → **已跳過**（卡片消失；90 天後 pg_cron 物理刪）

確認/跳過後不真的刪 row：留 audit trail，方便用戶問「我這個月是不是漏記薪水」時查得到。

### Inbox layer 概念

`PendingExpenseOccurrences` 將遷移到統一的 `TransactionInbox`，見 [inbox-layer](inbox-layer-design.md)。Income 端是否同步遷移待設計。

---

## Cron 邏輯

每日 16:00 UTC（= 台北 00:00），對每張 rules 表跑一次 `generate-pending-{income|expense}` job：

1. 對每個 active（`deleted_at IS NULL AND paused_at IS NULL`）且 `next_occurrence_at <= CURRENT_DATE` 的規則：
   - INSERT pending（ON CONFLICT DO NOTHING 保 idempotency）
   - 把 `next_occurrence_at` 推進一格（`compute_next_occurrence` SQL helper，handle clamp）
2. **Expense 額外**：對「`asset_id` 對應 asset 已軟刪除」的規則 set `paused_at = NOW()`，避免下次跑時又進來

`compute_next_occurrence(curr_date, interval_months, day_of_month)` 是純日期 SQL helper（兩邊共用）。

**Idempotency / Dedup**：兩層保險：

1. UNIQUE `(rule_id, period_start)` 是硬保證
2. `next_occurrence_at <= CURRENT_DATE` 過濾 + `INSERT ON CONFLICT DO NOTHING`

**Catch-up 行為**：

- **正常每日跑**：每個規則一次前進 1 期。每天最多產一張 pending
- **規則暫停 N 個月後 resume**：`resumeRule` action 內，先把 `next_occurrence_at` snap 到「未來最近的 anchor」（即 `startsOn` 之後第一個 anchor > today），再清掉 `paused_at`。這樣 resume 後不會產任何補登
- **規則建立後第一次**：`next_occurrence_at` 計算為「`startsOn` 之後第一個落在 `day_of_month` 的日期」。Cron 跑到那天才產 pending。**不 backfill 過去**
- **Cron 連續多天 outage 後恢復**：每天最多補 1 期，連續 N 天才追上。實務上 pg_cron outage 罕見且短，可接受

---

## UI/UX

### Dashboard pending stack

| Mode | Pending stack 位置 | 卡片 glow |
|---|---|---|
| 進帳模式 | hero card 上方 | mint glow（弱 layer） |
| 支出模式 | BalanceHero 上方 | 該規則 `category` tint（弱 layer） |

「mint = 進帳」的視覺鎖保留；支出端用 category tint 避免撞色（目前 9 個 category tint 都不撞 mint）。

**卡片 anatomy（單張）**：

```
┌─────────────────────────────────────┐
│ [類別 mono chip]  source / desc     │
│  5/1（提示日）        NT$ X         │
│  [付款人・分攤方式]（expense only） │
│                                     │
│ [就這樣]      [改一下]    [跳過]    │
└─────────────────────────────────────┘
```

- 預設顯示 2–3 張，超過收進「展開全部（還有 N 筆）」
- 第二張以後 `scale(0.98)` + `-mt-2` stacked 視覺
- 多張同期排序按 `proposed_date ASC`（最早的在最上面）
- 整卡可點：擴開顯示 source / asset / recipient / paid_by 詳細

### 三動作流程

| 動作 | 行為 |
|---|---|
| 就這樣 | 直接 `confirmPending(pendingId)` → INSERT IncomeTx / CashTx + UPDATE pending.resolvedTxId（atomic）→ 卡片 fade out（0.6s glow → 1.2s fade）|
| 改一下 | 開 IncomeSheet（income）/ AddSheet（expense）prefilled 全欄 + hidden `pendingId` → submit `editAndConfirmPending` 同 transaction 內 INSERT + UPDATE pending |
| 跳過 | confirmation toast「跳過 5/1 公司 A 月薪？」→ 確認後 `skipPending`（UPDATE pending.skippedAt = NOW()）→ 卡片 fade out |

支出 confirm 時 balance 重算自動跑（CashTransactions 既有 hook）。

### Pending dot on mode pill

`ModeTogglePlaceholder` 的 props：

- `incomePendingCount?: number`
- `expensePendingCount?: number`

行為：
- mode='income' 時，支出 pill 上若 `expensePendingCount > 0` 顯示 dot
- mode='expense' 時，進帳 pill 上若 `incomePendingCount > 0` 顯示 dot
- 已選中的 pill 不顯示 dot（看見當前模式內容、不需提示）

### Settings 子頁

兩條獨立 path：

- `/settings/recurring-income`
- `/settings/recurring-expense`

兩邊 layout 鏡像：列表頁（rules + 暫停 toggle + 編輯/刪除 menu）+ `RecurringRuleSheet`（form 新增 / 編輯）+ 空狀態 constellation + halo（光點品牌語言）。

### Records tab 入口

`/records` sticky tab bar 下方右對齊小字 inline link：

- tab='expense' → 「⚙ 設定定期支出 →」
- tab='income' → 「⚙ 設定定期進帳 →」
- tab='all' → **不顯示**（保持 all tab 視覺乾淨）

---

## 邊界情況

| 情境 | 行為 |
|---|---|
| 規則 day_of_month=31，遇到 2 月 | clamp 到 2 月最後一天（28 或 29），產 pending 用 clamped date |
| 規則 day_of_month=31，遇到 4/6/9/11 月 | clamp 到 30 |
| 用戶建立規則時 startsOn 在過去 3 個月 | 不 backfill；next_occurrence 從**未來最近**的錨日開始 |
| 用戶 pause 期間錯過 2 期 | resume 不補登。`resumeRule` snap next_occurrence_at 到未來最近 anchor，pending 卡片 0 張 |
| 用戶 pause 期間有未確認 pending | pause 不影響既有 pending；用戶仍可 confirm/skip/edit 該卡片 |
| 用戶 delete（軟刪）規則 | 同 transaction：UPDATE rule SET deleted_at + DELETE active pendings；已 resolved 的 pending 不動（指向真實 tx，留作審計）；已 skipped 的不動（90 天後 pg_cron purge） |
| 用戶在規則 ends_on 之後 resume | next_occurrence_at > ends_on，cron 過濾掉（規則進入「已結束」靜止態） |
| 用戶編輯規則金額 X → Y，已有 active pending | pending.proposed_amount **不變**；下一期 cron 產的 pending 才用新金額 |
| 用戶編輯規則 day_of_month / interval_months | 重算 next_occurrence_at；已產的 active pending 不動 |
| 兩裝置同時點「就這樣」 | 第二個 server action 看到 pending 已有 resolved_tx_id，回「partner 剛剛已處理」，client refresh 卡片消失 |
| Cron 失敗一天 | 隔天跑時 `next_occurrence_at <= CURRENT_DATE` 仍真，照樣產 pending |
| 用戶 confirm 後想撤回 | 用既有 IncomeTransactions / CashTransactions soft-delete。pending.resolved_tx_id 保留（指向已軟刪除 tx），不還原 pending |
| Solo Mode 下建立規則 | recipient / paid_by 自動填本人；split_type 鎖 all_mine；PayerToggle / SplitTypeSelector 隱藏 |
| Solo Mode → 雙人模式 | 既有規則 recipient / paid_by / split_type 不變動；用戶可手動編輯（[solo-mode](solo-mode-design.md) acceptance） |
| recipient / paid_by 不在 group（partner 被踢出） | cron 前 join check；若 user 不在 group → 該規則自動 `paused_at`（settings 頁可改後 resume） |
| Asset 已軟刪除（expense） | cron 自動 set `paused_at`；settings 顯示「已暫停（關聯愛物已刪除）」+「移除關聯」快捷按鈕 |

---

## Out of scope

- **每週/雙週週期**（biweekly salary）：MVP 只支援以「月」為單位的 interval；雙週留 open question（需重設計：day_of_month → day_of_week + week_anchor）
- **規則金額變動時自動套用到既有未確認 pending**：snapshot at generate-time，已產的 pending 保留原 proposedAmount
- **保險滿期 / 理賠的特殊定期 UX**：見 [savings-view](savings-view-design.md)
- **Push notification**
- **跨群組規則**：規則跟 transactions 一樣 group-scoped
- **支出側 budget / 預算告警**：明確不在本 spec scope
- **規則之間衝突偵測**：用戶建兩個一樣的規則會產兩張 pending；不偵測（YAGNI）
- **「Save as recurring」toggle on AddSheet / IncomeSheet 一次性記帳後**：候選未排

---

## Acceptance criteria

- 建立規則（每月 1 號 NT$ 25,000 房租）→ 隔天 16:00 UTC 後 cron 產生 1 張 pending；卡片在 dashboard 支出模式 hero 上方顯示
- 「就這樣」→ INSERT CashTx + UPDATE pending.resolvedTxId（atomic）+ balance 重算正確；卡片 fade out
- 「改一下」→ 開 AddSheet（expense）/ IncomeSheet（income）prefill 全欄；submit → confirm pending + 落新 tx
- 「跳過」→ confirm toast → UPDATE pending.skippedAt；卡片消失；下一期 cron 產的 pending 不受影響
- 規則 day_of_month=31 在 2 月 → clamp 到 28/29 產 pending
- pause N 個月後 resume → next_occurrence_at snap 未來最近 anchor，不補登
- 軟刪規則 → 同 tx 內 active pendings 全部清掉；已 resolved 的指向真實 tx 留作審計
- 兩裝置同時 confirm → 第二個看到 race「partner 剛剛已處理」，client 自動 refresh
- Solo Mode 建規則 → PayerToggle / SplitTypeSelector 不顯示；DB 寫 paid_by = 本人 + all_mine
- Asset 軟刪除（expense） → 對應規則 cron 自動 paused_at；settings 顯示已暫停狀態
- 支出 confirm 後 balance 正確（雙人 / Solo Mode 分別驗）
- 跨 4 語切換 settings / dashboard / sheet UI 翻譯正確
