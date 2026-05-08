# 愛物概念擴展設計（Phase 2 Slice 3 — Child + Pet + Plant）

## Context

Phase 2 用「資產」作為 entity 群統稱，但這個詞只適合有市值的財務性對象（車、房）。孩子本就不是資產，寵物和植物更不是。現代伴侶的照顧對象是一個光譜，這三者都是「兩人共同持續投入的生命體」，需要更誠實、更符合品牌陪伴哲學的概念框架。

本 spec 做兩件事：
1. **概念層**：把「資產」改名為「愛物」
2. **功能層**：在原本的 Child slice 裡加入 Pet 和 Plant entity 類型

---

## 設計決策

### 概念命名：愛物

- Nav tab 標籤、頁面標題、empty state 文案全面替換「資產」→「愛物」
- 中日文同形同義（日文 愛物／あいぶつ = 珍愛之物），無需解釋，溫度到位
- 品牌連結：光 × 顏色，每個愛物是兩人生命光譜上的一個光源
- Schema / query 命名（`assets`、`assetId` 等）**不改**，只改 UI 顯示層

### 愛物的心智模型

| 群組 | Entity 類型 | 特性 |
|---|---|---|
| 生命體 | 孩子、寵物、植物 | 照料導向，無市值欄位 |
| 財產 | 車、房 | 市值導向 |
| 保障 | 保險 | 合約導向 |

愛物清單以 inline 分組顯示（v0.8.1 ship）：「財產 / 生命體 / 保障」三段；組內仍是平鋪 list，不做摺疊。

### Data Model

**不新增 table**。`Assets.type` enum 擴充：

```
'car' | 'child' | 'pet' | 'plant' | 'house' | 'insurance'
```

Pet / Plant 本 slice 只用 base fields（`name`、`type`、icon），不做 detail table。植物的粒度由使用者自行決定（「陽台上的植物們」和「我的咖啡苗」都是合法名稱）。

### Roadmap

```
Car ✅(v0.3.0)  →  FuelLog ✅(v0.4.0)  →  Child + Pet + Plant ✅(v0.5.0)
               →  House + Insurance ✅(v0.6.0)
```

Pet + Plant 與 Child 共用同一 slice：三者 data model 最接近，CRUD 邏輯幾乎一樣。

---

## 未來備忘（不在本 spec 範圍）

### 愛物使用 onboarding（已 ship, Phase 2.5）

元件：`app/(dashboard)/assets/[id]/_components/AibutsuHintCard.tsx`

**為什麼放在 feed 空狀態**（不選 Hero 下方，不選 sticky 條）：
- Hero 下方曝光過強，每次進頁面都佔空間
- Sticky 條需要額外 dismiss 邏輯
- Feed 空狀態：有交易後自動消失，**零 dismiss 邏輯**，零 DB / localStorage，`TransactionFeed` 的 `emptyState` prop 本來就支援，完全零侵入

**互動設計**：
- 「0 筆交易顯示，有交易消失」——純條件觸發，無手動 ✕ 按鈕
- 上方靈感文字列（·分隔）+ 全寬 CTA「記第一筆 →」→ 開 AddSheet 帶入 `prefilledAssetId`
- 不做 category prefill（讓用戶自選，保持克制）

**範圍**：child / pet / plant / house 四種類型。車有獨立 FuelLog empty state；保險詳情頁結構特殊，暫不納入。

**視覺**：各類型有獨立的 accentColor + 35% alpha borderColor（`rgba(..., 0.35)` dashed border），色票來自 AibutsuHeader 定義。

**鎖定的原則**：別擴 detail table（是 onboarding 引導不足，不是 schema 不足）。

### Nebula 跨產品連動

自訂 entity 類型需與 **Nebula** 連動：
- Oikos = $ 視角（花了多少錢在這個愛物上）
- Nebula = 生命視角（照料記錄、成長、情感）
- 同一個 entity 定義層，兩個產品各自貢獻鏡頭
- 架構上預留：entity UUID 將來要能跨產品共用

---

## Acceptance pattern（新增 entity 類型時參考）

新 entity type 上線前需驗：BottomNav / 頁面標題顯示正確、AssetSheet 選新類型 icon 正確、詳情頁 hero 雙數字顯示、AddSheet AssetPickerSheet 可選到、全站無舊命名殘留、dev + prod migration 都跑、partner realtime 正常。
