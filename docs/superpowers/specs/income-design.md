---
last_updated: 2026-05-13
status: shipped
first_shipped_in: v0.7.0
related_specs: [transactions, recurring, insurance, savings-view]
related_issues: []
---

# Income — IncomeTransactions 與 IncomeSheet

> 「進帳」獨立 ledger，不參與雙人結算，視覺與情感上跟支出區隔開。
> 範圍：`IncomeTransactions` 平行表 + IncomeSheet 入口 + Records 進帳 tab + Dashboard 模式切換。

---

## 背景與動機

Phase 1.1 上 prod 後 friend test 階段，一位朋友提出「能不能紀錄收入」需求。三輪設計討論結論：

- **產品判斷**：採方案 B「新增 `IncomeTransactions` 平行表」，不動既有 balance / settlement / split。
- **時序**：跟保險耦合 ship——儲蓄險滿期是必發生 income event，沒這張表會無處安放；保險詳情頁的「累計繳 vs. 拿回」也仰賴它（見 [savings-view](savings-view-design.md)）。
- **Brand 邏輯**：收入是「兩人共同生活的高光時刻」，需要獨立的物理空間（IncomeSheet 非 AddSheet 加 toggle）。

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 觸發點 | **Dashboard 主畫面模式切換 pill**（支出 / 進帳） | 比 sheet 內 segmented / FAB 長按 / 保險頁專屬入口 都低摩擦 |
| 主色 | **薄荷**（mint，#A8DCC4 系） | 跟現有 peach palette 區隔 |
| 類別 mono 字 | **部首字**（薪 獎 期 賠 紅 退 副 其） | 跟 expense category 系統一致 |
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

## 行為規範

### Dashboard 模式切換

- 頂部 segmented pill：「支出 ▸ 進帳」
- State 存於 client（不持久化；reload 預設「支出」模式）
- 切到「進帳」模式：Hero card 換成進帳快照；最近紀錄只顯示 IncomeTransactions；FAB 開 IncomeSheet；整體 accent 切 mint（暫態）

### Hero card

- **支出模式**：本月支出 NT$ X · N 筆 · 最大類別
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

## 資料模型

`IncomeTransactions` 跟 `CashTransactions` 平行但獨立。詳細欄位以 `lib/db/schema.ts` 為準。

要點：
- 不參與 balance / settlement / split
- `assetId` 用既有 Assets 表（連保單用）
- pg_cron 一年後物理刪除
- `source` 為自由文字備註（null when empty）

| IncomeSheet 欄位 | DB 欄位 | 必填 | 備註 |
|---|---|---|---|
| 金額 | `amount` | ✅ | TWD integer |
| 收入類別 | `category` | ✅ | 8 選 1（INCOME_CATEGORIES），UI 顯示 mono chip |
| 收入歸誰 | `recipientId` | ✅ | Solo Mode 自動填本人 |
| 日期 | `occurredAt` | ✅ | 預設今天，MiniCalendar |
| 關聯保單 | `assetId` | 選填 | 限 type='insurance'；類別='maturity'/'claim' 時主動 prompt |
| 備註 | `source` | 選填 | 自由文字 |

Design tokens：
- `INCOME_CATEGORIES`（8 entries × `id / label / mono / tint / ink / chart`）— `lib/incomeCategories.ts`
- `INCOME_PALETTES`（三種主色變體 mint / gold / cream，MVP 只 ship mint）— `lib/incomePalettes.ts`

---

## Acceptance criteria

- Dashboard 模式 toggle 切到「進帳」→ Hero 變進帳快照、FAB 變 mint 開 IncomeSheet
- IncomeSheet 提交後 row 在 records 列表 mint glow fade in / out 不打擾
- Records 三 tab 切換顯示 cash / income / union；income row 在「全部」tab 帶 mint glow 區隔
- 進帳不影響 balance / settlement / split
- 滿期 / 理賠類別在 IncomeSheet 主動 prompt 關聯保單（assetId picker 限 insurance type）

---

## Open / deferred questions

留給將來：

1. **保險詳情頁「累計繳 vs. 拿回」view** → 已落在 [savings-view](savings-view-design.md)
2. **滿期 / 理賠的 trigger UX** → 同上
3. **RecordsList「全部」tab income row 視覺**：mint glow 強度、與 expense row 視覺分量比（持續微調）
4. **Edit / Delete IncomeTransaction**：目前走 soft-delete-and-reinsert（mirror cashTransactions）
5. **用語統一**：「記帳」、「紀錄」、「進帳」目前混用，需文案 review
