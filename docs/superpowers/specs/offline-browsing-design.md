---
last_updated: 2026-05-13
status: shipped
first_shipped_in: v0.14.0
updates:
  - v0.15.0: 重新上線 / PWA 回前景自動 refresh（解 iOS PWA standalone 沒下拉刷新、弱網後 NetworkFirst 卡舊資料的問題，closes #126）
related_specs: [realtime, product]
related_issues: ["#19", "#126"]
---

# 離線瀏覽 / PWA Cache

> 讓使用者在無網路時能瀏覽最近的記錄與首頁，不阻塞日常瀏覽。
> **Read-only offline**；不含離線寫入、編輯、realtime。

---

## 背景與動機

Oikos 是 mobile-first PWA：`public/manifest.json` 已宣告 `display: standalone`、`start_url: /dashboard`，使用者可從手機加到主畫面、看似 app。但目前**沒有任何 Service Worker**，斷網時主畫面點下去只會看到瀏覽器離線頁——對「家庭日常記帳」這類隨時想翻一下歷史的場景體感不好（捷運上、地下停車場、出國漫遊等都會踩到）。

需求面只要求「瀏覽」，不要求「寫入」。離線寫入會帶來 conflict resolution、雙人 race、加密欄位（v0.10.0 才剛端到端加密）的安全疑慮，**全部不在本 spec 範圍**。

此外，把 PII（金額、姓名、遮罩 ID）cache 在裝置上是**裝置端的隱私決定**，不是純技術功能。v0.10.0 剛把身分證／健保卡 E2E 加密，呼應「使用者控制自己資料」的基調，本功能採 **opt-in**：預設關閉，使用者到 Settings 主動開啟才會註冊 SW、開始 cache。共用裝置、低可信任環境、儲存吃緊的舊機都可以選擇不開。

---

## Scope

### In

- Settings 頁「離線瀏覽」開關（**預設關閉**，per-device localStorage 持久化）
- Service Worker 安裝與生命週期管理（Serwist + `@serwist/next`），**僅在 toggle 開啟時 register**
- App shell precache（`_next/static/**`、icons、manifest）
- Runtime cache：`/dashboard`、`/records`、`/assets`、`/assets/[id]`、`/assets/[id]/*` 的 RSC HTML，network-first + 3s timeout
- `/offline` fallback 頁
- Online / offline banner（`navigator.onLine` 偵測，僅 toggle 開啟時顯示）
- Toggle 關閉時主動 unregister SW + 清 caches
- Sign-out flow 主動清 dynamic cache 的 hook（防 PII 跨使用者外洩）
- 重新上線 / PWA 回前景自動 refresh（v0.15.0 加入）

### Out

- **離線寫入 / 編輯**：AddSheet、Settlement confirm、IncomeSheet、recurring pending confirm 全要連線
- **IndexedDB shadow store**：不引入 client-side 資料層；不為「離線多頁瀏覽」鋪 IDB
- **背景同步（Background Sync API）**
- **Push notification**
- **Settings / Invite / Auth flows / `/setup`**：這些頁不 cache（需即時資料、含敏感操作）
- **Server actions cache**：所有 server action 走 POST，預設不 cache，也**不該** cache（reveal 身分證／健保卡為高敏感）
- **i18n / locale switching cache**：locale 走 `lang` cookie + `router.refresh()`，SW 不額外處理

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 啟用模式 | **opt-in via Settings 開關**，預設關閉；存 localStorage `offline-browsing-enabled` | Cache PII 是裝置端隱私決定（v0.10.0 才剛 E2E 加密敏感欄位）；尊重「使用者控制自己資料」基調 |
| Toggle 持久化位置 | **localStorage（per device / browser）**，不存 Supabase user prefs | SW 是裝置能力（瀏覽器支援、儲存配額、共享裝置疑慮），語意上是 per-device 而非 per-user；同帳號跨裝置要分別 opt-in |
| Toggle off 行為 | **unregister SW + 清 caches + localStorage = false** | 使用者關閉是主動撤回信任，不只 bypass cache 還要把已存資料抹乾淨 |
| SW framework | **Serwist (`@serwist/next`)** | next-pwa 維護停滯、Next 16 / App Router 兼容回報差；Serwist 為其精神後繼 |
| Cache 分層 | **L1 precache（靜態） + L2 runtime（HTML），跳過 L3（API）** | Oikos 沒有 GET API；server actions 為 POST 不 cache；L3 對需求面零價值且高風險（PII） |
| 靜態資源策略 | **cache-first** | 不變、按 hash key、cache hit 即可離線啟動 |
| HTML 策略 | **network-first, 3s timeout, fallback cache** | 金額正確性 > 首屏 100ms；3s timeout 兜離線；不用 SWR 因為會跟 Next.js `revalidatePath` 打架 |
| 資料 cache 路徑 | **純頁面 cache，不引入 IndexedDB** | 需求是「能看最近的」，純頁面 cache 完全對應；IDB 等到要做離線寫入再評估 |
| 多頁瀏覽限制 | **只能看「最後一次線上開過的頁」** | Records 第二、三頁離線無資料時顯示 empty state「再多紀錄需連線取得」 |
| Per-user 隔離 | **sign-out flow 主動清 dynamic cache** | SW 預設按 URL key、不認 cookie；多使用者共用裝置時必須清 |
| Cache 寫入條件 | **只在 200 OK + 已登入態下寫入；redirect 到 `/sign-in` 不寫** | 防止把「未登入畫面」cache 進去蓋掉登入態頁 |
| Offline UI | **`/offline` fallback 頁 + 全站 banner** | banner 提示資料是 cache、引導使用者知道目前狀態 |
| Realtime 行為 | **離線時靜音 reconnect retry** | 避免無限 reconnect log noise；上線時恢復訂閱 |
| SW 更新策略 | **`skipWaiting + clientsClaim`** | chunk hash 變動時新版立刻接管，不要使用者關 tab 重開 |
| Dev / Prod | **prod-only build**（dev 不啟用 SW） | 避免干擾 Turbopack HMR |

### v0.15.0 增量：自動 refresh

iOS PWA standalone 沒有下拉刷新；Router Cache + Serwist NetworkFirst 在弱網後會卡舊資料、需要關掉 app 重開才恢復。`ReconnectRefresh` 元件監聽 `online` 與 `visibilitychange`：

- 重新上線時**無條件** `router.refresh()`
- PWA 從背景回前景且距上次 refresh 超過 30s 時補一次 refresh

### 不採用

- ❌ **預設啟用**：cache PII 在裝置上是隱私決定，需明確同意
- ❌ **Toggle 存 Supabase user preferences（跨裝置同步）**：SW / cache 是裝置能力，跨裝置同步可能造成「我在朋友家用過一次的瀏覽器自動開了 cache」這種反直覺結果
- ❌ **首次安裝後彈 modal 邀請開啟**：MVP 不做主動推銷；toggle 放在 Settings 等使用者主動發現
- ❌ **next-pwa**：維護停滯、Next 16 / App Router 兼容問題多
- ❌ **自製 SW**：要自處理 precache hashing、版本切換、navigation preload，工時 vs 價值不成比例
- ❌ **Stale-while-revalidate (SWR) on HTML**：Oikos 寫入路徑會 `revalidatePath`，SW 層 SWR 不認；剛新增完一筆 expense 回 dashboard 會看到舊 cache，體感像 bug
- ❌ **IndexedDB shadow store**：對「能瀏覽最近的」需求是 over-engineering
- ❌ **`Vary: Cookie` 處理多使用者**：cookie 內容變動頻繁、cache key 會爆炸；改用 sign-out 主動清

---

## Cache 層級

```
L1 · App Shell（precache, cache-first）
  _next/static/**（Next 自動 hash） / manifest / icons / og-image / /offline

L2 · Dynamic HTML（runtime, network-first）
  /dashboard, /records, /assets, /assets/[id], /assets/[id]/*
  策略：3s timeout → fallback cache
  寫入條件：200 OK + 非 redirect
  sign-out 時清空

→ 全失敗 fallback → /offline（純靜態：「離線中，以下資料為快取」）
```

---

## UX 細節

### Settings 頁開關

- 預設：**關**
- 開啟描述：「無網路時可看最近一次連線時的記錄。資料只存在這台裝置，登出時會自動清除。」
- Toggle 切換進行中（register / unregister）UI disable + spinner，避免連點造成半 cache 狀態
- 每次進 settings 頁時校準 UI：以 `navigator.serviceWorker.getRegistrations()` 為實際狀態，不只信 localStorage
- 帳號登出時 toggle 狀態**不變**（per-device，跟登入帳號脫鉤）

### Offline banner

- 位置：頁首固定條（不擋內容）
- 文案：「離線中・顯示最近一次連線的資料」
- 顏色：中性 muted（不要紅 / 警告色，銀行 app 風格不符 Futari「陪伴」基調）
- 重新上線時 fade out（不刷新整頁，避免使用者正在看的東西消失）

### Cached 頁面上的寫入互動

cached HTML 上的編輯、刪除、settlement confirm 按鈕**不在 client 端預先 disable**：

- 點擊 → 走既有 server action → 離線時 fetch 失敗 → 既有錯誤處理顯示「網路不穩，再試一次」
- 不在 SW 層攔截寫入路徑

理由：(1) `navigator.onLine` 不可信（會誤判 captive portal、弱訊號），預先 disable 反而擋掉真的通的請求；(2) 寫入的 source of truth 是 server action 的 response，不是 SW 狀態。

### Records 換頁離線

下拉到底要載第二頁時偵測 `navigator.onLine === false` → 顯示 inline empty state「再多紀錄需連線取得」（不彈 toast、不跳 modal）。

### Sign-out flow

```
client click 登出
  ↓ server action 清 cookie / Supabase session
  ↓ client redirect 前：await caches.delete('dynamic-v1')
  ↓ redirect /sign-in
```

Precache（L1）保留——靜態資源不含 PII，下個使用者用同一裝置時 app shell 還在，啟動更快。

---

## 實作落地點

`next.config.ts`（Serwist 設定）/ `app/sw.ts`（runtime caching rules + precache manifest）/ `lib/offline/preference.ts` / `lib/offline/swControl.ts` / `lib/hooks/useOnlineStatus.ts` / `app/(dashboard)/settings/_components/OfflineBrowsingToggle.tsx` / `app/(dashboard)/_components/{OfflineLifecycle,OfflineBanner,ReconnectRefresh}.tsx` / `app/offline/page.tsx`

---

## 風險與已知限制

1. **iOS Safari standalone 模式 SW 行為**：iOS 16.4+ 才較完整支援 SW 在 standalone 模式下；更舊版本加到主畫面後 SW 不啟動 — graceful degrade（使用者就是看不到 cache、跟現況一樣）
2. **Chunk hash 變動 → 強制更新**：`skipWaiting + clientsClaim` 確保新版 SW 立刻接管；使用者正在編輯 AddSheet 時若 SW 強更會丟掉未送出的 form state（記帳 form 體積小、重打成本低，可接受）
3. **Cookie-based auth + SW cache**：HTML 含 PII，sign-out 主動清是核心防線；測試矩陣必含「同裝置連續登入兩個帳號」場景
4. **使用者刪了 PWA 但 SW 還在原網站**：PWA 移除不會 unregister origin 上的 SW；下次回到網站時 settings 頁會反映實際 SW 狀態，可手動關閉

---

## Acceptance criteria

| 平台 | 場景 | 期望 |
|---|---|---|
| 任意平台 | 第一次安裝 PWA 後（toggle 預設關） | SW 未註冊；飛航模式開 app 看到瀏覽器離線頁 |
| 任意平台 | Settings 開啟 toggle | SW register 成功；開始 cache |
| 任意平台 | Settings 關閉 toggle | SW unregister；所有 cache 清空 |
| 任意平台 | 切換進行中連點 | 第二次點擊被 disable，無中間態殘留 |
| 任意平台 | 手動清 localStorage 後進 settings 頁 | UI 校準為實際 SW 狀態 |
| Chrome desktop | toggle 開、飛航模式開已 cache 頁 | 顯示 cache + offline banner |
| Chrome desktop | toggle 開、飛航模式開未 cache 頁 | 顯示 empty state |
| iOS 16.4+ Safari（standalone） | toggle 開、飛航模式開 dashboard | 顯示 cache + offline banner |
| iOS 16.3 以下 | toggle 開、飛航模式 | 看到瀏覽器離線頁（graceful degrade） |
| 任意平台 | toggle 開、A 登出 → B 登入 → 開 dashboard | 看到 B 的資料，無 A 的 PII 殘影；toggle 狀態仍為「已開啟」 |
| 任意平台 | toggle 開、線上 → 拔網路 → 重整 dashboard | 3s 後顯示 cache + banner |
| 任意平台 | iOS PWA：弱網後切背景 30s+ 回前景 | 自動 `router.refresh()`，不卡舊資料 |

---

## 未來擴展

- **離線寫入**：AddSheet / IncomeSheet 在離線時暫存 IndexedDB queue，上線後 Background Sync 補送
- **IndexedDB shadow store**：完整同步 transactions / incomes 到 client，離線可分頁可搜尋
- **Push notification**：定期收入 pending 到期、settlement reminder
- **iOS 16.3 以下退場補強**：用 localStorage 暫存核心資料 fallback 顯示（如果統計顯示 user base 還有顯著比例）
