# docgrad scorecard — oikos @ 2026-09-13

> Round 5（v1.0.0 六維基線重起算；round 1–4 為五維時代，總體分數不可比）

| 維度 | 星等 | 目標 | 主要失分點 |
|---|---|---|---|
| 完整性 | ★4 | ★4 | CSV **匯出**（`app/api/export` + `lib/csv`）無 spec；授權層 `lib/auth` 零文件。drifted = 0 |
| 正確性 | ★4 | ★4 | ledger 16/16（12 條原樣本 + 4 條全新抽樣）。未達 ★5：`epochClause` 盤點在 CLAUDE.md 被複述，非 refer-to-code |
| 新鮮度 | ★4 | ★4 | 覆蓋 93.18%（`CLAUDE.md` / `ops-runbook.md` / `utm-convention.md` 無 `last_updated`）；1 筆 mismatch drift 21 天 |
| 連結度 | ★4 | ★4 | 零死鏈、零壞錨；孤兒 1（`docs/utm-convention.md`，2.3%）、可達率 97.73% |
| 一致性 | ★3 | ★4 | `[重複]` `epochClause` call-site 盤點同時活在 `CLAUDE.md:149` 與 `lib/db/queries/balance.ts` docstring，兩處無互鏈 |
| 經濟性 | ★3 | ★3 | 固定成本 8,788 tokens、污染面 5.91% — **已達標** |

## Token 經濟報告
- 固定成本：8,788 tokens（`entry_files: CLAUDE.md`）— 已計星
- 邊際成本（scenarios 機械計算）：`lib/i18n` 30,550 / depth 1 / fan_in 6 / code_pointer yes / **churn 24 ← 稅最重**；`lib/balance.ts` 31,820 / 1 / 4 / no / 0；`actions/transaction.ts` 17,573 / 1 / 2 / yes / 0；`app/(dashboard)/trips` 8,751 / — / 0 / no / 2
- 污染面：5.91%（`docs/superpowers/plans/`）— 已計星
- 解讀：入口檔不貴、索引 1 跳到位，沒有多跳檢索成本。問題在指路不在配置。`lib/i18n` 常碰又貴且無單一權威；`app/(dashboard)/trips` 相反——0 份 doc 錨定，而 `trip-multi-currency-design.md` 明明在講它卻沒指名目錄。

### 可回溯性（report-only）
- `code_pointer_ratio` 31.8%（22 個 area 僅 7 個 code 指得回 docs）。最刺眼：`app/(dashboard)` 226 檔、11 份 spec 指向它，code 裡零指標
- `index_hotness` ratio 2.5（CLAUDE.md 30 commits/90d vs docs 中位數 2）
- `structure.rules` 全域 `anchored_ratio` 0.069。偏長：`migrate-pages-design`(med 213.5/p90 291)、`CLAUDE.md`(163/311)、`onboarding-design`(146)

## 建議下一步
最低分維度＝**一致性 ★3**（唯一未達標）。失分點：
1. `[重複]` `epochClause` 盤點兩處各自展開，無互鏈 — 建議 CLAUDE.md 改為指標、不複述數字（權威留在 `balance.ts` docstring，漂移風險最低）
