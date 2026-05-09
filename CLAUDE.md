# Oikos — Agent Guide

> 家庭記帳工具，對使用者顯示為 **Futari**；codebase 用 Oikos。
> 固定兩人（夫妻／伴侶）使用。Mobile-first PWA。

---

## ⚠️ Next.js 版本提醒

This is **Next.js 16** with breaking changes. APIs, conventions, and file structure differ from your training data. Read `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## 目前狀態

**Latest released: v0.13.1**（tag on origin）— prod migration 狀態獨立追蹤。完整版本歷史見 [CHANGELOG.md](CHANGELOG.md)

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

## Backlog / 未釋出版本

每版工時目標 ~2 週。主題敘事用來決定 changelog 文案與 release 重點。

| 版本 | 主題 | 主要 issues |
|---|---|---|
| [v0.14.0](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+label%3Av0.14.0) | 沒有訊號的時候，也還看得見 | #19 read-only offline、#22 月度／分類統計、#44 雙人月度回顧 |
| [v1.0.0](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+label%3Av1.0.0) | 公開 landing | #24 /sign-in 3-column |

→ 所有候選：[GitHub Issues](https://github.com/redtear1115/oikos/issues) · [`backlog`](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+label%3Abacklog)

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
| `release` | **Production** | 手動 merge `main` → push |

要 release 時：

```bash
git checkout release
git merge main
git push origin release
```

push 後 Vercel 自動部 prod。Feature PR 進 `main` 只會起 Preview，不會碰 prod。

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
| `docs/superpowers/specs/income-design.md` | 進帳功能設計決策 |
| `docs/superpowers/specs/insurance-design.md` | 保險 SavingsView framing |
| `docs/superpowers/specs/recurring-income-design.md` | 自訂定期收入 |
| `docs/superpowers/specs/recurring-expense-design.md` | 自訂定期支出（v0.13.0 shipped）|
| `docs/superpowers/specs/cloud-invoice-design.md` | 雲端發票匯入（暫緩，APP_ID 卡點）|
| `docs/superpowers/specs/offline-browsing-design.md` | 離線瀏覽 / PWA cache（toggle UI 已 ship、SW 未實作 → v0.14.0）|
| `docs/superpowers/specs/i18n-design.md` | i18n 架構：cookie-based locale、4 語、server fetch + provider |
| `CHANGELOG.md` | 版本歷史 |
