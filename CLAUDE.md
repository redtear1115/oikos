# Oikos — Agent Guide

> 家庭記帳工具，對使用者顯示為 **Futari**；codebase 用 Oikos。
> 固定兩人（夫妻／伴侶）使用。Mobile-first PWA。

---

## ⚠️ Next.js 版本提醒

This is **Next.js 16** with breaking changes. APIs, conventions, and file structure differ from your training data. Read `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## 目前狀態

**Latest released: v0.11.3**（tag on origin）— prod migration 狀態獨立追蹤。完整版本歷史見 [CHANGELOG.md](CHANGELOG.md)

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
| [v0.11.3](CHANGELOG.md#0113---2026-05-08) | SEO 基礎建設．讓世界找得到 |

## Backlog / 未釋出版本

→ [GitHub Issues](https://github.com/redtear1115/oikos/issues)

Labels：[`backlog`](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+label%3Abacklog) · [`v0.11.2`](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+label%3Av0.11.2) · [`v0.12.0`](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+label%3Av0.12.0) · [`v1.0.0`](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+label%3Av1.0.0)

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

## 常用指令

```bash
npm run dev          # 開發 server
npm run test:run     # vitest 一次性
npm run db:migrate   # apply migrations
npm run db:generate  # 從 schema 生 migration
npm run db:studio    # Drizzle Studio
```

## AI 開發協作規則

- **commit 自主**：每完成一個邏輯單位（PR / feature）即自動 commit，不必問。push 仍需要明確指令。
- **destructive ops**：動 prod 資料、force push、reset --hard 之類仍要明確確認 scope 後才執行。

---

## 規格文件位置

| 文件 | 內容 |
|---|---|
| `docs/superpowers/specs/product-design.md` | 整體架構、Tech Stack |
| `docs/superpowers/specs/transactions-design.md` | 核心記帳 UX、Onboarding、Solo Mode |
| `docs/superpowers/specs/car-fuellog-design.md` | 車輛 + FuelLog |
| `docs/superpowers/specs/aibutsu-design.md` | 愛物概念 + Child/Pet/Plant/House/Insurance |
| `docs/superpowers/specs/income-design.md` | 進帳功能設計決策 |
| `docs/superpowers/specs/insurance-design.md` | 保險 SavingsView framing |
| `docs/superpowers/specs/recurring-income-design.md` | 自訂定期收入 |
| `docs/superpowers/specs/recurring-expense-design.md` | 自訂定期支出（v0.12.0 lock，未實作）|
| `docs/superpowers/specs/cloud-invoice-design.md` | 雲端發票匯入（暫緩，APP_ID 卡點）|
| `docs/superpowers/specs/offline-browsing-design.md` | 離線瀏覽 / PWA cache（Backlog；toggle UI 已 ship、SW 未實作）|
| `docs/superpowers/specs/i18n-design.md` | i18n 架構：cookie-based locale、4 語、server fetch + provider |
| `CHANGELOG.md` | 版本歷史 |
