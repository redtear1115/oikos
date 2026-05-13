---
status: shipped
first_shipped_in: v0.15.0
updates:
  - v0.15.0: v1 — date range + 愛物 multi-select + URL-synced + 分享連結（#50 PR #124）
  - v0.15.2: v2 — 金額範圍 + status filter（#165）
  - v0.16.0: v3 — 愛物分組 sub-section + 全選 chip（#223）
  - v0.16.1: Dashboard 收入模式補上 filter 入口 + 接 loader（#235）
related_specs: [transactions, stats, aibutsu]
related_issues: ["#50", "#165", "#223", "#235"]
---

# Records 結構化篩選器

> 讓使用者能用「已知維度」組合篩選 records，而不是靠記憶搜尋字串。
> `/records`：日期範圍、愛物、誰付的、分攤、分類、金額範圍、status。組合 → URL → 兩人共享同一視圖。

---

## 背景與動機

CWMoney 用戶反饋（[user-feedback-analysis.md](../user-feedback-analysis.md)）：

> 新版本查詢功能退化：以前能按帳戶 + 分類篩選，現在只能搜尋備註和時間。
> 子分類篩選無法使用，不同幣種無法統一換算排序。

CWMoney 把 structured filter 砍掉是設計失誤。Futari positioning 強調「雙人優先 × 陪伴 × 愛物」—— records 累積速度比單人帳本快 2x，半年後找一筆紀錄的痛點會非常真實。本 spec 是預防性投資。

跟 free-text 搜 note 正交：兩者互補。free-text 適合「我記得寫過 XXX」；structured filter 適合「上個月車子的維修花費」。

## 設計原則

1. **使用者已知維度優先**：日期、愛物、誰付的、分攤、分類、金額——都是寫入時填過的欄位，不需記憶字串。
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
| `?fIncCats=salary,bonus` | 收入分類（多選） | `?fIncCats=salary,bonus` |
| `?fAssets=<uuid>,<uuid>,__none__` | 愛物（多選，sentinel `__none__` = 未歸屬） | `?fAssets=...,__none__` |
| `?fAmtMin=N` | 金額下限（NT$ 整數，含；非負；malformed = drop） | `?fAmtMin=100` |
| `?fAmtMax=N` | 金額上限（含；非負） | `?fAmtMax=5000` |
| `?fStatus=pending\|settled` | 紀錄狀態（v0.10 pending 收斂後可單選；absent = both） | `?fStatus=pending` |

Precedence：`range=all` > `from+to` > `month` > 預設（current Taipei month）。

## 重要設計細節

- **settlements 在 split / cat / incCat / asset filter active 時整個 drop**：settlement 沒有 split_type / category / asset_id，套了也是零行——hide 比 leak 好。
- **支出 / 收入分類交互 cut**（`cutsIncome` / `cutsExpense`）：
  - 只設支出分類（或 split）→ 收入 cut 掉
  - 只設收入分類 → 支出 cut 掉
  - 兩個都設 → 各自只看自己 cat 的 rows，兩種都顯示
- **`__none__` sentinel 同時編在 categoryId / assetIds 不可能**：URL parser 對 categories 顯式擋 `'settle'`，對 assets 接受 `__none__`
- **`payer='theirs'` 但無伴侶**：resolve 成不可能 UUID（`00000000-...`），SQL 回零行；不 throw、不 NULL-compare
- **未來 future-month tampering**：`?month=2099-01` clamp 回當月
- **stable share URL**：`fCats` / `fAssets` 序列化前 `.sort()`——同樣 filter 的 URL 是同一字串，方便雙人比對
- **stats 跟 feed 同步**：[stats](stats-design.md) 的 query 接同一份 resolved filter + dateRange；stats 卡跟 feed 永遠是同一視圖
- **by-asset breakdown 防 degenerate**：當 user 選了 1+ 個愛物，by-asset breakdown 會塌成單根 bar（沒資訊量）。MonthlyStatsSection 在那種情況自動 effective view → `'category'`，StatsBreakdownToggle 同步隱藏「愛物」option（剩單一選項時整個 toggle 隱藏）

## 元件責任

| Layer | 職責 |
|---|---|
| URL parser | `lib/filter.ts` — parse search params → `ResolvedTxnFilter` + `DateRange`；apply back to params；`matchesFilter` 供 realtime echo / SSR row-filter 使用 |
| DB query | `lib/db/queries/transactions.ts` / `lib/db/queries/incomes.ts` — 接 `ResolvedTxnFilter`（payer 已解析成 user_id）+ `DateRange`，套到 SQL；`assetIds` 含 `__none__` 時拼 `IS NULL OR IN(...)`；`monthlyStats*` 也吃同一份 filter |
| Server action | `actions/transaction.ts` / `actions/income.ts` — wire ↔ resolved 轉換（payer → user_id）；income tab 遇到 expense-only dim 時 `cutAll` |
| Server SSR | `app/(dashboard)/records/page.tsx` — 從 URL 讀 filter + dateRange → 套到 `listFeedAllPaged` → 第一頁已篩好 |
| Client | `RecordsList.tsx` — useSearchParams → 同步 filter；feed key 包含 dateRange + drill；apply → router.replace |
| UI | `FilterSheet.tsx` — 五個 section（日期 / 誰付 / 分攤 / 愛物 / 分類）+ 分享連結 |
| 替換 MonthSwitcher | `DateRangeChip.tsx` — 自訂範圍 / 全部時間時顯示，附 X 按鈕一鍵回單月 |

### Lite mode

`/dashboard` 也用 `FilterSheet`，但只要 in-memory payer / split / category——沒有 URL 同步、沒有日期範圍。透過 prop 缺省（不傳 `currentDateRange` / `assets` / `onShare`）切到 lite 模式，同一份元件同時 serve 兩條 page。

Lite mode 行為：金額範圍 + status 仍**會顯示**（它們對 cash 有意義，不依賴 URL）；日期 / 愛物 / 分享連結維持原本 lite-mode hidden。

**Dashboard mode parity（v0.16.1 #235）**：篩選按鈕在支出 / 收入兩種 mode 都顯示。收入模式的 `loadMore` 用 `useMemo` 包進 `DashboardFeed` 內，closure 帶住目前 filter ref，filter 變動時 `TransactionFeed` 既有的 refetch effect 自動重抓——expense / income 走同一條 filter wire。Sheet 顯示的維度仍依 lite-mode 規則；income 語意上 `payer → recipient`，`status` 不必顯示給使用者選但 pass-through 到 income loader 不會 break（income 永遠 settled）。

## 互動流程

```
使用者進 /records → 預設本月、無 filter
  → 點「篩選」→ FilterSheet 開啟（draft seeded from URL）
  → 改日期 / 愛物 / 分類 → 點「套用」
  → router.replace(`/records?...`) → server SSR 重渲染
  → 第一頁已篩好；分頁 loader 帶同樣 filter
  → 想分享 → 點「複製分享連結」→ window.location.origin + 同樣 URL → clipboard
  → 對方點連結 → 自己的 /records 開出同一視圖
```

## v3 增量（v0.16.0）— 愛物 sub-section 分組

純 UI 層擴充，不動 URL / 資料模型 / SQL。

### 為什麼是 UI sugar 而不是新的 `assetTemplateKey` 維度

原 #223 issue 提到 query 層加 `assetTemplateKey: 'vehicle' | 'property' | 'insurance' | 'general'`，但 [aibutsu-templates](aibutsu-templates-design.md) v1 把實際的 `asset_template_key` enum 縮到只有 `'general'` —— 那三個 template name 在 schema 裡不存在。所以走 UI sugar：

- 把 FilterSheet 的「愛物」欄位按 asset type 分組成 sub-section（車輛 / 房子 / 生命 / 物品 / 守護）
- 每個 sub-section 開頭放一顆「全選」chip，按下後把該組所有 asset uuid 加進 `fAssets` set
- 全選後再按一次 → 移除該組全部 uuid（其他組不受影響）

優點：零 schema / SQL / URL / matcher 變更；share link 保留 snapshot 語意（分享當下選的是哪幾個就是哪幾個，之後再加新愛物不會「自動納入」對方的視圖）；跟既有 `__none__` sentinel 無衝突。

缺點：全選了車輛後又新建一輛車，新車不會自動加進來（對 share-snapshot 語意是 feature；對「我永遠想看所有車」是手動 re-tap）。

### Sub-section 分組

| Group key | Asset types | Dot tint |
|---|---|---|
| `car` | `car` | `--asset-tint-car` |
| `house` | `house` | `--asset-tint-house` |
| `living` | `child`, `pet`, `plant` | `--asset-tint-child` |
| `item` | `item` | `--asset-tint-item` |
| `coverage` | `insurance` | `--asset-tint-insurance` |

排序固定為上表順序，與 /assets 頁的 section 排版一致。

`coverage` 雖然守護獨立模組概念上不算「愛物」，仍保留 sub-section：(1) 既有 transaction 可能 link 到保險 asset，移除分組會讓那些 row 在 filter UI 失去可選性；(2) 跟 /assets 頁的「守護」tab 視覺對齊。

### Empty section 收斂

沒有該類愛物的 group → 整個 sub-section 不渲染。Sheet 在新帳本上仍然乾淨：只有「未歸屬」chip + 看得到的支出/收入分類。

---

## Acceptance criteria

- /records 套上任何維度組合都能對應到 URL；複製分享連結貼到對方裝置看到同一視圖
- URL 被竄改的維度視為「無篩選」，不 crash 頁面
- Settlement / income 在不適用 filter active 時被整支 drop（不洩漏到 feed）
- stats card 跟 feed 永遠是同一視圖（套同一份 filter）
- 愛物 sub-section 全選 chip 按一下加入該組全部、再按一次移除全部
- /dashboard 的 lite mode 顯示 payer / split / category / 金額 / status，不顯示日期 / 愛物 / 分享

---

## 不做的事

- **多區間 amount filter**（e.g. 100~500 或 1000~5000）：太進階，single range 已 cover 主要使用案例
- **status 多選**：只有兩個值，多選沒比單選好用
- **負值或小數金額**：DB schema 用 integer NT$，UI 入口也不接受小數；URL 上的小數值靜默 drop
- **分散到每個 tab 各自的 filter**：所有 tab 共用同一 filter URL；切 tab 不會清掉
- **「依旅行篩選」**：等 trip 子帳本，先做日期範圍當佔位

## 後續

- **v4**：「儲存為快速視圖」並命名（e.g.「車子維修」）。需要新 schema（FilterPresets table）；不在現有版本範圍
- **與 #51 競品 CSV 匯入**：篩選結果可導出當前視圖（已有 #37 CSV 匯出，未來把 filter 帶進匯出 query）
- **與 trip 子帳本**：date range 加上「某次旅行」preset；要等 trip 模型先做完
