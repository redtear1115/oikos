---
last_updated: 2026-07-13
status: shipped
first_shipped_in: v0.1.0
updates:
  - v1.0.2: getCurrentUser() 內部由 getSession() 改為 auth.getUser()（消除 Supabase 安全性警告，#494）
  - v0.11.1: Auth 分層改採 `getCurrentUser()`（內部 `getSession()`）+ i18n cookie locale 接入
related_specs: [locale-currency, trip-multi-currency, realtime, offline-browsing]
related_issues: []
---

# Oikos 整體產品設計

> 家庭記帳工具，固定兩人（夫妻／伴侶）使用。
> 架構總覽，無單一 ship point；個別功能域 status 看對應 spec。

---

## 1. Tech Stack

| 層 | 選擇 | 為什麼 |
|---|---|---|
| Frontend + API | Next.js 16 (App Router) on Vercel | Server Actions 處理寫入；React 19 |
| DB | Supabase (Postgres) | 一條龍 Auth + DB + Realtime；pooler 處理 serverless 連線 |
| Auth | Supabase Auth (Google OAuth) | 取代原規劃的 Firebase Auth |
| ORM | Drizzle ORM | TypeScript schema、migration 自管 |
| Styling | Tailwind CSS v4 | sibling 專案習慣 |
| 加密 | AES-256-GCM in Server Actions | key 在 Vercel env，DB 只存 ciphertext |
| Real-time | Supabase Realtime postgres_changes | partner 異裝置變動立即反應 |
| PWA | 是 | 加到主畫面；離線瀏覽見 [offline-browsing](offline-browsing-design.md) |
| i18n | 自製字典 + cookie-based locale | 4 語（zh-TW / zh-CN / en / ja）；見 [locale-currency](locale-currency-design.md) |

dev / prod 是獨立的兩個 Supabase project（migration 需兩邊都跑）。

---

## 2. 整體架構（Hybrid 讀寫分離）

```
寫入路徑：
  Client → Next.js Server Action → Drizzle → Supabase Postgres
  （驗證、加密、GroupBalance 重算、業務邏輯全在 Server Action）

讀取路徑：
  Client → Server Component → Drizzle → Postgres
  Realtime updates → Client subscribes → React state mutation

讀取安全：RLS 確保只能看自己 group 的資料
寫入安全：Server Action 是第一道防線；RLS 是備用安全網
```

實作落地：`actions/` / `lib/validators.ts` / `lib/db/queries/` / `app/(dashboard)/_components/RealtimeProvider.tsx`

### Auth 驗證分層

| 位置 | 用 | 為什麼 |
|---|---|---|
| `proxy.ts` | `auth.getUser()` | 整個系統的 trust boundary，必須真打 Auth API 驗 token，防 cookie 偽造 |
| Page / layout server components | `getCurrentUser()`（內部 `auth.getUser()` + React `cache()` 請求級去重）| Proxy 已先驗；`cache()` 保證同一 request 只打一次 Auth API。v1.0.2 起內部由 `getSession()` 改為 `getUser()`（消除 Supabase 安全性警告，#494），原「省 HTTP 往返」理由由請求級去重承接 |
| Server actions（`actions/**.ts`）| `auth.getUser()` | Write path 直接被 client 呼叫，保守起見不省這層；單次 action 慢一點可接受 |

**不採用**：無腦全面 `getSession()`（含 actions）/ 移除 proxy `getUser()` / process-level cache（Vercel 各 instance 不一致）/ Edge runtime（Drizzle 相容性）。

新增 page / layout 用 `getCurrentUser()`（in `lib/supabase/server.ts`），不要再呼叫 `auth.getUser()`。

---

## 3. 資料模型

### 設計原則

- **ID**：uuid，預設 `gen_random_uuid()`
- **時間**：`timestamptz`
- **金額**：`integer`（台幣，無小數）
- **軟刪除**：Transaction / Settlement / FuelLog / Asset 用 `deleted_at`
- **不支援 update**：「編輯」= soft delete + insert，同一 DB transaction
- **欠款計算**：每次寫入後全量重算，cache 在 `GroupBalance` table
- **命名**：PascalCase；避開 SQL reserved word（Group → OikosGroups、Transaction → CashTransactions）

### Schema

完整 schema 以 `lib/db/schema.ts` 為準；migration 在 `drizzle/`。

主要 tables 概略：
- `Profiles`（FK → auth.users）
- `OikosGroups`（含 member_a / member_b、`guardian_beta_enabled` 守護模組 beta flag）
- `GroupInvites`（token-based 7 天 expire）
- `GroupBalance`（derived cache，每次寫入重算）
- `CashTransactions`（核心，nullable `asset_id` 關聯愛物）
- `Settlements`
- `Assets`（7 個 type：car / house / child / pet / plant / insurance / item，見 [aibutsu](aibutsu-design.md) / [aibutsu-templates](aibutsu-templates-design.md)）+ 各 type 的 details 子表
- `FuelLogs`（車輛專用，見 [car-fuellog](car-fuellog-design.md)）
- `IncomeTransactions`（進帳，平行於 CashTransactions，見 [income](income-design.md)）
- `InvoiceCredentials`（加密驗證碼，見 [cloud-invoice](cloud-invoice-design.md)）

Balance 計算規則詳見 `CLAUDE.md`「Balance 計算規則」段；實作在 `lib/balance.ts` + `lib/db/queries/balance.ts`。

---

## 4. 設計立場

### 幣別視角刻意分層（主帳本單幣別 × 旅行多幣別）

| Context | 視角 | 為什麼 |
|---|---|---|
| 主帳本（dashboard / records / balance / AddSheet）| **單一幣別**：永遠顯示 group `base_currency`，UI 不暴露幣別 picker | 守住「記錄要素低認知負擔」——日常每筆不必做幣別決定 |
| 旅行子帳本（TripExpenses / TripExpenseSheet）| **多幣別**：每筆 record 可有不同 `currency`，預設 `trip.default_currency`、使用者可每筆覆寫 | 多幣別複雜度只在「旅行」這個有明確時間邊界的 context 才出現 |
| 旅行結束（endTrip fold） | summary `CashTransaction` 回到主帳本**單幣別**視角 | 複雜度收斂回主視角 |

**核心立場**：complexity at the boundary, simplicity in daily use。記錄介面刻意不暴露幣別選擇，避免認知負擔擴散到每一筆日常記帳；多幣別輸入鎖在有明確時間邊界的旅行 context，旅行結束就 fold 回單幣別主視角。

兩條哲學各自獨立成 spec：
- **保持簡單**（主帳本單幣別 + onboarding 一次性選 locale / base currency）→ [locale-currency](locale-currency-design.md)
- **邊界複雜**（旅行子帳本 + 多幣別 record + 心理匯率 snapshot + 結束 fold）→ [trip-multi-currency](trip-multi-currency-design.md)

---

## 版本規劃

版本歷史 + 各 milestone 主題敘事見 `CHANGELOG.md` 與 `CLAUDE.md`。各功能域 spec 入口見 [INDEX](INDEX.md)。

---

## 待決定

- Phase 3 雲端發票 APP_ID 申請時程（外部依賴，見 [cloud-invoice](cloud-invoice-design.md)）
