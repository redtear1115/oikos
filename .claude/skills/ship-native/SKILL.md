---
name: ship-native
description: >
  Rebuild and re-upload the Futari native shells (iOS App Store Connect /
  Android Play Console): `cap sync` prep, version-counter bump, xcodebuild
  archive + exportArchive + altool upload, Gradle `bundleRelease` + signature
  verification. Use when the user says "重送 iOS", "重傳 build", "傳一版到
  TestFlight", "archive 一版", "打 AAB", "出原生殼", "上傳 App Store",
  "ship native", "resubmit the app", or asks to bump `CURRENT_PROJECT_VERSION`
  / `versionCode`. Builds locally but never uploads without asking first.
---

# ship-native

原生殼「重送」driver。知識來源是
[`docs/app-store-submission-runbook.md`](../../../docs/app-store-submission-runbook.md)——
這份 skill 只把 runbook 裡的 §A4 / §B3 / §E / §F / §G / §H 串成可執行流程，
**背景、審核對策、上架素材、ASC API 填表仍以 runbook 為準**，遇到本檔沒寫的狀況回去讀它。

**路徑皆相對 repo root。**

架構前提：iOS / Android 都是 **Capacitor 8 薄殼**，`server.url = https://futari.southern-light.dev`。
純 web 改動靠 Vercel 部署就觸達三平台，**不需要重送**。會需要跑這份 skill 的只有四種情況：

1. 改了原生 plugin / `capacitor.config.ts` / entitlements / AppDelegate
2. 商店 metadata 要重送，或被拒後要重傳一顆 binary
3. TestFlight build 90 天過期（[§F](../../../docs/app-store-submission-runbook.md#f-build-90-天會過期)）
4. 升了 Capacitor 大版本，要驗證 iOS 還編得起來（[§G](../../../docs/app-store-submission-runbook.md#g-capacitor-8--apple-sign-in-的-spm-衝突)）

---

## 硬性約束

- **不自動執行上傳。** `archive` / `exportArchive` / `bundleRelease` 可以自己跑；
  `xcrun altool --upload-app`、任何送 Play Console 的動作，**送出前一律停下來給使用者確認**
  （要傳的檔案、版本計數、平台）。使用者說「傳」才傳。
- **不動 semver。** `package.json` / `package-lock.json` / `CHANGELOG.md` 一律不碰——那是
  `release` skill（`.claude/skills/release/`，PR #987）的地盤。
- **計數 bump 是唯一允許改的版本欄位**：iOS `CURRENT_PROJECT_VERSION`、Android `versionCode`。
  `MARKETING_VERSION` / `versionName` **只在使用者明講「這版要讓使用者看到新版號」時才動**，
  且照 [§E](../../../docs/app-store-submission-runbook.md#e-版本號規則策略-a純單調計數器) 鐵則 5：
  改了版號，計數**照樣只 +1，不歸零**。
- **文件的勾選狀態不可信。** runbook 上的 ✅ 只代表「寫的時候是這樣」。動手前先用
  ASC API / Play Console / `git log` 看實況。這條踩過兩次：2026-08-07 重做了早就存在的
  Play 商店素材；2026-09-11 以為截圖已上傳，ASC 上掛的其實是六月手機拍的舊圖。
- **模糊就停下來問**：不確定該 bump 哪個平台、不確定計數起點、不確定這次算不算「需要重送」，
  都不要猜，問使用者。

---

## 流程

### 0. 確認重送的原因與平台

先問清楚（使用者沒講就問，不要自行假設）：

| 要問的 | 為什麼 |
|---|---|
| **為什麼重送** | 決定要不要動 `MARKETING_VERSION` / `versionName`、要不要寫 release notes |
| **哪個平台**（iOS / Android / 兩者） | 兩邊的計數各自獨立，不必湊成一樣（[§E](../../../docs/app-store-submission-runbook.md#e-版本號規則策略-a純單調計數器) 鐵則 2） |
| **這顆 build 的目的**（TestFlight 測試 / 正式送審） | TestFlight 也吃 build number 唯一遞增；且傳了就開始算 90 天 |

順手掃一次上次重送以來有沒有原生改動，確認「真的需要重送」：

```bash
git log --oneline -20 -- ios/ android/ capacitor.config.ts patches/ package.json
```

> ⚠️ **90 天時鐘**：TestFlight build 上傳後 90 天過期，過期的 build **不能送審**。
> 所以「先傳 build 卡位、metadata 慢慢填」有時效——**metadata 沒填完就別急著傳**。
> 查現況（在已登入 ASC 的瀏覽器 console 執行）：
> ```js
> await (await fetch('/iris/v1/builds?filter[app]=<APP_ID>&fields[builds]=version,uploadedDate,expirationDate,expired,processingState',
>   {headers:{'X-Csrf-Itc':'itc'}})).text()
> ```

### 1. 前置：cap sync（乾淨 checkout / 新 worktree 必做）

```bash
npx cap sync ios      # 或 android / 兩個都跑
```

`public/` · `config.xml` · `capacitor.config.json` 是 `cap sync` 產物且被 gitignore，
不在版控裡。少了它們 archive 會失敗於 `The file "public" couldn't be opened`。
`webDir`（`out/`）也被 ignore，但**不必手動 `mkdir`**：`capacitor:copy:before` hook
（package.json → `scripts/build-native-offline-page.ts`）會建目錄並產生殼內離線頁
`offline.html`（#1225，`server.errorPath` 指向它）。

sync 完順手確認離線頁有落地——它只有在真機斷網冷啟動時才讀得到，缺檔沒有任何報錯：

```bash
ls -l ios/App/App/public/offline.html android/app/src/main/assets/public/offline.html
```

`cap sync` **不會**改動已 commit 的 `ios/App/CapApp-SPM/Package.swift`（實測 byte-identical），
所以這步不會洗掉 patch 需求。

若 `node_modules` 是新裝的，確認 patch 有套上（[§G](../../../docs/app-store-submission-runbook.md#g-capacitor-8--apple-sign-in-的-spm-衝突)）：

```bash
npm ci 2>&1 | grep -i 'apple-sign-in'   # 要看到 patch-package 套用成功那行
```

`postinstall` 是 `patch-package || exit 0`（fail-soft，避免炸掉 Vercel 的 web 部署），
所以 patch 失敗**不會**讓 install 非零退出——必須自己看輸出，或等 SPM 解析大聲報錯。

### 2. 版本計數 +1

[§E](../../../docs/app-store-submission-runbook.md#e-版本號規則策略-a純單調計數器) 策略 A：純單調計數器，與 semver 脫鉤。
**每次上傳商店（含被拒重送、只改 metadata 的重送、TestFlight 每次傳）就 +1，永不歸零。**

**iOS** — `ios/App/App.xcodeproj/project.pbxproj`，`CURRENT_PROJECT_VERSION` 在 **Debug + Release 兩處**都要改：

```bash
grep -n 'CURRENT_PROJECT_VERSION\|MARKETING_VERSION' ios/App/App.xcodeproj/project.pbxproj
# 應該各看到兩行；改完再 grep 一次確認兩處同值
```

**Android** — `android/app/build.gradle` 的 `versionCode`（單一處，附有同義註解）：

```bash
grep -n 'versionCode\|versionName' android/app/build.gradle
```

`versionCode` 嚴格遞增即可（上限 2,100,000,000），沿用 `105011 → 105012 → …` 的序列，
**不要**回去用舊的 `M·mm·pp·b` 語意編碼（build 段只有 1 位、第 10 次重送會溢位）。

> 沒有自動 bump 工具，`release` skill 只動 `package.json`。這步手動做，
> 但 **archive / `bundleRelease` 之前一定要先做完**——先 build 再 bump 等於白 build 一次。

### 3A. iOS：archive → export → upload

兩把 ASC key 分工，**不要弄混**（[§H](../../../docs/app-store-submission-runbook.md#h-app-store-connect-api-key)）：

| Key ID | 角色 | 用在哪一步 |
|---|---|---|
| `795L42Z42U` | **管理（Admin）** | `xcodebuild -exportArchive` 的**雲端簽章** |
| `LRB54C7D5X` | App 管理 | `xcrun altool --validate-app` / `--upload-app` |

本團隊的 distribution 憑證是 Apple 雲端託管型（Portal 顯示 `Distribution Managed`），
本機 keychain 沒有私鑰，export 必須走雲端簽章，而雲端簽章要求 key 有 Admin 角色。
用 App 管理 key 跑 export 會得到誤導性的 `No signing certificate "iOS Distribution" found`
（底層其實是 Apple 回 403「未獲授權存取雲端託管的發佈憑證」）。

`.p8` 在 `~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8`；Issuer ID 在使用者的密碼管理器，
**沒有就停下來問，不要猜**。Team ID `W64689HV8B`、Bundle ID `dev.southernlight.futari`。

```bash
T=$(mktemp -d)

# 1) archive
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$T/App.xcarchive" archive \
  -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_795L42Z42U.p8 \
  -authenticationKeyID 795L42Z42U -authenticationKeyIssuerID <ISSUER>

# 2) export（用 Admin key）
cat > "$T/ExportOptions.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>W64689HV8B</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
EOF
xcodebuild -exportArchive -archivePath "$T/App.xcarchive" -exportPath "$T/export" \
  -exportOptionsPlist "$T/ExportOptions.plist" -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_795L42Z42U.p8 \
  -authenticationKeyID 795L42Z42U -authenticationKeyIssuerID <ISSUER>
```

export 完先驗版本號，再**停下來給使用者確認**：

```bash
unzip -p "$T/export/App.ipa" 'Payload/App.app/Info.plist' \
  | plutil -extract CFBundleShortVersionString raw - ; \
unzip -p "$T/export/App.ipa" 'Payload/App.app/Info.plist' \
  | plutil -extract CFBundleVersion raw -
```

確認後才跑上傳（**這步需要使用者明講**）：

```bash
xcrun altool --validate-app -f "$T/export/App.ipa" -t ios \
  --apiKey LRB54C7D5X --apiIssuer <ISSUER>
xcrun altool --upload-app  -f "$T/export/App.ipa" -t ios \
  --apiKey LRB54C7D5X --apiIssuer <ISSUER>
```

> **不想留 Admin key 的替代路**（runbook §H）：改用 Xcode GUI 的 Distribute App（走帳戶持有人登入身分，
> 不需 API key），或在本機建一張真正的 Apple Distribution 憑證讓 export 在本機簽。
> `795L42Z42U` **不能上傳完就撤銷**——雲端簽章是每次 export 都要。

### 3B. Android：bundleRelease + 簽章驗證

```bash
# 簽章參數由 build.gradle 從環境變數讀取；值在 repo 根目錄 .env（gitignored）
set -a; . ./.env; set +a

# ⚠️ 用 Android Studio 內附 JBR（現為 JDK 25）。Capacitor 8 要求 ≥ 21；上限由 Gradle 決定
# （Java 25 需 Gradle 9.1+；本專案 Gradle 9.5.1 / AGP 9.2.1，#1207）。
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

cd android && ./gradlew bundleRelease
# 產物：android/app/build/outputs/bundle/release/app-release.aab
```

`.env` 要有 `KEYSTORE_PATH` / `KEYSTORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD`
（store 與 key 同值）。**缺變數時 gradle 不會失敗**——`build.gradle` 對密碼有 `?: ""` fallback，
會產出簽不掉或簽錯的 AAB，所以下面的驗證不能跳過：

```bash
AAB=android/app/build/outputs/bundle/release/app-release.aab
# 用 JBR 的工具：PATH 上的 jarsigner / keytool 可能是 macOS stub（回 "Unable to locate a Java Runtime"）
"$JAVA_HOME/bin/jarsigner" -verify "$AAB"                         # 要回 "jar verified."
"$JAVA_HOME/bin/keytool" -printcert -jarfile "$AAB" | grep SHA256
# 應等於 upload key 指紋：
# 9D:4A:6F:DF:47:F7:90:8F:CA:63:61:43:0A:B7:2B:4A:19:D2:F9:F0:4B:DA:81:55:F0:90:0B:91:60:96:7F:03
```

指紋對上、`versionCode` 確認過之後，**把 AAB 路徑交給使用者自己上傳 Play Console**
（或經明確同意後代傳）。

> ⚠️ Upload keystore 在 `~/futari-release.keystore`（alias `futari`，效期至 2053-12）。
> 2026-08-06 重建過一次，因為原本的密碼從未寫進任何檔案。
> **「重建零代價」的窗口在首次送出 Production 後就關閉**——之後遺失只能走 Google 的
> upload key reset 流程。密碼存密碼管理器，keystore 檔另外備份。

### 4. 收尾 checklist（印給使用者）

```
實機 / TestFlight 驗證（iOS 上傳後必做）
  □ 原生 Apple 登入 sheet 真的彈出來（不是 web OAuth 轉頁）
    ※ 1.5.5(2) 從建檔起就缺 com.apple.developer.applesignin，
      原生 Apple 登入在任何 TestFlight/App Store build 上從未可用
  □ Push 實際收到（真實 device token 才驗得到；Edge Function 跑通不等於送達）
  □ 鍵盤行為：彈出 / 收起不把 webview 擠壞，輸入框不被遮住
  □ 主流程走一遍：登入 → 記一筆 → 看 dashboard

時效
  □ 這顆 build 的 90 天到期日：<上傳日 + 90 天>
  □ metadata 沒填完就別放著等——過期的 build 不能送審，只能重傳

後續（依平台）
  iOS  □ ASC 該版本的 build 選這顆 → 檢查上架資料實況（用 API 或 Console 看，不信文件勾選）
       □ 出口合規：build 的 usesNonExemptEncryption 若為 null 是 blocker，
         可 PATCH /v1/builds/{id} 補 false，不需重 build
       □ Add for Review → Submit
  Play □ 上傳 AAB 到對應軌道
       □ 正式版權限條件：封閉測試 ≥12 人 × 連續 14 天（未滿足時按鈕是灰的）

版本計數已 +1：iOS CURRENT_PROJECT_VERSION=<n> / Android versionCode=<n>
（記得 commit 這個 bump）
```

---

## Gotchas

| 症狀 | 原因 | 解 |
|---|---|---|
| `The file "public" / "config.xml" / "capacitor.config.json" couldn't be opened` | 乾淨 checkout / 新 worktree 沒跑 `cap sync`；這些是 gitignored 的產物 | `npx cap sync ios` |
| 真機斷網冷啟動看到空白畫面／系統錯誤頁 | 殼裡缺 `public/offline.html`（`server.errorPath` 的目標），通常是繞過 `cap copy` 手動塞檔 | 重跑 `npx cap sync`，確認 hook 有輸出 `[native-offline-page] wrote out/offline.html` |
| `Failed to resolve dependencies ... 'apple-sign-in' depends on capacitor-swift-pm 7.0.0..<8.0.0 and 'push-notifications' depends on 8.0.0..<9.0.0` | `@capacitor-community/apple-sign-in` 停在 7.1.0，宣告 `from: "7.0.0"`；`CapApp-SPM/Package.swift` pin `exact: "8.3.4"` | `patches/@capacitor-community+apple-sign-in+7.1.0.patch` 放寬到 `<"9.0.0"`。patch 沒套上就重跑 `npm ci` 並確認輸出 |
| `exportArchive Cloud signing permission error` / `No signing certificate "iOS Distribution" found` | 用了 App 管理角色的 key 跑 export；雲端簽章要 Admin | 換 `795L42Z42U`。ASC 的 key 建立後權限**不能改**，只能另建一把 |
| `invalid source release: 21` | PATH 上的 JDK 比 21 舊 | `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` |
| `BUG! exception in phase 'semantic analysis' ... Unsupported class file major version 69`（或 70…） | JBR 隨 Android Studio 更新漂到比 Gradle 支援的還新（69 = Java 25 需 Gradle 9.1+、70 = Java 26 需 9.4+） | 升 `android/gradle/wrapper/gradle-wrapper.properties`（連帶 AGP），見 #1207；不要另裝舊 JDK |
| `getDefaultProguardFile('proguard-android.txt') is no longer supported`（出錯的是 `:capacitor-community-apple-sign-in`） | apple-sign-in 的 Android patch 沒套上。常見於 #1207 之前就裝好的 `node_modules`：對已套過舊 patch 的目錄套新 patch 會失敗，而 postinstall 是 `patch-package \|\| exit 0`，npm 不會報錯 | `rm -rf node_modules && npm ci`，確認輸出有 `@capacitor-community/apple-sign-in@7.1.0 ✔` |
| patch-package 重產的 patch 多出幾百行 `android/build/**` 二進位 | Gradle 把 plugin 的 build 產物寫進 `node_modules/<plugin>/android/build/`，patch-package 會一起收 | 重產前 `rm -rf node_modules/<plugin>/android/build`，產完 `grep '^diff --git' patches/*.patch` 確認只有預期檔案 |
| AAB 出來了但 `jarsigner -verify` 不過 | `.env` 沒 source 進來；`build.gradle` 的密碼有 `?: ""` fallback，不會讓 build 失敗 | `set -a; . ./.env; set +a` 後重跑 |
| ASC 回「build number 已存在」 | 同一 `MARKETING_VERSION` 下 build number 必須唯一遞增，TestFlight 也吃這規則 | 計數再 +1 重傳。**不要**改 `MARKETING_VERSION` 繞過 |
| 要送審時發現版本沒有可用的 build | TestFlight build 90 天過期（1.5.1(1) 踩過：06-11 傳、09-09 過期、09-10 要送審） | 重新 archive 上傳；之後別提早卡位 |
| 升 Capacitor 後 iOS 整個編不起來 | 薄殼平常不 build iOS，衝突會潛伏到下次送審（Cap 8 升級 2026-07-12，2026-09-10 才炸） | **升 Capacitor 大版本後立刻實跑一次 archive** |

### 改動 SPM / patch 後的驗收（缺一不可）

不做對照組會誤把「本機殘留的手改」當成修好了：

```bash
# 1. clean room — 不能靠既有 node_modules
rm -rf node_modules && npm ci        # 輸出要有 patch-package 套用 apple-sign-in 的成功行
npx cap sync ios

# 2. archive 要從全新的 SPM 解析開始，不能吃快取
#    （Package.resolved 已 pin 8.3.4，不指定新目錄就會重用舊解析結果）
T=$(mktemp -d)
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$T/dd" -clonedSourcePackagesDirPath "$T/spm" \
  -archivePath "$T/a.xcarchive" archive CODE_SIGNING_ALLOWED=NO

# 3. 對照組：把 node_modules 的 Package.swift 還原成 from: "7.0.0"，同樣全新目錄再跑
#    必須失敗於依賴解析 —— 這才證明步驟 2 的成功來自 patch 而非快取
```

`CODE_SIGNING_ALLOWED=NO` 只用於這種「編得起來嗎」的驗收；真正要上傳的 archive 不能帶這個參數。

---

## 不歸這份 skill 管

- **上架素材與商店資料**（截圖、描述、App Privacy、內容分級、Data safety）→ runbook §A6 / §B4 / §I
- **審核風險與 Review Notes 模板** → runbook §D
- **用 ASC API 填表的實作細節與坑** → runbook §I
- **web semver / CHANGELOG / tag** → `release` skill（`.claude/skills/release/`，PR #987）
