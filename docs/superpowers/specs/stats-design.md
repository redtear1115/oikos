---
status: shipped
shipped_in: v0.14.0（PR #93 + 13 個後續 polish iterations：donut chart / collapse / mode-aware title / 收入 category breakdown 等），closes #22。Drill-down post-v0.14.0（PR #116 / commit 3fe67ff），closes #102 — pending next tagged release.
related_issues: "#22, #102"
note: v0.14.0 主題「沒有訊號的時候，也還看得見」的中段；#44 月度回顧 query 形狀沿用本 spec。Drill-down hook (data attributes) 原本 v0.14.0 預留、實作切到 #102；現已合入 main，等下一個 tagged release。
---

# Records 月度／分類統計 spec

> 目標：在 `/records` 頁底部加一段 inline 統計，讓使用者能快速看到「本月一起花了多少、花在哪幾類、花在哪些愛物上」。
> 範圍：純支出視角、純呈現、不引入新寫入路徑。
> 優先級：v0.14.0；#44 月度回顧的卡片計算會 reuse 這層 query。

---

## 背景與動機

friend test 第二個月起出現高頻訊號：使用者翻 `/records` 想看「這個月加起來多少」，但目前只有 raw transaction list。要靠人腦累加，違背「記了之後看得見」的核心承諾。

設計上不做獨立 `/stats` 頁——統計是 records 的延伸視角、不是獨立功能。從 list 滑到 stats 自然衍生「我看到流水之後想看總和」的閱讀路徑。

#44 月度回顧（雙人月度回顧儀式）會用到「本月最常花的類別」、「本月愛物開銷分佈」這些聚合，本 spec 把它們落成 query helper，#44 直接 reuse。

---

## Scope

### In

- `/records` 頁底部 inline `<MonthlyStatsSection>`：顯示當月總支出、分類 / 愛物 breakdown
- 月份切換器（上一月 / 下一月，預設本月）
- 兩種 breakdown 視角 toggle：**分類**（預設）／ **愛物**（含 `其他支出` 群組對應 `asset_id IS NULL`）
- 純 table + 橫向進度條呈現（暫不引 chart lib；如後續設計需要再評估）
- Empty state：當月零支出時顯示鼓勵文案，不顯示 0% 條
- 軟刪除（`deleted_at IS NOT NULL`）的 transaction **排除**

### Out

- **獨立 `/stats` 頁**：不另開 route
- **跨月對比**：本月 vs 上月差額條暫不做（敘事不確定，先看實際使用）
- **IncomeTransactions / Settlements 入統計**：純支出視角；進帳統計、誰付誰多少都不在這頁
- **Drill down 點 row → filtered transaction list**：nice-to-have，留 hook 不做
- **Realtime 即時更新**：純 SSR，不訂閱 realtime（見「locked decisions」）
- **chart lib（Recharts / Chart.js）**：MVP 不引；bundle size > 視覺收益
- **CSV export of stats**：v0.12.0 已有 transactions CSV，stats 不另出

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 位置 | `/records` 頁 inline section，**放在 transaction list 下方** | 統計是 list 的延伸閱讀，不切頁；用戶翻完流水自然看到總和 |
| 預設窗口 | **本月**（依使用者本地時區的當前月）| 「現在感」優先；上個月用月份切換器看 |
| 月份切換 | 左右箭頭月份切換器，**上限 = 本月**、下限 = group 創建月 | 不允許切到未來；group 創建前無資料無意義 |
| 跨月對比 | **不做**（v0.14.0 MVP）| 敘事不確定（差額是否健康？），先收實際使用 |
| 資料源 | `CashTransactions` only，`deleted_at IS NULL` | 純支出視角；軟刪 row 是被使用者撤銷的 intent，不該入統計 |
| Settlement / Income | **完全不出現** | 統計問題是「我們花了多少在哪」，settlement 是「誰還誰」、income 是「進來多少」，不同問題 |
| Breakdown 維度 | 兩種 toggle：分類（預設）／ 愛物 | 分類是既有 enum、認知門檻最低；愛物 group by `asset_id`，`null` 歸「其他支出」 |
| 排序 | 各條 row 依**金額降序**排列 | 直覺；最大那條最該被看到 |
| 視覺呈現 | table + 橫向進度條（百分比 = 該 row / 當月總額）| MVP 不引 chart lib；進度條已能傳達分佈感 |
| Drill down | **不做（MVP）** | 留 hook（row 加 `data-category` 等屬性），需要再接到既有 records filter |
| Realtime | **純 SSR、不訂閱**；切月或刷新才更新 | 見下方「不採用 realtime」；list 已有 realtime in-place mutation，stats 跟著走會打架 |
| Query 位置 | inline 加在 [`lib/db/queries/transactions.ts`](../../../lib/db/queries/transactions.ts) | 沿用既有檔，避免散落；之後 #44 reuse 時再抽 `stats.ts` |
| Empty state | 「這個月還沒有花費紀錄」一行，不顯示 0% bars | 陪伴而不評判；零支出不是 KPI |
| 月份切換器 UI | 上一月／下一月按鈕 + 月份標題（例「2026 年 5 月」），i18n 走 `getTranslations()` | 與 dashboard 月份顯示對齊（如有），保留 i18n |

### 不採用

- ❌ **獨立 `/stats` route**：把統計拆出 records 會變成「分析工具」面相，違背陪伴定位
- ❌ **跨月對比 / 同期對比 / 健康評分**：暗示「該花多少」，違背「不評判、不定義好壞」（CLAUDE.md 設計原則 2）
- ❌ **chart lib (Recharts ~50KB+)**：mobile-first 下 bundle 成本不划算；橫向進度條已夠
- ❌ **Stats 訂閱 realtime**：既有 [`RealtimeProvider`](../../../app/%28dashboard%29/_components/RealtimeProvider.tsx) 走 client-side mutation 維護 list；要讓 stats 跟著重算需引入 client-side aggregation 或全頁 `router.refresh()`，前者重複 server SQL、後者打斷 list in-place 動畫。「翻月份／pull-to-refresh 才更新」是合理 trade-off
- ❌ **Drill down click → 跳 filtered list**：MVP 收斂；但 row attribute 預留，之後接 records filter 即可
- ❌ **Settlement / IncomeTransactions 入分母**：稀釋「花在哪」這個問題的訊號

---

## 架構

### 資料流

```
/records page (server component)
  ↓
  ├─ loadMoreTransactions()  ← 既有 list 路徑（不動）
  └─ loadMonthlyStats({ groupId, year, month, breakdown })  ← 新
       ↓
       lib/db/queries/transactions.ts:
         monthlyStatsByCategory(groupId, monthRange)
         monthlyStatsByAsset(groupId, monthRange)
       ↓
       Drizzle: SELECT category | asset_id, SUM(amount), COUNT(*)
                FROM CashTransactions
                WHERE group_id = ? AND deleted_at IS NULL
                  AND transacted_at >= monthStart
                  AND transacted_at <  nextMonthStart
                GROUP BY category | asset_id
                ORDER BY total DESC
       ↓
       returns Array<{ key, label, total, count, percentage }>
```

### 月份範圍計算

- `monthStart` / `nextMonthStart` 用 `Asia/Taipei` 為基準（與既有 transactedAt 處理一致）
- 切月份時透過 URL search param `?month=2026-05` 讓 server re-render，避免 client-side state 漂移
- `month` 缺省 → 取「now」對應的 YYYY-MM
- Server validation：拒絕未來月、拒絕 group 創建月之前

### 元件清單

| 元件 | 路徑 | 角色 |
|---|---|---|
| Stats section | `app/(dashboard)/records/_components/MonthlyStatsSection.tsx`（新，server）| RSC，依 `?month` 抓統計、render 進度條 |
| Month switcher | `app/(dashboard)/records/_components/MonthSwitcher.tsx`（新，client）| 左右箭頭 + 標題；改 URL search param |
| Breakdown toggle | `app/(dashboard)/records/_components/StatsBreakdownToggle.tsx`（新，client）| 分類 ↔ 愛物切換；URL `?view=category|asset` |
| Query helpers | `lib/db/queries/transactions.ts` 內新增 `monthlyStatsByCategory` / `monthlyStatsByAsset` | 之後抽到 `stats.ts` 給 #44 共用 |

### URL 狀態

- `?month=2026-05` — 月份；缺省 = 本月
- `?view=category|asset` — breakdown view；缺省 = `category`
- 不持久化到 cookie / DB；切到別的頁再回來重置（與 records filter 既有規則一致）

### 與既有 list 區的關係

list 區 + stats 區在同一頁、同一 server component。月份切換**只影響 stats**，不過濾 list（list 維持「最新優先」邏輯，避免互相干擾）。如果之後要連動，再評估 single-source-of-truth。

---

## UX 細節

### 預設狀態

- 進 `/records` 看到 list 在上、stats 在下
- Stats 標題：本月名稱 + 「總共花了 NT$ X」
- 預設 view：分類 breakdown，總額橫條 + 各分類橫條（百分比寬度）
- 頂部右側兩顆 toggle：**分類** ／ **愛物**

### 月份切換器

- 形式：`← 2026 年 5 月 →`
- 左箭頭永遠可點（除非已切到 group 創建月）
- 右箭頭在「已是本月」時 disabled
- 切月份只刷新 stats section（透過 URL search param + RSC re-render；list 不動）

### 愛物視角

- 每個 `asset_id` 一條 row，label = asset name
- `asset_id IS NULL`（沒有對應愛物的支出）統一歸到最後一條：「其他支出」
- 已軟刪除的 asset 仍顯示其 name（讀 `Assets` 表時不過濾 `deleted_at`，僅讀名稱），避免 row 出現「未命名」

### Empty state（當月零支出）

- 不顯示 0% bars 與分類列表
- 只顯示一行：「這個月還沒有花費紀錄」+ 副字「翻翻其他月看看」
- 月份切換器照常顯示

### Realtime 行為

- Stats 不訂閱 realtime
- 使用者新增 / 編輯 / 刪除 transaction 後，stats 不會自動重算
- 切月（包含切到本月再切回本月）會 server re-render → 拿到最新數字
- `RealtimeProvider` 收到 INSERT 時不觸發 stats refetch（避免打斷 list 的 in-place 動畫）

### i18n

- 月份顯示走 `getTranslations()` + 既有 locale formatter
- 分類 label 走既有 category dictionary
- 愛物 label 走 asset.name（使用者輸入內容，不翻譯）

---

## 實作風險

1. **時區邊界**：`transacted_at` 是 timestamptz，月份範圍要在 `Asia/Taipei` 算。跨日邊界（5/31 23:50 vs 6/1 00:10）要在 query 層用 `AT TIME ZONE` 處理，不能用 client-side year/month 比較
2. **軟刪除 asset 的名稱讀取**：`monthlyStatsByAsset` 要 left join `Assets`（不過濾 `deleted_at`），但要避免 fan-out（asset detail tables 不需要 join）
3. **月份切換 URL state vs list 區的 cursor**：list 區用 in-memory cursor、stats 用 URL `?month`，兩條獨立、互不影響——但要確保切月時 list 不被 unmount / re-fetch
4. **i18n 月份格式**：4 種 locale（zh-TW / zh-CN / en / ja）的月份格式不一樣（「5 月」vs「May」vs「May 2026」），需在 dictionary 補對應 key
5. **Empty state 與月份切換並存**：當前月零支出時，月份切換器仍要可見可點（讓使用者翻其他月）
6. **與 #44 的耦合**：query helper 命名要前瞻——`monthlyStatsByCategory` / `monthlyStatsByAsset` 之後 #44 會直接 import，不該綁死「stats section」這個呼叫者

---

## 範疇與工時估算（單人）

| 工作項 | 估時 |
|---|---|
| Query helpers (`monthlyStatsByCategory` / `monthlyStatsByAsset`) + Drizzle SQL + 時區處理 | 1d |
| `MonthlyStatsSection` server component（含 empty state） | 0.5d |
| `MonthSwitcher` client component（URL search param + RSC re-render） | 0.5d |
| `StatsBreakdownToggle` client component | 0.25d |
| 進度條樣式（橫條 + 百分比 + 分類 tint）| 0.5d |
| i18n 字典補項（4 語） | 0.25d |
| `/records` page integration | 0.25d |
| 跨月 / 跨年 / 時區 / Solo Mode / 多語 測試 | 0.75d |
| Spec / CLAUDE.md / CHANGELOG 更新 | 0.25d |
| **合計** | **~4.25 dev days** |

---

## 測試矩陣

| 場景 | 期望 |
|---|---|
| 本月有 N 筆支出 | 顯示總額、各分類條、百分比加總 = 100% |
| 本月零支出 | 顯示 empty state，月份切換器仍可點 |
| 切到上月 | URL `?month=...` 改變、stats 重抓、list 不動 |
| 切到「未來月」 | 右箭頭 disabled、無法切 |
| 切到「group 創建之前的月」 | 左箭頭 disabled |
| 軟刪除一筆 transaction | 切月再切回後、該筆從 stats 消失（list 也應消失） |
| 編輯一筆 transaction（soft delete + insert） | 切月刷新後 stats 反映新值 |
| 切換 breakdown：分類 → 愛物 | 同月份、不同 grouping；總額不變 |
| 愛物視角且有 `asset_id IS NULL` 的支出 | 歸到「其他支出」row |
| 愛物視角且該愛物已軟刪除 | row 仍以 asset name 顯示 |
| Solo Mode 使用者 | 顯示同一份 stats（單人也看得到自己花了多少）|
| 4 語切換 | 月份格式、分類 label、empty state 文案皆翻譯 |
| 月份邊界（5/31 23:55 vs 6/1 00:05） | 各歸各月 |
| 跨年（2026/12 → 2027/1） | 月份切換器正確跨年 |

---

## 未來擴展（不在本 spec）

- ~~**Drill down**：點分類 / 愛物 row 跳到 records 既有 filter~~ → 已 ship（#102，post-v0.14.0）
- **跨月對比**：本月 vs 上月差額條
- **趨勢線**：近 6 個月堆疊條（需引 chart lib）
- **預算 / 警示**：本月某類超出 X，違背「不評判」原則，需設計層先想清楚再做
- **Stats realtime**：使用者新增 transaction 時 stats 即時更新；目前刻意不做
- **CSV export of stats**：與 v0.12.0 transactions CSV 對齊

---

## 索引

- [GitHub issue #22](https://github.com/redtear1115/oikos/issues/22)
- [transactions-design.md](transactions-design.md) — 既有 list / filter / realtime
- [aibutsu-design.md](aibutsu-design.md) — 愛物 breakdown 視角依賴
- [`lib/db/queries/transactions.ts`](../../../lib/db/queries/transactions.ts) — query helper 落地點
- [`app/(dashboard)/records/page.tsx`](../../../app/%28dashboard%29/records/page.tsx) — section integration 點
- 後續 spec：`monthly-review-design.md`（#44，會 reuse 本 spec 的 query helpers）
