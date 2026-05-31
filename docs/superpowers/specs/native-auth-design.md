---
status: shipped
first_shipped_in: v1.4.0
updates:
  - v1.4.1: 修正 deep link 回跳雙重 /auth/callback 路徑 + listener 累積；釐清真正根因為 Supabase Redirect URLs 白名單缺 `/**`（#866）
related_specs: [product, conversion-analytics, offline-browsing]
related_issues: ["#846", "#866"]
---

# Native App Auth（Capacitor Google OAuth）

## 這是什麼

Futari 的 Android app 是用 Capacitor 把 prod PWA 包成原生殼（`server.url` 指向 `https://futari.southern-light.dev`，WebView 載遠端站，不 bundle 網頁）。這份 spec 記錄「在這個原生殼裡怎麼用 Google 登入」的設計決策與**不在 codebase 裡的環境設定不變量**。

給誰看：之後維護 Android 登入、或新增／搬遷 Supabase 環境的人。

## 為什麼這樣設計

### 為什麼登入要跳出瀏覽器（而非在 app 內嵌 WebView 登入）

Google 的安全政策**禁止在嵌入式 WebView 跑 OAuth**（disallowed_useragent）。所以原生殼內的 Google 登入只能：

1. **跳出系統瀏覽器（Custom Tab）做授權**（目前採用）— `@capacitor/browser` 開 Supabase `/authorize`，授權完透過 custom scheme deep link 回 app
2. ~~在 app 內嵌 WebView 直接登入~~ — ❌ Google 擋,技術上不可能

`in-app-browser.ts` 的 WebView 偵測（擋 LINE / FB 等社群 app 內建瀏覽器）也是同一個 Google 限制的衍生。

### 為什麼 web 與 native 的 redirect_to 不同（locked）

| 環境 | redirect_to |
|---|---|
| Web | `https://futari.southern-light.dev/auth/callback?…` |
| Native（Capacitor） | `dev.southernlight.futari://login-callback/auth/callback?…` |

Native 必須用 **custom scheme** 才能讓 OS 把授權結果 deep-link 回 app。判斷走哪條路徑靠 `window.Capacitor` 是否存在（`isCapacitor()`）。實作落地點：`app/[locale]/sign-in/SignInButton.tsx`。

PKCE code_verifier 由 `@supabase/ssr` 存在 cookie；授權在主 WebView 發起、deep link 也回到主 WebView,因此 code 與 verifier 同處一個 storage,server `/auth/callback` route 能正常 `exchangeCodeForSession`。

## 環境設定不變量（source of truth）

這些設定**不在 codebase**,在 Supabase Dashboard → Authentication → URL Configuration。dev / prod 兩個 project 都要設（雙 project 架構)。

- **Site URL**：`https://futari.southern-light.dev`（fallback redirect;不能放 wildcard)
- **Redirect URLs 必含**：
  - `https://futari.southern-light.dev/auth/callback` — web
  - `https://oikos-*.vercel.app/**` — Vercel preview
  - `dev.southernlight.futari://login-callback/**` — **native（custom scheme）**

### ⚠️ 已踩過的雷（locked decision）

custom scheme 那筆**一定要 `/**`,不能用精確值或單星 `/*`**：

- redirect_to 的路徑是 `login-callback/auth/callback`（login-callback 後面還有兩段)
- Supabase glob 的 `*` 不跨 `/`、只匹配單一路徑段 → `/login-callback`（精確)與 `/login-callback/*`(單星)**都不匹配**
- 不匹配時 Supabase **靜默 fallback 到 Site URL（landing)** → deep link 從不觸發 → 主 app 永遠拿不到 session → 使用者被彈回首頁

這個失敗是靜默的（沒有錯誤訊息),症狀（彈回 landing)看起來像 code bug 但根因在 config。詳見 #866。

## 不在範圍（未採用,保留未來)

- **原生 Google 帳號選單（`signInWithIdToken`)** — 體驗更好(不跳瀏覽器),但需 Google Cloud 設 Android OAuth client + SHA-1 + plugin,且要把 native id_token 橋接進 SSR cookie session。屬未來 UX 升級,非 MVP。

## 怎樣算 done（驗收場景）

- Android app 開啟 → CTA → sign-in → 按 Google → 跳出 Custom Tab 授權 → **自動回 app 直接進 dashboard**,不彈回 landing、不需第二次登入
- `typeof window.Capacitor === 'object'` 可確認走原生路徑
- 新增 Supabase 環境後,custom scheme `/**` 兩個 project 都設妥
