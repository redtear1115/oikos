# 愛物 Onboarding Hint（Phase 2.5）

## Context

用戶在第一次進入新建的愛物詳情頁時，不知道「該往這個容器裡記什麼」。問題不在 schema 不足，而是使用情境引導缺失。本 spec 設計一個最低摩擦的 hint card，在 feed 空狀態出現，給用戶第一筆記帳的靈感。

---

## 設計決策

### 位置：Feed 空狀態

Hint card 取代原本的空狀態文字，出現在 `TransactionFeed` 的 `emptyState` prop 位置。

**不選 Hero 下方**（曝光過強，每次進頁面都佔空間）  
**不選 sticky 小條**（需要額外 dismiss 邏輯）

選 feed 空狀態的理由：
- 有交易後自動消失，**零 dismiss 邏輯**，不需要 DB 或 localStorage
- `TransactionFeed` 已有 `emptyState: React.ReactNode` prop，零侵入
- 出現時機自然（用戶滾到 feed 區才看到）

### 互動：文字靈感列表 + 單一 CTA

- 上方一行文字列出常見開銷情境（用「·」分隔）
- 下方一個「記第一筆 →」按鈕，點擊開 AddSheet 並帶入 `prefilledAssetId`
- **不做** category chips prefill（保持克制，讓用戶自選 category）

### Dismiss：純條件觸發，無手動關閉

「0 筆交易 → 顯示，有交易 → 消失」。不加 ✕ 按鈕。

### 範圍：四種類型

`child`、`pet`、`plant`、`house`。車（有獨立 FuelLog empty state）和保險（詳情頁結構特殊）暫不納入。

---

## 元件設計

### `AibutsuHintCard`

**路徑**：`app/(dashboard)/assets/[id]/_components/AibutsuHintCard.tsx`

```ts
type AibutsuHintCardProps = {
  type: 'child' | 'pet' | 'plant' | 'house'
  onCtaPress: () => void
}
```

**視覺**：
- 容器：`mx-4`，白底，`border: 1.5px dashed`（type accent 色 35% 透明），`rounded-[14px]`，`padding: 14px`
- 標題：`✦ 可以記什麼？`，`text-[11px] font-semibold`，color = type accent
- 靈感文字：`text-[11px]`，color `var(--ink-2)`，`line-height: 1.9`
- CTA 按鈕：全寬，`background: var(--accent)`（#E08856），白字，`rounded-[10px]`，`h-9`，shadow `0 2px 6px rgba(224,136,86,0.3)`

**Config map**（type accent 來自現有 AibutsuHeader 定義）：

| type | accentColor | borderColor（35% alpha） | items |
|---|---|---|---|
| pet | `#9A6B3F` | `rgba(154,107,63,0.35)` | 飼料 · 看診 · 洗澡美容 · 玩具 · 年度疫苗 |
| child | `#A85B6A` | `rgba(168,91,106,0.35)` | 尿布奶粉 · 看診 · 課後安親 · 玩具 · 學費 |
| plant | `#5A7A4A` | `rgba(90,122,74,0.35)` | 介質 · 盆器 · 肥料 · 買新苗 · 防蟲 |
| house | `#7A5A38` | `rgba(122,90,56,0.35)` | 房貸 · 水電 · 管理費 · 維修 · 裝潢 · 清潔 |

---

## 整合方式

四個 DetailClient 各自做相同的事：

**`ChildDetailClient`、`PetDetailClient`、`PlantDetailClient`、`HouseDetailClient`**

1. 確認元件是否已有 `addSheetOpen` state（部分 DetailClient 可能已有）；若已有直接複用，若無則新增
2. 將以下傳給 `TransactionFeed` 的 `emptyState` prop：
   ```tsx
   <AibutsuHintCard
     type={asset.type as 'child' | 'pet' | 'plant' | 'house'}
     onCtaPress={() => setAddSheetOpen(true)}
   />
   ```
3. AddSheet 開啟時帶 `prefilledAssetId={asset.id}`

`TransactionFeed` 本身已有「list 為空才渲染 emptyState」邏輯，不需要額外條件判斷。

---

## 關鍵檔案

| 檔案 | 變更內容 |
|---|---|
| `app/(dashboard)/assets/[id]/_components/AibutsuHintCard.tsx` | 新增元件 |
| `app/(dashboard)/assets/[id]/_components/ChildDetailClient.tsx` | 傳入 emptyState + addSheetOpen |
| `app/(dashboard)/assets/[id]/_components/PetDetailClient.tsx` | 同上 |
| `app/(dashboard)/assets/[id]/_components/PlantDetailClient.tsx` | 同上 |
| `app/(dashboard)/assets/[id]/_components/HouseDetailClient.tsx` | 同上 |

**不需要**：DB migration、新 table、localStorage、server action 變更。

---

## Verification Checklist

- [ ] 新建一個寵物愛物 → 進詳情頁 → hint card 出現在 feed 空狀態
- [ ] Hint card 標題色、border 色符合該 type 的 accent
- [ ] 點「記第一筆 →」→ AddSheet 開啟，assetId 已預填
- [ ] 在 AddSheet 記一筆交易後關閉 → hint card 消失，feed 顯示該交易
- [ ] 重新進入詳情頁（已有交易）→ hint card 不顯示
- [ ] 四種類型（child / pet / plant / house）各自文字正確
- [ ] 車和保險詳情頁不受影響

---

## 不在本 spec 範圍

- 車和保險的 hint（另評估）
- Category prefill（保持 AddSheet 讓用戶自選）
- 手動 dismiss 按鈕
- 任何 schema / DB 變更
