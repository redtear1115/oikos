# IncomeSheet 設計 spec（Phase 2 保險前置）

> 目標：紀錄 2026-05-04 與設計師完成的 IncomeSheet hi-fi 設計探索結論，以 spec 形式 lock 設計決策、token、行為，作為未來實作 IncomeTransactions + Phase 2 保險時的依據。
> 優先級：P2 Slice 4（保險）前置；本 spec 只 lock 設計，**不在此 ship 程式**。

---

## 背景與動機

Phase 1.1 上 prod（2026-05-03）後 friend test 階段，一位朋友提出「能不能紀錄收入」需求。經三輪設計討論（[plan record](/Users/ray-lee/.claude/plans/goofy-chasing-bengio.md)）：

- **產品判斷**：採方案 B「新增 `IncomeTransactions` 平行表」，不動既有 balance / settlement / split。
- **時序**：跟 Phase 2 保險（順序最後）耦合 ship——儲蓄險滿期是必發生 income event，沒這張表會無處安放；保險詳情頁的「累計繳 vs. 拿回」也仰賴它。
- **Brand 邏輯**：收入是「兩人共同生活的高光時刻」，需要獨立的物理空間（IncomeSheet 非 AddSheet 加 toggle），詳見 plan 的 brand 三軸論證。

設計師（claude.ai/design）2026-05-04 完成 hi-fi 探索並交付 bundle，存在 [.claude/incomesheet-design/](../../../.claude/incomesheet-design/)。本 spec 把可實作的決策抽出來。

---

## 現況分析

### Schema

- `IncomeTransactions` 尚未存在 → 實作 slice 需要新 migration
- `Assets` 已存在（含 `type='insurance'` + `InsuranceDetails`）→ 收入關聯保單走 `assetId` FK，不需新概念
- `lib/categories.ts` 已定 8 個支出 category token（`tint` / `ink` / `chart`）→ 收入 8 色將平行新增

### 缺少的部分

- IncomeTransactions table + RLS + realtime publication + pg_cron cleanup
- `lib/incomeCategories.ts`（鏡像 `lib/categories.ts` shape）
- `actions/income.ts`（無 split / payer / balance 概念，比 `actions/transaction.ts` 簡單）
- `lib/db/queries/income.ts`（單表 paged）
- `validators.ts` 加 `validateIncomeInput`
- IncomeSheet React 元件（`app/(dashboard)/dashboard/_components/IncomeSheet.tsx`）
- Dashboard 模式切換 state + UI（`DashboardBackdrop` 改造）
- RecordsList 分 tab 結構
- RealtimeProvider 加 `income-insert` / `income-update` event

---

## Scope

### In（本 spec lock 的範圍）

- 8 個 locked design decisions（見下表）
- INCOME_CATEGORIES 完整 token（8 entries × 6 fields）
- INCOME_PALETTES 三種主色變體（gold / cream / mint），預設 mint
- Dashboard mode toggle 行為規範
- Hero card 跟模式同步邏輯（淨額移到紀錄頁）
- Records 分 tab 結構（全部 / 支出 / 進帳）
- 「光點品牌」empty state pattern
- IncomeTransactions schema sketch（最小欄位集）
- UI ↔ schema 對應映射

### Out（本 spec 不處理）

- 實際 implementation slice（schema migration、actions、UI 元件落 code）
- 保險詳情頁的「累計繳 vs. 拿回」具體 view（待 Phase 2 保險 slice 設計）
- 滿期 / 理賠的觸發 UX（同上）
- 跨 asset 關聯 picker（已在 [CLAUDE.md 設計慣例](../../../CLAUDE.md) 鎖原則：單 slot + 分類展開；具體 UI 留 Phase 2 車輛 slice 處理）
- 雙式分錄 / 個人現金流（永久 out，見 plan record）

---

## Locked decisions

8 個維度（2026-05-04 與設計師三輪討論最終定案）：

| 維度 | 決定 | 理由 |
|---|---|---|
| 觸發點 | **Dashboard 主畫面模式切換 pill**（支出 / 進帳） | 比 sheet 內 segmented / FAB 長按 / 保險頁專屬入口 都低摩擦 |
| 主色 | **薄荷**（mint，#A8DCC4 系） | 跟現有 peach palette 區隔；其餘候選 gold / cream 留 token 但非預設 |
| 類別 mono 字 | **部首字**（薪 獎 期 賠 紅 退 副 其） | 跟 expense category 系統（餐 交 日 娛 醫 家 禮 其）一致 |
| 金額大字 | **56px**（與 AddSheet 一致） | 兩個 sheet 是平行物，金額 stage 應同字級 |
| Records 結構 | **分 tab**（全部 / 支出 / 進帳） | 不混 row、清楚切換；淨額去這裡看 |
| Empty state | **光點品牌**（constellation / halo + CTA） | 延伸 Futari mark 的點線體系，不用插畫 |
| Chip 系統 | **16 色**（8 expense + 8 income，平行） | 兩種 category 視覺不衝突，對應 brand「兩人 + 清楚」 |
| Hero card 行為 | **跟模式同步**（支出模式只顯示支出、進帳模式只顯示進帳） | 淨額由「紀錄」tab 提供；dashboard 是當下 mode 的快照 |

### 不採用（已主動排除的選項）

- ❌ AddSheet 加 toggle / segmented：把 income 攤平成 expense 的 row shape，故事感被攤平
- ❌ FAB 點擊後出現選單：每次記帳多一步，違反「記帳低摩擦」
- ❌ FAB 長按開 IncomeSheet：隱藏功能要教育使用者
- ❌ 保險頁專屬入口（only）：薪水 / 紅包 / 退稅這類非保險收入沒地方記
- ❌ Confetti / bounce 慶祝：違反 Futari「克制」氣質

---

## Design tokens

### INCOME_CATEGORIES

鏡像 `lib/categories.ts` 的 shape（id / label / mono / tint / ink / chart）。**實作時直接寫 `lib/incomeCategories.ts`**：

```ts
export type IncomeCategoryId =
  | 'salary' | 'bonus' | 'maturity' | 'claim'
  | 'gift' | 'refund' | 'sidehustle' | 'other'

export interface IncomeCategory {
  id: IncomeCategoryId
  label: string
  mono: string
  tint: string
  ink: string
  chart: string
}

export const INCOME_CATEGORIES: IncomeCategory[] = [
  { id: 'salary',     label: '薪水',       mono: '薪', tint: '#F2EAD3', ink: '#7A6A2E', chart: '#B8A85F' },
  { id: 'bonus',      label: '獎金',       mono: '獎', tint: '#F4DEC2', ink: '#8A5A28', chart: '#C99464' },
  { id: 'maturity',   label: '滿期還本',   mono: '期', tint: '#E5E8D0', ink: '#5A6A38', chart: '#9AA864' },
  { id: 'claim',      label: '保險理賠',   mono: '賠', tint: '#DDE6DA', ink: '#3F6A56', chart: '#7AA48E' },
  { id: 'gift',       label: '紅包禮金',   mono: '紅', tint: '#F5E0DA', ink: '#8A4A40', chart: '#C97A6E' },
  { id: 'refund',     label: '退稅',       mono: '退', tint: '#E8E2D8', ink: '#6A5A38', chart: '#A8997A' },
  { id: 'sidehustle', label: '副業',       mono: '副', tint: '#E0E2E5', ink: '#4F5258', chart: '#85898F' },
  { id: 'other',      label: '其他',       mono: '其', tint: '#EDE3D7', ink: '#7A6A5A', chart: '#A8998A' },
]
```

### INCOME_PALETTES（IncomeSheet 主色，預設 mint）

```ts
export const INCOME_PALETTES = {
  mint: {                               // 預設
    name: '薄荷',
    ink: '#3F6A56',
    tint: '#DDEAD8',
    glow: '#E5F0DE',                    // celebration breath
    whisper: '#F2F7EE',
    sheetBg: '#F4F8EF',
  },
  gold: {                               // 候選 1
    name: '淺金',
    ink: '#8A6E2E',
    tint: '#F2E8CF',
    glow: '#F7EBC2',
    whisper: '#FBF5E5',
    sheetBg: '#FBF5E5',
  },
  cream: {                              // 候選 2
    name: '暖白',
    ink: '#7A5848',
    tint: '#F5EBDF',
    glow: '#FFEEDD',
    whisper: '#FDF7EE',
    sheetBg: '#FDF7EE',
  },
}
```

> 設計師原檔保留 gold / cream 是為了 tweak 比較；**MVP 只 ship mint**，gold / cream 保留 token 但不暴露切換。

---

## 行為規範

### 1. Dashboard 模式切換

- Dashboard 頂部新增 segmented pill：「支出 ▸ 進帳」
- State 存於 client（不持久化；reload 預設「支出」模式）
- 切到「進帳」模式：
  - Hero card 內容換成「本月進帳 +NT$ X · N 筆 · 最近 [date] [source]」
  - 最近紀錄預覽列只顯示 IncomeTransactions
  - FAB（+）按鈕打開 IncomeSheet（不是 AddSheet）
  - 整體 accent 切 mint（暫態，不影響其他頁面）
- 切回「支出」模式：恢復現狀

### 2. Hero card

- **支出模式**：本月支出 NT$ X · N 筆 · 最大類別 [食物]（既有行為）
- **進帳模式**：本月進帳 +NT$ X · N 筆 · 最近 [日期] [來源 label]
- 淨額（balance）**不在 Dashboard 顯示**——使用者要看「我們欠對方多少」要去紀錄頁或 settle 入口

### 3. Records 分 tab

紀錄頁頂部 tab：「全部 / 支出 / 進帳」
- 「全部」：UNION cashTransactions + IncomeTransactions，依日期排序，row 視覺有區別（income row 帶 mint glow 背景）
- 「支出」：only cashTransactions
- 「進帳」：only IncomeTransactions

### 4. Empty state（光點品牌）

收入紀錄全空時：
- 中央：constellation（多個小光點散佈）+ 中央 halo（mint glow）
- 文案：「還沒記過家裡的進帳」（暫定，待文案 review）
- CTA：「記第一筆」

延伸到其他空狀態（Phase 2 各 asset 沒資料時）採同 pattern，不用插畫。

### 5. Celebration（光點呼吸）

IncomeSheet 提交後：
- Sheet 收起動畫（既有）
- 對應 row 在 RecordsList / 保險頁：mint glow 背景 fade in 0.6s → fade out 1.2s
- 不要 confetti / bounce / 大型動畫

---

## IncomeTransactions schema sketch

實作時參照（具體欄位以實作 PR 為準）：

```ts
export const incomeTransactions = pgTable('IncomeTransactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  recipientId: uuid('recipient_id').notNull().references(() => profiles.id),
  amount: integer('amount').notNull(),
  category: text('category').notNull(),         // INCOME_CATEGORIES.id
  source: text('source'),                        // 自由文字（「五月薪水」「婆婆給的」）
  assetId: uuid('asset_id').references(() => assets.id),  // 連保單（type='insurance'）
  occurredAt: date('occurred_at').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

要點：
- 不參與 balance / settlement / split
- `assetId` 用既有 Assets 表（不是新 InsurancePolicies），保險滿期 / 理賠時填
- `category` 對應 `INCOME_CATEGORIES.id`（無 enum constraint，跟 `cashTransactions.category` 一致風格）
- `source` 自由文字，可選——跟 expense 的 `description` 對等但更人話
- pg_cron 一年後物理刪除（mirror cashTransactions）

---

## UI ↔ schema 對應

| IncomeSheet 欄位 | DB 欄位 | 必填 | 備註 |
|---|---|---|---|
| 金額 | `amount` | ✅ | TWD integer |
| 收入類別 | `category` | ✅ | 8 選 1，UI 顯示 mono chip |
| 收入歸誰 | `recipientId` | ✅ | Solo Mode 自動填本人 |
| 日期 | `occurredAt` | ✅ | 預設今天，MiniCalendar |
| 關聯保單 | `assetId` | 選填 | 限 type='insurance' 的 Assets；類別='maturity' / 'claim' 時主動 prompt |
| 備註 | `source` | 選填 | 自由文字 |

---

## Open / deferred questions

留給 Phase 2 保險 slice 設計時處理：

1. **保險詳情頁「累計繳 vs. 拿回」view**：具體版面、情感 framing 文案、是否分張保單顯示時間軸
2. **滿期 / 理賠的 trigger UX**：從保險詳情頁的「記滿期還本」CTA 進 IncomeSheet 並 prefill `assetId` + category？或從 IncomeSheet 側選保單後反向認領？
3. **IncomeTransactions 在 RecordsList「全部」tab 的 row 視覺**：mint glow 背景的具體強度、跟 expense row 的視覺分量比
4. **Edit / Delete IncomeTransaction 流程**：mirror CashTransaction 的 soft-delete-and-reinsert，還是 income 因為不影響 balance 可以直接 update？
5. **「記帳」、「紀錄」、「進帳」這三個詞在 UI 的用語統一**：目前混用，需文案 review

---

## 排程

- **不在排程上的：** Phase 2 Slice 1（車輛）正在開發 / 即將開發
- **排在 Phase 2 Slice 4（保險）一起 ship**：因為 IncomeSheet + 保險詳情頁的「累計繳 vs. 拿回」是耦合 feature
- **時間 budget**：4-5 年內第一張儲蓄險滿期前必須上線；保險 slice 預計 2026 下半年 ~ 2027 上半年
- **依賴**：Phase 2 Slice 1（車）的 AddSheet 單 slot picker UX 落地後，IncomeSheet 跟 picker pattern 對齊
- **不能提前**：本 spec 不應在 Phase 2 Slice 1-3 完成前實作；提前會違反 [oikos/CLAUDE.md](../../../CLAUDE.md) Phase 規劃

---

## 索引

- 三輪討論的完整推論（A/B/C 評估、brand 三軸、為什麼選 B）：`/Users/ray-lee/.claude/plans/goofy-chasing-bengio.md`
- 設計師交付的 hi-fi bundle：[.claude/incomesheet-design/](../../../.claude/incomesheet-design/)
- 設計師對話紀錄：[.claude/incomesheet-design/chats/chat3.md](../../../.claude/incomesheet-design/chats/chat3.md)
- Phase 2 Slice 1（車）spec：[2026-05-04-phase-2-slice-1-car-asset-design.md](2026-05-04-phase-2-slice-1-car-asset-design.md)
- 既有 expense category token：[lib/categories.ts](../../../lib/categories.ts)
- 既有 InsuranceDetails schema：[lib/db/schema.ts](../../../lib/db/schema.ts)（line 120）
- AddSheet 多 asset 關聯 picker UX 原則：[oikos/CLAUDE.md](../../../CLAUDE.md) → 設計慣例
