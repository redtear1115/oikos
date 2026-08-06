---
last_updated: 2026-08-06
---

# App Store / Play Store 上架 Runbook — Futari（首次送審）

> 送審的 native 殼對應 prod **v1.5.1**。native 版本號與 web 版本號脫鉤，這裡對齊到實際送審當下 prod 的版本以利對照。

> 架構前提：Android / iOS 都是 **Capacitor 8 薄殼**，`server.url = https://futari.southern-light.dev`，
> 載入線上網站。沒有 JS bundle 要打包進 app；網站邏輯改動透過 Vercel 部署生效，原生殼不需重送即可看到
> （除非改的是原生 plugin / capacitor config / 版本號）。
>
> Bundle ID（共用）：`dev.southernlight.futari` · Apple Team：`W64689HV8B`

> **進度狀態（2026-06-11）**：**所有 code-side blocker 已完成**（v1.5.1 prod + [PR #936](https://github.com/redtear1115/oikos/pull/936)）。
> 剩下的全是**人工操作步驟**（Xcode / Apple Developer / Firebase Console / Play Console / App Store Connect），
> 無法由程式碼或部署完成。追蹤 issue：[#935](https://github.com/redtear1115/oikos/issues/935)。
>
> 鐵則：審核員打開 app 看到的是「當下的 prod」（native 殼載 `server.url`），純 web/後台的東西都已在 prod，可直接送審。

---

## A. iOS 送審（優先）— App Store Connect

> 依序執行。前置 1–3 可一次做完，4 之後是 build → 測 → 送的主流程。

1. ✅ **Apple Developer Portal — 確認 App ID 已勾 Push**
   Identifiers → `dev.southernlight.futari` → 確認 Push Notifications capability 已啟用。
   （entitlements 與 AppDelegate 程式碼端已完成，見 §C-B2；automatic signing 通常會自動補 App ID 設定，這步只是確認。）

2. ✅ **APNs `.p8` 金鑰 — 已配置**
   金鑰已建立並以 PEM 形式設為 prod Supabase Edge Function secret：`APNS_PRIVATE_KEY_PEM` / `APNS_KEY_ID` / `APNS_TEAM_ID`。
   Push sender `supabase/functions/send-recurring-push` 已部署 prod（ACTIVE）且實際跑通（log 回 200，`importApnsKey` 解析成功）。
   > 僅證明「金鑰可解析 + 函式執行成功」；**push 真的送達實機**需真實 device token，留待 step 5 實機/TestFlight 驗證。

3. ✅ **App Store Connect — 建立 app 記錄**
   Bundle ID `dev.southernlight.futari`、SKU、名稱 Futari。

4. ✅ **Archive + 上傳 TestFlight** — 已上傳 `1.5.1(1)`
   ```bash
   npx cap open ios          # 開 Xcode
   ```
   Xcode 內：
   1. 選 `Any iOS Device (arm64)`。
   2. Product → Archive。
   3. Organizer → Distribute App → App Store Connect → Upload。
   4. 等 build 在 App Store Connect 處理完。
   > 版本號規則見 [§E](#e-版本號規則策略-a純單調計數器)。首送：`MARKETING_VERSION=1.5.1` / `CURRENT_PROJECT_VERSION=1` 直接送。
   > 不需要 `out/` 或 `cap sync`（server.url 架構），除非改了原生 plugin / config。

5. ⬜ **實機 / TestFlight 驗證**
   Apple 登入 + push 收送 + 主流程。Apple 登入已接 `@capacitor-community/apple-sign-in`（見 [native-auth spec](superpowers/specs/native-auth-design.md)）。

6. ⬜ **App Store Connect 上架資料**
   - 截圖：✅ 已產出 4 張 6.7"（1290×2796），見 [store-assets/](store-assets/README.md)。
   - 描述、關鍵字、support URL、行銷 URL、隱私政策 URL（文案見 [app-store-listing.md](app-store-listing.md)）。
   - **App Privacy**（Nutrition label）：申報 Supabase / Sentry / PostHog / GA，須與 `/privacy` 一致。
   - **App Review Information**：提供 **demo 帳號**（或註記「solo 模式可直接進入、無 onboarding block」）+ Review Notes（模板見 §D）。

7. ⬜ **送審**
   TestFlight 驗證 OK → App Store Connect → 該版本 → Add for Review → Submit。

---

## B. Android 送審（可與 iOS 並行）— Google Play Console

1. ✅ **B3：`android/app/google-services.json` — 首版不需要**

   > **2026-08-07 查證：Android 推播從未實作，補這個檔也不會讓它通。**
   > - `lib/pushNotifications.ts:7` — `if (Capacitor.getPlatform() !== 'ios') return`，
   >   Android 根本不註冊 push token。
   > - `supabase/functions/send-recurring-push/index.ts:109` — `.eq('platform', 'apns')`，
   >   發送端只撈 APNs token，沒有 FCM 分支。
   > - `PushTokens.platform` 的註解雖寫 `'apns' or 'fcm'`，但 `'fcm'` 從未被寫入或讀取。
   >
   > 因此首版 Android **決定不含推播**（[#968](https://github.com/redtear1115/oikos/issues/968) 追蹤後續實作）。
   > 這不構成退件或虛假宣稱風險：推播註冊是靜默的（`PushTokenRegistrar.tsx`），
   > **沒有任何使用者可見的通知開關**；四語商店文案也都沒有承諾推播
   > （只有 iOS Review Notes 提到 APNs，那是 iOS 專屬且屬實）。
   >
   > 沒有程式碼引用 Firebase，build 也不需要此檔（`build.gradle:61-66` 會條件式跳過
   > google-services plugin）。等 #968 真的要做 FCM 時再從 Firebase Console 下載。

2. ⬜ **Play Console 建立 app**（語言、app 名稱 Futari、分類：財務）。

3. ✅ **Build 簽章 AAB** — 2026-08-06 實跑成功
   ```bash
   # 簽章參數由 build.gradle 從環境變數讀取；值放在 repo 根目錄 .env（gitignored）
   set -a; . ./.env; set +a

   # ⚠️ 必須用 JDK 21：Capacitor 8 的 capacitor-android 以 source release 21 編譯。
   # 機器上 PATH 的 Homebrew JDK 是 18，直接跑會炸 "invalid source release: 21"。
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

   cd android
   ./gradlew bundleRelease
   # 產物：android/app/build/outputs/bundle/release/app-release.aab
   ```
   > 版本號規則見 [§E](#e-版本號規則策略-a純單調計數器)。首送：`versionCode 105011` / `versionName "1.5.1"` 直接送。
   > 驗證方式：`jarsigner -verify <aab>` 應回 `jar verified.`；
   > `unzip -p <aab> META-INF/FUTARI.RSA | keytool -printcert` 的 SHA256 應等於下方 upload key 指紋。

   > **Upload keystore（2026-08-06 重建）**：`~/futari-release.keystore`，alias `futari`，RSA 2048，效期至 2053-12。
   > SHA-256 `9D:4A:6F:DF:47:F7:90:8F:CA:63:61:43:0A:B7:2B:4A:19:D2:F9:F0:4B:DA:81:55:F0:90:0B:91:60:96:7F:03`。
   > 密碼在 repo 根目錄 `.env`（`KEYSTORE_PATH` / `KEYSTORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD`，store 與 key 同值）。
   >
   > 重建原因：原 keystore（2026-05-30 建）密碼遺失——`keytool -genkey` 當時沒帶 `-storepass`，
   > 密碼是互動輸入且從未寫入任何檔案（`.env` 內留的那組事後查證是錯的）。因為當時尚未送 Play、
   > upload key 未與 Play App Signing 綁定，重建零代價。舊檔留在 `~/futari-release.keystore.bak`。
   >
   > ⚠️ **這個「重建零代價」的窗口在首次送出 Production 後就關閉**。之後遺失只能走 Google 的
   > upload key reset 流程。密碼務必存進密碼管理器，keystore 檔案務必另外備份。

4. ⬜ **Play Console 上架資料**
   - 商店資訊：標題、簡短/完整說明（中英對照，套品牌文案準則）。
   - 圖示 512×512 + Feature graphic 1024×500（四語）→ ✅ 已產出，見 [store-assets/](store-assets/README.md)。
   - 螢幕截圖：✅ 已產出 4 張 1080×1920（`*-play.png`）。
     ⚠️ 不能用 App Store 那組 1290×2796：Play 規定長邊不得超過短邊 2 倍，2.167 會被退。
   - **內容分級**問卷。
   - **資料安全（Data safety）**：申報 Supabase（帳號/財務）、Sentry（崩潰）、PostHog/GA（分析），須與 `/privacy` 一致。
   - 隱私政策 URL：`https://futari.southern-light.dev/<locale>/privacy`。
   - **App access**：審核需登入 → 提供測試帳號，或說明 solo 模式可直接進入。
   - **帳號刪除**：Data safety 會問「是否提供刪除途徑」+ web 刪除說明 URL → 設定頁「刪除帳號」+ `/privacy`（已上線，見 §C-B1）。

5. ⬜ **發佈軌道**
   先 **Internal testing**（自己＋朋友裝、驗證 push / Apple-less 流程）→ 再 **Production**（首次審核約數小時–數天）。

---

## C. 已完成（code-side blocker — 參考）

> 整段已上 prod（v1.5.1）或進 [PR #936](https://github.com/redtear1115/oikos/pull/936)，無需再動；保留作為「為什麼要做這些」與審核對策的脈絡。

| # | Gap | 狀態 |
|---|---|---|
| **B1** | App 內「刪除帳號」（Apple 5.1.1(v) + Play 強制） | ✅ **已上 v1.5.1 prod** — 設定頁「刪除帳號」（[spec](superpowers/specs/2026-06-09-account-deletion-design.md) · [#923](https://github.com/redtear1115/oikos/issues/923)） |
| **B2** | iOS Push Notifications capability | ✅ **已完成**（[PR #936](https://github.com/redtear1115/oikos/pull/936)）— `ios/App/App/App.entitlements` 含 `aps-environment`，AppDelegate 接 `didRegister/didFailToRegister` forwarding |
| **B4** | Ko-fi iOS gate（3.1.1 IAP 風險） | ✅ **已上 v1.5.1 prod** — iOS 殼看不到 tip jar |
| **B5** | 原生版本號對齊 | ✅ Android `105011` / iOS `1.5.1` |

> **B1 細節**：設定頁「刪除帳號」=請求制（標記 `Profiles.deletion_requested_at` + 登出）→ 14 天可取消 grace period
> → pg_cron 每日處理（solo 全刪 / 配對匿名化刪除者保留另一半歷史）。Google web 刪除說明 URL 沿用 `/privacy`。
>
> **B2 細節**：`aps-environment` 目前是 `development`；archive 走 distribution provisioning 時 Apple 會以 production APNs
> 環境覆蓋，TestFlight / App Store **不需**手動改成 `production`。
>
> 一次性前置也都已就緒：Apple Developer（$99/yr，Team `W64689HV8B`，automatic signing）、Play Console 帳號（$25）、upload keystore。

---

## D. 審核風險清單 + Review Notes（WebView 殼參考）

| Guideline | 風險 | 對策 |
|---|---|---|
| **4.2 Minimum Functionality** | 純 WebView 殼常被拒 | 主打 **原生 push + 原生 Apple 登入** 是 web 做不到的差異；Review Notes 明寫 |
| **3.1.1 IAP** | Ko-fi tip jar 被視為繞過 IAP | ✅ iOS gate 已隱藏（已上 prod） |
| **5.1.1(v) 帳號刪除** | 有註冊就必須 app 內可刪 | ✅ 設定頁「刪除帳號」（已上 prod） |
| **4.8 Sign in with Apple** | 有第三方登入就要 Apple 登入 | ✅ 已接 `@capacitor-community/apple-sign-in`；送審前實機驗證 |
| **2.1 完整性** | 審核員登不進 / 卡 onboarding | solo 模式可直接進；提供 demo 帳號 |
| **5.1.1 隱私政策** | 須有可達 URL | ✅ `/privacy` 已存在 |

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

## E. 版本號規則（策略 A：純單調計數器）

> 大原則：薄殼（`server.url`）的網站靠 Vercel 持續更新、**不用重送 App**。原生版本號**只在「要再上傳一個商店二進位檔」時才動**
> （改了原生 plugin / capacitor config，或要更新商店 metadata 重送）。日常 web release **不要** bump 原生。

兩種號分清楚：

| 號 | iOS | Android | 角色 | 何時動 |
|---|---|---|---|---|
| **使用者可見版號** | `MARKETING_VERSION` | `versionName` | 商店頁顯示的字串 | 只在「想讓使用者看到新版號」時；可對齊送審當下 prod 的 web semver |
| **商店遞增計數** | `CURRENT_PROJECT_VERSION`（build number） | `versionCode` | 商店排序用的內部整數，**硬性 gate** | **每次上傳就 +1** |

**鐵則（策略 A — 純單調計數器，與 semver 脫鉤）：**

1. **每次上傳商店（含被拒重送、只改 metadata 的重送、TestFlight 每次傳）都把計數 +1**，永不歸零、不對應版號語意。
2. iOS build number 與 Android versionCode **各自獨立**，不用湊成一樣。
3. iOS：App Store 要求同一 `MARKETING_VERSION` 下 build number 唯一遞增；全域只增不減最不會出錯。⚠️ TestFlight 也吃此規則——1.5.1(1) 測完要修再傳必須 1.5.1(2)。
4. Android：`versionCode` 嚴格遞增即可（上限 2,100,000,000）。起點沿用 `105011`，之後 `105012 → 105013 → …`，不再用舊的 `M·mm·pp·b` 語意編碼（build 段只有 1 位、第 10 次重送會溢位）。
5. 改 `versionName` / `MARKETING_VERSION` 時，計數**照樣只 +1，不要跟著歸零**。

**設定位置：**

- iOS：`ios/App/App.xcodeproj/project.pbxproj` 的 `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`（Debug + Release 兩處都要改）。
- Android：`android/app/build.gradle` 的 `versionName` / `versionCode`（已附同義註解）。

> 目前無自動 bump（release skill 只動 `package.json`）。薄殼罕重送，手動 bump 可接受；archive / `bundleRelease` 前先確認計數已 +1。
