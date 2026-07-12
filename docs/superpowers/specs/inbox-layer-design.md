---
last_updated: 2026-05-13
status: planned
related_specs: [recurring, cloud-invoice, transactions]
related_issues: ["#101"]
---

# Inbox Layer

> 把所有「非使用者親手建立」的資料（cron 產生的 recurring expense proposal、LINE 訊息解析、未來信用卡帳單匯入）統一收進一個 Inbox / Review flow，讓 review 體驗一致、後端擴充有單一收口。
> v0.15.0 已在 code 加概念註解；formal schema migration + UI 等下一輪 epic（含 LINE 解析 MVP）。

---

## 背景與動機

v0.13.0 引入 `PendingExpenseOccurrences`，承接 cron 產生的定期支出 proposal — 使用者按確認 / 跳過 / 改一下再確認。同期 PR #89（issue #49 v1）為 `CashTransactions` 加 `status` enum（`settled` | `pending`），表達「已承諾但未實際扣款」。

兩個 pending 概念並存（見 [#101](https://github.com/redtear1115/oikos/issues/101)）。短期不衝突，但**新增 LINE 訊息解析** — 使用者貼訊息進來、系統解析成 proposal、等使用者確認 — 跟 cron pending 本質完全一樣，只是來源不同。如果各自再開一張表、各自一套 review UI，碎片化會雪崩。

[#101](https://github.com/redtear1115/oikos/issues/101) 一開始討論三個方向（A 吸收進 `CashTransactions.status`、B 純視覺統一、C 留兩個概念），但都不夠：

- **A** 破壞 Ledger layer invariant，且不能擴充多來源
- **B** 純 UI 不夠 — 不同來源要顯示來源資訊
- **C** 短期可行但 LINE 解析會逼出第三個 pending 概念

**結論**：建立正式的 **Inbox layer**，所有「非親手建立」的資料都進這層；Ledger layer（`CashTransactions`）只承接「已確定要記」的資料，invariant 不動。

---

## 核心架構

```
來源（cron / LINE / 未來帳單匯入 / ...）
        │
        ▼
   ┌────────────────┐
   │  Inbox layer   │  ← TransactionInbox（目標 schema）
   │  pending /     │     v0.13.0 暫由 PendingExpenseOccurrences 扮演
   │  confirmed /   │
   │  skipped       │
   └───────┬────────┘
           │ 使用者按「確認」/「改一下再確認」
           ▼
   ┌────────────────┐
   │ Ledger layer   │  ← CashTransactions（status: settled | pending）
   │ 已確定要記的    │
   │ 金錢事件       │
   └────────────────┘
```

**兩層完全正交**：
- Inbox layer 的 `status` 回答「使用者要不要記這筆？」
- Ledger layer 的 `status` 回答「金錢有沒有實際移動？」
- 一筆 record 可以同時是「Inbox 已 confirmed」+「Ledger pending」（例：cron proposal → 使用者確認 → 但這個月還沒實際扣款）

---

## Schema 設計目標

詳細欄位以未來 `lib/db/schema.ts` 為準。本節只說「這張表為什麼這樣設計」。

`TransactionInbox` 欄位語意：

- `source` text — 提案來源（`'recurring_expense'` / `'line_message'` / `'bill_import'` / ...）
- `source_ref_id` uuid nullable — 對應的源 entity（例如 `RecurringExpenseRule.id`）；可為 null（無法回溯來源時）
- `proposed_data` jsonb — 展示用 context（amount / date / description / paid_by / split_type / asset_id / category 等），**不參與統計**
- `status` text — `'pending_review'` / `'confirmed'` / `'skipped'`
- `resolved_to_tx_id` uuid — 已 confirm 時指向新建的 `CashTransaction`

### 關鍵設計選擇

**`proposed_data` 用 jsonb**：不同 source 的 proposal 欄位差很多（recurring expense 有 `paid_by` / `split_type`；LINE 解析可能多出 `confidence` / `raw_text`；帳單匯入有 `bank_name` / `statement_id`）。jsonb 讓每個 source 自由展開 payload，不需要每加一個 source 就 ALTER TABLE。代價是 `proposed_data` 不能拿來統計 — 故意的，**Inbox 不是 ledger，不參與 balance 計算**。

**只有三個 status，沒有 `modified_and_confirmed`**：使用者「改一下再確認」會直接讓 `resolved_to_tx_id` 指向新建立的 `CashTransaction`（裡面已經是改過後的值），Inbox row 本身狀態 = `confirmed`。不另留 audit trail，YAGNI。

**`source_ref_id` 可為 null**：LINE 訊息來源可能對應不到某個既有 entity；保留 nullable 給「散裝來源」用。

**保留 `resolved_to_tx_id`**：未來「這筆 ledger 是哪個 Inbox 提案來的」需要追溯（例如使用者想看「這筆房租是 cron 自動跳的還是我臨時記的」），保留這個 FK 即可。

---

## 與 Ledger layer 的正交性

| | Inbox layer | Ledger layer |
|---|---|---|
| Table | `TransactionInbox` | `CashTransactions` |
| 主問題 | 使用者要不要記這筆？ | 金錢移動到哪一步？ |
| Status | pending_review / confirmed / skipped | settled / pending |
| 計入 balance？ | 否（純展示 layer） | 是 |
| 出現在 transaction feed？ | 否（獨立 Inbox 區塊） | 是 |

`CashTransactions.status` 維持 PR #89 引入的設計（`settled` / `pending`），完全不動。Inbox layer 是疊加在上面的，不取代任何東西。

---

## UI 方向

### Inbox 區塊獨立

不與 transaction feed 混排。預期位置：dashboard 上方 / records 頁面頂部，類似目前 `PendingExpenseStack` 的視覺位置但語意明確擴充。

### Source badge

依 `source` 顯示不同 badge / icon，讓使用者一眼識別來源：

| source | badge 文案候選 | 視覺 hint |
|---|---|---|
| `recurring_expense` | 「定期」 | （沿用現行） |
| `line_message` | 「LINE」 | LINE 綠色 |
| `bill_import` | 「帳單」 | 銀行 icon |

具體視覺由設計師決定。

### 互動：confirm / skip / edit-and-confirm

沿用現行 `PendingExpenseOccurrences` 的三個操作 — Inbox 是抽象層，操作語意對所有 source 一致。

---

## 捨棄的設計

| 方案 | 捨棄原因 |
|---|---|
| **A** — proposal 塞進 `CashTransactions` 加 `status='proposed'` | 破壞 Ledger layer invariant（feed / balance / 統計都要區分 proposed）；多來源時 `CashTransactions` 會被迫塞各種非 cash 概念 |
| **B** — DB 不動，純視覺統一 | 不同來源需要顯示來源資訊；純 UI 層改不夠 |
| `modified_and_confirmed` 第四個 status | Over-engineering，目前不需要 audit trail；改過再確認直接看 `resolved_to_tx_id` 的內容即可 |
| 每個 source 一張表 | 碎片化；review UI / cron 邏輯 / 統計都會被迫各寫一套 |

---

## 階段交付

### v0.15.0（已 ship — 概念註解）

不動 schema，僅程式碼層面標記 Inbox layer 概念，讓未來在這塊工作的人立刻看見脈絡：

- `lib/db/schema.ts` 的 `pendingExpenseOccurrences` table 上方加 block comment
- `recurring-design.md` frontmatter 下方加註，鏈到本 spec
- INDEX 加一條 reference

### 下一輪 epic（規劃中 — schema migration + UI）

跟 LINE 訊息解析 MVP 綁同一個 epic 交付，避免上線後又得改 Inbox schema。範圍：

- 新增 `TransactionInbox` table + data migration（既有 `PendingExpenseOccurrences` row → `TransactionInbox`，source=`recurring_expense`）
- Cron 寫入改打 `TransactionInbox`
- Inbox UI 區塊 + source badge
- LINE 訊息解析 MVP（source=`line_message`）
- 移除 `PendingExpenseOccurrences` table（最後一步）

### 未來

`bill_import` source（信用卡帳單）— 對應 [cloud-invoice](cloud-invoice-design.md)：當財政部 APP_ID 路徑解開、雲端發票實作 ship 之後，把它作為 Inbox 的另一個 source 接入。

---

## Acceptance criteria（目標 epic）

- 新增一個 `recurring_expense` 規則產出的 pending → 落到 `TransactionInbox`、UI 顯示「定期」badge
- 使用者按「確認」→ `resolved_to_tx_id` 指向新建的 `CashTransaction`、Inbox row status=confirmed
- 使用者按「改一下」→ 開 AddSheet prefilled → 提交後同上
- LINE 訊息解析後產生的 proposal 走相同流程，UI 顯示「LINE」badge
- 移除 `PendingExpenseOccurrences` table 後，所有既有 reader 都已切到 `TransactionInbox`

---

## 開放問題

- **`status` 是否需要 `dismissed_at` 軟刪除而非直接刪 row？** 傾向保留刪除歷史（`skipped` 是 status，row 不刪），讓使用者未來能看「跳過了多少筆」做反思
- **Inbox 通知策略**：cron 產生時是否要推送 / 顯示 badge？目前 `PendingExpenseStack` 的視覺已經是「在 dashboard 上方常駐」的設計，可能不需要額外通知
- **LINE 解析的 confidence threshold**：低信心的 proposal 是直接進 Inbox 還是要分區？等 LINE 解析 MVP 設計時決定，不影響 Inbox layer 本身的 schema
