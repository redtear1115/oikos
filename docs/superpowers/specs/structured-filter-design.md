---
status: shipped
shipped_in: |
  v0.15.0（PR #124，closes #50；v1 scope：date range + 愛物 multi-select + URL-synced + 分享連結）
  v0.15.2 (closes #165；v2 scope：金額範圍 + status filter)
  v0.16.0 (closes #223；v3 scope：愛物分組 sub-section + 全選 chip)
  v0.16.1 (closes #235；Dashboard 收入模式補上 filter 入口 + 接 loader)
related_issues: "#50, #165, #223, #235, #22 (free-text 互補), #37 (CSV 匯出搭配)"
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
| `?fAmtMin=N` | 金額下限（NT$ 整數，含；非負；malformed = drop） | `?fAmtMin=100` |
| `?fAmtMax=N` | 金額上限（NT$ 整數，含；非負） | `?fAmtMax=5000` |
| `?fStatus=pending\|settled` | 紀錄狀態（v0.10 pending 收斂後可單選；absent = both） | `?fStatus=pending` |

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

**Dashboard mode parity（v0.16.1 #235）**：篩選按鈕在支出 / 收入兩種 mode 都顯示。收入模式的 `loadMore` 改用 `useMemo` 包進 `DashboardFeed` 內，closure 帶住目前 filter ref，filter 變動時 `TransactionFeed` 既有的 refetch effect 自動重抓——expense / income 走同一條 filter wire。Sheet 顯示的維度仍依 lite-mode 規則（payer / amount / status 顯示，date / 愛物 / 分類 hidden）；income 語意上 `payer → recipient`，`status` 不必顯示給使用者選但 pass-through 到 income loader 不會 break（income 永遠 settled）。

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

## v2 範圍（v0.15.2，PR closes #165）

延續 v1 的 URL-synced 篩選器基建，加入兩個維度：

### 金額範圍（amountMin / amountMax）

- 雙向 inclusive 整數 NT$，任一側可空（= 開放邊界）。URL: `?fAmtMin=N&fAmtMax=N`。
- 套用到**全部三類 row**（cash / settlement / income）—— 三類都有 `amount` 欄位，所以金額範圍正交於 kind cut rules。
- Settlements 也吃金額範圍（v1 的 settlement-cut 規則沒動到金額這條）。
- Malformed input（負數、小數、非數字）→ silent drop，沿用 v1「tampered URL = 該維度無篩選」原則。

### Status filter（pending / settled）

- 單選 chip：`all` / `pending` / `settled`。URL: `?fStatus=...`。
- 只有 `CashTransactions.status` 真正分 pending/settled；Settlements 與 IncomeTransactions 永遠是 `settled`。
- `fStatus=pending` → 透過 `hidesSettlements` / `cutsIncome` 把這兩類整支 drop；只剩 pending cash。
- `fStatus=settled` → 三類都通過（cash 限 settled），不額外 cut。
- 跟 #49 v1 ship 的 pending 收斂銜接 —— pending stack 是 UI 收斂，filter 是用戶想抽出「只看未扣款」時的補位。

### Lite mode 行為

- /dashboard 的 lite mode FilterSheet：金額範圍 + status 仍**會顯示**（它們對 cash 有意義，不依賴 URL）。日期 / 愛物 / 分享連結維持原本 lite-mode hidden。
- 邏輯上 lite mode 的 in-memory matcher 走 `matchesFilter`，已支援 amount + status。

### Resolved filter 結構

| 欄位（cash） | 欄位（income） | 說明 |
|---|---|---|
| `amountMin / amountMax` | `amountMin / amountMax` | 兩邊都帶；income 也吃 |
| `status: RecordStatus \| null` | — | 只 cash 有；income 永遠 settled，`status='pending'` 走 `cutAll` |

## v3 範圍（v0.16.0，PR closes #223）

愛物 sub-section 分組 + 一鍵 select-all。純 UI 層擴充，不動 URL / 資料模型 / SQL。

### 為什麼是 UI sugar 而不是新的 `assetTemplateKey` 維度

原 issue 提到 query 層加 `assetTemplateKey: 'vehicle' | 'property' | 'insurance' | 'general'`，但 PR #226（愛物模板系統 v1）把實際的 `asset_template_key` enum 縮到只有 `'general'` —— 那三個 template name 在 schema 裡不存在。所以 v3 走 UI sugar：

- 把 FilterSheet 的「愛物」欄位按 asset type 分組成 sub-section（車輛 / 房子 / 生命 / 物品 / 守護）
- 每個 sub-section 開頭放一顆「全選」chip，按下後把該組所有 asset uuid 加進現有的 `fAssets` set（已選的維持已選；Set 語意天然冪等）
- 全選後再按一次 → 移除該組全部 asset uuid（其他組不受影響）

優點：
- 零 schema / SQL / URL / matcher 變更 —— 完全沿用既有 `fAssets` URL 與 `assetIdsClause` predicate
- Share link 保留 snapshot 語意：分享當下選的是哪幾個就是哪幾個，之後再加新愛物不會「自動納入」對方的視圖
- 跟既有 `__none__` sentinel、`asset_id IS NULL` 行為無衝突

缺點（可接受）：
- 全選了車輛後又新建一輛車：新車不會自動加進來。對 share-snapshot 語意是 feature；對「我永遠想看所有車」是手動 re-tap。
- URL 變長（多個 uuid 而非一個 enum）。Realtime echo 與 matchesFilter 不受影響。

### Sub-section 分組

| Group key | Asset types | Dot tint |
|---|---|---|
| `car` | `car` | `--asset-tint-car` |
| `house` | `house` | `--asset-tint-house` |
| `living` | `child`, `pet`, `plant` | `--asset-tint-child` |
| `item` | `item` | `--asset-tint-item` |
| `coverage` | `insurance` | `--asset-tint-insurance` |

排序固定為上面這個順序，與 /assets 頁的 section 排版一致。

`coverage` 雖然 issue 註記「守護獨立模組，不算在愛物模板分類裡」—— 我們仍保留 sub-section，因為：
1. 既有 transaction 可能 link 到保險 asset，移除分組會讓那些 row 在 filter UI 失去可選性。
2. 跟 /assets 頁的「守護」tab 視覺對齊。
3. 不在「愛物 templates」中是 schema 事實（保險走 `InsuranceDetails` 子表，沒 `template_key`），但 filter UI 不需要為這條哲學區隔多開一條程式碼路徑。

### Empty section 收斂

沒有該類愛物的 group → 整個 sub-section 不渲染（不顯示 "你還沒有 X 類愛物" 之類的 placeholder）。Sheet 在新帳本上仍然乾淨：只有「未歸屬」chip + 看得到的支出/收入分類。

## 後續

- **v4**：「儲存為快速視圖」並命名（e.g. 「車子維修」）。需要新 schema（FilterPresets table）；不在 v0.16.0 範圍。
- **與 #51 競品 CSV 匯入**：篩選結果可導出當前視圖（已有 #37 CSV 匯出，未來把 filter 帶進匯出 query）。
- **與 #42 trip 子帳本**：date range 加上「某次旅行」preset；要等 trip 模型先做完。

## 不做的事

- **多區間 amount filter**（e.g.「100~500 或 1000~5000」）：太進階，single range 已 cover 主要使用案例。
- **status 多選**：只有兩個值，多選沒比單選好用。
- **負值或小數金額**：DB schema 用 integer NT$，UI 入口也不接受小數；URL 上的小數值靜默 drop。
- **分散到每個 tab 各自的 filter**：所有 tab 共用同一 filter URL；切 tab 不會清掉。
- **「依旅行篩選」**：等 #42 trip 子帳本，先做日期範圍當佔位。
