---
status: shipped
first_shipped_in: v0.17.0
related_specs: [transactions, income, epoch-readonly, structured-filter, product]
related_issues: ["#68", "#42"]
---

# 多幣別支援 × 旅行子帳本（v0.17.0 架構先行）

> v0.17.0「架構先行」版本：兩個耦合 feature 共用同一個 schema migration window，一起設計避免將來再痛一次。
> 範圍：(1) `OikosGroups.base_currency` + 心理匯率 + 全 codebase currency-aware；(2) `Trips` entity + records 可選歸屬。UI 走 minimal，schema 一次到位。

---

## 背景與動機

### 為什麼是 #68 多幣別

- i18n 已支援 ja，「Futari／ふたり」這個命名就是對日本市場的邀請；但金額目前硬寫成 TWD 整數，是進入日本市場的硬卡點
- 雙人家庭跨境情境真實存在：外派、留學、海外旅行、跨國伴侶、海外薪資
- 即使不出國，「我們公司開薪水給日圓」這類少數但高黏 niche 也能服務
- 競品定位：Spendee / MOZE 把多幣別當中階差異化；Futari 走「自訂心理匯率」差異化路線——不接 API、不讓數字每天跳動讓人焦慮

### 為什麼是 #42 旅行子帳本

- 旅行是雙人最有感的共同消費場景之一：「東京 5 日花了多少」、「今年聖誕假期總共多少」
- 與「陪伴」哲學契合，旅行回顧頁是強情感 hook（v0.17.0 不做、留 backlog）
- 不需要新型別 record，只需在 record 上加 `trip_id` + trip 詳情頁

### 為什麼一份 spec、為什麼一起出

兩個 feature 在邏輯上獨立，但：

- Schema migration 共用 window，分開做等於做兩次 migration
- 記帳表單同時新增 currency selector 與 trip selector，trip 提供 `default_currency` 作為 currency selector 預設值（單向弱耦合）
- 「v0.17.0 架構先行」整體立場一致：底層 schema 一次到位、UI 只做最小可用

先例：[epoch-readonly](epoch-readonly-design.md) 也把 Part 1 政策 + Part 2 型別防呆綁一起出。

---

## Locked decisions

### 多幣別（#68）

| 維度 | 決定 | 理由 |
|---|---|---|
| 支援幣別 | TWD / CNY / USD / JPY（enum 4 選 1） | MVP scope；之後擴充走 enum migration |
| 主體幣別 | per-group `base_currency`，預設 `twd` | balance / settlement / report 全圍繞此幣別 |
| 心理匯率 | 兩人手動設、不接 API、精度小數三位 | 「兩人共同對齊的一把尺」哲學 |
| 匯率變更語意 | **Snapshot at write time** | 過去紀錄鎖定當時匯率；balance 不會在改 rate 時跳動 |
| Amount 改造 | v0.17.0 全 codebase currency-aware；`lib/currency.ts#formatAmount` 集中處理 | 一次痛完，避免半套狀態 |
| USD 精度 | 存 cent（`$12.50` → `1250`），其他幣別存整數 | DB 一律 integer，cent ↔ 顯示由 helper 處理 |
| Income 多幣別 | schema 加欄位、UI v0.17.0 不接 | 避免未來再 migration；symmetry |
| Settlement 多幣別 | **強制 base 幣別** | 跨幣別結算對帳語意複雜、低頻 |
| Base currency 修改規則 | 當前 epoch **無 record 時可改、有 record 則鎖** | 避免歷史紀錄 base currency 漂移 |

### 旅行子帳本（#42）

| 維度 | 決定 | 理由 |
|---|---|---|
| Modeling | Tag-style：`CashTransactions.trip_id` nullable FK | 與現有 `GroupEpochs` / `GroupBalance` 零衝突；trip 結束總額是 query 層 GROUP BY，不新 cache |
| Trip 與 Epoch | **強制單一 epoch**：trip.epoch_id notNull | 「章節」是時間軸 slice，trip 跨 epoch 等於語意混亂 |
| Trip 進行中能否結束 epoch | **不能**：leave / swap 時若有 `active` trip → server reject | 確保 trip 永遠完整落在單一 epoch 內 |
| Trip 起始日 | 必須 ≥ `currentEpochStartedAt` | 不可建在過去章節 |
| 過去章節的 trip | 沿用 [epoch-readonly](epoch-readonly-design.md) → UI 唯讀 | 與既有政策一致 |
| Trip × Currency | Trip 可有 `default_currency`（nullable，預設取 group base） | 單向弱耦合：trip → records currency selector 預設值 |
| v0.17.0 UI 範圍 | CRUD + records 表單 trip selector + records 列表 trip filter；**不做**回顧頁、cover photo、trip-scoped balance | 架構先行原則 |

---

## 不採用

- ❌ **即時匯率 API（Open Exchange Rates / ECB）** — 數字每天跳動讓人焦慮、依賴外部、與「兩人對齊的一把尺」哲學衝突
- ❌ **Live 匯率語意**（rate 變則歷史 record 等值跳動） — balance 會在改 rate 瞬間跳、historical 失真
- ❌ **Hybrid 匯率 toggle**（snapshot + 可切 live view） — v0.17.0 守紀律先鎖 snapshot；UX 複雜性等驗證需求才補
- ❌ **主帳本幣別 picker（AddSheet / 主記帳表單）** — 主帳本記錄介面只走 group `base_currency`、UI 不暴露幣別 picker；多幣別輸入只在旅行子帳本（TripExpenseSheet）出現，旅行結束 fold 為 summary `CashTransaction` 後回到主視角。立場：complexity at the boundary, simplicity in daily use——守住「記錄要素低認知負擔」，日常每筆不必做幣別決定。詳見 [product-design § 4 設計立場](product-design.md#4-設計立場)
- ❌ **Trip 跨 epoch** — 與 epoch 時間軸語意衝突
- ❌ **Trip 子 ledger（獨立 GroupBalance）** — 碎片化總 balance、實作膨脹、不解決真實問題
- ❌ **Settlement 多幣別** — 跨幣別結算對帳語意複雜、低頻
- ❌ **Income 多幣別 UI（v0.17.0）** — schema 加欄位但 UI 留 polish 版本
- ❌ **自訂第 5 幣別 / 加密貨幣** — enum 鎖 4 種、自訂幣別開門後 i18n / 排序 / 匯率矩陣會炸開
- ❌ **匯率 retroactive 重新換算** — 與 snapshot 立場衝突
- ❌ **Trip 回顧頁 / photo memory grid / celebration** — 強情感 hook 但 v0.17.0 架構先行、留 backlog

---

## 設計

### Part 1：多幣別 schema 與正規化

#### 1.1 Group 層 base currency

- `OikosGroups.base_currency` enum，預設 `'twd'`
- **修改規則**：當該 group **當前 epoch** 沒有任何 `CashTransactions` / `IncomeTransactions` / `Settlements` 時可改；否則 server action throw、UI disable + 文案
- 落地點：`actions/group.ts#setBaseCurrency`（新）
- Rationale：避免歷史紀錄的 base currency 語意漂移；新建 group 或剛開新 epoch 的群組能補設定

#### 1.2 `CurrencyRates` 表（新）

- Per-group 心理匯率，PK `(group_id, from_currency, to_currency)`
- 只存當前匯率，不存歷史（歷史在每筆 record 的 `rate_snapshot`）
- Rate `numeric(10,3)`
- 預設值（首次寫入時）：`TWD→CNY 0.220`、`TWD→USD 0.032`、`TWD→JPY 5.000`（依 base_currency 換算）
- Server actions：`actions/currency.ts#listRates` / `setRate`
- 詳細欄位以 [lib/db/schema.ts](../../../lib/db/schema.ts) 為準

#### 1.3 `CashTransactions` schema 擴充

新增四欄（trip 在 Part 2）：

| 欄位 | 型別 | nullable | 語意 |
|---|---|---|---|
| `original_currency` | enum | ✅ | 使用者輸入的原始幣別（NULL = base 幣別 native，省空間） |
| `original_amount` | integer | ✅ | 原始金額（USD 存 cent、其他存整數） |
| `rate_snapshot` | numeric(10,3) | ✅ | 寫入瞬間鎖定的匯率（NULL = base native） |

讀寫語意：
- 寫入：若 `currency === base` → 只填 `amount`（base 幣別整數）；否則填齊四欄
- 讀取：`amount` 永遠是 base 幣別整數，**balance 計算用此欄、與幣別無關**
- 顯示：`original_currency` NOT NULL → 主行 original，副小字 base 等值

#### 1.4 `IncomeTransactions` schema 擴充

同 1.3 加 `original_currency` / `original_amount` / `rate_snapshot`。**UI v0.17.0 不接**，但欄位先加避免未來再 migration。

#### 1.5 `Settlements`

不動。強制 base 幣別。

#### 1.6 `lib/currency.ts`（新模組）

集中所有 currency-aware 邏輯：

- `formatAmount(amount: number, currency: CurrencyCode): string` — 顯示用，處理 cent ↔ 整數、千分位、幣別符號
- `convertAmount({ amount, from, to, rates }): number` — 換算（含 cent ↔ 整數 normalize）
- `currencyPrecision(currency): 0 | 2` — USD 為 2、其他為 0
- `CURRENCIES: readonly CurrencyCode[]` — 排序與 i18n key 對應

#### 1.7 `lib/balance.ts` 不變

- `transactionDelta` 仍接 `amount: number`（base 幣別整數）
- `GroupBalance.balance` 仍是 base 幣別整數
- 多幣別正規化發生在**寫入時**（Part 1.3），balance 層完全不感知幣別

#### 1.8 顯示路徑全 callsite 改造

所有顯示 amount 的地方走 `formatAmount`：feeds、details、stats、dashboards、reports、IncomeSheet、AddSheet preview。**TypeScript 強制傳 currency 參數**（compile-time guard，類似 [epoch-readonly](epoch-readonly-design.md) 的 Part 2 思路）。

---

### Part 2：Trip 子帳本

#### 2.1 `Trips` 表（新）

關鍵欄位：

| 欄位 | 型別 | nullable | 語意 |
|---|---|---|---|
| `group_id` | uuid | ❌ | 所屬 group |
| `epoch_id` | uuid | ❌ | **強制單一 epoch**，建立時依 `start_date` 落點決定 |
| `name` | text | ❌ | 旅行名稱 |
| `start_date` | date | ❌ | 起始日，必須 ≥ `currentEpochStartedAt` |
| `end_date` | date | ✅ | NULL = 進行中 |
| `default_currency` | enum | ✅ | 此 trip 內 records 預設幣別（NULL = 取 group base） |
| `budget_amount` | integer | ✅ | 預算 |
| `budget_currency` | enum | ✅ | 預算幣別 |
| `cover_photo_url` | text | ✅ | v0.17.0 schema 留欄位、UI 不做上傳 |
| `status` | enum | ❌ | `'active' \| 'ended' \| 'archived'` |
| `ended_at` | timestamp | ✅ | 結束時間（status='ended' 時填） |
| `deleted_at` | timestamp | ✅ | soft delete |

詳細以 [lib/db/schema.ts](../../../lib/db/schema.ts) 為準（migration 完成後）。

#### 2.2 Trip × Epoch 互斥約束

兩條 write-side guard：

1. **建立 / 編輯 trip** 時：
   - `start_date < currentEpochStartedAt` → reject「不可建在過去章節」
   - `epoch_id` 由 `start_date` 落點自動派生，不接受手動指定

2. **結束 epoch**（`actions/membership.ts` 的 leave / 新伴侶 accept invite）時：
   - 檢查當前 epoch 是否有 `status='active'` 的 trip
   - 有則 reject「請先結束旅行再離開章節」+ 提供 trip 結束捷徑連結
   - 注意：**swap 不算結束 epoch**（per existing rule），所以 swap 不檢查 trip

過去章節的 trip 沿用 [epoch-readonly](epoch-readonly-design.md) → UI 唯讀。

#### 2.3 `CashTransactions.trip_id`

- nullable FK to `Trips.id`
- `IncomeTransactions` **不加 trip_id**（旅行通常只記支出；之後有反例再說）
- 不限制 `transacted_at` 必須落在 `[trip.start_date, trip.end_date]` 內（允許「提前訂機票」這類場景手動歸 trip）

#### 2.4 Trip × Currency 預設值

記帳表單 currency selector 預設值優先序：
1. 若 `trip_id` 有值且 `trip.default_currency` 非 NULL → `trip.default_currency`
2. 否則 → `group.base_currency`

這是**唯一**的功能耦合點。

#### 2.5 Trip Scoping（v0.17.0 不做的）

- ❌ trip-scoped `GroupBalance`（「東京之旅我們誰欠誰」UI）
- ❌ Trip 回顧 / photo memory grid / 結束 celebration
- ❌ Trip 跨 group 共享

---

### Part 3：耦合與獨立性總結

| 維度 | 是否耦合 |
|---|---|
| DB schema | 不耦合（各自加 `CashTransactions` 欄位，互不引用） |
| Balance 計算 | 不耦合（balance 永遠看 base 幣別 `amount`） |
| Migration | 共用 window（一次到位最便宜） |
| 記帳表單 UX | 弱耦合（trip → currency selector 預設值，單向） |

---

## 規範 / 行為

### Settings — 「貨幣」section（新）

- 主體貨幣：4 選 1 下拉
  - 當前 epoch 有 record 時 → disabled + 文案「已有紀錄、不可修改」
- 三個匯率輸入欄：依主體幣別動態 render label（例如主體 TWD 顯示「1 TWD = ___ JPY」三欄）
  - 數字、小數三位、最小 0.001
  - 變更不影響歷史 record

### Records 表單

- 新增 **currency selector**（4 選 1）
  - 預設值：trip.default_currency || group.base_currency
  - 若 currency ≠ base：金額輸入旁顯示「≈ NT$ X 換算」即時 preview
- 新增 **trip selector**（active trips dropdown + 「無」）
  - 若有 active trip 且 transactedAt 在範圍 → 預設選該 trip（可改）

### Records 列表

- 多幣別 row：主行原始幣別、副小字 base 等值
- 同幣別 row：照常 single line
- Trip 標記：trip chip in row，沿用單一中性色（color token 化見 deferred question 2）

### Trip CRUD（minimal）

- 入口：dashboard 區塊或 Settings → 旅行（暫定，待 designer 決定）
- 列表：active + past（按 start_date desc）
- 建立 form：name / start_date / end_date(opt) / default_currency(opt) / budget(opt)
- 詳情頁：name + 日期 + 該 trip 的 records list（filter by trip_id）+ 總額
  - 總額幣別：以 `trip.default_currency` 為主、base 為副；混幣別 record 在 trip 內依 default_currency 換算
- 結束 trip：把 status 改 'ended' + 填 ended_at
- 沒有：cover photo 上傳、回顧頁、photo memory grid、celebration

### IncomeTransactions

v0.17.0 UI 不變、依 group base_currency 記帳。Schema 欄位先加。

### Settlements

v0.17.0 UI 不變、強制 base 幣別。

---

## 資料模型

| Entity | 既有 / 新增 | 變更 |
|---|---|---|
| `OikosGroups` | 既有 | 加 `base_currency` |
| `CurrencyRates` | 新 | per-group 心理匯率表 |
| `CashTransactions` | 既有 | 加 `original_currency`, `original_amount`, `rate_snapshot`, `trip_id` |
| `IncomeTransactions` | 既有 | 加 `original_currency`, `original_amount`, `rate_snapshot`（UI 不接） |
| `Settlements` | 既有 | 不動 |
| `Trips` | 新 | trip entity |

詳細欄位以 [lib/db/schema.ts](../../../lib/db/schema.ts) 為準（migration 完成後）。

---

## Out of scope

- ❌ 即時匯率 API、加密貨幣、自訂第 5 幣別
- ❌ Settlement / Income 多幣別 UI（schema OK、UI 留版本）
- ❌ Live 匯率語意 / hybrid toggle
- ❌ Trip 跨 epoch、trip 子 ledger、trip 跨 group 共享
- ❌ Trip 回顧頁、photo memory grid、cover photo 上傳（schema 欄位 OK）、celebration
- ❌ Trip-scoped balance UI（「東京之旅我們誰欠誰」）
- ❌ 匯率 retroactive 重新換算 toggle
- ❌ Past-times 整合 trip 呈現（沿用 epoch read-only 即可）

---

## 風險與 follow-up

| 風險 | 緩解 |
|---|---|
| `formatAmount` callsite refactor blast radius 大 | 先做純 refactor PR（無 schema 變化、callsite 全改）；TypeScript required currency 參數作為 compile-time 防呆 |
| Base currency 鎖死後使用者反悔 | 文案明確；onboarding 引導設定；極端情況走 admin SQL |
| Trip 進行中阻止 epoch 結束 → 使用者誤會 | 文案：「請先結束旅行再離開章節」+ trip 結束捷徑連結 |
| USD cent vs 整數的精度錯誤 | `formatAmount` / `convertAmount` 集中處理 + 單元測試覆蓋 round-trip |
| Trip 詳情頁混幣別 record 的「總額」語意 | 規定：以 `trip.default_currency` 為主、base 為副；混幣別依 default_currency 換算合計（用每筆 record 的 `rate_snapshot` 或當前 rate？→ 用 record 自己的 rate_snapshot 計算到 base，再從 base 用當前 rate 換到 trip.default_currency）|
| Snapshot 語意被誤解（為何改 rate 後過去 record 不變） | Settings 頁加說明文案「過去的紀錄保留當時的匯率」 |
| 多幣別 row 在 dense feed 中視覺擁擠 | 副小字嚴格 12px 灰色、不加 chip；持續微調 |

---

## Acceptance criteria

### 多幣別

- Group 可設定 `base_currency`；當前 epoch 無 record 時可改、有 record 則 server reject + UI disable
- Settings 可設定四幣別兩兩匯率；rate 變更不影響歷史 record 的 `original_amount` / `amount`
- 記帳表單可選 currency；換算金額即時 preview
- 多幣別 record 在列表顯示原始幣別 + base 等值小字
- balance 計算用 `CashTransactions.amount`（base 整數），與幣別無關，行為不變
- USD record 金額正確 round-trip（cent ↔ 整數 ↔ 顯示，$12.50 ↔ 1250 ↔ "$12.50"）
- `tsc --noEmit` pass — `formatAmount` 強制傳 currency 參數，漏帶 → compile error

### Trip

- Trip 建立時若 `start_date < currentEpochStartedAt` → server reject
- 結束 epoch（leave / accept invite to existing group with active trip）時若有 active trip → reject
- Pin 在 past epoch 時 trip 相關 UI 唯讀（沿用 epoch-readonly）
- Trip 詳情頁顯示 trip-scoped records list（filter by trip_id）
- Records 表單 trip selector 在 active trip 範圍內 → 預設選該 trip
- Trip × currency 預設值：trip.default_currency || group.base_currency

### 整合

- 一條 e2e：建 trip → JPY 記帳 → balance 用 base 幣別正確算 → 結束 trip → 翻舊章節 trip / record 唯讀

---

## Open / deferred questions

1. **Trip 入口位置**：dashboard hero 旁？Settings 分類？→ 待 designer 決定
2. **Trip color token 系統**：v0.17.0 沿用單一中性色；token 化留之後 polish
3. **Income 多幣別 UI**：v0.17.1 / v0.18？由 user feedback 決定優先序
4. **Settlement 多幣別**：何時做？看跨幣別還款場景的回饋頻率
5. **Trip 結束 celebration**：Futari「克制」氣質可能不做；留設計師決定
6. **Trip 詳情頁總額混幣別策略**：是否需要切換顯示「全部 JPY 視角 / 全部 TWD 視角」toggle？
7. **匯率語意 retroactive toggle**：若 user feedback 反映「改 rate 後過去 record 應該跟著變」是常見預期，再評估補 hybrid toggle
