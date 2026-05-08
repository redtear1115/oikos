# 離線瀏覽 / PWA Cache 設計 spec

> 目標：讓使用者在無網路時能瀏覽最近的記錄與首頁，不阻塞日常瀏覽。
> 範圍：read-only offline；不含離線寫入、編輯、realtime。
> 優先級：Backlog（[CLAUDE.md](../../../CLAUDE.md) 列為待排期）；本 spec 鎖定方向，實作排期由開發者決定。

---

## 背景與動機

oikos 是 mobile-first PWA：[public/manifest.json](../../../public/manifest.json) 已宣告 `display: standalone`、`start_url: /dashboard`，使用者可從手機加到主畫面、看似 app。但目前**沒有任何 Service Worker**，斷網時主畫面點下去只會看到瀏覽器離線頁——對「家庭日常記帳」這類隨時想翻一下歷史的場景體感不好（捷運上、地下停車場、出國漫遊等都會踩到）。

需求面只要求「瀏覽」，不要求「寫入」。離線寫入會帶來 conflict resolution、雙人 race、加密欄位（v0.10.0 才剛端到端加密）的安全疑慮，**全部不在本 spec 範圍**。

---

## Scope

### In

- Service Worker 安裝與生命週期管理（Serwist + `@serwist/next`）
- App shell precache：`_next/static/**`、`/manifest.json`、icons、`favicon.svg`、`og-image*`
- Runtime cache：`/dashboard`、`/records`、`/assets`、`/assets/[id]`、`/assets/[id]/*` 的 RSC HTML，network-first + 3s timeout
- `/offline` fallback 頁（純靜態，告知「離線中，以下資料為快取」）
- Online / offline banner（`navigator.onLine` 偵測）
- Sign-out flow 主動清 dynamic cache 的 hook（防 PII 跨使用者外洩）
- `RealtimeProvider` 在離線時靜音 reconnect retry（不在本 spec 引入新元件，但相鄰修補）

### Out

- **離線寫入 / 編輯**：AddSheet、Settlement confirm、IncomeSheet、recurring pending confirm 全要連線
- **IndexedDB shadow store**：不引入 client-side 資料層；不為「離線多頁瀏覽」鋪 IDB
- **背景同步（Background Sync API）**：寫入失敗暫存後重送；MVP 不做
- **Push notification**：和本 spec 無關
- **Settings、Invite、Auth flows、`/setup`**：這些頁不 cache（需即時資料、含敏感操作）
- **Server actions cache**：所有 server action 走 POST，預設不 cache，也**不該** cache（reveal 身分證／健保卡為高敏感）
- **i18n / locale switching cache**：codebase 目前單語 zh-TW

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
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

### 請求路徑（runtime）

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
| Offline fallback page | `app/offline/page.tsx` | 純 RSC，無資料依賴 |
| Online status hook | `lib/hooks/useOnlineStatus.ts`（新） | `navigator.onLine` + `online`/`offline` 事件 |
| Offline banner | `app/(dashboard)/_components/OfflineBanner.tsx`（新） | 全站頂部 banner，離線時顯示 |
| Sign-out cache clear | `actions/auth.ts` 既有 sign-out → 加 client-side 清 cache 步驟 | 防 PII 跨使用者 |
| RealtimeProvider 修補 | `app/(dashboard)/_components/RealtimeProvider.tsx` | 離線時靜音 reconnect |

### 資料流

無新資料。本 spec 不動 schema、不動 server actions、不動 DB queries。純 client + SW 層。

---

## UX 細節

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

---

## 範疇與工時估算（單人）

| 工作項 | 估時 |
|---|---|
| 安裝 / 設定 Serwist（`next.config.ts`、`app/sw.ts`） | 0.5d |
| Precache manifest 規則（靜態資源） | 0.5d |
| Runtime caching rules（dashboard / records / assets，network-first + 3s） | 0.5d |
| `/offline` fallback page + `useOnlineStatus` hook | 0.25d |
| `OfflineBanner` 元件接入 layout | 0.25d |
| Sign-out flow 加 cache clear | 0.5d |
| RealtimeProvider 離線靜音 | 0.25d |
| Records 換頁離線 empty state | 0.25d |
| 跨平台驗證：iOS 16.4+ Safari standalone、Chrome Android、desktop PWA | 1d |
| Spec / CLAUDE.md / CHANGELOG 更新 | 0.25d |
| **合計** | **~4 dev days** |

---

## 測試矩陣

| 平台 | 場景 | 期望 |
|---|---|---|
| Chrome desktop | 飛航模式開 dashboard（已 cache） | 顯示 cache + offline banner |
| Chrome desktop | 飛航模式開 records 第二頁（未 cache） | 顯示 empty state |
| Chrome Android（PWA） | 漫遊環境啟動 app | 啟動 < 1s（app shell precache 命中） |
| iOS 16.4+ Safari（standalone） | 飛航模式開 dashboard | 顯示 cache + offline banner |
| iOS 16.3 以下（standalone） | 飛航模式 | 看到瀏覽器離線頁（graceful degrade，與現況同） |
| 任意平台 | 同裝置帳號 A 登出 → 帳號 B 登入 → 開 dashboard | 看到 B 的資料，無 A 的 PII 殘影 |
| 任意平台 | 線上新增 expense → 立刻回 dashboard | 看到新資料（network-first 命中網路） |
| 任意平台 | 線上 → 拔網路 → 重整 dashboard | 3s 後顯示 cache + banner |

---

## 未來擴展（不在本 spec）

- **離線寫入**：AddSheet / IncomeSheet 在離線時暫存 IndexedDB queue，上線後 Background Sync 補送
- **IndexedDB shadow store**：完整同步 transactions / incomes 到 client，離線可分頁可搜尋
- **Push notification**：定期收入 pending 到期、settlement reminder
- **iOS 16.3 以下退場補強**：用 localStorage 暫存核心資料 fallback 顯示（如果統計顯示 user base 還有顯著比例）

---

## 索引

- [CLAUDE.md](../../../CLAUDE.md) — Backlog 條目來源
- [public/manifest.json](../../../public/manifest.json) — 既有 PWA manifest
- [app/layout.tsx](../../../app/layout.tsx) — root layout，banner 接入點
- [app/(dashboard)/_components/RealtimeProvider.tsx](../../../app/(dashboard)/_components/RealtimeProvider.tsx) — 相鄰修補目標
