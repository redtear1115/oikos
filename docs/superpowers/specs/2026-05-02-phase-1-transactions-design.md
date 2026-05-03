# Phase 1 — 核心記帳功能對照表

> Status: ✅ 完成（2026-05-03）
> 本文以「功能 → 實作位置」為主軸，作為導讀。具體 UI 流程、SQL、JSX 結構以程式碼為準。

---

## Phase 1 交付範圍

| 功能 | 狀態 |
|---|---|
| 1. Transaction CRUD（create / 編輯 = 軟刪+新增 / soft delete） | ✅ |
| 2. 分攤計算（all_mine / all_theirs / half，含 ceil 規則） | ✅ |
| 3. GroupBalance 全量重算（每次寫入 atomic） | ✅ |
| 4. Settlement（部分結清、smart chip、edit/delete） | ✅ |
| 5. 月份分組列表 + lazy 20 筆 cursor pagination | ✅ |
| 6. 三維度篩選 bottom sheet（誰付 / 分攤 / 分類） | ✅ |
| 7. Real-time 同步（partner 異裝置即時反應，淡黃 highlight） | ✅ |
| 8. 設定頁（帳本名 / 成員 / 顯示名 / 登出） | ✅ |
| 9. pg_cron weekly cleanup（soft-deleted >1yr 物理刪除） | ✅ |
| 10. Server action unit + integration tests | ✅ |
| Bonus | Google avatar（環樣式 + 字母 fallback）；Dashboard filter parity |

---

## 1. 命名與品牌

- **使用者看到**：Futari／「ふたり ・ 家計簿」
- **Codebase**：Oikos
- **Member 識別**：avatar 字母 = `display_name[0]`；底色 hardcode by 位置（member_a = `--ink` 深棕、member_b = `--accent` 橘）；UI 「我」/「對方」依 viewer 翻轉
- **Google avatar**：`profiles.avatar_url`，handle_new_user trigger 寫入；sign-in callback 每次刷新；UI 在 `<Avatar>` 顯示時 bg color 變成環

---

## 2. Transaction CRUD

**目的**：快速記一筆，支援後悔（編輯 / 刪除）。

| 元件 | 路徑 |
|---|---|
| Server actions | [actions/transaction.ts](../../../actions/transaction.ts)（`createTransaction`, `editTransaction`, `softDeleteTransaction`, `loadMoreTransactions`） |
| Validation | [lib/validators.ts](../../../lib/validators.ts)（`validateTransactionInput`） |
| 表單 UI | [app/(dashboard)/dashboard/_components/AddSheet.tsx](../../../app/%28dashboard%29/dashboard/_components/AddSheet.tsx) |
| 列表 row | [app/(dashboard)/dashboard/_components/CompactRow.tsx](../../../app/%28dashboard%29/dashboard/_components/CompactRow.tsx) |
| 列表容器 | [app/(dashboard)/_components/TransactionFeed.tsx](../../../app/%28dashboard%29/_components/TransactionFeed.tsx) |

**關鍵 invariant**：「編輯」= 一個 DB transaction 內 soft delete 舊 row + insert 新 row + recalcGroupBalance。使用者不感知這是兩步。

---

## 3. Settlement

**目的**：欠款方記錄一筆還款，支援部分結清。

| 元件 | 路徑 |
|---|---|
| Server actions | [actions/settlement.ts](../../../actions/settlement.ts) |
| Validation | [lib/validators.ts](../../../lib/validators.ts)（`validateSettlementInput`） |
| Smart chip 計算 | [lib/settlement.ts](../../../lib/settlement.ts) |
| Inline 表單 | [app/(dashboard)/dashboard/_components/SettlementForm.tsx](../../../app/%28dashboard%29/dashboard/_components/SettlementForm.tsx)（balance card 同位置展開） |
| Edit/delete sheet | [app/(dashboard)/dashboard/_components/SettlementSheet.tsx](../../../app/%28dashboard%29/dashboard/_components/SettlementSheet.tsx) |

**關鍵概念**：
- 「我還多少？」/「對方還了多少？」依 viewer 翻轉
- Smart chip：全額 / 一半 / 整數（整數 = 取整百到不超過欠款；< 100 或等於全額時隱藏）

---

## 4. Balance + 列表

| 元件 | 路徑 |
|---|---|
| 計算公式（pure） | [lib/balance.ts](../../../lib/balance.ts) |
| Recalc SQL | [lib/db/queries/balance.ts](../../../lib/db/queries/balance.ts) |
| Feed query（UNION transactions + settlements） | [lib/db/queries/transactions.ts](../../../lib/db/queries/transactions.ts) |
| Balance card UI | [app/(dashboard)/dashboard/_components/BalanceHero.tsx](../../../app/%28dashboard%29/dashboard/_components/BalanceHero.tsx) |
| 月份分組 | [lib/groupByMonth.ts](../../../lib/groupByMonth.ts) + [app/(dashboard)/records/_components/MonthSection.tsx](../../../app/%28dashboard%29/records/_components/MonthSection.tsx) |

**關鍵 invariant**：列表用 UNION SQL，把 transactions 和 settlements 統一為 `kind: 'transaction' | 'settlement'`，cursor 用 `(transactedAt, createdAt)` 複合鍵。

---

## 5. 篩選

**目的**：三維度過濾（誰付 / 分攤 / 分類），filter state in-memory 不持久化。

| 元件 | 路徑 |
|---|---|
| Filter types + helpers（pure） | [lib/filter.ts](../../../lib/filter.ts)（`TxnFilter`, `defaultFilter`, `isFilterActive`, `hidesSettlements`, `matchesFilter`） |
| Bottom sheet UI | [app/(dashboard)/records/_components/FilterSheet.tsx](../../../app/%28dashboard%29/records/_components/FilterSheet.tsx) |
| 入口 + 狀態 | `RecordsList` + `Dashboard.tsx`（兩處 parity，見 §10） |

**關鍵概念**：
- 誰付 dim 套用兩種 row（含 settlements）
- 分攤 / 分類 dim 觸發時 settlements 整批排除（`hidesSettlements`）
- Server-side 在 `loadMoreTransactions` resolve 為 `ResolvedTxnFilter`，SQL 用 `IN + sql.join`

---

## 6. Settings

| 元件 | 路徑 |
|---|---|
| Page（server component） | [app/(dashboard)/settings/page.tsx](../../../app/%28dashboard%29/settings/page.tsx) |
| Client UI | [app/(dashboard)/settings/_components/SettingsContent.tsx](../../../app/%28dashboard%29/settings/_components/SettingsContent.tsx) |
| 共用 inline edit sheet | [app/(dashboard)/_components/EditTextSheet.tsx](../../../app/%28dashboard%29/_components/EditTextSheet.tsx) |
| Server actions | `updateGroupName` in [actions/group.ts](../../../actions/group.ts)；`updateDisplayName` in [actions/profile.ts](../../../actions/profile.ts) |

**內容**：帳本名稱（可改）／ 成員列表（read-only avatar + name + email）／ 顯示名稱（可改）／ 登出 ／ 法律聲明（href="#" placeholder）。

---

## 7. Real-time

**目的**：partner 異裝置變動立即反應；不打擾（無 toast、無聲音）。

| 元件 | 路徑 |
|---|---|
| Provider + event bus | [app/(dashboard)/_components/RealtimeProvider.tsx](../../../app/%28dashboard%29/_components/RealtimeProvider.tsx) |
| Browser-side Supabase client | [lib/supabase/client.ts](../../../lib/supabase/client.ts) |
| Event types | [lib/realtime/event.ts](../../../lib/realtime/event.ts)（discriminated union：`txn-insert/update`, `settle-insert/update`, `balance-change`, `reconnect`） |
| Wired in | [app/(dashboard)/layout.tsx](../../../app/%28dashboard%29/layout.tsx) |
| Feed 訂閱 | `TransactionFeed` 內 `useRealtimeEvents()` |
| Balance 訂閱 | `BalanceHero` 內 `useRealtimeEvents()`（cross-fade） |

**訂閱 channel**：`group:${groupId}` × 三張 table（CashTransactions / Settlements / GroupBalance），filter `group_id = eq.${groupId}`。

**UX 規則**：
- INSERT → prepend + 1s `--realtime-flash` 淡黃 highlight
- UPDATE 帶 `deletedAt` → 0.5s fade-out 後移除
- balance UPDATE → 數字 cross-fade 300ms
- Reconnect → 自動 refetch page 1（不顯示「斷線中」狀態）
- Filter 啟用時 → 不符合的 incoming events 靜默跳過

---

## 8. pg_cron Cleanup

**目的**：每週日 03:00 物理刪除 `deleted_at > 1 year` 的 row。

| 元件 | 路徑 |
|---|---|
| Migration | [drizzle/0001_pg_cron_cleanup.sql](../../../drizzle/0001_pg_cron_cleanup.sql) |
| 執行方式 | `npm run db:migrate`（用 `node --env-file=.env.local`） |
| 驗證 | `SELECT * FROM cron.job WHERE jobname = 'cleanup-soft-deleted'` |

**前置**：Supabase 需啟用 `pg_cron` extension（dashboard → Database → Extensions）。

---

## 9. 測試覆蓋

| 類型 | 路徑 |
|---|---|
| Pure helper unit tests | [\_\_tests\_\_/](../../../__tests__/) + [tests/](../../../tests/)（balance, settlement, categories, invite, groupByMonth, crypto, filter, validators） |
| Server action integration tests | [tests/actions-\*.test.ts](../../../tests/) |
| Mock harness（supabase + drizzle） | [tests/_mocks/](../../../tests/_mocks/) |

**現況**：121 tests passing（pure helpers + 9 個 server action 的 happy path + key error paths）。

---

## 10. Dashboard Filter Parity

**目的**：dashboard 的「最近紀錄」header 也加 `篩選 ›`，與 /records 一致。為將來把列表替換成圖表（charts）保留 filter UX 契約。

| 元件 | 路徑 |
|---|---|
| Wiring | [app/(dashboard)/dashboard/_components/Dashboard.tsx](../../../app/%28dashboard%29/dashboard/_components/Dashboard.tsx) |

Filter state 是 per-page（dashboard 跟 /records 各自獨立，不共享）。

---

## Out of scope（Phase 1 不做，已轉移）

| 項目 | 去向 |
|---|---|
| Asset 關聯 picker | Phase 2 |
| 自定 category | Phase 2+ |
| 推播通知 | 不做（無 PWA push） |
| 多幣別、匯出、theme、頭像上傳 | 不做 |
| 法律聲明頁 | 之後（目前 href="#" 占位） |

---

## 待後續處理

- **Realtime 編輯時 list item 跨月份移動的視覺破碎**：把 5/1 編輯成 4/15 會觸發 remove-from-五月 + insert-to-四月 兩個 event，視覺上會有半秒空檔。實作上選了「兩個 event 各自觸發」這條路（簡單），如果體感不好再優化。
- **Realtime 連線中斷 backoff**：依賴 `@supabase/supabase-js` v2 預設行為；地下停車場 / 切 WiFi 場景未實際測過。

---

## 設計師待補（不阻塞功能，但會讓 UI 更完整）

1. 雙色 heart icon SVG（空狀態）
2. Futari logo SVG（目前 placeholder）
3. 醫療 / 家居 / 禮物 / 其他 4 個 category 的精確色票
4. 完整 design tokens（hover、disabled、shadow、radius、spacing）
5. PWA icon set（512×512、192×192、maskable）
