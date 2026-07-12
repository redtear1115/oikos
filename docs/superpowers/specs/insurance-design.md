---
last_updated: 2026-05-13
status: shipped
first_shipped_in: v0.6.0
related_specs: [aibutsu, guardian, savings-view, aibutsu-templates]
related_issues: []
---

# Insurance — Entity 與險種家族

> 保險作為愛物的一種，但獨立於模板系統：有自己的 `InsuranceDetails` 子表、PII 加密、險種家族 dispatch。
> 儲蓄險的詳情頁 framing / SavingsView UI 見 [savings-view](savings-view-design.md)。
> 跟付費層的關係見 [guardian](guardian-design.md)。

---

## 在愛物群裡的定位

`Assets.type = 'insurance'` 是 6 種「entity-style」愛物之一（car / house / child / pet / plant / insurance），不是 template-based（`type = 'item'`）。理由見 [aibutsu-templates](aibutsu-templates-design.md)：

- **PII 加密**：被保險人身分證、受益人資料 — 必須走 InsuranceDetails 子表才能做欄位級加密
- **儲蓄險 SavingsView**：MaturityCountdown / RecurringIncome 接入完全不適用 jsonb 模板
- **Guardian framing**：保險是「將來會擴張」的入口的第一個 product，模板化會逆向退化成純文字紀錄

模板路徑保留給「沒有任何後端行為」的物品。

---

## 險種家族分派

`InsuranceDetails.insuranceType` 是 `text`（非 pg enum，方便加值），三個家族：

| Family | 對應 insuranceType 值 | 詳情頁 |
|---|---|---|
| **savings 儲蓄型** | `savings` | [savings-view](savings-view-design.md) — 完整 framing |
| protection 保障型 | `medical` / `life` / 其他 | `InsuranceDetailClientLegacy`（維持原樣） |
| car 汽車型 | `auto` | `InsuranceDetailClientLegacy`（同 protection） |

分派邏輯：`lib/insurance.ts` 的 `getInsuranceFamily(insuranceType)`。

### 還本壽險 edge case

傳統壽險有「終身還本」型，技術上是 `life` 但實質含滿期金。處理方式：**使用者建立保單時自行選 `savings`**。不做自動 detect（容易誤判，且使用者最清楚自己保單的性質）。

---

## InsuranceDetails 欄位語意

詳細欄位以 `lib/db/schema.ts` 為準。本節說「為什麼這個結構」。

| 欄位類別 | 範例 | 為什麼 |
|---|---|---|
| 基本資訊 | `name` / `policy_number` / `company_name` / `insurance_type` | 保單身分 |
| 期程 | `starts_at` / `ends_at` / `pay_cycle` | 繳費 cadence + 期程；空白允許部分輸入 |
| 金額 | `sum_insured` / `expected_maturity_amount` / `account_value` | sum_insured = 身故金（非滿期金）；expected_maturity 是 savings 預估滿期金；account_value 是投資型保單帳戶價值 |
| 關係人 | `policy_holder_user_id` / `insured_user_id` / `insured_child_id` | FK 到 Profiles 或 ChildDetails；多被保人不在 MVP scope |
| PII | `policy_holder_pii` / `insured_pii`（加密欄位） | 身分證、健保卡 — AES-256-GCM in Server Action，DB 只看到 ciphertext |
| 連結 | `vehicle_id` | 強連到 CarDetails（汽車險） |
| `sum_insured` 限定 | 不等於 `expected_maturity_amount` | `sum_insured` = 身故金 / 死亡給付；儲蓄險滿期金可能高於或低於 sum_insured，把它當滿期金顯示會誤導 |

`expected_maturity_amount` / `account_value` 在 non-savings kind 時 validator 會清成 null（避免 stale value）。

---

## 跟 Guardian 模組的關係

保險是 Guardian 模組的第一個 product。`canAccessGuardian(group)` 是單一閘門，see [guardian](guardian-design.md)：

- OFF 時：TypePicker 隱藏保險 tile；既有 insurance asset detail 顯示 GatedView（資料保留）
- ON 時：所有保險入口正常

實作 contract：**任何 nav / route guard / server action 判斷「保險可不可用」必須呼叫 `canAccessGuardian()`**，不要直接讀 flag。

---

## Realtime

[realtime](realtime-design.md) 訂閱 `Assets` table，insurance asset 的 INSERT / UPDATE / 軟刪 觸發 list 同步。詳情頁更深的 realtime 行為（繳費紀錄 / 拿回紀錄 / hero 更新）見 [savings-view](savings-view-design.md)。

---

## 不做的事

- ❌ **自動 detect 還本壽險**：容易誤判，user 最清楚
- ❌ **多被保人 / 多受益人**：MVP schema 單一被保人
- ❌ **保單 PDF 上傳 / OCR**：future scope
- ❌ **險種家族 dashboard 統計**：跨保單聚合留到愛物清單頁
- ❌ **走模板路徑而非 InsuranceDetails 子表**：PII 加密 + SavingsView 接入完全不適用 jsonb

---

## Acceptance criteria

- 建立 insurance asset → 走 InsuranceDetails 子表 INSERT；PII 欄位走 AES-256-GCM 加密
- `insurance_type = 'savings'` → 詳情頁分派到 SavingsView（[savings-view](savings-view-design.md)）；其他值 → Legacy
- 軟刪 insurance asset → list 移除；Guardian OFF 時 detail 頁仍可進入（GatedView 而非 redirect，[guardian](guardian-design.md) acceptance）
- Guardian OFF + `createInsurance` server action 直接呼叫 → throw `guardian_disabled`
- 切換 `insuranceType` 從 savings → protection → `expected_maturity_amount` / `account_value` validator 自動 set null
- `vehicle_id` FK 指向已軟刪除 car → list / detail 顯示「（已刪除）」label，不 crash
