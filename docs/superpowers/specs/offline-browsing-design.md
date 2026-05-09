---
status: shipped
shipped_in: v0.14.0（Service Worker 接通 toggle、precache + runtime cache、/offline、banner、sign-out 清 cache、RealtimeProvider 離線靜音、records 換頁離線 empty state）
remaining_issues: 後續視使用率再決定是否預設啟用；離線寫入 / IndexedDB shadow / push 仍為 out-of-scope（見「未來擴展」）
---

# 離線瀏覽 / PWA Cache 設計 spec

> 目標：讓使用者在無網路時能瀏覽最近的記錄與首頁，不阻塞日常瀏覽。
> 範圍：read-only offline；不含離線寫入、編輯、realtime。
> 優先級：Backlog（[issue #19](https://github.com/redtear1115/oikos/issues/19)）；本 spec 鎖定方向，實作排期由開發者決定。

## 實作狀態

- ✅ Settings 頁「離線瀏覽」toggle UI（v0.11.1, PR #6）→ v0.14.0 重構為獨立 [`OfflineBrowsingToggle`](../../../app/%28dashboard%29/settings/_components/OfflineBrowsingToggle.tsx)，整合 SW register/unregister + cache clean
- ✅ Preference helper：[lib/offline/preference.ts](../../../lib/offline/preference.ts)（localStorage key = `offline-browsing-enabled`；spec 內 `oikos.offline.enabled` 為原始命名草案，實作時簡化）
- ✅ SW 控制 helper：[lib/offline/swControl.ts](../../../lib/offline/swControl.ts)（register / unregisterAll / clearAllCaches / clearDynamicCache / hasActiveSW）
- ✅ Serwist + service worker：[next.config.ts](../../../next.config.ts) + [app/sw.ts](../../../app/sw.ts)（NetworkFirst 3s timeout 走 dashboard / records / assets，CacheFirst 走 icons/og-image，dev disable）
- ✅ `/offline` fallback 頁：[app/offline/page.tsx](../../../app/offline/page.tsx)
- ✅ Online status hook：[lib/hooks/useOnlineStatus.ts](../../../lib/hooks/useOnlineStatus.ts)
- ✅ Lifecycle + banner：[OfflineLifecycle](../../../app/%28dashboard%29/_components/OfflineLifecycle.tsx) + [OfflineBanner](../../../app/%28dashboard%29/_components/OfflineBanner.tsx)（dashboard layout 接入）
- ✅ Sign-out cache clear：[LogoutButton](../../../app/%28dashboard%29/settings/_components/LogoutButton.tsx) 在呼叫 server action 前 `caches.delete('dynamic-v1')`
- ✅ RealtimeProvider 離線靜音：聽 `online` / `offline` 事件呼叫 `realtime.disconnect()` / `connect()` 暫停 reconnect 迴圈
- ✅ Records 換頁離線 empty state：[TransactionFeed](../../../app/%28dashboard%29/_components/TransactionFeed.tsx) 在 offline 時把「載入更多」換為文字提示

---

## 背景與動機

oikos 是 mobile-first PWA：[public/manifest.json](../../../public/manifest.json) 已宣告 `display: standalone`、`start_url: /dashboard`，使用者可從手機加到主畫面、看似 app。但目前**沒有任何 Service Worker**，斷網時主畫面點下去只會看到瀏覽器離線頁——對「家庭日常記帳」這類隨時想翻一下歷史的場景體感不好（捷運上、地下停車場、出國漫遊等都會踩到）。

需求面只要求「瀏覽」，不要求「寫入」。離線寫入會帶來 conflict resolution、雙人 race、加密欄位（v0.10.0 才剛端到端加密）的安全疑慮，**全部不在本 spec 範圍**。

此外，把 PII（金額、姓名、遮罩 ID）cache 在裝置上是**裝置端的隱私決定**，不是純技術功能。v0.10.0 剛把身分證／健保卡 E2E 加密，呼應「使用者控制自己資料」的基調，本功能採 **opt-in**：預設關閉，使用者到 Settings 主動開啟才會註冊 SW、開始 cache。共用裝置、低可信任環境、儲存吃緊的舊機都可以選擇不開。

---

## Scope

### In

- Settings 頁「離線瀏覽」開關（**預設關閉**，per-device localStorage 持久化）
- Service Worker 安裝與生命週期管理（Serwist + `@serwist/next`），**僅在 toggle 開啟時 register**
- App shell precache：`_next/static/**`、`/manifest.json`、icons、`favicon.svg`、`og-image*`
- Runtime cache：`/dashboard`、`/records`、`/assets`、`/assets/[id]`、`/assets/[id]/*` 的 RSC HTML，network-first + 3s timeout
- `/offline` fallback 頁（純靜態，告知「離線中，以下資料為快取」）
- Online / offline banner（`navigator.onLine` 偵測，僅 toggle 開啟時顯示）
- Toggle 關閉時主動 unregister SW + 清 L1 + L2 caches
- Sign-out flow 主動清 dynamic cache 的 hook（防 PII 跨使用者外洩）
- `RealtimeProvider` 在離線時靜音 reconnect retry（不在本 spec 引入新元件，但相鄰修補）

### Out

- **離線寫入 / 編輯**：AddSheet、Settlement confirm、IncomeSheet、recurring pending confirm 全要連線
- **IndexedDB shadow store**：不引入 client-side 資料層；不為「離線多頁瀏覽」鋪 IDB
- **背景同步（Background Sync API）**：寫入失敗暫存後重送；MVP 不做
- **Push notification**：和本 spec 無關
- **Settings、Invite、Auth flows、`/setup`**：這些頁不 cache（需即時資料、含敏感操作）
- **Server actions cache**：所有 server action 走 POST，預設不 cache，也**不該** cache（reveal 身分證／健保卡為高敏感）
- **i18n / locale switching cache**：locale 走 `lang` cookie + `router.refresh()`，SW 不額外處理；切換時 RSC 重 render 拿到新字典即可（cached HTML 內含舊 locale 文字，但只在離線且未刷新時短暫看到）

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 啟用模式 | **opt-in via Settings 開關**，預設關閉；存 localStorage `oikos.offline.enabled`（per device） | Cache PII 是裝置端隱私決定（v0.10.0 才剛 E2E 加密敏感欄位）；尊重「使用者控制自己資料」基調；soft-launch 收 feedback 再評估是否改預設 |
| Toggle 持久化位置 | **localStorage（per device / browser）**，不存 Supabase user prefs | SW 是裝置能力（瀏覽器支援、儲存配額、共享裝置疑慮），語義上是 per-device 而非 per-user；同帳號跨裝置要分別 opt-in |
| Toggle off 行為 | **`navigator.serviceWorker.unregister` + 清 L1 + L2 caches + localStorage = false** | 使用者關閉是主動撤回信任，不只 bypass cache 還要把已存資料抹乾淨；下次再開重新 precache |
| SW framework | **Serwist (`@serwist/next`)** | next-pwa 維護停滯、Next 16 / App Router 兼容回報差；Serwist 為其精神後繼，App Router first-class；自製 SW 在此 scope 不划算 |
| Cache 分層 | **L1 precache（靜態） + L2 runtime（HTML），跳過 L3（API）** | oikos 沒有 GET API；server actions 為 POST 不 cache；L3 對需求面零價值且高風險（PII） |
| 靜態資源策略 | **cache-first** | 不變、按 hash key、cache hit 即可離線啟動 |
| HTML 策略 | **network-first, 3s timeout, fallback cache** | 金額正確性 > 首屏 100ms；3s timeout 兜離線；不用 SWR 因為會跟 Next.js `revalidatePath` 打架 |
| 資料 cache 路徑 | **Path A：純頁面 cache，不引入 IndexedDB** | 需求是「能看最近的」，Path A 完全對應；Path B（IDB shadow）等到要做離線寫入再評估 |
| 多頁瀏覽限制 | **只能看「最後一次線上開過的頁」** | Records 第二、三頁離線無資料時顯示 empty state「再多紀錄需連線取得」 |
| Per-user 隔離 | **sign-out flow 主動 `caches.delete('dynamic-v1')`** | SW 預設按 URL key、不認 cookie；多使用者共用裝置時必須清 |
| Cache 寫入條件 | **只在 200 OK + 已登入態下寫入；redirect 到 `/sign-in` 不寫** | 防止把「未登入畫面」cache 進去蓋掉登入態頁 |
| Offline UI | **`/offline` fallback 頁 + 全站 banner（`navigator.onLine`）** | banner 提示資料是 cache、引導使用者知道目前狀態 |
| Realtime 行為 | **離線時靜音 reconnect retry**（檢查 `navigator.onLine`） | 避免無限 reconnect log noise；上線時恢復訂閱 |
| SW 更新策略 | **`skipWaiting + clientsClaim`** | chunk hash 變動時新版立刻接管，不要使用者關 tab 重開 |
| Dev / Prod | **prod-only build**（dev 不啟用 SW） | 避免干擾 Turbopack HMR |

### 不採用

- ❌ **預設啟用**：cache PII 在裝置上是隱私決定，需明確同意；先 opt-in 觀察使用情況再決定是否改預設
- ❌ **Toggle 存 Supabase user preferences（跨裝置同步）**：聽起來合理，但 SW / cache 是裝置能力，跨裝置同步可能造成「我在朋友家用過一次的瀏覽器自動開了 cache」這種反直覺結果；per-device 較安全
- ❌ **首次安裝後彈 modal 邀請開啟**：MVP 不做主動推銷；toggle 放在 Settings 等使用者主動發現。若上線一段時間使用率太低再考慮一次性 hint
- ❌ **next-pwa**：維護停滯、Next 16 / App Router 兼容問題多
- ❌ **自製 SW**：要自處理 precache hashing、版本切換、navigation preload，工時 vs 價值不成比例
- ❌ **Stale-while-revalidate (SWR) on HTML**：oikos 寫入路徑會 `revalidatePath`，SW 層 SWR 不認；剛新增完一筆 expense 回 dashboard 會看到舊 cache，體感像 bug
- ❌ **IndexedDB shadow store**：要重寫 client-side 讀取層、加 IDB schema migration、加密欄位安全模型重評；對「能瀏覽最近的」需求是 over-engineering
- ❌ **`Vary: Cookie` 處理多使用者**：cookie 內容變動頻繁、cache key 會爆炸；改用 sign-out 主動清
- ❌ **Server actions cache**：reveal 身分證／健保卡是高敏感，cache 在裝置上 = 永久曝光風險
- ❌ **Background Sync API**：要先有 IndexedDB queue；離線寫入不在本 spec
- ❌ **Push notification**：infra 從零、跟本 spec 無關

---

## 架構

### Cache 層級

```
┌─────────────────────────────────────────────┐
│ L1 · App Shell（precache, cache-first）      │
│   _next/static/** （Next 自動 hash）          │
│   /manifest.json、/favicon.svg                │
│   /icons/*、/og-image*.png                    │
│   /offline （fallback 頁）                    │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ L2 · Dynamic HTML（runtime, network-first）  │
│   /dashboard                                 │
│   /records                                   │
│   /assets、/assets/[id]、/assets/[id]/*       │
│                                              │
│   策略：3s timeout → fallback cache          │
│   寫入條件：200 OK + 非 redirect             │
│   sign-out 時 caches.delete('dynamic-v1')   │
└─────────────────────────────────────────────┘
                  ↓ 全失敗
┌─────────────────────────────────────────────┐
│ /offline fallback 頁                         │
│   靜態文案：「離線中，以下資料為快取」         │
└─────────────────────────────────────────────┘
```

### 啟用 / 停用流程

```
App boot（client）
  ↓
讀 localStorage `oikos.offline.enabled`
  ├─ 'true' → navigator.serviceWorker.register('/sw.js')
  │            ↓
  │          SW active → 接管 fetch（見下方請求路徑）
  │
  └─ 'false' or 缺 → 不 register；確保任何殘留 SW 也 unregister
                   （防止使用者曾開過、後來關掉、但舊 SW 還 active）

Settings 頁切換
  ON：
    1. navigator.serviceWorker.register('/sw.js')
    2. await registration.ready
    3. localStorage.setItem('oikos.offline.enabled', 'true')
    4. UI 更新為「已開啟」
    （若 register fail：UI 回原狀並顯示錯誤，localStorage 不寫）

  OFF：
    1. localStorage.setItem('oikos.offline.enabled', 'false')
    2. for reg of await navigator.serviceWorker.getRegistrations(): reg.unregister()
    3. for name of await caches.keys(): caches.delete(name)
    4. UI 更新為「已關閉」
```

### 請求路徑（runtime，僅在 toggle 開啟時生效）

```
Request /dashboard
  ↓
SW fetch handler
  ↓
  ├─ navigator.onLine = true
  │    ↓
  │   try fetch（3s timeout）
  │    ├─ 成功 + 200 + 非 redirect → 寫 dynamic cache、回應
  │    ├─ 成功但 redirect 到 /sign-in → 直接回應、不寫 cache
  │    └─ 超時 / 失敗 → 走 cache fallback
  │
  └─ navigator.onLine = false
       ↓
      caches.match → cache hit 回 cache、miss 回 /offline
```

### 元件清單

| 元件 | 路徑 | 角色 |
|---|---|---|
| Serwist 設定 | `next.config.ts` | 引入 `@serwist/next`，dev disable |
| SW entry | `app/sw.ts` | runtime caching rules、precache manifest 注入 |
| Offline preference helper | `lib/offline/preference.ts`（新） | localStorage 讀寫、SSR-safe；提供 `isOfflineEnabled()` / `setOfflineEnabled()` |
| SW lifecycle controller | `app/(dashboard)/_components/OfflineLifecycle.tsx`（新，client） | App boot 時讀 preference 決定 register / unregister；放在 dashboard layout 確保只在登入區生效 |
| Settings toggle | `app/(dashboard)/settings/_components/OfflineBrowsingToggle.tsx`（新） | 顯示開／關狀態 + 描述；切換時觸發 register/unregister + cache 清理 |
| Offline fallback page | `app/offline/page.tsx` | 純 RSC，無資料依賴 |
| Online status hook | `lib/hooks/useOnlineStatus.ts`（新） | `navigator.onLine` + `online`/`offline` 事件，內部也讀 preference 避免關閉狀態時誤亮 banner |
| Offline banner | `app/(dashboard)/_components/OfflineBanner.tsx`（新） | 全站頂部 banner；preference off 時永不顯示 |
| Sign-out cache clear | `actions/auth.ts` 既有 sign-out → 加 client-side 清 cache 步驟 | 防 PII 跨使用者；preference 不變（per-device） |
| RealtimeProvider 修補 | `app/(dashboard)/_components/RealtimeProvider.tsx` | 離線時靜音 reconnect |

### 資料流

無新資料。本 spec 不動 schema、不動 server actions、不動 DB queries。純 client + SW 層。

---

## UX 細節

### Settings 頁開關

- 路徑：`/settings`（主設定頁，與其他 toggle 並列；不另開子頁）
- Label：「離線瀏覽」
- 狀態描述：
  - 關閉時：「在無網路時看不到歷史記錄。開啟後，最近瀏覽過的頁面會存在這台裝置上。」
  - 開啟時：「無網路時可看最近一次連線時的記錄。資料只存在這台裝置，登出時會自動清除。」
- 預設：**關**
- 開啟動作：呼叫 `register` → `await registration.ready` → 寫 localStorage → UI 切換到「已開啟」
- 關閉動作：寫 localStorage = false → unregister 所有 SW → `caches.delete()` 全部 → UI 切換到「已關閉」
- Toggle 顯示與真實 SW 狀態必須一致：每次進 settings 頁時呼叫 `navigator.serviceWorker.getRegistrations()` 校準 UI（不只信 localStorage），避免「使用者在另一個 tab 改過」或「上次切換中途失敗」造成的不一致
- 切換進行中（register / unregister 進行）UI disable + 顯示 spinner，避免連點造成半 cache 狀態
- 帳號登出時 toggle 狀態**不變**（per-device，跟登入帳號脫鉤）

### Offline banner

- 位置：頁首固定條（不擋內容）
- 顯示條件：`navigator.onLine === false`
- 文案：「離線中・顯示最近一次連線的資料」
- 顏色：用既有 brand palette 的中性 muted（不要紅／不要警告色，銀行 app 風格不符 Futari「陪伴」基調）
- 重新上線時 fade out（不刷新整頁，避免使用者正在看的東西消失）

### Offline fallback page (`/offline`)

只有當 SW 失敗 + 沒 cache 時才會落到這頁（罕見：使用者沒線上開過該頁）。

- 標題：「這裡需要連線才看得到」
- 副文：「先看看下面這些已經存著的吧」
- CTA：列出已 cache 的核心頁連結（dashboard / records / assets）— 這份清單來自 SW 的 `caches.keys()` 動態查詢；如果連 dashboard 都沒 cache 就只顯示「等連線回來」

### Records 換頁離線

下拉到底要載第二頁時：
- 偵測 `navigator.onLine === false` → 顯示 inline empty state「再多紀錄需連線取得」
- 不彈 toast、不跳 modal（陪伴而不打擾）

### Cached 頁面上的寫入互動（編輯／刪除／settle）

cached HTML 上的編輯、刪除、settlement confirm 按鈕**不在 client 端預先 disable**。互動行為：

- 使用者點擊 → 走既有 server action → 離線時 fetch 失敗 → 既有錯誤處理顯示「網路不穩，再試一次」
- 不在 SW 層攔截寫入路徑，也不另寫離線 hint UI
- 如果連線恰好恢復、server action 真的通了，視為正常寫入：realtime / `revalidatePath` 會把結果同步回頁面

理由：(1) `navigator.onLine` 不可信（會誤判 captive portal、弱訊號），預先 disable 反而擋掉真的通的請求；(2) 寫入的 source of truth 是 server action 的 response，不是 SW 狀態；(3) 維持 UI 一致性，不為了離線分支多寫一套互動。AddSheet / IncomeSheet 的 FAB 同此原則——點下去由 server action 自然 fail，不在 client 預擋。

### Sign-out flow

```
client click 登出
  ↓
server action 清 cookie / Supabase session
  ↓
client redirect 前：
  await caches.delete('dynamic-v1')
  ↓
redirect /sign-in
```

precache（L1）保留——靜態資源不含 PII，下個使用者用同一裝置時 app shell 還在，啟動更快。

---

## 實作風險

1. **iOS Safari standalone 模式 SW 行為**：iOS 16.4+ 才較完整支援 SW 在 standalone 模式下；iOS 16.3 以下加到主畫面後 SW 不啟動。MVP 對 iOS 16.4+ 保證可用，更舊版本 graceful degrade（使用者就是看不到 cache、跟現況一樣）。
2. **Next.js 16 Turbopack dev**：Serwist 必須 prod-only，dev 不啟用 SW；否則 HMR 會被 cache 攔截、看不到改動。
3. **Chunk hash 變動 → 強制更新**：`skipWaiting + clientsClaim` 確保新版 SW 立刻接管；既有 tab 不需關閉。但要注意：使用者正在編輯 AddSheet 時若 SW 強更，會丟掉未送出的 form state——MVP 不處理（記帳 form 體積小、重打成本低），未來如果有長 form 再加保護。
4. **Cookie-based auth + SW cache**：HTML 含 PII，sign-out 主動清是核心防線；測試矩陣必含「同裝置連續登入兩個帳號」場景。
5. **Vercel preview 部署的 SW 衝突**：Serwist build 出的 SW 註冊在 origin scope；preview deploy 用不同 subdomain 自然隔離，但要確認 prod domain 的 SW 不會在 preview 被覆寫。
6. **Service Worker 註冊失敗的 fallback**：SW 安裝失敗（用戶停用、private mode、quota exceeded）時 app 仍要正常運作——本 spec 設計上 SW 是 enhancement，沒有 SW 就退回完全線上模式。
7. **realtime + SW 互動**：SW 不攔 WebSocket，realtime 路徑不受影響；但 RealtimeProvider 在離線時的 reconnect noise 要靜音（相鄰修補）。
8. **Toggle race（連點開／關）**：register / unregister 是 async；UI 在進行中必須 disable，否則中途切換會留下殘 SW 或殘 cache。
9. **Toggle 狀態與 SW 註冊狀態漂移**：localStorage 與 `navigator.serviceWorker.getRegistrations()` 可能不一致（手動清 storage、瀏覽器隔離模式、跨 tab 切換）；settings 頁進入時校準 UI 為兩者的「實際狀態」（以 SW registration 為準）。
10. **使用者刪了 PWA 但 SW 還在原網站**：PWA 移除不會 unregister origin 上的 SW；但這不是新問題（任何 PWA 都這樣），且使用者下次回到網站時 settings 頁會反映實際 SW 狀態，可手動關閉。

---

## 範疇與工時估算（單人）

| 工作項 | 估時 |
|---|---|
| 安裝 / 設定 Serwist（`next.config.ts`、`app/sw.ts`） | 0.5d |
| Precache manifest 規則（靜態資源） | 0.5d |
| Runtime caching rules（dashboard / records / assets，network-first + 3s） | 0.5d |
| `lib/offline/preference.ts` localStorage helper | 0.25d |
| `OfflineLifecycle` 元件（boot 時 register/unregister 校準） | 0.25d |
| Settings `OfflineBrowsingToggle`（UI + register/unregister flow + 校準） | 0.5d |
| `/offline` fallback page + `useOnlineStatus` hook | 0.25d |
| `OfflineBanner` 元件接入 layout（gated by preference） | 0.25d |
| Sign-out flow 加 cache clear | 0.5d |
| RealtimeProvider 離線靜音 | 0.25d |
| Records 換頁離線 empty state | 0.25d |
| 跨平台驗證：iOS 16.4+ Safari standalone、Chrome Android、desktop PWA | 1d |
| Spec / CLAUDE.md / CHANGELOG 更新 | 0.25d |
| **合計** | **~5 dev days** |

---

## 測試矩陣

**前置條件：除非另註，所有「離線/cache」相關場景皆以 toggle 已開啟為前提。**

| 平台 | 場景 | 期望 |
|---|---|---|
| 任意平台 | 第一次安裝 PWA 後（toggle 預設關） | SW 未註冊；飛航模式開 app 看到瀏覽器離線頁 |
| 任意平台 | Settings 開啟 toggle | SW register 成功、UI 切換成「已開啟」、開始 cache |
| 任意平台 | Settings 關閉 toggle | SW unregister、所有 cache 清空、UI 切換成「已關閉」 |
| 任意平台 | 開 → 關 → 重新開 | SW 重新註冊，重新 precache fresh（不殘留舊 cache） |
| 任意平台 | 切換進行中連點 | 第二次點擊被 disable，無中間態殘留 |
| 任意平台 | 手動清 localStorage 後進 settings 頁 | UI 校準為實際 SW 狀態（若 SW 仍註冊就顯示「已開啟」） |
| Chrome desktop | toggle 開、飛航模式開 dashboard（已 cache） | 顯示 cache + offline banner |
| Chrome desktop | toggle 開、飛航模式開 records 第二頁（未 cache） | 顯示 empty state |
| Chrome Android（PWA） | toggle 開、漫遊環境啟動 app | 啟動 < 1s（app shell precache 命中） |
| iOS 16.4+ Safari（standalone） | toggle 開、飛航模式開 dashboard | 顯示 cache + offline banner |
| iOS 16.3 以下（standalone） | toggle 開、飛航模式 | 看到瀏覽器離線頁（SW 不啟動，graceful degrade） |
| 任意平台 | toggle 開、同裝置帳號 A 登出 → 帳號 B 登入 → 開 dashboard | 看到 B 的資料，無 A 的 PII 殘影；toggle 狀態仍為「已開啟」 |
| 任意平台 | toggle 開、線上新增 expense → 立刻回 dashboard | 看到新資料（network-first 命中網路） |
| 任意平台 | toggle 開、線上 → 拔網路 → 重整 dashboard | 3s 後顯示 cache + banner |
| 任意平台 | toggle 關、拔網路 | 看到瀏覽器離線頁（無 cache 介入）、無 banner |

---

## 未來擴展（不在本 spec）

- **離線寫入**：AddSheet / IncomeSheet 在離線時暫存 IndexedDB queue，上線後 Background Sync 補送
- **IndexedDB shadow store**：完整同步 transactions / incomes 到 client，離線可分頁可搜尋
- **Push notification**：定期收入 pending 到期、settlement reminder
- **iOS 16.3 以下退場補強**：用 localStorage 暫存核心資料 fallback 顯示（如果統計顯示 user base 還有顯著比例）

---

## 索引

- [GitHub issue #19](https://github.com/redtear1115/oikos/issues/19) — Backlog 條目
- [public/manifest.json](../../../public/manifest.json) — 既有 PWA manifest
- [app/layout.tsx](../../../app/layout.tsx) — root layout，banner 接入點
- [app/(dashboard)/_components/RealtimeProvider.tsx](../../../app/(dashboard)/_components/RealtimeProvider.tsx) — 相鄰修補目標
- [app/(dashboard)/settings/](../../../app/(dashboard)/settings/) — toggle UI 接入點
