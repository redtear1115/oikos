# docgrad scorecard — oikos @ 2026-09-13

> Round 7（收官）｜docgrad 1.3.1、rubric `f46f90cc`｜資料來源 `docgrad/converge`
> round 1–4 為五維時代，總體分數不可與本輪比較

| 維度 | 星等 | 目標 | 狀態 |
|---|---|---|---|
| 完整性 | ★4 | ★4 | ✅ coverage.mjs 報 6 個 undocumented 區域，複核後 4 個是腳本假陽性（`app/api` 文件寫成 `/api`；`lib/auth` 是 cross-cutting、被 sign-in-with-apple／solo-trip／guardian 三份 spec 引用；`lib/csv` 的格式決策鎖在 csv-import-design；`lib/invoice` 有 blocked 但完整的 cloud-invoice-design）。實質缺口 2 個且都在實作層：`app/onboarding` 的 PhilosophyCards 無設計說明、`lib/realtime` 的 payload runtime validation 策略未記錄。drifted = 0 |
| 正確性 | ★2 → ★4 | ★4 | ⚠️ **初驗 6/12（★2）**，修完 13 處後重驗 12/12（★4）。累積覆蓋 **12/304 ＝ 3.9%** |
| 新鮮度 | ★4 | ★4 | ✅ 覆蓋 93.18%（41/44）；mismatch 1 筆、drift 21 天。日期集中度 58.5%（24 檔卡在 2026-07-13 的 backfill），**覆蓋率高但鑑別力有限**。★5 需 CI gate（Blocker #3）→ 設計性天花板 |
| 連結度 | ★4 | ★4 | ✅ 零死鏈、零壞錨、**零孤兒**、可達率 100%（本輪自 97.73% 補上）。★5 另需 `path › symbol()` 抗漂移錨點，現況仍混用 `path:line`（如 `CLAUDE.md:75` 的 `LandingCtaLink.tsx:45`） |
| 一致性 | ★4 | ★4 | ✅ 本輪未發現新矛盾。未達 ★5：`Trips 強制單一 epoch` 等主題仍雙處全展開；無明文衝突仲裁慣例 |
| 經濟性 | ★3 | ★3 | ✅ 固定成本 8,896 tokens、污染面 5.89%。★5 需 CI gate → 設計性天花板 |

## 正確性：這一輪真正發生的事

round 6 的 notes 寫「ledger 16/16」，但 `.docgrad/ledger.jsonl` **從未被建立**——所以那個數字無從重驗，
本輪只能從零重抽。新抽的 12 條初驗只過一半，失分**全部集中在同一種段落**：spec 的「實作落地點」路徑／符號清單。

抽樣本身抓不完這類錯（12 條裡踩到 6 條，純屬密度高）。所以本輪改用機械掃描補盲區：

- **路徑引用 263 個** → 真正斷掉 3 個（其餘是相對寫法、外部 API、未來式假設）
- **符號引用 277 個** → repo 內查無 46 個，逐一定性後 **13 個是漂移**，其餘是刻意保留的「已否決方案名」（`assetTemplateKey`、`confirmedAt`）、未來式（`TransactionInbox`、`PersonaDef`、`paybackCycleYears`）、色碼與外部 API 欄位

**結論：路徑漂移沒有蔓延，符號漂移有。** 路徑錯了肉眼看得出來，符號錯了要打開 code 才知道。

### 修掉的 13 處

| 檔案 | 文件寫 | 實際 |
|---|---|---|
| onboarding:85 | `app/sign-in/page.tsx`、`actions/groupInvites.ts` | `app/[locale]/sign-in/page.tsx`、`actions/invite.ts` |
| locale-currency:141 | Provider 接入點含 `app/sign-in/page.tsx` | 全 repo 只有 `app/(dashboard)/layout.tsx` mount `TranslationsProvider` |
| locale-currency:149,156 | `actions/group.ts#setBaseCurrency` | `actions/currency.ts#setBaseCurrency` |
| offline-browsing:156 | `OfflineBanner.tsx` | 已併入 `ContextStrip.tsx` 的 priority-1 分支，元件不存在 |
| ia-unified-header:71,72,82,106 | `OfflineBanner` / `PastEpochBanner` 「目前掛在 layout」 | #617 已刪除；改為 `ContextStrip` + `PastChapterBar` |
| savings-view:46,164 | `lib/insurance.ts → heroSubCopy` | `SavingsHero.tsx › computeSub()`；`lib/insurance.ts` 只有 `getFramingGroup` / `payCycleMonths` / `computeNextPaymentDate` |
| car-fuellog:127 | `lib/fuelEcon.ts`（avgFuelEcon 計算） | `singleEcon()` / `computeAvgEcon()`；名為 `avgFuelEcon` 的那份在 `lib/db/queries/fuelLog.ts#getCarHeroStats` |
| transactions:42 | `lib/db/queries/transactions.ts → suggestDescriptions()` | `actions/transaction.ts › getDescriptionSuggestions()`（server action，不在 query 層） |
| monthly-review:106 | `monthlyLargestExpense` / `monthlyRecurringEvents` | `largestExpense*` / `recurringEvents` |
| stats:103 | `monthStart` / `nextMonthStart` | `lib/monthKey.ts › monthRangeIso()` → `{ startIso, endIso }` |
| account-deletion:15 | `sectionRights` / `sectionRetention` | i18n key 是 Title/Body 對 |
| avatar-quick-settings:95 | `displayedSplit` | `SplitTypeSection.tsx` 的區域變數 `displayed` |
| csv-import:258 | `public/import-templates/` | `public/` 根目錄，連結定義在 `lib/migrate/sources.ts` |

### ★4 的可信度邊界（必讀）

這個 ★4 **建立在重驗同一批 12 條之上**。累積覆蓋 3.9%，而上一輪在同樣「已達標」的狀態下，
重抽立刻掉到 50%。**低覆蓋率下的高通過率不是品質訊號，是取樣訊號。**
要讓這個星等站得住，需要的是再跑幾輪抽樣（ledger 會累積不重抽），不是再修文件。

## Token 經濟報告

- **固定成本：8,896 tokens**（`entry_files: CLAUDE.md`）。距 ★2 門檻（10,000）只剩 1,104 tokens。
  **另有掃不到的部分**：repo 外的 `freedom-project/CLAUDE.md`（約 993 tokens）同樣每次載入，真實固定稅約 **9,889**——離 ★2 只剩約 111 tokens
- **邊際成本**：`lib/i18n` 30,828 / depth 1 / fan_in 6 / code_pointer yes / **churn 24 ← 稅最重**；
  `lib/balance.ts` 32,136 / 1 / 4 / no / 0；`actions/transaction.ts` 17,712 / 1 / 2 / yes / 0；`app/(dashboard)/trips` 8,890 / — / 0 / no / 2
- **污染面：5.89%**（`docs/superpowers/plans/`，1 檔 8,175 tokens，已 gitignore + exclude）
- **解讀**：索引 1 跳到位，沒有多跳檢索成本——問題不在配置，在入口檔本身的體積

### CLAUDE.md 段落成本（要降固定稅就看這張表）

| 段落 | tokens | 佔比 |
|---|---|---|
| Domain Model 速查 | ~3,068 | 34% |
| 架構速查 | ~1,894 | 21% |
| AI 開發協作規則 | ~887 | 10% |
| 設計脈絡（Impeccable） | ~733 | 8% |
| 品牌文案準則 | ~659 | 7% |
| 三平台架構 | ~507 | 6% |
| 其他 10 段合計 | ~1,405 | 15% |

前兩段佔 55%。依 docgrad `reference/placement.md` 規則 1
（entry file ＝每個任務都要遵守**且**篇幅極小），3,068 tokens 的 entity 目錄不滿足「篇幅極小」，
而它只有動資料模型時才需要。搬進 `docs/` 並從 INDEX 連得到，可同時滿足經濟性與完整性／連結度
（**搬移不是刪減**，刪掉仍正確仍被需要的內容是 improve.md 明文禁止的）。

### 可回溯性（report-only，不計星）

- `code_pointer_ratio` **31.8%**。最刺眼：`app/(dashboard)` 226 檔、11 份 spec 指向它，code 裡零指標
- `index_hotness` ratio 2.5（`CLAUDE.md` 32 commits/90d vs docs 中位數 2）
- `structure.rules` 全域 `anchored_ratio` 0.075。偏長：`migrate-pages-design`（med 213.5）、`CLAUDE.md`（med 162 / p90 315）

## 職權外事項（`out-of-scope.jsonl`，status: open ＝ 2 筆）

1. `components/CsvFileUploadWidget.tsx:86` — 預設 `accept='.csv,text/csv'`，但 pipeline 支援 `.ofx`/`.qif`/`.txt`（#586）。
   檔案選擇器選不到那三種，只有拖放進得來。**文件沒寫錯，是 code 少跟上**
2. `lib/db/queries/fuelLog.ts:132` — `getCarHeroStats()` 內嵌一份平均油耗計算，與 `lib/fuelEcon.ts#computeAvgEcon`
   是兩份獨立實作；公式若改只會有一邊被改到

（round 3 回報的 `lib/supabase/server.ts` docstring 已於後續 commit 修好，本輪標記 resolved）

## docgrad 自身的盲區（需使用者裁決，本輪未動）

`.docgrad.yml` 的 `docs_dirs: [docs/]` 把 root 層的 **`PRODUCT.md`（17KB）與 `DESIGN.md`（32KB）排除在語料外**，
但 `CLAUDE.md:315` 明文要求「任何 UI／視覺工作開始前先讀這兩份」。**約 49KB 的權威文件從未被評分過**——
沒有新鮮度訊號檢查、沒有死鏈檢查、沒有 claim 抽樣。

把它們納入 `docs_dirs` 會改變所有維度的分母（跨輪不可比），且很可能讓數個維度下修。
這是取捨不是疏漏，**由你決定**：納入＝分數會掉但覆蓋真實；不納入＝分數好看但兩份必讀文件在評分外。

## 收官

六維全數達標（新鮮度 ★5、經濟性 ★5 已判設計性天花板 —— 兩者的 ★5 錨點都要求機械 gate，
而 Blocker #3 明訂不碰目標 repo 的 CI）。loop 停止。

已產出 `.docgrad/graduation/docs-gate.mjs` 與 `docs-gate.yml`，**未安裝**。
要啟用：把 `.mjs` 放到 `.github/scripts/`、`.yml` 放到 `.github/workflows/`，兩者都已按本 repo 現況設好門檻
（死鏈 0／壞錨 0／孤兒 0／新鮮度覆蓋 ≥0.93／入口檔 ≤9,000 tokens）。gate 只擋這五項——嚴格度由團隊決定。

死鏈與格式也可改用更成熟的現成工具（lychee 或 markdown-link-check、markdownlint、Vale）。
docgrad 腳本的差異化價值在孤兒／可達性與入口檔 token 預算——這兩個是「文件作為 agent context」
特有的量測，一般 docs linter 不做。

**但這一輪的證據指向一個 gate 擋不住的東西**：13 處符號漂移沒有一個會被死鏈或 token 預算抓到。
唯一能機械偵測它的是「文件裡反引號包住的符號，去 code 裡 grep 得到嗎」——
本輪用的兩支一次性掃描腳本在 `docs-gate` 裡沒有對應項，值得自行補上。
