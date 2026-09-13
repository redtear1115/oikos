---
last_updated: 2026-09-13
status: shipped
first_shipped_in: v0.3.0
updates:
  - v0.3.0: Slice 1 — 車輛 entity（Asset CRUD type='car' + CarDetails + 詳情頁 + AddSheet 關聯愛物 picker）
  - v0.4.0: Slice 2 — FuelLog + 購車雙寫 + NewCarForm 擴充（primaryUserId / fuelType / brand / model / year / color）
  - v0.8.1: AssetPickerSheet inline 分組 + carDetails brand/model/year/color polish
  - v0.11.4: AssetListItem per-type tint（#28）
  - v1.6.0: avgFuelEcon 統一為「近 180 天距離加權」，詳情頁與 hero 卡共用同一函式；listFuelLogsForAsset 補 created_at tie-break（#1089 / #1095）
related_specs: [aibutsu, transactions]
related_issues: ["#28", "#1089", "#1095"]
---

# 車輛 & FuelLog

> Car 是愛物的第一個 entity slice，附帶 FuelLog 子實體與「購車 / 加油 → CashTransaction 雙寫」機制。

---

## Information Architecture

| Route | 用途 |
|---|---|
| `/assets` | 平鋪愛物 list |
| `/assets/[id]` | 車詳情（hero + transaction list） |

FAB 依 pathname 變身：
- `/assets` → 橘色開 AssetSheet（新增愛物）
- `/assets/[id]` → 黑色開 AddSheet（prefill assetId）
- 其他頁 → 維持原行為

---

## Slice 1 — 車輛基礎（v0.3.0）

### Scope

- 「愛物」tab 從 `/coming-soon` 升級為真實 `/assets` route
- Asset CRUD（type=`car`）：新增 / 編輯 / 軟刪除
- CarDetails 欄位語意：
  - `name`（必填）
  - `plate`（必填）
  - `purchasedAt`（選填）
  - `purchasePrice`（選填）
- AddSheet 新增「關聯愛物」picker（optional）
- `/assets/[id]`：本月 + 累積雙數字 + 該車 transaction list
- `/assets/[id]` FAB：prefill `assetId` + category=`transit`
- 已刪除車的 zombie 處理：AddSheet 編輯模式顯示「（已刪除）」label
- BottomNav FAB 依路由切換動作 + 顏色（黑 = 記交易 / 橘 = 新增愛物）

### Edge cases

| 情境 | 處理 |
|---|---|
| 車詳情頁本月為 0 | Hero「本月 NT$ 0」用 ghost 字，下方 list 仍渲染 |
| 車詳情頁累積為 0（剛建好） | 兩個數字都是 0，空狀態文案「還沒有為這台車記下任何花費」 |
| AssetPickerSheet 沒有任何車 | 空 list +「不關聯」選項仍存在，不做跳轉（保存 form state 太複雜） |
| 編輯 transaction，assetId 指向已刪車 | 顯示「我的 Tesla（已刪除）」灰底；可改成其他車或「不關聯」 |
| AssetPickerSheet 內 | 不顯示已刪車；新關聯不允許指向已刪車 |
| Partner 同時刪了同一台車 | list refresh；車詳情 redirect 回 `/assets` |
| 同名車 / 同 plate | DB 不擋，slice 1 不額外擋 |
| Solo mode | Asset 是 group-level，solo / 雙人行為完全相同 |

---

## Slice 2 — FuelLog + 購車雙寫（v0.4.0）

### Scope

- `CarDetails` 加 `primaryUserId`（nullable）+ `fuelType`（NOT NULL: `95` / `98` / `diesel` / `electric`）+ `brand` / `model` / `year` / `color`
- NewCarForm / AssetSheet 擴充：fuelType picker + 主要使用人 toggle（我/對方/共用）
- **購車雙寫**：建車（purchasePrice > 0）→ atomic 自動建 CashTransaction（category=`transit`）
- FuelLog CRUD：NewFuelLog sheet（油量 / 里程 / 金額 / 站名 / 付款人 / 日期）
- **加油雙寫**：FuelLog + CashTransaction（atomic，`fuelLogId` 反向綁定）
- `/assets/[id]` hero：油車 avgFuelEcon big + 本月 / 累計；電車退化版
- `/assets/[id]` action bar：油車 `[加油][+ 其他花費][編輯]`；電車 `[+ 其他花費][編輯]`；FAB 隱藏
- Timeline：FuelRow（km/L badge）vs CompactRow 分支
- Tap fuel transaction → 開 NewFuelLog edit（不開 AddSheet）

### 關鍵設計決策

| # | 決定 | Rationale |
|---|---|---|
| Q1 | FuelLog 與 CashTransaction **雙寫**（atomic） | ledger 仍是錢的 source of truth；balance / settlement / 篩選 完全不動 |
| Q3 | auto-tx category = `transit` | 不動 categories.ts；user 想另分類自己改 |
| Q4 | `primaryUserId` → (paidBy, splitType)：我 = `all_mine` + viewer / 對方 = `all_mine` + partner / 共用 = `half` + viewer | 沿用既有 paidBy 翻轉 pattern；helper 在 `lib/primaryUser.ts` |
| Q5 | 既有車 `primaryUserId` 留 NULL，不 backfill 購車 transaction | friend test 規模 ≤ 5 台 |
| Q6 | 編輯 `purchasePrice` 不同步動 auto-transaction（允許 drift） | `purchasePrice` 只在 AssetSheet 顯示，drift 不影響 UX |
| Q7a | `liters` 精度 `numeric(6, 2)` | 油單精確到 0.01 公升 |
| Q7b | `fuelType` 存 CarDetails + FuelLog 兩處（NOT NULL） | CarDetails 設預設、FuelLog 可 per-event 改 |
| Q7c | 砍掉 `pricePerLiter` | 雙寫後金額在 transaction，避免 drift |
| Q7d | 加 `station` nullable text | 未來可做加油站熱力圖 |
| Q7e | `loggedAt` 保留，不獨立編輯 | 排序 fuelLogs 不需 JOIN |
| Q7f | FK 方向：`cashTransactions.fuelLogId` | editTransaction 是 soft-delete + insert，FK 在 transaction 自然延續 |
| Q9 | 編輯 FuelLog → dedicated NewFuelLog sheet | UX 直覺對應「我在編輯一次加油事件」；不污染 AddSheet |
| Q10 | action bar 三顆，FAB 隱藏 | 所有寫入動作集中在 action bar |
| Q11 | NewFuelLog 只收 PayerToggle；desc auto-generated；default = `primaryUserId ?? viewer` | 跟 mockup 一致 |
| Q12 | avgFuelEcon = 近 6 個月（180 天）**距離加權**平均：窗內總距離 ÷ 總公升，扣掉最早一筆的公升數（那桶油燒在量測區間之前）。窗的基準點是**今天**，不是最後一筆加油 | 6 個月接近一次保養週期。加權而非「每段 km/L 取算術平均」——算術平均讓省油的短程和耗油的長程等權重，會系統性高估；使用者付錢的是燒掉的公升數。基準點取今天是因為「平均油耗」指的是近期油耗，所以半年沒加油的車**應該**算不出平均（走 null 空狀態），而不是顯示一個陳年數字 |
| Q13 | 第一筆 FuelLog km/L 顯示「—」 | 簡單；user 知道第一筆是基準 |
| Q14 | 不存 econ，每次 query 即時算 | friend-test 規模 query cost 不痛 |
| Q15 | `carDetails.fuelType` backfill NOT NULL DEFAULT '95' | 友 test 規模 default 95% 油車安全 |
| Q16a | NewFuelLog 加 MiniCalendar | 友 test user 經常隔天補記 |
| Q16b | auto-tx 購車日期 = `purchasedAt`，沒填用 NOW() | 跟 user 意圖對齊 |
| Q17 | 沒 FuelLog 的車 hero 顯示「—」+ 副標引導 | 保留視覺位置 + 引導 CTA |
| Q18 | `[+ 其他花費]` 開 AddSheet，category 留空 | user 自己選（停車 / 過路 / 保養） |

### Edge cases

| 情境 | 處理 |
|---|---|
| 第一筆加油（沒上筆） | km/L 顯示「—」；hero「—」+ 副標「加第一筆油看油耗」 |
| 編輯加油改了 odometer | 不存 econ，下次 query 自動重算 |
| 倒退 odometer（user 輸錯） | DB 不擋；UI 顯示「—」（dist ≤ 0 fallback） |
| 同日多筆加油 | 排序穩定（`logged_at + created_at` tie-break）；兩份 list query 用同一組 ORDER BY，平均油耗不隨抓取順序變動 |
| 超過 180 天沒加油 | 平均油耗顯示「—」（無近期資料，非錯誤）；里程與上次加油日期照常顯示 |
| 軟刪一筆中間的加油 | recalc 不算 deleted；後續筆「上一筆」自動跳過 |
| 電車（`fuelType=electric`） | NewFuelLog 不可開；仍可關聯到電車記停車 / 過路費 |
| 油車改電車 | hero avgFuelEcon 仍算近 180 天平均（超窗即「—」）；action bar 隱藏 `[加油]` |
| 購車 transaction 被軟刪 | `carDetails.purchasePrice` 不變（drift 允許）；hero 累計總額少這筆 |
| `purchasePrice` 為空或 0 | 不建 auto-tx |
| AddSheet 編輯 fuel transaction | 路由判斷 `fuelLogId IS NOT NULL` → 開 NewFuelLog |
| Solo mode | `primaryUserId` 固定 viewer.id；升級雙人後可在 AssetSheet 改 |

---

## 實作落地點

`actions/fuelLog.ts` / `lib/fuelEcon.ts`（`singleEcon()` 單次油耗、`computeAvgEcon()` 平均油耗——**詳情頁與 hero 卡共用這一份**，#1095 收斂）/ `lib/db/queries/fuelLog.ts`（`getCarHeroStats()` 只抓 row，油耗算術一律委派 `lib/fuelEcon.ts`）/ `lib/primaryUser.ts`（primaryUserId 翻譯 helper）

---

## Acceptance criteria

- 建立 car asset（purchasePrice > 0）→ 同 tx 內 INSERT Asset + CarDetails + CashTransaction（auto-tx，category=`transit`）
- 加油（NewFuelLog）→ 同 tx 內 INSERT FuelLog + CashTransaction（`fuelLogId` 反向綁定）
- 編輯 fuel transaction → 路由到 NewFuelLog（不開 AddSheet）
- avgFuelEcon = 近 6 個月（180 天）距離加權平均（總距離 ÷ 總公升，扣掉窗內最早一筆的公升數）；hero 顯示 `toFixed(1)` km/L
- 同一台車、同一批資料，詳情頁與 hero 卡顯示**同一個數字**（同一個函式、同一個窗）
- 近 180 天內不足 2 筆加油 → 平均油耗「—」；里程與上次加油日期不受窗影響
- 第一筆加油 / 倒退 odometer → km/L 顯示「—」
- 軟刪購車 tx → CarDetails purchase fields 不變；hero 累計減少
- 油車改電車 → action bar 隱藏 [加油]；NewFuelLog 不可開；歷史平均仍算
- Partner 同時操作（刪同一台車 / 加油 race）→ list refresh / detail redirect 正確
- Solo mode：`primaryUserId` 自動填本人，升雙人後可手動改

---

## Slice 3+ 候選

- 電車 ChargeLog（kWh / 充電站 / km/kWh）— 看 EV user 比例
- 維修保養紀錄
- `currentOdometer` 欄位
- Asset marks v2（4 type 完整版）— 跨 type slice 一起
