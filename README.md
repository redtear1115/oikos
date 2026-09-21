# Oikos

> 家庭記帳工具，固定兩人（夫妻／伴侶）使用。
> 對使用者顯示為 **Futari**；codebase 用 Oikos。

Futari 是私密記帳 PWA：兩人分攤支出、愛物（車 / 房 / 子女 / 寵物 / 植物 / 保險 / 物品）、月度回顧。私人家庭工具，不是 SaaS——所有功能圍繞「這筆錢怎麼分、誰欠誰多少」。Mobile-first，Web + iOS + Android 三平台共用同一份 Next.js 部署（見下方 Tech Stack）。

> 線上服務：<https://futari.southern-light.dev/>（登入怎麼用見該頁；不是本檔重點）
> 完整變更紀錄見 [CHANGELOG.md](CHANGELOG.md)。

這份 README 是給維護者的入口：怎麼把專案跑起來、目錄長什麼樣、部署與協作紅線。要動 code 之前的架構、domain model、AI 協作慣例在 [CLAUDE.md](CLAUDE.md)。

---

## 先讀

依序看：

1. [CLAUDE.md](CLAUDE.md) — 架構速查、domain model、觀測邊界、AI 協作規則。人類維護者與 agent 共用同一份。
2. [docs/superpowers/specs/domain-model-design.md](docs/superpowers/specs/domain-model-design.md) — entity 目錄、balance 計算規則、分類色 token。
3. [docs/superpowers/ops-runbook.md](docs/superpowers/ops-runbook.md) — migration 慣例、prod migration 跑法、pg_cron 授權、Apple Sign In 設定、GA 歸因。
4. [PRODUCT.md](PRODUCT.md) / [DESIGN.md](DESIGN.md) — 動文案、判讀指標、做視覺決定之前看。兩份由 Impeccable design skill 維護，refresh 是「model 全檔重寫」而非機械產生——手寫段落能不能留下來，取決於當時跑 refresh 的 agent 有沒有先讀現檔、逐段帶過去；細節見 CLAUDE.md「設計脈絡（Impeccable）」。

---

## Tech Stack

- **Next.js 16**（App Router）+ React 19 on Vercel
- **Supabase**：Postgres + Auth（Google + Apple OAuth）+ Realtime
- **Drizzle ORM** + Tailwind CSS v4
- **Capacitor 8** 薄殼：iOS / Android 殼直接載入線上網站（`server.url`），web 改動經 Vercel 部署即時觸達三平台，不必重送商店——只有動到原生輸入才要（見 CLAUDE.md「三平台架構」）
- **Sentry**（錯誤追蹤）+ **PostHog**（行為分析）：只在 `NODE_ENV === 'production'` 送出
- **vitest** + jsdom

---

## Local Setup

### 1. Install

```bash
npm install
```

### 2. 環境變數

```bash
cp .env.local.example .env.local
```

本機開發需要的值：
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase 專案的 API settings
- `DATABASE_URL_DIRECT` — direct connection（5432），給 Drizzle migrations 用
- `DATABASE_URL` — pooler connection（6543, `?pgbouncer=true`），給 runtime 用
- `ENCRYPTION_KEY` — `openssl rand -hex 32` 產生
- `NEXT_PUBLIC_APP_URL` — local dev 用 `http://localhost:3000`

`NEXT_PUBLIC_POSTHOG_*` / `*SENTRY_DSN` 也在 `.env.local.example` 裡，但只在 `NODE_ENV=production` 送出，本機留 placeholder 即可。

### 3. Supabase 一次性設定

在 Supabase dashboard 確認：
- **Auth → Providers**：啟用 Google OAuth（callback URL 加 `https://<your-domain>/auth/callback`）與 Apple（設定細節見 [ops-runbook.md](docs/superpowers/ops-runbook.md)）
- **Database → Extensions**：啟用 `pg_cron`（給 weekly cleanup 與定期收支產卡用）

### 4. Migrations

```bash
npm run db:migrate
```

### 5. Run + Test

```bash
npm run dev       # http://localhost:3000
npm run test:ci   # 排掉要連 dev DB 的 integration test
```

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
| `npm run cap:sync` | Capacitor：同步 web 產物到 iOS / Android 殼 |

---

## Project Structure

```
actions/                  Server Actions（寫入路徑）
app/
  (dashboard)/            登入後的 routes
    dashboard/             主頁（收支 / 結算）
    records/                帳務紀錄列表
    assets/                 愛物（車 / 房屋 / 子女 / 寵物 / 植物 / 保險 / 物品）
    trips/, review/         旅行分帳、月度回顧
    settings/               設定
    _components/            dashboard 專用元件
  [locale]/                公開頁（URL prefix 4 語）：landing、sign-in、migrate、privacy、terms、use-case
  auth/callback/           OAuth callback
  invite/[token]/          加入 group 的 invite link
  setup/                   首次登入建 group
  onboarding/              品牌理念卡
components/                跨 route 共用元件（含 components/ui/ primitives）
lib/
  balance.ts               分攤計算（pure）
  filter.ts                TxnFilter 型別 + matcher（pure）
  validators.ts             Server Action 共用驗證（pure）
  action-errors.ts          server action 錯誤代碼（回傳值，不 throw）
  settlement.ts             Smart chip 計算（pure）
  categories.ts             支出 category 列表 + 顏色
  i18n/                     多語系（4 語：zh-TW / zh-CN / en / ja）
  db/                       Drizzle schema + queries
  supabase/                 Supabase server / browser clients
  analytics/                PostHog 事件封裝與隱私遮罩
  observability/            Sentry scrubbing
drizzle/                   SQL migrations + journal
supabase/functions/        Supabase Edge Functions（pg_cron 觸發的定期推播等）
ios/, android/             Capacitor 原生殼（薄殼，見 Tech Stack）
__tests__/, tests/         vitest 測試
docs/superpowers/specs/    架構規格 + 設計決策
```

---

## CI（GitHub Actions）

| Workflow | 觸發 | 做什麼 |
|---|---|---|
| `.github/workflows/ci.yml` | 每個 PR to `main` | `npm ci` → `lint` → `test:ci` → `build`（不需要任何 secret） |
| `.github/workflows/native-smoke.yml` | 動到 `ios/**`、`android/**`、`capacitor.config.ts`、`patches/**`、`package.json`、`package-lock.json`、`.github/workflows/native-smoke.yml` 的 PR；每月 1 號 cron；手動 | iOS 不簽章 archive（macOS runner）＋ Android `assembleDebug`（JDK 21） |

原生 smoke 刻意不掛在每個 PR 上——macOS runner 是 10 倍分鐘數計費。它存在的理由見
[app-store-submission-runbook.md §G](docs/app-store-submission-runbook.md)：Capacitor 8 的 SPM
衝突潛伏了兩個月，直到要送審才被發現。

---

## Deploy（Vercel）

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

## 協作紅線

- **記帳「編輯」= soft delete + insert 的 atomic transaction**（DB 層不支援 UPDATE）。`deleted_at` 超過 1 年由 pg_cron 物理刪除，所以「編輯歷史」只保留一年。
- **固定兩人一組**：第一人登入會被導到 `/setup` 建帳本；第二人需透過第一人產的 invite link 加入。沒有第三人加入的路徑。
- **不要在對外文案裡超講加密範圍**：實作是 server 持鑰的欄位級加密，只涵蓋少數機敏欄位，交易內容是明文。細節與撤回紀錄見 [CLAUDE.md](CLAUDE.md) 「品牌文案準則」段落的 `#1191` 那條。
- **`main` / `release` 只能走 PR merge**，不能直接 push；沒有 forgot password / 帳號管理 UI（OAuth 把這些都包了）。

---

## 版本歷史（最近 3 版）

完整變更內容見 [CHANGELOG.md](CHANGELOG.md)。

| 版本 | 主題 |
|---|---|
| [v1.5.21](CHANGELOG.md#1521---2026-09-21) | 首頁常駐的月回顧與旅行入口 · 月回顧跟著章節走 · 章節邊界的安全修補 · 金鑰環 |
| [v1.5.20](CHANGELOG.md#1520---2026-09-21) | 旅行編輯只寫入允許的欄位（hotfix） · 出遊 spec 進 main · SECURITY.md |
| [v1.5.19](CHANGELOG.md#1519---2026-09-21) | 凌晨的「今天」對得上 · 確認框送出中不會被關掉 · 未來日期不顯示天數 · 四語文案對齊 · 油耗說明回到設計字級 |

---

## License

[AGPL-3.0-or-later](LICENSE)

簡言之：你可以自由閱讀、修改、自架本專案的 fork。但如果你把改過的版本當 SaaS 提供給他人使用（包含網路服務），AGPL 要求你必須讓使用者能取得你的修改版原始碼。
