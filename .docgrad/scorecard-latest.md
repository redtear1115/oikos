# docgrad scorecard — oikos @ 2026-07-13（第 4 輪後：達標收官）

| 維度 | 星等 | 目標 | 備註 |
|---|---|---|---|
| 完整性 | ★4 | ★4 | 邊緣缺口（不擋 ★4）：`supabase/functions/`、`scripts/` 無專屬文件 |
| 正確性 | ★4 | ★4 | 第 3 輪 ★3→★4。auth 分層對齊 code（v1.0.2 #494）；ledger 8/8 |
| 新鮮度 | ★4 | ★4 | 第 1 輪 ★1→★4。coverage 95.1%（39/41）、零 stale、零 mismatch；慣例：改內容同 commit 更新 `last_updated` |
| 連結度 | ★4 | ★4 | 第 4 輪 ★3→★4。零死鏈、零孤兒、reachable 100% |
| 一致性 | ★4 | ★4 | 第 2 輪 ★2→★4。swap/epoch 矛盾依 code 仲裁修正 |

## Token 經濟（不計星）

- 固定成本：~7,210 tokens（CLAUDE.md 4,881 + README 2,329）
- 邊際成本（scenario「記帳核心加新功能」）：~6,400 tokens（specs/INDEX.md → transactions-design.md → product-design.md）
- 污染面：13.5%（docs/superpowers/plans/ 17.9k tokens，已 gitignore + exclude）
- 解讀：固定/邊際比例健康；若要降固定稅，README 是第一候選（多數內容為指令/部署查表，可改由 CLAUDE.md 指路）

## 殘留事項（★5 範疇或 docgrad 職權外）

- `lib/supabase/server.ts` 的 `getCurrentUser` docstring stale（仍寫 "without an Auth API round-trip"）——code 修正不在 docgrad 職權，建議另開小 PR
- ★5 缺口：新鮮度機械 gate、明文衝突仲裁慣例、`path › symbol()` 抗漂移錨點

## 畢業建議

建議把可機械化的規則沉澱成本 repo 自己的 docs-gate CI（死鏈/孤兒/新鮮度/入口檔 token 預算），
docgrad 的三支 scripts（inventory/links/freshness）可直接搬去改造。docgrad 只評分與修內容，
不代寫 CI——由團隊自行決定 gate 的嚴格度。
