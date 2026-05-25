---
status: shipped
first_shipped_in: v0.14.0
updates:
  - v0.14.0: stats section + donut chart + 收入 category breakdown + mode-aware title（PR #93 + 後續 polish，closes #22）
  - v0.14.2: drill-down — stats row → feed filter chip（PR #116，closes #102；v0.14.1 暫 revert、v0.14.2 revert-the-revert ship）
  - v1.2.2: 收支 tab 日趨勢圖（每日支出/收入 bar + 累計淨額折線，dep-free SVG）取代該 tab 的 donut（PR #750，closes #747）
  - v1.2.3: 收支 tab 展開時在趨勢圖上方保留「支出·收入·淨收入」總計行（PR #756，closes #757；對齊 donut tab 的 #746 決策）
related_specs: [structured-filter, transactions, monthly-review, income]
related_issues: ["#22", "#102"]
---

# Records 月度／分類統計

> `/records` 頁底部 inline 統計，讓使用者快速看到「本月一起花了多少、花在哪幾類、花在哪些愛物上」。
> 純支出視角（外加進帳 mode 鏡像）、純呈現、不引入新寫入路徑。

---

## 背景與動機

Friend test 第二個月起出現高頻訊號：使用者翻 `/records` 想看「這個月加起來多少」，但目前只有 raw transaction list。要靠人腦累加，違背「記了之後看得見」的核心承諾。

設計上不做獨立 `/stats` 頁——統計是 records 的延伸視角、不是獨立功能。從 list 滑到 stats 自然衍生「我看到流水之後想看總和」的閱讀路徑。

[monthly-review](monthly-review-design.md)（雙人月度回顧）會用到「本月最常花的類別」、「本月愛物開銷分佈」這些聚合，本 spec 把它們落成 query helper 給回顧 reuse。

---

## Scope

### In

- `/records` 頁底部 inline `<MonthlyStatsSection>`：當月總支出、分類 / 愛物 breakdown
- 月份切換器（上一月 / 下一月，預設本月）
- 兩種 breakdown 視角 toggle：**分類**（預設）／ **愛物**（含「其他支出」群組對應 `asset_id IS NULL`）
- Donut chart + 橫條 percentage 呈現
- Drill-down：點 stats row → 套 filter chip 到 feed（同 row 再點清除）
- Empty state：當月零支出時顯示鼓勵文案，不顯示 0% 條
- 軟刪除（`deleted_at IS NOT NULL`）排除

### Out

- **獨立 `/stats` 頁**：不另開 route
- **跨月對比**：本月 vs 上月差額條（敘事不確定，先看實際使用）
- **Realtime 即時更新**：純 SSR，不訂閱 realtime（見 locked decisions）
- **chart lib（Recharts / Chart.js）**：MVP 不引；bundle size > 視覺收益
- **CSV export of stats**：transactions CSV 已有，stats 不另出

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 位置 | `/records` 頁 inline section，**放在 transaction list 下方** | 統計是 list 的延伸閱讀，不切頁；用戶翻完流水自然看到總和 |
| 預設窗口 | **本月**（依使用者本地時區的當前月）| 「現在感」優先；上個月用月份切換器看 |
| 月份切換 | 左右箭頭月份切換器，**上限 = 本月**、下限 = group 創建月 | 不允許切到未來；group 創建前無資料無意義 |
| 跨月對比 | **不做**（MVP）| 敘事不確定（差額是否健康？），先收實際使用 |
| 資料源 | `CashTransactions` only，`deleted_at IS NULL` | 純支出視角；軟刪 row 是被使用者撤銷的 intent |
| Settlement / Income | **完全不出現**（在支出模式中） | 統計問題是「我們花了多少在哪」，settlement 是「誰還誰」、income 是「進來多少」，不同問題 |
| Breakdown 維度 | 兩種 toggle：分類（預設）／ 愛物 | 分類是既有 enum、認知門檻最低；愛物 group by `asset_id`，`null` 歸「其他支出」 |
| 排序 | 各條 row 依**金額降序**排列 | 直覺；最大那條最該被看到 |
| 視覺呈現 | donut chart + 橫條 + percentage（百分比 = 該 row / 當月總額）| 不引 chart lib（用 SVG 自畫 donut）；橫條已能傳達分佈感 |
| Drill down | **點 row → filter chip** 同步到 feed | 跟 [structured-filter](structured-filter-design.md) 用同一份 resolved filter；同 row 再點清除 |
| Realtime | **純 SSR、不訂閱**；切月或刷新才更新 | 見下方「不訂閱 realtime」；list 已有 realtime in-place mutation，stats 跟著走會打架 |
| Empty state | 「這個月還沒有花費紀錄」一行，不顯示 0% bars | 陪伴而不評判；零支出不是 KPI |
| 月份切換器 UI | 上一月／下一月按鈕 + 月份標題（例「2026 年 5 月」），i18n 走 `getTranslations()` | 與 dashboard 月份顯示對齊，保留 i18n |

### 不採用

- ❌ **獨立 `/stats` route**：把統計拆出 records 會變成「分析工具」面相，違背陪伴定位
- ❌ **跨月對比 / 同期對比 / 健康評分**：暗示「該花多少」，違背「不評判、不定義好壞」
- ❌ **chart lib (Recharts ~50KB+)**：mobile-first 下 bundle 成本不划算
- ❌ **Stats 訂閱 realtime**：既有 RealtimeProvider 走 client-side mutation 維護 list；要讓 stats 跟著重算需引入 client-side aggregation 或全頁 `router.refresh()`，前者重複 server SQL、後者打斷 list in-place 動畫。「翻月份／pull-to-refresh 才更新」是合理 trade-off
- ❌ **Settlement / IncomeTransactions 入分母**（支出模式）：稀釋「花在哪」這個問題的訊號
- ❌ **預算 / 警示**：本月某類超出 X，違背「不評判」原則

---

## 資料流

```
/records page (server component)
  ↓ loadMoreTransactions()  ← 既有 list 路徑
  └─ loadMonthlyStats({ groupId, year, month, breakdown })
       ↓
       lib/db/queries/transactions.ts:
         monthlyStatsByCategory(groupId, monthRange)
         monthlyStatsByAsset(groupId, monthRange)
       ↓
       SELECT category | asset_id, SUM(amount), COUNT(*)
       FROM CashTransactions
       WHERE group_id = ? AND deleted_at IS NULL
         AND transacted_at within monthRange
       GROUP BY ...
       ORDER BY total DESC
       ↓
       Array<{ key, label, total, count, percentage }>
```

月份範圍計算：`monthStart` / `nextMonthStart` 用 `Asia/Taipei` 為基準；切月份透過 URL search param `?month=2026-05` 讓 server re-render；`month` 缺省 = 「now」對應 YYYY-MM；server validation 拒絕未來月、拒絕 group 創建月之前。

## Drill-down

點 stats row（category 或 asset）→ 套 filter chip 到 feed：

- 使用 [structured-filter](structured-filter-design.md) 既有的 `?fCats` / `?fAssets` / `?fIncCats` URL params
- 同一 row 再點 → 清除
- 三個 tab（全部 / 支出 / 進帳）都通；income tab drill 用 `?fIncCats=...`
- 卡片 detail bar 上的 `data-*` 屬性由 stats row 預留（v0.14.0 已埋）；`lib/drill.ts` 翻譯這些屬性到 feed `ResolvedTxnFilter`

## 進帳模式

進帳 mode 下 stats 顯示 IncomeTransactions 的分類 breakdown（用 income mint 系 palette）。愛物視角的「拿回」桶（maturity / dividend / survival_annuity）在「已拿回」section 獨立列出（見 [savings-view](savings-view-design.md) 對應的 SAVINGS_RETURN_CATEGORIES）。

## 收支 tab 日趨勢圖（v1.2.2，#747）

當 records 同時選「支出 + 收入」（收支合併視角）時，該 tab 的 donut 換成一張**當月日趨勢圖**：每日支出 bar 朝下、收入 bar 朝上共用中央零線，外加一條**累計淨額**（running Σ 收入 − 支出）折線、末點依正負染綠／橘。月內每一天（1..N）都在 x 軸上、缺資料的日子由 query zero-fill，讓空白讀作空白而非壓縮時間軸。

- **為什麼是「月內每日」而非「跨月對比」**：跨月差額仍在 Out（見 locked decisions「不採用 跨月對比」——暗示「該花多少」的健康評分風險未解）。本版只回答「這個月的節奏長怎樣、月底落在淨流入還是淨流出」，不做月 vs 月。
- **仍不引 chart lib**：沿用 donut 的 inline SVG 自畫策略（見「不採用 chart lib」），Recharts 仍排除。
- bars 與折線用**各自 scale 共用零線**：bar 依當月單日最大值、折線依累計最大擺幅，避免月末累計值壓扁單日 bar。
- 資料源 query helper：`dailyTrendByMonth(...)` in `lib/db/queries/transactions.ts`（zero-fill 月內每一天）。
- **總計行保留**（v1.2.3，#757）：展開時趨勢圖上方仍保留「支出·收入·淨收入」總結行——趨勢圖本身不寫出這三個數字，與 donut tab 的 #746 決策一致（月總結不能只靠視覺化元素承載；折線中心只有累計淨額，且純收入月份不一定畫趨勢）。

## URL 狀態

- `?month=2026-05` — 月份；缺省 = 本月
- `?view=category|asset` — breakdown view；缺省 = `category`
- 不持久化到 cookie / DB；切到別的頁再回來重置（與 records filter 既有規則一致）

---

## UX 細節

### 月份切換器

`← 2026 年 5 月 →`。左箭頭永遠可點（除非已切到 group 創建月）；右箭頭在「已是本月」時 disabled。切月份只刷新 stats section，list 不動。

### 愛物視角

- 每個 `asset_id` 一條 row，label = asset name
- `asset_id IS NULL` 統一歸到最後一條：「其他支出」
- 已軟刪除的 asset 仍顯示其 name（讀 `Assets` 表時不過濾 `deleted_at`，僅讀名稱），避免 row 出現「未命名」

### Empty state（當月零支出）

不顯示 0% bars 與分類列表；只顯示「這個月還沒有花費紀錄」+ 副字「翻翻其他月看看」；月份切換器照常顯示。

### Filter active 時的 by-asset breakdown

當 user 在 [structured-filter](structured-filter-design.md) 選了 1+ 個愛物，by-asset breakdown 會塌成單根 bar（沒資訊量）。MonthlyStatsSection 在那種情況自動 effective view → `'category'`，StatsBreakdownToggle 同步隱藏「愛物」option（剩單一選項時整個 toggle 隱藏）。Filter 清掉之後恢復。

---

## 實作風險

1. **時區邊界**：`transacted_at` 是 timestamptz，月份範圍要在 `Asia/Taipei` 算。跨日邊界（5/31 23:50 vs 6/1 00:10）要在 query 層用 `AT TIME ZONE` 處理
2. **軟刪除 asset 的名稱讀取**：`monthlyStatsByAsset` 要 left join `Assets`（不過濾 `deleted_at`），但要避免 fan-out（asset detail tables 不需要 join）
3. **月份切換 URL state vs list 區的 cursor**：list 區用 in-memory cursor、stats 用 URL `?month`，兩條獨立、互不影響
4. **i18n 月份格式**：4 種 locale 的月份格式不一樣，需在 dictionary 補對應 key
5. **與 monthly-review 的耦合**：query helper 命名要前瞻——`monthlyStatsByCategory` / `monthlyStatsByAsset` 之後 monthly-review 會直接 import，不該綁死「stats section」這個呼叫者

---

## Acceptance criteria

- 本月有 N 筆支出 → 顯示總額、各分類條、百分比加總 = 100%
- 本月零支出 → 顯示 empty state，月份切換器仍可點
- 切到上月 → URL `?month=...` 改變、stats 重抓、list 不動
- 切到「未來月」 → 右箭頭 disabled、無法切
- 切到「group 創建之前的月」 → 左箭頭 disabled
- 軟刪除一筆 transaction → 切月再切回後該筆從 stats 消失
- 切換 breakdown：分類 → 愛物 → 同月份、不同 grouping；總額不變
- 愛物視角且有 `asset_id IS NULL` 支出 → 歸到「其他支出」row
- 愛物視角且該愛物已軟刪除 → row 仍以 asset name 顯示
- Solo Mode 使用者 → 顯示同一份 stats
- 4 語切換 → 月份格式、分類 label、empty state 文案皆翻譯
- 月份邊界（5/31 23:55 vs 6/1 00:05）→ 各歸各月
- 跨年（2026/12 → 2027/1）→ 月份切換器正確跨年
- 點 stats row → feed 套 filter chip；同 row 再點 → chip 清除

---

## 未來擴展

- **跨月對比**：本月 vs 上月差額條
- **跨月趨勢線**：近 6 個月堆疊條（月內每日趨勢已於 v1.2.2 ship，見上「收支 tab 日趨勢圖」；多月跨月堆疊仍未做）
- **預算 / 警示**：本月某類超出 X，違背「不評判」原則，需設計層先想清楚再做
- **Stats realtime**：使用者新增 transaction 時 stats 即時更新；目前刻意不做
- **CSV export of stats**：與 transactions CSV 對齊
