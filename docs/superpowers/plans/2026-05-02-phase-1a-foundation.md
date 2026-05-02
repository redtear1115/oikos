# Phase 1a — 核心記帳 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working vertical slice — user signs in, sees dashboard with brand header / balance hero / recent transactions list / bottom nav, adds transactions via a polished bottom sheet (custom numpad + mini calendar + 9 categories + split selector), sees balance update, logs out from settings.

**Architecture:** Next.js 15 App Router. Server components fetch initial data (balance + recent N). Server actions mutate (createTransaction → atomic insert + GroupBalance recalc). Pure lib functions for balance / settlement chip / category lookup are TDD'd with vitest. Client components manage sheet open state. Bottom sheet = fixed-position overlay with React state (no external lib).

**Tech Stack:** Next.js 16.2 App Router · React 19 · Tailwind v4 (CSS-first config) · Drizzle ORM · Supabase (Postgres + Auth) · Vitest + jsdom + @testing-library/react · `next/font` for Fraunces + Noto Sans TC.

**Visual reference:** Imported design canvas (`docs/superpowers/brainstorms/2026-05-02-phase-1/` for screen mockups; designer source archived at `/tmp/futari-design/`). Color tokens, typography, layout, and component anatomy below override the [Phase 1 design spec](../specs/2026-05-02-phase-1-transactions-design.md) §1.2 (palette) and §8.1 (categories).

**Out of scope for Phase 1a (deferred to 1b / 1c / 1d / 1e):**

- Edit / delete transaction (1b)
- List pagination + month grouping (1b)
- Settlement actually wired up — buttons present but stub-only (1c)
- Filter bottom sheet (1d)
- Full settings page (1d)
- Real-time subscriptions (1e)
- Analysis page with charts (1f — new sub-phase)
- Asset linking from add sheet — picker absent (Phase 2)
- Asset list / details (Phase 2)
- pg_cron cleanup (1e)

The bottom nav has 4 tabs but only `首頁` and `設定` are functional in 1a. `紀錄` and `資產` route to a "即將推出" placeholder page.

---

## Design tokens (authoritative for Phase 1a)

### Color palette (from designer mockup)

```
--bg:           #FBEDE0   /* warm peach background */
--surface:      #FFFFFF   /* cards */
--surface-alt:  #FFF6EC   /* subtle alt surface */
--ink:          #3A2419   /* dark brown — primary text & primary button */
--ink-2:        #7A5848   /* secondary text */
--ink-3:        #B89C8B   /* tertiary / labels / hairline-friendly */
--hairline:     rgba(58, 36, 25, 0.10)
--accent:       #E08856   /* coral — accent button, links, member B avatar */
--accent-soft:  #F8D9C2
--credit:       #7A9F7E   /* sage — positive (對方欠你) */
--credit-soft:  #DDEAD8
--debit:        #D17561   /* clay — negative (你欠對方) */
--me-color:     #3A2419   /* member A avatar bg */
--them-color:   #E08856   /* member B avatar bg */
```

### Typography

- **Headings**: `"Fraunces", Georgia, serif` (weights 400, 500, 600, opsz 9..144)
- **Body / UI**: `"Noto Sans TC", -apple-system, system-ui, sans-serif` (weights 400, 500, 600, 700)
- **Numbers** (amounts, dates): `-apple-system, "SF Pro Display", system-ui` with `font-feature-settings: "tnum"` for tabular figures

Loaded via `next/font/google` in `app/layout.tsx`.

### Categories (9 hardcoded — supersedes spec §8.1)

| id | label | mono | tint | ink | chart |
|---|---|---|---|---|---|
| `food` | 餐飲 | 餐 | `#FBDCC4` | `#8A4A26` | `#D4955F` |
| `transit` | 交通 | 交 | `#E2E0F0` | `#54527A` | `#8E8AB8` |
| `daily` | 日用品 | 日 | `#F4E5C8` | `#7A5A28` | `#C9A664` |
| `fun` | 娛樂 | 娛 | `#F7D8DD` | `#8A3F50` | `#C97A8E` |
| `health` | 醫療 | 醫 | `#D7E5DC` | `#3F6A56` | `#7AA48E` |
| `home` | 居家 | 家 | `#EFE3D0` | `#7A5A38` | `#A89274` |
| `gift` | 禮物 | 禮 | `#E9D8EE` | `#5F3F76` | `#9E7AB2` |
| `other` | 其他 | 其 | `#EDE3D7` | `#7A6A5A` | `#A8998A` |
| `settle` | 還款 | ↺ | `#F8DCC9` | `#A8542A` | `#D17561` |

`settle` is reserved for Settlement records (Phase 1c) — Phase 1a uses 1-8 in the Add sheet picker.

### Member identification

- `member_a` (group creator): avatar bg `--ink` (#3A2419), text `#FFFFFF`, derived initial from `display_name[0]`
- `member_b`: avatar bg `--accent` (#E08856), text `#FFFFFF`, derived initial from `display_name[0]`
- Viewer perspective: `viewer.id === group.member_a ? 'M' : 'T'` for `who` prop

---

## Task 1: Tailwind tokens, fonts, brand metadata

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `public/manifest.json`

- [ ] **Step 1: Replace `app/globals.css` with Futari tokens**

```css
@import "tailwindcss";

:root {
  --bg: #FBEDE0;
  --surface: #FFFFFF;
  --surface-alt: #FFF6EC;
  --ink: #3A2419;
  --ink-2: #7A5848;
  --ink-3: #B89C8B;
  --hairline: rgba(58, 36, 25, 0.10);
  --accent: #E08856;
  --accent-soft: #F8D9C2;
  --credit: #7A9F7E;
  --credit-soft: #DDEAD8;
  --debit: #D17561;
  --me-color: #3A2419;
  --them-color: #E08856;
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-alt: var(--surface-alt);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-accent: var(--accent);
  --color-accent-soft: var(--accent-soft);
  --color-credit: var(--credit);
  --color-credit-soft: var(--credit-soft);
  --color-debit: var(--debit);
  --color-me: var(--me-color);
  --color-them: var(--them-color);
  --font-serif: var(--font-fraunces);
  --font-sans: var(--font-noto-tc);
  --font-numeric: -apple-system, "SF Pro Display", system-ui;
}

html, body { margin: 0; padding: 0; background: var(--bg); }
body {
  color: var(--ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
*::-webkit-scrollbar { display: none; }
.tnum { font-feature-settings: "tnum"; }

@keyframes blink { 50% { opacity: 0; } }
.animate-blink { animation: blink 1s step-end infinite; }
```

- [ ] **Step 2: Replace `app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from 'next'
import { Fraunces, Noto_Sans_TC } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-fraunces',
  display: 'swap',
})

const notoTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-tc',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Futari',
  description: 'ふたり ・ 家計簿 — 兩個人的記帳本',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Futari',
  },
}

export const viewport: Viewport = {
  themeColor: '#FBEDE0',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={`${fraunces.variable} ${notoTC.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Update `public/manifest.json`**

Read the current file first, then change `name` and `short_name` from "Oikos" to "Futari", and `theme_color` / `background_color` to `#FBEDE0`. Leave the rest (icons, display) unchanged.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds, no font/css errors. Pages still render (visit `/` after `npm run dev` — should be peach background, no Arial fallback).

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx public/manifest.json
git commit -m "feat(brand): apply Futari design tokens, fonts, manifest"
```

---

## Task 2: Categories module (TDD)

**Files:**
- Create: `lib/categories.ts`
- Create: `__tests__/categories.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// __tests__/categories.test.ts
import { describe, it, expect } from 'vitest'
import { CATEGORIES, getCategory, isValidCategoryId } from '@/lib/categories'

describe('CATEGORIES', () => {
  it('has exactly 9 entries', () => {
    expect(CATEGORIES).toHaveLength(9)
  })

  it('each entry has required fields', () => {
    for (const c of CATEGORIES) {
      expect(c.id).toMatch(/^[a-z]+$/)
      expect(c.label).toBeTruthy()
      expect(c.mono).toBeTruthy()
      expect(c.tint).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.ink).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.chart).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('contains expected ids', () => {
    const ids = CATEGORIES.map(c => c.id)
    expect(ids).toEqual(['food', 'transit', 'daily', 'fun', 'health', 'home', 'gift', 'other', 'settle'])
  })
})

describe('getCategory', () => {
  it('returns category by id', () => {
    expect(getCategory('food').label).toBe('餐飲')
  })

  it('returns "other" for unknown id', () => {
    expect(getCategory('nonexistent').id).toBe('other')
  })
})

describe('isValidCategoryId', () => {
  it('returns true for known ids', () => {
    expect(isValidCategoryId('food')).toBe(true)
    expect(isValidCategoryId('settle')).toBe(true)
  })
  it('returns false for unknown', () => {
    expect(isValidCategoryId('xyz')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/categories.test.ts`
Expected: FAIL with "Cannot find module '@/lib/categories'"

- [ ] **Step 3: Implement `lib/categories.ts`**

```ts
export type CategoryId =
  | 'food' | 'transit' | 'daily' | 'fun'
  | 'health' | 'home' | 'gift' | 'other' | 'settle'

export interface Category {
  id: CategoryId
  label: string
  mono: string  // single-char monogram
  tint: string  // chip background
  ink: string   // chip text
  chart: string // analysis charts
}

export const CATEGORIES: Category[] = [
  { id: 'food',    label: '餐飲',   mono: '餐', tint: '#FBDCC4', ink: '#8A4A26', chart: '#D4955F' },
  { id: 'transit', label: '交通',   mono: '交', tint: '#E2E0F0', ink: '#54527A', chart: '#8E8AB8' },
  { id: 'daily',   label: '日用品', mono: '日', tint: '#F4E5C8', ink: '#7A5A28', chart: '#C9A664' },
  { id: 'fun',     label: '娛樂',   mono: '娛', tint: '#F7D8DD', ink: '#8A3F50', chart: '#C97A8E' },
  { id: 'health',  label: '醫療',   mono: '醫', tint: '#D7E5DC', ink: '#3F6A56', chart: '#7AA48E' },
  { id: 'home',    label: '居家',   mono: '家', tint: '#EFE3D0', ink: '#7A5A38', chart: '#A89274' },
  { id: 'gift',    label: '禮物',   mono: '禮', tint: '#E9D8EE', ink: '#5F3F76', chart: '#9E7AB2' },
  { id: 'other',   label: '其他',   mono: '其', tint: '#EDE3D7', ink: '#7A6A5A', chart: '#A8998A' },
  { id: 'settle',  label: '還款',   mono: '↺', tint: '#F8DCC9', ink: '#A8542A', chart: '#D17561' },
]

const BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c])) as Record<CategoryId, Category>
const OTHER = BY_ID.other

export function getCategory(id: string): Category {
  return BY_ID[id as CategoryId] ?? OTHER
}

export function isValidCategoryId(id: string): boolean {
  return id in BY_ID
}

// Categories shown in Add sheet (excludes 'settle' — auto-applied for settlements only)
export const PICKABLE_CATEGORIES = CATEGORIES.filter(c => c.id !== 'settle')
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/categories.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/categories.ts __tests__/categories.test.ts
git commit -m "feat(lib): add 9-category module with display tokens"
```

---

## Task 3: Balance math (TDD)

Pure functions for the balance computation per [design spec §9.1](../specs/2026-05-02-phase-1-transactions-design.md). Used both client-side (preview in Add sheet "對方欠你 NT$ X") and as the basis for the SQL recalc.

**Files:**
- Create: `lib/balance.ts`
- Create: `__tests__/balance.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// __tests__/balance.test.ts
import { describe, it, expect } from 'vitest'
import { transactionDelta, settlementDelta, computeBalance } from '@/lib/balance'

describe('transactionDelta — from member_a perspective', () => {
  it('all_mine paid by A → 0', () => {
    expect(transactionDelta({ amount: 100, splitType: 'all_mine', payerIs: 'a' })).toBe(0)
  })
  it('all_mine paid by B → 0', () => {
    expect(transactionDelta({ amount: 100, splitType: 'all_mine', payerIs: 'b' })).toBe(0)
  })
  it('all_theirs paid by A → +amount (B owes A full)', () => {
    expect(transactionDelta({ amount: 100, splitType: 'all_theirs', payerIs: 'a' })).toBe(100)
  })
  it('all_theirs paid by B → −amount (A owes B full)', () => {
    expect(transactionDelta({ amount: 100, splitType: 'all_theirs', payerIs: 'b' })).toBe(-100)
  })
  it('half paid by A → +ceil(amount/2)', () => {
    expect(transactionDelta({ amount: 101, splitType: 'half', payerIs: 'a' })).toBe(51)
  })
  it('half paid by B → −ceil(amount/2)', () => {
    expect(transactionDelta({ amount: 101, splitType: 'half', payerIs: 'b' })).toBe(-51)
  })
  it('half even amount uses exact half', () => {
    expect(transactionDelta({ amount: 100, splitType: 'half', payerIs: 'a' })).toBe(50)
  })
})

describe('settlementDelta', () => {
  it('A pays settlement → −amount (A reduces what B owes them OR pays down debt)', () => {
    expect(settlementDelta({ amount: 200, payerIs: 'a' })).toBe(-200)
  })
  it('B pays settlement → +amount', () => {
    expect(settlementDelta({ amount: 200, payerIs: 'b' })).toBe(200)
  })
})

describe('computeBalance', () => {
  it('empty → 0', () => {
    expect(computeBalance({ transactions: [], settlements: [] })).toBe(0)
  })

  it('single half tx by A → +ceil(amount/2)', () => {
    const balance = computeBalance({
      transactions: [{ amount: 240, splitType: 'half', payerIs: 'a' }],
      settlements: [],
    })
    expect(balance).toBe(120)
  })

  it('mixed transactions + settlement', () => {
    const balance = computeBalance({
      transactions: [
        { amount: 200, splitType: 'half', payerIs: 'a' },     // +100
        { amount: 100, splitType: 'all_theirs', payerIs: 'b' },// -100
        { amount: 50,  splitType: 'all_mine', payerIs: 'a' }, // 0
      ],
      settlements: [
        { amount: 50, payerIs: 'b' }, // +50
      ],
    })
    expect(balance).toBe(50)
  })

  it('viewerBalance flips for member_b', () => {
    const balance = 120  // member_b owes member_a 120
    const memberAView = balance              // 120 (you are owed)
    const memberBView = -balance             // -120 (you owe)
    expect(memberAView).toBe(120)
    expect(memberBView).toBe(-120)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/balance.test.ts`
Expected: FAIL with "Cannot find module '@/lib/balance'"

- [ ] **Step 3: Implement `lib/balance.ts`**

```ts
export type SplitType = 'all_mine' | 'all_theirs' | 'half'
export type PayerIs = 'a' | 'b'  // is the payer member_a or member_b?

export interface TxDelta {
  amount: number   // integer NTD
  splitType: SplitType
  payerIs: PayerIs
}

export interface SettlementDelta {
  amount: number
  payerIs: PayerIs
}

/**
 * Delta to "balance" (member_a's perspective).
 * Positive = member_b owes member_a. Negative = member_a owes member_b.
 * `half` uses ceil(amount/2) so payer benefits from odd cents.
 */
export function transactionDelta({ amount, splitType, payerIs }: TxDelta): number {
  if (splitType === 'all_mine') return 0
  const owedToPayer = splitType === 'all_theirs' ? amount : Math.ceil(amount / 2)
  return payerIs === 'a' ? owedToPayer : -owedToPayer
}

/**
 * Settlement delta. The payer is paying down what they owe.
 * A pays B → A's debt decreases → balance moves negative.
 * B pays A → B's debt decreases → balance moves positive.
 */
export function settlementDelta({ amount, payerIs }: SettlementDelta): number {
  return payerIs === 'a' ? -amount : amount
}

export function computeBalance(input: {
  transactions: TxDelta[]
  settlements: SettlementDelta[]
}): number {
  let net = 0
  for (const t of input.transactions) net += transactionDelta(t)
  for (const s of input.settlements) net += settlementDelta(s)
  return net
}

/**
 * Flip raw balance to viewer perspective.
 * Returns positive if `viewerIsA` and balance > 0 (you are owed),
 * or `!viewerIsA` and balance < 0 (you are owed by a).
 */
export function viewerBalance(rawBalance: number, viewerIsA: boolean): number {
  return viewerIsA ? rawBalance : -rawBalance
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/balance.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/balance.ts __tests__/balance.test.ts
git commit -m "feat(lib): pure balance math with viewer-flipped perspective"
```

---

## Task 4: Settlement chip math (TDD)

Even though Settlement isn't wired up in 1a, ship the pure function for use in 1c and the dashboard balance preview.

**Files:**
- Create: `lib/settlement.ts`
- Create: `__tests__/settlement.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// __tests__/settlement.test.ts
import { describe, it, expect } from 'vitest'
import { settlementChips } from '@/lib/settlement'

describe('settlementChips', () => {
  it('returns 3 chips for normal debt', () => {
    const chips = settlementChips(461)
    expect(chips).toHaveLength(3)
    expect(chips[0]).toEqual({ label: '全額', value: 461 })
    expect(chips[1]).toEqual({ label: '一半', value: 231 })
    expect(chips[2]).toEqual({ label: '整數', value: 400 })
  })

  it('hides 整數 chip when debt < 100', () => {
    const chips = settlementChips(75)
    expect(chips).toHaveLength(2)
    expect(chips.map(c => c.label)).toEqual(['全額', '一半'])
  })

  it('hides 整數 chip when it equals 全額', () => {
    const chips = settlementChips(200)  // 整數 would be 200, same as 全額
    expect(chips.map(c => c.label)).toEqual(['全額', '一半'])
  })

  it('整數 rounds down when up would exceed debt', () => {
    expect(settlementChips(150)[2]).toEqual({ label: '整數', value: 100 })
  })

  it('一半 uses ceil for odd', () => {
    expect(settlementChips(101)[1]).toEqual({ label: '一半', value: 51 })
  })

  it('returns empty array when debt is 0', () => {
    expect(settlementChips(0)).toEqual([])
  })

  it('rejects negative input by treating as 0', () => {
    expect(settlementChips(-100)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/settlement.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/settlement.ts`**

```ts
export interface SettlementChip {
  label: string
  value: number
}

/**
 * Quick-pick chip values for partial settlement.
 * D = current debt amount (positive). Returns [全額, 一半, 整數].
 * 整數 is hidden if it equals 全額 or if D < 100.
 */
export function settlementChips(debt: number): SettlementChip[] {
  if (debt <= 0) return []

  const full = debt
  const half = Math.ceil(debt / 2)

  // 整數: round to nearest 100 ≤ debt
  let round = Math.round(debt / 100) * 100
  if (round > debt) round = Math.floor(debt / 100) * 100

  const chips: SettlementChip[] = [
    { label: '全額', value: full },
    { label: '一半', value: half },
  ]
  if (round >= 100 && round !== full) {
    chips.push({ label: '整數', value: round })
  }
  return chips
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/settlement.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/settlement.ts __tests__/settlement.test.ts
git commit -m "feat(lib): settlement quick-pick chip math"
```

---

## Task 5: Brand & shared visual components

Build small reusable components that match designer's `oikosTheme`. These are used across multiple screens.

**Files:**
- Create: `app/(dashboard)/_components/FutariMark.tsx`
- Create: `app/(dashboard)/_components/Avatar.tsx`
- Create: `app/(dashboard)/_components/CategoryChip.tsx`

- [ ] **Step 1: Create `FutariMark.tsx`**

```tsx
interface Props { size?: number }

export function FutariMark({ size = 44 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="29.5"
        stroke="var(--accent)" strokeOpacity="0.30" strokeWidth="1.3"
        strokeDasharray="1.5 3" fill="none" />
      <circle cx="56.5" cy="14.5" r="2.2" fill="var(--accent)" />
      <path d="M 8.5 49 a 2.6 2.6 0 1 0 2.4 -2 a 2 2 0 0 1 -2.4 2 z"
        fill="var(--accent)" opacity="0.85" />
      <path d="M 32 54 C 22 47, 12 40, 12 30 C 12 23, 17 19, 22 19 C 27 19, 30 22, 32 26 Z"
        fill="var(--ink)" />
      <circle cx="20" cy="14" r="5" fill="var(--ink)" />
      <path d="M 32 54 C 42 47, 52 40, 52 30 C 52 23, 47 19, 42 19 C 37 19, 34 22, 32 26 Z"
        fill="var(--accent)" />
      <circle cx="44" cy="14" r="5" fill="var(--accent)" />
    </svg>
  )
}
```

- [ ] **Step 2: Create `Avatar.tsx`**

```tsx
interface Props {
  who: 'M' | 'T'           // viewer-relative: M = me, T = them (the partner)
  initial: string          // display_name[0] (uppercase recommended)
  size?: number
  ring?: boolean
}

export function Avatar({ who, initial, size = 28, ring = false }: Props) {
  const bg = who === 'M' ? 'var(--me-color)' : 'var(--them-color)'
  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        boxShadow: ring ? '0 0 0 2px var(--bg)' : 'none',
      }}
      className="rounded-full text-white flex items-center justify-center font-semibold tracking-tight shrink-0"
    >
      <span style={{ background: bg }} className="rounded-full w-full h-full flex items-center justify-center">
        {initial}
      </span>
    </div>
  )
}
```

Note: the inner span pattern handles bg without conflicting with shadow. Adjust if the visual breaks.

- [ ] **Step 3: Create `CategoryChip.tsx`**

```tsx
import { getCategory } from '@/lib/categories'

interface Props {
  categoryId: string
  size?: number
}

export function CategoryChip({ categoryId, size = 36 }: Props) {
  const c = getCategory(categoryId)
  return (
    <div
      style={{
        width: size,
        height: size,
        background: c.tint,
        color: c.ink,
        fontSize: size * 0.46,
      }}
      className="rounded-[10px] flex items-center justify-center font-medium shrink-0"
    >
      {c.mono}
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds (no usages yet, but type-checks).

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/_components/
git commit -m "feat(ui): FutariMark, Avatar, CategoryChip primitives"
```

---

## Task 6: Bottom nav shell (4 tab + center FAB)

The shell that wraps all dashboard-area screens. In Phase 1a only `首頁` and `設定` are functional; `紀錄` and `資產` link to a placeholder.

**Files:**
- Create: `app/(dashboard)/_components/BottomNav.tsx`
- Create: `app/(dashboard)/_components/HomeIndicator.tsx`
- Create: `app/(dashboard)/_components/PlusIcon.tsx`
- Create: `app/(dashboard)/_components/TabIcons.tsx`
- Create: `app/(dashboard)/coming-soon/page.tsx`

- [ ] **Step 1: Create `PlusIcon.tsx`**

```tsx
export function PlusIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
```

- [ ] **Step 2: Create `TabIcons.tsx`**

Copy 4 SVG icons from `screens-shared.jsx` lines 142-201: `NavHomeIcon`, `NavListIcon`, `NavAssetsIcon`, `NavSettingsIcon`. Each takes `{ active: boolean; color: string }` props. Convert to TSX. Export as named functions.

- [ ] **Step 3: Create `HomeIndicator.tsx`**

```tsx
export function HomeIndicator() {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-[100] h-[22px] flex justify-center items-end pb-[6px] pointer-events-none">
      <div className="w-[130px] h-1 rounded-full" style={{ background: 'rgba(31,27,22,0.32)' }} />
    </div>
  )
}
```

- [ ] **Step 4: Create `BottomNav.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PlusIcon } from './PlusIcon'
import { HomeIndicator } from './HomeIndicator'
import { NavHomeIcon, NavListIcon, NavAssetsIcon, NavSettingsIcon } from './TabIcons'

interface Props {
  onAddClick: () => void
}

const TABS = [
  { id: 'home', label: '首頁', href: '/dashboard', icon: NavHomeIcon },
  { id: 'list', label: '紀錄', href: '/coming-soon?next=list', icon: NavListIcon },
  { id: 'assets', label: '資產', href: '/coming-soon?next=assets', icon: NavAssetsIcon },
  { id: 'settings', label: '設定', href: '/settings', icon: NavSettingsIcon },
] as const

export function BottomNav({ onAddClick }: Props) {
  const pathname = usePathname()
  // For Phase 1a the only "active" pathnames are dashboard and settings; coming-soon
  // doesn't bother to highlight 紀錄/資產 because the page is a placeholder.
  const activeId =
    pathname === '/dashboard' ? 'home' :
    pathname === '/settings' ? 'settings' :
    'home'

  return (
    <>
      <div className="absolute left-0 right-0 bottom-0 z-[80] h-[78px] flex pb-[22px]"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--hairline)' }}>
        <NavTab tab={TABS[0]} active={activeId === 'home'} />
        <NavTab tab={TABS[1]} active={activeId === 'list'} />
        <div className="w-[76px] shrink-0" />
        <NavTab tab={TABS[2]} active={activeId === 'assets'} />
        <NavTab tab={TABS[3]} active={activeId === 'settings'} />
      </div>

      <button
        onClick={onAddClick}
        className="absolute left-1/2 bottom-[30px] z-[85] -translate-x-1/2 w-[60px] h-[60px] rounded-full border-0 flex items-center justify-center cursor-pointer"
        style={{
          background: 'var(--ink)',
          color: '#fff',
          boxShadow: '0 8px 22px rgba(31,27,22,0.28), 0 0 0 5px var(--surface)',
        }}>
        <PlusIcon size={26} />
      </button>

      <HomeIndicator />
    </>
  )
}

function NavTab({ tab, active }: { tab: typeof TABS[number]; active: boolean }) {
  const Icon = tab.icon
  const color = active ? 'var(--ink)' : 'var(--ink-3)'
  return (
    <Link href={tab.href} className="flex-1 flex flex-col items-center justify-center gap-1 pt-2 no-underline"
      style={{ color }}>
      <Icon active={active} color={active ? '#3A2419' : '#B89C8B'} />
      <span className="text-[10px] tracking-[0.4px]" style={{ fontWeight: active ? 600 : 400 }}>
        {tab.label}
      </span>
    </Link>
  )
}
```

- [ ] **Step 5: Create `app/(dashboard)/coming-soon/page.tsx`**

```tsx
import Link from 'next/link'

export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const labels: Record<string, string> = { list: '紀錄', assets: '資產' }
  const label = labels[next ?? ''] ?? '此功能'

  return (
    <main className="min-h-screen flex items-center justify-center px-8">
      <div className="text-center">
        <h1 className="text-2xl font-medium mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
          {label} 即將推出
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--ink-3)' }}>
          先回首頁記一筆吧。
        </p>
        <Link href="/dashboard" className="inline-block px-6 py-3 rounded-xl text-white"
          style={{ background: 'var(--ink)' }}>
          回首頁
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add app/\(dashboard\)/_components/ app/\(dashboard\)/coming-soon/
git commit -m "feat(nav): bottom nav shell with 4 tabs + center FAB"
```

---

## Task 7: Recalc balance — DB query helper

The atomic balance recalculation called from any transaction/settlement mutation. Mirrors design spec §9.1 SQL but written via Drizzle.

**Files:**
- Create: `lib/db/queries/balance.ts`

- [ ] **Step 1: Create the file**

```ts
import { sql } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'

/**
 * Recompute and persist GroupBalance from active transactions + settlements.
 * MUST be called within the same DB transaction as any mutating write.
 * Pass `tx` if running inside a Drizzle transaction; falls back to `db` otherwise.
 */
export async function recalcGroupBalance(
  groupId: string,
  tx: typeof db | PgTransaction<any, any, any> = db,
): Promise<void> {
  await tx.execute(sql`
    UPDATE "GroupBalance"
    SET balance = (
      SELECT COALESCE(SUM(
        CASE
          WHEN paid_by = (SELECT member_a FROM "OikosGroups" WHERE id = ${groupId})
            THEN CASE split_type
              WHEN 'all_mine'   THEN 0
              WHEN 'all_theirs' THEN amount
              WHEN 'half'       THEN CEIL(amount / 2.0)::int
            END
          ELSE CASE split_type
              WHEN 'all_mine'   THEN 0
              WHEN 'all_theirs' THEN -amount
              WHEN 'half'       THEN -CEIL(amount / 2.0)::int
            END
        END
      ), 0)
      FROM "CashTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
    ) - (
      SELECT COALESCE(SUM(
        CASE
          WHEN paid_by = (SELECT member_a FROM "OikosGroups" WHERE id = ${groupId}) THEN amount
          ELSE -amount
        END
      ), 0)
      FROM "Settlements"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
    ),
    version = version + 1,
    last_calculated_at = NOW()
    WHERE group_id = ${groupId};
  `)
}

export async function getGroupBalance(groupId: string): Promise<number> {
  const rows = await db.execute<{ balance: number }>(sql`
    SELECT balance FROM "GroupBalance" WHERE group_id = ${groupId} LIMIT 1
  `)
  return rows[0]?.balance ?? 0
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass. (No tests for SQL — covered by manual E2E in Task 20.)

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/balance.ts
git commit -m "feat(db): recalcGroupBalance helper"
```

---

## Task 8: createTransaction server action

**Files:**
- Create: `actions/transaction.ts`

- [ ] **Step 1: Create the file**

```ts
'use server'

import { db } from '@/lib/db/client'
import { cashTransactions, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { isValidCategoryId, type CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { eq, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export interface CreateTransactionInput {
  amount: number              // integer NTD, > 0
  description: string         // required, non-empty after trim
  category: CategoryId | string  // 'other' fallback if invalid
  splitType: SplitType
  payerId: string             // user.id of payer (must be in group)
  transactedAt: Date
}

export async function createTransaction(input: CreateTransactionInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Validate
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('金額必須是正整數')
  }
  const description = input.description.trim()
  if (!description) throw new Error('描述不能為空')
  const category = isValidCategoryId(input.category) ? input.category : 'other'

  // Find viewer's group
  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  // Payer must be in group
  if (input.payerId !== group.memberA && input.payerId !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }

  const [created] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        paidBy: input.payerId,
        amount: input.amount,
        splitType: input.splitType,
        description,
        category,
        transactedAt: input.transactedAt,
      })
      .returning({ id: cashTransactions.id })
    await recalcGroupBalance(group.id, tx)
    return inserted
  })

  revalidatePath('/dashboard')
  return { id: created.id }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add actions/transaction.ts
git commit -m "feat(actions): createTransaction with atomic balance recalc"
```

---

## Task 9: softDeleteTransaction server action

Used by editing flow (Phase 1b) and direct delete (Phase 1b). Phase 1a still ships it because the API surface is small and isolated.

**Files:**
- Modify: `actions/transaction.ts`

- [ ] **Step 1: Append to `actions/transaction.ts`**

```ts
export async function softDeleteTransaction(transactionId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(cashTransactions)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(cashTransactions.id, transactionId),
        eq(cashTransactions.groupId, group.id),
        isNull(cashTransactions.deletedAt),
      ))
      .returning({ id: cashTransactions.id })
    if (updated.length === 0) throw new Error('找不到該筆紀錄')
    await recalcGroupBalance(group.id, tx)
  })

  revalidatePath('/dashboard')
}
```

Add the missing imports at top of file:

```ts
import { eq, or, and, isNull } from 'drizzle-orm'
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add actions/transaction.ts
git commit -m "feat(actions): softDeleteTransaction with atomic balance recalc"
```

---

## Task 10: Transaction list query

**Files:**
- Create: `lib/db/queries/transactions.ts`

- [ ] **Step 1: Create the file**

```ts
import { db } from '@/lib/db/client'
import { cashTransactions } from '@/lib/db/schema'
import { and, eq, isNull, desc } from 'drizzle-orm'

export interface TxnRow {
  id: string
  amount: number
  splitType: 'all_mine' | 'all_theirs' | 'half'
  description: string
  category: string
  paidBy: string
  transactedAt: Date
}

/** Fetch most recent N active transactions for a group. */
export async function listRecentTransactions(
  groupId: string,
  limit = 5,
): Promise<TxnRow[]> {
  const rows = await db
    .select({
      id: cashTransactions.id,
      amount: cashTransactions.amount,
      splitType: cashTransactions.splitType,
      description: cashTransactions.description,
      category: cashTransactions.category,
      paidBy: cashTransactions.paidBy,
      transactedAt: cashTransactions.transactedAt,
    })
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.groupId, groupId),
      isNull(cashTransactions.deletedAt),
    ))
    .orderBy(desc(cashTransactions.transactedAt), desc(cashTransactions.createdAt))
    .limit(limit)
  return rows
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/transactions.ts
git commit -m "feat(db): listRecentTransactions query"
```

---

## Task 11: Dashboard server fetch + Member context

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Create: `app/(dashboard)/_components/MemberContext.tsx`
- Create: `app/(dashboard)/_components/ViewerProvider.tsx`

- [ ] **Step 1: Create `MemberContext.tsx`**

```tsx
'use client'

import { createContext, useContext } from 'react'

export interface MemberInfo {
  id: string
  initial: string
  displayName: string
}

export interface MemberContextValue {
  group: { id: string; name: string }
  viewer: MemberInfo & { who: 'M' }      // the signed-in user
  partner: MemberInfo & { who: 'T' } | null  // null until invite accepted
  viewerIsA: boolean  // true if viewer === group.memberA
}

const MemberContext = createContext<MemberContextValue | null>(null)

export function useMember(): MemberContextValue {
  const ctx = useContext(MemberContext)
  if (!ctx) throw new Error('useMember must be inside <MemberContext.Provider>')
  return ctx
}

export const MemberProvider = MemberContext.Provider
```

- [ ] **Step 2: Create `ViewerProvider.tsx`**

```tsx
'use client'

import { MemberProvider, type MemberContextValue } from './MemberContext'

interface Props {
  value: MemberContextValue
  children: React.ReactNode
}

export function ViewerProvider({ value, children }: Props) {
  return <MemberProvider value={value}>{children}</MemberProvider>
}
```

- [ ] **Step 3: Modify `app/(dashboard)/layout.tsx`**

Replace the current implementation. The layout becomes a server component that fetches group + member info and provides via context. The dashboard page becomes simpler.

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups, profiles } from '@/lib/db/schema'
import { eq, or, inArray } from 'drizzle-orm'
import { ViewerProvider } from './_components/ViewerProvider'
import type { MemberContextValue } from './_components/MemberContext'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) redirect('/setup')

  const memberIds = [group.memberA, group.memberB].filter((x): x is string => !!x)
  const profilesRows = await db.select().from(profiles).where(inArray(profiles.id, memberIds))

  const viewerProfile = profilesRows.find(p => p.id === user.id)
  if (!viewerProfile) redirect('/sign-in')

  const partnerId = group.memberA === user.id ? group.memberB : group.memberA
  const partnerProfile = partnerId ? profilesRows.find(p => p.id === partnerId) : undefined

  const viewerIsA = group.memberA === user.id

  const value: MemberContextValue = {
    group: { id: group.id, name: group.name },
    viewer: {
      id: viewerProfile.id,
      displayName: viewerProfile.displayName,
      initial: (viewerProfile.displayName[0] ?? '?').toUpperCase(),
      who: 'M',
    },
    partner: partnerProfile ? {
      id: partnerProfile.id,
      displayName: partnerProfile.displayName,
      initial: (partnerProfile.displayName[0] ?? '?').toUpperCase(),
      who: 'T',
    } : null,
    viewerIsA,
  }

  return (
    <ViewerProvider value={value}>
      <div className="relative max-w-md mx-auto min-h-screen" style={{ background: 'var(--bg)' }}>
        {children}
      </div>
    </ViewerProvider>
  )
}
```

- [ ] **Step 4: Modify `app/(dashboard)/dashboard/page.tsx`**

Server component fetches data; client wrapper renders it.

```tsx
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getGroupBalance } from '@/lib/db/queries/balance'
import { listRecentTransactions } from '@/lib/db/queries/transactions'
import { Dashboard } from './_components/Dashboard'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('No group')

  const [balance, recent] = await Promise.all([
    getGroupBalance(group.id),
    listRecentTransactions(group.id, 5),
  ])

  // Serialize Date → string for client component
  const recentSerializable = recent.map(t => ({ ...t, transactedAt: t.transactedAt.toISOString() }))

  return <Dashboard balance={balance} recent={recentSerializable} />
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: pass (Dashboard component doesn't exist yet — will fail until Task 12. **Skip this step until Task 12.**)

- [ ] **Step 6: Commit (defer until Task 12)**

This task's commit happens together with Task 12 since they're co-dependent.

---

## Task 12: Dashboard client wrapper + BrandHeader + BalanceHero

**Files:**
- Create: `app/(dashboard)/dashboard/_components/Dashboard.tsx`
- Create: `app/(dashboard)/dashboard/_components/BrandHeader.tsx`
- Create: `app/(dashboard)/dashboard/_components/BalanceHero.tsx`

- [ ] **Step 1: Create `BrandHeader.tsx`**

```tsx
'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { FutariMark } from '@/app/(dashboard)/_components/FutariMark'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'

export function BrandHeader() {
  const { group, viewer, partner } = useMember()
  return (
    <div className="flex items-center justify-between px-5 pt-[60px] pb-0">
      <div className="flex items-center gap-[10px]">
        <FutariMark size={36} />
        <div className="text-[19px] font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
          {group.name}
        </div>
      </div>
      <div className="flex">
        <Avatar who="M" initial={viewer.initial} size={26} />
        {partner && (
          <div className="-ml-[7px]">
            <Avatar who="T" initial={partner.initial} size={26} ring />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `BalanceHero.tsx`**

```tsx
'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { viewerBalance } from '@/lib/balance'

interface Props {
  rawBalance: number  // member_a perspective (positive = b owes a)
  onAddClick: () => void
  onSettleClick: () => void
}

export function BalanceHero({ rawBalance, onAddClick, onSettleClick }: Props) {
  const { viewer, partner, viewerIsA } = useMember()
  const balance = viewerBalance(rawBalance, viewerIsA)
  // balance > 0 → 對方欠你; balance < 0 → 你欠對方; balance == 0 → 打平

  let owedByWho: 'M' | 'T'
  let subjectName: string
  let verb: string
  if (balance > 0) {
    owedByWho = 'T'
    subjectName = partner?.displayName ?? '對方'
    verb = '欠你'
  } else if (balance < 0) {
    owedByWho = 'M'
    subjectName = '你'
    verb = '欠對方'
  } else {
    owedByWho = 'M'
    subjectName = '目前'
    verb = '打平'
  }

  const amount = Math.abs(balance)
  const showInitial = owedByWho === 'M' ? viewer.initial : (partner?.initial ?? '?')

  return (
    <div className="px-5 pt-6 pb-5">
      <div className="flex items-start gap-[14px]">
        <Avatar who={owedByWho} initial={showInitial} size={44} />
        <div className="flex-1 pt-[2px] min-w-0">
          <div className="text-sm mb-1" style={{ color: 'var(--ink-2)' }}>
            <span className="font-semibold" style={{ color: 'var(--ink)' }}>{subjectName}</span>{' '}
            <span>{verb}</span>
          </div>
          <div className="tnum leading-[1.05] tracking-[-1.4px]"
            style={{
              fontFamily: 'var(--font-numeric)',
              fontSize: 44,
              fontWeight: 600,
              color: 'var(--ink)',
            }}>
            <span className="text-[22px] font-medium mr-1" style={{ color: 'var(--ink-2)' }}>NT$</span>
            {amount.toLocaleString('en-US')}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-[18px]">
        <button onClick={onAddClick}
          className="flex-1 h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer flex items-center justify-center gap-1.5"
          style={{ background: 'var(--ink)' }}>
          <PlusIcon size={16} />新增一筆
        </button>
        <button onClick={onSettleClick}
          disabled
          title="Phase 1c"
          className="h-[46px] px-4 rounded-xl text-sm font-medium cursor-not-allowed opacity-60"
          style={{
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--hairline)',
          }}>結算</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `Dashboard.tsx` (client wrapper)**

```tsx
'use client'

import { useState } from 'react'
import { BrandHeader } from './BrandHeader'
import { BalanceHero } from './BalanceHero'
import { RecentList } from './RecentList'
import { EmptyState } from './EmptyState'
import { AddSheet } from './AddSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'

export interface DashboardProps {
  balance: number
  recent: Array<{
    id: string
    amount: number
    splitType: 'all_mine' | 'all_theirs' | 'half'
    description: string
    category: string
    paidBy: string
    transactedAt: string  // ISO
  }>
}

export function Dashboard({ balance, recent }: DashboardProps) {
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="relative pb-[92px]">
      <BrandHeader />
      <BalanceHero
        rawBalance={balance}
        onAddClick={() => setAddOpen(true)}
        onSettleClick={() => { /* Phase 1c */ }}
      />
      {recent.length === 0
        ? <EmptyState onAdd={() => setAddOpen(true)} />
        : <RecentList items={recent} />
      }
      <BottomNav onAddClick={() => setAddOpen(true)} />
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
```

`RecentList`, `EmptyState`, `AddSheet` are stubs at this point — create empty files that export named components returning `null`. They get filled in subsequent tasks.

- [ ] **Step 4: Create stub files**

```tsx
// app/(dashboard)/dashboard/_components/RecentList.tsx
'use client'
export function RecentList(_props: { items: any[] }) { return null }

// app/(dashboard)/dashboard/_components/EmptyState.tsx
'use client'
export function EmptyState(_props: { onAdd: () => void }) { return null }

// app/(dashboard)/dashboard/_components/AddSheet.tsx
'use client'
export function AddSheet(_props: { open: boolean; onClose: () => void }) { return null }
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 6: Commit (covers Task 11 + 12)**

```bash
git add app/\(dashboard\)/layout.tsx app/\(dashboard\)/dashboard/page.tsx app/\(dashboard\)/_components/MemberContext.tsx app/\(dashboard\)/_components/ViewerProvider.tsx app/\(dashboard\)/dashboard/_components/
git commit -m "feat(dashboard): server fetch, member context, brand header, balance hero"
```

---

## Task 13: EmptyState

**Files:**
- Modify: `app/(dashboard)/dashboard/_components/EmptyState.tsx`

- [ ] **Step 1: Replace stub with full implementation**

```tsx
'use client'

import { FutariMark } from '@/app/(dashboard)/_components/FutariMark'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="px-4 pt-2">
      <div className="rounded-[20px] p-8 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <div className="flex justify-center mb-5">
          <FutariMark size={64} />
        </div>
        <div className="text-[18px] font-semibold mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
          還沒有紀錄
        </div>
        <div className="text-[13px] leading-relaxed mb-6"
          style={{ color: 'var(--ink-2)' }}>
          從第一筆開始 ─ 一杯咖啡、<br />
          一頓晚餐都算數。<br />
          日子一天天記下來，回頭看會很暖。
        </div>
        <button onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-5 h-11 rounded-xl text-white text-sm font-semibold cursor-pointer"
          style={{ background: 'var(--accent)', boxShadow: '0 2px 6px rgba(224,136,86,0.3)' }}>
          <PlusIcon size={16} />記第一筆
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/dashboard/_components/EmptyState.tsx
git commit -m "feat(dashboard): warm empty state with Futari mark"
```

---

## Task 14: CompactRow + RecentList

**Files:**
- Create: `app/(dashboard)/dashboard/_components/CompactRow.tsx`
- Modify: `app/(dashboard)/dashboard/_components/RecentList.tsx`

- [ ] **Step 1: Create `CompactRow.tsx`**

```tsx
'use client'

import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { CategoryChip } from '@/app/(dashboard)/_components/CategoryChip'

export interface CompactRowProps {
  tx: {
    id: string
    amount: number
    splitType: 'all_mine' | 'all_theirs' | 'half'
    description: string
    category: string
    paidBy: string
    transactedAt: string
  }
  isLast: boolean
}

export function CompactRow({ tx, isLast }: CompactRowProps) {
  const { viewer, partner } = useMember()
  const payerIsViewer = tx.paidBy === viewer.id
  const payerWho = payerIsViewer ? 'M' : 'T'
  const payerInitial = payerIsViewer ? viewer.initial : (partner?.initial ?? '?')
  const payerLabel = payerIsViewer ? '你付' : `${partner?.displayName ?? '對方'} 付`

  // Personal delta (viewer perspective).
  // Storage is PAYER-RELATIVE: split_type === 'all_mine' means payer covered own expense
  // (no debt either way regardless of who paid). 'all_theirs' means payer covered for the
  // other person (full amount owed to payer). 'half' = shared 50/50 (other owes ceil/2).
  let delta = 0
  if (tx.splitType === 'all_theirs') {
    delta = payerIsViewer ? +tx.amount : -tx.amount
  } else if (tx.splitType === 'half') {
    delta = payerIsViewer ? +Math.ceil(tx.amount / 2) : -Math.ceil(tx.amount / 2)
  }
  // 'all_mine' → delta stays 0 (payer's own expense)

  const dColor = delta > 0 ? 'var(--credit)' : delta < 0 ? 'var(--debit)' : 'var(--ink-3)'

  // M/D format
  const d = new Date(tx.transactedAt)
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`

  return (
    <div className="flex items-center gap-3 px-[14px] py-3"
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--hairline)' }}>
      <CategoryChip categoryId={tx.category} size={32} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--ink)' }}>
          {tx.description}
        </div>
        <div className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
          {dateLabel} · <Avatar who={payerWho} initial={payerInitial} size={12} /> {payerLabel}
        </div>
      </div>
      <div className="text-right">
        <div className="tnum text-sm font-medium tracking-[-0.2px]"
          style={{ fontFamily: 'var(--font-numeric)', color: 'var(--ink)' }}>
          NT${tx.amount.toLocaleString('en-US')}
        </div>
        <div className="tnum text-[10px] mt-px" style={{ color: dColor }}>
          {delta === 0 ? '—' : (delta > 0 ? '+' : '−') + Math.abs(delta).toLocaleString('en-US')}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace `RecentList.tsx` stub**

```tsx
'use client'

import Link from 'next/link'
import { CompactRow, type CompactRowProps } from './CompactRow'

export function RecentList({ items }: { items: CompactRowProps['tx'][] }) {
  return (
    <div className="pt-1 pb-5">
      <div className="flex items-center justify-between px-6 py-2.5">
        <span className="text-xs font-medium tracking-[0.5px]" style={{ color: 'var(--ink-2)' }}>
          最近紀錄
        </span>
        <Link href="/coming-soon?next=list" className="text-[11px] no-underline" style={{ color: 'var(--ink-3)' }}>
          查看全部 →
        </Link>
      </div>
      <div className="mx-4 rounded-[18px] overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        {items.map((tx, i) => (
          <CompactRow key={tx.id} tx={tx} isLast={i === items.length - 1} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/dashboard/_components/CompactRow.tsx app/\(dashboard\)/dashboard/_components/RecentList.tsx
git commit -m "feat(dashboard): recent transaction list with compact rows"
```

---

## Task 15: AddSheet shell — bottom sheet + amount + payer toggle

The Add sheet is large (~400 lines). Split across 3 tasks: shell (this), middle (16), numpad+calendar (17).

**Files:**
- Modify: `app/(dashboard)/dashboard/_components/AddSheet.tsx`
- Create: `app/(dashboard)/dashboard/_components/SheetBackdrop.tsx`

- [ ] **Step 1: Create `SheetBackdrop.tsx`**

```tsx
'use client'

interface Props { open: boolean; onClick: () => void }

export function SheetBackdrop({ open, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 z-[70] transition-opacity duration-[250ms]"
      style={{
        background: 'rgba(31,27,22,0.35)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
      }}
    />
  )
}
```

- [ ] **Step 2: Replace `AddSheet.tsx` with shell + amount + payer**

```tsx
'use client'

import { useState, useEffect, useTransition } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { SheetBackdrop } from './SheetBackdrop'
import { createTransaction } from '@/actions/transaction'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'

interface Props { open: boolean; onClose: () => void }

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

export function AddSheet({ open, onClose }: Props) {
  const { viewer, partner } = useMember()
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState<CategoryId>('food')
  const [split, setSplit] = useState<SplitType>('half')
  const [payerWho, setPayerWho] = useState<'M' | 'T'>('M')
  const [date, setDate] = useState(TODAY_ISO())
  const [showCal, setShowCal] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Reset on open
  useEffect(() => {
    if (open) {
      setAmount(''); setDesc(''); setCategory('food'); setSplit('half')
      setPayerWho('M'); setDate(TODAY_ISO()); setShowCal(false); setError('')
    }
  }, [open])

  const handleSave = () => {
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setError('請輸入金額'); return }
    if (!desc.trim()) { setError('請輸入描述'); return }
    if (payerWho === 'T' && !partner) { setError('伴侶尚未加入'); return }
    const payerId = payerWho === 'M' ? viewer.id : partner!.id
    startTransition(async () => {
      try {
        await createTransaction({
          amount: n,
          description: desc,
          category,
          splitType: split,
          payerId,
          transactedAt: new Date(date + 'T00:00:00'),
        })
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  return (
    <>
      <SheetBackdrop open={open} onClick={onClose} />
      <div className="absolute left-0 right-0 bottom-0 z-[80] flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg)',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          maxHeight: '92%',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
        }}>
        {/* Grabber */}
        <div className="pt-2 flex justify-center">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'rgba(31,27,22,0.18)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <button onClick={onClose}
            className="bg-transparent border-0 text-[15px] cursor-pointer p-1"
            style={{ color: 'var(--ink-2)' }}>取消</button>
          <div className="text-base font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
            新增紀錄
          </div>
          <button onClick={handleSave} disabled={!amount || pending}
            className="bg-transparent border-0 text-[15px] font-semibold p-1 cursor-pointer disabled:cursor-default"
            style={{ color: amount && !pending ? 'var(--accent)' : 'var(--ink-3)' }}>
            {pending ? '儲存中…' : '儲存'}
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {/* Amount + payer toggle */}
          <div className="px-6 pt-6 pb-7 text-center"
            style={{ borderBottom: '1px solid var(--hairline)' }}>
            <div className="text-xs tracking-[0.6px] mb-3" style={{ color: 'var(--ink-3)' }}>
              金額
            </div>
            <div className="flex items-baseline justify-center gap-1.5 min-h-[60px]">
              <span className="text-[22px] font-medium"
                style={{ color: amount ? 'var(--ink-2)' : 'var(--ink-3)' }}>NT$</span>
              <span className="tnum tracking-[-2px] leading-none min-w-[40px]"
                style={{
                  fontFamily: 'var(--font-numeric)',
                  fontSize: 56,
                  fontWeight: 600,
                  color: amount ? 'var(--ink)' : 'var(--ink-3)',
                }}>
                {amount ? parseInt(amount, 10).toLocaleString('en-US') : '0'}
              </span>
            </div>

            {/* Payer segmented */}
            <div className="mt-[22px] flex items-center justify-center gap-2.5 text-[13px]"
              style={{ color: 'var(--ink-2)' }}>
              <span>誰付的？</span>
              <div className="inline-flex rounded-full p-[3px] gap-0.5"
                style={{ background: 'rgba(31,27,22,0.05)' }}>
                {(['M', 'T'] as const).map(w => (
                  <button key={w} onClick={() => setPayerWho(w)}
                    className="h-7 px-3.5 rounded-full border-0 text-[13px] font-medium cursor-pointer flex items-center gap-1.5 transition-all duration-150"
                    style={{
                      background: payerWho === w ? 'var(--surface)' : 'transparent',
                      color: payerWho === w ? 'var(--ink)' : 'var(--ink-2)',
                      boxShadow: payerWho === w ? '0 1px 3px rgba(31,27,22,0.10)' : 'none',
                    }}>
                    <Avatar who={w} initial={w === 'M' ? viewer.initial : (partner?.initial ?? '?')} size={18} />
                    {w === 'M' ? '我' : '對方'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Body sections come in Task 16 */}
          <div data-todo-task-16 />
        </div>

        {/* Numpad comes in Task 17 */}
        <div data-todo-task-17 />
      </div>

      {error && (
        <div className="absolute top-4 left-4 right-4 z-[90] px-4 py-3 rounded-xl text-sm text-white"
          style={{ background: 'var(--debit)' }}>
          {error}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/dashboard/_components/AddSheet.tsx app/\(dashboard\)/dashboard/_components/SheetBackdrop.tsx
git commit -m "feat(add-sheet): bottom sheet shell with amount hero + payer toggle"
```

---

## Task 16: AddSheet body — description / categories / split / date

Replaces the `<div data-todo-task-16 />` placeholder with the form body.

**Files:**
- Modify: `app/(dashboard)/dashboard/_components/AddSheet.tsx`

- [ ] **Step 1: Replace the `<div data-todo-task-16 />` placeholder with the body**

Insert the following inside the `<div className="overflow-auto flex-1">` block, replacing `<div data-todo-task-16 />`:

```tsx
{/* Description */}
<div className="px-5 py-3.5 flex items-center gap-3.5"
  style={{ borderBottom: '1px solid var(--hairline)' }}>
  <DescIcon />
  <input
    value={desc}
    onChange={e => setDesc(e.target.value)}
    placeholder="描述（例：晚餐、雜貨）"
    className="flex-1 bg-transparent border-0 outline-none text-base py-1"
    style={{ color: 'var(--ink)' }}
  />
</div>

{/* Categories */}
<div className="pt-5 pb-[18px]">
  <div className="text-xs tracking-[0.6px] px-6 pb-3" style={{ color: 'var(--ink-3)' }}>
    分類
  </div>
  <div className="flex gap-2 px-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
    {PICKABLE_CATEGORIES.map(c => {
      const sel = category === c.id
      return (
        <button key={c.id} onClick={() => setCategory(c.id)}
          className="h-[38px] pl-2 pr-3 rounded-full text-sm font-medium inline-flex items-center gap-2 cursor-pointer shrink-0 transition-all duration-150"
          style={{
            background: sel ? 'var(--ink)' : 'var(--surface)',
            color: sel ? '#fff' : 'var(--ink)',
            border: sel ? '1px solid var(--ink)' : '1px solid var(--hairline)',
          }}>
          <span className="w-6 h-6 rounded-[7px] inline-flex items-center justify-center text-[13px] font-medium"
            style={{ background: c.tint, color: c.ink }}>
            {c.mono}
          </span>
          {c.label}
        </button>
      )
    })}
  </div>
</div>

{/* Split type */}
<div className="px-5 pt-2 pb-[18px] mt-1"
  style={{ borderTop: '1px solid var(--hairline)' }}>
  <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
    分攤方式
  </div>
  <div className="flex flex-col gap-2">
    {([
      { id: 'all_mine',   label: '全部我的',   sub: splitSub('all_mine',   payerWho, parseInt(amount, 10) || 0) },
      { id: 'all_theirs', label: '全部對方的', sub: splitSub('all_theirs', payerWho, parseInt(amount, 10) || 0) },
      { id: 'half',       label: '平分',       sub: splitSub('half',       payerWho, parseInt(amount, 10) || 0) },
    ] as const).map(s => {
      const sel = split === s.id
      return (
        <button key={s.id} onClick={() => setSplit(s.id)}
          className="flex items-center gap-3 px-3.5 py-3 rounded-[14px] cursor-pointer text-left transition-all duration-150"
          style={{
            background: 'var(--surface)',
            border: sel ? '1.5px solid var(--ink)' : '1px solid var(--hairline)',
          }}>
          <SplitGlyph kind={s.id} active={sel} />
          <div className="flex-1">
            <div className="text-[15px] font-medium tracking-tight" style={{ color: 'var(--ink)' }}>
              {s.label}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{s.sub}</div>
          </div>
          <div className="w-5 h-5 rounded-full transition-all duration-150"
            style={{
              border: sel ? '6px solid var(--ink)' : '1.5px solid var(--hairline)',
              background: sel ? 'var(--ink)' : 'transparent',
              boxShadow: sel ? 'inset 0 0 0 3px var(--surface)' : 'none',
            }} />
        </button>
      )
    })}
  </div>
</div>

{/* Date */}
<div className="px-5 pt-1 pb-6">
  <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
    日期
  </div>
  <button onClick={() => setShowCal(v => !v)}
    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-[14px] cursor-pointer text-left"
    style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
    <CalIcon />
    <div className="flex-1 text-left">
      <div className="text-[15px] font-medium" style={{ color: 'var(--ink)' }}>
        {dateLabel(date)}
      </div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
        {date === TODAY_ISO() ? '今天' : weekday(date)}
      </div>
    </div>
    <Chevron />
  </button>
  {showCal && <MiniCalendar value={date} onChange={d => { setDate(d); setShowCal(false) }} />}
</div>

<div className="h-6" />
```

- [ ] **Step 2: Add helpers and imports at top of `AddSheet.tsx`**

Add to imports:

```ts
import { PICKABLE_CATEGORIES } from '@/lib/categories'
import { SplitGlyph } from './SplitGlyph'
import { MiniCalendar } from './MiniCalendar'
```

Add helper functions before the component:

```ts
function dateLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y} 年 ${m} 月 ${d} 日`
}
function weekday(iso: string) {
  const days = ['週日','週一','週二','週三','週四','週五','週六']
  return days[new Date(iso + 'T00:00:00').getDay()]
}

/** Split-type subtitle, payer-relative (matches storage semantics in lib/balance.ts). */
function splitSub(splitId: SplitType, payerWho: 'M' | 'T', amount: number): string {
  if (splitId === 'all_mine') {
    return payerWho === 'M' ? '你自己花的，不會欠款' : '對方自己花的，不會欠款'
  }
  if (splitId === 'all_theirs') {
    if (!amount) return payerWho === 'M' ? '對方欠你全額' : '你欠對方全額'
    return payerWho === 'M'
      ? `對方欠你 NT$${amount.toLocaleString('en-US')}`
      : `你欠對方 NT$${amount.toLocaleString('en-US')}`
  }
  // half
  if (!amount) return '各付一半'
  const half = Math.ceil(amount / 2)
  return payerWho === 'M'
    ? `對方欠你 NT$${half.toLocaleString('en-US')}`
    : `你欠對方 NT$${half.toLocaleString('en-US')}`
}

function DescIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M4 6h14M4 11h14M4 16h9" stroke="#9A9085" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

function CalIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="3" y="5" width="16" height="14" rx="3" stroke="#5C544A" strokeWidth="1.5"/>
      <path d="M3 9h16" stroke="#5C544A" strokeWidth="1.5"/>
      <path d="M7 3v4M15 3v4" stroke="#5C544A" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function Chevron() {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
      <path d="M1 1l5 5-5 5" stroke="var(--ink-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
```

- [ ] **Step 3: Create `SplitGlyph.tsx`**

```tsx
// app/(dashboard)/dashboard/_components/SplitGlyph.tsx
'use client'

interface Props { kind: 'all_mine' | 'all_theirs' | 'half'; active: boolean }

export function SplitGlyph({ kind, active }: Props) {
  const fillMe = active ? 'var(--ink)' : 'var(--ink-3)'
  const fillThem = active ? 'var(--accent)' : '#C7BFB3'
  const left = kind === 'all_mine' ? '100%' : kind === 'all_theirs' ? '0%' : '50%'
  return (
    <div className="w-11 h-11 rounded-xl relative overflow-hidden flex items-center justify-center shrink-0"
      style={{ background: 'rgba(31,27,22,0.06)' }}>
      <div className="absolute left-1.5 right-1.5 top-[18px] h-2 rounded-[4px] overflow-hidden"
        style={{ background: fillThem }}>
        <div className="absolute left-0 top-0 bottom-0 transition-[width] duration-200"
          style={{ width: left, background: fillMe }} />
      </div>
      <div className="absolute left-1.5 top-1.5 w-2 h-2 rounded-full" style={{ background: fillMe }} />
      <div className="absolute right-1.5 top-1.5 w-2 h-2 rounded-full" style={{ background: fillThem }} />
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: pass (MiniCalendar still missing — Task 17).

- [ ] **Step 5: Commit (defer until Task 17 since MiniCalendar is missing)**

This task's commit happens together with Task 17.

---

## Task 17: Numpad + MiniCalendar

**Files:**
- Create: `app/(dashboard)/dashboard/_components/Numpad.tsx`
- Create: `app/(dashboard)/dashboard/_components/MiniCalendar.tsx`
- Modify: `app/(dashboard)/dashboard/_components/AddSheet.tsx`

- [ ] **Step 1: Create `Numpad.tsx`**

```tsx
'use client'

interface Props { onKey: (k: string) => void }

const KEYS = ['1','2','3','4','5','6','7','8','9','00','0','del']

export function Numpad({ onKey }: Props) {
  return (
    <div className="grid grid-cols-3 gap-1.5 px-1.5 pt-2 pb-2.5"
      style={{ background: '#E5E0D6', borderTop: '1px solid var(--hairline)' }}>
      {KEYS.map(k => (
        <button key={k} onClick={() => onKey(k)}
          className="h-[46px] rounded-lg border-0 cursor-pointer flex items-center justify-center tnum"
          style={{
            background: k === 'del' ? 'transparent' : 'var(--surface)',
            color: 'var(--ink)',
            fontFamily: 'var(--font-numeric)',
            fontSize: 24,
            fontWeight: 400,
            boxShadow: k === 'del' ? 'none' : '0 1px 0 rgba(0,0,0,0.06)',
          }}>
          {k === 'del' ? (
            <svg width="24" height="18" viewBox="0 0 24 18" fill="none">
              <path d="M8 1h13a2 2 0 012 2v12a2 2 0 01-2 2H8L1 9 8 1z"
                stroke="#1F1B16" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M11 6l6 6M17 6l-6 6"
                stroke="#1F1B16" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : k}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `MiniCalendar.tsx`**

```tsx
'use client'

interface Props {
  value: string  // YYYY-MM-DD
  onChange: (date: string) => void
}

export function MiniCalendar({ value, onChange }: Props) {
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const [year, month] = value.split('-').map(Number)

  const firstOfMonth = new Date(year, month - 1, 1)
  const firstDay = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="mt-3 px-3 pt-3.5 pb-4 rounded-2xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="text-center text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>
        {year} 年 {month} 月
      </div>
      <div className="grid grid-cols-7 text-[11px] text-center mb-1.5"
        style={{ color: 'var(--ink-3)' }}>
        {['日','一','二','三','四','五','六'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const sel = iso === value
          const isToday = iso === todayIso
          return (
            <button key={i} onClick={() => onChange(iso)}
              className="h-9 border-0 rounded-[10px] cursor-pointer relative transition-[background] duration-100"
              style={{
                background: sel ? 'var(--ink)' : 'transparent',
                color: sel ? '#fff' : 'var(--ink)',
                fontFamily: 'var(--font-numeric)',
                fontSize: 14,
                fontWeight: isToday ? 600 : 400,
              }}>
              {d}
              {isToday && !sel && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: 'var(--accent)' }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire the numpad into `AddSheet.tsx`**

In the AddSheet component, replace `<div data-todo-task-17 />` with:

```tsx
<Numpad onKey={k => {
  if (k === 'del') setAmount(a => a.slice(0, -1))
  else if (amount.length < 7) setAmount(a => (a + k).replace(/^0+/, '') || '0')
}} />
```

Add import:
```ts
import { Numpad } from './Numpad'
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 5: Commit (covers Task 16 + 17)**

```bash
git add app/\(dashboard\)/dashboard/_components/Numpad.tsx app/\(dashboard\)/dashboard/_components/MiniCalendar.tsx app/\(dashboard\)/dashboard/_components/SplitGlyph.tsx app/\(dashboard\)/dashboard/_components/AddSheet.tsx
git commit -m "feat(add-sheet): full form body — desc/category/split/date + numpad + mini calendar"
```

---

## Task 18: Settings page + LogoutButton

Minimal Phase 1a settings: only the user card + a logout button. Full settings (group / preferences / data / danger zone) come in Phase 1d.

**Files:**
- Create: `app/(dashboard)/settings/page.tsx`
- Create: `app/(dashboard)/settings/_components/LogoutButton.tsx`
- Create: `actions/auth.ts`

- [ ] **Step 1: Create `actions/auth.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
```

- [ ] **Step 2: Create `LogoutButton.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { signOut } from '@/actions/auth'

export function LogoutButton() {
  const [pending, startTransition] = useTransition()
  return (
    <button onClick={() => startTransition(() => signOut())}
      disabled={pending}
      className="w-full h-12 rounded-[14px] border-0 bg-transparent text-sm font-medium cursor-pointer"
      style={{ color: '#B85A48' }}>
      {pending ? '登出中…' : '登出'}
    </button>
  )
}
```

- [ ] **Step 3: Create `BottomNavSkeleton.tsx`** (must exist before settings page imports it)

```tsx
// app/(dashboard)/_components/BottomNavSkeleton.tsx
'use client'

import { BottomNav } from './BottomNav'

export function BottomNavSkeleton() {
  // Settings has no Add sheet — clicking + jumps to dashboard where the sheet lives.
  return <BottomNav onAddClick={() => { window.location.href = '/dashboard' }} />
}
```

- [ ] **Step 4: Create `app/(dashboard)/settings/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { LogoutButton } from './_components/LogoutButton'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)
  const displayName = profile?.displayName ?? '?'
  const initial = displayName[0]?.toUpperCase() ?? '?'

  return (
    <div className="relative pb-[92px]">
      <div className="px-5 pt-[60px] pb-4">
        <div className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>設定</div>
      </div>

      {/* User card */}
      <div className="mx-4 my-2 mb-6 p-5 rounded-[20px] flex items-center gap-3.5"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <Avatar who="M" initial={initial} size={56} />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
            {displayName}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {user.email}
          </div>
        </div>
      </div>

      <div className="px-4 pb-8">
        <LogoutButton />
        <div className="text-[11px] text-center mt-2 leading-relaxed tracking-[0.3px]"
          style={{ color: 'var(--ink-3)' }}>
          Futari · v0.1.0
        </div>
      </div>

      <BottomNavSkeleton />
    </div>
  )
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: pass. Routes should now show `/settings`.

- [ ] **Step 6: Commit**

```bash
git add actions/auth.ts app/\(dashboard\)/settings/ app/\(dashboard\)/_components/BottomNavSkeleton.tsx
git commit -m "feat(settings): minimal settings page with logout"
```

---

## Task 19: Schema check + Supabase realtime publication (one-time SQL)

Phase 1a doesn't use realtime, but we should verify the schema is unchanged and document the realtime publication command for future phases.

**Files:**
- Create: `docs/superpowers/sql/2026-05-02-phase-1a-realtime-prep.sql`

- [ ] **Step 1: Document the publication SQL**

```sql
-- Phase 1e will use Supabase Realtime postgres_changes.
-- Run this in Supabase SQL editor BEFORE Phase 1e implementation.
--
-- ALTER PUBLICATION supabase_realtime ADD TABLE
--   "CashTransactions",
--   "Settlements",
--   "GroupBalance";
--
-- (Commented out — do not run during Phase 1a.)
```

- [ ] **Step 2: Verify schema matches Phase 0**

Run: `npx drizzle-kit check`
Expected: no schema drift.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/sql/
git commit -m "docs(sql): document Phase 1e realtime publication command"
```

---

## Task 20: Final verification + manual E2E

**Files:** none (verification only).

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: all tests pass. Phase 0 had 11; Phase 1a adds 25 (categories: 6, balance: 12, settlement: 7) = **36 total**.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success. Routes should include:
- `/`
- `/sign-in`
- `/setup`
- `/auth/callback`
- `/invite/[token]`
- `/dashboard`
- `/settings`
- `/coming-soon`

- [ ] **Step 4: Manual E2E**

Start: `npm run dev`

Empty-state path:
```
□ /sign-in → Google OAuth → redirected to /dashboard (assuming you have a group; otherwise to /setup first)
□ Empty state shows: Futari mark + 「還沒有紀錄」 + 「+ 記第一筆」 CTA
□ Bottom nav visible: 首頁 (active) / 紀錄 / + / 資產 / 設定
□ Tap 紀錄 or 資產 → "即將推出" placeholder
□ Tap 設定 → settings page with user card + 登出
□ Tap 登出 → back to /sign-in
```

Add transaction path:
```
□ Tap 「+ 記第一筆」 → bottom sheet slides up from bottom
□ Numpad visible at bottom; tap 1, 8, 0 → amount shows "180"
□ Tap "00" → "18,000"; tap del to clear back
□ Tap 「我」/「對方」 segmented toggle → switches payer (only 我 in solo state)
□ Type description "蘿蔔糕早餐"
□ Scroll category chips → tap 餐飲 (selected dark)
□ Tap split type cards: 全部我的 / 全部對方的 / 平分 (radio updates)
□ Tap date row → mini calendar opens, today is dotted; tap a different day → updates label
□ Tap 「儲存」 → sheet closes, dashboard refreshes
□ Balance hero now shows "對方欠你 NT$ 90"（180/2 = 90） assuming 平分 paid by you
□ List shows the new transaction with category icon, payer avatar, +90 in green
```

Edge cases:
```
□ Try save with empty amount → 「請輸入金額」 error
□ Try save with amount but no description → 「請輸入描述」 error  
□ Numpad 7-digit limit: cannot type more than 9999999
□ Backdrop tap closes sheet
□ 「結算」 button is disabled (Phase 1c)
```

Visual check:
```
□ All screens use peach (#FBEDE0) background
□ Buttons: primary = dark brown, accent = coral
□ Numbers use SF-style font with tabular figures (1234567 widths align)
□ Headings use Fraunces serif
□ Body uses Noto Sans TC
□ Bottom nav: 4 tabs equal width, center FAB extends above
```

- [ ] **Step 5: Final commit**

If any small fixes were needed during E2E, commit them. If clean, write a wrap-up commit:

```bash
git commit --allow-empty -m "chore: phase 1a complete — futari foundation"
```

---

## Acceptance criteria (Phase 1a Done)

- [x] Brand: Futari name + ふたり ・ 家計簿 tagline + FutariMark logo visible
- [x] Tailwind tokens applied; warm peach palette throughout
- [x] Fraunces + Noto Sans TC fonts loaded; SF-style for numbers
- [x] Bottom nav with 4 tabs + center FAB on dashboard + settings
- [x] 紀錄 / 資產 → "即將推出" placeholder
- [x] Dashboard: brand header (logo + group name + member avatars)
- [x] Balance hero: viewer-flipped narrative ("對方欠你 NT$ X" / "你欠對方 NT$ X" / "目前打平")
- [x] 「+ 新增一筆」 + 「結算」(disabled stub) buttons under balance
- [x] Recent 5 list with category icon, description, date, payer, +/- delta
- [x] Empty state with warm copy + Futari mark + CTA
- [x] Add sheet: bottom sheet with custom numpad, payer toggle, description, 8 categories, split radios with descriptions, date with mini calendar
- [x] Save → atomic insert + balance recalc → dashboard refreshes
- [x] Settings page: user card + logout
- [x] All tests pass (36 total)
- [x] Build + typecheck pass
- [x] Manual E2E verified by user

---

## Phase 1a → 1b handoff notes

Phase 1b will add:
- Tap a list item to edit (open AddSheet in edit mode + delete button)
- Lazy load 20 + 「載入更多」 button + month section grouping
- AddSheet: bottom-sheet polish (drag-to-dismiss, safe-area padding)
- 「結算」 button enable + Settlement form inline expansion (Phase 1c bridge)
