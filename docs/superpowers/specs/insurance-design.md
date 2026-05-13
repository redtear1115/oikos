---
status: shipped
shipped_in: v0.8.1（framing groups + 進度條基礎）· v0.9.0（SavingsView 完整：MaturityCountdown / MaturingSoonPrompt / MaturedAwaitingPrompt / 繳費 vs 拿回紀錄）· v0.15.3（投資型保單 accountValue + RecurringIncome 接入）
---

# 保險詳情頁設計 spec — Savings framing（Phase 2 Slice 5）

> 目標：把 InsuranceDetailClient 擴成完整 savings（儲蓄 / 還本險）詳情頁，承載「累計繳 vs 已拿回 vs 預估剩餘」視覺與情感框架。
> 狀態：**全部已實作（v0.9.0 / v0.8.1）**。見 [lib/insurance.ts](../../../lib/insurance.ts)、[lib/insuranceProgress.ts](../../../lib/insuranceProgress.ts)、[lib/db/queries/insurance.ts](../../../lib/db/queries/insurance.ts)、[app/(dashboard)/assets/[id]/_components/insurance/](../../../app/%28dashboard%29/assets/%5Bid%5D/_components/insurance/)。

---

## 為什麼先做 savings

| 險種家族 | 緊迫性 | 理由 |
|---|---|---|
| **savings 儲蓄型** | **高** | 是「累計繳 vs 拿回」核心觀察的主角。framing 最複雜（預估剩餘、滿期金 prompt）。 |
| protection 保障型 | 中 | 零理賠 empty state 已草稿，但資料價值較低（醫療理賠單筆少、累計慢）。留下輪。 |
| car 汽車型 | 低 | 與 protection 高度同構，只差事故文案與 linkedVehicle hero。留下輪。 |

本 spec 對非 savings 險種只放 stub，走 `InsuranceDetailClientLegacy`（維持原樣）。

---

## 背景與動機

v0.7.0 ship IncomeTransactions + IncomeSheet 後，滿期金可被記錄並選 `assetId`。但保險詳情頁只有靜態合約資訊，沒有：累計繳 vs 已拿回的視覺化、預估剩餘的對照、繳費 / 拿回紀錄、滿期金到帳的 trigger UX。

**Brand 張力**：savings framing 天然帶 ROI 氣質，但 Futari 是陪伴框架。本 spec 採「ROI 結構 + 暖句永遠在場」雙層處理：進度條與數字承載 ROI 感，永遠存在的一句小字承載溫度。

---

## 險種歸屬：`insuranceType` 新增 `savings`

`insuranceDetails.insuranceType` 是 `text`（非 pg enum），新增 `savings` 值，**無需 migration**。

分派邏輯（`savings` / `protection` / `car`）見 [lib/insurance.ts](../../../lib/insurance.ts)。

#### 還本壽險 edge case

傳統壽險有「終身還本」型，技術上是 `life` 但實質含滿期金。處理方式：使用者建立保單時自行選 `savings`。不做自動 detect（容易誤判，且使用者最清楚自己保單的性質）。

---

## Schema 變更：`account_value`（v0.15.3 / #166）

投資型保單（投連型）有「目前帳戶價值」這個 statement-based 概念 — 對應持有的單位淨值 × 單位數。傳統儲蓄險沒有，所以 nullable。

不由系統推算：每次使用者拿到對帳單時手動更新一次。app 不嘗試 model 標的基金的價格。

| Schema | Migration | Comment |
|---|---|---|
| `insuranceDetails.accountValue` (integer, nullable) | [drizzle/0034](../../../drizzle/0034_insurance_account_value.sql) | 只在 `kind === 'savings'` 時 persist；其他 kind 切換時 validator 會清成 null（同 `expectedMaturityAmount` 邏輯） |

SavingsView 把 accountValue 渲染成 hero 區下方的獨立資訊區塊（不混入「累計繳 vs 已拿回」雙 bar，避免和 cashflow 混淆），並提供「更新」CTA 直接打開 AssetSheet 編輯。

## RecurringIncome 整合（v0.15.3 / #166）

分紅 / 生存金 / 滿期金有可預測的 cadence，但 v0.13.0 以前要使用者每次手動記。Phase B 把保單詳情頁直接接上既有的 `RecurringIncomeRules` 系統：

- **inline list**：SavingsView 上方新增「定期進帳」section，列出已綁定此保單的 rules（透過新 query `listRulesForAsset(groupId, assetId)`）
- **prefill CTA**：點「建立定期進帳」開 `RecurringRuleSheet`，prefill `assetId=本保單`、`category='dividend'`、`source=保單名`，user 可改任何欄位
- **realtime**：訂閱 `recurring-income-changed` event，rules 在 partner 端建立/編輯時即時 refresh
- **Settings 頁不動**：rules 仍可在 `/settings/recurring-income` 集中管理；SavingsView 只是入口便利

不做：保單建立時自動產 rule。原因：保單金額/頻率多樣，自動產容易誤判（例如躉繳保單不該產 rule）。

## Schema 變更：`expected_maturity_amount`

### 為什麼不能用 `sum_insured`

`sumInsured`（保額）在台灣壽險業 = 身故金 / 死亡給付，**不等於滿期金**。儲蓄險滿期金可能高於或低於 sumInsured，把它當滿期金顯示會誤導。需要獨立欄位。

### Why nullable

讓使用者選擇要不要算 ROI。null → UI 退化成只顯示已發生的數字，不顯示預估剩餘進度條。

Schema 見 [lib/db/schema.ts](../../../lib/db/schema.ts) → `insuranceDetails.expectedMaturityAmount`。Migration：[drizzle/0015](../../../drizzle/0015_insurance_expected_maturity.sql)。

---

## 計算邏輯

三組進度（`timeProgress` / `payProgress` / `returnProgress`）定義與 edge case 見 [lib/insuranceProgress.ts](../../../lib/insuranceProgress.ts)。

### 關鍵 edge case 政策

| 情境 | 行為 |
|---|---|
| `expectedMaturity` 未設定 | 拿回 bar 不顯示；InfoCard 顯示「未設定預估滿期金」+ inline CTA |
| `payRatio > 1.05`（已超繳） | 進度條顯示 100% 滿格，旁加小字「+ NT$ X 額外」；不顯示為「異常」 |
| `returnRatio > 1.05`（已超領） | 同上：拿回 bar 顯示 100% + 「+ NT$ X 額外配息」 |
| `isMatured && returnTotal < expectedMaturity` | hero 變 MaturedAwaitingPrompt |
| `startsAt` 或 `endsAt` 缺一 | 不顯示 MaturityCountdown；副標 fallback 到 `partial` |
| `now < startsAt`（保單未生效） | timeProgress = 0；副標：「保單將於 [startsAt] 生效」 |
| `premiumTotal == 0` | hero 顯示 0 但保留版面；繳費紀錄 section 顯示 empty state CTA |

---

## UI Layout — SavingsView

整頁由上到下：AibutsuHeader → MaturingSoonPrompt（條件顯示）→ SavingsHero（雙 bar）→ MaturityCountdown → 繳費紀錄 → 拿回紀錄（+ 「記滿期金 +」section header 按鈕）→ 合約資訊（加 expectedMaturityAmount row）→ 到期資訊。

**SavingsHero 設計要點：**
- 雙 bar：入（mint accent）/ 出（gold accent），左側 1 字 mono label
- bar 右側顯示「X%」，不混入年數
- bar 下方顯示「NT$ X 累計繳 / 估 NT$ Y」
- 暖句永遠在 bar 正下方（13px ink-3）：依進度切換文案，見 [lib/insurance.ts](../../../lib/insurance.ts) `heroSubCopy`

---

## Trigger UX — 何時 prompt 用戶記滿期金

| Trigger | 條件 | UI |
|---|---|---|
| 30 天前 prompt | `0 < daysToMaturity <= 30 && returnTotal < expectedMaturity` | 黃色背景 inline row，MaturingSoonPrompt |
| 滿期後 await prompt | `awaitingMaturity` | hero 變 MaturedAwaitingPrompt（取代正常 hero） |
| section header CTA | 一律顯示（除非 returnRatio ≥ 1.05） | 「記滿期金 +」按鈕 |

MaturedAwaitingPrompt CTA 點擊 → 開 IncomeSheet 預填 `assetId, category='maturity', amount=expectedMaturity`。

### 不做的 trigger

- ❌ Push notification — 太侵入
- ❌ Dashboard 紅點 — 違反「克制」
- ❌ 還本險「每年還本」自動偵測 prompt — 需 `paybackCycleYears` 欄位，留 future

---

## 文案

文案常數見 [app/(dashboard)/assets/[id]/_components/insurance/](../../../app/%28dashboard%29/assets/%5Bid%5D/_components/insurance/)（`SavingsView` 元件）。

**設計原則**：
1. 不出現「賺了 / 賠了 / 報酬率」等投資詞彙
2. 「拿回」用「回來」「到帳」「收到」等中性動詞，不用「獲利」
3. 預估數字一律標「估」字，不偽裝成既定事實
4. 文案有時序性（將到期 → 已到期 → 已收齊），不一句吃整個生命週期

---

## Realtime 訂閱

| Event kind | 條件 | 行為 |
|---|---|---|
| `asset-changed` | `event.row.id === assetId` | 若 `deletedAt` → redirect /assets；否則 `router.refresh()` |
| `transaction-changed` | `event.row.assetId === assetId` | `router.refresh()`（更新繳費紀錄 + premiumStats） |
| `income-transaction-changed` | `event.row.assetId === assetId` | `router.refresh()`（更新拿回紀錄 + returnStats + hero） |
| `reconnect` | always | `router.refresh()` |

---

## 不在本 spec 範圍

1. **Protection / Car framing 詳細 layout**：留下輪迭代
2. **保費下次應繳推算**：根據 `payCycle + lastPaidDate` 推算。MVP 靠使用者手動記
3. **還本險「每年還本」週期 prompt**：需新增 `paybackCycleYears` schema。MVP 靠 user 主動點「記滿期金 +」
4. **滿期金預估自動計算**：永遠是 user 手動填 `expectedMaturityAmount`
5. **多被保人 / 多受益人**：目前 schema 單一被保人
6. **保單 PDF 上傳 / OCR**：future scope
7. **險種家族 dashboard 統計**：跨保單聚合，留到愛物清單頁

---

## 索引

- [aibutsu-design.md](aibutsu-design.md) — 愛物概念 / 保險作為 entity type
- [income-design.md](income-design.md) — IncomeTransactions schema + maturity / claim category
- [lib/insurance.ts](../../../lib/insurance.ts) — framing group 推導 + heroSubCopy
- [lib/insuranceProgress.ts](../../../lib/insuranceProgress.ts) — computeSavingsProgress + SavingsProgress type
- [lib/db/queries/insurance.ts](../../../lib/db/queries/insurance.ts) — 累計繳 / 累計拿回 / 分頁 query
- [lib/incomeCategories.ts](../../../lib/incomeCategories.ts) — maturity / claim category tokens
- [lib/incomePalettes.ts](../../../lib/incomePalettes.ts) — mint / gold accent token（hero bar）
