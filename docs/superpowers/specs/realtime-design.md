---
status: shipped
first_shipped_in: v0.1.0
updates:
  - v0.14.0: 離線時靜音 reconnect retry（避免無限 reconnect log noise；上線時恢復訂閱）
  - v0.15.0: ReconnectRefresh — 重新上線 + PWA 回前景時自動 `router.refresh()`（closes #126）
related_specs: [transactions, offline-browsing, recurring, savings-view]
related_issues: ["#126"]
---

# Realtime UX 規則

> Partner 異裝置變動立即反應的 UX 契約：訂閱什麼、收到 event 做什麼、離線時怎麼處理。
> 跨多個 entity（CashTransactions / Settlements / GroupBalance / IncomeTransactions / PendingExpenseOccurrences / Assets / ...），所以獨立成 spec。

---

## 背景與動機

雙人帳本的核心情境之一：A 在客廳記了一筆，B 在房間翻 dashboard 應該**馬上**看到那筆。離線後再上線、partner 同時改同一筆、filter active 時收到不符的 event——這些都需要一致的處理規則，不能每個 feature 各自實作一套。

Realtime 是 Supabase postgres_changes 接出來的事件流，本 spec 鎖定客戶端對這些事件的反應規則。

---

## 訂閱結構

每個 group 開一個 channel：`group:${groupId}`，訂閱多張 table 的 INSERT / UPDATE / DELETE：

| Table | 用途 |
|---|---|
| `CashTransactions` | feed 新增 / 編輯 / 軟刪 |
| `Settlements` | 還款新增 / 軟刪 |
| `GroupBalance` | balance 數字變動 |
| `IncomeTransactions` | 進帳新增 / 編輯 / 軟刪 |
| `PendingExpenseOccurrences` | 定期支出 pending 卡片變動（將遷移到 `TransactionInbox`，見 [inbox-layer](inbox-layer-design.md)）|
| `PendingIncomeOccurrences` | 定期進帳 pending 卡片變動 |
| `Assets` | 愛物 CRUD（list 與 detail 頁同步） |
| `OikosGroups` | guardian beta flag flip / member_b 接受邀請後升雙人 |
| `RecurringIncomeRules` / `RecurringExpenseRules` | 規則建立 / 編輯（settings 頁同步） |

實作落地點：`app/(dashboard)/_components/RealtimeProvider.tsx`。

---

## UX 規則

| Event | 行為 |
|---|---|
| `INSERT` 新 row | feed prepend + 1s `--realtime-flash` 淡黃 highlight |
| `UPDATE` 帶 `deletedAt` | 0.5s fade-out 後從 list 移除 |
| `UPDATE` Group balance | hero card 數字 cross-fade 300ms（不閃跳） |
| `UPDATE` 其他（軟編輯 = soft delete + insert） | 原 row UPDATE 帶 deletedAt → fade-out；新 row INSERT → prepend + flash（合計兩個 event） |
| Filter active 時收到不符 event | 靜默跳過（不顯示在當前視圖，但 cache 已更新） |
| Pending stack 收到 INSERT | 卡片 fade in；mint glow / category tint glow |
| Pending stack 收到 UPDATE 含 `resolvedTxId` 或 `skippedAt` | 卡片 fade out |
| Insurance detail 收到 `transaction-changed` event 且 `assetId === current` | `router.refresh()`（更新繳費紀錄 + premiumStats） |
| Insurance detail 收到 `income-transaction-changed` 且 `assetId === current` | `router.refresh()` |
| `OikosGroups` UPDATE → member_b 從 null 變有值 | 升雙人 broadcast → solo banner 消失、BalanceHero 出現、AddSheet 解鎖分攤 |

## 連線管理

- **Reconnect**：自動 refetch page 1（不顯示「斷線中」狀態 banner）
- **離線時**：監聽 `online` / `offline` 事件呼叫 `realtime.disconnect()` / `connect()`，暫停 reconnect 迴圈（避免無限 reconnect log noise）— [offline-browsing](offline-browsing-design.md)
- **重新上線**：除了 reconnect，`ReconnectRefresh` 元件再做一次 `router.refresh()`（補 NetworkFirst cache 卡舊資料的問題）
- **PWA 回前景 + 距上次 refresh > 30s**：補一次 `router.refresh()`（iOS PWA standalone 沒下拉刷新的補強）

## 跨月 / 跨 epoch 邊界

把 5/1 編輯成 4/15 會觸發 remove-from-五月 + insert-to-四月 兩個 event，視覺上有半秒空檔。選了「兩個 event 各自觸發」這條路，如果體感不好再優化。

Past epoch view（pin 在過去章節）的 realtime 事件：理論上不該收到（pin 在過去，看的是 frozen window），但 channel 仍訂閱以便 leave/swap 等 epoch 邊界事件能即時反映。Filter active 規則一併套用（不符 epoch 範圍的靜默跳過）。

---

## 已知限制

- **連線中斷 backoff**：依賴 `@supabase/supabase-js` v2 預設行為；地下停車場 / 切 WiFi 場景未實際測過
- **iOS Safari background tab**：SW / WebSocket 在 tab 切到背景時行為不可靠；改用 ReconnectRefresh 補救
- **過量 events 同時到達**：partner 一次性匯入大量 transactions（如未來 cloud-invoice batch import），channel 可能 throttle；目前沒做專門處理，靠 supabase client 自帶 buffer

---

## Acceptance criteria

- A 裝置新增 transaction → B 裝置 dashboard / records 1 秒內出現 + flash
- A 軟刪 transaction → B fade-out 移除
- A 編輯 transaction → B 看到舊 row 消失、新 row prepend
- A 還款（settlement）→ B balance 卡 crossfade 變數
- B 在 records active filter `?fCats=dining` → A 新增 transit 類別 transaction → B 不顯示在 feed（但 navigation cache 已更新）
- 飛航模式 → reconnect noise 安靜（無無限 retry log）
- 重新上線 → 1 秒內自動 refetch；不顯示「斷線中」 banner
- iOS PWA 切背景 30s+ 回前景 → 自動 refresh，不卡舊資料
- Partner 接受邀請 → realtime 觸發升雙人，solo banner 消失、BalanceHero 出現
- Past epoch view 不受 current epoch 的 realtime event 影響（filter active 規則套用）
