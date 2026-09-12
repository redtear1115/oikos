# docgrad scorecard — oikos @ 2026-09-13

> Round 6（收官）｜v1.0.0 六維基線；round 1–4 為五維時代，總體分數不可比

| 維度 | 星等 | 目標 | 狀態 |
|---|---|---|---|
| 完整性 | ★4 | ★4 | ✅ 達標。剩餘缺口：CSV **匯出**（`app/api/export` + `lib/csv`）無 spec；授權層 `lib/auth` 零文件。drifted = 0 |
| 正確性 | ★4 | ★4 | ✅ 達標。ledger 16/16。未達 ★5：仍有權威列表未完全 refer-to-code |
| 新鮮度 | ★4 | ★4 | ✅ 達標。覆蓋 93.18%（`CLAUDE.md` / `ops-runbook.md` / `utm-convention.md` 無 `last_updated`）；1 筆 mismatch drift 21 天。★5 需 CI gate（Blocker #3） |
| 連結度 | ★4 | ★4 | ✅ 達標。零死鏈、零壞錨；孤兒 1（`docs/utm-convention.md`）、可達率 97.73% |
| 一致性 | ★4 | ★4 | ✅ 達標。零矛盾；重疊處皆有互鏈。未達 ★5：`Trips 強制單一 epoch` 等主題仍雙處全展開；無明文衝突仲裁慣例 |
| 經濟性 | ★3 | ★3 | ✅ 達標。固定成本 8,890 tokens、污染面 5.90% |

## Token 經濟報告
- 固定成本：8,890 tokens（`entry_files: CLAUDE.md`）。**注意**：repo 外的 `freedom-project/CLAUDE.md`（約 993 tokens）同樣每次載入但 docgrad 掃不到 — 真實約 9,883，距 ★2 門檻（10,000）僅剩約 117 tokens
- 邊際成本：`lib/i18n` 30,550 / depth 1 / fan_in 6 / code_pointer yes / **churn 24 ← 稅最重**；`lib/balance.ts` 31,820 / 1 / 4 / no / 0；`actions/transaction.ts` 17,573 / 1 / 2 / yes / 0；`app/(dashboard)/trips` 8,751 / — / 0 / no / 2
- 污染面：5.90%（`docs/superpowers/plans/`）
- 解讀：索引 1 跳到位，無多跳檢索成本。問題在指路不在配置。

### 可回溯性（report-only）
- `code_pointer_ratio` 31.8%。最刺眼：`app/(dashboard)` 226 檔、11 份 spec 指向它，code 裡零指標
- `index_hotness` ratio 2.5（CLAUDE.md 30 commits/90d vs docs 中位數 2）
- `structure.rules` 全域 `anchored_ratio` 0.069。偏長：`migrate-pages-design`(med 213.5)、`CLAUDE.md`(163)、`onboarding-design`(146)

## 收官
六維全數達標，loop 停止。畢業建議見 round-6 commit message 與收官報告。
