# docgrad scorecard — oikos @ 2026-09-13

> Round 8｜docgrad 1.3.1、rubric `f46f90cc`｜資料來源 `docgrad/converge` @ 453de28
> round 1–4 為五維時代，總體分數不可與本輪比較

本輪的觸發點是 main 合入四個 PR（#1077 docs 健檢腳本、#1078 自架字型、#1080 docgrad 收斂、
#1082 授權／CSV 匯出兩份新 spec）。round 7 收官時六維全數達標，本輪要回答的是「合入之後還成立嗎」。

| 維度 | 星等 | 目標 | 狀態 |
|---|---|---|---|
| 完整性 | ★4 | ★4 | ✅ undocumented 從 round 7 的 6 個（4 個假陽性）降到 **1 個真缺口**：`app/fonts`（#1078 新增，2 檔）。drifted = 0 |
| 正確性 | ★2 → ★4 | ★4 | ⚠️ **初驗 9/12（75% ＝ ★2）**，修完 3 處後重驗 12/12（★4）。累積覆蓋 **18/319 ＝ 5.6%** |
| 新鮮度 | ★4 | ★4 | ✅ 覆蓋 93.48%（43/46）、mismatch 1 筆 drift 21 天。日期集中度 48.8%（21 檔卡在 2026-07-13 backfill）——**覆蓋率高但鑑別力有限**。★5 需 CI gate（Blocker #3）→ 設計性天花板 |
| 連結度 | ★4 | ★4 | ✅ 225 條連結：零死鏈、零壞錨、零孤兒、可達率 100%。★5 另需 `path › symbol()` 抗漂移錨點，現況仍混用 `path:line` |
| 一致性 | ★4 | ★4 | ✅ 四個主題跨文件比對無矛盾。未達 ★5：`csv-export-design.md:53` 把「查詢層不驗 membership」完整展開一次（附權威連結，算摘要例外但偏長）；仍無明文衝突仲裁慣例 |
| 經濟性 | ★3 | ★3 | ✅ 固定成本 9,037 tokens、污染面 5.73%。★5 需 CI gate → 設計性天花板 |

## 正確性：這一輪真正發生的事

12 條驗證＝6 條重驗既有 ledger（`pass` 取偶數位）＋ 6 條新抽（消費 `claim_candidates` 穩定排序）。
**三條 fail，而且性質跟 round 7 不同**——round 7 是路徑／符號漂移（改名、刪檔），本輪三條都是
**「文件描述了一個從未存在或已不存在的行為」**，讀文件的人不會起疑，因為句子本身完全合理。

| # | 文件 | 文件寫 | 實際 |
|---|---|---|---|
| 1 | `realtime-design.md:43` | 訂閱 9 張表 | code 訂閱 **10 張**，漏的是 `FuelLogs`（`RealtimeProvider.tsx:135`）。而且漏掉的正是最特殊的一張：它**沒有** `group_id` filter，靠 RLS policy `fuel_logs_member_select` 收斂 |
| 2 | `csv-import-design.md:140` | 「客戶端檔案大小上限：2 MB」 | repo 內**從未實作**任何大小檢查（`2097152` / `maxSize` / `file.size` 全 repo 無）。大檔的行為是瀏覽器 parse 到卡住 |
| 3 | `csv-import-design.md:256-259` | `/settings` 匯入頁提供通用 CSV 範本與 Excel 模板下載 | 匯入頁**沒有任何範本 UI**；範本的真實入口是 migrate 頁，而且 registry 裡只有 cwmoney 有 `templateDownload` |

第 1 條是「少列一張表」——但少列的那張正好是唯一的例外情況，所以漏掉的不是一行資料，是一條
安全邊界的解釋。第 2、3 條同一個形狀：**spec 寫的是當初打算做的，沒有人回來標記它沒做／改做別的。**

### 副檔名那條為什麼仍記 pass

`csv-import-design.md:139`「支援 .csv / .txt / .ofx / .qif」被 scout 判 fail（檔案選擇器只開 `.csv`），
但 round 7 已經裁決過同一件事：**parser pipeline 確實支援四種，是 `CsvFileUploadWidget.tsx:86` 的
`accept` 預設值沒跟上**，已記在 `out-of-scope.jsonl`（round 7，仍 open）。沿用該裁決記 pass，
但本輪把「選擇器只開 .csv、後三種只有拖放進得來」寫進 spec——否則每一輪都會重新觸發同一個假陽性。

## Token 經濟報告

- **固定成本：9,037 tokens**（`entry_files: CLAUDE.md`）— 已計入經濟性。落在 ★3 帶（>5,000 且 ≤10,000），
  距離 ★4 的 5,000 門檻還有 4,000 tokens 的差距。**本輪未動它**：能搬的都搬過了（round 6 已把
  balance 正負號與 epochClause call-site 盤點改成指標），剩下的是 domain model 速查與觀測邊界，
  兩者都真的每個任務都會用到。
- **邊際成本**（report-only，`scenarios:` 四條）：

  | scenario | marginal_tokens | max_depth | fan_in | code_pointer | churn_90d |
  |---|---|---|---|---|---|
  | `lib/i18n` | 31,381 | 1 | 6 | yes | **25** ← 稅最重 |
  | `lib/balance.ts` | 32,655 | 1 | 4 | no | 0 |
  | `actions/transaction.ts` | 20,036 | 1 | 3 | yes | 0 |
  | `app/(dashboard)/trips` | 9,037 | — | 0 | no | 2 |

  `lib/i18n` 是唯一 churn 高又 fan_in 高的——6 份 doc 各自提到它，每次改 i18n 都要付
  31k tokens 的檢索稅。但 `max_depth` 只有 1 跳，結構上沒有問題，成本來自 fan_in 本身。
  `app/(dashboard)/trips` 的 `fan_in = 0` 是腳本的路徑比對限制（trip 的 spec 寫的是
  `docs/superpowers/specs/trip-multi-currency-design.md` 但引用的是 `Trips` 表而非該目錄路徑），
  不是真的沒文件。
- **污染面：5.73%**（exclude: `docs/superpowers/plans/` 一檔 8,175 tokens）— 已計入經濟性。
- **解讀**：固定成本九千字是「每個任務都付」的稅，四條 scenario 的邊際成本都在 20k–33k。
  以 oikos 的任務組成（大量單一 surface 的 feature 工作）來看，目前的分配是對的——
  CLAUDE.md 擋住了「不知道該去哪找」的成本，而索引只有 1 跳。要再降固定成本只能刪內容，
  而剩下的內容都還在用。

### 可回溯性（report-only）

- **`code_pointer_ratio`：95.65%**（22/23 area）。唯一缺口 `app/fonts`——與完整性的缺口是同一個。
- **`index_hotness`：ratio 2.33**（CLAUDE.md 90 天 37 commits vs 全 docs 中位數 3）。
  top5：`CLAUDE.md` 37、`docs/app-store-submission-runbook.md` 17、`docs/store-assets/README.md` 7、
  `INDEX.md` 7、`docs/app-store-listing.md` 6。ratio < 3，尚未到「索引混進了該由子文件揭露的內容」的程度。
- **`structure.rules`：整體 `anchored_ratio` 僅 8.28%**（326 條規則行只有 27 條帶 code 座標）。
  median_chars 沒有任何一檔超過 300（最長 `migrate-pages-design.md` 213.5），所以**不建議拆
  契約層／細節層**——問題不是規則行太長，是規則行沒有 code 落點。帶座標比例最高的是
  `authorization-design.md`（1.0）與 `CLAUDE.md`（0.317），其餘多數是 0。

## 職權外事項（docgrad 修不了的）

`status: open` 共 **3 筆**：

| round | kind | 位置 | 事由 |
|---|---|---|---|
| 7 | other | `components/CsvFileUploadWidget.tsx:86` | `accept` 只開 `.csv`，pipeline 支援的 `.ofx` / `.qif` / `.txt` 選不到，只有拖放進得來 |
| 7 | other | `lib/db/queries/fuelLog.ts:132` | `getCarHeroStats()` 內嵌一份平均油耗計算，與 `lib/fuelEcon.ts#computeAvgEcon` 是兩份獨立實作 |
| 8 | other | `public/bank-statement-template.xlsx` | 模板 ship 了、build 腳本也在，但**全 repo 沒有任何連結指向它**，使用者拿不到 |
| 8 | other | `components/CsvFileUploadWidget.tsx` | spec 原訂 2 MB client 上限，從未實作 |

（round 3 的 `lib/supabase/server.ts` docstring 已於 round 7 確認 resolved。）

## 建議下一步

六維全數達標（經濟性 target ★3 已滿足；新鮮度與經濟性的 ★5 因 Blocker #3 判設計性天花板）。

剩下唯一的機械缺口是 **`app/fonts` 無文件**——2 個檔，#1078 自架 Google Fonts 引入。
它同時是完整性與 `code_pointer_ratio` 的唯一失分點。以 rubric 的完整性錨點來說，
單一邊緣模組缺文件仍是 ★4，所以它不影響達標；但下一次有人動字型設定時，
`scripts/fetch-google-fonts.mjs` 與 `scripts/verify-font-refs.sh` 的存在只能靠翻 git log 發現。
