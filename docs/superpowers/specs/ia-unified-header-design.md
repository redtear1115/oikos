---
last_updated: 2026-05-20
status: shipped
first_shipped_in: v1.0.5
related_specs: [structured-filter, trip-multi-currency, offline-browsing]
related_issues: []
---

# IA · 四大入口層級統一

## What

四個主頁（Dashboard / Records / Assets / Settings）實施統一的三層標頭系統（L1 / L2 / L3），並以 ContextStrip 取代現有分散在各處的狀態 banner。

## Why

目前四頁的 Title / Switch / Filter 位置和形狀各自為政：Dashboard 的 ModeToggle 在 BalanceHero 卡片內部；Records 的月份是獨立全寬卡；Assets 的 pill 是全寬；Settings 沒有標示為例外。使用者每切頁都要重新搜尋這三件事在哪，增加認知負荷。

## Who

所有 Futari 使用者（無版本差異）。

---

## 三層標頭規格

### L1 — Page Title

- 永遠出現。固定樣式：`var(--font-serif)` 24px / weight 500。
- 右側可放 quick-action 圖示（`…` / `+` / custom icon）。
- Dashboard 例外：使用 BrandHeader（group name + 雙頭像）。

### L2 — Primary Switch

- Pill segmented，height 32px，padding 4px inner，**左對齊**（`display: inline-flex`，不全寬）。
- 只承載**一個**互斥軸（支出/收入、愛物/守護、全部/支出/收入）。
- Settings 無 L2（合理例外，不需補）。

### L3 — Filter Strip

- 一條 `overflow-x: auto` chip 列，gap 8px，padding `12px 20px 0`。
- Month chip 永遠最前（若有）；Filter chip 次之；drill chip 最後。
- Chip height 28–32px，border-radius 999px。
- 任一 chip active 時在 filter chip 上顯示 accent dot。

---

## 各頁變更

### Dashboard

| 層 | 現況 | 目標 |
|---|---|---|
| L1 | BrandHeader（group name + 頭像） | 同左，右側加飛機 icon button（無 active trip 時顯示） |
| Context Strip | 永遠顯示 trip empty-state CTA | 見 ContextStrip 規格，無事不渲染 |
| L2 | ModeToggle **在 BalanceHero 內部** | 移出 BalanceHero → 獨立 L2 行，左對齊 |
| L3 | 完全沒有 | 新增：本月 chip（唯讀，點開精簡 date picker）+ 篩選 chip（開精簡 FilterPanel） |
| BalanceHero | 含 toggle | 移除 toggle，保留 balance + 結算 row |

**精簡 FilterPanel（Dashboard 專用）**  
只開放：付款人（我 / 夥伴 / 全部）。不含分類、金額範圍等 Records 專屬篩選。實作為輕量 bottom sheet 或 popover，不復用 Records 的 `FilterSheet`。

### Records

| 層 | 現況 | 目標 |
|---|---|---|
| L1 | PageTitle「紀錄」 | 同左，右側保留（可放 ⋯ menu） |
| L2 | Tab pill（全部/支出/收入），左對齊但樣式略不同 | 統一為標準 L2 pill style（與 Dashboard 同形） |
| L3 | MonthSwitcher 獨立全寬卡 + 「篩選 ›」文字按鈕 + drill chips | **月份 chip**（chip 本身有 ‹ ›，取代 MonthSwitcher 卡）+ FilterChip + drill chips，同一條 strip |

MonthChip 行為：chip 內建左右 chevron 直接切月；tap chip 主體開 date picker（可選「全部」範圍）。`MonthSwitcher.tsx` 可保留邏輯、移除獨立的全寬容器。

### Assets

| 層 | 現況 | 目標 |
|---|---|---|
| L1 | PageTitle「愛物」 | 同左 |
| L2 | **全寬** PillSegment（愛物/守護） | 左對齊 inline pill（同 L2 標準） |
| L3 | 完全沒有 | 新增：種類 chips（全部 / 房 / 車 / 孩 / 寵 / 植 / 物） |

L3 種類 chip 為 **client-side filter**：資料全在頁面，chip 控制顯示哪些 section/row。不做 URL sync。chip 顏色使用對應的 `--asset-color-{type}`。

### Settings

| 層 | 現況 | 目標 |
|---|---|---|
| L1 | PageTitle「設定」 | 同左，加 subtitle `帳號 · 應用 · 資料` |
| L2 | — | — |
| L3 | — | — |

---

## ContextStrip 規格

### 用途

取代目前佔住 Dashboard 第二排的永遠存在 trip CTA。所有「app 等級狀態」共用一個 slot：無事不渲染。

### 優先序（由高到低）

1. `offline` — 離線橫幅（目前由 `OfflineBanner` 在 layout 層顯示）
2. `past-epoch` — 正在查看過去章節（目前由 `PastEpochBanner` 在 layout 層顯示）
3. `partner-left` — 夥伴已離開帳本
4. `active-trip` — 有進行中旅行

同時最多顯示一條。

### 位置

L1 下方、L2 上方。視覺上是 page-scoped（隨頁面主題色），不是固定在畫面頂端的全域 bar。

**整合現有 banner**：`PastEpochBanner` 和 `OfflineBanner` 目前掛在 `app/(dashboard)/layout.tsx`，移至各頁的 ContextStrip slot 後從 layout 移除。`partner-left` 目前沒有獨立 banner，在此一起加入。

### Variants

**offline**
```
[ 灰底橫幅 ] 離線中 · 顯示快取內容
```
全寬，無互動，隨連線恢復消失。

**past-epoch**
```
[ ink 底橫幅 ] 正在查看 YYYY/MM–YYYY/MM 的章節   [回到現在]
```
全寬，右側文字 link 回現在章節。

**partner-left**
```
[ surface 卡，ink border ] 夥伴已離開帳本。之前的紀錄都還在。
```
可手動關閉（localStorage 記憶）。

**active-trip — 展開**
```
┌─────────────────────────────────┐
│ ● 進行中 · 旅行          [飛機] [−] │
│ {trip name}                         │
│ {startDate} 開始 · {currency}       │
└─────────────────────────────────┘
```
漸層背景（accent mix），右上角 collapse button（−）和新增旅行 button（飛機圖示）。

**active-trip — 收合**
```
[ ● 進行中 · {trip name} · currency  ›  ] [飛機]
```
單行 pill-like card。右側 + expand button。`localStorage` 記憶展開/收合狀態。

### 觸發條件（Dashboard 頁）

- `offline`：`OfflineLifecycle` 事件（現有 context）
- `past-epoch`：`useMember().isPast === true`
- `partner-left`：`useMember().isSolo && !useMember().partner`（初始有 partner 之後才 solo）→ 需要 `MemberContext` 加 `hadPartner` flag 或從 group 歷史判斷
- `active-trip`：`activeTrips.length > 0`（現有 Dashboard prop）

**partner-left 判斷簡化**：初期以「`isSolo` 且曾有 `member_b`（group.memberB 歷史上有值）」為條件，不另加複雜歷史查詢。

---

## i18n

新增/修改的 key：

```
dashboard.contextStrip.offlineLine
dashboard.contextStrip.pastEpochLine      // "正在查看 {start}–{end} 的章節"
dashboard.contextStrip.backToNow          // "回到現在"
dashboard.contextStrip.partnerLeftLine    // "夥伴已離開帳本。..."
dashboard.contextStrip.tripKicker        // "進行中 · 旅行"
dashboard.contextStrip.tripCollapse      // "−"
dashboard.contextStrip.tripExpand        // "+"
settings.subtitle                         // "帳號 · 應用 · 資料"
```

4 語同步（zh-TW 主稿）。

---

## 實作邊界

- **不動** BalanceHero 的 settle / balance display 邏輯，只移除 ModeToggle 的嵌入
- **不動** Records 的 FilterSheet 功能，只改 chip 的觸發方式
- **不動** Assets 的 AssetSheet / 詳細頁邏輯
- **不動** OfflineLifecycle / RealtimeProvider 底層邏輯
- `PastEpochBanner` 和 `OfflineBanner` 從 layout 移除後，如有其他頁依賴需確認（目前只在 layout render）
