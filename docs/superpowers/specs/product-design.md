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
| PWA | 是 | 加到主畫面 |

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

主要 tables：
- `Profiles`（FK → auth.users）
- `OikosGroups`（含 member_a / member_b）
- `GroupInvites`（token-based 7 天 expire）
- `GroupBalance`（derived cache，每次寫入重算）
- `CashTransactions`（核心，nullable `asset_id` 關聯愛物）
- `Settlements`
- `Assets` + `CarDetails` / `ChildDetails` / `PetDetails` / `InsuranceDetails`（Phase 2）
- `FuelLogs`（Phase 2，車輛專用）
- `InvoiceCredentials`（Phase 3，加密驗證碼）

### Balance 計算規則

詳見 [CLAUDE.md 的「Balance 計算規則」](../../../CLAUDE.md)。實作在 [lib/balance.ts](lib/balance.ts) + [lib/db/queries/balance.ts](lib/db/queries/balance.ts)（包含 recalc SQL）。

---

## 4. Phase 規劃

| Phase | 範圍 | 狀態 |
|---|---|---|
| 0 | 專案建置 + Auth + Group 建立 + Invite + RLS + PWA | ✅ |
| 1 | 核心記帳：transaction CRUD + settlement + 列表 + 篩選 + Settings + Real-time + pg_cron cleanup + 測試 | ✅ |
| 1.1 | Onboarding flow + Solo Mode | ✅ |
| 2 | 愛物管理（Slice 1: 車 ✅ → Slice 2: FuelLog ✅ → Slice 3: Child/Pet/Plant ✅ → Slice 4: House ✅ → Slice 5: Insurance + IncomeTransactions ◑） | 🔄 |
| 3 | 雲端發票匯入（財政部 API + 手機條碼載具） | ⬜ |

**Slice 5 進度**：Insurance CRUD ✅ + IncomeTransactions backend (schema / actions / queries / RLS / Realtime / pg_cron) ✅ shipped to prod 2026-05-06；IncomeSheet UI / Dashboard mode toggle / Records 分 tab / 保險頁累計繳費 view 待 ship（plan: `docs/superpowers/plans/2026-05-06-slice-5-insurance.md` Phases 3-9）。

詳細設計見各 spec：[transactions-design.md](transactions-design.md) · [car-fuel-log-design.md](car-fuel-log-design.md) · [aibutsu-design.md](aibutsu-design.md) · [incomesheet-design.md](incomesheet-design.md)

---

## 5. 待決定

- Phase 3 APP_ID 申請時程（外部依賴）
