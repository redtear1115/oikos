# docgrad scorecard — oikos @ 2026-07-13（第 2 輪後）

| 維度 | 星等 | 目標 | 主要失分點 |
|---|---|---|---|
| 完整性 | ★4 | ★4 | 達標。邊緣缺口：`supabase/functions/`、`scripts/` 無專屬文件 |
| 正確性 | ★3 | ★4 | Ledger 7/8（87.5%）。fail：product-design.md 稱 `getCurrentUser()`「內部 `getSession()`」，實作是 `auth.getUser()`（lib/supabase/server.ts；code docstring 也自相矛盾） |
| 新鮮度 | ★4 | ★4 | 達標（本輪 ★1→★4）。coverage 95.1%（39/41，entry 檔不計）、零 stale、零 mismatch。★5 需機械 gate（畢業建議範疇） |
| 連結度 | ★3 | ★4 | 2 死鏈：INDEX.md:102 格式範例 `[spec key](file)` 未 escape；csv-import-design.md:59 → 不存在的 `csv-import-research.md`。孤兒 1：payment-provider-research.md |
| 一致性 | ★4 | ★4 | 達標（第 2 輪 ★2→★4）。swap/epoch 矛盾已依 code 仲裁修正；抽查主題全一致、重疊處有互鏈。★5 需明文衝突仲裁慣例 |

## Token 經濟（不計星）

- 固定成本：~7,210 tokens（CLAUDE.md 4,881 + README 2,329）
- 邊際成本（scenario「記帳核心加新功能」）：~6,400 tokens（specs/INDEX.md → transactions-design.md → product-design.md）
- 污染面：13.5%（docs/superpowers/plans/ 17.9k tokens，已 gitignore + exclude）
- 解讀：固定/邊際比例健康；README 是降固定稅的第一候選（多數內容為指令/部署查表，可改由 CLAUDE.md 指路）

## 下一輪

最低分維度＝正確性（★3，rubric 順序先於連結度）：修 product-design.md 的 `getSession()` stale 敘述。
