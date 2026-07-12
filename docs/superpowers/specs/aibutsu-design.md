---
last_updated: 2026-05-13
status: shipped
first_shipped_in: v0.5.0
updates:
  - v0.5.0: Child + Pet + Plant entity types（共用同一 slice，base fields only）
  - v0.6.0: House + Insurance entity types
  - v0.8.1: 愛物清單 inline 分組（財產 / 生命體 / 保障）+ AibutsuHintCard onboarding
  - v0.11.4: per-type tint + 儲蓄 badge（#28）
  - v0.15.2: 愛物 / 守護 tab 切分（#178）
  - v0.16.0: `'item'` template type 加入（#222，見 [aibutsu-templates](aibutsu-templates-design.md)）+ 守護升格獨立模組（#220 #221 #227，見 [guardian](guardian-design.md)）
related_specs: [aibutsu-templates, car-fuellog, insurance, guardian, transactions]
related_issues: ["#28", "#178", "#220", "#221", "#222", "#227"]
---

# 愛物概念

> 「愛物」= 兩人共同持續投入的對象。
> 涵蓋概念命名（vs Phase 2 早期「資產」命名）、IA 分組、Pet / Plant / Child 等 entity types 的共通決策。

---

## Context

Phase 2 早期用「資產」作為 entity 群統稱，但這個詞只適合有市值的財務性對象（車、房）。孩子本就不是資產，寵物和植物更不是。現代伴侶的照顧對象是一個光譜，這些都是「兩人共同持續投入的生命體 / 物 / 守護」，需要更誠實、更符合品牌陪伴哲學的概念框架。

---

## 概念命名：愛物

- Nav tab 標籤、頁面標題、empty state 文案全面用「愛物」
- 中日文同形同義（日文 愛物／あいぶつ = 珍愛之物），無需解釋，溫度到位
- 品牌連結：光 × 顏色，每個愛物是兩人生命光譜上的一個光源
- **Schema / query 命名**（`assets`、`assetId` 等）**不改**，只改 UI 顯示層

## 愛物的心智模型

| 群組 | Entity 類型 | 特性 |
|---|---|---|
| 財產 | car、house | 市值導向 |
| 生命體 | child、pet、plant | 照料導向，無市值欄位 |
| 保障 | insurance | 合約導向（v0.16.0 後升格為[守護](guardian-design.md)獨立模組） |
| 物品 | item | template-based 純文字紀錄（見 [aibutsu-templates](aibutsu-templates-design.md)） |

愛物清單以 inline 分組顯示（v0.8.1）：「財產 / 生命體 / 保障」三段；組內仍是平鋪 list，不做摺疊。

### v0.15.2（#178）：愛物 / 守護 tab 切分

愛物頁加 tab：

- 「愛物」tab 容納財產 + 生命體兩段
- 「守護」tab 單獨容納保障（保險）一段
- Tab 狀態透過 `?tab=guardian` URL query 同步以支援 deep link
- FAB 在守護 tab 預選 `insurance`，落地即可填保單

動機：保險獨立佔據 BottomNav 入口太重，且資訊架構上保險本是「守護愛物的延伸」，把兩者放同一頁、不同 tab，比並列三段更符合心智模型。

### v0.16.0（#220 #221）：守護升格獨立模組

守護從愛物頁的 tab 升級成獨立模組概念（[guardian](guardian-design.md)），加 per-group `guardian_beta_enabled` flag 作為付費層 wedge。OFF 時 TabBar / TypePicker / detail 頁 / FilterSheet sub-section 全部走 `canAccessGuardian()` 判斷。

### v0.16.0（#222）：item template type

`Assets.type` 新增第七個值 `'item'`（template-based 愛物），不再走「type → 子表」一條龍模型，改用 `template_key` enum + `template_fields` jsonb。詳見 [aibutsu-templates](aibutsu-templates-design.md)。**舊 6 種 type 完全不動**，保險繼續走 `'insurance'` + InsuranceDetails 子表。

---

## Data Model

詳細 schema 以 `lib/db/schema.ts` 為準。

**不新增 table**（除 v0.16.0 templates）。`Assets.type` enum 共 7 個值：

```
'car' | 'child' | 'pet' | 'plant' | 'house' | 'insurance' | 'item'
```

| Type | Detail 子表 | 行為 |
|---|---|---|
| `car` | CarDetails | 含 FuelLog 雙寫，見 [car-fuellog](car-fuellog-design.md) |
| `house` | HouseDetails | — |
| `child` | ChildDetails | base + 出生日期等 |
| `pet` / `plant` | （無 detail 子表） | 只用 base fields（name、type、icon）；植物粒度由使用者自行決定（「陽台上的植物們」和「我的咖啡苗」都是合法名稱） |
| `insurance` | InsuranceDetails | 含 PII 加密 + savings framing，見 [insurance](insurance-design.md) / [savings-view](savings-view-design.md) |
| `item` | （無）走 `template_key` + `template_fields` jsonb | template-based 純文字，見 [aibutsu-templates](aibutsu-templates-design.md) |

Asset 屬於 Group，**沒有** `owner_user_id`；個別 owner 語意各 type 自己定義（`CarDetails.primary_user_id` / `HouseDetails.owner` / `InsuranceDetails.policy_holder_user_id`）。

---

## 愛物使用 onboarding（AibutsuHintCard, v0.8.1）

實作落地點：`app/(dashboard)/assets/[id]/_components/AibutsuHintCard.tsx`

**為什麼放在 feed 空狀態**（不選 Hero 下方，不選 sticky 條）：

- Hero 下方曝光過強，每次進頁面都佔空間
- Sticky 條需要額外 dismiss 邏輯
- Feed 空狀態：有交易後自動消失，**零 dismiss 邏輯**，零 DB / localStorage

**互動設計**：

- 「0 筆交易顯示，有交易消失」——純條件觸發，無手動 ✕ 按鈕
- 上方靈感文字列（·分隔）+ 全寬 CTA「記第一筆 →」→ 開 AddSheet 帶入 `prefilledAssetId`
- 不做 category prefill（讓用戶自選，保持克制）

**範圍**：child / pet / plant / house 四種類型。車有獨立 FuelLog empty state；保險詳情頁結構特殊，暫不納入。

**視覺**：各類型有獨立的 accentColor + 35% alpha borderColor（dashed border），色票來自 AibutsuHeader。

**鎖定的原則**：別擴 detail table（是 onboarding 引導不足，不是 schema 不足）。

---

## Per-type tint（v0.11.4 / #28）

`app/globals.css` 的 `--asset-color-{car,house,child,pet,plant,insurance,item}` 為主色；`--asset-tint-*` 透過 `color-mix(in srgb, var(--asset-color-*) 35%, white)` 推導，list rail 與未來愛物 donut 共用同一 hue family。

對應的儲蓄 badge：愛物清單上 insurance 卡顯示「儲蓄」chip（如果是 savings type）。

---

## 跨產品連動（Nebula）

愛物 entity 與 **Nebula**（陪伴記錄主產品）潛在連動：

- Oikos = $ 視角（花了多少錢在這個愛物上）
- Nebula = 生命視角（照料記錄、成長、情感）
- 同一個 entity 定義層，兩個產品各自貢獻鏡頭
- 架構上預留：entity UUID 將來要能跨產品共用

---

## Acceptance criteria（新增 entity 類型時）

- BottomNav / 頁面標題顯示「愛物」（不顯示「資產」）
- AssetSheet TypePicker 選新類型 → 對應 icon 正確
- 詳情頁 hero 雙數字（本月 / 累計）顯示
- AssetPickerSheet 在 AddSheet 內可選到新類型
- 全站無舊命名（「資產」）殘留
- Dev + prod migration 都跑（Assets.type enum value 同步）
- Partner realtime 正常（list / detail 即時 sync）
