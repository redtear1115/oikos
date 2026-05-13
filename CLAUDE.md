# Oikos — Agent Guide

> 家庭記帳工具，對使用者顯示為 **Futari**；codebase 用 Oikos。
> 固定兩人（夫妻／伴侶）使用。Mobile-first PWA。

---

## ⚠️ Next.js 版本提醒

This is **Next.js 16** with breaking changes. APIs, conventions, and file structure differ from your training data. Read `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## 目前狀態

**Latest released: v0.16.0**（tag on origin）— prod migration 狀態獨立追蹤。完整版本歷史見 [CHANGELOG.md](CHANGELOG.md)

| 版本 | 範圍 |
|---|---|
| [v0.1.0](CHANGELOG.md#010---2026-05-03) | 登入與基礎．兩個人的全新開始 |
| [v0.2.0](CHANGELOG.md#020---2026-05-03) | 獨處模式與啟程．先一個人也是日子 |
| [v0.3.0](CHANGELOG.md#030---2026-05-05) | 愛物概念與車．也住進兩個人的家 |
| [v0.4.0](CHANGELOG.md#040---2026-05-05) | 加油與油耗紀錄．累積每次出門軌跡 |
| [v0.5.0](CHANGELOG.md#050---2026-05-05) | 孩子寵物與植物．生命都是發光的 |
| [v0.6.0](CHANGELOG.md#060---2026-05-06) | 家屋與保險加入．家也是一道光 |
| [v0.7.0](CHANGELOG.md#070---2026-05-06) | 進帳與收入記錄．進帳帶來快樂 |
| [v0.8.0](CHANGELOG.md#080---2026-05-07) | 自訂定期收入．不必再記住薪水 |
| [v0.8.1](CHANGELOG.md#081---2026-05-08) | 細節與一致性．細節讓陪伴更近 |
| [v0.9.0](CHANGELOG.md#090---2026-05-08) | 儲蓄險詳情頁．累積也看得見 |
| [v0.10.0](CHANGELOG.md#0100---2026-05-08) | 加密與安全強化．把秘密好好守著 |
| [v0.11.1](CHANGELOG.md#0111---2026-05-08) | i18n 四語架構．換種語言也說得通 |
| [v0.11.2](CHANGELOG.md#0112---2026-05-08) | 效能優化．切換之間更輕快 |
| [v0.11.3](CHANGELOG.md#0113---2026-05-08) | SEO 基礎建設．讓世界找得到 |
| [v0.11.4](CHANGELOG.md#0114---2026-05-09) | 愛物分色標識．每種愛都有自己的光 |
| [v0.12.0](CHANGELOG.md#0120---2026-05-09) | 陪伴 × 信任．把陪伴的細節都收下 |
| [v0.13.0](CHANGELOG.md#0130---2026-05-09) | 陪伴 × 起點 × 定期支出．第一步、第一筆，到不必再記住 |
| [v0.13.1](CHANGELOG.md#0131---2026-05-09) | 啟程之前的鋪陳．哲學卡先說我們的承諾 |
| [v0.14.0](CHANGELOG.md#0140---2026-05-10) | 沒有訊號的時候，也還看得見．本月攤開來看一次，斷線了也記得 |
| [v0.14.1](CHANGELOG.md#0141---2026-05-10) | 分擔可以不對半．依比例分 + UI 細修 + SW 修補 |
| [v0.14.2](CHANGELOG.md#0142---2026-05-11) | 紀錄可以更貼手．自動完成 + 點選即篩選 |
| [v0.15.0](CHANGELOG.md#0150---2026-05-12) | 離開也保留陪伴．pending 收斂 |
| [v0.15.1](CHANGELOG.md#0151---2026-05-12) | 陪伴每處小細節更貼手．光的指認也更一致 |
| [v0.15.2](CHANGELOG.md#0152---2026-05-13) | 問答、跨章節與守護的下一步．PartnerQuiz × 保險併入守護 × past-times 跨 group |
| [v0.15.3](CHANGELOG.md#0153---2026-05-13) | 章節邊界長進結構裡．過去章節變唯讀 + 投資型保單帳戶價值 |
| [v0.16.0](CHANGELOG.md#0160---2026-05-13) | 守護成為自己的模組．物品也記得進來．設定頁長出新分組 |

## Backlog / 未釋出版本

`v0.x` 每版工時目標 ~2 週；`v1.0.0+` 是 phase 級別範圍，工時不固定。主題敘事用來決定 changelog 文案與 release 重點。每個版本對應一個 GitHub milestone — 詳細 issues 進度看 milestone 頁面，不在本檔維護。

| 版本 | 主題 |
|---|---|
| [v1.0.0](https://github.com/redtear1115/oikos/milestone/1) | 公開 landing．接住歷史 |
| [v2.0.0](https://github.com/redtear1115/oikos/milestone/2) | 買斷層．長線一起守 |
| [v3.0.0](https://github.com/redtear1115/oikos/milestone/3) | 訂閱層．AI 與資產管家 |

→ 沒指派 milestone 的候選：[no-milestone issues](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+no%3Amilestone) · [`backlog` 標籤](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+label%3Abacklog)

---

## 市場觀察 / 戰略背景

兩份外部分析（2026-05-09 snapshot）解釋了 backlog 多個 issue 的優先序與設計立場。將來實作時翻回去能理解「為什麼這個時間點做、為什麼這樣做」。

| 觀察 | 影響的決策 |
|---|---|
| **Honeydue 衰退是時間窗口** — 2024 已剝離成 Moneydue Inc.、剩 1–10 人、客服失聯 | #51（競品 CSV 匯入）的 short-term 急迫性 |
| **台灣反訂閱文化** — PTT/Dcard 反覆出現「可接受買斷、不接受訂閱」訊號；CWMoney/MOZE 訂閱被批 | #46 定價 RFC 必須認真評估買斷選項 |
| **「資料會不會消失」是底層焦慮** — Spendee 曾刪用戶資料 + Honeydue 衰退用戶焦慮 | #48 信任宣示頁列為 short-term；CSV 匯出（#37）信任配套 |
| **「信任作為設計前提」vs「能見度管理」是根本立場** — Honeydue 的帳戶能見度分級是防禦性假設 | **Futari 不會做**帳戶能見度分級 — 不記的東西不要記，進到 Futari 的就是兩人共同的 |
| **Futari positioning：雙人優先 × 陪伴 × 愛物** — 競品象限分析顯示這是目前空白象限 | 整體產品的核心賭注，影響功能取捨優先序 |

→ 完整分析：[oikos-competitive-analysis.md](docs/superpowers/oikos-competitive-analysis.md) · [user-feedback-analysis.md](docs/superpowers/user-feedback-analysis.md)

---

## 架構速查

```
寫入路徑：Client → Server Action → Drizzle → Supabase Postgres
讀取路徑：Server Component → Drizzle → Postgres
Realtime：Client subscribes → React state mutation
```

- Server Actions：`actions/`
- DB queries：`lib/db/queries/`
- Validators：`lib/validators.ts`
- Realtime：`app/(dashboard)/_components/RealtimeProvider.tsx`
- i18n：`lib/i18n/`（server `getTranslations()` → dashboard layout `<TranslationsProvider>` → client `useTranslations()`；cookie-based locale，4 語）
- Schema：`lib/db/schema.ts`
- Migrations：`drizzle/`
- Specs：`docs/superpowers/specs/`

### Balance 計算規則

- 金額單位：台幣整數（integer，無小數）
- 每次寫入後全量重算，cache 在 `GroupBalance`
- 計算實作：`lib/balance.ts` + `lib/db/queries/balance.ts`
- GroupBalance 欄位 `balance` = member_a 欠 member_b 的金額（正數 = A 欠 B，負數 = B 欠 A）

### 編輯模式

「編輯」= soft delete + insert（atomic DB transaction）。DB 層不支援 UPDATE。`deleted_at` 超過 1 年由 pg_cron 物理刪除。

---

## Domain Model 速查

> Schema 真相在 `lib/db/schema.ts`，這裡只說「entity 是什麼 + 怎麼接」。

### 主要 entity

- **`OikosGroups`（Group）** — 兩人帳本本體。`member_a` notNull / `member_b` nullable（solo 模式 = `member_b IS NULL`）。`current_epoch_started_at` 標記目前章節起點；`default_split_ratio_a` 為 group 預設依比例分；`guardian_beta_enabled` 控制守護模組可見性（單一閘門 `lib/guardian.ts#canAccessGuardian`，將來付費層 cut-over 只動該函式）。
- **`Profiles`（OikosUser）** — mirror `auth.users.id` 的使用者 profile（displayName / avatar / `default_split_type`）。
- **`GroupEpochs`** — 關係章節歷史。每個 group 同時間恰好一筆 `endedAt IS NULL`（current epoch）；swap 不開新 epoch、leave 才會關舊開新。`/records` / stats / dashboard 預設只看當前 chapter，`/past-times` 翻歷史。
- **`CashTransactions`** — 核心支出紀錄。`group_id` + `paid_by` + `amount` + `split_type`（`all_mine` / `all_theirs` / `half` / `weighted`）+ `category` + optional `asset_id` / `fuel_log_id`。`status: 'settled' | 'pending'`（pending 不計入 balance）。
- **`IncomeTransactions`** — 進帳紀錄。`recipient_id` + `category`（獨立 income category）+ optional `asset_id`；不進 balance。
- **`Settlements`** — 還款紀錄。`paid_by` 給對方的金額，反向影響 balance。
- **`GroupBalance`** — balance cache（per-group 單列）。`balance` 正數 = A 欠 B、負數 = B 欠 A；每次寫入後由 `lib/balance.ts` 全量重算。
- **`Assets`（愛物）** — 共用 base table（`type` enum: `car` / `house` / `child` / `pet` / `plant` / `insurance` / `item`），舊 6 種用 1:1 子表存細節：`CarDetails` / `HouseDetails` / `ChildDetails` / `PetDetails` / `PlantDetails` / `InsuranceDetails`；`item` 走 template path (`template_key` + `template_fields` jsonb)，不開子表。
- **`FuelLogs`** — 車輛加油紀錄；與 `CashTransactions` 透過 `fuel_log_id` 雙寫關聯。
- **`RecurringIncomeRules` / `RecurringExpenseRules`** — 定期收支規則；pg_cron 每日依 `next_occurrence_at` 產生 `PendingIncomeOccurrences` / `PendingExpenseOccurrences`，使用者 confirm 才落地成真實 transaction。
- **`MonthlyReviewSnapshots` / `MonthlyReviewMessages`** — 月初 cron 凍結的雙人月度回顧資料。

### Entity 關係

```
Profiles ─┬─< OikosGroups.member_a, member_b
          ├─< CashTransactions.paid_by
          ├─< IncomeTransactions.recipient_id
          └─< InsuranceDetails.policy_holder_user_id / insured_user_id

OikosGroups ─┬─< GroupEpochs (1 open + N closed)
             ├─< CashTransactions / IncomeTransactions / Settlements
             ├─< Assets ─┬─< CarDetails ─< FuelLogs
             │           ├─< HouseDetails / ChildDetails / PetDetails / PlantDetails
             │           └─< InsuranceDetails (可 FK 回 Asset: vehicle_id / insured_child_id)
             └─── GroupBalance (1:1)
```

- Asset 屬於 Group，**沒有** `owner_user_id`；個別 owner 語意各 type 自己定義（`CarDetails.primary_user_id` / `HouseDetails.owner` / `InsuranceDetails.policy_holder_user_id`）。
- CashTransaction 可 optional 關聯 `asset_id`（哪個愛物的支出）+ `fuel_log_id`（加油雙寫）。
- Epoch 是「時間軸 slice」不是 entity owner：transactions / settlements 透過 `transacted_at` 落在哪個 epoch 來歸屬章節。

### 分類色 token

> v0.15.1 之後收斂為「每個分類只宣告一個 primary `color`，chip 用的 `tint` 由 `lightenHex()` 推得」（issue #149），確保同一分類在 feed icon 與 donut slice 之間共用同一 hue family。

- 支出分類：`lib/categories.ts` — 每個 `Category` 自帶 primary `color` + derived `tint` + `ink` + `mono`；`chart` 為 `color` 的 alias，舊 callsite 不動。
- 收入分類：`lib/incomeCategories.ts` — 同結構；另有 `SAVINGS_RETURN_CATEGORIES` 標記「已拿回」桶（maturity / dividend / survival_annuity）。
- 收入模式整體色票：`lib/incomePalettes.ts`（mint / gold / cream）— `ink` / `tint` / `glow` / `whisper` / `sheetBg` 五階。
- 愛物 type token：`app/globals.css` 的 `--asset-color-{car,house,child,pet,plant,insurance}` 為主色；`--asset-tint-*` 透過 `color-mix(in srgb, var(--asset-color-*) 35%, white)` 推導，list rail 與未來愛物 donut 共用同一 hue family。
- 派生 helper：`lib/colors.ts#lightenHex(hex, amount = 0.35)` — chip `tint` 從每個 `Category.color` deterministic 推得；新增分類只需給 `color` + `ink`，不必再挑 tint。

### Worktree 工作流

- 開發在 `.claude/worktrees/<adjective-name>-<hash>/` 的 git worktree 做事，每條 feature branch 一個 worktree，**不在 main repo 直接動**。
- Worktree branch 命名 `claude/<adjective-name>-<hash>`；feature branch 名（要開 PR 用的）取自任務上下文（如 `chore/...` / `feat/...`），在 worktree 內 `git checkout -b` 切過去。
- Worktree 與 main repo 共用 git history；PR merge 後 worktree 連同 branch 一起清掉。

---

## 環境

| env | project | URL |
|---|---|---|
| prod | `oikos` | https://cxbnlahuhdvrbwcnzoqo.supabase.co |
| dev  | `oikos-dev` | https://ufhcprrauwsxdmscbkrf.supabase.co |

兩個 Supabase project 完全獨立。Migration / realtime publication / pg_cron job 兩邊都要跑（`npm run db:migrate` 看本地 `.env.local` 指向哪個）。Vercel preview / prod 部署只連 prod project；本機 `npm run dev` 連 dev project。

---

## 部署流程

Vercel 連兩條 branch：

| Branch | Vercel target | 觸發來源 |
|---|---|---|
| `main` | Preview | feature PR merge |
| `release` | **Production** | `main` → `release` PR merge |

`main` 與 `release` 都有 branch protection — 都只能透過 PR merge，不能直接 push。

要 release 時：

1. 在 `chore/release-vX.Y.Z` 上跑 `git-develop:release` skill（bump version + CHANGELOG + CLAUDE.md + tag）
2. 開 PR `chore/release-vX.Y.Z → main`，merge 後 push tag
3. 開 PR `main → release`，merge 後 Vercel 自動部 prod

Feature PR 進 `main` 只會起 Preview，不會碰 prod。

---

## 常用指令

```bash
npm run dev          # 開發 server
npm run test:run     # vitest 一次性
npm run db:migrate   # apply migrations
npm run db:generate  # 從 schema 生 migration
npm run db:studio    # Drizzle Studio
```

## AI 開發協作規則

- **commit + push 自主**：每完成一個邏輯單位（PR / feature）即自動 commit，並自動 push 到當前 feature branch，不必問。
- **`main` / `release` 是 protected**：絕對不要直接 push 到這兩條，要進去都走 PR merge 流程。`gh pr merge --admin`（任何繞過 branch protection 的 merge）也要明確指令才執行。
- **destructive ops**：動 prod 資料、force push 到 main/release、`reset --hard` 之類仍要明確確認 scope 後才執行。force-push（含 `--force-with-lease`）到 feature branch 在 rebase 後可自動執行。

---

## 規格文件位置

> 每份 spec 頂部 frontmatter 標注實作狀態（status / shipped_in / remaining_issues）。

| 文件 | 內容 |
|---|---|
| `docs/superpowers/specs/product-design.md` | 整體架構、Tech Stack |
| `docs/superpowers/specs/transactions-design.md` | 核心記帳 UX、Onboarding、Solo Mode |
| `docs/superpowers/specs/car-fuellog-design.md` | 車輛 + FuelLog |
| `docs/superpowers/specs/aibutsu-design.md` | 愛物概念 + Child/Pet/Plant/House/Insurance |
| `docs/superpowers/specs/guardian-design.md` | 守護模組獨立化 + beta gate（v0.16.0 shipped #220 #221 #227 — `canAccessGuardian()` 單一閘門 + GatedView for beta-off surfaces）|
| `docs/superpowers/specs/income-design.md` | 進帳功能設計決策 |
| `docs/superpowers/specs/insurance-design.md` | 保險 SavingsView framing |
| `docs/superpowers/specs/recurring-income-design.md` | 自訂定期收入 |
| `docs/superpowers/specs/recurring-expense-design.md` | 自訂定期支出（v0.13.0 shipped）|
| `docs/superpowers/specs/cloud-invoice-design.md` | 雲端發票匯入（暫緩，APP_ID 卡點）|
| `docs/superpowers/specs/offline-browsing-design.md` | 離線瀏覽 / PWA cache（v0.14.0 shipped — Serwist + opt-in toggle + offline fallback）|
| `docs/superpowers/specs/stats-design.md` | Records 月度／分類統計（v0.14.0 shipped；drill-down v0.14.2 / PR #116 closes #102）|
| `docs/superpowers/specs/monthly-review-design.md` | 雙人月度回顧儀式（v0.14.0 shipped）|
| `docs/superpowers/specs/fab-records-tab-design.md` | /records FAB context-awareness（v0.14.1 shipped；PR #112 closes #110）|
| `docs/superpowers/specs/structured-filter-design.md` | /records 結構化篩選器（v0.15.0 shipped #50 — date range + 愛物 + URL-synced；v0.15.2 v2 #165 — amount range + status；v0.16.0 v3 #223 — 愛物分組 sub-section + 全選 chip）|
| `docs/superpowers/specs/inbox-layer-design.md` | Inbox layer 概念統一（v0.15.0 概念註解；v0.16.0 schema migration + UI）|
| `docs/superpowers/specs/i18n-design.md` | i18n 架構：cookie-based locale、4 語、server fetch + provider |
| `docs/superpowers/specs/epoch-readonly-design.md` | 過去章節 read-only + 所有 transaction 讀取必填 `epochWindow` 型別防呆（v0.15.3 shipped #207）|
| `docs/superpowers/specs/asset-templates-design.md` | 愛物模板系統 v1（v0.16.0 shipped #222 — TypePicker 加「物品」第七選項 + `'item'` asset_type + 單一 `general` 模板；舊 6 種 type 完全不動）|
| `CHANGELOG.md` | 版本歷史 |
