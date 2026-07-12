---
last_updated: 2026-07-13
status: shipped
first_shipped_in: v0.8.1
updates:
  - v0.8.1: framing groups + 進度條基礎
  - v0.9.0: SavingsView 完整（MaturityCountdown / MaturingSoonPrompt / MaturedAwaitingPrompt / 繳費 vs 拿回紀錄）
  - v0.15.3: 投資型保單 accountValue + RecurringIncome 接入（#166）
related_specs: [insurance, income, recurring, guardian]
related_issues: ["#166"]
---

# SavingsView — 儲蓄險詳情頁

> 「累計繳 vs 已拿回 vs 預估剩餘」的視覺與情感框架。
> 對應 `InsuranceDetails.insuranceType = 'savings'` 的詳情頁；其他險種走 `InsuranceDetailClientLegacy`。

---

## 為什麼先做 savings

| 險種家族 | 緊迫性 | 理由 |
|---|---|---|
| **savings 儲蓄型** | **高** | 是「累計繳 vs 拿回」核心觀察的主角。framing 最複雜（預估剩餘、滿期金 prompt） |
| protection 保障型 | 中 | 零理賠 empty state 已草稿，但資料價值較低 |
| car 汽車型 | 低 | 與 protection 高度同構，留下輪 |

[insurance](insurance-design.md) 中 non-savings 險種只放 stub。

---

## Brand 張力與 framing 原則

Savings framing 天然帶 ROI 氣質，但 Futari 是陪伴框架。本 spec 採 **「ROI 結構 + 暖句永遠在場」雙層處理**：

- 進度條與數字承載 ROI 感
- 永遠存在的一句小字承載溫度（依進度切換文案）

文案原則：

1. 不出現「賺了 / 賠了 / 報酬率」等投資詞彙
2. 「拿回」用「回來」「到帳」「收到」等中性動詞，不用「獲利」
3. 預估數字一律標「估」字，不偽裝成既定事實
4. 文案有時序性（將到期 → 已到期 → 已收齊），不一句吃整個生命週期

文案常數實作落地點：`app/(dashboard)/assets/[id]/_components/insurance/`（SavingsView 元件 + `lib/insurance.ts → heroSubCopy`）。

---

## 關鍵 schema 欄位

詳細欄位以 `lib/db/schema.ts` 為準（`InsuranceDetails` 子表）。本節說「為什麼這個欄位存在」。

### `expected_maturity_amount`（v0.8.1）

獨立於 `sum_insured`：

- `sum_insured` 在台灣壽險業 = 身故金 / 死亡給付，**不等於滿期金**
- 儲蓄險滿期金可能高於或低於 sumInsured，把它當滿期金顯示會誤導
- 需要獨立欄位

**Why nullable**：讓使用者選擇要不要算 ROI。null → UI 退化成只顯示已發生的數字，不顯示預估剩餘進度條。

### `account_value`（v0.15.3 / #166）

投資型保單（投連型）有「目前帳戶價值」這個 statement-based 概念 — 對應持有的單位淨值 × 單位數。傳統儲蓄險沒有，所以 nullable。

**不由系統推算**：每次使用者拿到對帳單時手動更新一次。app 不嘗試 model 標的基金的價格。

SavingsView 把 accountValue 渲染成 hero 區下方的**獨立資訊區塊**（不混入「累計繳 vs 已拿回」雙 bar，避免和 cashflow 混淆），並提供「更新」CTA 直接打開 AssetSheet 編輯。

---

## 計算邏輯

三組 ratio（`timeProgress` / `payProgress` / `returnProgress`），定義與 edge case 實作見 `lib/insuranceProgress.ts`。

### 關鍵 edge case 政策

| 情境 | 行為 |
|---|---|
| `expectedMaturity` 未設定 | 拿回 bar 不顯示；InfoCard 顯示「未設定預估滿期金」+ inline CTA |
| `payRatio > 1.05`（已超繳） | 進度條顯示 100% 滿格，旁加小字「+ NT$ X 額外」；不顯示為「異常」 |
| `returnRatio > 1.05`（已超領） | 同上：拿回 bar 顯示 100% +「+ NT$ X 額外配息」 |
| `isMatured && returnTotal < expectedMaturity` | hero 變 MaturedAwaitingPrompt |
| `startsAt` 或 `endsAt` 缺一 | 不顯示 MaturityCountdown；副標 fallback 到 `partial` |
| `now < startsAt`（保單未生效） | timeProgress = 0；副標：「保單將於 [startsAt] 生效」 |
| `premiumTotal == 0` | hero 顯示 0 但保留版面；繳費紀錄 section 顯示 empty state CTA |

---

## UI Layout

整頁由上到下：

```
AibutsuHeader
↓ MaturingSoonPrompt（條件顯示：將到期 30 天）
↓ SavingsHero（雙 bar：入 / 出）
↓ accountValue 區塊（投連型才顯示）
↓ MaturityCountdown
↓ 繳費紀錄（cash transactions list）
↓ 拿回紀錄（income transactions list + 「記滿期金 +」section header 按鈕）
↓ 定期進帳 inline list（v0.15.3，見下方 RecurringIncome 整合）
↓ 合約資訊（加 expectedMaturityAmount row）
↓ 到期資訊
```

### SavingsHero 設計要點

- 雙 bar：入（mint accent）/ 出（gold accent），左側 1 字 mono label
- bar 右側顯示「X%」，不混入年數
- bar 下方顯示「NT$ X 累計繳 / 估 NT$ Y」
- 暖句永遠在 bar 正下方（13px ink-3）：依進度切換文案

---

## RecurringIncome 整合（v0.15.3 / #166）

分紅 / 生存金 / 滿期金有可預測的 cadence。v0.13.0 以前要使用者每次手動記。Phase B 把保單詳情頁直接接上 [recurring](recurring-design.md) 系統：

- **inline list**：SavingsView 上方新增「定期進帳」section，列出已綁定此保單的 rules（透過 query `listRulesForAsset(groupId, assetId)`）
- **prefill CTA**：點「建立定期進帳」開 `RecurringRuleSheet`，prefill `assetId=本保單`、`category='dividend'`、`source=保單名`；user 可改任何欄位
- **realtime**：訂閱 `recurring-income-changed` event，rules 在 partner 端建立 / 編輯時即時 refresh
- **Settings 頁不動**：rules 仍可在 `/settings/recurring-income` 集中管理；SavingsView 只是入口便利

**不做**：保單建立時自動產 rule。原因：保單金額 / 頻率多樣，自動產容易誤判（例如躉繳保單不該產 rule）。

---

## Trigger UX：何時 prompt 用戶記滿期金

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

## Realtime

訂閱 [realtime](realtime-design.md) 規則 + 額外的詳情頁觸發：

| Event kind | 條件 | 行為 |
|---|---|---|
| `asset-changed` | `event.row.id === assetId` | 若 `deletedAt` → redirect `/assets`；否則 `router.refresh()` |
| `transaction-changed` | `event.row.assetId === assetId` | `router.refresh()`（更新繳費紀錄 + premiumStats） |
| `income-transaction-changed` | `event.row.assetId === assetId` | `router.refresh()`（更新拿回紀錄 + returnStats + hero） |
| `reconnect` | always | `router.refresh()` |

---

## 實作落地點

`lib/insurance.ts`（family 分派 + heroSubCopy）/ `lib/insuranceProgress.ts`（computeSavingsProgress + SavingsProgress type）/ `lib/db/queries/insurance.ts`（累計繳 / 累計拿回 / 分頁 query）/ `app/(dashboard)/assets/[id]/_components/insurance/`（SavingsView 元件）/ `lib/incomeCategories.ts`（maturity / dividend / survival_annuity tokens）/ `lib/incomePalettes.ts`（mint / gold accent token）

---

## Acceptance criteria

- `insuranceType = 'savings'` 詳情頁分派到 SavingsView；其他值走 Legacy
- 雙 bar 顯示「累計繳 vs 估滿期金 / 已拿回 vs 估滿期金」百分比正確
- 暖句依進度切換（將到期 → 已到期 → 已收齊）；ROI 詞彙不出現
- `expectedMaturity` null → 拿回 bar 不顯示，InfoCard 顯示「未設定預估滿期金」CTA
- 投連型保單（accountValue 非 null）→ hero 下方獨立區塊顯示帳戶價值；CTA 直接開 AssetSheet 編輯
- 30 天內到期且 returnTotal < expectedMaturity → MaturingSoonPrompt 顯示
- 已到期但 returnTotal < expectedMaturity → MaturedAwaitingPrompt 取代 hero；CTA 開 IncomeSheet 預填
- Partner 在另一裝置記繳費 / 拿回 → 詳情頁 realtime refresh，hero 數字更新
- 「定期進帳」inline list 顯示已綁定此保單的 rules；prefill CTA 開 RecurringRuleSheet 帶入 assetId + category + source

---

## 不在本 spec 範圍

- **Protection / Car family 詳細 layout**：留下輪迭代
- **保費下次應繳推算**：根據 `payCycle + lastPaidDate` 推算。MVP 靠使用者手動記
- **還本險「每年還本」週期 prompt**：需新增 `paybackCycleYears` schema。MVP 靠 user 主動點「記滿期金 +」
- **滿期金預估自動計算**：永遠是 user 手動填 `expectedMaturityAmount`
- **多被保人 / 多受益人**
- **保單 PDF 上傳 / OCR**：future scope
- **險種家族 dashboard 統計**：跨保單聚合，留到愛物清單頁
