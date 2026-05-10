---
status: shipped
shipped_in: v0.1.0（核心 CRUD / settlement / balance / 篩選 / realtime）· v0.2.0（onboarding + Solo Mode）· v0.12.0（共同備註 #34 PR #66、CSV 匯出 #37 PR #70、信任宣示頁 #48 PR #62）
---

# 記帳功能設計（Transactions + Onboarding + Solo Mode）

> 全部已完成（v0.1.0 / v0.2.0）。

---

## Part 1 — 核心記帳（Phase 1）

### 命名與品牌

- **使用者看到**：Futari／「ふたり ・ 家計簿」
- **Codebase**：Oikos
- **Member 識別**：avatar 字母 = `display_name[0]`；底色 hardcode by 位置（member_a = `--ink` 深棕、member_b = `--accent` 橘）；UI 「我」/「對方」依 viewer 翻轉
- **Google avatar**：`profiles.avatar_url`，handle_new_user trigger 寫入；sign-in callback 每次刷新；UI 在 `<Avatar>` 顯示時 bg color 變成環

### Transaction CRUD

**關鍵 invariant**：「編輯」= 一個 DB transaction 內 soft delete 舊 row + insert 新 row + recalcGroupBalance。使用者不感知這是兩步。

### Settlement

**關鍵概念**：
- 「我還多少？」/「對方還了多少？」依 viewer 翻轉
- Smart chip：全額 / 一半 / 整數（整數 = 取整百到不超過欠款；< 100 或等於全額時隱藏）

### Balance + 列表

**關鍵 invariant**：列表用 UNION SQL，把 transactions 和 settlements 統一為 `kind: 'transaction' | 'settlement'`，cursor 用 `(transactedAt, createdAt)` 複合鍵。

### 篩選

**關鍵概念**：
- 誰付 dim 套用兩種 row（含 settlements）
- 分攤 / 分類 dim 觸發時 settlements 整批排除（`hidesSettlements`）
- Server-side 在 `loadMoreTransactions` resolve 為 `ResolvedTxnFilter`，SQL 用 `IN + sql.join`
- Filter state in-memory，不持久化；dashboard 跟 /records 各自獨立

### Real-time UX 規則

- INSERT → prepend + 1s `--realtime-flash` 淡黃 highlight
- UPDATE 帶 `deletedAt` → 0.5s fade-out 後移除
- balance UPDATE → 數字 cross-fade 300ms
- Reconnect → 自動 refetch page 1（不顯示「斷線中」狀態）
- Filter 啟用時 → 不符合的 incoming events 靜默跳過

訂閱 channel：`group:${groupId}` × 三張 table（CashTransactions / Settlements / GroupBalance）。

### Out of scope（不做）

| 項目 | 去向 |
|---|---|
| 推播通知 | 不做（無 PWA push） |
| 多幣別、theme、頭像上傳 | 不做 |
| 自定 category | Phase 2+ |
| CSV 匯出 | v0.12.0 已實作（`/api/export/transactions`，僅活躍 CashTransactions）|
| 法律聲明頁 | v0.11.x 已上線 `/terms` `/privacy`；v0.12.0 加 `/settings/trust` 信任宣示頁 |

### v0.14.1 增量

- **Weighted split**（plan：[`docs/superpowers/plans/2026-05-10-weighted-split.md`](../plans/2026-05-10-weighted-split.md)）：`split_type` 加 `weighted`、新增 `split_ratio_a`（CashTransactions / RecurringExpenseRules / PendingExpenseOccurrences），group 多 `default_split_ratio_a`；UI 把 `half` 換成 weighted slider。Balance recalc 同時支援 legacy `half` 和 `weighted`。
- **Dashboard hero collapse**（PR #111, closes #109）：避免 hero 卡 + balance row 在小螢幕擠成兩行；collapsed 狀態 toggle、settle pill、ToggleButton 在 collapsed / expanded 兩態的位置都鎖定。

### 待 v0.14.2 部署
- **Description autocomplete**（PR #114, closes #113）：AddSheet 描述欄位輸入時，從 household 歷史紀錄做前綴搜尋的 inline suggestion。`DescriptionAutocomplete` 元件 + 對應 query。v0.14.1 release 時暫時 revert，明天 v0.14.2 deploy 一起上 prod。
- **Drill-down filter**（PR #116, closes #102）：在 `/records` 月度統計卡點 detail bar 直接套用 category / asset filter 到 transaction feed；hook 由 v0.14.0 預留的 data attributes 接上。`DrillFilterChip` + `lib/drill.ts`。同樣暫時 revert，等 v0.14.2 一起上。

### 待後續處理

- **Realtime 跨月份移動視覺破碎**：把 5/1 編輯成 4/15 會觸發 remove-from-五月 + insert-to-四月 兩個 event，視覺上有半秒空檔。選了「兩個 event 各自觸發」這條路，如果體感不好再優化。
- **Realtime 連線中斷 backoff**：依賴 `@supabase/supabase-js` v2 預設行為；地下停車場 / 切 WiFi 場景未實際測過。

---

## Part 2 — Onboarding & Solo Mode（Phase 1.1）

> 已實作（2026-05-03）。見 `app/sign-in/`, `app/setup/`, `app/(dashboard)/dashboard/_components/SoloBanner.tsx`, `app/(dashboard)/_components/MemberContext.tsx`。

### 背景與動機

Phase 1 假設使用者一定是雙人組合。但在友人測試階段，部分使用者可能還沒有伴侶、或伴侶不願馬上加入、或想先自己熟悉介面。設計稿在邀請步驟已規劃「稍後再邀請 →」CTA，代表 Solo Mode 是設計師原本就預期的情境。

### Onboarding Flow

三步驟（對齊設計稿 02 · Onboarding）：

**Step 1 — 歡迎畫面（`/sign-in`）**：Futari logo + ふたり 標語 + 副標 + Google 登入按鈕 + 服務條款小字；品牌色全螢幕背景。

**Step 2 — 建立群組（`/setup` Step 1）**：帳本名稱 input（maxLength=20，字數計數），建議 chips（我們倆 / ○○家 / 日日 / Home / 一起），「下一步」disabled 當 name 為空。

**Step 3 — 邀請對方（`/setup` Step 2）**：邀請連結 + 複製按鈕 + Web Share API（LINE / 訊息 / 更多），底部「稍後再邀請 →」進入 Solo Mode。

### Solo Mode

**定義**：`group.member_b` 為 `null` 的狀態。

| 功能 | Solo 狀態行為 |
|---|---|
| 新增交易 | 分攤選項全部隱藏，固定為「全部我的」|
| Dashboard balance | 不顯示 BalanceHero，改顯示邀請 banner |
| 結算 | 入口隱藏 |
| 其餘（列表、設定、愛物）| 正常運作 |

**升級為雙人模式**：對方接受邀請後，Realtime `OikosGroups` 更新 → event bus 廣播 → Banner 消失、BalanceHero 出現、AddSheet 解鎖分攤。

**Solo 時期的紀錄**：一律 `split_type = 'all_mine'`，語意為「自己的費用」，對方加入後**不需要 retroactive 處理**。

### 不在此 Phase 範圍

- 月份分析（圓餅圖 + YoY）→ 待排
- 邀請到期重新產生連結的 UI → `GroupInvites.expiresAt` 邏輯已存在，UI 暫不處理
