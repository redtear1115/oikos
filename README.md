# Oikos

> 家庭記帳工具，固定兩人（夫妻／伴侶）使用。
> 對使用者顯示為 **Futari**；codebase 用 Oikos。

Futari 是私密記帳 PWA：兩人分攤支出、愛物（車 / 房 / 子女 / 寵物 / 植物 / 保險 / 物品）、月度回顧。私人家庭工具，不是 SaaS——所有功能圍繞「這筆錢怎麼分、誰欠誰多少」。Mobile-first。

> 線上服務：<https://futari.southern-light.dev/> — v1.0 起對外有公開 landing（繁中／簡中／英／日），登入後是兩人專屬空間。
> 最新版本與變更紀錄請見 [CHANGELOG.md](CHANGELOG.md)。

---

## 四份文件，各管一件事

這份 README 講怎麼把專案跑起來、怎麼部署、發過哪些版。其他三份：

- [CLAUDE.md](CLAUDE.md) — 要動 code 之前看的那份。架構、domain model、觀測的限制、協作慣例。
- [PRODUCT.md](PRODUCT.md) — Futari 為誰而做、刻意不做什麼、各個 surface 的意圖與「不是 KPI 的數字」。寫文案、判讀數據之前先讀它。
- [DESIGN.md](DESIGN.md) — 色票、字級、元件、Do's/Don'ts。由 `/impeccable document` 掃 `app/globals.css` 產生，不要手改。

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
| `npm run test:run` | vitest 一次性（含要連 dev DB 的 integration test） |
| `npm run test:ci` | vitest 一次性，排掉需要 DB 的 integration test（CI 用） |
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

## CI（GitHub Actions）

| Workflow | 觸發 | 做什麼 |
|---|---|---|
| `.github/workflows/ci.yml` | 每個 PR to `main` | `npm ci` → `lint` → `test:ci` → `build`（不需要任何 secret） |
| `.github/workflows/native-smoke.yml` | 動到 `ios/**`、`android/**`、`capacitor.config.ts`、`patches/**`、`package.json`、`package-lock.json` 的 PR；每月 1 號 cron；手動 | iOS 不簽章 archive（macOS runner）＋ Android `assembleDebug`（JDK 21） |

原生 smoke 刻意不掛在每個 PR 上——macOS runner 是 10 倍分鐘數計費。它存在的理由是
[app-store-submission-runbook §G](docs/app-store-submission-runbook.md)：Capacitor 8 的 SPM
衝突潛伏了兩個月，直到要送審才被發現。

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
| [v1.5.12](CHANGELOG.md#1512---2026-09-13) | 讓文件與 code 對帳 · 幣別鎖繞過修復 · 油耗算法統一 · 文件體系六維達標 |
| [v1.5.11](CHANGELOG.md#1511---2026-09-12) | 讓頁面被找到，讓點擊被算到 · 語系子樹可爬 · migrate／use-case 歸因補齊 |
| [v1.5.10](CHANGELOG.md#1510---2026-09-12) | 看得見、按得到、算得準 · 月度回顧修復 · safe-area 結構解 |
| [v1.5.9](CHANGELOG.md#159---2026-09-12) | 讓伴侶真的進得來 · 面對面掃碼 · 邀請授權修補 |
| [v1.5.8](CHANGELOG.md#158---2026-09-12) | 自然搜尋體質 · sitemap 說實話 · 搬家教學收摺 |
| [v1.5.7](CHANGELOG.md#157---2026-09-12) | 三平台觀測維度 · platform super property |
| [v1.5.6](CHANGELOG.md#156---2026-09-12) | iOS 原生登入修復 · 三平台 CI 與發版地基 · 殼版本偵測 |
| [v1.5.5](CHANGELOG.md#155---2026-08-12) | 登入失敗被看見 · solo 重複切換修正 · 送審素材補齊 |
| [v1.5.4](CHANGELOG.md#154---2026-07-13) | DB 連線事故根因修復 · migrate 競品頁查證改寫 |
| [v1.5.3](CHANGELOG.md#153---2026-06-30) | 測試版回報修正 · solo 旅行 500 · 鍵盤留白 |
| [v1.5.2](CHANGELOG.md#152---2026-06-11) | 首次送審就緒 · 暖燈 App icon · iOS 推播能力 |
| [v1.5.1](CHANGELOG.md#151---2026-06-10) | 上架準備 · 帳號刪除 · 落地頁提速 |
| [v1.5.0](CHANGELOG.md#150---2026-06-09) | iOS 啟程 · Sign in with Apple · 推播提醒 |
| [v1.4.3](CHANGELOG.md#143---2026-05-31) | 品牌面升溫 · Landing 插圖欄位上線 |
| [v1.4.2](CHANGELOG.md#142---2026-05-31) | 車牌／地址解密修復 · 設計 token 收斂 |
| [v1.4.1](CHANGELOG.md#141---2026-05-30) | Android 登入修復 |
| [v1.4.0](CHANGELOG.md#140---2026-05-30) | Android 上架準備 · 情境 landing 頁 |
| [v1.3.2](CHANGELOG.md#132---2026-05-30) | 競品搬遷頁鋪開．截圖換 CSV 接住非匯出 App |
| [v1.3.1](CHANGELOG.md#131---2026-05-30) | 公開 surface 清掃．愛物 PII 加密第一階段 |
| [v1.3.0](CHANGELOG.md#130---2026-05-27) | 觀測補強．PostHog 行為事件埋點 |
| [v1.2.5](CHANGELOG.md#125---2026-05-27) | 效能基礎建設．DB 索引 × 圖片優化 |
| [v1.2.4](CHANGELOG.md#124---2026-05-26) | settings 精煉．dashboard 接上 Impeccable |
| [v1.2.3](CHANGELOG.md#123---2026-05-25) | records 邊角修正．個人資料無障礙整備 |
| [v1.2.2](CHANGELOG.md#122---2026-05-25) | 當月日趨勢圖．records 篩選修正 |
| [v1.2.1](CHANGELOG.md#121---2026-05-25) | 觀測性收尾．PostHog proxy × Sentry 補齊 |
| [v1.2.0](CHANGELOG.md#120---2026-05-24) | 入口轉換追蹤．PostHog 漏斗事件上線 |
| [v1.1.8](CHANGELOG.md#118---2026-05-21) | hydration 閃退修正．PostHog 收斂到 production |
| [v1.1.7](CHANGELOG.md#117---2026-05-21) | 可觀測性接入．Sentry × PostHog 上線 |
| [v1.1.6](CHANGELOG.md#116---2026-05-21) | Android PWA 體驗修正．safe-area 與返回鍵 |
| [v1.1.5](CHANGELOG.md#115---2026-05-21) | 分頁載入改用 skeleton 骨架畫面 |
| [v1.1.4](CHANGELOG.md#114---2026-05-21) | 設計系統收尾．前端品質續推 |
| [v1.1.3](CHANGELOG.md#113---2026-05-20) | 品質打磨．UX／前端／SEO 三輪 audit |
| [v1.1.2](CHANGELOG.md#112---2026-05-19) | Design system primitives．前端品質重構 |
| [v1.1.1](CHANGELOG.md#111---2026-05-19) | CSV 匯入續做．Spendee／OFX／QIF 接上 |
| [v1.1.0](CHANGELOG.md#110---2026-05-18) | /migrate landing．接住歷史紀錄 |
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
