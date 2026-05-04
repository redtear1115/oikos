# Phase 2 Slice 1 — 車輛（費用彙整 + 基本 CarDetails）

> 目標：把「資產」這個概念從 placeholder 升級為可用功能，先以「車」為第一個資產類型，建立資產 CRUD + 與 transaction 關聯 + 費用彙整視角的最小可行框架。
> 優先級：P2 Slice 1（Phase 1.1 完成後立即接續）

---

## 背景與動機

Phase 1.1 把 Onboarding + Solo Mode 收尾後，friend test 階段已可正常使用核心記帳。下一個價值跳躍是 CLAUDE.md 規劃的 Phase 2 — 「以資產為視角回顧費用」。

P2 範圍涵蓋四種資產（車 / 孩子 / 房子 / 保險），但其中車是最複雜的（多了 FuelLog + 油耗計算）。為控制單一 slice 範圍與風險，採用兩階段拆分：

- **Slice 1（本 spec）**：費用彙整 + 基本 CarDetails — 把「資產 = 費用彙整入口」這個抽象 ship 掉
- **Slice 2（下一 spec）**：FuelLog + 油耗計算 — FuelLog 有自己的 schema 細節要決（精度、與 transaction 的關係）

P2 順序原為「車 → 保險 → 孩子 → 房子」，2026-05-04 調整為 **「車 → 孩子 → 房子 → 保險」**。理由：保險需處理 `insuredType=user/child` 雙態，是最複雜的，留到 P2 最後較合理。

---

## 現況分析

### Schema

P2 所有表已在 Phase 0 建好，**不需要 schema migration**：

- `Assets`（parent，含 `type` enum、軟刪除）
- `CarDetails`、`HouseDetails`、`ChildDetails`、`InsuranceDetails`（per-type 子表）
- `FuelLogs`（slice 2 才用）
- `CashTransactions.asset_id`（nullable FK to `Assets`）

### 缺少的部分

- `Assets` / `CarDetails` 沒有 RLS policies（Phase 0 建表時暫緩） → 需要新 migration
- BottomNav 第三個 tab `'資產'` 目前 link 到 `/coming-soon?next=assets`
- AddSheet 沒有 `assetId` 欄位
- 沒有 `actions/asset.ts`、沒有 `lib/db/queries/asset.ts`

---

## Scope

### In

- 「資產」tab 從 `/coming-soon` 升級為真實 `/assets` route（list 頁，平鋪）
- Asset CRUD（限 type=`car`）：新增 / 編輯 / 軟刪除
- CarDetails CRUD：name（必填）、plate（必填）、purchasedAt（選填）、purchasePrice（選填）
- AddSheet 新增「關聯資產」picker（optional，可空）
- 車詳情頁 `/assets/[id]`：本月 + 累積雙數字 + 該車的 transaction list
- 車詳情頁「為這台車記一筆」CTA — FAB 變身、prefill `assetId` + category=`transit`
- 已刪除車的 zombie 處理：在 AddSheet 編輯模式露出「（已刪除）」label
- BottomNav FAB 依路由 context 切換動作 + 顏色（黑=記交易 / 橘=新增資產）
- Realtime 同步：partner 新增/編輯/刪除車時 list 即時更新
- `Assets` / `CarDetails` 的 RLS policies migration（dev + prod 都跑）

### Out（slice 2+）

- FuelLog（加油紀錄）+ 油耗計算
- 其他資產類型（孩子 / 房子 / 保險）
- /records 的 FilterSheet 加 asset 維度
- 保養提醒、里程儀表板、category 圓餅
- 「事後綁」批次工具
- 折舊 / 二手估價
- AssetPickerSheet 顯示已刪除車 section

---

## Information Architecture

### 新增 routes

| Route | 用途 |
|---|---|
| `/assets` | 平鋪資產 list（slice 1 只會有 car） |
| `/assets/[id]` | 車詳情（雙數字 hero + transaction list） |

### 修改 BottomNav

- 第三個 tab `'資產'` 的 href：`/coming-soon?next=assets` → `/assets`
- `getActiveTab()` 加：`pathname.startsWith('/assets')` → return `'assets'`
- FAB 接收 `variant: 'primary' | 'accent'` prop 控制顏色

### FAB 行為（依 pathname 變身）

| Pathname | FAB 顏色 | FAB 動作 |
|---|---|---|
| `/dashboard` | 黑（primary） | 開 AddSheet（新增交易） |
| `/records` | 黑（primary） | 開 AddSheet（新增交易） |
| `/assets` | 橘（accent） | 開 AssetSheet（新增車） |
| `/assets/[id]` | 黑（primary） | 開 AddSheet 並 prefill `assetId` + category=`transit` |
| `/settings` | （沿用既有 `hideFab`） | — |

實作：BottomNav 已是 callback 模式（`onAddClick`），擴展為 `{ onAddClick, fabVariant }`。由 dashboard layout 依 `usePathname()` 決定。

> **設計師決策 flag**：FAB 的視覺差異化（橘 vs 黑、glyph 是否變化）spec 給可動工的預設值（橘=`var(--accent)`、glyph 不變），實作後請設計師調整。

---

## Components

### 新增

| 元件 | 路徑 | 用途 |
|---|---|---|
| `AssetSheet` | `app/(dashboard)/assets/_components/AssetSheet.tsx` | Bottom sheet — 新增 / 編輯車。4 欄 form：name / plate / purchasedAt（重用 MiniCalendar）/ purchasePrice。沿用 SheetBackdrop + 28px radius，header pattern 跟 AddSheet 一致。 |
| `AssetListItem` | `app/(dashboard)/assets/_components/AssetListItem.tsx` | list 卡片：car icon + name + plate + 「本月 $X」小字。整列 tap 進詳情。 |
| `AssetEmptyState` | `app/(dashboard)/assets/_components/AssetEmptyState.tsx` | 沒車時的空狀態。簡單 SVG illustration（flag 給設計師）+ 文案「新增第一台車，開始追蹤這台車的開銷」。不需 inline CTA — 橘色 FAB 已在底部。 |
| `AssetHero` | `app/(dashboard)/assets/[id]/_components/AssetHero.tsx` | 車詳情頂部：car name（大）+ plate（小）+ 並排兩個數字「本月 $X / 累積 $Y」+ 右上「⋯」開編輯 sheet。 |
| `AssetIcon` | `app/(dashboard)/_components/AssetIcon.tsx` | car / house / child / insurance 共用元件，slice 1 只實作 car variant。 |
| `AssetPickerSheet` | `app/(dashboard)/dashboard/_components/AssetPickerSheet.tsx` | AddSheet 內點「關聯資產」row 開的子 sheet。List 出未刪除的車 + 「不關聯」選項 + 已選打勾。 |

### 修改

| 元件 | 改動 |
|---|---|
| `BottomNav` | 第三個 tab href、`getActiveTab()` 加 `/assets`、FAB 接收 `variant` prop。 |
| `(dashboard)/layout.tsx` 或新增 wrapper | 依 `usePathname()` 決定傳給 BottomNav 的 FAB callback + variant；包裝 AddSheet（含 `prefilledAssetId`）+ AssetSheet 兩個 sheet 的 open state。 |
| `AddSheet` | (1) 加「關聯資產」row（在 category 之後、split 之前；solo mode 也顯示），tap 開 AssetPickerSheet；(2) Initial / edit 模式從 `initial.assetId` 讀；(3) 新增 `prefilledAssetId?: string` prop — 從車詳情 FAB 進來時預填（仍可改）。 |
| `actions/transaction.ts` | `createTransaction` / `editTransaction` payload 加 `assetId?: string \| null`；validate 該 asset 屬同 group + 未軟刪（若是新關聯）。 |
| `AddSheetInitial` interface | 加 `assetId?: string \| null`。 |

---

## Data flow

### 新增 server actions（`actions/asset.ts`）

| Action | Signature | 行為 |
|---|---|---|
| `createCar` | `(input: { name: string; plate: string; purchasedAt?: string; purchasePrice?: number }) => Promise<{ id: string }>` | 一個 DB transaction 內：insert `Assets`（type=`car`）+ insert `CarDetails`。validate 同 group + name/plate 非空。`revalidatePath('/assets')`。 |
| `editCar` | `(input: { id: string; name; plate; purchasedAt?; purchasePrice? }) => Promise<void>` | 純 UPDATE（asset 沒有「歷史」概念，跟 transaction 不同）。validate ownership。 |
| `softDeleteCar` | `(id: string) => Promise<void>` | `Assets.deleted_at = now()`。**不**動 `CashTransactions.asset_id`（保留歷史不無聲改寫）。`revalidatePath('/assets')` + `revalidatePath('/records')`。 |

### 修改 server actions（`actions/transaction.ts`）

| Action | 改動 |
|---|---|
| `createTransaction` | input 加 `assetId?: string \| null`；validate `assetId` 屬同 group + `deleted_at IS NULL`；寫入 `cash_transactions.asset_id`。 |
| `editTransaction` | 同上 — **但允許**保留 `assetId` 指向已刪車（只擋「新關聯到已刪車」）。 |

### 新增 queries（`lib/db/queries/asset.ts`）

| Query | 用途 |
|---|---|
| `listAssetsForGroup(groupId)` | 未刪除 assets + CarDetails join。slice 1 只 join CarDetails。 |
| `getAssetById(id, groupId)` | 單一 asset + 對應 detail row。**包含已刪除**（給 AddSheet 編輯模式顯示「已刪除」用）。 |
| `getAssetSummary(id, groupId)` | 給車詳情 hero 用：本月 sum + 累積 sum，從 `CashTransactions WHERE asset_id = ? AND deleted_at IS NULL`。 |
| `listTransactionsForAsset(id, groupId, cursor)` | 該車的 transaction list，重用既有 month-grouped + lazy 20 pattern（同 `/records`）。 |

### Realtime

重用 Phase 1 的 RealtimeProvider event bus：

- `Assets` table 加進 `postgres_changes` 訂閱範圍（filter `group_id`）
- 新事件 `asset-changed`（INSERT/UPDATE/DELETE） — `/assets` list 頁訂閱、refresh
- `CashTransactions` 既有 realtime 已 cover 車詳情頁的 transaction list

### RLS

新 migration `0006_assets_rls.sql`（dev + prod 都跑，per `MEMORY.md` two-Supabase-projects）：

- `Assets`：SELECT/INSERT/UPDATE policy = `group_id IN (... user is member ...)`，沿用 Phase 0 既有 helper
- `CarDetails`（與 slice 2+ 的 `FuelLogs`、`HouseDetails` 等）：透過 `Assets` join 檢查 group ownership — `asset_id IN (select id from "Assets" where ...same...)`

寫入仍走 server actions（service role），讀取走 client + RLS — 跟 Phase 1 架構一致。

---

## Edge cases

| 情境 | 處理 |
|---|---|
| 車詳情頁本月為 0 | Hero「本月 NT$ 0」用 ghost 字（`var(--ink-3)`），下方 list 仍渲染（可能有舊月份資料）。 |
| 車詳情頁累積為 0（剛建好） | Hero 兩個數字都是 0，list 區塊空狀態：「還沒有為這台車記下任何花費 — 戳右下角 + 開始」。 |
| AssetPickerSheet 沒有任何車 | List 區塊空，顯示「還沒有資產，先去 [資產] 頁建立」+ 「不關聯」選項仍存在。**不做跳轉**（保存當前 form state 太複雜）。 |
| 編輯既有 transaction，原 assetId 指向已刪車 | AddSheet「關聯資產」row 顯示「我的 Tesla（已刪除）」灰底；tap 開 AssetPickerSheet 仍可改成其他車或「不關聯」；保留不動也允許。 |
| AssetPickerSheet 內篩選已刪車 | List 不顯示已刪車（即使是當前 transaction 關聯的那台）。新關聯不允許指向已刪車，但編輯模式的「（已刪除）」label 留在 row 上。 |
| Partner 同時刪了同一台車 | 重用 Phase 1 realtime + revalidate：viewer 端 `Assets` realtime event → list refresh，車詳情 → redirect 回 `/assets`。slice 1 簡化版：直接 redirect 不 toast。 |
| 同名車 / 同 plate 車 | DB 不擋（schema 沒 unique 約束）。slice 1 不額外擋。 |
| Solo mode | Asset 是 group-level，不是 member-level → solo / 雙人模式行為**完全相同**，不需特例。AssetSheet 不顯示任何 payer 概念。 |
| 新建車的 default name | name 必填，**不**從 plate 自動填（避免「ABC-123」這種無意義名字）。placeholder 提示「例：我的車」。 |
| `purchasePrice` 輸入 | integer 台幣，沿用 AddSheet amount input pattern（NT$ 前綴、純數字、最多 7 位）。slice 1 不算折舊不顯示二手價估算。 |
| `purchasedAt` 輸入 | 重用 MiniCalendar 元件。可空。 |
| 車的 transaction soft delete 後 | 既有 transaction soft-delete 邏輯不變。Hero 的「本月/累積」query `WHERE deleted_at IS NULL` 已 cover。 |

---

## 不在 slice 1 範圍（明確劃線給未來 slice）

### Slice 2（車輛續集）

- FuelLog CRUD（liters / fuelType / odometer / pricePerLiter / loggedAt）
- 油耗計算（公式與精度待 slice 2 spec 決：km/L 或 L/100km、liters 是 integer 還 decimal）
- FuelLog 是否同時建一筆 CashTransaction（單一輸入 vs 雙寫）
- 車詳情頁加 FuelLog section + 最近一次加油 / 平均油耗
- `/records` FilterSheet 加「依資產」維度
- AssetPickerSheet 加「已刪除車」section（如果 transaction 還掛在上面）

### Slice 3-5（其他資產類型，依新順序：孩子 → 房子 → 保險）

- 孩子（ChildDetails：birthday / gender / 加密 idNumber / insuranceId）
- 房子（HouseDetails：owner / address / purchasedAt / purchasePrice）
- 保險（InsuranceDetails，最後做：insuredType=user/child 雙態最複雜）
- AssetIcon 加 house / child / insurance variant
- AssetSheet 變成 type-aware（按 type 顯示對應 detail form），或拆成 CarSheet / HouseSheet / ChildSheet
- 資產 list 加類型 filter chip（當有 2 種以上類型時才出現）

### 永遠不做（per CLAUDE.md「不在範圍內」）

- 推播保養提醒 / 驗車到期提醒（沒有推播基礎設施）
- 折舊 / 二手估價（超出記帳範圍）
- 車保養紀錄（friend test 反映後再評估）

---

## 待設計師決策 flag

實作可先用 spec 預設值動工，設計師後續調整：

1. **FAB 變身的視覺差異化** — 橘色 vs 黑色之外，glyph 是否要變？預設沿用「+」glyph、僅換背景色到 `var(--accent)`。
2. **AssetEmptyState 的 illustration** — 暫用簡單 SVG 或留白，等設計師補。
3. **AssetListItem 的卡片密度與 icon 設計** — 預設沿用 SettingsContent 的 `Row` pattern + AssetIcon 占位。
4. **AssetHero 的雙數字字級** — 預設沿用 BalanceHero 的 56px 字級給「累積」、44px 給「本月」（呼應 P3-1 design debt 的字級收斂）。
