---
last_updated: 2026-09-11
---

# App Store / Play Store 上架 Runbook — Futari（首次送審）

> 送審的 native 殼對應 prod **v1.5.5**。native 版本號與 web 版本號脫鉤，這裡對齊到實際送審當下 prod 的版本以利對照。

> 架構前提：Android / iOS 都是 **Capacitor 8 薄殼**，`server.url = https://futari.southern-light.dev`，
> 載入線上網站。沒有 JS bundle 要打包進 app；網站邏輯改動透過 Vercel 部署生效，原生殼不需重送即可看到
> （除非改的是原生 plugin / capacitor config / 版本號）。
>
> Bundle ID（共用）：`dev.southernlight.futari` · Apple Team：`W64689HV8B`

> **進度狀態（2026-09-11）**：iOS 重新送審中，native 殼 bump 到 `1.5.5 (3)`。
> `1.5.5 (2)` 被發現 `App.entitlements` 從建檔起就缺 `com.apple.developer.applesignin`，
> 原生 Apple 登入在任何 TestFlight/App Store build 上從未可用（[PR #985](https://github.com/redtear1115/oikos/pull/985)，已 merge）。
> `(3)` 補回 entitlement，**上傳後務必實機驗證原生 Apple 登入 sheet 真的彈出來，再回覆 Apple 的 Guideline 2.1 要求**（見下方進度）。
> 2026-06-11 上傳的 `1.5.1 (1)` 已於 **2026-09-09 過期**（TestFlight build 壽命 90 天 — 見 [§F](#f-build-90-天會過期)），必須重傳。
> 過程中另外發現 **iOS 自 Capacitor 8 升級（2026-07-12）後從未編譯過**，SPM 依賴衝突直接擋住 archive
> （修法見 [§G](#g-capacitor-8--apple-sign-in-的-spm-衝突)）。追蹤 issue：[#935](https://github.com/redtear1115/oikos/issues/935)。
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

4. ⬜ **Archive + 上傳** — `1.5.5(2)` 缺 Apple Sign In entitlement，重傳 `1.5.5(3)`
   ```bash
   npx cap open ios          # 開 Xcode
   ```
   Xcode 內：
   1. 選 `Any iOS Device (arm64)`。
   2. Product → Archive。
   3. Organizer → Distribute App → App Store Connect → Upload。
   4. 等 build 在 App Store Connect 處理完。
   > 版本號規則見 [§E](#e-版本號規則策略-a純單調計數器)。目前：`MARKETING_VERSION=1.5.5` / `CURRENT_PROJECT_VERSION=3`。
   > 不需要 `out/` 或 `cap sync`（server.url 架構），除非改了原生 plugin / config。
   >
   > **也可以完全不開 Xcode**，用 ASC API key 從 CLI 走完（key 見 [§H](#h-app-store-connect-api-key)）：
   > ```bash
   > xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
   >   -destination 'generic/platform=iOS' -archivePath <out>.xcarchive archive \
   >   -allowProvisioningUpdates \
   >   -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8 \
   >   -authenticationKeyID <KEYID> -authenticationKeyIssuerID <ISSUER>
   > cat > /tmp/ExportOptions.plist <<'EOF'
   > <?xml version="1.0" encoding="UTF-8"?>
   > <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   > <plist version="1.0"><dict>
   >   <key>method</key><string>app-store-connect</string>
   >   <key>teamID</key><string>W64689HV8B</string>
   >   <key>signingStyle</key><string>automatic</string>
   >   <key>uploadSymbols</key><true/>
   > </dict></plist>
   > EOF
   > xcodebuild -exportArchive -archivePath <out>.xcarchive -exportPath <dir> \
   >   -exportOptionsPlist /tmp/ExportOptions.plist -allowProvisioningUpdates \
   >   -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8 \
   >   -authenticationKeyID <KEYID> -authenticationKeyIssuerID <ISSUER>
   > xcrun altool --upload-app -f <dir>/App.ipa -t ios --apiKey <KEYID> --apiIssuer <ISSUER>
   > ```

5. ⬜ **實機 / TestFlight 驗證**
   Apple 登入 + push 收送 + 主流程。Apple 登入已接 `@capacitor-community/apple-sign-in`（見 [native-auth spec](superpowers/specs/native-auth-design.md)）。

6. ⬜ **App Store Connect 上架資料**
   - 截圖：✅ 6.7" iPhone 4 張（1290×2796）+ 13" iPad 4 張（2064×2752），見 [store-assets/](store-assets/README.md)。
     iPad 那格是必填 —— `project.pbxproj` 的 `TARGETED_DEVICE_FAMILY = "1,2"` 宣告了支援 iPad。
   - 描述、關鍵字、support URL、行銷 URL、隱私政策 URL（文案見 [app-store-listing.md](app-store-listing.md)）。
   - **App Privacy**（Nutrition label）：申報 Supabase / Sentry / PostHog / GA，須與 `/privacy` 一致。
   - **App Review Information**：註記「solo 模式可直接進入、無 onboarding block」+ Review Notes（模板見 §D）。
     本 app 只有 Google / Apple OAuth，**沒有 demo 帳號可提供**，審核員用自己的 Apple ID 登入。

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

2. ✅ **Play Console app 已建立**，且**已在跑封閉測試**（2026-06-08 起）。
   商店資訊（名稱／簡短說明／完整說明／圖示／主題圖片／手機截圖）早已填妥。
   > ⚠️ 2026-08-07 教訓：這份 runbook 當時仍標「⬜ 未建立」，導致重複產製已存在的素材。
   > **動手前先開 Console 看實況**，不要以文件的勾選狀態為準。

3. ✅ **Build 簽章 AAB** — 2026-08-06 實跑成功
   ```bash
   # 簽章參數由 build.gradle 從環境變數讀取；值放在 repo 根目錄 .env（gitignored）
   set -a; . ./.env; set +a

   # ⚠️ 用 Android Studio 內附 JBR（現為 JDK 25）。Capacitor 8 要求 ≥ 21；
   # 上限由 Gradle 決定（Java 25 需 Gradle 9.1+，本專案 Gradle 9.5.1 / AGP 9.2.1，#1207）。
   # JBR 比 Gradle 支援的還新時會炸 "Unsupported class file major version NN"——升 Gradle，不是裝舊 JDK。
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

   cd android
   ./gradlew bundleRelease
   # 產物：android/app/build/outputs/bundle/release/app-release.aab
   ```
   > 版本號規則見 [§E](#e-版本號規則策略-a純單調計數器)。首送：`versionCode 105011` / `versionName "1.5.1"` 直接送。
   > 驗證方式：`"$JAVA_HOME/bin/jarsigner" -verify <aab>` 應回 `jar verified.`；
   > `"$JAVA_HOME/bin/keytool" -printcert -jarfile <aab>` 的 SHA256 應等於下方 upload key 指紋。
   > （PATH 上的 `jarsigner` / `keytool` 可能是 macOS stub，會回 `Unable to locate a Java Runtime`。）

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
   - 螢幕截圖：手機 ✅ 早已上傳 4 張（1080×2400，2026-06-02）。
     平板 7 吋 / 10 吋為**必填**且原本是空的 → ✅ 2026-08-07 各補 4 張 1080×1920。
     > Play 寫「顯示比例應為 16:9 或 9:16」是建議值，非硬性；既有的 1080×2400
     > （比例 2.222）照樣被接受。10 吋欄位另有短邊下限 1,080 px。
   - **內容分級**問卷。
   - **資料安全（Data safety）**：申報 Supabase（帳號/財務）、Sentry（崩潰）、PostHog/GA（分析），須與 `/privacy` 一致。
   - 隱私政策 URL：`https://futari.southern-light.dev/<locale>/privacy`。
   - **App access**：審核需登入 → 提供測試帳號，或說明 solo 模式可直接進入。
   - **帳號刪除**：Data safety 會問「是否提供刪除途徑」+ web 刪除說明 URL → 設定頁「刪除帳號」+ `/privacy`（已上線，見 §C-B1）。

5. ⬜ **發佈軌道** — ⚠️ **這是 Android 的真正關鍵路徑，素材再齊也繞不過**

   Google 對**個人開發者帳戶**申請正式版權限的硬性條件（2026-08-07 實況）：

   | 條件 | 狀態 |
   |---|---|
   | 發布封閉測試版本 | ✅ |
   | 至少 **12 名**測試人員參加封閉測試 | ❌ 目前 **9 名**（差 3 人） |
   | 連續 **14 天**封閉測試，且全程維持 ≥12 名測試人員 | ❌ 未起算 |

   「申請發布正式版」按鈕在條件滿足前是**灰的**。14 天從湊滿 12 人那天起算，
   所以 **Android 上架最快是「找齊 3 個人」+ 14 天**。招募測試者是這條路的瓶頸，
   不是程式或素材問題。

---

## C. 已完成（code-side blocker — 參考）

> 整段已上 prod（v1.5.1）或進 [PR #936](https://github.com/redtear1115/oikos/pull/936)，無需再動；保留作為「為什麼要做這些」與審核對策的脈絡。

| # | Gap | 狀態 |
|---|---|---|
| **B1** | App 內「刪除帳號」（Apple 5.1.1(v) + Play 強制） | ✅ **已上 v1.5.1 prod** — 設定頁「刪除帳號」（[spec](superpowers/specs/account-deletion-design.md) · [#923](https://github.com/redtear1115/oikos/issues/923)） |
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
| **2.1 完整性** | 審核員登不進 / 卡 onboarding | solo 模式可直接進；Review Notes 註明無 demo 帳號、請用自己的 Apple ID |
| **5.1.1 隱私政策** | 須有可達 URL | ✅ `/privacy` 已存在 |

**Review Notes 模板（iOS）**
```
Futari is a shared-ledger app for two people (couples/partners).
Native features beyond the web experience: APNs push notifications
(partner expense alerts, monthly review reminders) and native Sign in
with Apple. Solo mode lets a single user enter without a partner — no
onboarding block. There is no demo account — the app has no
email/password form, only Google / Apple OAuth; please sign in with
your own Apple ID. Account deletion is available in Settings → 刪除帳號.
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

---

## F. Build 90 天會過期

**踩過一次**：`1.5.1 (1)` 2026-06-11 上傳，2026-09-09 到期，等到 09-10 要送審時整個版本沒有可用的 build。

- TestFlight build 上傳後 **90 天**過期（`/iris/v1/builds` 的 `expirationDate` / `expired` 欄位）。
- 過期的 build **不能拿來送審**，也不能再給測試者安裝，只能重新 archive 上傳。
- 所以「先傳 build 卡位、metadata 慢慢填」這個做法有時效：**metadata 沒填完就別急著傳 build**，
  或至少要意識到 90 天內必須送出去。
- 查現況（登入 ASC 的瀏覽器 console 內執行即可）：
  ```js
  await (await fetch('/iris/v1/builds?filter[app]=<APP_ID>&fields[builds]=version,uploadedDate,expirationDate,expired,processingState',
    {headers:{'X-Csrf-Itc':'itc'}})).text()
  ```

## G. Capacitor 8 × apple-sign-in 的 SPM 衝突

**症狀**：`xcodebuild`（含 `-list`）直接失敗，訊息類似

```
Failed to resolve dependencies Dependencies could not be resolved because
'apple-sign-in' depends on 'capacitor-swift-pm' 7.0.0..<8.0.0 and
'push-notifications' depends on 'capacitor-swift-pm' 8.0.0..<9.0.0.
```

**根因**：`@capacitor-community/apple-sign-in` 最新版就是 **7.1.0**（上游 master 2025-12 後停更，仍宣告
`.package(url: capacitor-swift-pm, from: "7.0.0")`，SwiftPM 讀作 `>=7.0.0 <8.0.0`），
而 `ios/App/CapApp-SPM/Package.swift` 由 Capacitor CLI 產生、pin `exact: "8.3.4"`。兩者互斥。

> ⚠️ 這個衝突在 2026-07-12 升 Capacitor 8 時就存在了，但因為薄殼平常不需要重 build iOS，
> 一直到 2026-09-10 要重新送審才浮出來。**升 Capacitor 大版本後要記得實際 archive 一次 iOS**，
> 不然問題會潛伏到下次送審。
>
> 這件事現在由 CI 接手（#988）：`.github/workflows/native-smoke.yml` 在 `ios/**`、`patches/**`、
> `package.json`、`package-lock.json` 被動到的 PR 上跑一次不簽章 archive，另加每月 cron 兜底。
> 下面的驗收步驟仍然是本機手動改這一段時的檢查清單。

**修法**：用 `patch-package` 把 plugin 的版本範圍放寬到 `"7.0.0"..<"9.0.0"`。
plugin 的 `Plugin.swift` 只有一個檔案、用的都是 Capacitor 6+ 就穩定的 API
（`CAPPlugin` / `CAPBridgedPlugin` / `CAPPluginMethod` / `bridge?.saveCall`），不需要改程式碼。

- `patches/@capacitor-community+apple-sign-in+7.1.0.patch`（一行 diff，進版控）
- `package.json` 的 `postinstall` = `patch-package || exit 0`
- plugin 版本 **pin 成精確 `7.1.0`**（不是 `^7.1.0`），避免 caret 讓 patch 版本錯配後靜默失效

**為什麼 postinstall 是 fail-soft**：`postinstall` 是 Vercel 每次部署都會跑的共用安裝路徑，
不是 iOS 專屬。patch 失敗若讓 install step 非零退出，就會炸掉 **web 部署**。
`|| exit 0` 讓失敗只反映在 iOS：SPM 解析會大聲報上面那個錯，不會產出壞掉的 App。

**改動這一段後的驗收**（缺一不可，否則會誤把「本機殘留的手改」當成修好了）：

```bash
# 1. clean room — 不能靠既有 node_modules
rm -rf node_modules && npm ci     # 輸出要有 patch-package 套用 apple-sign-in 的成功行

# 1b. 乾淨 checkout 必做：cap sync 的產物沒進版控（見下方註）
mkdir -p out && npx cap sync ios

# 2. archive 要從全新的 SPM 解析開始，不能吃快取
#    （Package.resolved 已 pin 8.3.4，不指定就會重用舊解析結果）
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$T/dd" -clonedSourcePackagesDirPath "$T/spm" \
  -archivePath "$T/a.xcarchive" archive CODE_SIGNING_ALLOWED=NO

# 3. 對照組：把 node_modules 的 Package.swift 還原成 from: "7.0.0"，同樣全新目錄再跑
#    必須失敗於依賴解析 —— 這才證明步驟 2 的成功來自 patch 而非快取
```

> ⚠️ **乾淨 checkout / 新 worktree 一定要先 `npx cap sync ios`**，否則 archive 會失敗於
> `The file "public" / "config.xml" / "capacitor.config.json" couldn't be opened`。
> 這三個是 `cap sync` 產物且被 gitignore，不在版控裡。`webDir` 是 `out`，而 `/out/` 也被 ignore，
> 所以還要先 `mkdir -p out`（server.url 架構下裡面是空的沒關係，bundled 內容根本不會被用到）。
> 實測 `cap sync` **不會**改動已 commit 的 `CapApp-SPM/Package.swift`（內容 byte-identical），
> 所以這步不會把 patch 需求洗掉——它依然寫 `exact: "8.3.4"`。

**若上游哪天出 v8**：移除 `patches/` 與 `postinstall`，把 plugin 升上去。
**fallback（本專案未採用）**：把 `Plugin.swift` vendored 進 `ios/App/App/` 並從 `CapApp-SPM/Package.swift`
移除該 SPM product — 完全不動 `package.json`，代價是 fork 上游程式碼、且 `npx cap sync` 會覆寫那個檔。

## H. App Store Connect API key

用來從 CLI 完成 archive 簽章與上傳，不必開 Xcode，也可用來查 ASC 狀態。

- 建立位置：ASC → 使用者與存取權限 → 整合 → App Store Connect API → 團隊金鑰 → 產生 API 金鑰
- `.p8` **只能下載一次**，放 `~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8`（`chmod 600`）
- Key ID / Issuer ID 不是機密（`.p8` 才是），但具體值不進 public repo — 存密碼管理器
- ⚠️ CDP 控制的 Chrome 會擋自動下載，這步要人工在瀏覽器點

### 角色：上傳用 App 管理，但 export 需要「管理」

⚠️ **踩過**：用 **App 管理** 角色的 key 跑 `xcodebuild -exportArchive` 會失敗：

```
error: exportArchive Cloud signing permission error
error: exportArchive No signing certificate "iOS Distribution" found
```

Xcode 的 provisioning 日誌裡是 Apple 回的 403：

```
"You haven't been given access to cloud-managed distribution certificates.
 Please contact your team's Account Holder or an Admin to give you access."
```

本團隊的 distribution 憑證是 Apple **雲端託管**型（Developer Portal 顯示 `Distribution Managed`），
本機 keychain 沒有私鑰，所以 export 必須走雲端簽章 —— 而雲端簽章要求 key 有
**管理（Admin）** 角色。App 管理不夠，且 **ASC 的 key 建立後權限不能修改**
（介面明寫「你無法透過修改金鑰存取更多服務」），只能另外建一把。

因此目前有兩把：

| Key ID | 角色 | 用途 |
|---|---|---|
| `LRB54C7D5X` | App 管理 | `xcrun altool --validate-app` / `--upload-app` |
| `795L42Z42U` | 管理 | `xcodebuild -exportArchive` 的雲端簽章 |

> **`795L42Z42U` 不能上傳完就撤銷** —— 雲端簽章權限是**每次 export 都要**，不是只有第一次。
> 若不想長期保留 Admin 級 key，有兩條替代路：
> 1. **改用 Xcode GUI 的 Distribute App**：走的是帳戶持有人的登入身分，不需要任何 API key。
> 2. **在本機建一張真正的 Apple Distribution 憑證**（CSR → Portal → `.cer` → 匯入 keychain）：
>    有本機憑證後 export 就在本機簽，不碰雲端簽章，Admin key 即可撤銷，`LRB54C7D5X` 留著上傳就夠。
>    代價是佔一個 distribution 憑證名額，私鑰務必另外備份。

## I. 用 ASC API 填上架資料（比點表單快，且可逐項回查）

送審資料幾乎都能用 App Store Connect API 寫，不必在網頁上逐格點。好處是每一項都能
`GET` 回來驗證，不會「以為填了」。

**JWT**：ASC 用 ES256 JWT，不需要第三方套件——`openssl dgst -sha256 -sign` 簽名後把
DER 的 `SEQUENCE{r,s}` 轉成 raw 64 bytes，再組 `header.payload.signature`（base64url）。
`aud` 固定 `appstoreconnect-v1`。

**幾個實際踩到的點**：

| 坑 | 說明 |
|---|---|
| 首次送審不能寫 `whatsNew` | `PATCH appStoreVersionLocalizations` 帶 `whatsNew`（**連 `null` 都算**）會回 `409 STATE_ERROR: Attribute 'whatsNew' cannot be edited at this time`。整個欄位要省略。 |
| 年齡分級欄位型別混合 | `ageRatingDeclarations` 有些欄位是 enum（`NONE` / `INFREQUENT_OR_MILD` / `FREQUENT_OR_INTENSE`），有些是 boolean。全部丟 `"NONE"` 會回 409 並**列出哪些該是 BOOLEAN**——照著錯誤訊息修最快。路徑是 `PATCH /v1/ageRatingDeclarations/{id}`（不是 `/v1/appInfos/{id}/ageRatingDeclaration`，那會 405）。 |
| inline 建立要用 `${local-id}` | `appPriceSchedules` / `appAvailabilities` 的 `included` 物件 id 必須長成 `${任意名稱}`，否則回 `invalid format`。 |
| 新增語系會自動長出版本 localization | `POST appInfoLocalizations` 之後，該語系的 `appStoreVersionLocalizations` 會自動被建好（空的），所以後續要用 `PATCH` 而不是 `POST`。 |
| App 隱私權**不在**公開 API | `appDataUsages` 那組公開端點全部 404。要用網頁的私有 iris API：`POST /iris/v1/appDataUsages`，一列 = `(app, category, dataProtection, purpose)`；詞彙表在 `/iris/v1/appDataUsageCategories`、`appDataUsagePurposes`、`appDataUsageDataProtections`。最後的「發佈」是**法律聲明**（同意內容正確且合法），要本人按。 |
| 出口合規可以事後補在 build 上 | binary 若沒有 `ITSAppUsesNonExemptEncryption`，build 的 `usesNonExemptEncryption` 會是 `null`（送審 blocker）。**不需要重新 build**：`PATCH /v1/builds/{id}` 設 `usesNonExemptEncryption: false` 即可。 |
| 截圖上傳是三步 | `POST /v1/appScreenshots`（給 `fileSize` / `fileName`）拿到 `uploadOperations` → 依每個 operation 的 `method` / `url` / `requestHeaders` PUT 對應 byte range → `PATCH` 設 `uploaded: true` + `sourceFileChecksum`（檔案的 MD5 hex）。 |
| iPad 截圖用 `APP_IPAD_PRO_3GEN_129` | 13" 的 2064×2752 就放這個 display type，會被接受。iPhone 1290×2796 放 `APP_IPHONE_67`。 |

> ⚠️ **2026-09-11 教訓（又一次）**：runbook 寫「截圖 ✅ 已產出」，但 ASC 上實際掛的是
> 2026-06 用手機拍的 `IMG_88xx.PNG`（1242×2688，6.5" 格），**不是** `docs/store-assets/`
> 那組設計過的 1290×2796。「素材產出」不等於「已上傳」。動手前先用 API 或 Console 看實況。

---

## J. 讓殼載非 prod 的 web（`CAP_SERVER_URL`）

殼是薄的，`server.url` 指向哪裡就顯示哪裡。以前那個值寫死 prod，代表**原生契約面**（deep link、
Apple Sign In、推播、keyboard resize）的 web 改動只有上了 prod 才知道殼會不會壞。
現在 `capacitor.config.ts` 讀 `CAP_SERVER_URL`，`cap sync` 時生效：

```bash
# 本機 dev server（iOS 模擬器）
CAP_SERVER_URL=http://localhost:3000 npx cap sync ios

# 本機 dev server（Android 模擬器）——用 adb reverse，不要用 10.0.2.2（見下方警告）
adb reverse tcp:3000 tcp:3000
CAP_SERVER_URL=http://localhost:3000 npx cap sync android

# Vercel preview（有 Deployment Protection，要帶 bypass 參數，見下方）
CAP_SERVER_URL="https://<branch>.vercel.app/?x-vercel-protection-bypass=<SECRET>&x-vercel-set-bypass-cookie=samesitenone" npx cap sync ios
```

> ⚠️ **Android 別用 `http://10.0.2.2:3000`。** Next 16 的 dev server 預設擋掉非 localhost 來源的
> dev 資源（`allowedDevOrigins`），頁面畫得出來但**沒 hydrate**。
> **失效的樣子**：畫面完全正常，按鈕點了沒有任何反應、沒有錯誤；只有 dev server log 有一行
> `Blocked cross-origin request to Next.js dev resource ... from "10.0.2.2"`。
> `adb reverse` 讓模擬器的 `localhost:3000` 通到宿主機，來源就是 localhost，不必改 `next.config.ts`。
> （每次模擬器重開要重跑 `adb reverse`。）

> ⚠️ **Vercel preview 有 Deployment Protection。** 直接指 preview URL，殼會停在 Vercel SSO
> 登入頁，而且在 WebView 裡登不進去（SSO 導去 `vercel.com`，離開了 `server.url` 的 origin）。
> 到 Vercel 專案 Settings → Deployment Protection → **Protection Bypass for Automation** 產生 secret，
> 帶在 URL 上：第一次載入時 Vercel 會把 bypass cookie 寫進 WebView。
> secret 只會落在 gitignored 的 `capacitor.config.json`，但它仍是機密——測完照「收尾」重跑乾淨的 `cap sync`。
> preview 連的是 **prod Supabase**，在上面寫入的資料進 prod 帳本。

**cleartext 只在 `http://` 覆寫時放寬**，https 覆寫（preview）維持 prod 的安全姿態。
兩邊平台實際需要的東西不同：

| | 需要什麼 | 備註 |
|---|---|---|
| iOS | 不用改 Info.plist | ATS 對 loopback 本來就豁免，模擬器直接載 `http://localhost` |
| Android | `network_security_config.xml` 開 `localhost` / `10.0.2.2` 的 cleartext | 設了 `networkSecurityConfig` 之後 Android 就**不看** capacitor config 的 `cleartext`，那個檔才是真正決定權 |

`server.allowNavigation` 刻意不設 — Capacitor 的 Bridge 本來就允許在 `server.url` 自己的 origin 內導航。

**收尾**：`capacitor.config.json` 兩邊都被 gitignore，覆寫不會漏進 commit；但它會留在原生專案裡
直到下次不帶變數的 `cap sync`。**要 archive／送審前先重跑一次乾淨的 `npx cap sync`**，
確認 `ios/App/App/capacitor.config.json` 的 `server.url` 是 `https://futari.southern-light.dev`。

> **登入**：原生授權完成後，`SignInButton.tsx` 導回**殼當下的 origin**（`window.location.origin`）的
> `/auth/callback`，所以 localhost 與 preview 都能走完（#1214）。
> 在那之前這裡寫死 prod origin，覆寫下的**失效的樣子**是：Custom Tab 開、授權完成、deep link
> 回到 app，然後畫面**永遠停在「正在帶你進去」**、沒有錯誤——PKCE verifier 存在殼當下的 origin，
> prod 讀不到。若再看到這個症狀，先查導向是否又被寫死成某個固定 origin。
>
> 仍需外部設定才走得完的部分：
> - Supabase 該專案的 Redirect URLs 要含 `dev.southernlight.futari://login-callback**`（dev 專案 2026-09-15 實測已含）
> - iOS 原生 Apple：模擬器要先在「設定」**手動**登入 Apple 帳號（「使用其他 Apple 裝置」在模擬器上點了沒反應）；
>   dev 專案的 Apple provider Client IDs 要含 bundle id `dev.southernlight.futari`，否則 `signInWithIdToken` 會被拒
