# Oikos

> 家庭記帳工具，固定兩人（夫妻／伴侶）使用。
> 對使用者顯示為 **Futari**；codebase 用 Oikos。

私人家庭工具，非 SaaS。所有功能圍繞「這筆錢怎麼分、誰欠誰多少」。Mobile-first PWA。

**Status：v0.11.1**（核心記帳・愛物・進帳・定期收入・保險 SavingsView・i18n 4 語）。版本歷史見 [CHANGELOG.md](CHANGELOG.md)，開發脈絡見 [CLAUDE.md](CLAUDE.md)。

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
    assets/               愛物（車 / 保險 / 子女 / 寵物 / 植物 / 房屋）
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

1. Vercel 連 GitHub repo
2. Build settings 留預設（Next.js auto-detect）
3. **Environment Variables**：把 `.env.local` 全部值填進去
4. 第一次 deploy 完，記得：
   - 把 Vercel 的 production URL 加到 Supabase Auth 的 redirect allow-list
   - 把 production URL 設成 `NEXT_PUBLIC_APP_URL`

每次 push 到 `main` 自動 deploy。

---

## Notes

- 兩人 group：第一人登入會被導到 `/setup` 建帳本；第二人需透過第一人產的 invite link 加入
- 記帳「編輯」是 soft delete + insert 的 atomic operation（DB 層不支援 update），UX 上使用者無感
- `deleted_at` 超過 1 年的紀錄由 pg_cron 物理刪除，所以「編輯歷史」只保留一年
- 沒有 forgot password / 帳號管理 UI — Google OAuth 把這些都包了

---

## License

[AGPL-3.0-or-later](LICENSE)

簡言之：你可以自由閱讀、修改、自架本專案的 fork。但如果你把改過的版本當 SaaS 提供給他人使用（包含網路服務），AGPL 要求你必須讓使用者能取得你的修改版原始碼。
