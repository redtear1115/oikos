---
status: shipped
first_shipped_in: v0.17.0
updates:
  - v0.17.2: Trip 改為 isolated sandbox（`TripExpense` table + `Trips.rate_snapshot`）+ 結束時 fold 為 2 筆 summary `CashTransactions`（PR #358）
related_specs: [transactions, epoch-readonly, locale-currency, product]
related_issues: ["#42", "#68"]
---

# 旅行 × 多幣別 × 心理匯率

> **核心哲學：邊界複雜**
>
> 多幣別與匯率換算的複雜度，只允許出現在「旅行」這一個有明確時間邊界的 context。
> Trip 建立時鎖匯率、結束時 fold 回 base 幣別產 summary record，日常主帳本完全感受不到幣別存在。

---

## 為什麼是這條哲學

雙人記帳會碰到兩種「金額」場景，兩者複雜度差距很大：

| 場景 | 頻率 | 認知負擔 |
|---|---|---|
| 日常每筆記帳（午餐、加油、繳費） | 每天數筆 | 應該越低越好 |
| 旅行整段（東京 5 日、聖誕假期） | 一年數次 | 本身就需要思考幣別 / 預算 / 分攤 |

如果把多幣別 picker 接進主記帳表單，每筆日常都被迫看一個其實永遠不會改的欄位（99% 用台幣記台幣），這個 UI 成本攤到一年數千筆紀錄上太貴。

反過來，旅行本來就是一個「我們在思考錢的事」的 context — 訂機票、預算分配、結束後盤點誰花多少、誰欠誰。在這個 context 暴露多幣別並不會增加額外負擔，反而是必要的。

→ 整體立場見 [product § 4 設計立場](product-design.md#4-設計立場)：「complexity at the boundary, simplicity in daily use」。
→ 「主帳本永遠單幣別」這一面寫在 [locale-currency](locale-currency-design.md)。

---

## 邊界在哪裡

旅行有兩個明確邊界：**建立** 與 **結束**。多幣別 / 匯率的複雜度只發生在這兩個瞬間，旅行中與旅行後都不增加 cognitive load。

```
建立 trip ────▶ 旅行中 ───▶ 結束 trip ─────▶ 主帳本
   ↓             ↓            ↓                 ↓
鎖匯率         多幣別 record   fold 為           單幣別
（snapshot）   ＋分攤類型       2 筆 summary      （base）
                              CashTransactions
```

- **建立時鎖匯率**：trip.rate_snapshot 從 group `CurrencyRates` 複製當下匯率；旅行進行中或結束後即使使用者改 group 匯率，這個 trip 的 FX 計算永遠用 snapshot
- **旅行中**：在 `TripExpense` sandbox 內可自由用任何幣別記帳，UI 預設 `trip.default_currency`、可每筆覆寫
- **結束時 fold**：trip 結束的瞬間，所有 `TripExpense` 依分攤類型聚合為 member A / member B 各一筆 summary `CashTransactions`，金額用 trip 自己的 rate_snapshot 換算成 base 幣別
- **fold 之後**：主帳本只看到 2 筆 base-currency 的 summary record，balance 計算沿用既有 `lib/balance.ts`，零幣別感知

---

## Locked decisions

### Trip × Epoch 邊界

| 維度 | 決定 | 理由 |
|---|---|---|
| Trip × Epoch 關係 | **強制單一 epoch**：`Trips.epoch_id notNull`，依 `start_date` 落點自動決定 | 「章節」是時間軸 slice，trip 跨 epoch 等於語意混亂 |
| Trip 起始日 | 必須 ≥ `currentEpochStartedAt` | 不可在過去章節新增 trip |
| 進行中 trip 阻擋 epoch 結束 | leave / accept-invite 時若有 `active` trip → server reject + 結束 trip 捷徑 | 確保 trip 永遠完整落在單一 epoch 內；swap 不算結束 epoch，不檢查 |
| 過去章節的 trip | 沿用 [epoch-readonly](epoch-readonly-design.md) → UI 唯讀 | 與既有 read-only 政策一致 |

### Trip × Currency 邊界

| 維度 | 決定 | 理由 |
|---|---|---|
| 心理匯率定義 | per-group 兩人手動設、不接 API、精度小數三位 | 「兩人共同對齊的一把尺」哲學；不讓數字每天跳動讓人焦慮 |
| Trip 建立時 snapshot | `Trips.rate_snapshot jsonb` 複製當下 `CurrencyRates` | 凍結那段時間的匯率視角；group rate 之後變動不影響該 trip |
| Trip 內換算來源 | 永遠用 `Trips.rate_snapshot`，不用 group 當前 rate | 一致性：旅行中所有 record 共用同一把尺 |
| Trip default_currency | nullable enum，旅行內 records 表單預設值 | 例如東京之旅 default JPY；個別 record 可改 |
| 主帳本端的 base currency | 由 group 決定，**不在本 spec 範圍** | 屬於「保持簡單」邏輯，見 [locale-currency](locale-currency-design.md) |

### Trip 結束收斂

| 維度 | 決定 | 理由 |
|---|---|---|
| 收斂時機 | trip status 從 `active` → `ended` 的瞬間 | 邊界明確，使用者顯式行為 |
| 收斂結果 | 主帳本生 **2 筆 summary `CashTransactions`**（member A / member B 各一筆） | balance 計算沿用既有邏輯，零特例 |
| Summary record `amount` | 每位成員 split 後實際負擔，用 `Trips.rate_snapshot` 換算成 group base 幣別整數 | 主帳本永遠 base 幣別、永遠 integer |
| Summary record `category` | `樂`（travel / fun） | 統一分類；之後若需細分再說 |
| Summary record `trip_id` | 保留來源標記 | Records feed 可顯示「東京之旅結算」、details 可回查 trip |
| 主帳本 balance 變化 | 由現有 `lib/balance.ts` 自然處理 2 筆新 record | **不需 balance 層任何改動** |

### Trip 子帳本架構

| 維度 | 決定 | 理由 |
|---|---|---|
| 旅行支出儲存 | 新 table `TripExpense`，與主帳本 `CashTransactions` 隔離 | 主帳本 query 路徑天然不被 trip 干擾、`GroupBalance` 零影響 |
| TripExpense 不需的欄位 | `group_id`（透過 `trip_id → Trips.group_id`）、`status`（trip 結束時批次收斂，無 pending 語意）、`asset_id`、`fuel_log_id` | 旅行支出通常不關聯愛物、不做加油雙寫 |
| `split_type` 支援 | 完整四種：`all_mine` / `all_theirs` / `half` / `weighted` | 旅行有禮物（all_mine）、共同消費（half）、依比例分（weighted）等真實情境 |
| Trip-scoped balance UI | 不做（沒有「東京之旅誰欠誰」即時 balance） | 結束時 2 筆 summary 進主帳本已收斂，即時 balance 反而碎片化 |

---

## 不採用

- ❌ **即時匯率 API（Open Exchange Rates / ECB）** — 數字每天跳動讓人焦慮、依賴外部、與「兩人對齊的一把尺」哲學衝突
- ❌ **Live 匯率語意（rate 變則歷史 record 等值跳動）** — balance 會在改 rate 瞬間跳、historical 失真
- ❌ **Hybrid 匯率 toggle（snapshot + 可切 live view）** — 守紀律先鎖 snapshot；UX 複雜性等驗證需求才補
- ❌ **Trip 跨 epoch** — 與 epoch 時間軸語意衝突
- ❌ **Trip 跨 group 共享** — 雙人帳本本來就鎖 group，跨 group 開口會炸開分攤語意
- ❌ **Trip-scoped 即時 balance UI** — 碎片化總 balance、實作膨脹、不解決真實問題；結束時 fold 已收斂語意
- ❌ **Trip 進行中即時換算回主帳本 base** — 違反 sandbox 隔離；只有結束 fold 才產生 base record
- ❌ **匯率 retroactive 重新換算** — 與 snapshot 立場衝突
- ❌ **自訂第 5 幣別 / 加密貨幣** — enum 鎖 4 種；自訂幣別開門後排序 / 匯率矩陣會炸開

---

## 資料模型

| Entity | 既有 / 新增 | 重點 |
|---|---|---|
| `Trips` | 新（v0.17.0） | `epoch_id notNull` + `start_date >= currentEpochStartedAt`；`default_currency` / `budget_*` / `status: active\|ended\|archived`；v0.17.2 加 `rate_snapshot jsonb` |
| `TripExpense` | 新（v0.17.2） | trip 內隔離 ledger；`trip_id` + `paid_by` + `amount` + `original_currency` + `original_amount` + `category` + `split_type` + `description` + `transacted_at` + `deleted_at` |
| `CurrencyRates` | 新（v0.17.0） | per-group 心理匯率表，PK `(group_id, from_currency, to_currency)`；trip 建立時被 snapshot 進 `Trips.rate_snapshot` |
| `CashTransactions.trip_id` | 既有欄位 | 標記「來自 trip 結束 fold 的 summary record」；feed / details 可回查 |

詳細欄位以 [lib/db/schema.ts](../../../lib/db/schema.ts) 為準。Group `base_currency` 欄位與修改規則見 [locale-currency](locale-currency-design.md)。

---

## 規範 / 行為

### Trip CRUD

- 列表：active + past（按 start_date desc）
- 建立 form：name / start_date / end_date(opt) / default_currency(opt) / budget(opt)
- 詳情頁：name + 日期 + 該 trip 的 `TripExpense` list + 總額（以 `trip.default_currency` 為主、base 為副）
- 結束 trip：status 改 `ended` + 填 `ended_at` + 觸發 fold（產生 2 筆 summary `CashTransactions`）
- 過去章節 pin 時：trip 唯讀（沿用 epoch-readonly）

### TripExpenseSheet（旅行內記帳）

- 出現位置：`/trips/[id]` 詳情頁
- Currency selector：4 選 1，預設 `trip.default_currency || group.base_currency`，每筆可改
- 即時換算 preview：若 currency ≠ base，顯示「≈ NT$ X 換算」用 trip rate_snapshot
- `split_type`：完整四選
- 寫入：落 `TripExpense` table，不碰 `CashTransactions`、不動 `GroupBalance`

### Trip 結束 fold（actions/trip.ts#endTrip）

1. 讀該 trip 所有 `TripExpense`（exclude soft-deleted）
2. 依 `split_type` 計算 member A / member B 各自實際負擔
3. 每位成員的 `original_currency` 金額透過 `Trips.rate_snapshot` 換算成 group base 幣別整數
4. 寫入 2 筆 `CashTransactions`（`paid_by = A` / `paid_by = B`、`amount = 換算後 base 整數`、`category = '樂'`、`trip_id` 保留）
5. 更新 trip status → `ended` + `ended_at = now()`
6. 觸發既有 `lib/balance.ts` 重算 `GroupBalance`

整個 fold 是單一 DB transaction。

### 阻擋 epoch 結束

- `actions/membership.ts` 的 leave / accept-invite 進入 critical section 前先檢查 `SELECT 1 FROM Trips WHERE group_id = ? AND status = 'active'`
- 有則 reject + 文案「請先結束旅行再離開章節」+ 提供結束 trip 的捷徑連結
- swap（無人離開）不檢查

---

## Acceptance criteria

- Trip 建立時若 `start_date < currentEpochStartedAt` → server reject
- Trip 建立 / 編輯時 `rate_snapshot` 從當下 `CurrencyRates` 完整複製；之後改 group rate 不影響該 trip
- 結束 epoch（leave / accept-invite）時若有 active trip → reject + 提示
- Pin 在 past epoch 時 trip CRUD / TripExpense 唯讀
- TripExpense 不出現在主帳本 `/records` feed；只在 trip 詳情頁列出
- Trip 結束 fold 後：主帳本看到 2 筆 summary `CashTransactions`（A / B 各 1 筆）、balance 正確、`GroupBalance` 與手動加總一致
- 結束過的 trip 翻 past chapter 時 TripExpense 唯讀、summary record 也唯讀
- 一條 e2e：建 trip → JPY 多筆記帳（含 weighted 分攤）→ 結束 trip → 主帳本看 2 筆 base 幣別 summary → balance 正確 → 翻舊章節 trip 唯讀

---

## 風險與 follow-up

| 風險 | 緩解 |
|---|---|
| Trip 結束 fold 失敗一半（部分 expense 算錯） | 單一 DB transaction；fold 過程 throw 則 rollback；UI 顯示明確錯誤 |
| 使用者誤會「結束 trip 不可逆」 | 結束 trip 前 confirm dialog 明示「會產生主帳本 summary record」 |
| 進行中 trip 阻擋 epoch 結束 → 使用者誤會 | 文案：「請先結束旅行再離開章節」+ trip 結束捷徑連結 |
| Trip rate_snapshot 結構未來擴充（新幣別） | jsonb 結構可前向相容；fold 時若 snapshot 缺某 pair → fall back 至 group 當前 rate（保守選擇，文案提示） |
| Snapshot 語意被誤解（為何旅行中改 group rate 不影響 trip 換算） | trip 詳情頁加說明文案「旅行匯率以建立當下為準」 |
| Trip-scoped balance 需求若出現 | 暫不做；驗證需求後再評估獨立 `TripBalance` cache |

---

## Open / deferred questions

1. **Trip 入口位置**：dashboard 區塊？Settings → 旅行？→ 待 designer 決定
2. **Trip color token 系統**：v0.17.0 沿用單一中性色；token 化留之後 polish
3. **Trip 結束 celebration / review page**：strong 情感 hook；Futari「克制」氣質可能不做、留設計師決定。v0.17.2 phase 4 候選
4. **Trip 詳情頁總額混幣別策略**：是否需要 toggle 顯示「全部 JPY 視角 / 全部 TWD 視角」
5. **Trip cover photo / photo memory grid**：schema 欄位 OK（v0.17.0 留）、UI 留更晚版本
6. **匯率語意 retroactive toggle**：若 user feedback 反映「改 rate 後過去 record 應該跟著變」是常見預期，再評估補 hybrid toggle

---

## Out of scope

- ❌ 即時匯率 API、加密貨幣、自訂第 5 幣別 → 見頂部「不採用」
- ❌ Trip 跨 epoch / 跨 group → 見頂部「不採用」
- ❌ Trip-scoped 即時 balance UI → 已用 fold 收斂語意取代
- ❌ Cover photo 上傳、photo memory grid → 留更晚版本
- ❌ Past-times 整合 trip 呈現（沿用 epoch-readonly 即可）
- ❌ Group `base_currency` 的選擇 / 修改規則 / 主帳本單幣別 UI → 屬於「保持簡單」哲學，見 [locale-currency](locale-currency-design.md)
- ❌ Income / Settlement 多幣別 UI → schema 欄位已加（v0.17.0）但 UI 不接，原因見 [locale-currency](locale-currency-design.md)
