# Oikos 整體產品設計

> 家庭記帳工具，固定兩人（夫妻／伴侶）使用。
> 本文記錄架構決定，作為實作的「為什麼」依據。具體 schema / API 細節以程式碼為準。

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
| PWA | 是 | 加到主畫面（Service Worker 待 backlog；目前無 cache）|
| i18n | 自製字典 + cookie-based locale | 4 語（zh-TW / zh-CN / en / ja）；不引 next-intl，詳見 [i18n-design.md](i18n-design.md) |

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

實作位置：
- Server Actions：[actions/](actions/)
- Validation helpers：[lib/validators.ts](lib/validators.ts)
- DB queries：[lib/db/queries/](lib/db/queries/)
- Realtime：[app/(dashboard)/_components/RealtimeProvider.tsx](app/%28dashboard%29/_components/RealtimeProvider.tsx)

### Auth 驗證分層

| 位置 | 用 | 為什麼 |
|---|---|---|
| `middleware.ts` | `auth.getUser()` | 整個系統的 trust boundary，必須真打 Auth API 驗 token，防 cookie 偽造 |
| Page / layout server components | `getCurrentUser()`（內部 `getSession()`）| Middleware 已先驗，cookie 在 page render 當下可信；省每頁 200–400ms HTTP 往返 |
| Server actions（`actions/**.ts`）| `auth.getUser()` | Write path 直接被 client 呼叫，保守起見不省這層；單次 action 慢一點可接受 |

不採用：無腦全面 `getSession()`（含 actions）/ 移除 middleware `getUser()` / process-level cache（Vercel 各 instance 不一致）/ Edge runtime（Drizzle 相容性）。

Helper：[lib/supabase/server.ts](lib/supabase/server.ts) 的 `getCurrentUser()`，回 `User | null`。新增 page / layout 時用這個，不要再呼叫 `auth.getUser()`。

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

完整 schema 以 [lib/db/schema.ts](lib/db/schema.ts) 為準。Migration 在 [drizzle/](drizzle/)。

主要 tables（完整 schema 以 [lib/db/schema.ts](lib/db/schema.ts) 為準）：
- `Profiles`（FK → auth.users）
- `OikosGroups`（含 member_a / member_b）
- `GroupInvites`（token-based 7 天 expire）
- `GroupBalance`（derived cache，每次寫入重算）
- `CashTransactions`（核心，nullable `asset_id` 關聯愛物）
- `Settlements`
- `Assets` + `CarDetails` / `ChildDetails` / `PetDetails` / `HouseDetails` / `InsuranceDetails`
- `FuelLogs`（車輛專用）
- `IncomeTransactions`（進帳，平行於 CashTransactions）
- `InvoiceCredentials`（v0.8.0，加密驗證碼）

### Balance 計算規則

詳見 [CLAUDE.md 的「Balance 計算規則」](../../../CLAUDE.md)。實作在 [lib/balance.ts](lib/balance.ts) + [lib/db/queries/balance.ts](lib/db/queries/balance.ts)（包含 recalc SQL）。

---

## 4. 版本規劃

版本歷史與當前狀態見 [CLAUDE.md](../../../CLAUDE.md)（版本表）與 [CHANGELOG.md](../../../CHANGELOG.md)。

各功能域設計 spec：[transactions-design.md](transactions-design.md) · [car-fuellog-design.md](car-fuellog-design.md) · [aibutsu-design.md](aibutsu-design.md) · [income-design.md](income-design.md) · [insurance-design.md](insurance-design.md) · [recurring-income-design.md](recurring-income-design.md) · [recurring-expense-design.md](recurring-expense-design.md) · [cloud-invoice-design.md](cloud-invoice-design.md) · [i18n-design.md](i18n-design.md) · [offline-browsing-design.md](offline-browsing-design.md)

---

## 5. 待決定

- Phase 3 APP_ID 申請時程（外部依賴）
