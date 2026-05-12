---
status: design
related_issues: TBD（待開 issue）
note: 起點是 dashboard hero card「本月進帳」在收錄模式下會吃進其他 epoch 的進帳；audit 後收斂成「過去章節 read-only」政策 + 「epoch 過濾型別防呆」refactor 的雙軌設計。
---

# Epoch Read-Only 與 Read-Path 型別防呆

> 目標：讓「transaction 完整歸屬於某段 epoch」這件事在系統中是**結構性保證**而非靠記憶。
> 範圍：所有 transaction-class 寫入（cash / income / settlement / fuelLog）+ 所有 transaction-class 讀取查詢。
> 優先級：先修當下 bug + 同步把這層結構建好，避免同類型 bug 反覆出現。

---

## 背景

兩條互為表裡的 bug 在同一輪 audit 被發現：

**Bug A（read-side leak）**：`/dashboard` 的 `BalanceHero` 在收錄模式（pin 在 past epoch）下顯示的「本月進帳」總額會吃進其他 epoch 的進帳。

Root cause：`lib/db/queries/incomes.ts#listIncomeMonthSummary` 沒接受 `epochWindow` 參數，SQL 只 by `group_id + occurred_at` 月份過濾。同檔案的姊妹 query（`listIncomesPaged`、`monthlyIncomeStatsByCategory`）都有正確套 `epochWindow`，只有月度總額這支漏了。

**Bug B（write-side ghost migration）**：所有寫入 server action（`createTransaction` / `editTransaction` / `softDeleteTransaction` / `createIncome` / `editIncome` / `softDeleteIncome` / settlement / fuelLog 等）只用 `getActiveGroupForUser`，不檢查 past-epoch cookie。意思是使用者 pin 在過去章節時：

1. UI 沒 guard，編輯/刪除按鈕照常顯示
2. 點編輯 → soft delete + insert 新 row（atomic tx）
3. 新 row 的 `created_at = now()` 落在 current epoch 的 window
4. 在 past epoch view 裡：原 row soft-delete 消失、新 row 因為 `created_at` 在另一段 window 也看不見 → 「整筆紀錄從過去章節人間蒸發」
5. balance cache 全量重算，新 row 真實計入 → 翻回 current epoch 才看得到

兩條 bug 的本質是同一個：**transaction 屬於哪段 epoch 沒有結構性保證，是靠 callers 記得帶 epochWindow 過濾。**

## 產品立場

> 「故事已經翻頁了 別糾結了 記錯就記錯 記錯也是一種回憶」

過去章節 read-only 是**產品哲學**決策，不是技術限制：

- 「修改過去」的語意本身模糊（修正當時記錯 vs 改變歷史），與 Futari「陪伴而非工具」核心定位衝突
- 容許跨章節編輯會讓「章節」這個情感容器失去意義
- 反向開門（之後若要支援「修正當時記錯」）比關門容易，先收緊

完整 memory 紀錄見 `feedback_past_chapters_readonly`。

## 設計

雙軌設計，**必須綁在同一個 PR 出**——拆開做沒意義（Part 2 的型別防呆只在 Part 1 政策成立時才是「可證明正確」的）。

### Part 1：政策層 — 過去章節 read-only

#### Server action guards

所有寫入 transaction-class 的 action 在進入函式時：

```ts
const context = await resolveViewerEpochContext(user.id)
if (!context) throw new Error('找不到家計簿')
if (context.window.isPast) throw new Error('過去章節不可編輯')
const { group } = context
// ... 後續邏輯不變
```

需要改的 action 清單（以 audit 結果為準，初步盤點）：

| File | Actions |
|---|---|
| `actions/transaction.ts` | `createTransaction` / `editTransaction` / `softDeleteTransaction` |
| `actions/income.ts` | `createIncome` / `editIncome` / `softDeleteIncome` |
| `actions/settlement.ts` | 建立 / 刪除（需 audit） |
| `actions/fuelLog.ts` | 建立 / 編輯 / 刪除（需 audit） |

**順帶收斂**：把這些 action 從 `getActiveGroupForUser` 改用 `resolveViewerEpochContext`，順便把 group context 取得統一。讀寫兩條路用同一個 helper 比較好維護。

**例外**（不改）：
- `actions/epoch-view.ts` 的 `enterPastEpoch` / `exitPastEpoch`：本來就是操控 pin 狀態，不是寫 transaction
- `actions/auth.ts` / `actions/profile.ts`：跟 epoch 無關
- `actions/membership.ts` 的 leave/swap：本身就是會關舊 epoch 開新 epoch 的動作，不在「過去章節編輯」語意內
- `actions/recurringIncome.ts` / `actions/recurringExpense.ts`：規則 CRUD（不是 transaction），跨 epoch 持續存在
- `actions/monthlyReview.ts`：月度概念跟 epoch 兩條軸，不混
- `actions/asset.ts`：愛物是長存物件，不歸屬單一 epoch

#### UI 層 — 在 pin 狀態收掉編輯入口

選定方案：**入口直接不渲染**（Q2 a）。理由：
- 最乾淨，視覺 noise 最低
- 文案說明（「為什麼按鈕沒了」）留設計師決定後補

需要 `isPast` flag 的元件（初步盤點，實作時 audit 完整清單）：

| 入口 | 現狀 | 改後 |
|---|---|---|
| /records row 的 tap-to-edit | 永遠可點 | `isPast` 時不掛 onClick |
| /records row 的 swipe-to-delete | 永遠可滑 | `isPast` 時不掛 swipe handler |
| Dashboard / records FAB（新增） | 永遠顯示 | `isPast` 時不渲染 |
| Asset 詳情頁的 +Add 入口 | 永遠顯示 | `isPast` 時不渲染 |
| 任何地方的「編輯/刪除」按鈕 | 永遠顯示 | `isPast` 時不渲染 |

**`isPast` 怎麼餵到元件**：dashboard layout 已經透過 `resolveViewerEpochWindow` 知道 pin 狀態（[`PastEpochBanner`](app/(dashboard)/_components/PastEpochBanner.tsx) 是線索）。新增 `isPast: boolean` 透過 layout context 或 prop drilling 餵到 feed / FAB / row 元件。具體放哪一層由實作時決定，原則是：**single source of truth 來自 server-side `resolveViewerEpochContext`，不在 client 重做判斷**。

**Server action reject 是 last line of defense**：UI 收按鈕是主防線（使用者根本看不到編輯入口），server reject 是雙保險（直接呼叫 action 或 race condition 時擋下）。

### Part 2：型別防呆層 — read query 強制傳 epochWindow

把所有 transaction-class read query 的 `epochWindow` 從 optional 改 required：

| Query | 現狀 | 改後 |
|---|---|---|
| `listIncomesPaged` | `epochWindow?: EpochWindow \| null` | `epochWindow: EpochWindow` |
| `listIncomeMonthSummary` | **沒參數**（這就是 Bug A） | `epochWindow: EpochWindow` |
| `monthlyIncomeStatsByCategory` | `epochWindow?` optional | required |
| `listTransactionsPaged` | optional | required |
| `listFeedAllPaged` | optional | required |
| `listTransactionsPagedForAsset` | optional | required |
| `monthlyStatsByCategory`（cash 側）| 待 audit | required |
| 其他 settlement / fuelLog read 函式 | 待 audit | required |

**呼叫端**：所有 server component / server action 都已經有 `resolveViewerEpochContext` 拿到 `window`，只是某些路徑沒傳。改 required 後 TypeScript 會在 compile 時逼所有 caller 補上——這就是型別防呆的核心。

**例外（不變的）**：
- `getGroupBalance` / `GroupBalance` 表 — 是 per-group 單列 cache，本來就不分 epoch（這是另一個結構問題，留 backlog 不在本 spec 範圍）
- `getGroupPendingBalanceDelta` — 同上邏輯
- `pg_cron` 清掃 deleted_at 的 job — 跑全表，不分 epoch
- 月度回顧 snapshot 相關 — 月份概念跟 epoch 兩條軸

## 為什麼 Part 1 + Part 2 必須綁一起

如果**只做 Part 2 不做 Part 1**：過去章節仍可編輯 → 編輯產生的新 row `created_at = now()` 落到 current epoch → 在過去章節 view 用 epochWindow 過濾 → 編輯後的新 row 看不見、原 row soft-delete 也看不見 → 紀錄「人間蒸發」（同 Bug B）。

如果**只做 Part 1 不做 Part 2**：寫入路徑乾淨了，但讀取路徑仍可能有 query 漏掉 epochWindow（同 Bug A），新加的 query 沒人擋。

兩個是配套：Part 1 保證寫入永遠落在 current epoch（確保 `created_at` 跟 epoch window 的關係是 lossless 的）；Part 2 用型別系統強制讀取永遠帶 epoch window 過濾。

## 為什麼不加 `epoch_id` schema 欄位

Brainstorming 過程中討論過「給 `CashTransactions` / `IncomeTransactions` 加 `epoch_id` FK」這個方案，但最終否決，理由：

1. **Part 1 政策成立後，timestamp 推導本身就是 lossless 的**（每筆 tx 的 `created_at` 落在恰好一個 epoch 的 `[startedAt, endedAt)` 區間內，by construction）
2. **正確性已經由 Part 1 保證**，加 `epoch_id` 不解決任何新的正確性問題
3. **Part 2 已經提供同等的「忘記過濾就 compile error」防呆**（required `epochWindow` 參數 vs FK 欄位，型別防呆強度差不多）
4. Schema migration、backfill、4 個 table 改寫入路徑、改讀取查詢的成本，換到的是純 ergonomic 邊際收益（單欄等式 vs 範圍判斷），CP 值不夠

如果之後規則改變（例：開放 past epoch 編輯、或 epoch 邊界可手動調整），可重新評估。

## Out of scope

- ❌ 加 `epoch_id` schema 欄位（理由見上）
- ❌ 動 `GroupBalance` cache 的結構（per-group 單列不分 epoch 是另一個 issue）
- ❌ 重做 leave/swap 的 epoch 邊界處理（現狀正確）
- ❌ 「過去章節不可編輯」的 UI 文案／說明 affordance（留設計師決定後補）
- ❌ 「修正當時記錯」這類「允許過去編輯」的功能（產品立場決定先不做）

## 風險與 follow-up

| 風險 | 緩解 |
|---|---|
| UI 收編輯按鈕後，使用者不知道為什麼按鈕沒了 | 短期：設計師補文案／說明 affordance；中期：past-times 入口頁可以放一句「翻過的章節只看不改」 |
| Part 1 audit 漏掉某個寫入 action | 寫入路徑收斂到統一 helper（`assertNotPastEpoch(context)`）並寫單元測試覆蓋每個 action |
| Part 2 audit 漏掉某個 read query | TypeScript required 參數 = compile error，會自動暴露；新增 query 預設就會被逼帶參數 |
| 開發中需要繞過 read-only（例：admin debug） | 不做 escape hatch；若真有需求走 SQL 直接改 |

## 驗證

### 自動測試
- Server action：每個有改的寫入 action 加一個 test case，setup pin 在 past epoch → 期望 throw `'過去章節不可編輯'`
- Query：`listIncomeMonthSummary` 加 test case 覆蓋 multi-epoch 情境（同 group 上有兩個 epoch、同月份 occurred_at），驗證只回傳指定 epoch 的總額
- TypeScript：所有 read query 簽名改 required 後 `tsc --noEmit` 應通過（編譯通過 = 所有 caller 都補了）

### 手動驗證
- Dev 環境造一個有兩個 epoch 的 group（一個 closed、一個 open，open 內有當月進帳）
- Pin 到 closed epoch → BalanceHero「本月進帳」應為 0（或 closed epoch 內當月 occurred_at 的進帳，不該包含 open epoch 的）
- Pin 狀態下 /records 看不到編輯按鈕 / FAB
- Pin 狀態下任何寫入 server action 直接呼叫應 throw error
- Exit pin → 一切回正常

## 實作順序建議

1. 寫 `resolveViewerEpochContext` 的 wrapper / helper（`assertNotPastEpoch`）
2. Part 1 server action guard：先改一個（例 `editTransaction`）+ test → 確認 pattern 後批次套用
3. Part 1 UI guard：layout 提供 `isPast` context → records / dashboard / asset 詳情頁 audit + 收按鈕
4. Part 2 read query refactor：把 `epochWindow` 改 required（一個 query 一個 query 改，每改一個 tsc 會跑出所有 caller）
5. Bug A 對應的 `listIncomeMonthSummary` 在 Part 2 過程中自然會被修掉（簽名要求 epochWindow + dashboard caller 補上）
6. 手動驗證 + 自動測試

實作細節、檔案清單、step-by-step 由後續 implementation plan 決定。
