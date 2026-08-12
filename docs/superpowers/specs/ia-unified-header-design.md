---
last_updated: 2026-08-12
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

永遠出現，固定樣式，右側可放 quick-action 圖示。Dashboard 例外：用 BrandHeader（group name + 雙頭像）取代純文字標題。

### L2 — Primary Switch

**左對齊**的 pill segmented，不全寬——這是刻意的：L2 只承載**一個**互斥軸（例如支出/收入、愛物/守護），全寬會暗示它跟頁面等寬重要，但它只是一個篩選維度，不該搶走視覺重量。Settings 沒有 L2（合理例外，不需要硬湊一個）。

### L3 — Filter Strip

一條可橫向捲動的 chip 列。排序固定：month chip（若有）最前、filter chip 次之、drill chip 最後——這個順序對應「時間範圍 → 條件篩選 → 目前 drill 結果」的心智模型，使用者掃視順序跟資料收斂順序一致。任一 chip active 時在 filter chip 上用 accent dot 標示，讓使用者不用展開就知道「現在有篩選在生效」。

---

## 各頁變更

### Dashboard

原本 ModeToggle 埋在 BalanceHero 卡片內部，L3 完全沒有——移出獨立成 L2 行，新增 L3（本月 chip + 篩選 chip）補齊三層。

**精簡 FilterPanel（Dashboard 專用）**：只開放付款人篩選（我 / 夥伴 / 全部），不含分類、金額範圍等 Records 專屬篩選——Dashboard 是總覽頁不是查帳頁，篩選維度刻意收斂，因此獨立實作、不復用 Records 的 `FilterSheet`。

### Records

原本 MonthSwitcher 是獨立全寬卡、篩選是文字按鈕，兩者不在同一條視覺列——統一收進 L3 同一條 chip strip（月份 chip 帶 ‹ › 直接切月，取代原本的全寬卡）。

### Assets

原本 L2 的 PillSegment（愛物/守護）是全寬，L3 完全沒有——L2 改左對齊，新增 L3 種類 chips。種類 chip 是 **client-side filter**（資料已在頁面上，chip 只控制顯示哪些 section/row），不做 URL sync——因為這是頁內瀏覽輔助，不是需要分享/加書籤的查詢狀態。

### Settings

沒有 L2 / L3（合理例外）。L1 加 subtitle 標示頁面涵蓋範圍。

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

四種：`offline`（全寬橫幅，隨連線恢復自動消失，無互動）、`past-epoch`（全寬橫幅，右側文字 link 可回到現在章節）、`partner-left`（卡片，可手動關閉並用 localStorage 記憶）、`active-trip`（展開/收合兩態，收合為單行 pill-like card，展開帶漸層背景，狀態同樣 localStorage 記憶）。`active-trip` 是唯一有展開/收合互動的 variant，因為旅行資訊比其他三種狀態承載更多內容（trip name / 開始日期 / 幣別），需要一個「先摘要、要看細節再展開」的層次。

### 觸發條件與判斷簡化

`partner-left` 沒有既有的判斷欄位可用——「夥伴離開」跟「一開始就是單人模式」在資料上都是 `member_b IS NULL`，需要額外分辨「曾經有 partner」。初期簡化為「`isSolo` 且曾有 `member_b`」，不做複雜的歷史查詢，避免為一個邊界狀態引入額外的資料模型複雜度。

---

## i18n

新增 `dashboard.contextStrip.*`（四種 variant 各自的文案 + 展開/收合按鈕）與 `settings.subtitle`，4 語同步（zh-TW 主稿），實作見 `lib/i18n/locales/`。

---

## 實作邊界

- **不動** BalanceHero 的 settle / balance display 邏輯，只移除 ModeToggle 的嵌入
- **不動** Records 的 FilterSheet 功能，只改 chip 的觸發方式
- **不動** Assets 的 AssetSheet / 詳細頁邏輯
- **不動** OfflineLifecycle / RealtimeProvider 底層邏輯
- `PastEpochBanner` 和 `OfflineBanner` 從 layout 移除後，如有其他頁依賴需確認（目前只在 layout render）
