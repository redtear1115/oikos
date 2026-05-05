# Phase 2 Slice 2 — 車輛續集（FuelLog + 購車交易雙寫 + NewCarForm 擴充）

> 目標：把車從 Slice 1 的「費用彙整入口」升級為「有油耗個性的愛物」。FuelLog 與購車事件都用 dual-write pattern 串進既有 ledger，UI 升級到必要範圍（hero / timeline / action bar），list / picker 留下個 polish slice。
> 優先級：P2 Slice 2（Slice 1 完成後立即接續）
> 範圍：仍只動 type=`car`；其他愛物（孩 / 寵 / 植 / 房 / 保險）留 Slice 3+

---

## 背景與動機

Slice 1（2026-05-05 ship）把「資產 = 費用彙整入口」的抽象做完，但車這個類型還缺它最具特色的兩件事：油耗紀錄、購入事件 — 沒這兩件，「車」跟其他類型的愛物在 UX 上沒有區別。設計師（claude.ai/design）2026-05-05 交付完整 Phase 2 hi-fi bundle，存在 [.claude/phase2-design/](../../../.claude/phase2-design/)，其中 [car-forms.jsx](../../../.claude/phase2-design/project/car-forms.jsx) + [car-screens.jsx](../../../.claude/phase2-design/project/car-screens.jsx) 是本 slice 的視覺 source of truth。

設計師對話收斂的關鍵決策（chat4）：line mark style / 56px hero / 設計 bundle 索引另見 [2026-05-05-phase-2-design-bundle.md](2026-05-05-phase-2-design-bundle.md)。

friend test 階段的 prod 規模仍小（Slice 1 剛上線當天，車數量 ≤ 5），允許做侵入式 schema 變更與不 backfill 既有資料。

---

## 現況分析

### Schema

- `fuelLogs` 表 Phase 0 建好但從未使用（[lib/db/schema.ts:92](../../../lib/db/schema.ts)）
- `carDetails` 缺主要使用人 + 油種欄位
- `cashTransactions` 缺 fuelLog 反向關聯
- `Assets` / `CarDetails` 已有 RLS + realtime（Slice 1 migration 0006）
- `fuelLogs` 沒有 RLS / 沒有 realtime / 沒在 pg_cron cleanup 名單

### UI

- `/assets/[id]` hero 是 Slice 1 的「本月 / 累積 全部支出」雙數字
- `/assets/[id]` 沒有 action bar；FAB 在 `/assets/[id]` prefill assetId+category=transit
- 沒有任何 FuelLog 元件
- AssetSheet 只有 4 欄（name / plate / purchasedAt / purchasePrice）
- AddSheet 編輯 fuel transaction 時不知道它是 fuel — 跟一般 transaction 一樣顯示

### 缺少的部分

- `lib/db/queries/fuelLog.ts`（list by asset、recent N within period）
- `actions/fuelLog.ts`（create / edit / softDelete，dual-write）
- `actions/asset.ts` 的 `createCar`：要擴充成「atomic create Asset + CarDetails + 自動 CashTransaction（若 purchasePrice > 0）」
- NewFuelLog sheet（新元件）
- AssetSheet + NewCarForm 加 fuelType picker / 主要使用人 toggle
- `/assets/[id]` hero / timeline / action bar 升級
- `lib/validators.ts` 的 `validateFuelLogInput`、`validateCarInput` 擴充
- `RealtimeProvider` 加 `fuel-log-changed` event

---

## Scope

### In

- 車的 `primaryUserId`（主要使用人，nullable FK to profiles）+ `fuelType`（油種，NOT NULL enum）
- NewCarForm 擴充欄位：fuelType picker（4 顆按鈕：95 / 98 / 柴油 / 電）+ 主要使用人 toggle（我 / 對方 / 共用）
- AssetSheet 編輯模式同步擴充上述兩欄位
- 購車事件雙寫：建車（with purchasePrice > 0）→ atomic 自動建一筆 CashTransaction（category=transit, assetId=newCar.id）
- FuelLog CRUD：dedicated NewFuelLog sheet（5 row form：油量 / 里程 / 金額 / 站名 / 付款人 + MiniCalendar 日期）
- 加油事件雙寫：FuelLog + CashTransaction（atomic，category=transit, fuelLogId 反向綁定）
- `cashTransactions.fuelLogId` nullable FK + `fuelLogs` schema 重塑（liters→numeric, 砍 pricePerLiter, 加 station）
- `/assets/[id]` hero 升級（油車：avgFuelEcon big + 本月/累計 sub-stats；電車：保留 Slice 1 雙數字）
- `/assets/[id]` timeline 升級（fuel transactions 用 FuelRow 渲染含 km/L badge / 公升 / 站名）
- `/assets/[id]` action bar：油車 [加油（primary）] [+ 其他花費] [編輯]；電車 [+ 其他花費（primary）] [編輯]
- `/assets/[id]` 不再顯示 FAB（被 action bar 取代）
- AddSheet / RecordsList 的編輯路由：`if transaction.fuelLogId IS NOT NULL` → 開 NewFuelLog edit（不開 AddSheet）
- RLS + realtime publication for `fuelLogs`
- pg_cron 把 `fuelLogs` 加進 weekly cleanup
- Realtime: `fuel-log-changed` event + RealtimeProvider wiring
- 既有 Slice 1 車的 backfill：`primaryUserId = NULL`、`fuelType = '95'`，**不**回補購車 transaction

### Out（slice 3+）

- 電車 ChargeLog（充電紀錄、kWh、km/kWh）— EV1 已知限制
- 維修 / 保養紀錄（mockup action bar 第二顆 [保養] 我們改成 [+ 其他花費]）
- 油耗趨勢圖 / 加油站熱力圖
- `/assets` list 升級成 [CarHeroCard](../../../.claude/phase2-design/project/car-screens.jsx)（含 avgFuelEcon 三欄）
- AssetPickerSheet 升級成 inline 分區（chat4 推薦）
- `/records` FilterSheet 加「依愛物」維度
- `currentOdometer` 欄位（per Q13 P1，第一筆不算 km/L 即可，不需 baseline）
- carDetails 加 brand / model / year（Q2=B 嚴守，留下個 polish slice）
- 折舊 / 二手估價 / 二手出售（per CLAUDE.md 不在範圍內）
- 換車（軟刪除舊車 + 建新車）的特殊 flow

---

## 設計決策表

每個決策的展開討論見 brainstorming session（保留在 git plan，但本 spec 是 lock 後的最終答案）。

| # | 決策 | 答案 | Rationale |
|---|---|---|---|
| Q1 | FuelLog 與 CashTransaction 關聯 | **Dual-write**（atomic 建兩筆） | ledger 仍是錢的 source of truth；Phase 1 的 balance / settlement / 篩選 完全不動 |
| Q2 | NewCarForm 擴充範圍 | **B + Y1**：加主要使用人 + 油種 picker（其他欄位留下個 slice） | 主要使用人是 auto-transaction 推 payer 必要；油種是 FuelLog 預設必要；color/brand/model/year/odometer 是「資產身分」獨立議題 |
| Q3 | auto-tx 用什麼 category | **`transit`** for 加油 + 購車 | 不動 categories.ts；user 想另分類就自己改 |
| Q4 | 主要使用人映射 | **A1+B1**：存 `carDetails.primaryUserId` nullable FK；我 → all_mine+viewer / 對方 → all_mine+partner / 共用 → half+viewer | 沿用既有 `paidBy` 翻轉 pattern，不寫新 helper |
| Q5 | Migration retroactive | **B-nullable-fk + X**：primaryUserId nullable（既有車留 NULL），不 backfill 購車 transaction | friend test 規模 ≤ 5 台，user 想要的話自己刪掉重建一台 |
| Q6 | 編輯 purchasePrice | **E2**：drift 允許，編輯 carDetails 不同步動 transaction | purchasePrice 不對外顯示（只在 AssetSheet 編輯 form 看得到），drift 內部問題不影響 UX |
| Q7a | liters 精度 | `numeric(6, 2)` | 油單通常精確到 0.01 公升 |
| Q7b | fuelType 存哪 | **Y1**：carDetails 跟 fuelLogs 都存（NOT NULL） | NewCarForm 設定預設、FuelLog 可 per-event 改 |
| Q7c | pricePerLiter | **砍掉** | Q1=A 後金額在 transaction，不存避免 drift |
| Q7d | station | **加 nullable text** | 自由輸入；未來可做加油站熱力圖 |
| Q7e | loggedAt | **保留 + 建立時 = transaction.date，不獨立編輯** | 排序 fuelLogs 不用 JOIN；改日期走編輯 transaction |
| Q7f | FK 方向 | **`cashTransactions.fuelLogId`**（transaction 指 fuel） | Phase 1 editTransaction 是 soft-delete + insert，FK 在 transaction 上自然延續關聯 |
| Q8 | UI 升級範圍 | **U2 + (b) hybrid hero + EV1**：升級 hero + timeline + action bar；list / picker 留 polish slice；油車 hero avgFuelEcon big + 本月/累計（含非 fuel 跨類）；電車不支援 FuelLog | hero / timeline 必升，否則 fuel 資料沒地方好好展示；list / picker 升級跟 FuelLog feature 解耦 |
| Q9 | 編輯 FuelLog UX | **F1**：dedicated NewFuelLog sheet edit mode | UX 對應「我在編輯一次加油事件」直覺；fuel UI 不污染 AddSheet |
| Q10 | /assets/[id] FAB | **N3**：action bar 三顆 [加油][+ 其他花費][編輯]，FAB 隱藏 | 所有寫入動作集中在 action bar，符合 mockup 設計意圖 |
| Q11 | NewFuelLog form 細節 | (a) 只收 PayerToggle，splitType 隱式從 mapping 推 / (b) desc auto-generated `加油 · {station}` / (c) PayerToggle default = `carDetails.primaryUserId` ?? viewer | 跟 mockup 一致；要更精細分攤回 /records 改 |
| Q12 | avgFuelEcon 視窗 | **近 6 個月**（180 天） | 接近一次保養週期、樣本夠且可比 |
| Q13 | 第一筆 FuelLog km/L | **P1**：badge 顯示「—」，hero 也是「—」直到第二筆 | 簡單；user 自然知道第一筆是基準 |
| Q14 | km/L cascade | **C1**：不存 econ，每次 query 即時算 | KISS；friend-test 規模 query cost 不痛 |
| Q15 | carDetails.fuelType backfill | **M1**：NOT NULL DEFAULT '95' | 友 test 規模 default 95% 油車是安全猜，user 可在 AssetSheet 改 |
| Q16a | NewFuelLog 收日期 | **T2**：加 MiniCalendar | 友 test user 經常隔天才補記 |
| Q16b | auto-tx 購車日期 | **D1**：用 NewCarForm 的 purchasedAt，沒填用 NOW() | 跟 user 意圖對齊 |
| Q17 | 沒 FuelLog 的車 hero | **H1**：avgFuelEcon 顯示「—」+ 副標「加第一筆油看油耗」 | 保留視覺位置 + 引導 CTA |
| Q18 | [+ 其他花費] 行為 | **B1**：開 AddSheet，prefill assetId，category 留空 | user 自己選（停車/過路/保養），符合「其他」語意 |

---

## Schema 變更

### `carDetails`

```ts
// lib/db/schema.ts — Slice 2 改動
export const carDetails = pgTable('CarDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  name: text('name').notNull(),
  plate: text('plate').notNull(),
  purchasedAt: date('purchased_at'),
  purchasePrice: integer('purchase_price'),
  // 新增：
  primaryUserId: uuid('primary_user_id').references(() => profiles.id), // NULL = 共用
  fuelType: fuelTypeEnum('fuel_type').notNull().default('95'),
})
```

### `fuelLogs`

```ts
// lib/db/schema.ts — Slice 2 重塑（Phase 0 schema 大幅調整）
export const fuelLogs = pgTable('FuelLogs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  // 改：integer → numeric
  liters: numeric('liters', { precision: 6, scale: 2 }).notNull(),
  fuelType: fuelTypeEnum('fuel_type').notNull(),
  odometer: integer('odometer').notNull(),
  // 砍 pricePerLiter
  // 加：
  station: text('station'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### `cashTransactions`

```ts
// 加一欄：
fuelLogId: uuid('fuel_log_id').references(() => fuelLogs.id),
```

### `fuelTypeEnum`

```ts
export const fuelTypeEnum = pgEnum('fuel_type', ['95', '98', 'diesel', 'electric'])
```

Phase 0 已建 enum，Slice 2 不需重建；確認 enum values 已包含 'electric'，若否補 `ALTER TYPE ADD VALUE`。

---

## Migration（drizzle/0007_phase2_slice2.sql）

raw SQL（沿用 Phase 1 / Slice 1 pattern）。Idempotent。dev + prod 都跑（per [memory/project_supabase_envs.md](../../../../../.claude/projects/-Users-ray-lee-Projects-freedom-project-oikos/memory/project_supabase_envs.md)）。

```sql
-- Phase 2 Slice 2: FuelLog + 購車雙寫 + NewCarForm 擴充

-- 0. 確認 fuel_type enum 包含 'electric'（Phase 0 若沒補 OR）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'electric'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'fuel_type')) THEN
    ALTER TYPE fuel_type ADD VALUE 'electric';
  END IF;
END $$;

-- 1. carDetails 加欄
ALTER TABLE "CarDetails" ADD COLUMN IF NOT EXISTS primary_user_id uuid REFERENCES "Profiles"(id);
ALTER TABLE "CarDetails" ADD COLUMN IF NOT EXISTS fuel_type fuel_type NOT NULL DEFAULT '95';
-- 既有車：primary_user_id 留 NULL（per Q5 X）；fuel_type 全部 '95'（per Q15 M1，default 自動套）

-- 2. fuelLogs 重塑
ALTER TABLE "FuelLogs" ALTER COLUMN liters TYPE numeric(6, 2) USING liters::numeric;
ALTER TABLE "FuelLogs" DROP COLUMN IF EXISTS price_per_liter;
ALTER TABLE "FuelLogs" ADD COLUMN IF NOT EXISTS station text;

-- 3. cashTransactions 加 FK
ALTER TABLE "CashTransactions" ADD COLUMN IF NOT EXISTS fuel_log_id uuid REFERENCES "FuelLogs"(id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_fuel_log_id ON "CashTransactions"(fuel_log_id) WHERE fuel_log_id IS NOT NULL;

-- 4. RLS for FuelLogs（沿用 0006 carDetails pattern：透過 Assets join 檢查 group ownership）
-- 只需 SELECT policy（client 透過 Supabase JS + Realtime 訂閱用）；
-- INSERT/UPDATE/DELETE 走 server actions + service role bypass RLS
DROP POLICY IF EXISTS "fuel_logs_member_select" ON "FuelLogs";
CREATE POLICY "fuel_logs_member_select" ON "FuelLogs" FOR SELECT
  USING (
    asset_id IN (
      SELECT id FROM "Assets" WHERE group_id IN (
        SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
      )
    )
  );

-- 5. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE "FuelLogs";

-- 6. pg_cron weekly cleanup（沿用 Phase 1e 既有 cleanup function pattern）
-- 在既有 cleanup function 內加一行 DELETE FuelLogs WHERE deleted_at < NOW() - INTERVAL '1 year'
-- 或加新的 cron job，看既有實作偏好（[drizzle/0002_pg_cron_cleanup.sql] 有 reference）
```

實際 cleanup 加法看 `drizzle/0002_pg_cron_cleanup.sql` 的 function 結構決定是改既有 function 或新加。

---

## 雙寫（dual-write）原子行為

四種 case，全部包在同一個 DB transaction 內（Drizzle `db.transaction()` + service role 繞過 RLS 寫入）。

### 1. 購車（`createCar` server action）

```
BEGIN
  INSERT Assets (type='car', group_id, ...) RETURNING newCar
  INSERT CarDetails (asset_id=newCar.id, name, plate, purchasedAt, purchasePrice, primaryUserId, fuelType)
  IF purchasePrice IS NOT NULL AND purchasePrice > 0:
    INSERT CashTransactions (
      group_id, asset_id=newCar.id,
      amount = purchasePrice,
      paid_by, split_type ← 從 primaryUserId 推（lib/primaryUser.ts helper）,
      category = 'transit',
      desc = '購入 · ' + name,
      date = purchasedAt ?? NOW()::date,
      fuel_log_id = NULL
    )
    recalcGroupBalance(group_id)
  revalidatePath('/assets')
COMMIT
```

primaryUserId → (paidBy, splitType) 的映射 helper 在 `lib/primaryUser.ts`（field name 對齊 Drizzle 既有 `paidBy`/`splitType`）：

```ts
export function deriveTxnFromPrimaryUser(
  primaryUserId: string | null,
  viewer: { id: string },
  partner: { id: string } | null,
): { paidBy: string; splitType: 'all_mine' | 'half' } {
  // Solo 永遠 all_mine（沒對方可分）— 必須最先檢查，否則 NULL primaryUserId 在 solo 會誤判 half
  if (partner === null) return { paidBy: viewer.id, splitType: 'all_mine' }
  // 共用（NULL）
  if (primaryUserId === null) return { paidBy: viewer.id, splitType: 'half' }
  // 主要使用人是對方
  if (primaryUserId === partner.id) return { paidBy: partner.id, splitType: 'all_mine' }
  // 主要使用人是 viewer
  return { paidBy: viewer.id, splitType: 'all_mine' }
}
```

### 2. 加油（`createFuelLog` server action）

```
BEGIN
  INSERT FuelLogs (asset_id, liters, fuel_type, odometer, station, logged_at=date) RETURNING newLog
  INSERT CashTransactions (
    group_id, asset_id, fuel_log_id=newLog.id,
    amount = cost,
    paid_by, split_type ← 從 form payerToggle（per Q4 B1 mapping）,
    category = 'transit',
    desc = '加油 · ' + (station ?? '—'),
    date
  )
  recalcGroupBalance(group_id)
  revalidatePath('/assets/[id]')
  revalidatePath('/records')
COMMIT
```

### 3. 編輯加油（`editFuelLog` server action，per Q9 F1）

FuelLog 沒有 balance 影響可 UPDATE in place；CashTransaction 走 Phase 1 editTransaction pattern。

```
BEGIN
  UPDATE FuelLogs SET liters, fuel_type, odometer, station, logged_at=newDate
    WHERE id=fuelLogId
  -- Phase 1 editTransaction：soft-delete old + insert new，新 transaction 帶同樣 fuel_log_id
  UPDATE CashTransactions SET deleted_at=NOW() WHERE id=oldTxnId
  INSERT CashTransactions (... amount=newCost, paid_by, split_type, fuel_log_id=fuelLogId, ...)
  recalcGroupBalance(group_id)
COMMIT
```

### 4. 刪除加油（`softDeleteFuelLog` server action）

```
BEGIN
  UPDATE FuelLogs SET deleted_at=NOW() WHERE id=fuelLogId
  UPDATE CashTransactions SET deleted_at=NOW() WHERE fuel_log_id=fuelLogId AND deleted_at IS NULL
  recalcGroupBalance(group_id)
COMMIT
```

### 軟刪車（`softDeleteCar`）— 沿用 Slice 1，不 cascade

`Assets.deleted_at = NOW()`；FuelLogs 跟 linked transactions 一律不動（zombie 保留歷史）。

---

## UI 變更

### NewCarForm 擴充（[car-forms.jsx](../../../.claude/phase2-design/project/car-forms.jsx) NewCarForm，僅取 fuelType + 主要使用人 兩欄）

新欄位：

- **油種 picker**：4 顆按鈕 row（95 / 98 / 柴油 / 電），預設 95
- **主要使用人 toggle**（雙人 mode）：3 segment（我 / 對方 / 共用），預設「我」；solo mode 隱藏，固定 `primaryUserId = viewer.id`

不加：color picker / brand / model / year / odometer（per Q2=B 嚴守）

### AssetSheet 編輯擴充

同 NewCarForm 兩欄位。fuelType 必選（不允許 unset）；primaryUserId 可改成 NULL（「共用」）。

### NewFuelLog sheet（新元件）

[car-forms.jsx](../../../.claude/phase2-design/project/car-forms.jsx) NewFuelLog 為視覺 source of truth：

- Header：`加油記錄` + 副標 `{car.name} · {car.plate}`
- Hero card（淺色漸層）：本次油耗 km/L big 56px（即時算）+ 副標「{dist} km · {liters}L」或「輸入里程與油量自動計算」
- 表單 5 row：
  - 油量（公升）— numeric input，accept decimal
  - 加油里程（km）— integer input；下方副標「上次 {lastOdo} km」（從 DB 抓最近一筆 fuelLog）
  - 金額（NT$）— integer input
  - 加油站 — text input（optional）
  - 付款人 — PayerToggle 3 segment（per Q11 c default = `carDetails.primaryUserId` ?? viewer）
- MiniCalendar 日期 picker（per Q16 T2）— 預設 today
- 提交 button「記下這筆」
- 編輯模式：右上角「⋯」開 ConfirmModal 「刪除這筆加油記錄？」

第一筆（沒 lastOdo）：副標顯示「第一次加油 · 之後才能算油耗」；hero 顯示「—」

### `/assets/[id]` hero 升級（[car-screens.jsx](../../../.claude/phase2-design/project/car-screens.jsx) CarDetailHeader）

油車版本：

- Top row：返回 button + car name + plate / brand model（brand model 暫不顯示，brand/model 不在 Slice 2 schema）
- Big stat：avgFuelEcon big 56px + 副標「近 6 個月」
- Sub-stats row：本月（含 fuel + 非 fuel）/ 累計（含 fuel + 非 fuel）

電車版本（fuelType=electric）：

- 退化版：avgFuelEcon 區塊隱藏；只剩本月 / 累計（同 Slice 1）

empty state（油車剛建好沒任何 FuelLog）：avgFuelEcon 顯示「—」+ 副標「加第一筆油看油耗」（per Q17 H1）

### `/assets/[id]` action bar（per Q10 N3）

油車：

```
[加油（primary，黑色，PlusIcon）] [+ 其他花費（hairline border）] [編輯]
```

電車：

```
[+ 其他花費（primary，黑色，PlusIcon）] [編輯]
```

`/assets/[id]` 不再渲染 BottomNav 的 FAB（layout 層判斷）。

點擊行為：
- 加油 → 開 NewFuelLog sheet
- + 其他花費 → 開 AddSheet，prefill `assetId`，category 留空（per Q18 B1）
- 編輯 → 開 AssetSheet（編輯車本身）

### `/assets/[id]` timeline 升級

merge fuel + 非 fuel transactions，按 date desc 排序（不分區）。row 渲染分支：

- `if transaction.fuelLogId IS NOT NULL` → render **FuelRow**（[car-screens.jsx](../../../.claude/phase2-design/project/car-screens.jsx) FuelRow）
  - icon：fuel pump SVG（淺色背景 #E8E4D8）
  - title：「加油」+ km/L badge（淺色 chip，「{econ} km/L」或「—」）
  - subtitle：「{date} · {liters}L · {odometer} km · {station ?? '—'}」
  - amount：右側 transaction.amount
- else → render 既有 CompactRow（不變）

tap FuelRow → 開 NewFuelLog edit；tap 非 fuel row → 開 AddSheet edit（既有行為）

### AddSheet / RecordsList 編輯路由

任何進入點（`/records`、`/dashboard` 最近紀錄、`/assets/[id]` timeline）tap transaction → 統一檢查：

```ts
if (transaction.fuelLogId !== null) {
  openNewFuelLogSheet({ mode: 'edit', initial: { ...transaction, ...fuelLog } })
} else {
  openAddSheet({ mode: 'edit', initial: transaction })
}
```

### 不動（留 polish slice）

- `/assets` list 仍是 Slice 1 的 AssetListItem flat list
- AssetPickerSheet 仍是 flat list

---

## 計算邏輯

### `avgFuelEcon`（hero）

```ts
// lib/fuelEcon.ts
export function computeAvgEcon(fuelLogs: FuelLog[]): number | null {
  // 1. filter 近 6 個月內（now - 180 days）按 loggedAt desc
  const recent = fuelLogs
    .filter(f => differenceInDays(now, f.loggedAt) <= 180)
    .sort((a, b) => a.loggedAt - b.loggedAt) // ascending for pair calc

  // 2. 第二筆起每筆 = (odo_n - odo_{n-1}) / liters_n
  const econs: number[] = []
  for (let i = 1; i < recent.length; i++) {
    const dist = recent[i].odometer - recent[i - 1].odometer
    if (dist > 0 && recent[i].liters > 0) {
      econs.push(dist / recent[i].liters)
    }
  }

  // 3. 不足 2 筆（沒成對）→ null
  if (econs.length === 0) return null
  return econs.reduce((a, b) => a + b, 0) / econs.length
}
```

UI 顯示：`null` → 「—」；otherwise `econ.toFixed(1)`

### 單筆 `kmPerLiter`（FuelRow badge）

```ts
// 即時算，每筆 fuelLog query 時帶上 prevOdometer
function singleEcon(curr: FuelLog, prev: FuelLog | null): number | null {
  if (!prev) return null
  const dist = curr.odometer - prev.odometer
  if (dist <= 0 || curr.liters <= 0) return null
  return dist / curr.liters
}
```

`lib/db/queries/fuelLog.ts` 提供 `listFuelLogsWithPrev(assetId)`，server side join 自己取 `LAG(odometer)`。

### 本月加油 / 累計加油（電車版隱藏）

```sql
-- 本月加油
SELECT SUM(amount) FROM "CashTransactions"
WHERE asset_id = $1 AND fuel_log_id IS NOT NULL
  AND deleted_at IS NULL
  AND date >= date_trunc('month', NOW())

-- 累計加油
SELECT SUM(amount) FROM "CashTransactions"
WHERE asset_id = $1 AND fuel_log_id IS NOT NULL
  AND deleted_at IS NULL
```

### 本月 / 累計 全部（含 fuel + 非 fuel）

沿用 Slice 1 既有 query（`asset_id = $1` + `deleted_at IS NULL` + 月份 filter），不過濾 fuel_log_id。

---

## Realtime

### 新事件

`fuel-log-changed`（INSERT / UPDATE / DELETE）

### 訂閱

- `RealtimeProvider` 加 fuelLogs 訂閱
- `/assets/[id]` 聽 `fuel-log-changed` + `transaction-changed`（filtered by assetId）→ 即時更新 hero + timeline
- `/assets` list 不需 fuel-log-changed（list 不顯示加油資料）

### Slice 1 既有 `transaction-changed` event

已 cover 購車 transaction、加油 transaction 的 partner 同步；fuel-log-changed 額外覆蓋 fuelLog 直接編輯（liters/odo 改）

---

## Edge cases

| 情境 | 處理 |
|---|---|
| 第一筆加油（沒上筆） | km/L 顯示「—」；hero avgFuelEcon「—」+ 副標「加第一筆油看油耗」 |
| 編輯加油改了 odometer | 不存 econ，下次 query 自動算對；後續筆的 km/L 也會自動更新（C1） |
| 編輯加油改了 date | 排序變動可能影響「上一筆」是哪筆 — query 用 LAG(odometer) ORDER BY logged_at 即可 |
| 倒退 odometer（user 輸入錯） | DB 不擋；UI 顯示 km/L「—」（dist ≤ 0 fallback） |
| 同日多筆加油 | 排序穩定（按 logged_at + created_at tie-break），第二筆相對第一筆計算 km/L |
| 軟刪一筆中間的加油 | recalc 時不算 deleted；後續筆的「上一筆」自動跳過 deleted |
| 電車（fuelType=electric） | NewFuelLog 不可開啟（action bar 沒這顆）；AssetPickerSheet / 編輯 transaction 仍可關聯到電車（記停車/過路/保養） |
| 電車改成油車（user 設定錯） | AssetSheet 編輯 fuelType 改成 95/98/diesel → action bar 重新顯示 [加油]；既有 CashTransactions 不受影響 |
| 油車改成電車 | 既有 fuelLogs 仍存在（不主動刪）；hero avgFuelEcon 仍會算（顯示歷史平均）；action bar 隱藏 [加油] 按鈕禁止新增 |
| 既有 Slice 1 車的 primaryUserId NULL | NewFuelLog payerToggle 預設 viewer；AssetSheet 編輯時可選（保留 NULL = 共用，或選人） |
| 共用 + 大額購車 | split=half 會產生大欠款；spec 在 brand-honest 立場：不擋；user 不滿意可在 /records 改 split |
| 購車 transaction 在 /records 被軟刪 | carDetails.purchasePrice 不變（per E2 drift）；UI 上的 hero 累計總額會少這筆 |
| `purchasedAt` 為空 | auto-tx date = NOW()::date |
| `purchasePrice` 為空或 0 | 不建 auto-tx（per scope `IF purchasePrice > 0`） |
| AddSheet 編輯 fuel transaction | 路由判斷 `fuelLogId IS NOT NULL` → 開 NewFuelLog 不開 AddSheet |
| Solo mode 升級為雙人 | 既有車 primaryUserId 仍是 viewer.id（自己）；new partner 加入後可在 AssetSheet 改成「對方」或「共用」 |

---

## Tests（沿用 Phase 1 pattern）

新增：

- `tests/actions/fuelLog.test.ts`
  - createFuelLog：dual-write 原子性 + balance recalc + fuelLogId 反向綁定
  - editFuelLog：FuelLog UPDATE in place + transaction soft-delete + insert + recalc + fuelLogId carry over
  - softDeleteFuelLog：fuelLog + linked tx 同步軟刪 + recalc
- `tests/lib/validators.test.ts` 加 `validateFuelLogInput`
- `tests/lib/primaryUser.test.ts`：`deriveTxnFromPrimaryUser` 三 case + solo edge
- `tests/lib/fuelEcon.test.ts`：computeAvgEcon empty / 1 entry / 2 entries / outliers / 6mo window

擴充：

- `tests/actions/asset.test.ts`：
  - createCar with purchasePrice > 0 → 驗證自動建 transaction（amount, payer, split, category, fuel_log_id=NULL）+ balance recalc
  - createCar with purchasePrice = 0 / NULL → 不建 auto-tx
  - editCar 改 primaryUserId → 不動既有 transaction（E2 drift）
  - editCar 改 purchasePrice → 不動既有 transaction（E2 drift）

---

## 部署

1. dev Supabase 跑 migration 0007
2. 本機跑全測 + smoke test（建油車 → 加油 → hero / timeline 顯示正確 / 編輯 / 刪除 / 電車不能加油）
3. 跟設計師對焦 hero / timeline / NewFuelLog 視覺 polish
4. PR 上 prod
5. prod Supabase 跑 migration 0007
6. friend test

---

## Slice 3+ 候選（從本 slice 推到下個）

不在 Slice 2 範圍但設計 bundle 有 cover：

| 設計項目 | 對應 mockup | 優先級 |
|---|---|---|
| 電車 ChargeLog（kWh / 充電站 / 慢充快充 / km/kWh） | 無（待設計） | P3（看 EV user 比例） |
| `/assets` list CarHeroCard 升級（avgFuelEcon 三欄） | car-screens.jsx CarHeroCard | P2（純 UI polish） |
| AssetPickerSheet inline 分區 | asset-picker.jsx（chat4 推薦） | P2 |
| 維修保養紀錄（action bar 第二顆 [保養]） | car-screens.jsx ActionBtn label='保養' | P3 |
| carDetails 加 brand / model / year / color picker | car-forms.jsx NewCarForm（完整版） | P3 |
| `currentOdometer` 欄位 + AssetSheet 顯示 | car-forms.jsx NewCarForm `目前里程` | P3 |
| asset marks v2（line / glyph / badge × 4 type） | asset-marks.jsx, asset-marks-v2.jsx | P3（孩 / 寵 / 植 / 房 / 險 slice 一起） |
| `/records` FilterSheet 加「依愛物」維度 | 無（待設計） | P3 |

### 永遠不做（per CLAUDE.md「不在範圍內」）

- 推播油價提醒 / 加油提醒（沒推播）
- 折舊 / 二手估價
- 跨車比較

---

## 待設計師決策 flag

實作可先用 spec 預設值動工，設計師後續調整：

1. **NewFuelLog 編輯模式 delete 入口** — 預設右上角「⋯」開 ConfirmModal（沿用 AddSheet pattern），可改成 sheet 底部 destructive button。
2. **avgFuelEcon 顯示精度** — 預設 `.toFixed(1)`（一位小數，如 13.4 km/L），可改成整數或兩位小數。
3. **FuelRow 的油泵 icon 顏色** — 預設 mockup 的 `#E8E4D8` 淺色背景 + `#8A7B5A` ink，可調整成跟 transit category tint 一致。
4. **電車版 hero 退化型** — 預設「跟 Slice 1 一樣只剩本月/累計」，未實作的「充電紀錄即將推出」副標可加。
5. **「主要使用人」toggle 在 NewCarForm 跟 AssetSheet 的 label** — Mockup 為 `共用`；fuel form 的 PayerToggle 為 `兩人`。本 spec 統一用 `共用`。確認設計師意圖。
