# Oikos

> 家庭記帳工具，固定兩人（夫妻／伴侶）使用。
> 對使用者顯示為 **Futari**；codebase 用 Oikos。

Futari 是給兩人（夫妻／伴侶）的私密記帳 PWA，支援雙人支出分攤、愛物（車 / 房 / 子女 / 寵物 / 植物 / 保險 / 物品）管理與月度回顧。私人家庭工具，非 SaaS — 所有功能圍繞「這筆錢怎麼分、誰欠誰多少」。Mobile-first。

> 線上服務：<https://futari.southern-light.dev/> — v1.0 起對外有公開 landing（繁中／簡中／英／日），登入後是兩人專屬空間。
> 最新版本與變更紀錄請見 [CHANGELOG.md](CHANGELOG.md)。開發脈絡見 [CLAUDE.md](CLAUDE.md)。

---

## 使用方式（給使用者）

直接用瀏覽器開 <https://futari.southern-light.dev/>，用 Google 登入。第一位登入會被導到建帳本流程；第二位透過第一位產生的 invite link 加入。無需安裝、無需付費。

要加到主畫面當 App 用（PWA）：登入後在 Settings 頁面有對應的安裝引導。

---

## Tech Stack

- **Next.js 16**（App Router）+ React 19 on Vercel
- **Supabase**：Postgres + Auth (Google OAuth) + Realtime
- **Drizzle ORM** + Tailwind CSS v4
- **vitest** + jsdom

---

## Local Setup

### 1. Install

```bash
npm install
```

### 2. 環境變數

複製 `.env.local.example` 成 `.env.local`，填入 Supabase 專案設定：

```bash
cp .env.local.example .env.local
```

需要的值：
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase 專案的 API settings
- `DATABASE_URL_DIRECT` — direct connection (5432)，給 Drizzle migrations 用
- `DATABASE_URL` — pooler connection (6543, `?pgbouncer=true`)，給 runtime 用
- `ENCRYPTION_KEY` — `openssl rand -hex 32` 產生
- `NEXT_PUBLIC_APP_URL` — local dev 用 `http://localhost:3000`

### 3. Supabase 一次性設定

在 Supabase dashboard 確認：
- **Auth → Providers**：啟用 Google OAuth（callback URL 加 `https://<your-domain>/auth/callback`）
- **Database → Extensions**：啟用 `pg_cron`（給 weekly cleanup 用）

### 4. Migrations

```bash
npm run db:migrate
```

Migration 會自動 apply schema + 排程 pg_cron cleanup job（每週日 03:00 物理刪除 `deleted_at > 1 year` 的 row）。

### 5. Run

```bash
npm run dev
```

開 [http://localhost:3000](http://localhost:3000)。

---

## Commands

| Command | 用途 |
|---|---|
| `npm run dev` | 開發 server |
| `npm run build` | 生產 build |
| `npm start` | 跑生產 build |
| `npm run lint` | ESLint |
| `npm test` | vitest watch mode |
| `npm run test:run` | vitest 一次性 |
| `npm run db:generate` | Drizzle：從 schema 生 migration |
| `npm run db:migrate` | Drizzle：apply migrations |
| `npm run db:studio` | Drizzle Studio（DB browser） |

---

## Project Structure

```
actions/                  Server Actions（寫入路徑）
app/
  (dashboard)/            登入後的 routes
    dashboard/            主頁（收支 / 結算）
    records/              帳務紀錄列表
    assets/               愛物（車 / 房屋 / 子女 / 寵物 / 植物 / 保險 / 物品）
    settings/             設定
  auth/callback/          OAuth callback
  invite/[token]/         加入 group 的 invite link
  setup/                  首次登入建 group
  sign-in/                登入頁
lib/
  balance.ts              分攤計算（pure）
  filter.ts               TxnFilter 型別 + matcher（pure）
  validators.ts           Server Action 共用驗證（pure）
  settlement.ts           Smart chip 計算（pure）
  categories.ts           支出 category 列表 + 顏色
  i18n/                   多語系（cookie-based，4 語：zh-TW / zh-CN / en / ja）
  db/                     Drizzle schema + queries
  supabase/               Supabase server / browser clients
drizzle/                  SQL migrations + journal
__tests__/, tests/        vitest 測試
docs/superpowers/specs/   架構規格 + 設計決策
```

---

## Deploy（Vercel）

### Branch 說明

- `main`：所有經過測試的新功能透過 feature PR merge 進來；Vercel 會 build preview。
- `release`：Vercel **prod** 以此分支為準。要 release 時開一條 `main → release` 的 PR，merge 後 Vercel 自動部署 production。

兩條 branch 都受 branch protection，只能走 PR merge，不能直接 push。完整 release 流程（version bump / CHANGELOG / tag / GH release）見 [CLAUDE.md](CLAUDE.md) 的「部署流程」段落。

### 初次設定

1. Vercel 連 GitHub repo，Production Branch 設為 `release`
2. Build settings 留預設（Next.js auto-detect）
3. **Environment Variables**：把 `.env.local` 全部值填進去
4. 第一次 deploy 完，記得：
   - 把 Vercel 的 production URL 加到 Supabase Auth 的 redirect allow-list
   - 把 production URL 設成 `NEXT_PUBLIC_APP_URL`

---

## Notes

- 兩人 group：第一人登入會被導到 `/setup` 建帳本；第二人需透過第一人產的 invite link 加入
- 記帳「編輯」是 soft delete + insert 的 atomic operation（DB 層不支援 update），UX 上使用者無感
- `deleted_at` 超過 1 年的紀錄由 pg_cron 物理刪除，所以「編輯歷史」只保留一年
- 沒有 forgot password / 帳號管理 UI — Google OAuth 把這些都包了

---

## 版本歷史

完整變更內容見 [CHANGELOG.md](CHANGELOG.md)。

| 版本 | 範圍 |
|---|---|
| [v1.1.2](CHANGELOG.md#112---2026-05-19) | Design system primitives + 前端品質重構 + SEO 收尾 |
| [v1.1.1](CHANGELOG.md#111---2026-05-19) | CSV 匯入續做（Spendee / OFX / QIF）+ /migrate SEO 強化 |
| [v1.1.0](CHANGELOG.md#110---2026-05-18) | /migrate landing + CSV 匯入歷史紀錄 |
| [v1.0.5](CHANGELOG.md#105---2026-05-18) | 三大入口 header / filter 統一．Records 月份改 picker |
| [v1.0.4](CHANGELOG.md#104---2026-05-17) | 前端 refactor 大掃除．首載 × icon 更輕 |
| [v1.0.3](CHANGELOG.md#103---2026-05-17) | Supabase Advisor 清零．Realtime 補齊 |
| [v1.0.2](CHANGELOG.md#102---2026-05-17) | Prod log 修復．RSC × iOS icon × Supabase 警告 |
| [v1.0.1](CHANGELOG.md#101---2026-05-17) | 新用戶第一步修補．/setup 500 修復 |
| [v1.0.0](CHANGELOG.md#100---2026-05-17) | 公開 landing．接住歷史 |

---

## License

[AGPL-3.0-or-later](LICENSE)

簡言之：你可以自由閱讀、修改、自架本專案的 fork。但如果你把改過的版本當 SaaS 提供給他人使用（包含網路服務），AGPL 要求你必須讓使用者能取得你的修改版原始碼。
