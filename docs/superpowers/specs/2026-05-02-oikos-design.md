# Oikos — 整體設計規格

> 家庭記帳與資產管理工具，固定兩人（夫妻／伴侶）使用。
> 本文記錄 2026-05-02 brainstorm 的所有架構決定，作為實作依據。

---

## 1. Tech Stack

| 層 | 選擇 | 備註 |
|---|---|---|
| Frontend + API | Next.js (App Router) on Vercel | API routes 處理寫入、加密、Phase 3 proxy |
| DB | Supabase (Postgres) | schema 直接落地，Supabase pooler 處理 serverless 連線 |
| Auth | Supabase Auth (Google OAuth) | Google 登入，取代原本規劃的 Firebase Auth |
| ORM | Drizzle ORM | serverless 友好、TypeScript schema 定義、migration 自管 |
| Styling | Tailwind CSS | 沿用 sibling 專案習慣 |
| 敏感欄位加密 | AES-256 in Next.js Server Actions | key 存 Vercel env var，DB 只存 ciphertext |
| PWA | 是 | Next.js manifest + service worker，支援加到主畫面 |
| 環境 | 單一 Supabase project | `.env.local` 區分 dev/prod 設定，家用工具不需兩個 project |

---

## 2. 整體架構（Hybrid 讀寫分離）

```
寫入路徑：
  Client → Next.js Server Action → Drizzle → Supabase Postgres
  （加密、GroupBalance 重算、業務邏輯全在 Server Action）

讀取路徑：
  Client → Supabase JS client → Postgres（RLS 控 group 存取）
  （可選 real-time subscription，partner 新增 transaction 即時顯示）
```

**RLS 策略**：讀取時 RLS 確保只能看自己 group 的資料；寫入時 Server Action 是第一道防線，RLS 是備用安全網。

---

## 3. 資料模型

### 設計原則（沿用 CLAUDE.md，修正部分）

- **ID 型別**：所有 PK 為 `uuid`，預設 `gen_random_uuid()`
- **Timestamp**：所有時間欄位為 `timestamptz`
- **金額**：統一 `integer`（台幣整數，無小數）
- **軟刪除**：Transaction / Settlement / FuelLog 用 `deleted_at`；Asset 亦同
- **不支援 update**：「編輯」= soft delete 舊紀錄 + insert 新紀錄，同一 DB transaction
- **欠款計算**：全局計算，維護 `GroupBalance` cache，每次寫入後全量重算

### Schema

-- 注意：SQL table 實際命名用複數小寫（groups, transactions, settlements...）
-- 避開 PostgreSQL reserved words

```sql
-- 使用者（對應 Supabase auth.users）
profiles
  id: uuid (PK, FK → auth.users.id)
  display_name: text
  avatar_url: text
  created_at: timestamptz

-- 群組（固定兩人）；table name: groups
groups
  id: uuid (PK)
  name: text
  member_a: uuid FK → profiles
  member_b: uuid FK → profiles
  created_at: timestamptz

-- 群組邀請
GroupInvite
  id: uuid (PK)
  group_id: uuid FK → Group
  invited_by: uuid FK → profiles
  token: text UNIQUE              -- URL-safe random token
  expires_at: timestamptz
  accepted_at: timestamptz        -- null = 尚未接受
  created_at: timestamptz

-- 欠款快取
GroupBalance
  group_id: uuid (PK, FK → Group)
  balance: integer                -- 正數 = member_b 欠 member_a；負數 = member_a 欠 member_b
  version: integer                -- optimistic locking
  last_calculated_at: timestamptz

-- 記帳條目；table name: transactions
transactions
  id: uuid (PK)
  group_id: uuid FK → Group
  paid_by: uuid FK → profiles
  amount: integer
  split_type: enum(all_mine, all_theirs, half)
  description: text
  category: text
  asset_id: uuid nullable FK → Asset
  invoice_number: text nullable   -- Phase 3：發票號碼，防止重複匯入
  transacted_at: timestamptz
  deleted_at: timestamptz
  created_at: timestamptz

-- 結清紀錄
Settlement
  id: uuid (PK)
  group_id: uuid FK → Group
  paid_by: uuid FK → profiles
  amount: integer
  note: text
  settled_at: timestamptz
  deleted_at: timestamptz
  created_at: timestamptz

-- 資產 parent table
Asset
  id: uuid (PK)
  group_id: uuid FK → Group
  type: enum(car, house, child, insurance)
  name: text
  deleted_at: timestamptz
  created_at: timestamptz

-- 車輛
CarDetail
  asset_id: uuid (PK, FK → Asset)
  plate: text
  purchased_at: date
  purchase_price: integer

-- 加油紀錄
FuelLog
  id: uuid (PK)
  asset_id: uuid FK → Asset       -- 須 type=car（application 層驗證）
  liters: integer                  -- 精度待 Phase 2 決定（見 Section 5）
  fuel_type: enum(92, 95, 98, diesel)
  odometer: integer
  price_per_liter: integer         -- 精度待 Phase 2 決定（見 Section 5）
  logged_at: timestamptz
  deleted_at: timestamptz
  created_at: timestamptz

-- 房子
HouseDetail
  asset_id: uuid (PK, FK → Asset)
  owner: uuid FK → profiles
  address: text
  purchased_at: date
  purchase_price: integer

-- 孩子
ChildDetail
  asset_id: uuid (PK, FK → Asset)
  birthday: date
  gender: enum(male, female, other)
  id_number_encrypted: text        -- AES-256，key 在 Vercel env var
  insurance_id_encrypted: text     -- AES-256

-- 保險
InsuranceDetail
  asset_id: uuid (PK, FK → Asset)
  policy_number: text
  insurance_type: text
  coverage_amount: integer
  payment_date: integer            -- 每月幾號
  expiry_date: date
  insured_type: enum(user, child)
  insured_user_id: uuid nullable FK → profiles
  insured_child_id: uuid nullable FK → Asset  -- type=child，application 層驗證

-- 手機條碼載具（Phase 3）
InvoiceCredential
  id: uuid (PK)
  group_id: uuid FK → Group
  user_id: uuid FK → profiles
  barcode: text                    -- 手機條碼（明文）
  verification_code_encrypted: text -- AES-256
  created_at: timestamptz
```

### Balance 計算規則

```
payer = member_a:
  all_mine    → delta = 0
  all_theirs  → delta = +amount         （b 欠 a 全額）
  half        → delta = +ceil(amount/2) （b 欠 a 較多那半；付款人福利）

payer = member_b:
  all_mine    → delta = 0
  all_theirs  → delta = -amount
  half        → delta = -ceil(amount/2)

settlement payer = member_a → delta = -amount
settlement payer = member_b → delta = +amount
```

**UI 顯示**：
```typescript
const viewerBalance = (viewer.id === group.member_a_id) ? balance : -balance
// viewerBalance > 0 → "對方欠你 X 元"
// viewerBalance < 0 → "你欠對方 X 元"
```

---

## 4. Phase 規劃（修訂版）

### Phase 0 — 專案初始化

- [ ] Next.js + Supabase + Drizzle + Tailwind 專案建置
- [ ] Drizzle schema 定義 + migration workflow（local → Supabase）
- [ ] Supabase Auth（Google OAuth）
- [ ] `profiles` trigger（auth.users 新增時自動建 profiles）
- [ ] Group 建立流程（第一個登入者建 group）
- [ ] Invite flow：
  - 建立者產生 invite link（含 token，效期 7 天）
  - 複製 link 自行傳給對方
  - 對方開啟 link → 登入 → 加入 group
  - Group 滿兩人後 invite link 失效，第三人無法加入
- [ ] 全 table 的 RLS policies 在此 Phase 設定完畢
- [ ] PWA manifest + service worker 基本設定

### Phase 1 — 核心記帳 ✦ P0

- [ ] Transaction Server Action（create / soft-delete）
- [ ] 「編輯」= soft delete + insert，UI 呈現為正常編輯按鈕（使用者不感知）
- [ ] 分攤計算（all_mine / all_theirs / half，含 ceil 奇數規則）
- [ ] GroupBalance Server Action（每次寫入後全量重算）
- [ ] Settlement Server Action（create / soft-delete），支援部分結清
- [ ] 淨欠額顯示（依 viewer 翻轉正負號）
- [ ] Transaction list（依月份，預設當月，可切換月份）
- [ ] Settlement 歷史列表
- [ ] Real-time subscription（partner 新增 transaction 即時顯示）
- [ ] `deleted_at` 超過一年的 records 由 Supabase pg_cron 定期物理刪除

### Phase 2 — 資產管理 ✦ P1

建立順序：**車輛 → 保險 → 孩子 → 房子**

每種資產：
- [ ] 資產 CRUD（Asset parent + 對應 detail table）
- [ ] Transaction 表單新增「關聯資產」選項（Phase 2 才顯示）
- [ ] 依資產篩選 transaction list

**車輛額外：**
- [ ] FuelLog CRUD
- [ ] 油耗自動計算（本次里程 / 本次加油公升數）

### Phase 3 — 雲端發票匯入 ✦ P2

> 前置條件：APP_ID 申請（自然人憑證），須在 Phase 3 開始前完成。

- [ ] `InvoiceCredential` 儲存（手機條碼 + 加密驗證碼）
- [ ] Vercel API route 作為財政部 API proxy
- [ ] 依月份拉取發票列表
- [ ] 勾選發票 → 帶入 Transaction 表單（金額、店名預填）
- [ ] `invoice_number` 防止重複匯入

---

## 5. 尚未決定

- FuelLog `liters` 和 `price_per_liter` 的精度：用整數（毫升、分）或 decimal？待 Phase 2 實作時決定。
- Phase 3 APP_ID 申請時程（外部依賴）。
