# App Store / Play Store 上架 Runbook — Futari 1.5.0（首次送審）

> 架構前提：Android / iOS 都是 **Capacitor 8 薄殼**，`server.url = https://futari.southern-light.dev`，
> 載入線上網站。沒有 JS bundle 要打包進 app；網站邏輯改動透過 Vercel 部署生效，原生殼不需重送即可看到
> （除非改的是原生 plugin / capacitor config / 版本號）。
>
> Bundle ID（共用）：`dev.southernlight.futari` · Apple Team：`W64689HV8B`

---

## 0. 送審前必須關閉的 Gap（blocker 在前）

| # | Gap | 影響 | 狀態 |
|---|---|---|---|
| **B1** | **App 內無「刪除帳號」功能** | 🔴 **Apple 5.1.1(v) + Google Play 都強制**。隱私政策已承諾「可透過設定頁刪除帳號」，現況只有登出。**兩邊都會被拒**。 | ❌ 未做（需決策＋實作） |
| B2 | iOS 未啟用 Push Notifications capability（無 `App.entitlements` / `aps-environment`） | 🟠 APNs 收不到 push；且 push 是 4.2 過審的主理由，審核員可能驗證 | ❌ 需在 Xcode 開 capability |
| B3 | `android/app/google-services.json` 缺失 | 🟠 Android FCM push 不會運作（build 不會壞，但 push 失效） | ❌ 需從 Firebase Console 下載放入 |
| B4 | Ko-fi iOS gate 尚未部署到 prod | 🟠 iOS 殼載入 prod 網站；gate 未上線前 iOS 會看到 tip jar（3.1.1 風險） | ✅ 程式碼已改（本 branch），待部署 prod |
| B5 | 原生版本號對齊 1.5.0 | — | ✅ 已改（Android 105001 / iOS 1.5.0） |

> **關鍵順序**：B4 的 Ko-fi gate 必須**先部署到 prod**，iOS 殼才看不到 tip jar。送 iOS 審核**之前**確認
> `futari.southern-light.dev` 已是含 gate 的版本。

### B1 刪除帳號 — 需要你決策的點

這是兩人共享帳本，刪一個人會牽動共享資料，不是單純刪 row：

- **硬刪 vs 軟刪**：Apple 接受「排程刪除」，但要 app 內可發起、且預設不需人工客服。隱私政策寫「14 個工作天內移除」→ 對應軟刪 + 排程清除。
- **共享帳本怎麼辦**：member 刪除後，對方的 `OikosGroups` / `CashTransactions` 等如何處理？（離開 group？關閉 epoch？匿名化？）
- **auth.users 連動**：需刪 Supabase `auth.users` + `Profiles` + 解除 group 關聯。
- 最小可過審版本：設定頁一個「刪除帳號」入口 → ConfirmModal → server action 觸發刪除/排程 → 登出。

→ 這是一個獨立 feature（含產品決策），建議當作上架前的第一個 sprint item 處理。

---

## 1. Android — Google Play Console

### 1.1 前置（一次性）
- ✅ Upload keystore 已存在：`~/futari-release.keystore`（alias `futari`）。**務必備份**（遺失＝無法更新 app）。
- ✅ Play Console 帳號已開通（$25 一次性）。
- ⬜ 在 Play Console 建立 app（語言、app 名稱 Futari、分類：財務）。
- ⬜ B3：放入 `android/app/google-services.json`（Firebase Console → 專案設定 → Android app）。

### 1.2 Build 簽章 AAB
```bash
# 簽章參數由 build.gradle 從環境變數讀取
export KEYSTORE_PATH="$HOME/futari-release.keystore"
export KEYSTORE_PASSWORD='…'
export KEY_ALIAS='futari'
export KEY_PASSWORD='…'

cd android
./gradlew bundleRelease
# 產物：android/app/build/outputs/bundle/release/app-release.aab
```
> versionCode 已是 `105001`（格式 `M·mm·pp·b`：`1·05·00·1`）。下次更新 build 把尾碼 +1（105002…），
> 或進版時換 mm/pp。Play 要求 versionCode 嚴格遞增。

### 1.3 Play Console 上架資料
- ⬜ 商店資訊：標題、簡短/完整說明（中英對照，套品牌文案準則）、圖示 512×512、Feature graphic 1024×500。
- ⬜ 螢幕截圖：手機至少 2 張（建議 4–8）。可用 prod 網站手機視圖截。
- ⬜ **內容分級**問卷。
- ⬜ **資料安全（Data safety）**表單：申報收集項目 — Supabase（帳號/財務資料）、Sentry（崩潰）、PostHog/GA（分析）。需與隱私政策一致。
- ⬜ 隱私政策 URL：`https://futari.southern-light.dev/<locale>/privacy`。
- ⬜ **App access**：審核需登入 → 提供測試帳號，或說明 solo 模式可直接進入。
- ⬜ **帳號刪除**：Play 的 Data safety 會問「是否提供刪除途徑」+ 需一個 web 刪除說明 URL（B1）。

### 1.4 發佈軌道
- 建議先 **Internal testing** → 自己＋朋友裝、驗證 push / Apple-less 流程 → 再 **Production**（首次審核約數小時–數天）。

---

## 2. iOS — App Store Connect

### 2.1 前置（Xcode，一次性）
- ✅ Apple Developer 已開通（$99/yr）；Team `W64689HV8B`，automatic signing。
- ⬜ **B2：開 Push Notifications capability** — Xcode → Target App → Signing & Capabilities → ＋ Capability → Push Notifications。會產生 `App.entitlements` 含 `aps-environment`。
- ⬜ APNs 金鑰：Apple Developer Portal → Keys → ＋ → Apple Push Notifications service（.p8），設定到後端 push 發送端。
- ⬜ **Sign in with Apple**：因 app 提供第三方登入（Google），Apple 4.8 要求同時提供 Apple 登入。已用 `@capacitor-community/apple-sign-in` 接好（見 [native-auth spec](superpowers/specs/native-auth-design.md)）；送審前在實機驗證能登入。
- ⬜ App Store Connect 建立 app 記錄（Bundle ID `dev.southernlight.futari`、SKU、名稱 Futari）。

### 2.2 Archive + 上傳 TestFlight
```bash
npx cap open ios          # 開 Xcode
```
Xcode 內：
1. 選 `Any iOS Device (arm64)`。
2. Product → Archive。
3. Organizer → Distribute App → App Store Connect → Upload。
4. 等 build 在 App Store Connect 處理完 → 進 TestFlight 自測（push / Apple 登入 / 主流程）。

> `MARKETING_VERSION` 已是 1.5.0，`CURRENT_PROJECT_VERSION`（build number）=1；每次重新上傳同版本要 +1。
> 不需要 `out/` 或 `cap sync`（server.url 架構），除非改了原生 plugin / config。

### 2.3 App Store Connect 上架資料
- ⬜ 截圖：6.7"（必）＋ 6.5" / 5.5"（視情況）。可用模擬器或實機截。
- ⬜ 描述、關鍵字、support URL、行銷 URL、隱私政策 URL。
- ⬜ **App Privacy**（Nutrition label）：同 Data safety，申報 Supabase / Sentry / PostHog / GA。
- ⬜ **App Review Information**：
  - 提供 **demo 帳號** 或註記「solo 模式可直接進入、無 onboarding block」。
  - **Review Notes 模板**見 §3。

### 2.4 送審
- TestFlight 驗證 OK → App Store Connect → 該版本 → Add for Review → Submit。

---

## 3. 審核風險清單（WebView 殼特別注意）

| Guideline | 風險 | 對策 |
|---|---|---|
| **4.2 Minimum Functionality** | 純 WebView 殼常被拒 | 主打 **原生 push + 原生 Apple 登入** 是 web 做不到的差異；Review Notes 明寫 |
| **3.1.1 IAP** | Ko-fi tip jar 被視為繞過 IAP | ✅ iOS gate 已隱藏（B4 部署 prod 後生效） |
| **5.1.1(v) 帳號刪除** | 有註冊就必須 app 內可刪 | 🔴 **B1 未做 — 必補** |
| **4.8 Sign in with Apple** | 有第三方登入就要 Apple 登入 | 已接 `@capacitor-community/apple-sign-in`，驗證可用 |
| **2.1 完整性** | 審核員登不進 / 卡 onboarding | solo 模式可直接進；提供 demo 帳號 |
| **5.1.1 隱私政策** | 須有可達 URL | `/privacy` 已存在 |

**Review Notes 模板（iOS）**
```
Futari is a shared-ledger app for two people (couples/partners).
Native features beyond the web experience: APNs push notifications
(partner expense alerts, monthly review reminders) and native Sign in
with Apple. Solo mode lets a single user enter without a partner — no
onboarding block. Demo: <email> / <password>. Account deletion is
available in Settings → 刪除帳號.
```

---

## 4. 一頁式順序總表

1. **B1 刪除帳號** feature（決策＋實作＋部署 prod）— 兩store blocker
2. **B4 Ko-fi gate 部署 prod**（本 branch merge → release → prod）
3. Android：放 `google-services.json`(B3) → `bundleRelease` → Internal testing → 商店資料 → Production
4. iOS：Xcode 開 Push capability(B2) → APNs key → Archive → TestFlight → 商店資料 → Submit
5. 兩邊 App Privacy / Data safety 與 `/privacy` 內容一致
6. Review Notes 附 demo 帳號 + 原生功能說明

> 版本對齊（Android 105001 / iOS 1.5.0）與 Ko-fi iOS gate 的程式碼已在
> `chore/app-store-1.5.0` branch 完成。
