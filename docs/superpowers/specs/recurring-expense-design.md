---
status: shipped
shipped_in: v0.13.0（PR #76 server actions + db queries · PR #77 Settings 子頁 + Dashboard PendingExpenseStack · PR #78 AddSheet「改一下」+ Records 入口），closes #18。實際 ship 從 v0.12.0 滑到 v0.13.0。
note: 下方「v0.12.0 PR 拆分」段保留為實作 audit 之用；實際 PR 編號為 #76 / #77 / #78（合計 3 個 PR，原 spec 規劃 5 個 PR 已合併執行）。
---

# 自訂定期支出設計 spec

> 目標：為支出側鏡像 v0.8.0 自訂定期收入：規則 → cron 產生待確認 pending → 用戶確認落 CashTransaction。
> 範圍：v0.12.0 主功能。週期單位 1 / 3 / 6 / 12 月，支援關聯 `asset_id`，UX 完全 mirror 定期收入（pause→resume snap to future、不 backfill 過去）。
> 狀態：本 spec lock 設計；實作排程跟 v0.12.0 走。

---

## 背景與動機

家庭最痛的記帳場景是「每月都要記、金額幾乎不變」的固定支出：房租、房貸、水電、訂閱、保費、停車月票、學費、寵物食物宅配。手動每月記一次摩擦極高，但**全自動寫入**違反「克制」與「陪伴而不侵略」（[CLAUDE.md](../../../CLAUDE.md) 設計原則第 1 / 4 條）。

v0.8.0 的[定期收入](recurring-income-design.md)已驗證 **preview→commit** 模型有效：cron 產 pending、用戶按一下落帳，保留儀式感、消除手動輸入。本 spec 把同模型套到支出側。

跟收入比，支出側多了**雙人記帳的維度**——「誰付」與「分攤方式」。但這兩個欄位在規則層面是固定的（不會「這個月房租你付、下個月我付」），所以鎖在規則上、產 pending 時 snapshot、確認時直接寫入 `CashTransactions` 即可，不引入額外複雜度。

---

## 與定期收入的核心差異點

| 維度 | 定期收入 | 定期支出 | 差異原因 |
|---|---|---|---|
| 寫入目標 | `IncomeTransactions` | `CashTransactions` | 既有兩條 ledger 維持 invariant |
| 歸屬欄位 | `recipient_id`（誰收） | `paid_by` + `split_type`（誰付 + 分攤） | cash 是雙人記帳；income 是單人歸屬 |
| 自由文字欄 | `source`（公司 A 月薪） | `description`（每月房租） | 對齊各自 transaction 表的命名 |
| 類別來源 | `INCOME_CATEGORIES`（8 種） | `PICKABLE_CATEGORIES`（9 種，排除 `settle`） | settle 為結算保留、不可手選 |
| 視覺色系 | mint glow（`DEFAULT_INCOME_PALETTE`） | category-tint glow（卡片用該規則 category 的 tint） | 支出沒有統一的「光譜色」；混合不同 category 應顯示各自色 |
| Dashboard 顯示位置 | 進帳模式 hero 上方 | **支出模式 BalanceHero 上方**（預設 mode） | 對稱；支出是預設 mode 所以是「主畫面第一個看到的」 |
| Pending dot 顯示位置 | 支出模式時，進帳 pill 上 dot | 進帳模式時，**支出 pill 上 dot** | 對稱：在「另一個 mode」時提示有 pending 等你 |
| Solo Mode 行為 | recipient 預設本人 | `paid_by` 預設本人 + `split_type='all_mine'`（鎖定，picker 隱藏） | 鏡像既有 AddSheet Solo Mode 行為 |
| 雙人模式 paid_by | N/A | 預設建立者，picker 可選 partner | 支出特有 |

其他面向（cron 排程、idempotency、catch-up 策略、刪除/暫停語意、邊界 case）**完全對齊定期收入**，後文不再贅述差異點。

---

## Scope

### In

- 規則表（`RecurringExpenseRules`）：建立 / 編輯 / 暫停 / 刪除
- 待確認表（`PendingExpenseOccurrences`）：cron 產生
- 每日 pg_cron job：到期產 pending（idempotent）
- Dashboard 待確認卡片堆疊（**支出模式**）
- 三個動作：「就這樣」/「改一下」/「跳過」（mirror income）
- 規則設定頁（`/settings/recurring-expense`）
- Records tab 入口：「設定定期支出」inline link（同步補上「設定定期進帳」入口，定期收入 spec Phase 2 點名但未 ship）
- 關聯 `asset_id`：選填、不限 asset type
- Realtime sync（mirror income）
- i18n 4 語（zh-TW / zh-CN / en / ja）

### Out

- **每週 / 雙週週期**：MVP 只支援月度 interval（1 / 3 / 6 / 12）
- **`paid_by` 在規則間切換 / 輪流**：規則固定一人付，要切換請建第二條規則或編輯
- **`split_type` 動態算**：規則 snapshot；確認時若想換分攤，走「改一下」開 AddSheet 改
- **背景同步 partner 確認**：partner 端只看到 pending、可確認；不在 cron 層「自動代確認」
- **Backfill 過去**：`startsOn` 在過去也不補登
- **Push notification**：infra 為零
- **支出側 budget / 預算告警**：本 spec 只處理「定期記帳的摩擦」，不處理「預算超標」

---

## Locked decisions

繼承定期收入決策，僅列**本 spec 新決或差異**。

> **2026-05-08 confirmed by user**：以下三項在 spec 完成審視後特別 ack：
> 1. Asset 已軟刪除 → 規則自動 `paused_at`（見表中對應行）
> 2. `ModeTogglePlaceholder` prop 改名（`pendingCount` → `incomePendingCount` + 新增 `expensePendingCount`）為 breaking change，全 codebase 替換在同 PR 完成（見 UI/UX § 3）
> 3. `recurringIncome.*` namespace 重整與 `recurringExpense.*` 新增**同一 PR** 完成（見 i18n § 與 PR 拆分 § PR #3）

| 維度 | 決定 | 理由 |
|---|---|---|
| 寫入目標表 | `CashTransactions`（既有） | 維持唯一支出 ledger，所有 query / Realtime / RLS / balance 重算路徑全不動 |
| 規則身份欄位 | `paid_by`（誰付，FK Profiles）+ `split_type`（all_mine / all_theirs / half） | mirror cashTransactions；不引入第三種分攤模式 |
| `description` snapshot | 規則 `description` 寫進 pending.proposed_description；確認時拷到 cashTransactions.description | snapshot at generate-time，鎖入帳資訊 |
| 類別範圍 | `PICKABLE_CATEGORIES`（dining / clothing / housing / transit / education / entertainment / health / financial / other），**排除 `settle`** | settle 為結算 reserved，不該由用戶定期觸發 |
| Asset 關聯 | **選填，不限 asset type**；UX 跟 AddSheet `AssetPickerSheet` 完全一致 | 任何愛物都可能是定期支出對象（房租→house、房貸→house、保費→insurance、車貸/月票→car、學費→child、寵物保險→pet）；過早限制 type 會不必要地排除合理 use case |
| Asset 已軟刪除的規則 | 規則進入 `paused_at` 自動暫停（cron 跑前先 join 檢查 `assets.deleted_at IS NULL`，asset 失效則 set paused_at） | 跟 income spec recipient 被踢出 group 的處理一致：軟性 fail-safe，避免 dangling FK |
| Pending 卡片色 | 用該規則 `category` 的 tint 作為卡片 glow | 保留「光點」語言；不混 mint（避免跟收入視覺撞） |
| 預設 mode | Dashboard **支出模式為預設**（已 ship），pending stack 直接出現在主畫面 | 不需要切 mode 才看到，提示更直接 |
| 進帳 mode 切過去看到的 dot | 鏡像現有 income：支出 pill 上 4–5px mint dot（無數字） | 視覺對稱；用既有 ModeTogglePlaceholder 接口擴 props |
| 「就這樣」確認流程 | 同 transaction：INSERT CashTransaction + UPDATE pending.resolved_tx_id + balance 重算 | balance 重算是 cashTransactions 既有 hook，無需額外 wiring |

### 不採用

- ❌ **`paid_by` 用「兩人輪流付」auto-rotate**：聽似貼心、但實務上夫妻房租都同一人付（共同帳戶或固定分工），auto-rotate 會誤導；要輪流請建兩條規則
- ❌ **`split_type` 改成 percentage**（70/30 等）：cashTransactions 本就只支援三態 split_type，extending 規則層的 split 模型超出 scope；MVP 沿用現有
- ❌ **規則綁兩個 asset**：用例罕見（一筆支出涉及兩個愛物？）；YAGNI
- ❌ **共用 RecurringRules 表（一張表 + `kind` 欄位區分 income/expense）**：兩條 ledger 既有獨立 schema，pending 表也獨立；共用一張表會讓 RLS / query 複雜化、不對稱欄位（recipient_id vs paid_by）變 nullable 反而失去 type safety；維持兩張獨立規則表 + 兩張 pending 表
- ❌ **Pending 卡片用紅／橘色警示**：違反陪伴語言；定期支出不是「逾期帳單」，是「等你確認的日常」
- ❌ **首次建立規則就立刻產今天的 pending**：跟 income spec 一致，第一張 pending 從建立後下個 anchor 開始；想立刻記就走 AddSheet
- ❌ **規則金額變動時自動推送提示「下次要套新金額嗎？」**：snapshot 模型語意清楚（已產的不變、未產的用新值），多餘的 hint 噪音

---

## 資料模型

### `RecurringExpenseRules`

```ts
export const recurringExpenseRules = pgTable('RecurringExpenseRules', {
  id:                uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId:           uuid('group_id').notNull().references(() => oikosGroups.id),
  paidBy:            uuid('paid_by').notNull().references(() => profiles.id),
  amount:            integer('amount').notNull(),  // CHECK > 0
  splitType:         splitTypeEnum('split_type').notNull(),
  description:       text('description').notNull(),
  category:          text('category').notNull(),  // PICKABLE_CATEGORIES，排除 settle
  assetId:           uuid('asset_id').references(() => assets.id),
  intervalMonths:    integer('interval_months').notNull().default(1),  // CHECK > 0
  dayOfMonth:        integer('day_of_month').notNull(),  // CHECK 1..31
  startsOn:          date('starts_on').notNull(),
  endsOn:            date('ends_on'),
  nextOccurrenceAt:  date('next_occurrence_at').notNull(),
  pausedAt:          timestamp('paused_at', { withTimezone: true }),
  deletedAt:         timestamp('deleted_at', { withTimezone: true }),
  createdAt:         timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

**與 `recurringIncomeRules` 的欄位 diff**：
- `recipient_id` → `paid_by`（FK 都到 Profiles）
- 新增 `split_type`（splitTypeEnum）
- `source` (nullable text) → `description` (NOT NULL text；對齊 cashTransactions）

`description` 為 NOT NULL（cashTransactions.description 也是 NOT NULL），規則建立時必填；income 的 `source` 是選填自由 metadata。

### `PendingExpenseOccurrences`

```ts
export const pendingExpenseOccurrences = pgTable('PendingExpenseOccurrences', {
  id:                  uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId:             uuid('group_id').notNull().references(() => oikosGroups.id),
  ruleId:              uuid('rule_id').notNull().references(() => recurringExpenseRules.id, { onDelete: 'cascade' }),
  periodStart:         date('period_start').notNull(),
  proposedAmount:      integer('proposed_amount').notNull(),  // CHECK > 0
  proposedDate:        date('proposed_date').notNull(),
  proposedDescription: text('proposed_description').notNull(),  // snapshot
  proposedPaidBy:      uuid('proposed_paid_by').notNull().references(() => profiles.id),  // snapshot
  proposedSplitType:   splitTypeEnum('proposed_split_type').notNull(),  // snapshot
  skippedAt:           timestamp('skipped_at', { withTimezone: true }),
  resolvedTxId:        uuid('resolved_tx_id').references(() => cashTransactions.id),
  createdAt:           timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // UNIQUE (rule_id, period_start) for idempotency
})
```

**與 `pendingIncomeOccurrences` 的欄位 diff**：多 3 個 snapshot 欄位（`proposed_description` / `proposed_paid_by` / `proposed_split_type`），因為 cashTransactions 寫入需要這 3 個值；income 端只需要 `recipient_id`，可從 rule 直接拿（但保險起見其實 income 端也應該 snapshot — 留 v0.13+ refactor 機會，不在本 spec scope）。

> **Snapshot 範圍決策**：選擇全 snapshot（`proposed_paid_by` 與 `proposed_split_type` 都 freeze 在 pending），不從 rule 動態 join。理由：rule 之後若改 paid_by / split_type，已產的 pending 應反映「當時規則狀態」（與 amount snapshot 邏輯一致），用戶才有清楚的時間語意。

### Schema 共用

`category` 仍為 text（不引入 categoryEnum），與 cashTransactions / incomeTransactions 一致，server 端走 `isValidCategoryId()` 驗證 + 排除 `settle`。

### RLS / Realtime / 索引

完全對齊 income 版（[drizzle/0016_recurring_income.sql](../../../drizzle/0016_recurring_income.sql)）：
- RLS：`group_id IN (groups I'm a member of)`
- Realtime：兩張新表加入 `supabase_realtime` publication
- 索引：rule 表 `(next_occurrence_at) WHERE deleted_at IS NULL AND paused_at IS NULL`、pending 表 `(group_id, proposed_date DESC) WHERE skipped_at IS NULL AND resolved_tx_id IS NULL`

---

## Cron job 邏輯

### `compute_next_occurrence` 復用

[既有 SQL helper](../../../drizzle/0016_recurring_income.sql#L8-L19) 是純日期計算（無 income 特定邏輯），**直接 reuse**，不重新建立。如未來要再多 ledger 共用，這個 helper 已是 candidate。

### 新 cron job：`generate-pending-expense`

```sql
SELECT cron.schedule('generate-pending-expense', '0 16 * * *', $$
  -- 16:00 UTC = 台北 00:00（與 generate-pending-income 同步）
  INSERT INTO "PendingExpenseOccurrences"
    (group_id, rule_id, period_start, proposed_amount, proposed_date,
     proposed_description, proposed_paid_by, proposed_split_type)
  SELECT r.group_id, r.id, r.next_occurrence_at, r.amount, r.next_occurrence_at,
         r.description, r.paid_by, r.split_type
  FROM "RecurringExpenseRules" r
  LEFT JOIN "Assets" a ON a.id = r.asset_id
  WHERE r.deleted_at IS NULL
    AND r.paused_at IS NULL
    AND r.next_occurrence_at <= CURRENT_DATE
    AND (r.ends_on IS NULL OR r.next_occurrence_at <= r.ends_on)
    AND (r.asset_id IS NULL OR a.deleted_at IS NULL)
  ON CONFLICT (rule_id, period_start) DO NOTHING;

  UPDATE "RecurringExpenseRules"
  SET next_occurrence_at = compute_next_occurrence(next_occurrence_at, interval_months, day_of_month)
  WHERE deleted_at IS NULL
    AND paused_at IS NULL
    AND next_occurrence_at <= CURRENT_DATE
    AND (ends_on IS NULL OR next_occurrence_at <= ends_on);

  -- Asset 已軟刪除的規則：set paused_at（避免下次跑時又進來；用戶可手動 resume 並改規則）
  UPDATE "RecurringExpenseRules" r
  SET paused_at = NOW()
  FROM "Assets" a
  WHERE r.asset_id = a.id
    AND r.deleted_at IS NULL
    AND r.paused_at IS NULL
    AND a.deleted_at IS NOT NULL;
$$);
```

**與 income cron 的差異**：多一個 `LEFT JOIN Assets`、多一個 fallback 「asset 軟刪則暫停規則」block。Income 既有 cron 沒做這層保護（理論上 partner 被踢出 group 才會有對應問題），未來可順手對齊。

### 擴充 `cleanup-soft-deleted`

加入兩行：

```sql
DELETE FROM "RecurringExpenseRules"      WHERE deleted_at < NOW() - INTERVAL '1 year';
DELETE FROM "PendingExpenseOccurrences"  WHERE skipped_at < NOW() - INTERVAL '90 days';
```

完整 cron statement 重 schedule（[既有 pattern](../../../drizzle/0016_recurring_income.sql#L133-L140) 即整段重寫）。

### Idempotency / Catch-up

完全對齊 [income spec catch-up 行為](recurring-income-design.md#catch-up-行為)：
- 每日跑、每規則前進 1 期
- pause→resume：`resumeRule` server action snap `next_occurrence_at` 到未來最近 anchor，不補登
- cron outage：每天最多補 1 期，連續 N 天才追上
- 規則刪除：server action 軟刪 + 級聯軟刪 active pendings

---

## Server actions

新增 [actions/recurringExpense.ts](../../../actions/recurringExpense.ts)，8 個 action 完全對應 income 版：

| Income action（既有） | Expense action（新增） | 差異點 |
|---|---|---|
| `createRule(RecurringIncomeRuleInput)` | `createRule(RecurringExpenseRuleInput)` | input 多 `paidBy` / `splitType` / `description` 三欄；少 `recipientId` / `source` |
| `updateRule(UpdateInput)` | `updateRule(UpdateInput)` | 同上 |
| `pauseRule(id)` / `resumeRule(id)` | mirror | resume 時 snap next_occurrence 邏輯一致（reuse `snapToFuture` helper，移到 `lib/recurring.ts` 共用） |
| `softDeleteRule(id)` | mirror | 同 transaction 內：UPDATE rule deleted_at + 軟刪 active pendings |
| `confirmPending(pendingId)` | `confirmPending(pendingId)` | INSERT `cashTransactions`（用 snapshot 欄位）+ UPDATE pending.resolvedTxId + balance 重算（既有 hook） |
| `editAndConfirmPending(pendingId, fields)` | mirror | 開 AddSheet（不是 IncomeSheet），prefill 全欄；submit 時同 transaction INSERT cashTransactions + UPDATE pending |
| `skipPending(pendingId)` | mirror | UPDATE pending.skippedAt = NOW() |

`balance.ts` 重算邏輯不動：cashTransactions 既有 trigger / hook 在 confirmPending 寫入後會自動跑（對照 [actions/transaction.ts](../../../actions/transaction.ts) `createTransaction`）。

### Validators

新增 `validateRecurringExpenseRuleInput` in [lib/validators.ts](../../../lib/validators.ts)，mirror `validateRecurringIncomeRuleInput` 但欄位差異（`paidBy` / `splitType` / `description` / `category` ∈ PICKABLE_CATEGORIES）。

### 共用 helpers 抽出

把 [lib/recurringIncome.ts](../../../lib/recurringIncome.ts) 的 `firstAnchorFromStart` / `snapToFuture` / `computeNextOccurrence` 改名為 `lib/recurring.ts`，**純日期工具**不帶 income 語意；income 與 expense 共用。

> **Refactor 範圍**：lib 層搬移 + import 路徑更新，不改邏輯。順手做，不另開單。

---

## UI/UX

### 1. Asset 關聯設計細節

**選填 + 不限 type**（鎖定決策）。

UX：
- `RecurringRuleSheet`（expense 版）的 asset picker 跟 AddSheet 既有的 `AssetPickerSheet` 重用元件、行為完全一致
  - 顯示 group 內所有未軟刪 assets，按 type 分組（既有 v0.8.1 實作）
  - 預設「無關聯」
  - 選了之後顯示 chip + 「移除」按鈕
- 規則卡片（settings 列表 + Dashboard pending）顯示：
  - 有 asset：mono chip + asset name + amount（`[住] 房租・台北家 · NT$ 25,000`）
  - 無 asset：mono chip + description + amount（`[住] 房租 · NT$ 25,000`）
- 不在 form 上加文案教育「這可以連到房子」。讓使用者先發現 picker 就好（克制）。

**Asset 軟刪除的規則處理**：cron 自動 set `paused_at`（見 cron 邏輯）。Settings 列表頁顯示該規則進入「已暫停（關聯愛物已刪除）」灰色狀態，提示用戶可編輯規則改 asset 或移除關聯後 resume。**不**自動把 asset_id set null（保留審計線索：用戶想知道「這條規則本來連到什麼」）。

### 2. Dashboard 支出模式呈現

**位置**：BalanceHero **上方**（鏡像 income 版位置）。

```
┌─────────────────────────────────────┐
│  [BrandHeader / ModeTogglePill]     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ PendingExpenseStack         │   │  ← 新增
│  │   (這幾筆等你看看)            │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ BalanceHero                 │   │  ← 既有
│  │   X 還你 NT$ Y              │   │
│  └─────────────────────────────┘   │
│                                     │
│  [TransactionFeed]                  │
└─────────────────────────────────────┘
```

進帳模式時 `PendingExpenseStack` 不顯示，跟 income 版對稱（income stack 在進帳模式、expense stack 在支出模式）。

**卡片 anatomy**：

```
┌──────────────────────────────────────────────┐
│ [住] 房租・台北家                              │
│      5/1（提示日）       NT$ 25,000           │
│      你付・對半分                              │
│                                              │
│ [就這樣]      [改一下]    [跳過]              │
└──────────────────────────────────────────────┘
```

**視覺差異**（vs income card）：
- 卡片 glow 色：用該規則 `category` 的 `tint`（既有 [lib/categories.ts](../../../lib/categories.ts) 已定義 10 種 tint 色）
  - 房租（住）→ 米色 glow
  - 訂閱（樂）→ 淺粉
  - 保費（融）→ 淺藍
- 不混 mint（保留「mint = 進帳」的視覺鎖）
- Glow 強度跟 income mint glow 對等（弱 layer），不刺眼
- 「你付・對半分」這行新增（rule.paidBy 顯示為「你」/「對方名稱」，rule.splitType 顯示為「對半分」/「全你出」/「全對方出」）—Solo Mode 隱藏整行（沒有對方）

**多張規則同期排序**：按 `proposed_date ASC`，最早的最上面。

**UI 細節**（既有 PendingIncomeStack 已有的設計，expense 版 mirror）：
- 預設顯示 2 張、超過收進「展開全部（還有 N 筆）」按鈕
- 第二張以後 `scale(0.98)` + `-mt-2` stacked 視覺
- 每張可整卡點擊展開查看 source / asset / paidBy / splitType 詳細

### 3. Pending dot on mode pill

`ModeTogglePlaceholder` 既有 props `pendingCount?: number`（v0.10.0 ship）顯示 income dot。本 spec 擴 props：

```ts
interface Props {
  mode?: 'expense' | 'income'
  onChange?: (mode: 'expense' | 'income') => void
  incomePendingCount?: number   // 既有 pendingCount 改名
  expensePendingCount?: number  // 新增
}
```

行為：
- mode='income' 時，**支出 pill** 上若 `expensePendingCount > 0` 顯示 dot
- mode='expense' 時，**進帳 pill** 上若 `incomePendingCount > 0` 顯示 dot
- 已選中的 pill 不顯示 dot（看見當前模式內容、不需提示）

> **既有 prop 改名範圍**：`pendingCount` → `incomePendingCount` 是 breaking 但同 PR 內全 codebase 替換（搜尋顯示僅 Dashboard.tsx 一處 wiring，無外部依賴）。

### 4. Records tab「設定定期…」入口

**設計**：sticky tab bar 下方加一條 inline link 區，按 tab 動態切換顯示。

```
┌────────────────────────────────────┐
│ [標題：紀錄]                         │
│ [篩選 chip] (expense / all tab 顯示) │
│ [tab bar: 全部 | 支出 | 進帳]        │  ← 既有 sticky
├────────────────────────────────────┤
│       ⚙ 設定定期支出 →              │  ← 新增 inline link
│                                    │
│ [feed list...]                     │
└────────────────────────────────────┘
```

**Tab 切換行為**：
- `tab='expense'` → 顯示「⚙ 設定定期支出 →」（連到 `/settings/recurring-expense`）
- `tab='income'` → 顯示「⚙ 設定定期進帳 →」（連到 `/settings/recurring-income`）—**順手補上**，定期收入 spec [Phase 2](recurring-income-design.md#L153) 點名但未 ship
- `tab='all'` → **不顯示**（保持 all tab 視覺乾淨；要管理請先選具體 tab）

**樣式**：
- 字級：`var(--fs-xs)`
- 顏色：`var(--ink-3)`
- 對齊：右對齊（不破壞 feed 主視覺重心）
- 不放在 sticky 區（會佔空間）；放在 sticky 下方第一條，scroll 後自然消失

### 5. Settings 子頁 `/settings/recurring-expense`

完全 mirror [既有 `/settings/recurring-income`](../../../app/%28dashboard%29/settings/recurring-income/) 的架構：
- Server component layout
- 列表頁（rules + 暫停 toggle + 編輯/刪除 menu）
- 新增/編輯走 `RecurringRuleSheet`（expense 版，新元件但與 income 版架構一致）
- 空狀態用 constellation + halo（光點品牌語言）

**與 income 版的 form 欄位 diff**：
- 移除：「收入歸誰」（recipient toggle）
- 新增：「誰付」（PayerToggle 復用 [lib/components/PayerToggle.tsx](../../../app/%28dashboard%29/dashboard/_components/PayerToggle.tsx)）
- 新增：「分攤方式」（SplitTypeSelector 復用 [既有元件](../../../app/%28dashboard%29/dashboard/_components/SplitTypeSelector.tsx)）
- 「source 備註」改名「description 描述」+ 改為**必填**
- 類別 picker：用 `PICKABLE_CATEGORIES`（10 - settle = 9）

**Settings 主頁 `/settings/`** 加一筆「定期支出」項目（在「定期進帳」下方）。

### 6. 與 AddSheet 整合（「改一下」流程）

mirror [income 「改一下」流程](recurring-income-design.md#L185)：

1. 點 Pending card「改一下」
2. 開 **AddSheet**（不是 IncomeSheet），prefilled 全欄：
   - amount = pending.proposedAmount
   - description = pending.proposedDescription
   - category = rule.category
   - paidBy = pending.proposedPaidBy
   - splitType = pending.proposedSplitType
   - transactedAt = pending.proposedDate
   - assetId = rule.assetId
3. AddSheet 內 hidden state 帶 `pendingId`
4. 用戶 submit → `editAndConfirmPending(pendingId, fields)`：
   - 同 transaction：INSERT cashTransactions + UPDATE pending.resolvedTxId
   - 同時觸發 balance 重算（既有 hook）
5. 成功後 sheet 關閉，dashboard 卡片 fade out

AddSheet 既有 props 需擴：`pendingExpenseId?: string`（hidden state；submit 時 server action 切換為 editAndConfirmPending 路徑）。對應 IncomeSheet 既有的 `pendingId` prop pattern。

### 7. 動作層級 + Skip confirm

完全 mirror income：
- Primary「就這樣」→ 直接 confirm（無 confirm dialog）
- Secondary「改一下」→ 開 AddSheet
- Tertiary「跳過」→ confirmation toast「跳過 5/1 的房租？」（避免反射性消除）

---

## i18n 鍵值命名

### 設計原則

1. **新建立 `recurringExpense.*` namespace**（集中、結構完整）
2. **同步整理出 `recurringIncome.*` namespace**：把現有散在 `incomeSheet` / `balanceHero` / hardcode 中文的 settings/recurring-income 字串 refactor 進來——同時還掉 [issue #21](https://github.com/redtear1115/oikos/issues/21) 的「設定子頁 i18n」一部分
3. 兩個 namespace **結構鏡像對稱**，未來新增 key 可以雙邊同步

### 既有 key 整理（順手做）

[issue #21](https://github.com/redtear1115/oikos/issues/21)（i18n 設定子頁翻譯）涵蓋 `recurring-income`。本 spec 順手把 recurring-income 的字串整理進 `recurringIncome.*` namespace（current `app/(dashboard)/settings/recurring-income/_components/` 內的硬寫中文），確保 income / expense 雙邊命名一致。

### Namespace 結構（mirror）

```ts
// lib/i18n/locales/zh-TW.ts (Translations type 增補)

recurringIncome: {
  title: string                      // 「定期進帳」
  empty: { title: string; cta: string }
  rule: {
    chip: string                     // 「{mono} {category}」（dynamic interpolation 用 ${} 拼）
    everyMonth: string               // 「每 {n} 個月 · {day} 號」
    pausedHint: string               // 「已暫停」
  }
  pending: {
    sectionLabel: string             // 「這幾筆等你看看」
    primaryAction: string            // 「就這樣」
    editAction: string               // 「改一下」
    skipAction: string               // 「跳過」
    skipConfirm: string              // 「跳過 {date} 的 {description}？」
    expandAll: string                // 「展開全部（還有 {n} 筆）」
    collapse: string                 // 「收合」
  }
  sheet: {
    titleNew: string
    titleEdit: string
    amountLabel: string
    categoryLabel: string
    recipientLabel: string           // income 特有
    sourceLabel: string              // income 特有
    intervalLabel: string            // 「每 [N] 個月」
    dayOfMonthLabel: string          // 「每月 [N] 號」
    startsOnLabel: string
    endsOnLabel: string
    assetLabel: string
    save: string
    delete: string
    cancel: string
  }
  errors: {
    amountRequired: string
    sourceRequired: string           // (若改必填) — income 暫保選填，這 key 預留
  }
  raceMessage: string                // 「這筆 partner 剛剛已處理」
}

recurringExpense: {
  title: string                      // 「定期支出」
  empty: { title: string; cta: string }
  rule: {
    chip: string                     // 同上
    everyMonth: string
    pausedHint: string
    pausedAssetDeleted: string       // expense 特有：「已暫停（關聯愛物已刪除）」
  }
  pending: {
    sectionLabel: string             // 同 income
    primaryAction: string            // 「就這樣」
    editAction: string
    skipAction: string
    skipConfirm: string
    expandAll: string
    collapse: string
    payerLine: string                // expense 特有：「{payer}・{splitType}」
  }
  sheet: {
    titleNew: string
    titleEdit: string
    amountLabel: string
    categoryLabel: string
    payerLabel: string               // expense 特有
    splitTypeLabel: string           // expense 特有
    descriptionLabel: string         // expense 特有（必填）
    intervalLabel: string
    dayOfMonthLabel: string
    startsOnLabel: string
    endsOnLabel: string
    assetLabel: string
    save: string
    delete: string
    cancel: string
  }
  errors: {
    amountRequired: string
    descriptionRequired: string      // expense 特有
  }
  raceMessage: string
}

records: {
  // 既有
  title: string
  tabAll: string
  tabExpense: string
  tabIncome: string
  // 新增（Records tab 入口）
  manageRecurringExpense: string     // 「設定定期支出 →」
  manageRecurringIncome: string      // 「設定定期進帳 →」
}

settings: {
  // 既有 + 新增
  recurringIncome: string            // 「定期進帳」（settings 主頁清單項）
  recurringExpense: string           // 「定期支出」（新增）
  ...
}
```

### Interpolation 規則

依[既有 i18n spec 鎖定](i18n-design.md#L34)：「遇到動態量詞採 `${count} 筆紀錄` 直接拼，不引 ICU MessageFormat」。

具體做法（已在 codebase 用過）：i18n value 含 `{n}` / `{day}` / `{date}` 等 token，client / server 拼字串時用 `t.recurringExpense.rule.everyMonth.replace('{n}', n.toString()).replace('{day}', day.toString())` 或專用 helper。**不引入 ICU**。

### 4 語字典工作量

每個 namespace 約 30 keys × 4 語 = 120 條。但結構鏡像（recurring{Income,Expense} 完全對稱），實際每語只翻 30 條（另 30 條從 income 鏡像微調）。

---

## 邊界情況

繼承 [income spec 邊界表](recurring-income-design.md#邊界情況)；本表只列**支出特有或差異**的 case：

| 情境 | 行為 |
|---|---|
| 規則 `paid_by` 不在 group（partner 被踢出） | 跟 income recipient 處理一致：cron 跑前 join 檢查，set `paused_at`；用戶到設定頁可編輯改 paid_by 後 resume |
| 規則 `asset_id` 指向已軟刪除的 asset | cron 自動 set `paused_at`；settings 頁顯示「已暫停（關聯愛物已刪除）」狀態；用戶編輯規則移除關聯或改 asset 後 resume |
| Solo Mode 下建立規則 | `paid_by` 自動填本人、`split_type` 鎖 `all_mine`、PayerToggle / SplitTypeSelector 隱藏（mirror AddSheet Solo Mode） |
| Solo Mode → 雙人模式（partner 加入） | 既有規則 `paid_by` / `split_type` 不變動；用戶可手動編輯改 split_type=half / paid_by=partner |
| Pending 確認後 user soft-delete cashTransaction | cashTransactions.deletedAt 設定；balance 重算；pending.resolvedTxId 保留（指向已軟刪除 tx） — **不還原** pending（mirror income） |
| Pending 確認時 paid_by 已不在 group | 在 server action 內 race check：若 `proposed_paid_by` 不在 group，回 race message「請先到設定頁修改規則」、不寫入 |
| 規則編輯 amount / description / category | snapshot 不動既有 active pending（mirror income）；下期才用新值 |
| 規則編輯 paid_by / split_type | 同上：snapshot 不動已產 pending |
| 兩裝置同時點「就這樣」 | mirror income：第二個 race，回「partner 剛剛已處理」 |
| 規則 day_of_month=31，遇到 2 月 | clamp 到 28/29（reuse `compute_next_occurrence`） |

---

## 風險與權衡

1. **Cash flow 邏輯複雜度**：cashTransactions 涉及 balance 重算（vs income 不影響欠款），confirmPending 一定要在 server action 內走既有 `createTransaction` 同樣的 atomic + balance hook 路徑。**測試矩陣**必含「pending confirm 後 balance 是否正確」（雙人 / Solo Mode 分別驗）。

2. **Snapshot vs Live 心智模型**：用戶會困惑「規則改了金額為什麼這個月還是舊的」。**緩解**：規則編輯頁顯示 hint「變動會從下期 pending 開始套用，已產的這 N 筆不變」（一句話、不擋送出）。MVP 不在 pending 卡片顯示「規則已改」hint（YAGNI）。

3. **與既有 settle category 的衝突**：UI 強制 `PICKABLE_CATEGORIES`，server validator 也擋 settle category；但理論上若有 client bypass 直接 POST，server 端 `validateRecurringExpenseRuleInput` 必須 reject。**測試**含此 case。

4. **AddSheet 的 pendingExpenseId 路徑增加複雜度**：AddSheet 已有編輯模式（editId）+ 新增模式，現在再加 pending 模式（pendingId）。三個 mode 切換邏輯需清楚拆。**緩解**：mirror IncomeSheet 既有 pending mode pattern（已驗證），照搬即可。

5. **Asset auto-pause 行為的 surprise factor**：用戶軟刪除房子（搬家），房租規則靜默暫停。可能想保留規則繼續記錄（但已不關聯該房）。**緩解**：settings 列表頁的 paused 狀態文案明確「已暫停（關聯愛物已刪除）」，並提供「移除關聯」快捷按鈕；不強迫用戶刪規則。

6. **Pending 卡片 category-tint 視覺與 income mint 對比**：要避免 category tint 中 mint-ish 的色（financial 的 `#D8DFF0` 偏藍紫不衝突，但若日後新增類別需注意）。**目前 9 個 category tint 都不撞 mint**，此風險可接受；新增 category 時加 visual review checklist。

---

## 範疇與工時估算

| 工作項 | 估時 |
|---|---|
| Schema：`RecurringExpenseRules` + `PendingExpenseOccurrences` table（drizzle migration `0021`） | 0.5d |
| Schema：RLS / Realtime publication / 索引 | 0.25d |
| pg_cron `generate-pending-expense` + 擴充 `cleanup-soft-deleted` | 0.5d |
| Validators：`validateRecurringExpenseRuleInput` | 0.25d |
| Server actions（8 個 mirror + asset assertion） | 1.5d |
| `lib/recurring.ts` 抽出共用 helpers（rename + import 更新） | 0.25d |
| DB queries：list / get / pending list（mirror `lib/db/queries/recurringIncome.ts`） | 0.5d |
| `RecurringRuleSheet`（expense 版） + Settings 頁 `/settings/recurring-expense` | 1.5d |
| Settings 主頁加項目「定期支出」 | 0.25d |
| `PendingExpenseStack` + `PendingExpenseCard`（dashboard） | 1d |
| `ModeTogglePlaceholder` 擴 `expensePendingCount` prop | 0.25d |
| Dashboard wiring：load pending 資料 + 接 RealtimeProvider INSERT/UPDATE event | 0.5d |
| AddSheet 加 `pendingExpenseId` 模式 + `editAndConfirmPending` wiring | 0.75d |
| Records tab inline link「設定定期支出/進帳」 | 0.25d |
| i18n：新增 `recurringExpense.*` 4 語 + 整理 `recurringIncome.*` 4 語 | 1d |
| Spec / CLAUDE.md / CHANGELOG 更新 | 0.25d |
| QA：dev + prod migration、Solo Mode、雙人模式、partner Realtime、edge cases | 0.5d |
| **合計** | **~9.5 dev days** |

> 比第一輪 brainstorm 估的 5–7d 略高（+2d）。主因：(1) i18n namespace 順手整理 income 端、(2) AddSheet pendingExpenseId 模式新增、(3) 比 income 多 paid_by / split_type / asset auto-pause 三個維度。

---

## v0.12.0 PR 拆分

5 個 PR、依賴呈線性主軸 + i18n 旁支可並行。每個 PR 都可以獨立 review / merge，不會把使用者卡在半成品狀態。

### PR #1 · 基礎：schema + cron + helpers + validators

**範圍**
- `drizzle/0021_recurring_expense.sql`：`RecurringExpenseRules` + `PendingExpenseOccurrences` 兩張表 + RLS + Realtime publication + 索引
- pg_cron `generate-pending-expense`（每日 16:00 UTC，含 asset auto-pause join 邏輯）
- 擴充 `cleanup-soft-deleted` cron（rules 1 年、skipped pendings 90 天）
- `lib/db/schema.ts`：兩張新 table 的 Drizzle schema 定義
- `lib/recurring.ts`：rename from `lib/recurringIncome.ts`，更新所有 import 路徑（純位移、無邏輯變動）
- `lib/validators.ts`：`validateRecurringExpenseRuleInput`（`paidBy` / `splitType` / `description` NOT NULL / category ∈ PICKABLE_CATEGORIES）
- 既有 `compute_next_occurrence` SQL helper **直接 reuse**，不重建

**依賴**：無
**工時**：~1.75d
**Session title**：`feat(recurring-expense): foundation — schema, cron, validators`

**驗證**：dev + prod 兩個 Supabase 各跑一次 migration、`npm run db:studio` 確認兩張表存在、psql `SELECT cron.jobname FROM cron.job` 確認 `generate-pending-expense` 已 schedule

---

### PR #2 · Server actions + DB queries

**範圍**
- `actions/recurringExpense.ts`：8 個 server action mirror income
  - `createRule` / `updateRule` / `pauseRule` / `resumeRule` / `softDeleteRule`
  - `confirmPending`（同 transaction：INSERT cashTransactions + UPDATE pending.resolvedTxId + balance 重算 hook）
  - `editAndConfirmPending`（同上但接受 user 修改 fields）
  - `skipPending`
- `lib/db/queries/recurringExpense.ts`：list rules / get rule / list active pendings for group / get pending by id
- Asset assertion helper（reuse 或從 `actions/recurringIncome.ts` 抽出共用）
- Race guard：confirmPending / editAndConfirmPending 處理 partner 已 confirm / skip 的 case，回 race message
- `resumeRule` snap to future helper（reuse `lib/recurring.ts`）

**依賴**：PR #1（schema + helpers）
**工時**：~2d
**Session title**：`feat(recurring-expense): server actions + db queries`

**驗證**：unit test 寫 5 個 path（happy / pause→resume / soft delete / race / asset auto-pause 模擬）；`npm run test:run` 全綠；無 UI 變動所以 friend test 環境不受影響

---

### PR #3 · i18n：`recurringExpense.*` 新增 + `recurringIncome.*` 重整

**範圍**（已 confirmed 在同一 PR）
- `lib/i18n/locales/{zh-TW,zh-CN,en,ja}.ts`：新增 `recurringExpense.*` namespace（~30 keys × 4 語）
- 同檔案：整理 `recurringIncome.*` namespace — 把 `app/(dashboard)/settings/recurring-income/_components/` 內的硬寫中文搬入字典（~30 keys × 4 語）
- `Translations` type 更新：兩個 namespace 完整定義
- 新增 `records.manageRecurringExpense` / `records.manageRecurringIncome` keys
- 新增 `settings.recurringExpense` / `settings.recurringIncome` 主頁項目 keys
- **同 PR 範圍內接 income 端 UI**：把 `settings/recurring-income/_components/*.tsx` import `useTranslations()` 換掉硬寫中文（PR #4-5 的 expense UI 才用得到 expense keys，但 income 端的清理當下就完成）

**依賴**：無（純文字 + recurring-income 既有 UI rewire）
**並行**：可與 PR #1 / #2 同時進行，互不衝突
**工時**：~1d
**Session title**：`i18n(recurring): expense namespace + income cleanup`

**驗證**：4 語切換 `/settings/recurring-income` 子頁全部接通；`tsc` 無紅字（type 強制每語每 key 都填）

---

### PR #4 · Settings 子頁 + Dashboard pending stack

**範圍**
- `app/(dashboard)/settings/recurring-expense/page.tsx`（server component）+ `_components/RecurringExpenseContent.tsx`（client shell）
- `RecurringRuleSheet`（expense 版新元件）— form 欄位：amount / category / payer / splitType / description / interval / dayOfMonth / startsOn / endsOn / asset
  - PayerToggle / SplitTypeSelector / AssetPickerSheet 全部 reuse 既有元件
  - Solo Mode 鎖 `paid_by=本人` + `split_type=all_mine`，picker 隱藏
- Settings 主頁加項目「定期支出」（在「定期進帳」下方）
- `PendingExpenseStack` + `PendingExpenseCard`（dashboard 元件，mirror income 結構，差異在 category-tint glow 與 payer line）
- `ModeTogglePlaceholder` prop 改名：`pendingCount` → `incomePendingCount` + 新增 `expensePendingCount`（已 confirmed breaking + 同 PR 替換）
- `Dashboard.tsx` wiring：
  - server-side load active pending list（call `listActivePendingExpenses`）
  - 傳給 PendingExpenseStack
  - 傳給 ModeTogglePlaceholder 算 dot
  - RealtimeProvider 接 INSERT / UPDATE event for `RecurringExpenseRules` + `PendingExpenseOccurrences`
- 「就這樣」/「跳過」path 接通（call confirmPending / skipPending）
- 「改一下」path 在這個 PR 暫時 disabled（顯示 disabled 樣式 + console.warn `// wired in PR #5`），不 broken

**依賴**：PR #1（schema）+ PR #2（actions）+ PR #3（i18n keys）
**工時**：~3.5d
**Session title**：`feat(recurring-expense): settings page + dashboard pending stack`

**驗證**：建一個 rule（每月 1 號 房租 25000）、psql 手動把 `next_occurrence_at` set 為今天、cron job 跑一次（`SELECT cron.run('generate-pending-expense')` 或等隔天 16:00 UTC）→ 確認 dashboard 看到卡片、按「就這樣」確認落 cashTransactions、balance 重算正確、partner 端 realtime 看到卡片消失；Solo Mode 開新規則 form 確認 payer / split UI 隱藏

---

### PR #5 · AddSheet「改一下」+ Records 入口 + v0.12.0 release

**範圍**
- AddSheet 加 `pendingExpenseId?: string` prop（mirror IncomeSheet `pendingId` pattern）
- AddSheet submit path 在 `pendingExpenseId` 存在時走 `editAndConfirmPending` 而非 `createTransaction`
- PendingExpenseCard「改一下」按鈕 wire 到 AddSheet 開啟（prefill 全欄 + 帶 pendingExpenseId）
- Records sticky tab bar 下方 inline link 區
  - tab='expense' → 「⚙ 設定定期支出 →」
  - tab='income' → 「⚙ 設定定期進帳 →」（同步補上 income 端 entry，[recurring-income-design.md Phase 2 點名未 ship](recurring-income-design.md)）
  - tab='all' → 不顯示
- `CLAUDE.md` 版本表加入 v0.12.0；關掉對應 issues（[#18](https://github.com/redtear1115/oikos/issues/18) 定期支出主議題、[#21](https://github.com/redtear1115/oikos/issues/21) i18n 設定子頁的 `recurring-income` 部分）
- `CHANGELOG.md` 新增 v0.12.0 entry（Added / Changed / Database）
- `package.json` version → `0.12.0`
- spec self-review pass（補實作中發現的細節）

**依賴**：PR #4
**工時**：~1.5d
**Session title**：`feat(recurring-expense): add-sheet edit mode + records entry + v0.12.0`

**驗證**：「改一下」open AddSheet 後 prefill 全欄正確；改金額後送出 → cashTransactions 落新值、pending.resolvedTxId 指到新 tx、balance 重算正確；race case：partner 已 confirm 時 client refresh 看到 pending 消失；Records 三個 tab 切換 link 顯示正確；release 流程走 `git-develop:release` skill（如果使用）

---

### 並行性

```
時間軸（單人 dev）：
  PR #1 ──→ PR #2 ──┐
                    ├──→ PR #4 ──→ PR #5
  PR #3 ────────────┘

時間軸（雙人 dev）：
  Dev A：  PR #1 ──→ PR #2 ──┐
                              ├──→ PR #4 ──→ PR #5
  Dev B：  PR #3 ─────────────┘
```

**critical path**（單人）= 1.75 + 2 + 1 + 3.5 + 1.5 ≈ **9.75d**
**critical path**（雙人並行）= 1.75 + 2 + max(1, 0) + 3.5 + 1.5 ≈ **8.75d**（PR #3 與 PR #1+#2 並行省 ~1d）

### 風險集中於 PR #4

PR #4 是最重的（3.5d），且包含三個新元件（RecurringRuleSheet / PendingExpenseStack / PendingExpenseCard）+ 一個 prop breaking change。**緩解**：
- 接 PR 前先 review 既有 PendingIncomeStack / PendingIncomeCard / RecurringRuleSheet（income 版）程式碼，照搬結構
- 「改一下」disabled state 在 PR #4，避免半 wired path 出現在 prod
- 如果 review 發現 PR #4 過大，可以再拆「Settings 子頁」與「Dashboard pending stack」為兩個 PR（依賴：兩者都依 #1+#2+#3，彼此獨立）

---

## 排程

### v0.12.0 必做

全部本 spec scope，含 Records tab 入口（同步補上 income 端），含 i18n 4 語。

### v0.13.0+ 候選（不在本 spec lock）

- **PendingIncome 也加 snapshot 欄位**（recipient_id / source）— 對齊本 spec 的 snapshot 完整性
- **「Save as recurring」toggle on AddSheet 一次性記帳後**：跟 income spec Phase 3 對稱
- **規則衝突偵測**（建立兩條一樣的規則時提示）
- **雙週週期**：需重新設計 anchor 模型
- **支出側 budget 預算告警**：明確不在本 spec scope

---

## Open / deferred questions

1. **Pending 卡片顯示「累計第 N 期」**？例如用戶想知道「這是這個房租規則的第 12 期」。**MVP 不做**（要算就要 join 歷史 transactions + skipped count，YAGNI）。
2. **Settings 列表頁顯示「下次提示日」倒數**？例如「再 3 天提示」。**MVP 不做**（會改得花俏，先看用戶行為）。
3. **Recurring expense 在 Records 月份 header 是否標記特別 icon**（區分「此筆來自定期規則」）？**MVP 不做**（confirmedPending tx 在 cashTransactions 表內無 ruleId column；保留 cashTransactions schema 不動是優先）。若日後用戶問「我哪些是定期的」需求強，再加 nullable `recurring_expense_rule_id` FK column。
4. **AddSheet 編輯一筆 confirmedPending 對應 cashTransaction 時的 UX**：用戶點該筆編輯，行為與一般 cashTransactions 編輯一致（soft delete + insert）。但這時 `pendings.resolvedTxId` 指向已軟刪 tx（dangling）。**MVP 接受**：pending 不還原，使用者實際上等於「跳過原規則本期 + 自己手動記了一筆替代」。
5. **是否預埋「保險詳情頁自動 suggest 建立定期支出規則」**？即用戶建立年繳保單時，hint「要不要設定每年自動提示繳費？」。**留 v0.13+**（與 [insurance-design.md](insurance-design.md) 整合）。

---

## 索引

- 既有 income spec：[recurring-income-design.md](recurring-income-design.md)
- Income migration（schema / cron / RLS pattern 直接 mirror）：[drizzle/0016_recurring_income.sql](../../../drizzle/0016_recurring_income.sql)
- Income server actions：[actions/recurringIncome.ts](../../../actions/recurringIncome.ts)
- Income helper（將抽出共用）：[lib/recurringIncome.ts](../../../lib/recurringIncome.ts) → `lib/recurring.ts`
- CashTransactions schema：[lib/db/schema.ts](../../../lib/db/schema.ts)
- AddSheet（要加 pendingExpenseId 模式）：[app/(dashboard)/dashboard/_components/AddSheet.tsx](../../../app/%28dashboard%29/dashboard/_components/AddSheet.tsx)
- ModeTogglePlaceholder（要擴 expensePendingCount）：[app/(dashboard)/dashboard/_components/ModeTogglePlaceholder.tsx](../../../app/%28dashboard%29/dashboard/_components/ModeTogglePlaceholder.tsx)
- Records list（要加 inline link）：[app/(dashboard)/records/_components/RecordsList.tsx](../../../app/%28dashboard%29/records/_components/RecordsList.tsx)
- Categories（PICKABLE_CATEGORIES 來源）：[lib/categories.ts](../../../lib/categories.ts)
- i18n design：[i18n-design.md](i18n-design.md)
- 設計原則：[CLAUDE.md](../../../CLAUDE.md) → 設計原則
