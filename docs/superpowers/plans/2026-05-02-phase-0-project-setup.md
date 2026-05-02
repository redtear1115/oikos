# Phase 0: Project Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 跑得起來的 Next.js app，支援 Google 登入、兩人 group 建立、邀請流程（複製 link）、RLS 保護所有 table、可安裝為 PWA。

**Architecture:** Next.js App Router on Vercel + Supabase Postgres (DB + Auth) + Drizzle ORM。Hybrid 讀寫分離：寫入走 Server Actions（直連 Postgres，繞過 RLS）；讀取走 Supabase JS client（帶 user JWT，受 RLS 控制）。

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, @supabase/ssr, drizzle-orm, postgres, drizzle-kit, Vitest

---

## File Structure

```
oikos/
├── app/
│   ├── globals.css
│   ├── layout.tsx                     # Root layout + PWA meta tags
│   ├── page.tsx                       # Root redirect → /sign-in or /dashboard
│   ├── auth/
│   │   └── callback/route.ts          # Supabase OAuth callback
│   ├── sign-in/
│   │   └── page.tsx                   # Google 登入按鈕
│   ├── invite/
│   │   └── [token]/page.tsx           # 接受邀請頁
│   ├── setup/
│   │   └── page.tsx                   # 建立 group（第一次登入）
│   └── (dashboard)/
│       ├── layout.tsx                 # 需登入 + 需有 group
│       └── page.tsx                   # Dashboard 佔位（Phase 1 填充）
├── lib/
│   ├── db/
│   │   ├── schema.ts                  # Drizzle schema（所有 table）
│   │   └── client.ts                  # Drizzle client（pooler 連線）
│   ├── supabase/
│   │   ├── server.ts                  # Server-side Supabase client（cookies）
│   │   └── client.ts                  # Browser Supabase client（singleton）
│   └── crypto.ts                      # AES-256-GCM encrypt/decrypt
├── actions/
│   ├── group.ts                       # createGroup, getMyGroup
│   └── invite.ts                      # createInvite, acceptInvite
├── middleware.ts                       # Auth guard
├── drizzle.config.ts
├── next.config.ts
├── public/
│   ├── manifest.json                  # PWA manifest
│   └── icons/                         # PWA icons（192x192, 512x512）
└── __tests__/
    ├── crypto.test.ts                 # AES-256 round-trip
    └── invite.test.ts                 # validateInviteAcceptance edge cases
```

---

## Task 1: 專案初始化

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`
- Create: `.env.local.example`

- [ ] **Step 1: 建立 Next.js 專案**

```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*"
```

預期：Next.js 15 + TypeScript + Tailwind + App Router 建立完成，`npm run dev` 可跑。

- [ ] **Step 2: 安裝 Supabase + Drizzle 相依套件**

```bash
npm install @supabase/ssr @supabase/supabase-js
npm install drizzle-orm postgres
npm install -D drizzle-kit
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: 建立 `.env.local`（參考 `.env.local.example`）**

建立 `.env.local.example`（不含敏感值）：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Drizzle migrations（direct connection，非 pooler）
DATABASE_URL_DIRECT=postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres

# Drizzle runtime（transaction mode pooler）
DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# AES-256 key（openssl rand -hex 32）
ENCRYPTION_KEY=your-64-char-hex-key

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

複製成 `.env.local`，填入真實值。

- [ ] **Step 4: 設定 Vitest**

建立 `vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
```

建立 `vitest.setup.ts`：

```typescript
import '@testing-library/jest-dom'
```

在 `package.json` 的 `scripts` 新增：

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: 確認 dev server 跑得起來**

```bash
npm run dev
```

預期：http://localhost:3000 顯示 Next.js 預設頁面，無 TypeScript 錯誤。

- [ ] **Step 6: Commit**

```bash
git init  # 若尚未 init
git add -A
git commit -m "chore: scaffold Next.js + Supabase + Drizzle + Vitest"
```

---

## Task 2: Drizzle Schema（所有 Table）

**Files:**
- Create: `lib/db/schema.ts`

- [ ] **Step 1: 建立 `lib/db/schema.ts`**

```typescript
import {
  pgTable, pgEnum, uuid, text, integer,
  timestamp, date, boolean, unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const splitTypeEnum = pgEnum('split_type', ['all_mine', 'all_theirs', 'half'])
export const assetTypeEnum = pgEnum('asset_type', ['car', 'house', 'child', 'insurance'])
export const fuelTypeEnum = pgEnum('fuel_type', ['92', '95', '98', 'diesel'])
export const genderEnum = pgEnum('gender', ['male', 'female', 'other'])
export const insuredTypeEnum = pgEnum('insured_type', ['user', 'child'])

// ─── Tables ──────────────────────────────────────────────────────────────────

export const profiles = pgTable('Profiles', {
  id: uuid('id').primaryKey(), // mirrors auth.users.id
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const oikosGroups = pgTable('OikosGroups', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  memberA: uuid('member_a').notNull().references(() => profiles.id),
  memberB: uuid('member_b').references(() => profiles.id), // null until invite accepted
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const groupInvites = pgTable('GroupInvites', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  invitedBy: uuid('invited_by').notNull().references(() => profiles.id),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const groupBalance = pgTable('GroupBalance', {
  groupId: uuid('group_id').primaryKey().references(() => oikosGroups.id),
  balance: integer('balance').notNull().default(0),
  version: integer('version').notNull().default(0),
  lastCalculatedAt: timestamp('last_calculated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const assets = pgTable('Assets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  type: assetTypeEnum('type').notNull(),
  name: text('name').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const cashTransactions = pgTable('CashTransactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  paidBy: uuid('paid_by').notNull().references(() => profiles.id),
  amount: integer('amount').notNull(),
  splitType: splitTypeEnum('split_type').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  assetId: uuid('asset_id').references(() => assets.id),
  invoiceNumber: text('invoice_number'),
  transactedAt: timestamp('transacted_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const settlements = pgTable('Settlements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  paidBy: uuid('paid_by').notNull().references(() => profiles.id),
  amount: integer('amount').notNull(),
  note: text('note'),
  settledAt: timestamp('settled_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const carDetails = pgTable('CarDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  plate: text('plate').notNull(),
  purchasedAt: date('purchased_at'),
  purchasePrice: integer('purchase_price'),
})

export const fuelLogs = pgTable('FuelLogs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  liters: integer('liters').notNull(),
  fuelType: fuelTypeEnum('fuel_type').notNull(),
  odometer: integer('odometer').notNull(),
  pricePerLiter: integer('price_per_liter').notNull(),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const houseDetails = pgTable('HouseDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  owner: uuid('owner').notNull().references(() => profiles.id),
  address: text('address'),
  purchasedAt: date('purchased_at'),
  purchasePrice: integer('purchase_price'),
})

export const childDetails = pgTable('ChildDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  birthday: date('birthday'),
  gender: genderEnum('gender'),
  idNumberEncrypted: text('id_number_encrypted'),
  insuranceIdEncrypted: text('insurance_id_encrypted'),
})

export const insuranceDetails = pgTable('InsuranceDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  policyNumber: text('policy_number'),
  insuranceType: text('insurance_type'),
  coverageAmount: integer('coverage_amount'),
  paymentDate: integer('payment_date'),
  expiryDate: date('expiry_date'),
  insuredType: insuredTypeEnum('insured_type').notNull(),
  insuredUserId: uuid('insured_user_id').references(() => profiles.id),
  insuredChildId: uuid('insured_child_id').references(() => assets.id),
})

export const invoiceCredentials = pgTable('InvoiceCredentials', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  userId: uuid('user_id').notNull().references(() => profiles.id),
  barcode: text('barcode').notNull(),
  verificationCodeEncrypted: text('verification_code_encrypted').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Step 2: 確認 TypeScript 無錯誤**

```bash
npx tsc --noEmit
```

預期：0 errors。

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: define Drizzle schema for all tables"
```

---

## Task 3: DB 連線 + Migration

**Files:**
- Create: `drizzle.config.ts`
- Create: `lib/db/client.ts`
- Create: `drizzle/` (generated by drizzle-kit)

- [ ] **Step 1: 建立 `drizzle.config.ts`**

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT!,
  },
} satisfies Config
```

- [ ] **Step 2: 建立 `lib/db/client.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Transaction mode pooler for serverless (pgbouncer=true disables prepared statements)
const client = postgres(process.env.DATABASE_URL!, { prepare: false })

export const db = drizzle(client, { schema })
```

- [ ] **Step 3: 產生 migration**

```bash
npx drizzle-kit generate
```

預期：`drizzle/` 目錄下產生 `0000_*.sql` migration 檔。

- [ ] **Step 4: 套用 migration 到 Supabase**

```bash
npx drizzle-kit migrate
```

預期：Supabase 資料庫出現所有 table（可在 Supabase Dashboard → Table Editor 確認）。

- [ ] **Step 5: Commit**

```bash
git add drizzle.config.ts lib/db/client.ts drizzle/
git commit -m "feat: setup Drizzle config and initial migration"
```

---

## Task 4: Supabase Client Helpers

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/client.ts`

- [ ] **Step 1: 建立 `lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

- [ ] **Step 2: 建立 `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/
git commit -m "feat: add Supabase server and browser client helpers"
```

---

## Task 5: Crypto Utilities（TDD）

**Files:**
- Create: `lib/crypto.ts`
- Create: `__tests__/crypto.test.ts`

- [ ] **Step 1: 寫 failing test**

建立 `__tests__/crypto.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '@/lib/crypto'

describe('crypto', () => {
  it('round-trips a string correctly', () => {
    const plaintext = 'A123456789'
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toBe(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('produces different ciphertext each time (random IV)', () => {
    const plaintext = 'same input'
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext))
  })

  it('throws on tampered ciphertext', () => {
    const ciphertext = encrypt('secret')
    const tampered = ciphertext.slice(0, -4) + 'xxxx'
    expect(() => decrypt(tampered)).toThrow()
  })
})
```

- [ ] **Step 2: 執行確認 test fails**

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) npx vitest run __tests__/crypto.test.ts
```

預期：FAIL（`lib/crypto` not found）。

- [ ] **Step 3: 實作 `lib/crypto.ts`**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length !== 64) throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
  return Buffer.from(key, 'hex')
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [ivHex, authTagHex, encryptedHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}
```

- [ ] **Step 4: 執行確認 test passes**

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) npx vitest run __tests__/crypto.test.ts
```

預期：3 tests passed。

- [ ] **Step 5: Commit**

```bash
git add lib/crypto.ts __tests__/crypto.test.ts
git commit -m "feat: add AES-256-GCM crypto utilities with tests"
```

---

## Task 6: Auth — 登入頁 + OAuth Callback

**Files:**
- Create: `app/sign-in/page.tsx`
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: 建立 `app/auth/callback/route.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
```

- [ ] **Step 2: 建立 `app/sign-in/page.tsx`**

```typescript
'use client'

import { getSupabaseClient } from '@/lib/supabase/client'

export default function SignInPage() {
  const handleSignIn = async () => {
    const supabase = getSupabaseClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Oikos</h1>
        <p className="text-sm text-gray-500">家庭記帳與資產管理</p>
        <button
          onClick={handleSignIn}
          className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          以 Google 帳號登入
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: 在 Supabase Dashboard 設定 Google OAuth**

1. Supabase Dashboard → Authentication → Providers → Google → Enable
2. 填入 Google OAuth Client ID + Secret（從 Google Cloud Console 取得）
3. 複製 Supabase 提供的 Redirect URL → 貼回 Google Cloud Console 的 Authorized redirect URIs

- [ ] **Step 4: 手動測試登入流程**

```
1. npm run dev
2. 開啟 http://localhost:3000/sign-in
3. 點擊「以 Google 帳號登入」
4. 完成 Google OAuth 流程
5. 確認 redirect 到 /dashboard（目前 404，之後建）
6. Supabase Dashboard → Authentication → Users 確認使用者出現
```

- [ ] **Step 5: Commit**

```bash
git add app/sign-in/ app/auth/
git commit -m "feat: add Google OAuth sign-in and callback route"
```

---

## Task 7: Middleware（Auth Guard）

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: 建立 `middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/invite/')

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  if (user && pathname === '/sign-in') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/).*)'],
}
```

- [ ] **Step 2: 建立 `app/page.tsx`（root redirect）**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/dashboard' : '/sign-in')
}
```

- [ ] **Step 3: 建立 Dashboard 佔位頁**

建立 `app/(dashboard)/page.tsx`：

```typescript
export default function DashboardPage() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Dashboard（Phase 1 填充）</h1>
    </main>
  )
}
```

建立 `app/(dashboard)/layout.tsx`：

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')
  return <>{children}</>
}
```

- [ ] **Step 4: 手動測試**

```
1. 未登入狀態下開啟 http://localhost:3000/dashboard
   → 預期：redirect 到 /sign-in
2. 登入後開啟 http://localhost:3000/sign-in
   → 預期：redirect 到 /dashboard
```

- [ ] **Step 5: Commit**

```bash
git add middleware.ts app/page.tsx app/'(dashboard)'/
git commit -m "feat: add auth middleware and dashboard placeholder"
```

---

## Task 8: Profiles Auto-Create Trigger

**Files:**
- 無程式碼檔案，在 Supabase SQL Editor 執行 SQL

- [ ] **Step 1: 在 Supabase SQL Editor 執行 trigger SQL**

```sql
-- 新使用者登入時自動建立 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public."Profiles" (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

- [ ] **Step 2: 手動驗證**

```
1. 在 Supabase Dashboard → Table Editor → Profiles 確認現有測試帳號有記錄
   （若沒有，可手動執行：INSERT INTO public."Profiles" ...）
2. 用新 Google 帳號登入一次
3. 確認 Profiles table 出現新紀錄，display_name 為 Google 帳號名稱
```

- [ ] **Step 3: Commit（僅 commit trigger SQL 為文件）**

建立 `db/triggers/handle_new_user.sql`：

```sql
-- Trigger: auto-create Profile when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public."Profiles" (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

```bash
git add db/
git commit -m "feat: add profiles auto-create trigger SQL"
```

---

## Task 9: Group 建立

**Files:**
- Create: `actions/group.ts`
- Create: `app/setup/page.tsx`

- [ ] **Step 1: 建立 `actions/group.ts`**

```typescript
'use server'

import { db } from '@/lib/db/client'
import { oikosGroups, groupBalance } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { eq, or } from 'drizzle-orm'

export async function getMyGroup() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)

  return group ?? null
}

export async function createGroup(name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const existing = await getMyGroup()
  if (existing) throw new Error('Already in a group')

  const [group] = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(oikosGroups)
      .values({ name, memberA: user.id })
      .returning()

    await tx.insert(groupBalance).values({
      groupId: g.id,
      balance: 0,
      version: 0,
    })

    return [g]
  })

  return group
}
```

- [ ] **Step 2: 建立 `app/setup/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { createGroup } from '@/actions/group'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createGroup(name.trim())
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl bg-white p-8 shadow-sm w-full max-w-sm">
        <h1 className="text-lg font-semibold">建立家庭帳本</h1>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="帳本名稱（例：我們家）"
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
          required
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          建立
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: 在 Dashboard layout 新增 group check**

修改 `app/(dashboard)/layout.tsx`，加入 group 檢查：

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyGroup } from '@/actions/group'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const group = await getMyGroup()
  if (!group) redirect('/setup')

  return <>{children}</>
}
```

- [ ] **Step 4: 手動測試**

```
1. 登入後（尚無 group）→ 應 redirect 到 /setup
2. 填入帳本名稱 → 點「建立」
3. 確認 redirect 到 /dashboard
4. 確認 Supabase Dashboard → OikosGroups 出現新紀錄，GroupBalance 也有 balance=0
```

- [ ] **Step 5: Commit**

```bash
git add actions/group.ts app/setup/
git commit -m "feat: group creation flow with balance initialization"
```

---

## Task 10: Invite Flow（TDD + UI）

**Files:**
- Create: `lib/invite.ts`
- Create: `actions/invite.ts`
- Modify: `app/setup/page.tsx`（加入 invite link 顯示）
- Create: `app/invite/[token]/page.tsx`
- Create: `__tests__/invite.test.ts`

- [ ] **Step 1: 寫 failing tests**

建立 `__tests__/invite.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { validateInviteAcceptance } from '@/lib/invite'

const baseInvite = {
  id: 'inv-1',
  groupId: 'grp-1',
  invitedBy: 'user-a',
  token: 'tok',
  expiresAt: new Date('2099-01-01'),
  acceptedAt: null,
  createdAt: new Date(),
}

const baseGroup = {
  id: 'grp-1',
  name: '我們家',
  memberA: 'user-a',
  memberB: null,
  createdAt: new Date(),
}

describe('validateInviteAcceptance', () => {
  it('returns ok for a valid invite', () => {
    const result = validateInviteAcceptance(baseInvite, baseGroup, 'user-b')
    expect(result).toEqual({ ok: true })
  })

  it('rejects null invite', () => {
    const result = validateInviteAcceptance(null, baseGroup, 'user-b')
    expect(result).toMatchObject({ ok: false })
  })

  it('rejects already-accepted invite', () => {
    const invite = { ...baseInvite, acceptedAt: new Date('2025-01-01') }
    const result = validateInviteAcceptance(invite, baseGroup, 'user-b')
    expect(result).toMatchObject({ ok: false, error: '邀請連結已被使用' })
  })

  it('rejects expired invite', () => {
    const invite = { ...baseInvite, expiresAt: new Date('2000-01-01') }
    const result = validateInviteAcceptance(invite, baseGroup, 'user-b', new Date('2025-01-01'))
    expect(result).toMatchObject({ ok: false, error: '邀請連結已過期' })
  })

  it('rejects when group is full', () => {
    const group = { ...baseGroup, memberB: 'user-c' }
    const result = validateInviteAcceptance(baseInvite, group, 'user-b')
    expect(result).toMatchObject({ ok: false, error: '此帳本已有兩位成員' })
  })

  it('rejects when user is already the creator', () => {
    const result = validateInviteAcceptance(baseInvite, baseGroup, 'user-a')
    expect(result).toMatchObject({ ok: false, error: '你已經是此帳本的成員' })
  })
})
```

- [ ] **Step 2: 執行確認 test fails**

```bash
npx vitest run __tests__/invite.test.ts
```

預期：FAIL（`Cannot find module '@/lib/invite'`）。

- [ ] **Step 3: 建立 `lib/invite.ts`**

```typescript
import { randomBytes } from 'crypto'
import type { groupInvites, oikosGroups } from '@/lib/db/schema'

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function getInviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}/invite/${token}`
}

type Invite = typeof groupInvites.$inferSelect
type Group = typeof oikosGroups.$inferSelect

export type AcceptResult =
  | { ok: true }
  | { ok: false; error: string }

export function validateInviteAcceptance(
  invite: Invite | null,
  group: Group | null,
  userId: string,
  now: Date = new Date()
): AcceptResult {
  if (!invite) return { ok: false, error: '邀請連結無效或已過期' }
  if (invite.acceptedAt) return { ok: false, error: '邀請連結已被使用' }
  if (invite.expiresAt < now) return { ok: false, error: '邀請連結已過期' }
  if (!group) return { ok: false, error: '找不到群組' }
  if (group.memberB !== null) return { ok: false, error: '此帳本已有兩位成員' }
  if (group.memberA === userId) return { ok: false, error: '你已經是此帳本的成員' }
  return { ok: true }
}
```

- [ ] **Step 4: 執行確認 test passes**

```bash
npx vitest run __tests__/invite.test.ts
```

預期：6 tests passed。

- [ ] **Step 5: 建立 `actions/invite.ts`**

```typescript
'use server'

import { db } from '@/lib/db/client'
import { groupInvites, oikosGroups } from '@/lib/db/schema'
import { generateToken, getInviteUrl, validateInviteAcceptance } from '@/lib/invite'
import { createClient } from '@/lib/supabase/server'
import { eq, and, isNull, gt } from 'drizzle-orm'

export async function createInvite(groupId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.insert(groupInvites).values({
    groupId,
    invitedBy: user.id,
    token,
    expiresAt,
  })

  return getInviteUrl(token)
}

export async function acceptInvite(token: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [invite] = await db
    .select()
    .from(groupInvites)
    .where(eq(groupInvites.token, token))
    .limit(1)

  const [group] = invite
    ? await db.select().from(oikosGroups).where(eq(oikosGroups.id, invite.groupId)).limit(1)
    : []

  const result = validateInviteAcceptance(invite ?? null, group ?? null, user.id)
  if (!result.ok) throw new Error(result.error)

  await db.transaction(async (tx) => {
    await tx
      .update(oikosGroups)
      .set({ memberB: user.id })
      .where(eq(oikosGroups.id, invite.groupId))

    await tx
      .update(groupInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(groupInvites.token, token))
  })

  return invite.groupId
}
```

- [ ] **Step 6: 修改 `app/setup/page.tsx`，加入 invite link 顯示**

將 `app/setup/page.tsx` 改為：

```typescript
'use client'

import { useState } from 'react'
import { createGroup } from '@/actions/group'
import { createInvite } from '@/actions/invite'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const [name, setName] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const group = await createGroup(name.trim())
      const url = await createInvite(group.id)
      setInviteUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤')
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (inviteUrl) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col gap-4 rounded-2xl bg-white p-8 shadow-sm w-full max-w-sm">
          <h1 className="text-lg font-semibold">帳本已建立 🎉</h1>
          <p className="text-sm text-gray-600">把下方連結傳給你的伴侶，讓他們加入：</p>
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-700 break-all">
            {inviteUrl}
          </div>
          <button
            onClick={handleCopy}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            {copied ? '已複製！' : '複製連結'}
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-gray-500 underline"
          >
            先進去看看
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl bg-white p-8 shadow-sm w-full max-w-sm">
        <h1 className="text-lg font-semibold">建立家庭帳本</h1>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="帳本名稱（例：我們家）"
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
          required
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          建立
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 7: 建立 `app/invite/[token]/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { acceptInvite } from '@/actions/invite'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/sign-in?next=/invite/${token}`)
  }

  // redirect() throws internally in Next.js — must NOT be inside try/catch
  let error = ''
  try {
    await acceptInvite(token)
  } catch (err) {
    error = err instanceof Error ? err.message : '無法加入帳本'
  }

  if (!error) {
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
        <p className="text-sm text-red-500">{error}</p>
        <a href="/dashboard" className="mt-4 block text-sm text-gray-500 underline">
          回到首頁
        </a>
      </div>
    </main>
  )
}
```

- [ ] **Step 8: 更新 auth callback 支援 `next` redirect**

確認 `app/auth/callback/route.ts` 的 `next` param 已正確讀取（Task 6 已包含）。

- [ ] **Step 9: 手動測試完整 invite flow**

```
1. 帳號 A 登入 → 建立帳本 → 複製 invite link
2. 用私密/無痕視窗以帳號 B 開啟 invite link
3. 帳號 B 登入 → 應自動 redirect 回 invite link → 接受邀請
4. 確認帳號 B redirect 到 /dashboard
5. 確認 OikosGroups.member_b 已更新
6. 用帳號 C 嘗試開啟同一 invite link → 應看到「此帳本已有兩位成員」
```

- [ ] **Step 10: Commit**

```bash
git add lib/invite.ts actions/invite.ts app/setup/ app/invite/ __tests__/invite.test.ts
git commit -m "feat: invite flow with token validation and group-full guard"
```

---

## Task 11: RLS Policies

**Files:**
- Create: `db/rls/policies.sql`（文件用）

- [ ] **Step 1: 在 Supabase SQL Editor 執行以下 RLS SQL**

```sql
-- Enable RLS on all tables
ALTER TABLE "Profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OikosGroups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroupInvites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroupBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashTransactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Settlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CarDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FuelLogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HouseDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChildDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsuranceDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceCredentials" ENABLE ROW LEVEL SECURITY;

-- Profiles: user can read own + partner's profile
CREATE POLICY "profiles_select" ON "Profiles" FOR SELECT USING (
  id = auth.uid() OR id IN (
    SELECT member_a FROM "OikosGroups" WHERE member_b = auth.uid()
    UNION
    SELECT member_b FROM "OikosGroups" WHERE member_a = auth.uid()
  )
);

-- OikosGroups: group members can read
CREATE POLICY "groups_select" ON "OikosGroups" FOR SELECT USING (
  member_a = auth.uid() OR member_b = auth.uid()
);

-- GroupBalance: group members can read
CREATE POLICY "balance_select" ON "GroupBalance" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "OikosGroups" g
    WHERE g.id = "GroupBalance".group_id
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

-- CashTransactions: group members can read non-deleted
CREATE POLICY "transactions_select" ON "CashTransactions" FOR SELECT USING (
  deleted_at IS NULL AND
  EXISTS (
    SELECT 1 FROM "OikosGroups" g
    WHERE g.id = "CashTransactions".group_id
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

-- Settlements: group members can read non-deleted
CREATE POLICY "settlements_select" ON "Settlements" FOR SELECT USING (
  deleted_at IS NULL AND
  EXISTS (
    SELECT 1 FROM "OikosGroups" g
    WHERE g.id = "Settlements".group_id
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

-- Assets: group members can read non-deleted
CREATE POLICY "assets_select" ON "Assets" FOR SELECT USING (
  deleted_at IS NULL AND
  EXISTS (
    SELECT 1 FROM "OikosGroups" g
    WHERE g.id = "Assets".group_id
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

-- Detail tables: accessible if parent asset is accessible
CREATE POLICY "car_details_select" ON "CarDetails" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "Assets" a JOIN "OikosGroups" g ON g.id = a.group_id
    WHERE a.id = "CarDetails".asset_id AND a.deleted_at IS NULL
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

CREATE POLICY "fuel_logs_select" ON "FuelLogs" FOR SELECT USING (
  deleted_at IS NULL AND
  EXISTS (
    SELECT 1 FROM "Assets" a JOIN "OikosGroups" g ON g.id = a.group_id
    WHERE a.id = "FuelLogs".asset_id AND a.deleted_at IS NULL
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

CREATE POLICY "house_details_select" ON "HouseDetails" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "Assets" a JOIN "OikosGroups" g ON g.id = a.group_id
    WHERE a.id = "HouseDetails".asset_id AND a.deleted_at IS NULL
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

CREATE POLICY "child_details_select" ON "ChildDetails" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "Assets" a JOIN "OikosGroups" g ON g.id = a.group_id
    WHERE a.id = "ChildDetails".asset_id AND a.deleted_at IS NULL
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

CREATE POLICY "insurance_details_select" ON "InsuranceDetails" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "Assets" a JOIN "OikosGroups" g ON g.id = a.group_id
    WHERE a.id = "InsuranceDetails".asset_id AND a.deleted_at IS NULL
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

-- GroupInvites: creator can read
CREATE POLICY "invites_select" ON "GroupInvites" FOR SELECT USING (
  invited_by = auth.uid()
);

-- InvoiceCredentials: group members can read
CREATE POLICY "invoice_creds_select" ON "InvoiceCredentials" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "OikosGroups" g
    WHERE g.id = "InvoiceCredentials".group_id
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);
```

- [ ] **Step 2: 手動驗證 RLS 生效**

在 Supabase SQL Editor 以帳號 B 的 JWT 測試（或透過 Supabase Policies 的 Test 功能）：

```sql
-- 模擬帳號 B 查詢（替換 <user_b_id>）
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub TO '<user_b_id>';
SELECT * FROM "CashTransactions"; -- 應返回 0 rows（Phase 1 還沒有資料）
SELECT * FROM "OikosGroups";      -- 應只返回自己的 group
```

- [ ] **Step 3: 儲存 RLS SQL 文件並 commit**

```bash
mkdir -p db/rls
# 把 Step 1 的 SQL 存到 db/rls/policies.sql
git add db/rls/
git commit -m "feat: add RLS policies for all tables"
```

---

## Task 12: PWA Manifest

**Files:**
- Create: `public/manifest.json`
- Create: `public/icons/icon-192.png`（需準備）
- Create: `public/icons/icon-512.png`（需準備）
- Modify: `app/layout.tsx`

- [ ] **Step 1: 建立 `public/manifest.json`**

```json
{
  "name": "Oikos 家庭帳本",
  "short_name": "Oikos",
  "description": "家庭記帳與資產管理",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 2: 準備 PWA icons**

```bash
# 若有設計稿，匯出 192x192 和 512x512 PNG 放到 public/icons/
# 若暫時用佔位：
mkdir -p public/icons
# 用任何圖片工具產生兩個純色佔位 PNG，或：
npx sharp-cli resize 192 192 --input any-logo.png --output public/icons/icon-192.png
npx sharp-cli resize 512 512 --input any-logo.png --output public/icons/icon-512.png
```

- [ ] **Step 3: 修改 `app/layout.tsx`，加入 PWA meta tags**

```typescript
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Oikos',
  description: '家庭記帳與資產管理',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Oikos',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: 手動測試 PWA**

```
1. npm run build && npm start（或 deploy 到 Vercel）
2. 在 Chrome DevTools → Application → Manifest 確認 manifest 載入正確
3. 在 iOS Safari 點「加入主畫面」確認可安裝
```

- [ ] **Step 5: Commit**

```bash
git add public/ app/layout.tsx
git commit -m "feat: add PWA manifest and meta tags"
```

---

## Task 13: 全部測試 + 最終手動驗收

- [ ] **Step 1: 執行所有 tests**

```bash
npx vitest run
```

預期：全部 pass（crypto.test.ts 3 tests, invite.test.ts 6 tests）。

- [ ] **Step 2: typecheck**

```bash
npx tsc --noEmit
```

預期：0 errors。

- [ ] **Step 3: 完整 E2E 手動驗收**

```
□ 帳號 A 前往 / → redirect /sign-in
□ 帳號 A Google 登入 → redirect /setup（無 group）
□ 帳號 A 建立帳本「我們家」→ 顯示 invite link
□ 帳號 A 複製 invite link
□ 帳號 B 打開 invite link → redirect /sign-in（未登入）
□ 帳號 B Google 登入 → redirect 回 invite link → 自動接受 → redirect /dashboard
□ Supabase OikosGroups.member_b 已有帳號 B 的 id
□ 帳號 C 打開同一 invite link → 看到「此帳本已有兩位成員」
□ 手機 Chrome 加到主畫面 → 以 standalone 模式開啟正常
```

- [ ] **Step 4: 最終 commit**

```bash
git add -A
git commit -m "chore: phase 0 complete — auth, group, invite, RLS, PWA"
```
