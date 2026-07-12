---
last_updated: 2026-07-13
status: shipped
first_shipped_in: v0.1.0
updates:
  - v0.12.0: 共同備註（#34 PR #66）、CSV 匯出 transactions（#37 PR #70）、信任宣示頁（#48 PR #62）
  - v0.14.1: Weighted split（取代 `half`）+ Dashboard hero collapse（#109 PR #111）+ /records FAB context-awareness（#110 PR #112）
  - v0.14.2: Description autocomplete in AddSheet（#113 PR #114；v0.14.1 暫 revert、v0.14.2 revert-the-revert ship）
related_specs: [onboarding, solo-mode, realtime, structured-filter, stats, recurring, epoch-readonly, income]
related_issues: ["#34", "#37", "#48", "#109", "#110", "#113"]
---

# 核心記帳：Transaction / Settlement / Balance

> 雙人記帳的核心 ledger：交易 CRUD、結算、欠款計算、列表 / 篩選 invariants、/records FAB 行為。
> Onboarding / Solo Mode 見 [onboarding](onboarding-design.md) / [solo-mode](solo-mode-design.md)；Realtime UX 規則見 [realtime](realtime-design.md)；結構化篩選見 [structured-filter](structured-filter-design.md)；統計見 [stats](stats-design.md)。

---

## 命名與品牌

- **使用者看到**：Futari／「ふたり ・ 家計簿」
- **Codebase**：Oikos
- **Member 識別**：avatar 字母 = `display_name[0]`；底色 hardcode by 位置（`member_a` = `--ink` 深棕、`member_b` = `--accent` 橘）；UI「我」/「對方」依 viewer 翻轉
- **Google avatar**：`profiles.avatar_url`，`handle_new_user` trigger 寫入；sign-in callback 每次刷新；UI 在 `<Avatar>` 顯示時 bg color 變成環

---

## Transaction CRUD

**關鍵 invariant**：「編輯」= 一個 DB transaction 內 **soft delete 舊 row + insert 新 row + recalcGroupBalance**。使用者不感知這是兩步；DB 層**不支援 UPDATE**。

理由：
- 完整修改歷史天然保留在 `deleted_at IS NOT NULL` 的 row 中
- Realtime event 自然帶兩個訊號（fade-out 舊、prepend 新），符合 [realtime](realtime-design.md) UX 契約
- `pg_cron` 1 年後物理刪除 `deleted_at` row（不要無限累積）

Atomic invariant：上述兩步 + balance 重算必須同 DB transaction；任何 step 失敗整批 rollback。

### Description autocomplete（v0.14.2）

AddSheet 描述欄位輸入時，從目前 household 的歷史 CashTransaction 描述抓前綴（case-insensitive，最多 5 條）做 inline suggestion；soft-deleted 排除、空字串不顯示。實作落地點：`DescriptionAutocomplete` 元件 + `lib/db/queries/transactions.ts → suggestDescriptions()`。

### Weighted split（v0.14.1）

`split_type` enum 加 `weighted`、新增 `split_ratio_a`（CashTransactions / RecurringExpenseRules / PendingExpenseOccurrences），group 多 `default_split_ratio_a`。UI 把 `half` 換成 weighted slider；DB 層 balance recalc 同時支援 legacy `half` 和 `weighted`。

`half` 視為 `weighted` 的特例（ratio = 0.5）；legacy row 保留 `half` 不需 backfill。

### 共同備註 / CSV 匯出 / 信任宣示頁（v0.12.0）

三個小 feature 一起 ship：

- **共同備註**（#34）：transaction `description` 改為兩人共享文字而非「我的備註」
- **CSV 匯出**（#37）：`/api/export/transactions` 匯出活躍 CashTransactions
- **信任宣示頁**（#48）：`/settings/trust` 說明「資料安全宣示」

---

## Settlement

**關鍵概念**：
- 「我還多少？」/「對方還了多少？」依 viewer 翻轉
- Smart chip：全額 / 一半 / 整數（整數 = 取整百到不超過欠款；< 100 或等於全額時隱藏）
- Settlement 是反向影響 balance 的單向 row（不是另一個 transaction）

Schema 走獨立 `Settlements` 表；軟刪除規則跟 Transaction 一致。

---

## Balance + 列表

**關鍵 invariant**：列表用 UNION SQL，把 transactions 和 settlements 統一為 `kind: 'transaction' | 'settlement'`，cursor 用 `(transactedAt, createdAt)` 複合鍵。

Balance：每次寫入後**全量重算**，cache 在 `GroupBalance` table（per-group 單列）。`balance` 正數 = A 欠 B、負數 = B 欠 A。實作 `lib/balance.ts` + `lib/db/queries/balance.ts`。

Past epoch 的 balance：`GroupBalance` cache 不分 epoch（per-group 單列），這是已知限制（見 [epoch-readonly](epoch-readonly-design.md) Out of scope）；past epoch view 看 balance 仍是 current epoch 的值。讀取的 transaction list 透過 required `epochWindow` 參數正確過濾。

### Dashboard hero collapse（v0.14.1）

Dashboard 上方 hero card 加 collapse toggle，避免 hero 卡 + balance row 在小螢幕擠成兩行；collapsed 狀態 toggle、settle pill、ToggleButton 在 collapsed / expanded 兩態的位置都鎖定。純 layout 微調，不改 balance 語意。

---

## Filtering invariant

完整 UX / URL schema 見 [structured-filter](structured-filter-design.md)。本 spec 只 lock 兩條 ledger-level invariant：

- **誰付 dim 套用兩種 row**（含 settlements）：filter `?fPayer=mine` 套到 settlement 上判斷「誰付（=還）」
- **分攤 / 分類 / 愛物 dim 觸發時 settlements 整批排除**（`hidesSettlements`）：settlement 沒有 split_type / category / asset_id 欄位，套了也是零行——hide 比 leak 好
- Server-side resolve 為 `ResolvedTxnFilter`；SQL 用 `IN + sql.join`
- Filter state in-memory（dashboard lite mode）/ URL-synced（records full mode），不持久化到 cookie

---

## /records FAB context-awareness（v0.14.1）

`/records` 頁 FAB 依當前 tab 切換意義：

| Tab | FAB 顏色 | Click 開啟 |
|---|---|---|
| 全部 | ink（dark brown `var(--ink)`） | AddSheet — 新增支出 |
| 支出 | ink | AddSheet — 新增支出 |
| 收入 | accent（mint `var(--accent)`） | IncomeSheet — 新增進帳 |

理由：當使用者切到「收入」tab 在看 income entries，FAB 應該對應新增 income（不是 expense）— 反之則是語意不一致。

顏色變化是被動視覺提示；不加 label text。Mint 配色跟 income palette 一致。

「全部」tab FAB 預設 = 新增支出（最頻繁的動作，不需使用者選擇）。

---

## Out of scope（不做）

| 項目 | 去向 |
|---|---|
| 推播通知 | 不做（無 PWA push） |
| 多幣別、theme、頭像上傳 | 不做 |
| 自定 category | 等使用者數穩定 |
| 跨月份視覺破碎（編輯改月份觸發兩 event） | 接受（半秒空檔，體感不痛） |
| Realtime 連線中斷 backoff | 依賴 supabase-js v2 預設行為，未專門處理 |

---

## Acceptance criteria

- 新增 transaction → record 落地 + balance cache 同 DB transaction 更新
- 編輯 transaction → 舊 row `deleted_at` 設定 + 新 row insert + balance 重算，全部 atomic
- Settlement 還款 → balance 反向變動；smart chip 依當前 balance 動態計算（整百到不超過欠款）
- /records 列表混合 transactions + settlements 用 `(transactedAt, createdAt)` cursor 穩定分頁
- Filter `?fPayer=mine` 套用後 settlement row 仍出現（依 payer 判斷）；filter `?fCats=...` 套用後 settlement row 整批 drop
- /records FAB 在「收入」tab → mint 色 + 開 IncomeSheet；其他 tab → ink 色 + 開 AddSheet
- AddSheet description 欄位 → 同 household 歷史 transactions 前綴 inline suggestion（最多 5 條）
- Weighted split `ratio_a` 寫入後 balance 重算正確（同時支援 legacy `half` row）
- Dashboard hero collapse 切態時 settle pill / ToggleButton 位置鎖定不漂
