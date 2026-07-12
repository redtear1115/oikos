---
last_updated: 2026-05-16
status: shipped
first_shipped_in: v0.17.0
updates:
  - v0.17.2: Trip 從 tag-style (`CashTransactions.trip_id`) 改為 isolated sandbox (`TripExpenses` 獨立 table + `Trips.rate_snapshot` jsonb)，結束時 fold 回主帳本 2 筆 summary `CashTransactions`（PR 系列、closes #42 細項）
  - v0.17.2: 「幣別視角刻意分層」立場明文化，AddSheet 主帳本路徑移除 currency picker，多幣別只在 TripExpenseSheet 出現（PR #358 / #359）
  - v0.17.3: spec 重組，把 base_currency 設定 / locale 等「一次性設定」哲學切出至 [locale-currency](locale-currency-design.md)（#364）
  - v0.17.4: 心理匯率從群組層搬進 trip — 建立旅程時自選 1–5 個幣別（含自訂 free-text 如 VND / EUR）並逐一設匯率；`Trips.rate_snapshot` jsonb 改為 `{default, entries[]}`；`CurrencyRates` 表標記 deprecated（#410）
  - v0.17.4 follow-up: trip-level default-currency picker 移除；`rate_snapshot.default` 一律等於 group `base_currency`（術語也統一為「基礎貨幣 / base currency」）；mid-trip 可改匯率，舊 `TripExpenses.amount` 不受影響；AddSheet 的 settled/pending toggle 在 trip 模式隱藏（migration 0041 回填舊 default 到 TripExpenses.original_currency 後 swap default = base）
related_specs: [locale-currency, epoch-readonly, transactions, product]
related_issues: ["#42", "#68", "#364", "#410"]
---

# 旅行 × 多幣別 × 心理匯率

> **核心哲學：邊界複雜，日常無感。**
> 所有需要使用者花腦力的多幣別決策——選幣別、定匯率、看換算——都鎖在「旅行」這個有明確時間邊界的 context。旅行進入與結束就是兩道閘門；旅行結束之後一切回到 group `base_currency`，主帳本完全無感。

---

## 背景與動機

### 為什麼旅行是天然的「多幣別 context」

雙人最有感的多幣別場景是旅行：「東京 5 日花了多少」、「今年聖誕假期總共多少」。日常記帳 95% 用同一幣別，只有跨境旅行那幾天會混。把多幣別輸入綁進日常記帳介面，每筆都要做幣別決定，是把 5% 的成本平攤到 100% 的紀錄上。

旅行剛好有清楚的時間邊界（出發 → 回家），是天然的 sandbox：

- **進入邊界**（建立 trip）：選一次 `default_currency`、鎖一次心理匯率
- **進行中**：所有 `TripExpenses` 各自記原始幣別、用 trip 凍結的匯率換算
- **結束邊界**（end trip）：fold 回 base 幣別、產 2 筆 summary `CashTransactions` 進主帳本
- **日常記帳**：永遠單一 base 幣別、無 currency picker

### 為什麼選「心理匯率」而非市場匯率

心理匯率不是市場匯率，是**「你預期這趟旅行一美元值多少台幣」的主觀設定**。差異化定位是刻意的：

| 取向 | 用市場 API（Spendee / MOZE 路線） | 用心理匯率（Futari 路線） |
|---|---|---|
| 數字會跳 | 每天跳，看到「我那筆昨天少了 30 元」會焦慮 | 不跳，兩人對齊一把尺後一段時間都穩定 |
| 依賴 | 需要外部 API、可能掛掉、需要 API key | 沒有外部依賴，純使用者輸入 |
| 對齊兩人 | 兩人看到的是「市場真相」 | 兩人共同同意「我們先這樣抓」——對齊的是兩人視角，不是市場 |
| 適合誰 | 想要會計級精準的人 | 想要「夠用、不被打擾、兩人一致」的人 |

Futari 的目標 TA 是後者。「兩人共同對齊的一把尺」是商業立場、也是技術立場——少了一個外部依賴，多了一個對齊兩人共識的儀式。

### 為什麼旅行結束才收斂回主帳本

如果旅行進行中就把每筆 expense 即時放進主帳本：

- `GroupBalance` 會隨匯率調整跳動（即使是心理匯率被使用者改了）
- 主帳本 records feed 在旅行中爆量、淹沒日常紀錄
- 旅行結束的「儀式感」消失——沒有自然的回顧時刻

收斂到旅行結束的 2 筆 summary，是讓主帳本的視角穩定、讓旅行有自己的故事段落。

---

## Locked decisions

### 整體架構

| 維度 | 決定 | 理由 |
|---|---|---|
| Trip 模型 | **Isolated sandbox**：`TripExpenses` 獨立 table，與主帳本 `CashTransactions` 物理分離 | trip UI / 主帳本 query 路徑天然分離、零干擾 `GroupBalance`、結束時收斂語意明確 |
| 進行中的 balance | **不算進 GroupBalance** | 旅行中的「誰欠誰」屬於 trip 自己的視圖；主 balance 只反映已收斂的事實 |
| 結束時的收斂 | **產 2 筆 summary `CashTransactions`**（member_a 一筆、member_b 一筆） | 標準 `CashTransactions`，由現有 `lib/balance.ts` 自然處理、balance 計算 0 修改 |
| 結束 summary 的歸屬 | 帶 `trip_id`（標記來源、Records feed 顯示「○○之旅結算」） | 保留可追溯性，但語意上已是主帳本 record |
| Trip 結束 reverse | **不支援**——結束是 archive，要重來需新建 trip | 避免結束後又改 expenses 造成 summary 漂移；ended 後 expenses 進唯讀狀態 |

### 心理匯率與 snapshot 語意

| 維度 | 決定 | 理由 |
|---|---|---|
| 匯率來源 | **使用者手動設定**，不接 API | 「兩人共同對齊的一把尺」哲學；數字不每天跳動讓人焦慮 |
| 來源 scope（v0.17.4+） | **每個 trip 自己一套**：建立旅程時當下輸入 1–5 個幣別 + per-currency rate | 多幣別只發生在旅行邊界；按 trip 凍結是天然單位、避免群組層的全域設定不被任何 trip 真正消費 |
| 群組層 `CurrencyRates`（v0.17.3 及之前） | **Deprecated**：保留 schema 與 setRate action 供既有資料相容，新 trip 不再讀 | 一個 group 共用一張表的模型對「每趟旅行各自心理匯率」這個常見場景不夠靈活；v0.17.4 之後 trip 全部自帶匯率，CurrencyRates 進入廢棄路徑 |
| Trip 建立時 | 由 TripSheet 直接寫入完整 `rate_snapshot` jsonb（`{default, entries[]}`） | 「凍結那段時間的匯率視角」——旅行進行中、即使主帳本層做了什麼，trip 內的換算永遠用這份 snapshot |
| Trip 內 expense | 換算永遠用 `trip.rate_snapshot`，**不讀任何全域表** | FX 鎖在 trip 建立時；之後任何調整都不會 drift 已開始的 trip |
| Trip 編輯時的鎖（v0.17.4 follow-up：拿掉了）| **無 lock**。已有 `TripExpenses` 的幣別其 rate / code 可改、可移除；UI 顯示「已記過 N 筆；改匯率不影響舊紀錄」當資訊性提示 | 既有 `TripExpenses.amount` 是已凍結的 base 整數、不會 retroactively 變動。鎖死沒有 protect 任何資料，反而擋住使用者修正錯估的匯率 |
| 主帳本歷史 record | v0.17.0 schema 保留 `CashTransactions.{original_currency, original_amount, rate_snapshot}` 三欄作為 write-time snapshot | 早期 tag-style 路徑的歷史紀錄相容；snapshot 語意一致——改 rate 後過去 record 等值不變 |
| 精度 | 心理匯率 `numeric(10,3)`、最小 0.001 | 「夠用」精度；避免讓使用者覺得需要會計級嚴謹 |

### Trip × Epoch 互斥約束

| 維度 | 決定 | 理由 |
|---|---|---|
| Trip 與 Epoch | **強制單一 epoch**：`Trips.epoch_id` notNull、`start_date >= currentEpochStartedAt` | 「章節」是時間軸 slice，trip 跨 epoch = 語意混亂 |
| 結束 epoch（leave）有 active trip | **Reject**「請先結束旅行再離開章節」+ 提供 trip 結束捷徑 | 確保 trip 永遠完整落在單一 epoch 內；swap 不算結束 epoch，故 swap 不檢查 |
| 過去章節的 trip | 沿用 [epoch-readonly](epoch-readonly-design.md) → UI 唯讀 | 與既有政策一致 |

### Trip × Currency 弱耦合

| 維度 | 決定 | 理由 |
|---|---|---|
| Trip 幣別組成（v0.17.4+） | TripSheet 建立 / 編輯時自選 **1–5 個幣別**（4 preset checkbox + 「+ 自訂幣別」free-text row）；**沒有 default picker** — `rate_snapshot.default` 一律 = group `base_currency`（v0.17.4 follow-up） | 「trip 的基礎貨幣」與「主帳本的基礎貨幣」是同一回事；多一層 default 切換只是讓使用者多做一次決定、然後在 fold 時又收回 base，沒帶來實值 |
| 自訂幣別 code | **Free-text**（uppercase、最長 16 字元）— 名字不是重點，能換算即可 | 想接住 VND / EUR / KRW 等非預設幣別，又不想讓 enum / i18n / symbol 字典爆開；display 用 raw code fallback |
| `Trips.default_currency` 欄位 | mirror `rate_snapshot.default`（一律 = base） | 提供 query convenience；真實 source of truth 在 jsonb |
| TripExpenseSheet currency | currency picker 列**該 trip 的 entries**（≤ 5 個），預設 base | 邊界 context、複雜度允許出現；但只看這趟用到的幣別、不再固定 4 種 |
| Trip 結束 fold 後的 summary | 強制 base 幣別 | 主帳本永遠單幣別 |
| Mid-trip 改匯率（v0.17.4 follow-up） | 允許 — `TripExpenses.amount` 是寫入時凍結的 base 整數，事後改 rate 不會 retroactively 變動；新紀錄用新 rate | 「兩人對齊的一把尺」也會隨經驗微調（看完報表覺得抓太低 / 太高）；既有金額既然已凍結就讓使用者調 rate 而不必刪重記 |

### 主帳本（非 trip context）

| 維度 | 決定 | 理由 |
|---|---|---|
| AddSheet / 主記帳表單 | **不暴露 currency picker** | 守住「記錄要素低認知負擔」——日常每筆不必做幣別決定 |
| Dashboard / Records / Balance | 永遠顯示 group `base_currency` 視角 | complexity at the boundary, simplicity in daily use |
| 主帳本記錄路徑 | 永遠走 `CashTransactions`（單幣別 native） | 多幣別只在 `TripExpenses` 出現；旅行結束後 fold 回 `CashTransactions` |

詳見 [product-design § 4 設計立場](product-design.md#4-設計立場) 對「幣別視角刻意分層」的整體論述。

---

## 不採用

- ❌ **即時匯率 API（Open Exchange Rates / ECB 等）** — 數字每天跳動讓人焦慮、依賴外部、與「兩人對齊的一把尺」哲學衝突
- ❌ **Live 匯率語意**（rate 改變則歷史紀錄等值跳動） — balance 會瞬間漂移、historical 失真
- ❌ **Hybrid 匯率 toggle**（snapshot + 可切 live view） — 守紀律先鎖 snapshot；UX 複雜性等驗證需求才補
- ❌ **主帳本幣別 picker（AddSheet）** — 多幣別輸入只在旅行子帳本（TripExpenseSheet）出現；詳見 [product-design § 4](product-design.md#4-設計立場)
- ❌ **Trip 跨 epoch** — 與時間軸語意衝突
- ❌ **Trip 子 ledger 即時 balance**（「東京之旅我們誰欠誰」即時計算）— 採用「結束時 2 筆 summary」收斂語意而非即時 balance
- ❌ **Settlement 多幣別** — 跨幣別結算對帳語意複雜、低頻；強制 base 幣別
- ❌ **Income 多幣別 UI** — schema 欄位 OK，UI 留更晚版本
- ❌ **主帳本擴展自訂幣別** — `CashTransactions` / `IncomeTransactions` / `Settlements` / `OikosGroups.base_currency` 仍受 `currency_code` enum（4 選 1）約束；自訂幣別只在 trip sandbox 開門，跟「日常無感」對齊
- ❌ **匯率 retroactive 重新換算** — 與 snapshot 立場衝突
- ❌ **編輯已用幣別的 rate** — 已記入的 `TripExpenses.amount` 是用舊 rate 換算過的整數，事後改 rate 會讓金額語意漂移；UI 鎖死，文案引導刪除支出後再改
- ❌ **群組層全域心理匯率設定**（pre-v0.17.4 模型） — 跟「每趟旅行各自一把尺」的使用情境不貼；CurrencyRates 表保留為相容路徑、後續 cleanup pass 移除
- ❌ **Trip-scoped GroupBalance UI** — fold 模型替代之
- ❌ **Trip 跨 group 共享** — 與「兩人帳本」邊界衝突
- ❌ **Cover photo 上傳 / photo memory grid** — schema 欄位保留，UI 留更晚版本

---

## 設計

### Part 1：Trip 作為 isolated sandbox

#### 1.1 `Trips` 表

關鍵欄位（詳細以 [lib/db/schema.ts](../../../lib/db/schema.ts) 為準）：

| 欄位 | 語意 |
|---|---|
| `group_id` | 所屬 group |
| `epoch_id` | **強制單一 epoch**，建立時依 `start_date` 落點決定，notNull |
| `name` | 旅行名稱 |
| `start_date` | 起始日，必須 ≥ `currentEpochStartedAt` |
| `end_date` | NULL = 進行中 |
| `default_currency` | TripExpenseSheet currency selector 預設值（mirror `rate_snapshot.default`）；v0.17.4 起 text、free-text |
| `rate_snapshot` jsonb | v0.17.4 起 `{default, entries[]}`（見 § 2.1）；trip 建立時由 TripSheet 表單寫入，事後編輯有 used-currency lock |
| `budget_amount` / `budget_currency` | 預算（optional） |
| `status` | `'active' \| 'ended' \| 'archived'` |
| `ended_at` | 結束時間（`status='ended'` 時填） |
| `deleted_at` | soft delete |

#### 1.2 `TripExpenses` 表

主帳本不知道這張表存在。Trip 詳情頁 / TripExpenseSheet 讀寫這張表；trip 結束時批次收斂進 `CashTransactions`。

關鍵欄位：

| 欄位 | 語意 |
|---|---|
| `trip_id` | FK；透過此欄解析 `group_id` |
| `paid_by` | 誰先墊錢 |
| `amount` | base 幣別整數（用 `trip.rate_snapshot` 換算得出） |
| `original_currency` / `original_amount` | 原始幣別與金額（NULL = base native，all-or-nothing CHECK） |
| `category` | 與主帳本 categories 共用 |
| `split_type` | 完整支援 `all_mine` / `all_theirs` / `half` / `weighted` |
| `split_ratio` | payer 自己的 share %（0–100，weighted 才用） |
| `description` | 自由文字 |
| `transacted_at` | 發生時間 |
| `deleted_at` | soft delete |

**故意不存**：
- ❌ `group_id`（透過 `trip_id → Trips.group_id` 解析）
- ❌ `status`（trip 結束時批次收斂，無需 pending 狀態）
- ❌ `asset_id`（旅行支出通常不關聯愛物）
- ❌ `fuel_log_id`（旅行不做加油雙寫）

#### 1.3 Trip 結束收斂

Trip 結束時 (`actions/trip.ts#endTrip`)：

1. 計算每位成員 split 後的實際負擔金額（用 `Trips.rate_snapshot` 換算成 base 幣別）
2. 在主帳本產 **2 筆 summary `CashTransactions`**：
   - `paid_by`：member_a 一筆、member_b 一筆
   - `amount`：每位成員 split 後的實際負擔（base 整數）
   - `category`：`entertainment`（樂）
   - `description`：`${trip.name} 結算`
   - `trip_id`：保留作為來源標記
   - `split_type` / `split_ratio_a`：自動挑選讓 `lib/balance.ts` 重算後 balance delta = trip 淨效果（整數 ratio 精度導致最多 ~trip_total/100 漂移，已在 `lib/tripSummary.ts` 內 brute-force 0–100 挑最小誤差 ratio；0% / 100% 自動 collapse 成 `all_mine` / `all_theirs`）
3. Solo group 永遠走 1 筆 `all_mine` summary，balance 維持 0

主帳本 `lib/balance.ts` **完全不需改動**——這 2 筆是標準 `CashTransactions`。

實作落地：`actions/trip.ts#endTrip` / `lib/tripSummary.ts`

#### 1.4 Trip × Epoch 互斥 guard

兩條 write-side guard：

1. **建立 / 編輯 trip**（`actions/trip.ts`）：
   - `start_date < currentEpochStartedAt` → reject「不可建在過去章節」
   - `epoch_id` 由 `start_date` 落點自動派生，不接受手動指定

2. **結束 epoch**（`actions/membership.ts` 的 leave / accept invite 走到 swap 以外路徑）：
   - 檢查當前 epoch 是否有 `status='active'` 的 trip
   - 有則 reject「請先結束旅行再離開章節」+ 提供 trip 結束捷徑
   - **swap 不算結束 epoch**（per existing rule），所以 swap 不檢查 trip

過去章節的 trip 沿用 [epoch-readonly](epoch-readonly-design.md) → UI 唯讀。

---

### Part 2：心理匯率與 snapshot

#### 2.1 `Trips.rate_snapshot` 結構（v0.17.4+）

```jsonc
{
  "default": "TWD",
  "entries": [
    { "code": "TWD", "label": null,    "rate": 1     },
    { "code": "JPY", "label": null,    "rate": 0.22  },
    { "code": "VND", "label": "越南盾", "rate": 0.0013 }
  ]
}
```

- `default` 為 trip 內 expense 的預設幣別（必為 `entries[].code` 之一）
- `entries` 1–5 筆。`code` uppercase / free-text；`label` 可選（自訂幣別才實質有用）；`rate` 語意「1 個 `code` = `rate` 個 `default`」，default 自己永遠 1
- 整份 snapshot 在 trip 建立時凍結，編輯時受 used-currency lock 約束（見 2.4）
- 實作：`lib/trip-currency.ts`（parse / validate / build / findRate）

#### 2.2 `CurrencyRates` 表（deprecated — pre-v0.17.4 全域匯率）

- v0.17.0–v0.17.3 模型：per-group 全域匯率，trip 建立時複製進 `rate_snapshot`
- v0.17.4 後 trip 自帶完整 snapshot，**新建 trip 不再讀 `CurrencyRates`**
- 表與 `actions/currency.ts#setRate` 保留為歷史 trip rate_snapshot 來源相容；新 UI 沒有任何入口能寫入這張表
- 後續 cleanup pass 將移除整張表 + 對應 action

#### 2.3 Snapshot 兩種語意

| 場景 | Snapshot 時機 | 存哪 | 為什麼 |
|---|---|---|---|
| 旅行內 expense（v0.17.4+） | **Trip 建立時**由使用者在 TripSheet 內輸入 entries + rates | `Trips.rate_snapshot` jsonb（新 shape） | 旅行是「凍結那段時間的匯率視角」的自然單位；每趟自己一把尺 |
| 早期 tag-style 路徑歷史 record（v0.17.0） | **寫入時**鎖定當下匯率 | `CashTransactions.rate_snapshot` numeric | 早期 tag-style 設計遺留；現行主帳本不暴露 currency picker，新增 `CashTransactions` 都是 base native，這三欄主要保留給歷史 record |

兩種 snapshot 都遵守同一個立場：**改 rate 後過去等值不變**。

#### 2.4 Mid-trip 改匯率（v0.17.4 follow-up）

之前版本（v0.17.4 initial）對 used currencies 強制 rate-lock；後來改回**允許自由編輯**：

- 改 rate → 既有 `TripExpenses.amount` 不動（早就凍結成 base 整數），只影響之後新增的紀錄
- 移除幣別 → 該幣別歷史 expense 仍可顯示 native amount（從 `original_amount` + `original_currency` 讀），base amount 早就算過、不會壞
- UI 仍會抓 `countTripExpensesByCurrency(tripId)` 回填 `usedCurrencyCounts`，但**只當資訊性 hint**（「已記過 N 筆；改匯率不影響舊紀錄」），不再 disable 任何控件

理由：實際使用情境是「來日本一週，第三天才發現匯率抓錯了」 — 鎖死只是擋使用者修正、卻沒 protect 任何資料完整性。

---

### Part 3：耦合與獨立性

| 維度 | 主帳本 | Trip 子帳本 |
|---|---|---|
| Table | `CashTransactions` | `TripExpenses` |
| Currency | 永遠 group `base_currency` | 多幣別 |
| Currency picker UI | ❌ 不暴露 | ✅ TripExpenseSheet 內暴露 |
| Balance 計算 | `lib/balance.ts` 處理 | 不算進 `GroupBalance`；trip 結束 fold 後 2 筆 summary 才算 |
| 匯率來源 | base native，無需換算 | `trip.rate_snapshot`（trip 建立時凍結） |
| Epoch 約束 | 透過 `transacted_at` 落點歸屬 | `epoch_id` notNull、強制單一 epoch |

唯一耦合點：**trip 結束時的 2 筆 summary `CashTransactions`**——這是讓 trip 視角收斂回主帳本視角的橋。

---

## 規範 / 行為

### 主帳本（AddSheet / Records / Balance / Dashboard）

- **無 currency picker**：所有金額輸入即是 group `base_currency`
- Records list 顯示：
  - 主帳本 record（無多幣別欄位 NULL）：照常 single line、base 幣別
  - 歷史 tag-style 多幣別 record：主行原始幣別、副小字 base 等值（dual-currency `CompactRow`）

### TripExpenseSheet（旅行記帳）

- **currency picker 出現**：列該 trip 的 entries（1–5 個），預設 `trip.default_currency`
- 若 currency ≠ base：金額輸入旁顯示「≈ NT$ X 換算」即時 preview（用 `trip.rate_snapshot`）
- `split_type` 完整支援（`all_mine` / `all_theirs` / `half` / `weighted`）

### TripSheet（建立 / 編輯旅程）

- **幣別與匯率區塊**：4 個 preset checkbox（TWD/CNY/USD/JPY）+ 「+ 自訂幣別」free-text row；最多 5 個 entries
- 每個勾選 / 自訂的幣別都有 rate 輸入（「1 X = N 個預設幣別」），預設幣別 rate 固定 1 不可改
- 預設幣別以 radio 選擇；預設幣別已記過支出時 radio 全 disable
- 編輯模式：已用幣別 row 的 rate input / checkbox / remove / default radio 全 disable，旁邊小字「已記過 N 筆，先刪除才能改」
- 結束的 trip：整個編輯區塊隱藏（已 ended 等同 read-only，避免 fold summary 漂移）

### Trip 詳情頁 `/trips/[id]`

- Records list：filter by `trip_id` 走 `TripExpenses`
- Summary 區：
  - **「依幣別」block**（混幣別 trip 才出現）：每個原始幣別小計（native total + base 等值，照 base 排序）
  - **「誰花了多少」block**（雙人 trip 才出現）：每位成員實際 cash out + 分攤後負擔，per-side 計算對齊 `lib/balance.transactionDelta()` 讓視圖跟 group balance 一致
- Active trip + 非過去章節 → BottomNav FAB 解開，AddSheet 帶當前 trip 預選（TripSelector 隱藏、currency 預設 `trip.default_currency`、ratio 預設 `group.default_split_ratio_a`）

### End trip flow

- Sheet：確認結束 → 顯示 2 筆 summary 預覽 → 寫 `actions/trip.ts#endTrip`
- 落地：`TripExpenses` 進唯讀；主帳本多 2 筆帶 `trip_id` 的 `CashTransactions`；Records feed 顯示「${trip.name} 結算」

### Settings → 貨幣

> 主體幣別（`base_currency`）的選擇與修改規則屬「一次性設定」哲學，詳見 [locale-currency](locale-currency-design.md)。

- 主體幣別：4 選 1（管理規則在 locale-currency spec）
- **沒有匯率輸入欄**（v0.17.4 移除）：心理匯率搬進每個 trip 自己
- Hint card「心理匯率搬家了」+ 連到 `/trips` 的小連結：說明設定移轉去處

---

## 資料模型

| Entity | 既有 / 新增 | 變更 |
|---|---|---|
| `OikosGroups.base_currency` | v0.17.0 既有 | 主體幣別，仍 `currency_code` enum；詳見 [locale-currency](locale-currency-design.md) |
| `CurrencyRates` | v0.17.0 新增 | **v0.17.4 deprecated**：保留供歷史相容；新 trip 不再讀寫 |
| `CashTransactions` | 既有 | 加 `original_currency` / `original_amount` / `rate_snapshot` / `trip_id`；`original_currency` 仍 enum |
| `IncomeTransactions` | 既有 | 加 `original_currency` / `original_amount` / `rate_snapshot`（UI v0.17.x 不接）；仍 enum |
| `Settlements` | 既有 | 不動，強制 base 幣別 |
| `Trips` | v0.17.0 新增 | v0.17.2 加 `rate_snapshot` jsonb；**v0.17.4** `rate_snapshot` 改 `{default, entries[]}` shape，`default_currency` / `budget_currency` enum → text |
| `TripExpenses` | v0.17.2 新增 | **v0.17.4** `original_currency` enum → text（自訂幣別） |

詳細欄位以 [lib/db/schema.ts](../../../lib/db/schema.ts) 為準。

---

## 風險與 follow-up

| 風險 | 緩解 |
|---|---|
| Trip 進行中阻止 epoch 結束 → 使用者誤會 | 文案：「請先結束旅行再離開章節」+ trip 結束捷徑連結 |
| USD cent vs 整數的精度錯誤 | `lib/currency.ts` 的 `formatAmount` / `convertAmount` 集中處理 + 單元測試覆蓋 round-trip |
| Snapshot 語意被誤解（為何改 rate 後過去 record 不變） | Settings 頁加 hint card「過去的紀錄保留當時的匯率」 |
| Trip 詳情頁混幣別總額語意 | 規定「依幣別」block 各幣別獨立小計、「誰花了多少」block 一律 base 視角 |
| 整數 split ratio 導致 fold 後 balance delta 漂移 | `lib/tripSummary.ts` brute-force 0–100 挑最小誤差 ratio；0% / 100% 自動 collapse 成 `all_mine` / `all_theirs` |
| 雙寫漂移（v0.17.0 tag-style 歷史 record vs v0.17.2 sandbox） | 歷史 tag-style record 留在主帳本走 `CashTransactions` 路徑顯示；新建一律走 `TripExpenses` 路徑 |

---

## Acceptance criteria

### Trip × Epoch

- Trip 建立時若 `start_date < currentEpochStartedAt` → server reject
- 結束 epoch（leave / 新伴侶 accept invite 走非 swap 路徑）時若有 active trip → reject
- Pin 在 past epoch 時 trip 相關 UI 唯讀

### Trip × Expense × Currency

- 建立 trip 時，`Trips.rate_snapshot` 反映 TripSheet 表單當下輸入的 entries（v0.17.4+）
- TripExpense 寫入時：若 `currency = base` 只填 `amount`；若 `currency ≠ base` 填齊 native + base
- TripExpenseSheet 的 currency picker 列表為 `trip.rate_snapshot.entries`，預設值 `trip.default_currency`
- TripSheet 自訂幣別：free-text、uppercase、≤ 16 字元；不在 `currency_code` enum 內也合法

### Trip 編輯時鎖

- `updateTrip` 收到 `currencies` 時做 used-currency lock：已用幣別不可改 rate / code、不可移除、default 有支出時不可換指
- TripSheet edit UI 對應 disable rate input / checkbox / remove / default radio + 顯示已用筆數
- 結束的 trip 完全 read-only：Edit + End CTA 隱藏；點 expense row 不打開編輯

### Trip 結束 fold

- End trip 後產 2 筆 `CashTransactions`（solo group 1 筆）
- 2 筆 summary 都帶 `trip_id`、`category = entertainment`、`description = "${trip.name} 結算"`
- 主帳本 `GroupBalance` 變化 = trip 內所有 expenses 對 balance 的淨效果（誤差 ≤ trip_total/100）
- `TripExpenses` 在 trip status='ended' 後 UI 唯讀

### 主帳本不被污染

- 主帳本 AddSheet 不出現 currency picker
- Records list 主帳本 record 顯示 base 幣別（除了 v0.17.0 tag-style 歷史 record dual-display）
- `tsc --noEmit` pass — `formatAmount` 強制傳 currency 參數，漏帶 → compile error

### 整合

- 一條 e2e：建 trip → 在 trip 內 JPY 記帳 → balance 不動 → 結束 trip → 主帳本多 2 筆帶 `trip_id` 的 summary → balance 反映 trip 淨效果

---

## Out of scope

- ❌ 即時匯率 API、加密貨幣、自訂第 5 幣別
- ❌ Settlement / Income 多幣別 UI（schema OK、UI 留版本）
- ❌ Live 匯率語意 / hybrid toggle
- ❌ Trip 跨 epoch、trip 跨 group 共享
- ❌ Trip-scoped balance UI（即時「東京之旅誰欠誰」— 走 fold 收斂語意而非即時）
- ❌ 匯率 retroactive 重新換算 toggle
- ❌ Past-times 整合 trip 呈現（沿用 epoch read-only 即可）
- ❌ Cover photo 上傳 / photo memory grid

---

## Open / deferred questions

1. **Income 多幣別 UI**：v0.18+？由 user feedback 決定優先序
2. **Settlement 多幣別**：何時做？看跨幣別還款場景的回饋頻率
3. **Trip 結束 celebration**：Futari「克制」氣質可能不做；留設計師決定
4. **Trip 詳情頁總額視角 toggle**：是否需要切換「全部 JPY 視角 / 全部 TWD 視角」？目前固定 base 視角
5. **匯率語意 retroactive toggle**：若 user feedback 反映「改 rate 後過去等值應該跟著變」是常見預期，再評估補 hybrid toggle
