# Specs Index

> 一覽各 spec 文件的實作狀態。最後一次審視：**2026-05-09**（latest tag v0.12.0；recurring-expense 已合入 main，pending v0.13.0 release）。
> 詳細狀態見每份 spec 頂部 frontmatter；版本歷史見 [CHANGELOG.md](../../../CHANGELOG.md)。

## 狀態總覽

| Spec | Status | Ship 範圍 | Backlog / 卡點 |
|---|---|---|---|
| [product-design.md](product-design.md) | ✅ shipped | 持續演進的架構決策（Tech Stack / Auth 分層 / 資料模型 / Balance 規則） | — |
| [transactions-design.md](transactions-design.md) | ✅ shipped | v0.1.0 / v0.2.0 + v0.12.0（備註 #34、CSV 匯出 #37、信任宣示 #48） | — |
| [car-fuellog-design.md](car-fuellog-design.md) | ✅ shipped | v0.3.0（Slice 1）+ v0.4.0（Slice 2 FuelLog）+ v0.8.1（picker 分組）+ v0.11.4（per-type tint） | Slice 3+ 候選（電車 ChargeLog、維修保養、asset marks v2）— 暫無 issue |
| [aibutsu-design.md](aibutsu-design.md) | ✅ shipped | v0.5.0（Child + Pet + Plant）+ v0.6.0（House + Insurance）+ v0.8.1（inline 分組 + AibutsuHintCard） | — |
| [income-design.md](income-design.md) | ✅ shipped | v0.7.0（IncomeTransactions + IncomeSheet + Records 三 tab + Dashboard mode toggle） | — |
| [insurance-design.md](insurance-design.md) | ✅ shipped | v0.8.1 + v0.9.0（SavingsView 完整 framing） | Protection / Car framing 詳細 layout 留下輪 |
| [recurring-income-design.md](recurring-income-design.md) | ✅ shipped | v0.8.0 / v0.8.1 | Phase 3 候選（雙週週期、push、保險 suggest） |
| [recurring-expense-design.md](recurring-expense-design.md) | ✅ shipped to main | PR #76 / #77 / #78 closes #18，pending v0.13.0 release tag | — |
| [cloud-invoice-design.md](cloud-invoice-design.md) | ⛔ planned (blocked) | Schema 預先 seed；Phase A/B/C 全未實作 | [#16](https://github.com/redtear1115/oikos/issues/16)（APP_ID 卡點，2023/3/31 新制） |
| [offline-browsing-design.md](offline-browsing-design.md) | 🚧 partial | v0.11.1 toggle UI + preference helper | [#19](https://github.com/redtear1115/oikos/issues/19) Service Worker 實作（v0.14.0） |
| [i18n-design.md](i18n-design.md) | ✅ shipped | v0.11.1 基礎 + v0.12.0（Assets 詳情頁 #20、Settings 子頁 #21、recurring namespaces） | — |

## 圖例

- ✅ **shipped** — 設計已完整實作，spec 描述與 code 對齊
- 🚧 **partial** — 部分實作，剩餘工作有對應 issue
- ⛔ **planned** — 設計已 lock 但未動工，多半因外部依賴或排序未到
- 🗑️ **abandoned** — 已決定不做，留作歷史紀錄（目前無）

## 維護備註

- spec frontmatter 是 source of truth；本 INDEX 為導覽。
- 當功能 ship 後，先更新該 spec 的 `status` 與 `shipped_in`，再更新本 INDEX 對應行。
- backlog 條目以 GitHub issue 為主；無 issue 的候選項在 spec 內以「Slice X 候選」/「未來擴展」段保留。
