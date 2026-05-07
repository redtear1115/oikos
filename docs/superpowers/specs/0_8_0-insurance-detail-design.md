# 保險詳情頁設計 spec — Savings framing 優先（Phase 2 Slice 5）

> 目標：把現有的 `InsuranceDetailClient` 擴成完整的 savings（儲蓄 / 還本險）詳情頁，承載「累計繳 vs 已拿回 vs 預估剩餘」的視覺與情感框架。
> 範圍：**本 spec 只 lock savings framing**。protection / car framing 留 TODO 入口，等下一輪迭代。
> 優先級：P2 Slice 5。承接 [0_7_0-incomesheet-design.md](0_7_0-incomesheet-design.md) → Open Q1 / Q2。
> 狀態：design lock，待 implementation（v0.8.0）。

---

## 為什麼先做 savings

| 險種家族 | 緊迫性 | 為何優先 / 不優先 |
|---|---|---|
| **savings 儲蓄型** | **高** | 是「累計繳 vs 拿回」這個核心觀察的真正主角。第一張儲蓄險滿期前必須上線（[0_7_0](0_7_0-incomesheet-design.md) 排程已標）。framing 最複雜（要算預估剩餘、要 prompt 滿期金）。 |
| protection 保障型 | 中 | 0 理賠 empty state 與 copy bank 已草稿，但實際資料價值較低（醫療理賠單筆少、累計慢）。詳細 layout 留下輪做 |
| car 汽車型 | 低 | 與 protection 高度同構，只差「事故」文案與 linkedVehicle hero。一起留下輪 |

**本 spec 的兩 view（protection / car）**：只放 TODO 註解 + entry 分派 stub，避免 InsuranceDetailClient 還沒分派就跑進 SavingsView。

---

## 背景與動機

v0.7.0 ship 了 `IncomeTransactions` + IncomeSheet，使滿期金可被記錄並可選 `assetId`。但保險詳情頁本身只有靜態合約資訊（險種、被保人、起迄日、保額），沒有：

- 累計繳 vs 已拿回 的視覺化
- 預估剩餘可拿回的對照
- 繳費紀錄（已存在於 `cashTransactions.assetId`，但詳情頁未使用）
- 拿回紀錄（已存在於 `incomeTransactions.assetId + category`）
- 滿期金到帳的 trigger UX

**Brand 張力**：savings framing 天然帶 ROI 氣質（要看「賺到沒」），但 Futari 是陪伴框架。本 spec 採「ROI 結構 + 暖句永遠在場」的雙層處理：進度條與數字承載 ROI 感，永遠存在的一句小字承載溫度。

---

## 險種歸屬：擴充 `insuranceType` 文字值

`insuranceDetails.insuranceType` 是 `text`（非 pg enum），新增 `savings` 值，**無需 migration**。

#### KIND_LABELS 擴充

```ts
const KIND_LABELS: Record<string, string> = {
  medical: '醫療', life: '壽險', accident: '意外',
  cancer: '癌症', illness: '重大傷病', car: '汽車',
  savings: '儲蓄',  // NEW
}
```

#### Framing group 推導（lib/insurance.ts，新檔）

```ts
export type FramingGroup = 'savings' | 'protection' | 'car'

export function getFramingGroup(kind: string | null | undefined): FramingGroup {
  if (kind === 'savings') return 'savings'
  if (kind === 'car') return 'car'
  return 'protection'  // medical / life / accident / cancer / illness / null fallback
}
```

#### 還本壽險 edge case

傳統壽險常有「終身還本」型，技術上是 `life` 但實質含滿期金。**處理方式**：使用者在 AssetSheet 建立保單時自行選 `savings` 而非 `life`。不做自動 detect（自動 detect 容易誤判，且使用者最清楚自己保單的性質）。

AssetSheet 險種 picker 順序：`醫療 / 壽險 / 意外 / 癌症 / 重大傷病 / 汽車 / 儲蓄`（保障在前，儲蓄殿後，避免暗示產品定位）。

---

## Schema 變更：新增 `expected_maturity_amount`

### 為什麼不能用 `sum_insured`

`sumInsured`（保額）在台灣壽險業 = **身故金 / 死亡給付**，不等於滿期金。儲蓄險常見結構：
- 身故金 = 已繳保費 × 1.05（或固定數字）
- 滿期金 = 完全不同的數字（依商品條款，可能高於或低於 sumInsured）

把 sumInsured 當成滿期金顯示會誤導。需要獨立欄位。

### Migration

```sql
-- drizzle/0015_insurance_expected_maturity.sql
ALTER TABLE "InsuranceDetails"
  ADD COLUMN expected_maturity_amount integer;

COMMENT ON COLUMN "InsuranceDetails".expected_maturity_amount IS
  '使用者預估的滿期金 / 還本總額（單位：TWD）。null = 未設定，UI 不顯示「預估剩餘」';
```

### Schema diff

```ts
export const insuranceDetails = pgTable('InsuranceDetails', {
  // ... existing fields ...
  expectedMaturityAmount: integer('expected_maturity_amount'),  // NEW
})
```

### Why nullable

讓使用者選擇要不要算 ROI。null = 「我不想 / 不知道滿期金多少」→ UI 退化成只顯示已發生的數字（累計繳 / 已拿回），不顯示預估剩餘進度條。

---

## 計算邏輯（lib/insuranceProgress.ts，新檔）

### 三組進度的定義

| 名稱 | 公式 | 意義 | null 條件 |
|---|---|---|---|
| `timeProgress` | `(now - startsAt) / (endsAt - startsAt)` | 合約時間進度 | `startsAt` 或 `endsAt` 任一為 null |
| `payProgress` | `premiumTotal / (annualPremium × termYears)` | 已繳保費佔應繳總額比例 | `annualPremium` 或 `termYears` 任一為 null |
| `returnProgress` | `returnTotal / expectedMaturity` | 已拿回佔預估滿期金比例 | `expectedMaturity` 為 null |

`payProgress` 和 `returnProgress` 都 cap 在 [0, 1]，但**實際比值另外保留**（用於顯示「已超繳」「已超領」狀態）。

### Helper signature

```ts
export interface SavingsProgress {
  // 實際數字
  premiumTotal: number              // 累計繳（cashTransactions sum）
  returnTotal: number                // 已拿回（incomeTransactions where category='maturity' sum）

  // 預估數字（可能 null）
  expectedTotalPayment: number | null   // annualPremium × termYears
  expectedMaturity: number | null       // user-set
  estimatedRemaining: number | null     // max(0, expectedMaturity - returnTotal)

  // 進度（0-1，cap）
  payProgress: number | null
  returnProgress: number | null
  timeProgress: number | null

  // 原始比值（可能 > 1）
  payRatio: number | null
  returnRatio: number | null

  // 時間
  daysToMaturity: number | null     // negative if past
  yearsLeft: number | null          // negative if past
  isMatured: boolean                // now >= endsAt
  isMaturingSoon: boolean           // 0 < daysToMaturity <= 30

  // 狀態旗標
  hasOverpaid: boolean              // payRatio > 1.05（容忍 5%，避免四捨五入觸發）
  hasOverReceived: boolean          // returnRatio > 1.05
  awaitingMaturity: boolean         // isMatured && returnTotal < (expectedMaturity ?? 0)
}

export function computeSavingsProgress(input: {
  premiumTotal: number
  returnTotal: number
  annualPremium: number | null
  termYears: number | null
  expectedMaturity: number | null
  startsAt: string | null   // 'YYYY-MM-DD'
  endsAt: string | null
  now?: Date                // injectable for testing
}): SavingsProgress
```

### Edge case 處理

| 情境 | 行為 |
|---|---|
| `expectedMaturity` 未設定 | 主視覺退化：只顯示「已繳 X · 已拿回 Y」，不顯示拿回進度條。InfoCard 顯示「未設定預估滿期金」+ inline CTA |
| `payRatio > 1.05`（已超繳） | 進度條顯示 100% 滿格，旁加小字「+ NT$ X 額外」；不顯示為「異常」 |
| `returnRatio > 1.05`（已超領） | 同上：拿回 bar 顯示 100% + 「+ NT$ X 額外配息」 |
| `isMatured && returnTotal < expectedMaturity` | hero 變 `MaturedAwaitingPrompt`（見 trigger UX） |
| `startsAt` 或 `endsAt` 缺一 | 不顯示 MaturityCountdown；hero 副標 fallback 到 `partial`（不顯示日期） |
| `now < startsAt`（保單未生效） | timeProgress = 0；hero 副標：「保單將於 [startsAt] 生效」 |
| `premiumTotal == 0`（沒記過繳費） | hero 顯示 0 但保留版面；繳費紀錄 section empty state CTA |

---

## UI Layout — SavingsView

### 整頁結構（top → bottom）

```
┌──────────────────────────────────────────┐
│ AibutsuHeader (insurance tint)            │  ← existing
├──────────────────────────────────────────┤
│ ╭─ MaturingSoonPrompt（30 天內）─────╮   │
│ │ 2026-06-15 即將到期 · 別忘了       │   │  ← inline，僅特定狀態出現
│ │ 滿期金到帳要記   [ 記滿期金 → ]    │   │
│ ╰────────────────────────────────────╯   │
│                                            │
│ [SavingsHero — 主視覺]                    │
│  入  ▓▓▓▓▓▓▓▓░░░░░░░░░░  40%             │
│      NT$ 200,000 累計繳 / 估 500,000      │
│  出  ▓░░░░░░░░░░░░░░░░░░  8%              │
│      NT$ 50,000 已拿回 / 估 600,000       │
│                                            │
│  ─ 「已拿回 8% · 距滿期還有 8.5 年」      │
├──────────────────────────────────────────┤
│ MaturityCountdown                          │  ← 既有實作 reuse
│ 起保 ─────●─────────── 滿期               │
│ 2024-04-01            2034-04-01          │
│ 距滿期還有 8.5 年                         │
├──────────────────────────────────────────┤
│ 繳費紀錄  ─────                            │
│  · 2026-04-01  NT$ 50,000  Ray            │
│  · 2025-04-01  NT$ 50,000  Ray            │
│  ▼ load more                              │
├──────────────────────────────────────────┤
│ 拿回紀錄  ─────         [ 記滿期金 + ]    │
│  ╭────────────────────────────────────╮   │
│  │ 滿期日還沒到 · 請耐心              │   │  ← empty state
│  ╰────────────────────────────────────╯   │
├──────────────────────────────────────────┤
│ 合約資訊（既有 InfoCard，加一行）          │
│ ┌────────────────────────────────────────┐│
│ │ 險種          儲蓄                      ││
│ │ 被保人        Ray                       ││
│ │ 保險公司      國泰人壽                  ││
│ │ 保單號        ABC123                    ││
│ │ 繳費週期      年繳                      ││
│ │ 預估滿期金    NT$ 600,000   [ 編輯 ]   ││  ← NEW row
│ └────────────────────────────────────────┘│
├──────────────────────────────────────────┤
│ 到期資訊（既有 InfoCard）                 │
└──────────────────────────────────────────┘
   FAB → AddSheet 預填繳保費（既有）
```

### SavingsHero 細節

雙 bar 並排，**入** / **出** 為左側 1 字 mono label：

- 入 bar：填 mint accent（既有 income palette），顯示 `payProgress`
- 出 bar：填淡金 accent（不要也用 mint，避免兩 bar 顏色相同），顯示 `returnProgress`
- bar 右側顯示「X%」（純百分比，不混入年數，避免兩個 metric 混淆）
- bar 下方顯示「NT$ X 累計繳 / 估 NT$ Y」or「NT$ X 已拿回 / 估 NT$ Y」
- 年數推估（「已繳約 N / M 年」）只在 InfoCard 內以小字補充，不放 hero（因為實付未必整數倍 annualPremium，hero 不該透露這個 mismatch）

bar 顏色 token 用 [INCOME_PALETTES](lib/incomePalettes.ts) 的 mint + gold 兩變體（已存在但未公開切換）。

**`expectedMaturity` 為 null 時的退化**：
- 拿回 bar 整條不顯示，只顯示「已拿回 NT$ Y · 預估金額未設定 [設定 →]」
- 入 bar 仍顯示，因為它依 `annualPremium × termYears` 不依 `expectedMaturity`

### 永遠在場的暖句

bar 區塊正下方 6px 處一行小字（color: ink-3, 13px）：依進度切：

```ts
function heroSubCopy(p: SavingsProgress, endsAt: string | null): string {
  if (p.awaitingMaturity) {
    return `滿期日已到 · 等候滿期金到帳`
  }
  if (p.returnTotal === 0) {
    return endsAt ? `這筆每年放進去的，${endsAt} 會回來` : `這筆每年放進去的，未來會回來`
  }
  if (p.returnRatio !== null && p.returnRatio < 1) {
    const pct = Math.round(p.returnProgress! * 100)
    return p.yearsLeft !== null && p.yearsLeft > 0
      ? `已拿回 ${pct}% · 距滿期還有 ${p.yearsLeft.toFixed(1)} 年`
      : `已拿回 ${pct}%`
  }
  return `滿期了 · 共拿回 NT$ ${p.returnTotal.toLocaleString()}`
}
```

### Token / 字級

| 元素 | token / 值 |
|---|---|
| Bar 高 | 8px |
| Bar 顏色 in | `INCOME_PALETTES.mint.accent` |
| Bar 顏色 out | `INCOME_PALETTES.gold.accent` |
| Bar 背景 | `rgba(58,36,25,0.08)`（既有 hairline 邏輯） |
| Bar label「入 / 出」字 | mono 14px ink-2 |
| 數字大字「NT$ X」 | numeric font 24px semibold ink |
| 副標 | 13px ink-3 |
| 暖句 | 13px ink-3 italic? — 留設計師決定 |

---

## Trigger UX — 何時 prompt 用戶記滿期金

### 三個 trigger 點

| Trigger | 條件 | UI | 重點 |
|---|---|---|---|
| **Hero 30 天前 prompt** | `0 < daysToMaturity <= 30 && returnTotal < expectedMaturity` | 黃色背景 inline row in hero 上方 | 提前心理準備 |
| **Hero 滿期後 await prompt** | `awaitingMaturity` | hero 變 `MaturedAwaitingPrompt`（取代正常 hero） | 明確 CTA |
| **拿回紀錄 section header CTA** | 一律顯示（除非 already 100%+ 拿回） | section header 右側小字按鈕「記滿期金 +」 | 隨時可手動記 |

### MaturingSoonPrompt（30 天前）

```
╭────────────────────────────────────────╮
│ 🌱  2026-06-15 即將到期                │
│     別忘了滿期金到帳要記                │
│                       [ 記滿期金 → ]   │
╰────────────────────────────────────────╯
```

- 背景：`rgba(168, 220, 196, 0.18)`（mint glow，淡）
- 邊框：`rgba(168, 220, 196, 0.5)` dashed
- 不可手動 dismiss（30 天就會自動消失或變成 MaturedAwaitingPrompt）

### MaturedAwaitingPrompt（滿期日到了還沒拿）

**取代正常 SavingsHero**，因為這時候進度條沒意義（時間已 100%，只等錢進來）：

```
╭────────────────────────────────────────╮
│ 滿期日已到 · 2026-06-15                │
│                                          │
│        NT$ 600,000 預估                 │
│        待入帳                             │
│                                          │
│        [ 我已經收到滿期金了 → ]          │
│                                          │
│  累計繳 NT$ 200,000 已記入 N 筆         │
╰────────────────────────────────────────╯
```

- CTA 點擊：開 IncomeSheet 預填 `assetId, category='maturity', amount=expectedMaturity`（金額預填讓使用者改）
- 「我已經收到」用詞主動，避免「快點記」的催促感

### 「記滿期金 +」section header 按鈕

- 永遠在「拿回紀錄」section header 右側顯示（mirror existing「其他花費」按鈕 pattern in [AssetDetailClient.tsx:170-179](app/(dashboard)/assets/[id]/_components/AssetDetailClient.tsx)）
- 點擊：開 IncomeSheet `prefilledAssetId + prefilledCategory='maturity'`，金額不預填
- 條件隱藏：`returnRatio >= 1.05`（明顯已收齊）→ 隱藏按鈕，避免「我已經收完了還在催」

### 不做的 trigger

- ❌ Push notification — 太侵入
- ❌ Dashboard 紅點 — 違反「克制」
- ❌ Email / SMS 提醒 — 不是這個 phase 的事
- ❌ 還本險「每年還本」自動偵測 prompt — 需要 `paybackCycleYears` 欄位 + 上次還本日 tracking，留 future。MVP 靠使用者主動點「記滿期金 +」按鈕，文案在 IncomeSheet 內可改成「還本金」（未來如果做的話）

---

## 文案 bank（insurance-copy.ts，savings only）

```ts
// 永遠在場的暖句（hero bars 下方）
export const SAVINGS_HERO_SUB = {
  notStarted: (maturityDate: string | null) =>
    maturityDate
      ? `這筆每年放進去的，${maturityDate} 會回來`
      : `這筆每年放進去的，未來會回來`,

  partial: (pct: number, yearsLeft: number | null) =>
    yearsLeft !== null && yearsLeft > 0
      ? `已拿回 ${pct}% · 距滿期還有 ${yearsLeft.toFixed(1)} 年`
      : `已拿回 ${pct}%`,

  matured: (total: number) =>
    `滿期了 · 共拿回 NT$ ${total.toLocaleString()}`,

  awaitingMaturity: () =>
    `滿期日已到 · 等候滿期金到帳`,

  notYetActive: (startsAt: string) =>
    `保單將於 ${startsAt} 生效`,
}

// 拿回紀錄 section empty state
export const SAVINGS_RETURN_EMPTY = {
  beforeMaturity: '滿期日還沒到 · 請耐心',
  awaitingMaturity: '滿期日已到 · 滿期金到帳了嗎？',
}

// MaturingSoonPrompt
export const SAVINGS_MATURING_SOON = (maturityDate: string) =>
  `${maturityDate} 即將到期\n別忘了滿期金到帳要記`

// MaturedAwaitingPrompt
export const SAVINGS_MATURED_AWAITING = {
  title: (maturityDate: string) => `滿期日已到 · ${maturityDate}`,
  status: '待入帳',
  cta: '我已經收到滿期金了 →',
  premiumNote: (total: number, count: number) =>
    `累計繳 NT$ ${total.toLocaleString()} 已記入 ${count} 筆`,
}

// 「預估滿期金」未設定時的 inline CTA
export const SAVINGS_NO_EXPECTED_MATURITY = {
  bar: '已拿回 NT$ {y} · 預估金額未設定',
  ctaLabel: '設定預估金額',
}
```

**設計原則重申**：
1. 不出現「賺了 / 賠了 / 報酬率」等投資詞彙
2. 「拿回」用「回來」、「到帳」、「收到」等中性動詞，不用「獲利」
3. 預估數字一律標「估」字，不偽裝成既定事實
4. 滿期文案有時序性（將到期 → 已到期 → 已收齊），不一句吃整個生命週期

---

## 資料 query 變更

### 新增 [lib/db/queries/insurance.ts](lib/db/queries/insurance.ts)

```ts
// 累計繳保費（filter cashTransactions where assetId）
export async function getInsurancePaymentTotal(
  assetId: string, groupId: string,
): Promise<{ total: number; count: number }>

// 累計拿回（filter incomeTransactions where assetId AND category in ...）
export async function getInsuranceReturnTotal(
  assetId: string, groupId: string,
  categories: ('maturity' | 'claim')[],
): Promise<{ total: number; count: number }>

// 拿回紀錄分頁
export async function listInsuranceReturnsPaged(
  assetId: string, groupId: string,
  cursor: IncomeCursor | null, limit = 20,
): Promise<IncomeRow[]>
```

繳費紀錄沿用既有 [`listTransactionsPagedForAsset`](lib/db/queries/asset.ts)。

### page.tsx 變更（保險分支）

```ts
const details = await getInsuranceDetails(asset.id)
const framingGroup = getFramingGroup(details?.kind)

// 本 spec 只實作 savings；其他兩 group 走 placeholder
if (framingGroup !== 'savings') {
  return (
    <InsuranceDetailClientLegacy ... />  // 維持現況，不做新功能
  )
}

const expectedCategories: ('maturity' | 'claim')[] = ['maturity']

const [premiumStats, returnStats, premiumTxns, returnTxns] = await Promise.all([
  getInsurancePaymentTotal(asset.id, group.id),
  getInsuranceReturnTotal(asset.id, group.id, expectedCategories),
  listTransactionsPagedForAsset(asset.id, group.id, null, PAGE_SIZE),
  listInsuranceReturnsPaged(asset.id, group.id, null, PAGE_SIZE),
])

return (
  <SavingsView
    assetId={asset.id}
    name={asset.name}
    details={details}
    expectedMaturity={details?.expectedMaturityAmount ?? null}
    premiumStats={premiumStats}
    returnStats={returnStats}
    initialPremiumTxns={serializeTxns(premiumTxns)}
    initialReturnTxns={serializeIncomes(returnTxns)}
    assetSheetInitial={...}
    allAssets={allAssets}
  />
)
```

---

## File layout

```
lib/
  insurance.ts                          # NEW: getFramingGroup
  insuranceProgress.ts                  # NEW: computeSavingsProgress + types
  db/queries/insurance.ts               # NEW: payment/return queries

drizzle/
  0015_insurance_expected_maturity.sql  # NEW: ALTER TABLE add column

app/(dashboard)/assets/[id]/_components/
  InsuranceDetailClient.tsx             # 改為 dispatch by framingGroup
  InsuranceDetailClientLegacy.tsx       # NEW: 把現況搬過來，給 protection/car 暫用
  insurance/
    SavingsView.tsx                     # NEW
    SavingsHero.tsx                     # NEW: bar + 暖句
    MaturingSoonPrompt.tsx              # NEW
    MaturedAwaitingPrompt.tsx           # NEW
    insurance-atoms.tsx                 # NEW: shared cards / cells
    insurance-copy.ts                   # NEW: copy bank
    # TODO(next iteration):
    #   ProtectionView.tsx
    #   CarInsuranceView.tsx

app/(dashboard)/assets/_components/
  AssetSheet.tsx                        # add 'savings' kind + expectedMaturityAmount field

app/(dashboard)/dashboard/_components/
  IncomeSheet.tsx                       # add prefilledCategory prop + amount prefill support

actions/
  asset.ts                              # editInsurance accept expectedMaturityAmount

lib/
  validators.ts                         # add expectedMaturityAmount to insurance schema
```

---

## AssetSheet 變更

險種 picker 加 `savings` 選項。當 `kind === 'savings'`，conditionally render 多一個欄位：

```tsx
<Field label="預估滿期金（選填）">
  <NumberInput
    value={expectedMaturityAmount}
    placeholder="例如 600,000"
    onChange={setExpectedMaturityAmount}
  />
  <HelpText>
    儲蓄險到期時可拿回的總金額。可空白；之後在保險頁也能設。
  </HelpText>
</Field>
```

`kind !== 'savings'` 時欄位隱藏，且 submit 時 `expectedMaturityAmount` 一律送 null（防止 user 切換險種時殘留舊值）。

---

## IncomeSheet 變更

### 新增 props

```ts
interface IncomeSheetProps {
  // ... existing ...
  prefilledCategory?: IncomeCategoryId
  prefilledAmount?: number             // 新增：給 MaturedAwaitingPrompt 用
}
```

### Effect 邏輯

```ts
useEffect(() => {
  if (open) {
    // ... existing prefill logic ...
    if (prefilledCategory) setCategory(prefilledCategory)
    if (prefilledAmount !== undefined) setAmount(prefilledAmount)
  }
}, [open, initial, viewer.id, prefilledAssetId, prefilledCategory, prefilledAmount])
```

### MaturedAwaitingPrompt 的呼叫範例

```tsx
<IncomeSheet
  open={incomeSheetOpen}
  prefilledAssetId={assetId}
  prefilledCategory="maturity"
  prefilledAmount={expectedMaturity ?? undefined}  // 預填預估金額讓 user 改
  onClose={() => setIncomeSheetOpen(false)}
  onMutated={() => router.refresh()}
/>
```

---

## Realtime

SavingsView 訂閱以下 events（沿用 [RealtimeProvider](app/(dashboard)/_components/RealtimeProvider.tsx) pattern）：

| Event kind | 條件 | 行為 |
|---|---|---|
| `asset-changed` | `event.row.id === assetId` | 若 `deletedAt` → redirect /assets；否則 `router.refresh()` |
| `transaction-changed` | `event.row.assetId === assetId` | `router.refresh()`（更新繳費紀錄 + premiumStats） |
| `income-transaction-changed` | `event.row.assetId === assetId` | `router.refresh()`（更新拿回紀錄 + returnStats + hero） |
| `reconnect` | always | `router.refresh()` |

---

## 不在本 spec 範圍

1. **Protection / Car framing 的詳細 layout**：留下輪迭代。本 spec 的 InsuranceDetailClient 對非 savings 險種仍走現況 layout（`InsuranceDetailClientLegacy`）
2. **AibutsuHintCard 接入保險頁**：[0_5_0-aibutsu-design.md](0_5_0-aibutsu-design.md) 已決定不納入。SavingsView 的 hero 本身就是入門教學
3. **保費下次應繳推算 + 推播**：根據 `payCycle + lastPaidDate` 推算。MVP 靠使用者手動記
4. **還本險「每年還本」週期 prompt**：需新增 `paybackCycleYears` schema + 上次還本追蹤。MVP 靠 user 主動點「記滿期金 +」
5. **滿期金預估自動計算**：例如「依繳費年期 × 預估利率推估」—— 不做。永遠是 user 手動填 `expectedMaturityAmount`
6. **多被保人 / 多受益人**：目前 schema 單一被保人，先不擴
7. **保單 PDF 上傳 / OCR**：future scope
8. **險種家族 dashboard 統計**：「你的儲蓄險共預估可拿 NT$ X」這類跨保單聚合，留到愛物清單頁

---

## Verification

實作完成後人工驗證：

### Savings 主路徑
- [ ] 建立 `savings` 險種保單，AssetSheet 的「預估滿期金」欄位出現；切到其他險種時欄位消失
- [ ] SavingsView hero 雙 bar 正確顯示 payProgress / returnProgress
- [ ] 暖句依 returnTotal / yearsLeft 切換正確（notStarted / partial / matured 三狀態）
- [ ] `expectedMaturity = null` 時，拿回 bar 退化為「設定預估金額」CTA
- [ ] 繳費 row 列出 cashTransactions where assetId（不含其他保單）
- [ ] 拿回 row 列出 incomeTransactions where assetId AND category='maturity'

### Trigger UX
- [ ] 滿期日 30 天內：MaturingSoonPrompt 出現在 hero 上方
- [ ] 滿期日已到但 returnTotal < expectedMaturity：hero 變 MaturedAwaitingPrompt
- [ ] MaturedAwaitingPrompt CTA 開 IncomeSheet 預填 assetId + category=maturity + amount=expectedMaturity
- [ ] 「記滿期金 +」section header 按鈕一律顯示（returnRatio >= 1.05 時隱藏）

### 計算 helper
- [ ] computeSavingsProgress 對所有 edge case 有 unit test：
  - 全空 inputs
  - `expectedMaturity = null`
  - `now < startsAt`（保單未生效）
  - `payRatio > 1.05`（已超繳）
  - `returnRatio > 1.05`（已超領）
  - `awaitingMaturity` 狀態

### Realtime
- [ ] partner 在另一裝置記了一筆繳費 → 詳情頁 hero / 繳費 row 即時 refresh
- [ ] partner 記了滿期金 → 拿回 bar 跳動，暖句切換

### Schema
- [ ] migration 0015 在 dev / prod 都跑
- [ ] 既有 insurance 保單不受影響（`expected_maturity_amount` 預設 null）

---

## 排程

- **v0.8.0**（預計 1 週）：本 spec 全部實作
  - drizzle/0015 migration
  - lib/insurance.ts + lib/insuranceProgress.ts + lib/db/queries/insurance.ts
  - SavingsView + atoms + copy
  - InsuranceDetailClient dispatch + Legacy fallback
  - AssetSheet `savings` kind + expectedMaturityAmount field
  - IncomeSheet `prefilledCategory` + `prefilledAmount` props
  - validators / actions update
- **v0.9.0**（後續）：ProtectionView + CarInsuranceView（前 spec 草稿可參考）

---

## 索引

- [0_5_0-aibutsu-design.md](0_5_0-aibutsu-design.md) — 愛物概念 / 保險作為 entity type
- [0_7_0-incomesheet-design.md](0_7_0-incomesheet-design.md) — IncomeTransactions schema + maturity / claim category
- [InsuranceDetailClient.tsx](../../../app/%28dashboard%29/assets/%5Bid%5D/_components/InsuranceDetailClient.tsx) — 現況入口
- [lib/db/queries/aibutsu.ts](../../../lib/db/queries/aibutsu.ts) — getInsuranceDetails
- [lib/incomeCategories.ts](../../../lib/incomeCategories.ts) — 期 / 賠 category tokens
- [lib/db/queries/asset.ts](../../../lib/db/queries/asset.ts) — listTransactionsPagedForAsset（繳費紀錄沿用）
- [lib/incomePalettes.ts](../../../lib/incomePalettes.ts) — mint / gold accent token（hero bar 用）
