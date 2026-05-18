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
| [v1.0.0](CHANGELOG.md#100---2026-05-17) | 公開 landing．接住歷史 |
| [v1.0.1](CHANGELOG.md#101---2026-05-17) | 新用戶第一步修補．/setup 500 修復 |
| [v1.0.2](CHANGELOG.md#102---2026-05-17) | Prod log 修復．RSC × iOS icon × Supabase 警告 |
| [v1.0.3](CHANGELOG.md#103---2026-05-17) | Supabase Advisor 清零．Realtime 補齊 |
| [v1.0.4](CHANGELOG.md#104---2026-05-17) | 前端 refactor 大掃除．首載 × icon 更輕 |
| [v1.0.5](CHANGELOG.md#105---2026-05-18) | 三大入口 header / filter 統一．Records 月份改 picker |

<details>
<summary>展開更早的版本歷史（v0.1.0 → v0.17.6，共 36 筆）</summary>

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
| [v0.16.1](CHANGELOG.md#0161---2026-05-13) | 守護後的細節收尾．角色色 × 收入篩選 × 被保人自己/對方 × 兩條清理 |
| [v0.16.2](CHANGELOG.md#0162---2026-05-14) | 設計語言收束．第一張公開臉．效能更輕 |
| [v0.16.3](CHANGELOG.md#0163---2026-05-14) | 在搜尋裡也被看見．sitemap × canonical × middleware × cache 訊號收斂 |
| [v0.17.0](CHANGELOG.md#0170---2026-05-14) | 架構先行．多幣別 × 旅行子帳本一次到位 |
| [v0.17.1](CHANGELOG.md#0171---2026-05-15) | UX × 效能 × a11y × 快取．細節讓體驗更順 |
| [v0.17.2](CHANGELOG.md#0172---2026-05-15) | 旅行從沙盒到收斂．多幣別視角也站穩 |
| [v0.17.3](CHANGELOG.md#0173---2026-05-15) | Settings 收束 × 旅行感知 × AddSheet 守護分層．細節讓操作更貼手 |
| [v0.17.4](CHANGELOG.md#0174---2026-05-16) | 旅行幣別 self-serve．Settings 結構收束．子頁面語言對齊 |
| [v0.17.5](CHANGELOG.md#0175---2026-05-16) | 身份識別離 Dashboard 半秒．Settings 主頁瘦身．執行階段更穩 |
| [v0.17.6](CHANGELOG.md#0176---2026-05-17) | 首屏 1.9 秒回神．日期型別收緊 |

</details>

---

## License

[AGPL-3.0-or-later](LICENSE)

簡言之：你可以自由閱讀、修改、自架本專案的 fork。但如果你把改過的版本當 SaaS 提供給他人使用（包含網路服務），AGPL 要求你必須讓使用者能取得你的修改版原始碼。
