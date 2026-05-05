# 車輛 & FuelLog 設計（Phase 2 Slice 1 + 2）

> Slice 1（車輛基礎）+ Slice 2（FuelLog + 購車雙寫 + NewCarForm 擴充）均已實作。

---

## 設計 bundle

設計師（claude.ai/design）2026-05-05 交付 Phase 2 hi-fi bundle，存在 `.claude/phase2-design/`：

```
.claude/phase2-design/
├── README.md              ← 給 coding agent 看的「先讀我」
├── chats/
│   ├── chat1.md           (1545 行，主要迭代過程)
│   ├── chat2.md / chat3.md
│   └── chat4.md           (含視覺決策收斂：line mark / inline picker / 56px hero)
└── project/
    ├── Phase 2 · 資產系統.html   ← 主畫布
    ├── car-screens.jsx           ← 車詳細 hero / timeline / action bar
    ├── car-forms.jsx             ← FuelLog 表單 + NewCarForm（含 color picker）
    ├── asset-marks.jsx / v2      ← 4 種類型 marks 三種 style 探索
    ├── asset-picker.jsx          ← AddSheet 關聯愛物 picker（3 種版型）
    └── asset-extras.jsx          ← 空狀態、light-dot 點陣
```

**怎麼讀**：先讀 README.md → 再讀 chats（設計意圖在這裡）→ html 是輸出，尺寸/色票規則在 source 裡。不要直接 render HTML 截圖。

### Bundle 實作狀態

**已實作：**
- Slice 1：`/assets` 列表、`/assets/[id]`、`AssetIcon`、`AssetListItem`、`AssetEmptyState`、`AssetSheet`、`AssetPickerSheet`、`AssetHero`、`actions/asset.ts`、`lib/db/queries/asset.ts`
- Slice 2：`actions/fuelLog.ts`、`lib/fuelEcon.ts`、`lib/db/queries/fuelLog.ts`、`lib/primaryUser.ts`、NewFuelLog sheet、車詳情 hero（avgFuelEcon + action bar）、FuelRow、`carDetails` 擴充（brand/model/year/color/primaryUserId/fuelType）

**尚未實作：**

| 設計項目 | 對應 mockup | 狀態 |
|---|---|---|
| Asset marks 系統（line/glyph/badge × 4 types 完整版） | asset-marks.jsx / v2 | ⬜ 目前各 type 有 icon，mark system 未完整 |
| Car hero 用 `car.color` 動態上色 | car-screens.jsx | ⬜ carDetails 有 color 欄位但 hero tinting 未實作 |
| AssetPickerSheet 視覺分組（inline 分區，chat4 推薦） | asset-picker.jsx | ⬜ 仍 flat list |
| House entity | asset-list.jsx | ⬜ Slice 4 |

---

## Slice 1 — 車輛基礎

### Scope In

- 「愛物」tab 從 `/coming-soon` 升級為真實 `/assets` route
- Asset CRUD（type=`car`）：新增 / 編輯 / 軟刪除
- CarDetails：name（必填）、plate（必填）、purchasedAt（選填）、purchasePrice（選填）
- AddSheet 新增「關聯愛物」picker（optional）
- `/assets/[id]`：本月 + 累積雙數字 + 該車 transaction list
- `/assets/[id]` FAB：prefill `assetId` + category=`transit`
- 已刪除車的 zombie 處理：AddSheet 編輯模式顯示「（已刪除）」label
- BottomNav FAB 依路由切換動作 + 顏色（黑=記交易 / 橘=新增愛物）
- RLS + realtime for Assets / CarDetails

### Scope Out（Slice 2+）

- FuelLog + 油耗計算
- 其他愛物類型
- /records FilterSheet 加 asset 維度
- 保養提醒、里程儀表板、折舊 / 二手估價（永遠不做）

### Information Architecture

| Route | 用途 |
|---|---|
| `/assets` | 平鋪愛物 list |
| `/assets/[id]` | 車詳情（hero + transaction list）|

FAB 依 pathname 變身：`/assets` → 橘色開 AssetSheet；`/assets/[id]` → 黑色開 AddSheet（prefill assetId）；其他頁 → 維持原行為。

### Edge cases（Slice 1）

| 情境 | 處理 |
|---|---|
| 車詳情頁本月為 0 | Hero「本月 NT$ 0」用 ghost 字，下方 list 仍渲染 |
| 車詳情頁累積為 0（剛建好） | 兩個數字都是 0，空狀態文案「還沒有為這台車記下任何花費」 |
| AssetPickerSheet 沒有任何車 | 空 list + 「不關聯」選項仍存在，不做跳轉（保存 form state 太複雜） |
| 編輯 transaction，assetId 指向已刪車 | 顯示「我的 Tesla（已刪除）」灰底；可改成其他車或「不關聯」 |
| AssetPickerSheet 內 | 不顯示已刪車；新關聯不允許指向已刪車 |
| Partner 同時刪了同一台車 | list refresh；車詳情 redirect 回 `/assets` |
| 同名車 / 同 plate | DB 不擋，slice 1 不額外擋 |
| Solo mode | Asset 是 group-level，solo / 雙人行為完全相同 |

### 待設計師決策

1. **FAB glyph 是否變化** — 預設沿用「+」，僅換背景色 `var(--accent)`
2. **AssetEmptyState illustration** — 等設計師補
3. **AssetListItem 卡片密度與 icon 設計**

---

## Slice 2 — FuelLog + 購車雙寫 + NewCarForm 擴充

> 已實作。見 `actions/fuelLog.ts`, `lib/fuelEcon.ts`, `lib/db/queries/fuelLog.ts`, `lib/primaryUser.ts`。

### Scope In（已實作）

- `carDetails` 加 `primaryUserId`（nullable）+ `fuelType`（NOT NULL: 95/98/diesel/electric）
- NewCarForm / AssetSheet 擴充：fuelType picker + 主要使用人 toggle（我/對方/共用）
- 購車雙寫：建車（purchasePrice > 0）→ atomic 自動建 CashTransaction（category=transit）
- FuelLog CRUD：NewFuelLog sheet（油量/里程/金額/站名/付款人/日期）
- 加油雙寫：FuelLog + CashTransaction（atomic，fuelLogId 反向綁定）
- `/assets/[id]` hero：油車 avgFuelEcon big + 本月/累計；電車 退化版
- `/assets/[id]` action bar：油車 [加油][+ 其他花費][編輯]；電車 [+ 其他花費][編輯]；FAB 隱藏
- timeline：FuelRow（km/L badge）vs CompactRow 分支
- tap fuel transaction → 開 NewFuelLog edit（不開 AddSheet）
- carDetails 擴充：brand / model / year / color

### Scope Out（slice 3+）

- 電車 ChargeLog、維修保養、油耗趨勢圖
- `/assets` list CarHeroCard 三欄升級
- AssetPickerSheet inline 分區
- `/records` FilterSheet 加「依愛物」維度
- 折舊 / 二手估價（永遠不做）

### 設計決策

| # | 決定 | Rationale |
|---|---|---|
| Q1 | FuelLog 與 CashTransaction **雙寫**（atomic） | ledger 仍是錢的 source of truth；Phase 1 balance/settlement/篩選 完全不動 |
| Q2 | NewCarForm 只加 primaryUserId + fuelType；brand/model/year/color 留下個 slice | primaryUserId 是 auto-tx 推 payer 必要；油種是 FuelLog 預設必要 |
| Q3 | auto-tx category = `transit` | 不動 categories.ts；user 想另分類自己改 |
| Q4 | primaryUserId → (paidBy, splitType)：我=all_mine+viewer / 對方=all_mine+partner / 共用=half+viewer | 沿用既有 paidBy 翻轉 pattern；helper 在 `lib/primaryUser.ts` |
| Q5 | 既有車 primaryUserId 留 NULL，不 backfill 購車 transaction | friend test 規模 ≤ 5 台 |
| Q6 | 編輯 purchasePrice 不同步動 auto-transaction（允許 drift） | purchasePrice 只在 AssetSheet 顯示，drift 不影響 UX |
| Q7a | `liters` 精度 `numeric(6, 2)` | 油單精確到 0.01 公升 |
| Q7b | `fuelType` 存 carDetails + fuelLogs 兩處（NOT NULL） | carDetails 設預設、fuelLog 可 per-event 改 |
| Q7c | 砍掉 `pricePerLiter` | 雙寫後金額在 transaction，避免 drift |
| Q7d | 加 `station` nullable text | 未來可做加油站熱力圖 |
| Q7e | `loggedAt` 保留，不獨立編輯 | 排序 fuelLogs 不需 JOIN |
| Q7f | FK 方向：`cashTransactions.fuelLogId` | editTransaction 是 soft-delete + insert，FK 在 transaction 自然延續 |
| Q8 | 升級 hero + timeline + action bar；list / picker 留 polish slice | hero/timeline 必升否則 fuel 資料無處展示 |
| Q9 | 編輯 FuelLog → dedicated NewFuelLog sheet | UX 直覺對應「我在編輯一次加油事件」；不污染 AddSheet |
| Q10 | action bar 三顆，FAB 隱藏 | 所有寫入動作集中在 action bar，符合 mockup |
| Q11 | NewFuelLog 只收 PayerToggle；desc auto-generated；default = primaryUserId ?? viewer | 跟 mockup 一致 |
| Q12 | avgFuelEcon 視窗 = 近 6 個月 | 接近一次保養週期 |
| Q13 | 第一筆 FuelLog km/L 顯示「—」| 簡單；user 知道第一筆是基準 |
| Q14 | 不存 econ，每次 query 即時算 | friend-test 規模 query cost 不痛 |
| Q15 | carDetails.fuelType backfill NOT NULL DEFAULT '95' | 友 test 規模 default 95% 油車安全 |
| Q16a | NewFuelLog 加 MiniCalendar | 友 test user 經常隔天補記 |
| Q16b | auto-tx 購車日期 = purchasedAt，沒填用 NOW() | 跟 user 意圖對齊 |
| Q17 | 沒 FuelLog 的車 hero 顯示「—」+ 副標引導 | 保留視覺位置 + 引導 CTA |
| Q18 | [+ 其他花費] 開 AddSheet，category 留空 | user 自己選（停車/過路/保養）|

### Edge cases（Slice 2）

| 情境 | 處理 |
|---|---|
| 第一筆加油（沒上筆） | km/L 顯示「—」；hero「—」+ 副標「加第一筆油看油耗」 |
| 編輯加油改了 odometer | 不存 econ，下次 query 自動重算 |
| 倒退 odometer（user 輸錯） | DB 不擋；UI 顯示「—」（dist ≤ 0 fallback） |
| 同日多筆加油 | 排序穩定（logged_at + created_at tie-break） |
| 軟刪一筆中間的加油 | recalc 不算 deleted；後續筆「上一筆」自動跳過 |
| 電車（fuelType=electric） | NewFuelLog 不可開；仍可關聯到電車記停車/過路費 |
| 油車改電車 | hero avgFuelEcon 仍算歷史平均；action bar 隱藏 [加油] |
| 購車 transaction 被軟刪 | carDetails.purchasePrice 不變（drift 允許）；hero 累計總額少這筆 |
| purchasePrice 為空或 0 | 不建 auto-tx |
| AddSheet 編輯 fuel transaction | 路由判斷 `fuelLogId IS NOT NULL` → 開 NewFuelLog |
| Solo mode | primaryUserId 固定 viewer.id；升級雙人後可在 AssetSheet 改 |

### 車輛 polish（Slice 2 後半段）

| 設計項目 | 對應 mockup |
|---|---|
| `/assets` list CarHeroCard 升級（avgFuelEcon 三欄） | car-screens.jsx CarHeroCard |
| AssetPickerSheet inline 分區 | asset-picker.jsx（chat4 推薦） |
| carDetails brand / model / year / color picker | car-forms.jsx NewCarForm |

### Slice 3+ 候選

| 設計項目 | 備註 |
|---|---|
| 電車 ChargeLog（kWh / 充電站 / km/kWh） | 看 EV user 比例 |
| 維修保養紀錄 | 待設計 |
| `currentOdometer` 欄位 | 待設計 |
| asset marks v2（4 type 完整版） | 孩/寵/植/房/險 slice 一起 |
| `/records` FilterSheet 加「依愛物」維度 | 待設計 |

### 待設計師確認

1. **NewFuelLog 編輯 delete 入口** — 預設右上角「⋯」開 ConfirmModal
2. **avgFuelEcon 顯示精度** — 預設 `.toFixed(1)`（如 13.4 km/L）
3. **FuelRow 油泵 icon 顏色** — 預設 `#E8E4D8` 背景 + `#8A7B5A` ink
4. **電車版 hero 退化型** — 預設同 Slice 1 雙數字
5. **「主要使用人」toggle label** — 本 spec 統一用「共用」；確認設計師意圖
6. **AssetListItem 卡片密度與 icon 設計** — 等設計師補
