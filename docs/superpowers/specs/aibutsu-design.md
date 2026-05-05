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
Car ✅  →  FuelLog + 車輛 polish ✅(Slice 2)  →  Child + Pet + Plant 🔄(Slice 3)  →  House  →  Insurance
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

自訂 entity 類型需與 **Nebula** 連動：
- Oikos = $ 視角（花了多少錢在這個愛物上）
- Nebula = 生命視角（照料記錄、成長、情感）
- 同一個 entity 定義層，兩個產品各自貢獻鏡頭
- 架構上預留：entity UUID 將來要能跨產品共用

---

## Verification

- [x] BottomNav tab 顯示「愛物」
- [ ] `/assets` 頁面標題為「愛物」，empty state 文案正確
- [x] AssetSheet 可選 pet / plant，icon 正確顯示
- [x] 建立一筆 pet entity → 詳情頁正常，hero 雙數字顯示
- [ ] 建立一筆 plant entity → 同上
- [ ] AddSheet 內 AssetPickerSheet 可選到 pet / plant entity
- [x] 全站無「資產」字串殘留（UI 顯示層）
- [ ] Dev + prod migration 都已套用
- [ ] Partner realtime 同步正常（新增 pet 對方即時看到）
