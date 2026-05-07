# IncomeSheet 設計 spec（Phase 2 保險前置）

> 目標：lock 2026-05-04 與設計師完成的 IncomeSheet hi-fi 設計探索結論，作為未來實作 IncomeTransactions + Phase 2 保險時的依據。
> 優先級：P2 Slice 5（保險）前置。

## 實作狀態（全部完成 2026-05-06）

| 部分 | 狀態 | 位置 |
|---|---|---|
| `IncomeTransactions` schema + RLS + Realtime + pg_cron | ✅ | [drizzle/0012](../../../drizzle/0012_income_transactions.sql) · [lib/db/schema.ts](../../../lib/db/schema.ts) |
| `INCOME_CATEGORIES` + `INCOME_PALETTES` token | ✅ | [lib/incomeCategories.ts](../../../lib/incomeCategories.ts) · [lib/incomePalettes.ts](../../../lib/incomePalettes.ts) |
| Validators / Server actions / Queries | ✅ | [lib/validators.ts](../../../lib/validators.ts) · [actions/income.ts](../../../actions/income.ts) · [lib/db/queries/incomes.ts](../../../lib/db/queries/incomes.ts) · `listFeedAllPaged` in [lib/db/queries/transactions.ts](../../../lib/db/queries/transactions.ts) |
| Shared mapping util | ✅ | [lib/incomeFeedRow.ts](../../../lib/incomeFeedRow.ts) — `incomeToFeedRow` + `makeIncomeLoader` |
| IncomeSheet UI 元件 | ✅ | [app/(dashboard)/dashboard/_components/IncomeSheet.tsx](../../../app/%28dashboard%29/dashboard/_components/IncomeSheet.tsx) |
| Dashboard mode toggle（支出 / 進帳） | ✅ | Dashboard.tsx · BalanceHero.tsx · ModeTogglePlaceholder.tsx |
| Records 三 tab（全部 / 支出 / 進帳）+ sticky header | ✅ | [app/(dashboard)/records/_components/RecordsList.tsx](../../../app/%28dashboard%29/records/_components/RecordsList.tsx) |
| Monthly net header in 全部 tab | ✅ | MonthSection.tsx · TransactionFeed.tsx |
| Realtime IncomeTxns events | ✅ | [app/(dashboard)/_components/RealtimeProvider.tsx](../../../app/%28dashboard%29/_components/RealtimeProvider.tsx) |
| Constellation+halo empty state | ✅ | [app/(dashboard)/dashboard/_components/IncomeEmptyState.tsx](../../../app/%28dashboard%29/dashboard/_components/IncomeEmptyState.tsx) |
| Insurance ↔ Vehicle 關聯 | ✅ | [drizzle/0014](../../../drizzle/0014_insurance_vehicle_link.sql) · InsuranceDetailClient + AssetDetailClient |

---

## 背景與動機

Phase 1.1 上 prod 後 friend test 階段，一位朋友提出「能不能紀錄收入」需求。三輪設計討論結論：

- **產品判斷**：採方案 B「新增 `IncomeTransactions` 平行表」，不動既有 balance / settlement / split。
- **時序**：跟 Phase 2 保險耦合 ship——儲蓄險滿期是必發生 income event，沒這張表會無處安放；保險詳情頁的「累計繳 vs. 拿回」也仰賴它。
- **Brand 邏輯**：收入是「兩人共同生活的高光時刻」，需要獨立的物理空間（IncomeSheet 非 AddSheet 加 toggle）。

設計師 hi-fi bundle（三輪迭代 + 最終決策）已用於實作，不再存在於 repo。

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

- 實際 implementation（schema migration、actions、UI 元件落 code）
- 保險詳情頁的「累計繳 vs. 拿回」具體 view（待 Phase 2 保險 slice 設計）
- 滿期 / 理賠的觸發 UX
- 雙式分錄 / 個人現金流（永久 out）

---

## Locked decisions

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

### 不採用

- ❌ AddSheet 加 toggle：把 income 攤平成 expense 的 row shape，故事感被攤平
- ❌ FAB 點擊後出現選單：每次記帳多一步，違反「記帳低摩擦」
- ❌ FAB 長按開 IncomeSheet：隱藏功能要教育使用者
- ❌ 保險頁專屬入口（only）：薪水 / 紅包 / 退稅這類非保險收入沒地方記
- ❌ Confetti / bounce 慶祝：違反 Futari「克制」氣質

---

## Design tokens

### INCOME_CATEGORIES

8 entries（薪 獎 期 賠 紅 退 副 其），每 entry 含 `id / label / mono / tint / ink / chart`。見 [lib/incomeCategories.ts](../../../lib/incomeCategories.ts)。

### INCOME_PALETTES（預設 mint）

三種主色變體（mint / gold / cream），MVP 只 ship mint，其餘保留 token 但不暴露切換。見 [lib/incomePalettes.ts](../../../lib/incomePalettes.ts)。

---

## 行為規範

### Dashboard 模式切換

- 頂部新增 segmented pill：「支出 ▸ 進帳」
- State 存於 client（不持久化；reload 預設「支出」模式）
- 切到「進帳」模式：Hero card 換成進帳快照；最近紀錄只顯示 IncomeTransactions；FAB 開 IncomeSheet；整體 accent 切 mint（暫態）

### Hero card

- **支出模式**：本月支出 NT$ X · N 筆 · 最大類別（既有行為）
- **進帳模式**：本月進帳 +NT$ X · N 筆 · 最近 [日期] [來源 label]
- 淨額（balance）不在 Dashboard 顯示

### Records 分 tab（全部 / 支出 / 進帳）

- 「全部」：UNION cashTransactions + IncomeTransactions；income row 帶 mint glow 背景
- 「支出」：only cashTransactions
- 「進帳」：only IncomeTransactions

### Empty state（光點品牌）

constellation（多個小光點）+ 中央 halo（mint glow）+ 文案「還沒記過家裡的進帳」+ CTA「記第一筆」。此 pattern 延伸到其他 asset 空狀態，不用插畫。

### Celebration

IncomeSheet 提交後：對應 row 在 RecordsList / 保險頁 mint glow 背景 fade in 0.6s → fade out 1.2s。不要 confetti / bounce。

---

## IncomeTransactions schema

見 [lib/db/schema.ts](../../../lib/db/schema.ts) → `incomeTransactions`。

要點：不參與 balance / settlement / split；`assetId` 用既有 Assets 表（連保單用）；pg_cron 一年後物理刪除；`source` 為自由文字備註（null when empty）。

---

## UI ↔ schema 對應

| IncomeSheet 欄位 | DB 欄位 | 必填 | 備註 |
|---|---|---|---|
| 金額 | `amount` | ✅ | TWD integer |
| 收入類別 | `category` | ✅ | 8 選 1，UI 顯示 mono chip |
| 收入歸誰 | `recipientId` | ✅ | Solo Mode 自動填本人 |
| 日期 | `occurredAt` | ✅ | 預設今天，MiniCalendar |
| 關聯保單 | `assetId` | 選填 | 限 type='insurance'；類別='maturity'/'claim' 時主動 prompt |
| 備註 | `source` | 選填 | 自由文字 |

---

## Open / deferred questions

留給 Phase 2 保險 slice 設計時處理：

1. **保險詳情頁「累計繳 vs. 拿回」view**：版面、情感 framing 文案、時間軸
2. **滿期 / 理賠的 trigger UX**：從保險頁 prefill assetId + category，還是從 IncomeSheet 反向認領？
3. **RecordsList「全部」tab income row 視覺**：mint glow 強度、與 expense row 視覺分量比
4. **Edit / Delete IncomeTransaction**：soft-delete-and-reinsert（mirror cashTransactions）還是直接 update？
5. **用語統一**：「記帳」、「紀錄」、「進帳」目前混用，需文案 review

---

## 排程

- **全部完成（v0.3.0，2026-05-06）**：IncomeSheet UI + Dashboard mode toggle + Records tabs + Realtime + Insurance↔Vehicle 全 ship
- **時間 budget**：4-5 年內第一張儲蓄險滿期前必須上線（已達成）

---

## 索引

- 既有 expense category token：[lib/categories.ts](../../../lib/categories.ts)
- AddSheet asset 關聯 picker UX 原則：[CLAUDE.md](../../../CLAUDE.md) → 設計慣例
