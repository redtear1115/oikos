---
last_updated: 2026-06-08
status: planned
related_specs: [native-auth, product]
related_issues: ["#903"]
---

# Sign in with Apple

> **為什麼做：** App Store Review Guideline 4.8 — 凡提供第三方社群登入（目前我們有 Google）的 app，必須**同時**提供 Sign in with Apple，否則 iOS 審核 reject。這是上架的硬性前置條件，不是 nice-to-have。

---

## What

在現有「以 Google 帳號繼續」之外，sign-in 頁加上「以 Apple 帳號繼續」。兩顆按鈕並列、等寬等高、視覺地位對等（4.8 要求 Apple 必須是 *equivalent option*，不可從屬）。Apple 按鈕採 Apple HIG 黑底白字 + Apple logo。

按鈕在**所有平台**都出現（iOS / Android / web）。登入機制依平台分三路，但對使用者是同一顆按鈕、同一個結果（拿到 Supabase session → 進 dashboard）。

## Who

- 直接受益者：iOS 使用者 + 偏好 Apple ID、不想用 Google 的人。
- 真正的 driver：App Store 審核閘門——沒有這顆按鈕，整個 iOS app 無法上架。

## 設計決策（locked）

### 1. 三路分支，視平台而定

native plugin 只支援 iOS，所以不能只有「native / web」兩路：

| 平台 | 機制 | 收尾 |
|---|---|---|
| iOS native | `@capacitor-community/apple-sign-in` 取 identity token → `signInWithIdToken({provider:'apple'})` | client 端直接建立 session，**不經 `/auth/callback`** |
| Android native | Capacitor Browser OAuth + custom-scheme deep link（與現有 Google native 同路徑） | `/auth/callback` |
| Web | `signInWithOAuth({provider:'apple'})` redirect | `/auth/callback` |

平台偵測用 `Capacitor.getPlatform()`。

**為什麼 iOS 走 native plugin 而非 OAuth browser：** Apple 審核期待 iOS app 提供原生 Sign in with Apple 體驗（原生 sheet + Face ID），純 web-view OAuth 在 4.8 情境下品質不足。原生 plugin 才是正解。

### 2. iOS native path 的 attribution 自己補

現有 `/auth/callback/route.ts` 在 OAuth 成功後做兩件分析事：把登入前的匿名事件 alias 到該 user、capture `signed_up`／`signed_in`（帶 entry source）。iOS native 的 `signInWithIdToken` 在 client 端建立 session、**繞過整個 callback**，這些分析不會發生。

決策：新增一支 server action 鏡像 callback 的 alias + capture 邏輯，只在 iOS native 成功後呼叫。**callback route 維持不動**（不重構既有可用程式碼）。

iOS 正是 App Store 的目標客群——若 native Apple 登入完全沒有 conversion 事件，等於把最在意的 cohort 的轉換數據丟掉，所以這段不能省。

### 3. 不處理的事（YAGNI / 已知限制）

- **Avatar：** Apple 從不回傳頭像，沒有東西可同步。Google path 的 avatar refresh 對 Apple 無意義，不複製。
- **displayName：** Apple 只在**首次**登入回傳姓名、且不穩定出現在 id token 裡，所以 Apple 建立的 profile 可能 `displayName` 起始為空（Google 由 `handle_new_user` trigger 帶入）。現有 profile／onboarding 編輯流程已可補填，本次不特別處理。

## 外部前置（非程式碼，使用者手動）

這些是程式碼能運作的前提，但屬 ops 設定，不在本 spec 的程式範圍：

1. **Xcode** — Signing & Capabilities 加 `Sign in with Apple` entitlement
2. **Apple Developer Portal** — App ID 啟用 Sign in with Apple；建立 Services ID + Key
3. **Supabase** — Authentication → Providers → Apple，填入 Services ID / Key（prod + dev 兩個 project 都要）

程式碼可先 merge；上述設定就緒後 native/web Apple 登入才真正可測。

## Acceptance criteria

- sign-in 頁出現「以 Apple 帳號繼續」，與 Google 按鈕等寬等高、地位對等、符合 Apple HIG 黑底白字。
- iOS app 內點 Apple 按鈕 → 原生 Apple 登入 sheet → 成功後進 dashboard，且 PostHog 收到該次 `signed_up`/`signed_in`。
- Android app 內點 Apple → in-app browser OAuth → deep link 回 app → 進 dashboard。
- Web 點 Apple → OAuth redirect → `/auth/callback` → 進 dashboard。
- 按鈕文案 4 語齊（zh-TW / zh-CN / en / ja）。

## 實作落地點（ref，非實作細節）

- 按鈕與分支邏輯 → `app/[locale]/sign-in/SignInButton.tsx`（generalize 為 provider-aware）
- 頁面排版 → `app/[locale]/sign-in/page.tsx`
- native attribution server action → `actions/`（鏡像 `app/auth/callback/route.ts` 的 alias + capture）
- 文案 → `lib/i18n/locales/{zh-TW,zh-CN,en,ja}.ts` 的 `signIn` 區塊
- 新依賴 → `@capacitor-community/apple-sign-in`（package.json；pull 後 `npx cap sync ios`）
