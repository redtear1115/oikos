# 記帳功能設計（Transactions + Onboarding + Solo Mode）

> Phase 1 + Phase 1.1 均已完成（2026-05-03）。

---

## Part 1 — 核心記帳（Phase 1）

### 交付範圍

| 功能 | 狀態 |
|---|---|
| Transaction CRUD（create / 編輯 = 軟刪+新增 / soft delete） | ✅ |
| 分攤計算（all_mine / all_theirs / half，含 ceil 規則） | ✅ |
| GroupBalance 全量重算（每次寫入 atomic） | ✅ |
| Settlement（部分結清、smart chip、edit/delete） | ✅ |
| 月份分組列表 + lazy 20 筆 cursor pagination | ✅ |
| 三維度篩選 bottom sheet（誰付 / 分攤 / 分類） | ✅ |
| Real-time 同步（partner 異裝置即時反應，淡黃 highlight） | ✅ |
| 設定頁（帳本名 / 成員 / 顯示名 / 登出） | ✅ |
| pg_cron weekly cleanup（soft-deleted >1yr 物理刪除） | ✅ |
| Server action unit + integration tests | ✅ |
| Bonus | Google avatar（環樣式 + 字母 fallback）；Dashboard filter parity |

### 命名與品牌

- **使用者看到**：Futari／「ふたり ・ 家計簿」
- **Codebase**：Oikos
- **Member 識別**：avatar 字母 = `display_name[0]`；底色 hardcode by 位置（member_a = `--ink` 深棕、member_b = `--accent` 橘）；UI 「我」/「對方」依 viewer 翻轉
- **Google avatar**：`profiles.avatar_url`，handle_new_user trigger 寫入；sign-in callback 每次刷新；UI 在 `<Avatar>` 顯示時 bg color 變成環

### Transaction CRUD

**關鍵 invariant**：「編輯」= 一個 DB transaction 內 soft delete 舊 row + insert 新 row + recalcGroupBalance。使用者不感知這是兩步。

| 元件 | 路徑 |
|---|---|
| Server actions | [actions/transaction.ts](../../../actions/transaction.ts)（`createTransaction`, `editTransaction`, `softDeleteTransaction`, `loadMoreTransactions`） |
| Validation | [lib/validators.ts](../../../lib/validators.ts)（`validateTransactionInput`） |
| 表單 UI | [app/(dashboard)/dashboard/_components/AddSheet.tsx](../../../app/%28dashboard%29/dashboard/_components/AddSheet.tsx) |
| 列表 row | [app/(dashboard)/dashboard/_components/CompactRow.tsx](../../../app/%28dashboard%29/dashboard/_components/CompactRow.tsx) |
| 列表容器 | [app/(dashboard)/_components/TransactionFeed.tsx](../../../app/%28dashboard%29/_components/TransactionFeed.tsx) |

### Settlement

**關鍵概念**：
- 「我還多少？」/「對方還了多少？」依 viewer 翻轉
- Smart chip：全額 / 一半 / 整數（整數 = 取整百到不超過欠款；< 100 或等於全額時隱藏）

| 元件 | 路徑 |
|---|---|
| Server actions | [actions/settlement.ts](../../../actions/settlement.ts) |
| Smart chip 計算 | [lib/settlement.ts](../../../lib/settlement.ts) |
| Inline 表單 | [app/(dashboard)/dashboard/_components/SettlementForm.tsx](../../../app/%28dashboard%29/dashboard/_components/SettlementForm.tsx) |
| Edit/delete sheet | [app/(dashboard)/dashboard/_components/SettlementSheet.tsx](../../../app/%28dashboard%29/dashboard/_components/SettlementSheet.tsx) |

### Balance + 列表

**關鍵 invariant**：列表用 UNION SQL，把 transactions 和 settlements 統一為 `kind: 'transaction' | 'settlement'`，cursor 用 `(transactedAt, createdAt)` 複合鍵。

| 元件 | 路徑 |
|---|---|
| 計算公式（pure） | [lib/balance.ts](../../../lib/balance.ts) |
| Recalc SQL | [lib/db/queries/balance.ts](../../../lib/db/queries/balance.ts) |
| Feed query（UNION） | [lib/db/queries/transactions.ts](../../../lib/db/queries/transactions.ts) |
| Balance card UI | [app/(dashboard)/dashboard/_components/BalanceHero.tsx](../../../app/%28dashboard%29/dashboard/_components/BalanceHero.tsx) |
| 月份分組 | [lib/groupByMonth.ts](../../../lib/groupByMonth.ts) |

### 篩選

**關鍵概念**：
- 誰付 dim 套用兩種 row（含 settlements）
- 分攤 / 分類 dim 觸發時 settlements 整批排除（`hidesSettlements`）
- Server-side 在 `loadMoreTransactions` resolve 為 `ResolvedTxnFilter`，SQL 用 `IN + sql.join`
- Filter state in-memory，不持久化；dashboard 跟 /records 各自獨立

| 元件 | 路徑 |
|---|---|
| Filter types + helpers（pure） | [lib/filter.ts](../../../lib/filter.ts) |
| Bottom sheet UI | [app/(dashboard)/records/_components/FilterSheet.tsx](../../../app/%28dashboard%29/records/_components/FilterSheet.tsx) |

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
| 多幣別、匯出、theme、頭像上傳 | 不做 |
| 自定 category | Phase 2+ |
| 法律聲明頁 | 之後（目前 href="#" 占位） |

### 待後續處理

- **Realtime 跨月份移動視覺破碎**：把 5/1 編輯成 4/15 會觸發 remove-from-五月 + insert-to-四月 兩個 event，視覺上有半秒空檔。選了「兩個 event 各自觸發」這條路，如果體感不好再優化。
- **Realtime 連線中斷 backoff**：依賴 `@supabase/supabase-js` v2 預設行為；地下停車場 / 切 WiFi 場景未實際測過。

### 設計師待補

| # | 項目 | 狀態 |
|---|---|---|
| 1 | 雙色 heart icon SVG（空狀態） | ✅ FutariMark 已 ship |
| 2 | Futari logo SVG | ✅ 已 ship |
| 3 | 醫療 / 家居 / 禮物 / 其他 4 個 category 色票 | ✅ 已收進 [lib/categories.ts](../../../lib/categories.ts) |
| 4 | 完整 design tokens（hover、disabled、shadow、radius、spacing） | 🔄 部分定 token，部分 raw value 散落（見 CLAUDE.md → Design Debt P3-1 / P4-3）|
| 5 | PWA icon set（512×512、192×192、maskable） | ✅ 已交付 + 上架（`public/icons/`、`public/og-image.png`、`app/favicon.ico`）|

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
