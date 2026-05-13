---
status: shipped
first_shipped_in: v0.15.3
related_specs: [transactions, income, monthly-review, realtime]
related_issues: ["#207"]
---

# Epoch Read-Only 與 Read-Path 型別防呆

> 讓「transaction 完整歸屬於某段 epoch」這件事在系統中是**結構性保證**而非靠記憶。
> 涵蓋所有 transaction-class 寫入（cash / income / settlement / fuelLog）+ 所有 transaction-class 讀取查詢。

---

## 背景

兩條互為表裡的 bug 在同一輪 audit 被發現：

**Bug A（read-side leak）**：`/dashboard` 的 `BalanceHero` 在收錄模式（pin 在 past epoch）下顯示的「本月進帳」總額會吃進其他 epoch 的進帳。Root cause：`listIncomeMonthSummary` 沒接受 `epochWindow` 參數，SQL 只 by `group_id + occurred_at` 月份過濾。同檔案的姊妹 query 都有正確套，只有月度總額這支漏了。

**Bug B（write-side ghost migration）**：所有寫入 server action 只用 `getActiveGroupForUser`，不檢查 past-epoch cookie。意思是使用者 pin 在過去章節時：

1. UI 沒 guard，編輯/刪除按鈕照常顯示
2. 點編輯 → soft delete + insert 新 row（atomic tx）
3. 新 row 的 `created_at = now()` 落在 current epoch 的 window
4. 在 past epoch view 裡：原 row soft-delete 消失、新 row 因為 `created_at` 在另一段 window 也看不見 → **整筆紀錄從過去章節人間蒸發**
5. balance cache 全量重算，新 row 真實計入 → 翻回 current epoch 才看得到

兩條 bug 的本質是同一個：**transaction 屬於哪段 epoch 沒有結構性保證，是靠 callers 記得帶 epochWindow 過濾。**

## 產品立場

> 「故事已經翻頁了 別糾結了 記錯就記錯 記錯也是一種回憶」

過去章節 read-only 是**產品哲學**決策，不是技術限制：

- 「修改過去」的語意本身模糊（修正當時記錯 vs 改變歷史），與 Futari「陪伴而非工具」核心定位衝突
- 容許跨章節編輯會讓「章節」這個情感容器失去意義
- 反向開門（之後若要支援「修正當時記錯」）比關門容易，先收緊

## 設計

雙軌綁定，**必須一起出**——拆開做沒意義（型別防呆只在政策成立時才是「可證明正確」的）。

### Part 1：政策層 — 過去章節 read-only

所有寫入 transaction-class 的 server action 入口加 guard：pin 在 past epoch 時 throw。同時把 group context 取得從 `getActiveGroupForUser` 改用 `resolveViewerEpochContext`，讀寫兩條路用同一個 helper。

需要 guard 的 action 範疇（以 audit 結果為準）：

| File | Actions |
|---|---|
| `actions/transaction.ts` | `createTransaction` / `editTransaction` / `softDeleteTransaction` |
| `actions/income.ts` | `createIncome` / `editIncome` / `softDeleteIncome` |
| `actions/settlement.ts` | 建立 / 刪除 |
| `actions/fuelLog.ts` | 建立 / 編輯 / 刪除 |

**明確不擋的**：
- `actions/epoch-view.ts`（操控 pin 狀態本身，不是寫 transaction）
- `actions/auth.ts` / `actions/profile.ts`（跟 epoch 無關）
- `actions/membership.ts` leave / swap（本身就是會關舊 epoch 開新 epoch 的動作）
- `actions/recurringIncome.ts` / `actions/recurringExpense.ts`（規則 CRUD，跨 epoch 持續存在）
- `actions/monthlyReview.ts`（月度概念跟 epoch 兩條軸，不混）
- `actions/asset.ts`（愛物是長存物件，不歸屬單一 epoch）

UI 層在 pin 狀態收掉編輯入口（**入口直接不渲染**）：/records row tap-to-edit、swipe-to-delete、各頁的 FAB、asset 詳情頁 +Add、任何「編輯/刪除」按鈕。`isPast` 旗標由 dashboard layout 從 `resolveViewerEpochContext` 派生後 prop drilling 餵下去——**single source of truth 來自 server-side，不在 client 重做判斷**。

Server action reject 是 last line of defense。

### Part 2：型別防呆層 — read query 強制傳 epochWindow

所有 transaction-class read query 的 `epochWindow` 從 optional 改 required。新增 query 預設就會被逼帶參數，TypeScript 在 compile 時 catch 任何漏帶。

**明確的例外**：
- `GroupBalance` 表是 per-group 單列 cache，本來就不分 epoch（這是另一個結構問題，留 backlog）
- `pg_cron` 清掃 deleted_at 的 job（跑全表）
- 月度回顧 snapshot 相關（月份概念跟 epoch 兩條軸）

## 為什麼 Part 1 + Part 2 必須綁一起

只做 Part 2 不做 Part 1：過去章節仍可編輯 → 編輯產生的新 row `created_at = now()` 落到 current epoch → 在過去章節 view 用 epochWindow 過濾後新舊都看不見 → 紀錄「人間蒸發」（Bug B 重現）。

只做 Part 1 不做 Part 2：寫入路徑乾淨了，但讀取路徑仍可能有 query 漏掉 epochWindow（Bug A 重現），新加的 query 沒人擋。

兩個是配套：Part 1 保證寫入永遠落在 current epoch（確保 `created_at` 跟 epoch window 的關係是 lossless 的）；Part 2 用型別系統強制讀取永遠帶 epoch window 過濾。

## 為什麼不加 `epoch_id` schema 欄位

Brainstorming 過程中討論過「給 `CashTransactions` / `IncomeTransactions` 加 `epoch_id` FK」這個方案，但最終否決：

1. **Part 1 政策成立後，timestamp 推導本身就是 lossless 的**（每筆 tx 的 `created_at` 落在恰好一個 epoch 的 `[startedAt, endedAt)` 區間內，by construction）
2. **正確性已經由 Part 1 保證**，加 `epoch_id` 不解決任何新的正確性問題
3. **Part 2 已經提供同等的「忘記過濾就 compile error」防呆**
4. Schema migration、backfill、4 個 table 改寫入路徑、改讀取查詢的成本，換到的是純 ergonomic 邊際收益，CP 值不夠

如果之後規則改變（開放 past epoch 編輯、或 epoch 邊界可手動調整），可重新評估。

## Out of scope

- ❌ 加 `epoch_id` schema 欄位（理由見上）
- ❌ 動 `GroupBalance` cache 的結構（per-group 單列不分 epoch 是另一個 issue）
- ❌ 重做 leave / swap 的 epoch 邊界處理（現狀正確）
- ❌ 「過去章節不可編輯」的 UI 文案／說明 affordance（留設計師決定後補）
- ❌ 「修正當時記錯」這類「允許過去編輯」的功能（產品立場決定先不做）

## 風險與 follow-up

| 風險 | 緩解 |
|---|---|
| UI 收編輯按鈕後，使用者不知道為什麼按鈕沒了 | 短期：設計師補文案／說明 affordance；中期：past-times 入口頁可以放一句「翻過的章節只看不改」 |
| Part 1 audit 漏掉某個寫入 action | 寫入路徑收斂到統一 helper（`assertNotPastEpoch(context)`）並寫單元測試覆蓋每個 action |
| Part 2 audit 漏掉某個 read query | TypeScript required 參數 = compile error，會自動暴露；新增 query 預設就會被逼帶參數 |
| 開發中需要繞過 read-only（例：admin debug） | 不做 escape hatch；若真有需求走 SQL 直接改 |

## Acceptance criteria

- Pin 在 past epoch 時，所有 transaction-class 編輯 / 刪除 / 新增 UI 入口都不渲染
- 任何 transaction-class server action 在 past epoch 被直接呼叫時 throw `'過去章節不可編輯'`
- 所有 transaction-class read query 簽名 required `epochWindow` 參數；漏帶 → `tsc --noEmit` 失敗
- BalanceHero「本月進帳」在 past epoch 只反映該 epoch 內 occurred_at 的進帳，不混入其他 epoch
- Exit pin → 一切回正常
