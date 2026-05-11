---
status: shipped
shipped_in: v0.15.0（PR #TBD，closes #50；v1 scope：date range + 愛物 multi-select + URL-synced + 分享連結）
related_issues: "#50, #22 (free-text 互補), #37 (CSV 匯出搭配)"
note: 補的是 CWMoney 砍掉「按帳戶 + 分類篩選」後用戶反彈的設計倒退；Futari 主動補上、不等 records 累積到上千筆才發現「找不到了」。
---

# Records 結構化篩選器 spec

> 目標：讓使用者能用「已知維度」組合篩選 records，而不是靠記憶搜尋字串。
> 範圍：`/records`：日期範圍、愛物、誰付的、分攤、分類；組合 → URL → 兩人共享同一視圖。
> 優先級：v0.15.0；後續金額範圍 / status / 儲存視圖在 v2 / v3。

---

## 背景與動機

CWMoney 用戶反饋（user-feedback-analysis.md）：

> 新版本查詢功能退化：以前能按帳戶 + 分類篩選，現在只能搜尋備註和時間。
> 子分類篩選無法使用，不同幣種無法統一換算排序。

CWMoney 把 structured filter 砍掉是設計失誤。Futari positioning 強調「雙人優先 × 陪伴 × 愛物」—— records 累積速度比單人帳本快 2x，半年後找一筆紀錄的痛點會非常真實。本 spec 是預防性投資。

跟 #23（free-text 搜 note）正交：兩者互補，不重複。free-text 適合「我記得寫過 XXX」；structured filter 適合「上個月車子的維修花費」。

## 設計原則

1. **使用者已知維度優先**：日期、愛物、誰付的、分攤、分類——都是寫入時填過的欄位，不需記憶字串。
2. **組合可分享**：filter state 全部 URL-encoded，丟到對話框就是同一視圖。雙人帳本需要這層共識。
3. **不重設既有心智模型**：legacy `?month=YYYY-MM` 的 MonthSwitcher 維持原貌；自訂日期範圍是 sheet 內的進階選項。
4. **降級安全**：URL 被竄改 → 該維度視為「無篩選」，不 crash 頁面。

## URL schema

| param | 用途 | 範例 |
|---|---|---|
| `?month=YYYY-MM` | 單月範圍（與 MonthSwitcher 並行） | `?month=2026-05` |
| `?from=YYYY-MM-DD&to=YYYY-MM-DD` | 自訂範圍（覆蓋 month） | `?from=2026-04-01&to=2026-04-30` |
| `?range=all` | 全部時間 | `?range=all` |
| `?fPayer=mine\|theirs` | 誰付 | `?fPayer=mine` |
| `?fSplit=all_mine\|all_theirs\|half\|weighted` | 分攤 | `?fSplit=half` |
| `?fCats=dining,transit` | 支出分類（多選，逗號分隔） | `?fCats=dining,transit` |
| `?fIncCats=salary,bonus` | 收入分類（多選，逗號分隔） | `?fIncCats=salary,bonus` |
| `?fAssets=<uuid>,<uuid>,__none__` | 愛物（多選，sentinel `__none__` = 未歸屬） | `?fAssets=11111111-...,__none__` |

precedence：`range=all` > `from+to` > `month` > 預設（current Taipei month）。

## 元件責任

| layer | 檔案 | 責任 |
|---|---|---|
| URL 解析 | `lib/filter.ts` | `parseFilterFromSearchParams` / `parseDateRangeFromSearchParams`；`apply*ToParams` 寫回；`matchesFilter` 給 realtime echo / SSR row-filter 使用。 |
| DB query | `lib/db/queries/transactions.ts`、`lib/db/queries/incomes.ts` | 接 `ResolvedTxnFilter`（payer 解析成 user_id）+ `DateRange`，套到 SQL。`assetIds` 含 `__none__` 時拼成 `IS NULL OR IN(...)`。`monthlyStats*` queries 也吃同一份 filter + dateRange，stats 卡跟 feed 永遠是同一視圖。 |
| Server action | `actions/transaction.ts`、`actions/income.ts` | wire ↔ resolved 轉換（payer → user_id）；income tab 遇到 expense-only dim 時 `cutAll`。 |
| Server SSR | `app/(dashboard)/records/page.tsx` | 從 URL 讀 filter + dateRange → 套到 `listFeedAllPaged` → 第一頁已篩好。fetch 群組 active asset 列表給 sheet 用。 |
| Client | `app/(dashboard)/records/_components/RecordsList.tsx` | useSearchParams → 同步 filter；feed key 包含 dateRange + drill；apply → router.replace。 |
| UI | `app/(dashboard)/records/_components/FilterSheet.tsx` | 五個 section（日期 / 誰付 / 分攤 / 愛物 / 分類）+ 分享連結。 |
| 替換 MonthSwitcher | `app/(dashboard)/records/_components/DateRangeChip.tsx` | 自訂範圍 / 全部時間時顯示，附 X 按鈕一鍵回單月。 |

### lite mode

`/dashboard` 也用 `FilterSheet`，但只要 in-memory payer/split/category——沒有 URL 同步、沒有日期範圍。透過 prop 缺省（不傳 `currentDateRange` / `assets` / `onShare`）切到 lite 模式，同一份元件同時 serve 兩條 page。

## 重要細節

- **settlements 在 split / cat / incCat / asset filter active 時整個 drop**：settlement 沒有 split_type / category / asset_id，套了也是零行——hide 比 leak 好。
- **支出 / 收入分類交互 cut**（`cutsIncome` / `cutsExpense`）：
  - 只設支出分類（或 split）→ 收入 cut 掉
  - 只設收入分類 → 支出 cut 掉
  - 兩個都設 → 各自只看自己 cat 的 rows，兩種都顯示
  在「全部」tab 上看混合視圖時這個對稱性最明顯；其他 tab 同樣套用
- **`__none__` sentinel 同時編在 categoryId / assetIds 不可能**：URL parser 對 categories 顯式擋 `'settle'`，對 assets 接受 `__none__`。
- **`payer='theirs'` 但無伴侶**：resolve 成不可能 UUID（`00000000-...`），SQL 回零行；不 throw、不 NULL-compare。
- **未來 future-month tampering**：`?month=2099-01` clamp 回當月——不顯示空頁、不假裝資料丟了。
- **stable share URL**：`fCats` / `fAssets` 序列化前 `.sort()`——同樣 filter 的 URL 是同一字串，方便雙人比對「我們在看的真的是同一頁」。
- **stats 跟 feed 同步**：`monthlyStatsByCategory` / `monthlyStatsByAsset` / `monthlyIncomeStatsByCategory` 都接 `DateRange` + `Resolved*Filter`；page.tsx 把同一份 resolved filter 餵給 feed query 跟 stats query。
- **by-asset breakdown 防 degenerate**：當 user 在 filter 選了 1+ 個愛物，by-asset breakdown 會塌成單根 bar（沒資訊量）。MonthlyStatsSection 在那種情況自動 effective view → `'category'`，StatsBreakdownToggle 同步隱藏「愛物」option（剩單一選項時整個 toggle 隱藏）。Filter 清掉之後恢復。

## 互動流程

```
使用者進 /records → 預設本月、無 filter
    ↓ 點「篩選」
FilterSheet 開啟（draft seeded from URL）
    ↓ 改日期 / 愛物 / 分類 → 點「套用」
router.replace(`/records?...`) → server SSR 重渲染
    ↓ 第一頁已篩好；分頁 loader 帶同樣 filter
    ↓ 想分享 → 點「複製分享連結」
window.location.origin + 同樣 URL → clipboard
    ↓ 對方點連結 → 自己的 /records 開出同一視圖
```

## 後續

- **v2**：金額範圍（> N、< N、between）、status（pending / settled，#71 ship 後）。
- **v3**：「儲存為快速視圖」並命名（e.g. 「車子維修」）。需要新 schema（FilterPresets table）；不在 v0.15.0 範圍。
- **與 #51 競品 CSV 匯入**：篩選結果可導出當前視圖（已有 #37 CSV 匯出，未來把 filter 帶進匯出 query）。
- **與 #42 trip 子帳本**：date range 加上「某次旅行」preset；要等 trip 模型先做完。

## 不做的事

- **金額範圍**：v2，先收 v1 用戶回饋再做（issue #50 寫的 v1 scope）。
- **status filter**：依賴 #71 pending 收斂 ship，順序上之後做。
- **分散到每個 tab 各自的 filter**：所有 tab 共用同一 filter URL；切 tab 不會清掉。
- **「依旅行篩選」**：等 #42 trip 子帳本，先做日期範圍當佔位。
