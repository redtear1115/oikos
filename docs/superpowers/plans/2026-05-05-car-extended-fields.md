# Car Extended Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add color, year, brand, model, and initialOdometer fields to car assets, update the car creation/edit form with a color swatch picker and new text inputs, and surface brand/model on the detail page header.

**Architecture:** New columns on `CarDetails` (Postgres migration), propagated upward through Drizzle schema → validator → server actions → UI. The color picker is a small inline component living in AssetSheet. AssetHero receives brand/model/year as new props to display below the car name. `initialOdometer` serves as fallback `lastOdometer` in AssetDetailClient when no fuel logs exist yet.

**Tech Stack:** Next.js 15, Drizzle ORM, Supabase Postgres, TypeScript, Tailwind CSS

---

## File Map

| File | Change |
|---|---|
| `drizzle/0009_car_extended_fields.sql` | CREATE — migration adds 5 columns to CarDetails |
| `lib/db/schema.ts` | MODIFY — add columns to `carDetails` table definition |
| `lib/db/queries/asset.ts` | MODIFY — add 5 new fields to `AssetWithCar` + select list |
| `lib/validators.ts` | MODIFY — add new optional fields to `CarInput`/`ValidatedCarInput`/`validateCarInput` |
| `actions/asset.ts` | MODIFY — `CreateCarInput`/`EditCarInput` + action bodies pass new fields |
| `app/(dashboard)/assets/_components/AssetSheet.tsx` | MODIFY — add `CarColorPicker` + year/brand/model/initialOdometer inputs |
| `app/(dashboard)/assets/[id]/_components/AssetHero.tsx` | MODIFY — accept + display brand/model/year |
| `app/(dashboard)/assets/[id]/_components/AssetDetailClient.tsx` | MODIFY — pass brand/model/year to AssetHero; fall back to car.initialOdometer for lastOdometer |
| `app/(dashboard)/assets/[id]/page.tsx` | MODIFY — pass new fields from query to AssetDetailClient |
| `tests/actions-asset.test.ts` | MODIFY — add tests for new fields in createCar/editCar |
| `__tests__/validators-car.test.ts` | MODIFY — add tests for new optional fields |

---

## Task 1: DB Migration

**Files:**
- Create: `drizzle/0009_car_extended_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Car extended fields: color, year, brand, model, initial_odometer
ALTER TABLE "CarDetails"
  ADD COLUMN IF NOT EXISTS color       text,
  ADD COLUMN IF NOT EXISTS year        integer,
  ADD COLUMN IF NOT EXISTS brand       text,
  ADD COLUMN IF NOT EXISTS model       text,
  ADD COLUMN IF NOT EXISTS initial_odometer integer;
```

- [ ] **Step 2: Apply to both Supabase projects**

```bash
# dev project (ufhcprrauwsxdmscbkrf)
npx supabase db push --db-url "$DEV_DATABASE_URL"

# prod project (cxbnlahuhdvrbwcnzoqo)
npx supabase db push --db-url "$PROD_DATABASE_URL"
```

Or apply via Supabase MCP `apply_migration` for each project. Verify by running:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'CarDetails'
ORDER BY ordinal_position;
```
Expected: new columns appear at the end.

- [ ] **Step 3: Commit**

```bash
git add drizzle/0009_car_extended_fields.sql
git commit -m "migrate: add color/year/brand/model/initialOdometer to CarDetails"
```

---

## Task 2: Schema + Query Layer

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/queries/asset.ts`

- [ ] **Step 1: Update Drizzle schema — add columns to `carDetails`**

In `lib/db/schema.ts`, add to the `carDetails` table definition after `fuelType`:

```typescript
export const carDetails = pgTable('CarDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  plate: text('plate').notNull(),
  purchasedAt: date('purchased_at'),
  purchasePrice: integer('purchase_price'),
  primaryUserId: uuid('primary_user_id').references(() => profiles.id),
  fuelType: fuelTypeEnum('fuel_type').notNull().default('95'),
  color: text('color'),
  year: integer('year'),
  brand: text('brand'),
  model: text('model'),
  initialOdometer: integer('initial_odometer'),
})
```

- [ ] **Step 2: Update `AssetWithCar` type in `lib/db/queries/asset.ts`**

Add 5 new nullable fields to the interface:

```typescript
export interface AssetWithCar {
  id: string
  groupId: string
  type: 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'
  name: string
  deletedAt: Date | null
  createdAt: Date
  plate: string | null
  purchasedAt: string | null
  purchasePrice: number | null
  fuelType: 'electric' | '92' | '95' | '98' | 'diesel' | null
  primaryUserId: string | null
  // Extended fields (Task 2)
  color: string | null
  year: number | null
  brand: string | null
  model: string | null
  initialOdometer: number | null
}
```

- [ ] **Step 3: Add new columns to both select lists in `listAssetsForGroup` and `getAssetById`**

Both functions have an identical select object — add to each:

```typescript
color: carDetails.color,
year: carDetails.year,
brand: carDetails.brand,
model: carDetails.model,
initialOdometer: carDetails.initialOdometer,
```

Full updated select object (same shape for both functions):

```typescript
{
  id: assets.id,
  groupId: assets.groupId,
  type: assets.type,
  name: assets.name,
  deletedAt: assets.deletedAt,
  createdAt: assets.createdAt,
  plate: carDetails.plate,
  purchasedAt: carDetails.purchasedAt,
  purchasePrice: carDetails.purchasePrice,
  fuelType: carDetails.fuelType,
  primaryUserId: carDetails.primaryUserId,
  color: carDetails.color,
  year: carDetails.year,
  brand: carDetails.brand,
  model: carDetails.model,
  initialOdometer: carDetails.initialOdometer,
}
```

- [ ] **Step 4: Verify TypeScript — no errors expected**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/queries/asset.ts
git commit -m "feat(schema): add color/year/brand/model/initialOdometer to CarDetails"
```

---

## Task 3: Validators

**Files:**
- Modify: `lib/validators.ts`
- Modify: `__tests__/validators-car.test.ts`

- [ ] **Step 1: Add failing tests for new fields**

In `__tests__/validators-car.test.ts`, add after the existing fuelType tests:

```typescript
it('accepts all extended optional fields', () => {
  const r = validateCarInput({
    ...validBase,
    color: 'white',
    year: 2020,
    brand: 'Toyota',
    model: 'Altis',
    initialOdometer: 50000,
  })
  expect(r.color).toBe('white')
  expect(r.year).toBe(2020)
  expect(r.brand).toBe('Toyota')
  expect(r.model).toBe('Altis')
  expect(r.initialOdometer).toBe(50000)
})

it('defaults extended fields to null when absent', () => {
  const r = validateCarInput(validBase)
  expect(r.color).toBeNull()
  expect(r.year).toBeNull()
  expect(r.brand).toBeNull()
  expect(r.model).toBeNull()
  expect(r.initialOdometer).toBeNull()
})

it('rejects year below 1900 or above 2100', () => {
  expect(() => validateCarInput({ ...validBase, year: 1800 })).toThrow(/年份/)
  expect(() => validateCarInput({ ...validBase, year: 2200 })).toThrow(/年份/)
})

it('rejects brand longer than 32 chars', () => {
  expect(() => validateCarInput({ ...validBase, brand: 'A'.repeat(33) })).toThrow(/品牌/)
})

it('rejects model longer than 32 chars', () => {
  expect(() => validateCarInput({ ...validBase, model: 'A'.repeat(33) })).toThrow(/型號/)
})

it('rejects negative initialOdometer', () => {
  expect(() => validateCarInput({ ...validBase, initialOdometer: -1 })).toThrow(/里程/)
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npx vitest run __tests__/validators-car.test.ts --reporter=verbose
```

Expected: new tests FAIL with "r.color is not a property" or similar.

- [ ] **Step 3: Update `CarInput` interface**

In `lib/validators.ts`, update `CarInput`:

```typescript
export interface CarInput {
  name: string
  plate: string
  purchasedAt?: string | null
  purchasePrice?: number | null
  primaryUserId?: string | null
  fuelType?: '92' | '95' | '98' | 'diesel'
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  initialOdometer?: number | null
}
```

- [ ] **Step 4: Update `ValidatedCarInput` interface**

```typescript
export interface ValidatedCarInput {
  name: string
  plate: string
  purchasedAt: string | null
  purchasePrice: number | null
  primaryUserId: string | null
  fuelType: '92' | '95' | '98' | 'diesel'
  color: string | null
  year: number | null
  brand: string | null
  model: string | null
  initialOdometer: number | null
}
```

- [ ] **Step 5: Update `validateCarInput` function — add validation + return new fields**

Add validation after the `fuelType` check (before the `return` statement):

```typescript
// color — store as-is (UI enforces valid keys), max 32 chars
const color = input.color?.trim() || null

// year — integer 1900–2100
let year: number | null = null
if (input.year !== null && input.year !== undefined) {
  if (!Number.isInteger(input.year) || input.year < 1900 || input.year > 2100) {
    throw new Error('年份無效（1900–2100）')
  }
  year = input.year
}

// brand — max 32 chars
let brand: string | null = null
if (input.brand) {
  const b = input.brand.trim()
  if (b.length > 32) throw new Error('品牌最長 32 字')
  brand = b || null
}

// model — max 32 chars
let model: string | null = null
if (input.model) {
  const m = input.model.trim()
  if (m.length > 32) throw new Error('型號最長 32 字')
  model = m || null
}

// initialOdometer — non-negative integer
let initialOdometer: number | null = null
if (input.initialOdometer !== null && input.initialOdometer !== undefined) {
  if (!Number.isInteger(input.initialOdometer) || input.initialOdometer < 0) {
    throw new Error('里程必須是非負整數')
  }
  initialOdometer = input.initialOdometer
}
```

Update the return statement:

```typescript
return { name, plate: rawPlate, purchasedAt, purchasePrice, primaryUserId, fuelType,
         color, year, brand, model, initialOdometer }
```

- [ ] **Step 6: Run tests — expect all to pass**

```bash
npx vitest run __tests__/validators-car.test.ts --reporter=verbose
```

Expected: all tests PASS.

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all 240+ tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/validators.ts __tests__/validators-car.test.ts
git commit -m "feat(validators): car extended fields — color/year/brand/model/initialOdometer"
```

---

## Task 4: Server Actions

**Files:**
- Modify: `actions/asset.ts`
- Modify: `tests/actions-asset.test.ts`

- [ ] **Step 1: Add failing tests**

In `tests/actions-asset.test.ts`, add new tests for `createCar` (find the `describe('createCar')` block):

```typescript
it('persists extended car fields', async () => {
  queueDbResult([GROUP])
  queueDbResult([{ id: 'asset-1' }])  // assets insert
  queueDbResult([])                    // carDetails insert

  await expect(createCar({
    name: '阿白',
    plate: 'ABC-1234',
    color: 'white',
    year: 2019,
    brand: 'Toyota',
    model: 'Altis',
    initialOdometer: 0,
  })).resolves.toMatchObject({ id: 'asset-1' })

  const carDetailValues = mockBuilder.values.mock.calls
    .find(c => c[0]?.color !== undefined)?.[0]
  expect(carDetailValues?.color).toBe('white')
  expect(carDetailValues?.year).toBe(2019)
  expect(carDetailValues?.brand).toBe('Toyota')
  expect(carDetailValues?.model).toBe('Altis')
  expect(carDetailValues?.initialOdometer).toBe(0)
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npx vitest run tests/actions-asset.test.ts -t "persists extended car fields" --reporter=verbose
```

Expected: FAIL — carDetailValues is undefined (new fields not passed yet).

- [ ] **Step 3: Update `CreateCarInput` in `actions/asset.ts`**

```typescript
export interface CreateCarInput {
  name: string
  plate: string
  purchasedAt?: string | null
  purchasePrice?: number | null
  primaryUserId?: string | null
  fuelType?: '92' | '95' | '98' | 'diesel'
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  initialOdometer?: number | null
}
```

- [ ] **Step 4: Update `createCar` action — pass new fields to `carDetails` insert**

Find the `carDetails` insert inside `createCar` (inside the `db.transaction` block) and replace:

```typescript
await tx.insert(carDetails).values({
  assetId: asset.id,
  plate: validated.plate,
  purchasedAt: validated.purchasedAt,
  purchasePrice: validated.purchasePrice,
  primaryUserId: validated.primaryUserId,
  fuelType: validated.fuelType,
  color: validated.color,
  year: validated.year,
  brand: validated.brand,
  model: validated.model,
  initialOdometer: validated.initialOdometer,
})
```

- [ ] **Step 5: Update `EditCarInput` in `actions/asset.ts`**

```typescript
export interface EditCarInput {
  id: string
  name: string
  plate: string
  purchasedAt: string | null
  purchasePrice: number | null
  primaryUserId?: string | null
  fuelType?: '92' | '95' | '98' | 'diesel'
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  initialOdometer?: number | null
}
```

- [ ] **Step 6: Update `editCar` action — include new fields in the `.set()` call**

Find the `carDetails` update inside `editCar` (inside the `db.transaction` block) and replace the `.set()` call:

```typescript
await tx
  .update(carDetails)
  .set({
    plate: validated.plate,
    purchasedAt: validated.purchasedAt,
    purchasePrice: validated.purchasePrice,
    primaryUserId: validated.primaryUserId,
    fuelType: validated.fuelType,
    color: validated.color,
    year: validated.year,
    brand: validated.brand,
    model: validated.model,
    initialOdometer: validated.initialOdometer,
  })
  .where(eq(carDetails.assetId, input.id))
```

- [ ] **Step 7: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add actions/asset.ts tests/actions-asset.test.ts
git commit -m "feat(actions): createCar/editCar persist extended car fields"
```

---

## Task 5: AssetSheet UI

**Files:**
- Modify: `app/(dashboard)/assets/_components/AssetSheet.tsx`

The mockup shows: color swatch picker row (8 circles), then 名稱, 車牌, 年份 (inline-right of 車牌), 品牌, 型號 (inline pair), 購入日期, 目前里程, 主要使用人.

- [ ] **Step 1: Add color constant at top of file (after imports)**

```typescript
// 8 mainstream car colors
const CAR_COLORS = [
  { key: 'white',     hex: '#F0EDE8', border: '#D4CFC7' },
  { key: 'black',     hex: '#1C1C1E', border: '#1C1C1E' },
  { key: 'silver',    hex: '#B8B8C0', border: '#B8B8C0' },
  { key: 'dark_gray', hex: '#4A4A52', border: '#4A4A52' },
  { key: 'dark_red',  hex: '#7B2525', border: '#7B2525' },
  { key: 'dark_blue', hex: '#1E3557', border: '#1E3557' },
  { key: 'brown',     hex: '#7A5C3E', border: '#7A5C3E' },
  { key: 'champagne', hex: '#C8A97A', border: '#C8A97A' },
] as const
```

- [ ] **Step 2: Extend `AssetSheetInitial` with new optional fields**

```typescript
export interface AssetSheetInitial {
  id: string
  type: 'car' | 'child' | 'pet' | 'plant' | 'house' | 'insurance'
  name: string
  // car-only fields
  plate?: string
  purchasedAt?: string | null
  purchasePrice?: number | null
  fuelType?: '92' | '95' | '98' | 'diesel'
  primaryUserId?: string | null
  // extended car fields
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  initialOdometer?: number | null
}
```

- [ ] **Step 3: Add state variables for new fields**

Inside `AssetSheet` component, after the existing state declarations:

```typescript
const [color, setColor] = useState<string | null>(null)
const [year, setYear] = useState('')
const [brand, setBrand] = useState('')
const [model, setModel] = useState('')
const [initialOdometer, setInitialOdometer] = useState('')
```

- [ ] **Step 4: Initialise new state in the useEffect**

In the `if (initial)` branch, add:

```typescript
setColor(initial.color ?? null)
setYear(initial.year ? String(initial.year) : '')
setBrand(initial.brand ?? '')
setModel(initial.model ?? '')
setInitialOdometer(initial.initialOdometer ? String(initial.initialOdometer) : '')
```

In the `else` (reset) branch, add:

```typescript
setColor(null)
setYear('')
setBrand('')
setModel('')
setInitialOdometer('')
```

- [ ] **Step 5: Pass new fields in the `handleSave` car branches**

In the `createCar` call:

```typescript
await createCar({
  name: name.trim(),
  plate: plate.trim(),
  purchasedAt: purchasedAt ?? undefined,
  purchasePrice: price ?? undefined,
  fuelType,
  primaryUserId,
  color,
  year: year ? parseInt(year, 10) : null,
  brand: brand.trim() || null,
  model: model.trim() || null,
  initialOdometer: initialOdometer ? parseInt(initialOdometer.replace(/,/g, ''), 10) : null,
})
```

In the `editCar` call:

```typescript
await editCar({
  id: initial!.id,
  name: name.trim(),
  plate: plate.trim(),
  purchasedAt,
  purchasePrice: price,
  fuelType,
  primaryUserId,
  color,
  year: year ? parseInt(year, 10) : null,
  brand: brand.trim() || null,
  model: model.trim() || null,
  initialOdometer: initialOdometer ? parseInt(initialOdometer.replace(/,/g, ''), 10) : null,
})
```

- [ ] **Step 6: Add color picker UI inside the car-only fields section**

After the fuelType field and before the primaryUserId field, insert:

```tsx
{/* Color picker */}
<Field label="顏色">
  <div className="flex gap-2 flex-wrap">
    {CAR_COLORS.map(c => (
      <button
        key={c.key}
        type="button"
        onClick={() => setColor(c.key)}
        className="w-9 h-9 rounded-full transition-all"
        style={{
          background: c.hex,
          border: color === c.key
            ? '3px solid var(--ink)'
            : `2px solid ${c.border}`,
          boxShadow: color === c.key ? '0 0 0 2px var(--bg), 0 0 0 4px var(--ink)' : 'none',
        }}
        aria-label={c.key}
      />
    ))}
    {/* No color option */}
    <button
      type="button"
      onClick={() => setColor(null)}
      className="w-9 h-9 rounded-full transition-all flex items-center justify-center text-[10px]"
      style={{
        border: color === null ? '3px solid var(--ink)' : '1.5px solid var(--hairline)',
        background: 'transparent',
        color: 'var(--ink-3)',
        boxShadow: color === null ? '0 0 0 2px var(--bg), 0 0 0 4px var(--ink)' : 'none',
      }}
    >
      —
    </button>
  </div>
</Field>
```

- [ ] **Step 7: Add year field (inline right of plate, or own row)**

Add after the plate field:

```tsx
<Field label="年份">
  <input
    value={year}
    onChange={e => setYear(e.target.value.slice(0, 4))}
    type="number"
    inputMode="numeric"
    placeholder="例：2019"
    className="w-full bg-transparent border-0 outline-none text-base"
    style={{ color: 'var(--ink)' }}
  />
</Field>
```

- [ ] **Step 8: Add brand + model fields**

```tsx
<Field label="品牌">
  <input
    value={brand}
    onChange={e => setBrand(e.target.value.slice(0, 32))}
    placeholder="例：Toyota"
    className="w-full bg-transparent border-0 outline-none text-base"
    style={{ color: 'var(--ink)' }}
  />
</Field>

<Field label="型號">
  <input
    value={model}
    onChange={e => setModel(e.target.value.slice(0, 32))}
    placeholder="例：Altis"
    className="w-full bg-transparent border-0 outline-none text-base"
    style={{ color: 'var(--ink)' }}
  />
</Field>
```

- [ ] **Step 9: Add initialOdometer field (after purchasedAt/purchasePrice)**

```tsx
<Field label="目前里程（選填）" unit="km">
  <input
    value={initialOdometer}
    onChange={e => setInitialOdometer(e.target.value)}
    type="number"
    inputMode="numeric"
    placeholder="例：50,000"
    className="w-full bg-transparent border-0 outline-none text-base"
    style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
  />
</Field>
```

- [ ] **Step 10: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add "app/(dashboard)/assets/_components/AssetSheet.tsx"
git commit -m "feat(ui): car extended fields form — color picker, year, brand, model, initialOdometer"
```

---

## Task 6: Detail Page — Hero + Odometer Fallback

**Files:**
- Modify: `app/(dashboard)/assets/[id]/_components/AssetHero.tsx`
- Modify: `app/(dashboard)/assets/[id]/_components/AssetDetailClient.tsx`
- Modify: `app/(dashboard)/assets/[id]/page.tsx`

- [ ] **Step 1: Update `AssetHeroProps` and add brand/model/year display**

In `AssetHero.tsx`, update the props interface:

```typescript
interface AssetHeroProps {
  name: string
  plate: string | null
  brand: string | null
  model: string | null
  year: number | null
  fuelType: '92' | '95' | '98' | 'diesel' | 'electric' | null
  monthAmount: number
  totalAmount: number
  avgEcon: number | null
  fuelLogCount: number
}
```

Update the function signature:

```typescript
export function AssetHero({
  name, plate, brand, model, year, fuelType,
  monthAmount, totalAmount, avgEcon, fuelLogCount,
}: AssetHeroProps) {
```

In both the electric and gas variants, replace the plain `{plate}` subtitle with a richer subtitle showing brand/model/year when available. Replace:

```tsx
{plate && (
  <div className="text-xs mt-1 tracking-[1px]" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
    {plate}
  </div>
)}
```

with:

```tsx
<div className="text-xs mt-1 tracking-[1px] flex items-center gap-1.5" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
  {plate && <span>{plate}</span>}
  {(brand || model) && plate && <span>·</span>}
  {(brand || model) && (
    <span>{[brand, model].filter(Boolean).join(' ')}</span>
  )}
  {year && (brand || model || plate) && <span>·</span>}
  {year && <span>{year}</span>}
</div>
```

- [ ] **Step 2: Update `AssetDetailClient` — pass new props to AssetHero + odometer fallback**

In `AssetDetailClient.tsx`, extend the `Props` interface:

```typescript
interface Props {
  assetId: string
  assetSheetInitial: AssetSheetInitial
  fuelType: '92' | '95' | '98' | 'diesel' | 'electric' | null
  primaryUserId: string | null
  brand: string | null
  model: string | null
  year: number | null
  initialOdometer: number | null
  monthAmount: number
  totalAmount: number
  monthFuel: number
  totalFuel: number
  avgEcon: number | null
  initialTxns: PagedTxnRow[]
  initialFuelLogs: SerializedFuelLog[]
  pageSize: number
}
```

Update function signature to destructure new props:

```typescript
export function AssetDetailClient({
  assetId, assetSheetInitial, fuelType, primaryUserId,
  brand, model, year, initialOdometer,
  monthAmount, totalAmount, avgEcon,
  initialTxns, initialFuelLogs, pageSize,
}: Props) {
```

Update the `lastOdometer` derivation to fall back to `initialOdometer`:

```typescript
const lastOdometer = initialFuelLogs.length > 0
  ? initialFuelLogs[0].odometer
  : (initialOdometer ?? null)
```

Pass new props to `AssetHero`:

```tsx
<AssetHero
  name={assetSheetInitial.name}
  plate={assetSheetInitial.plate ?? null}
  brand={brand}
  model={model}
  year={year}
  fuelType={fuelType}
  monthAmount={monthAmount}
  totalAmount={totalAmount}
  avgEcon={avgEcon}
  fuelLogCount={initialFuelLogs.length}
/>
```

- [ ] **Step 3: Update `page.tsx` — pass new fields to `AssetDetailClient`**

In `app/(dashboard)/assets/[id]/page.tsx`, add to `assetSheetInitial`:

```typescript
assetSheetInitial={{
  id: asset.id,
  type: asset.type,
  name: asset.name,
  plate: asset.plate ?? undefined,
  purchasedAt: asset.purchasedAt,
  purchasePrice: asset.purchasePrice,
  fuelType: (asset.fuelType === '92' || asset.fuelType === 'electric' ? '95' : asset.fuelType) ?? '95',
  primaryUserId: asset.primaryUserId,
  color: asset.color,
  year: asset.year,
  brand: asset.brand,
  model: asset.model,
  initialOdometer: asset.initialOdometer,
}}
```

And as separate props on `AssetDetailClient`:

```tsx
brand={asset.brand ?? null}
model={asset.model ?? null}
year={asset.year ?? null}
initialOdometer={asset.initialOdometer ?? null}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add \
  "app/(dashboard)/assets/[id]/_components/AssetHero.tsx" \
  "app/(dashboard)/assets/[id]/_components/AssetDetailClient.tsx" \
  "app/(dashboard)/assets/[id]/page.tsx"
git commit -m "feat(ui): car detail shows brand/model/year; initialOdometer fallback for fuel log"
```

---

## Task 7: Final Push

- [ ] **Step 1: Push all commits to main**

```bash
git push origin HEAD:main
```

- [ ] **Step 2: Verify Vercel deployment — check the car creation form shows new fields**

Open `https://futari.southern-light.dev/assets`, tap 新增愛物 → 車, confirm color swatches, year/brand/model/initialOdometer fields appear. Edit an existing car and verify fields round-trip. Check the detail page shows brand/model/year in the header subtitle.
