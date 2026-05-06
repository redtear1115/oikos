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

Phase 1（現階段）統一列在愛物清單，不做視覺分群。分群留後評估。

### Data Model

**不新增 table**。`Assets.type` enum 擴充：

```
'car' | 'child' | 'pet' | 'plant' | 'house' | 'insurance'
```

Pet / Plant 本 slice 只用 base fields（`name`、`type`、icon），不做 detail table。植物的粒度由使用者自行決定（「陽台上的植物們」和「我的咖啡苗」都是合法名稱）。

### Roadmap

```
Car ✅  →  FuelLog + 車輛 polish ✅(Slice 2)  →  Child + Pet + Plant ✅(Slice 3)
       →  House ✅(Slice 4)  →  Insurance ✅(Slice 5: 全 ship 2026-05-06, v0.3.0)
```

Pet + Plant 與 Child 共用同一 slice：三者 data model 最接近，CRUD 邏輯幾乎一樣。

---

## 關鍵檔案

| 檔案 | 變更內容 |
|---|---|
| `lib/db/schema.ts` | `Assets.type` enum 加 `'pet' \| 'plant'` |
| `drizzle/` | migration（enum 擴充） |
| `app/(dashboard)/assets/_components/AssetSheet.tsx` | pet / plant / child / insurance type-specific forms |
| `app/(dashboard)/_components/AssetIcon.tsx` | pet / plant icon mapping |
| `app/(dashboard)/assets/[id]/_components/AibutsuHeader.tsx` | tinted detail page header for aibutsu types |
| `app/(dashboard)/assets/[id]/` | ChildDetailClient / PetDetailClient / InsuranceDetailClient |
| `actions/asset.ts` | createChild/editChild, createPet/editPet, createInsurance/editInsurance |
| `app/(dashboard)/_components/BottomNav.tsx` | tab 標籤「資產」→「愛物」 |

---

## 未來備忘（不在本 spec 範圍）

### 愛物使用 onboarding（待設計）

**觸發點**：2026-05-06 ship Slice 4 房子後，user 反應「房子有點空泛，我一時之間也沒有想到房子有什麼需要紀錄/照護的東西」。同樣症狀預期會發生在植物、孩子等 detail fields 較少的 entity 類型。

**問題本質**：base CRUD 完成後，使用者不知道**該往這個愛物身上記什麼**。不是 schema 不夠，是**使用情境的引導不夠**。

**設計題目**：怎麼用最低摩擦的方式，在使用者**第一次進入某個愛物詳情頁時**，告訴他「這個容器可以裝什麼」？讓他立刻有第一筆 transaction 可以記。

**範例 hint 內容**（思考素材，非定稿）：

| 愛物 | 開銷情境 |
|---|---|
| 房子 | 房貸、水電、管理費、房屋稅、第四台 / 網路、維修、裝潢、清潔費 |
| 車 | 油錢（已有 FuelLog）、保養、停車費、罰單、保險 |
| 寵物 | 飼料、看診、洗澡美容、玩具、年度疫苗 |
| 植物 | 介質 / 盆器、肥料、買新苗、防蟲 |
| 孩子 | 尿布奶粉、看診、課後安親、玩具、學費 |
| 保險 | 繳費（已可關聯保單）、滿期 / 理賠（IncomeSheet）|

**設計約束**：
- 符合 Futari brand「克制、不評判、陪伴」氣質——不能變成像 Notion 引導那種大塊 tutorial
- 一次只 hint 一件事，user 完成後自然消失
- 不是「教你怎麼用 app」（已經會了），是「給你靈感」
- 可能形態：詳情頁 hero 下方一張柔軟的小卡 + 「記第一筆」CTA prefilled category；user 記了第一筆 / 點 dismiss 後消失，永久 cookied / 寫進使用者偏好
- 跨愛物類型共用 pattern，文案 / category prefill 各自客製

**何時做**：等 Slice 5 保險 + IncomeSheet 完成後再回頭做愛物 onboarding。Phase 2.5 候選。

**先不做的事**：別擴 detail table。base fields 4 個就夠了（已驗證 — 房子用 transaction tag 已能呈現累積開銷）。是 onboarding 引導不足，不是 schema 不足。

### Nebula 跨產品連動

自訂 entity 類型需與 **Nebula** 連動：
- Oikos = $ 視角（花了多少錢在這個愛物上）
- Nebula = 生命視角（照料記錄、成長、情感）
- 同一個 entity 定義層，兩個產品各自貢獻鏡頭
- 架構上預留：entity UUID 將來要能跨產品共用

---

## Verification

Slice 3 已 ship 到 prod；以下 checklist 留作未來新增 entity 類型的 acceptance 範本：

- BottomNav tab 顯示「愛物」
- `/assets` 頁面標題為「愛物」，empty state 文案正確
- AssetSheet 可選新類型（icon 正確顯示）
- 建立一筆 entity → 詳情頁正常 hero 雙數字顯示
- AddSheet 內 AssetPickerSheet 可選到新類型 entity
- 全站無「資產」字串殘留（UI 顯示層）
- Dev + prod migration 都已套用
- Partner realtime 同步正常（新增對方即時看到）
