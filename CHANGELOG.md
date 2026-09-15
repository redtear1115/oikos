# Changelog

All notable changes to Oikos (Futari) are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

每版分兩小節：
- **使用者可見變化** — 使用者實際感知到的功能 / 修正，一句話、不寫技術細節
- **技術變更** — 技術決定、重構、schema migration、breaking change（沒有的話省略）

> **本檔從 1.0.0 起算。** v0.1.0 – v0.17.6（37 個版本）只保留在 git tag，沒有
> changelog 條目。`docs/superpowers/specs/` 有 21 份 spec 的 `first_shipped_in`
> 指向這段區間——查不到條目是正常的，不代表 spec 過期，用
> `git show <tag>` 或 `git log v0.17.6` 追。

---

## [Unreleased]

### 使用者可見變化

- **沒網路時打開 App，會看到 Futari 的離線頁而不是空白畫面（#1225）**：原生殼只是載入線上網站的 WebView，所以沒網路冷啟動時連第一個 byte 都拿不到——使用者看到的是系統的 WebView 錯誤頁或整片空白，沒有任何提示說「需要連線」。現在殼裡打包了一份離線頁（`server.errorPath`），載入失敗時改顯示它：暖色底、一句「現在沒有網路」、一個回到 App 的按鈕，四語依裝置語系顯示。

### 技術變更

- `capacitor.config.ts` 設 `server.errorPath: 'offline.html'`。離線頁由 `scripts/build-native-offline-page.ts` 產生，掛在 Capacitor 的 `capacitor:copy:before` hook——`cap copy` 每次都會砍掉重建原生的 `public/`，所以檔案必須「每次 copy 之前重新產生」，而不是「存在一次」。`out/` 因此不再需要手動 `mkdir`（CLAUDE.md / runbook / ship-native skill 的指令已更新）。
- 文案來源仍是 `lib/i18n/locales/*.ts › nativeOfflinePage`，四語同步由 `Translations` interface 的 type check 把關；產生器把四語全部烤進同一份靜態 HTML，inline script 依 `navigator.language` 選一份。離線頁的 origin（`capacitor://localhost` / `https://localhost`）與網站不同，讀不到使用者在 app 裡選的語言，裝置語系是唯一可用的訊號。
- `tsconfig.json` 開啟 `allowImportingTsExtensions`：產生器直接用 Node 原生 type stripping 執行 `.ts`，Node 的 ESM resolver 需要完整副檔名。
- native-smoke workflow 在 `cap sync` 後明確檢查 `offline.html` 有沒有進到 iOS / Android bundle——這個檔缺席不會讓任何 build 變紅。
- ⚠️ 動到 `capacitor.config.ts` → iOS / Android 都要重送商店。依 #1225 與 #1207（PR #1209）合併送審，只送一次。
### 技術變更

- **Android 工具鏈升到 Gradle 9.5.1 / AGP 9.2.1，恢復在 JDK 25 上建置（#1207）**：Android Studio 內附 JBR 漂到 JDK 25 後，Gradle 8.14.3 連 build script 都編不起來（`Unsupported class file major version 69`），原生包打不出來。AGP 9 移除了 `proguard-android.txt`，app 與 `@capacitor-community/apple-sign-in` 改用 `proguard-android-optimize.txt`（後者經既有 patch 延伸，順手把已棄用的 `lintOptions` 換成 `lint`——9.2.1 下舊寫法仍可建置，不是必要改動）。merge 後既有 checkout 要 `rm -rf node_modules && npm ci`：對已套過舊 patch 的 `node_modules` 套新 patch 會失敗，而 postinstall 是 fail-soft，症狀是 build 撞 `proguard-android.txt is no longer supported`。未升 `@capacitor/*`，iOS SPM 的 8.3.4 pin 不受影響。同時撤回 CLAUDE.md 裡「JDK 25 + Gradle 8.14.3 實測可建置」的錯誤敘述。

## [1.5.14] - 2026-09-15

主題：**看起來正常，不等於成立**——這一版把一批「畫面沒破、測試全綠、review 會過」的東西成批打開來看：對外宣稱的端對端加密其實是 server 持鑰的欄位級加密、四個 CSS 變數從來沒有定義過、關起來的 sheet 一直待在 Tab 順序裡、五張理念卡只有中文。每一項的共同點都是它不會報錯，所以沒有人回報過。
完整 diff：[v1.5.13...v1.5.14](https://github.com/redtear1115/oikos/compare/v1.5.13...v1.5.14)

### 使用者可見變化

- **更正對外的加密與隱私宣稱（#1191）**：landing、登入頁、搬家指南、情境頁、SEO 描述、FAQ 結構化資料，以及「資料安全」頁與邀請／首次設定流程裡的承諾卡，原本寫「端對端加密」「連我們自己也讀不到內容」「伺服器不解密」「沒有人能看見」「每一筆紀錄我們都備份保管」。這些宣稱不成立：加密是 server 持鑰的欄位級靜態加密，只涵蓋寶寶本名、身分證字號、健保卡號、車牌、房屋地址等少數機敏欄位，帳本主體（金額、說明、分類）沒有應用層加密；備份沒有可佐證的依據。新說法只寫成立的部分：帳本只開放給你們倆（群組成員的存取權限）、連線以 HTTPS 加密、機敏欄位加密後保存；承諾卡的備份句改為「只要帳號還在，你們記下的每一筆都會留在這裡」。搬家指南比較表刪除「端對端資料加密」一列（Honeydue / Moneybook / Manebo）。隱私權政策原本的描述正確，未更動。⚠️ 商店的「完整說明」欄位還留著舊條目，要人工同步；整合階段另外發現隱私權頁與條款有三處宣稱與實作不符，已交給 #1251。

- **關起來的 sheet 不再能被 Tab 走進去，登出確認框也不再開在畫面外（#1176 #1204）**：`SheetFrame` 關閉時只是滑出畫面，面板本身一直掛著，而且永遠帶著 `role="dialog"` / `aria-modal`——9 個 sheet（含記帳 sheet）在關著的狀態下，按鍵盤仍然走得進去，螢幕閱讀器也會把它當成一個開著的對話框。另一半是確認框：`ConfirmModal` 原本渲染在 sheet 面板裡，而面板帶 `transform`，`position: fixed` 的定位基準就被換成面板而不是畫面——實測按下「登出」時，確認框落在 y=1141，畫面上什麼都沒出現，焦點卻已經移進去了，使用者只看得到 sheet 突然不能操作。現在關閉的面板改掛 `inert`（對話框語義也只在開啟時才加），確認框改用 portal 掛到 `<body>`。⚠️ iOS 15.0–15.4 的 WebView 不支援 `inert`，在那些機器上會退回修正前的行為，不會更糟。

- **關掉 sheet 之後，焦點回到打開它的那顆按鈕（#1230 #1256 #1242）**：原本按 Escape 關掉記帳 sheet，焦點會掉回 `<body>`，下一次 Tab 要從頁首整頁重來。根因有兩層：`useFocusAndSelectOnOpen` 是 layout effect、比 focus trap 早跑，trap 記下的「要還給誰」其實是 sheet 自己的金額欄位（#1230）；更前面一層是 dashboard 把 FAB 寫成 `{!hideFab && …}`，開 sheet 的那一次 commit 直接把帶著焦點的 FAB 從畫面上移除，瀏覽器同步把焦點推到 `<body>`，所以 trap 從一開始就沒記到任何按鈕（#1256）。這個形狀在 records / trips / assets / recurring 都一樣。現在 FAB 兩種變體都帶固定 id，關閉時若原來的節點已經不在，就用 id 重新找回來。**這個 bug 特別難從測試看出來**：`<body>.isConnected` 是 true，還原程式走的是「成功還原」那條路，沒有任何錯誤、截圖也完全正常，只有鍵盤使用者每關一次 sheet 就被丟回頁首一次。⚠️ 真瀏覽器的 FAB → Esc → 焦點落點仍未實跑，jsdom 證得了邏輯、證不了真引擎的卸載時機。

- **螢幕閱讀器現在讀得到選取狀態、欄位名稱與錯誤（#1186 #1172 #1189 #1182 #1178 #1197 #1177 #1165）**：先前有一整批控制項的「選中」只用顏色表示——記帳 sheet 的付款人開關、已結清／待確認、定期收支的收款人與週期、分攤方式，讀出來全都是一樣的一句話；記帳 sheet 的旅行與幣別兩個下拉、分攤比例滑桿、被保人欄位、匯入的分類下拉、旅行的匯率輸入框則根本沒有名稱。同一批還有錯誤訊息不會被播報（結算、待確認卡、feed 載入失敗、匯入送出失敗、記帳 sheet 的驗證錯誤），以及整頁沒有 `<h1>`（dashboard、/records、/assets、/settings、/onboarding、定期收支）。破壞性流程（離開帳本、移除對方）先前完全沒有處理焦點：打開後焦點留在背景頁面，換步驟時原本聚焦的按鈕被卸載、焦點掉到 `<body>`，關閉後也不會還原。另外，記帳 sheet 的錯誤橫幅從畫面頂端移到 sheet 頂端了（**這是看得到的位置變化**），因為它原本渲染在對話框外面，讀屏在對話框內時聽不到它。

- **分段選擇器可以用方向鍵移動了（#1242）**：付款人、記帳狀態、分攤方式、定期收款人、幣別設定這六組單選控制項，先前只能一個一個 Tab 過去；現在整組是一個 Tab 停留點，左右上下鍵在選項之間循環，選取跟著焦點走。設定頁那兩組選了之後會立刻存檔，原本存檔中整組會 `disabled`、剛移過去的焦點會掉，改成存檔中只擋操作、不拿掉焦點。分攤方式那組還有一個獨立的問題：`weighted` 模式下整組沒有任何 Tab 停留點，鍵盤根本進不去。

- **表單填到一半誤觸背景，內容不會再靜默消失（#1183）**：20 個表單 sheet 先前只要點到背景、按 Escape 或按 Android 返回鍵，已經打好的內容就直接丟掉，沒有任何詢問——保險 sheet 有 15 個欄位。現在 15 個表單 sheet（記帳、收入、結算、定期規則、加油、旅行、車／小孩／房子／保險／寵物／植物／模板、留言編輯）在內容有異動時會先問一次，可以選「繼續填寫」或「捨棄」；改了又改回原值視為沒改。**取消鍵仍然直接關閉，不會詢問**——按下取消本身就是一個明確的決定，這是刻意選的最不打擾的做法。不是表單的 sheet（篩選、頭像選單、安裝指引、愛物選擇器）行為完全不變。⚠️ Android 返回鍵這條路徑只在 jsdom 用假的 CloseWatcher 驗過，真機未測。

- **非中文使用者終於看得懂 onboarding 與首次設定（#1163 #1166 #1205）**：`/onboarding` 的五張理念卡完全沒接 i18n——en / ja / zh-CN 使用者一路看到五張繁體中文卡片，而且那個頁面的 CJK 字型鏈是斷的，日文會拿到中文字形。`/setup` 第一步（幫家計簿取名）同樣整段硬編繁中，四語都沒有對應的 key，唯一那個輸入框也沒有可及名稱；建立失敗時還會把 server 的繁中錯誤直接透出來。現在兩處都是四語，建議的帳本名稱是各語言各挑一組、不是直譯。同一批修掉 Android 殼上「跳過」被狀態列蓋住的問題（#1205）——`/onboarding` 在 dashboard shell 外面，先前那顆按鈕寫死 `top: 16`，完全沒有讀 safe-area inset。

- **app 內剩下的硬編繁中補齊（#1173 #1182 #1189 #1178 #1177）**：`/assets` 有 33 個硬編字串，加油記錄 sheet 大約四分之三沒有翻譯；旅行詳情頁有四個硬編繁中（返回鍵與它的 aria-label、進行中的日期行、已結束標籤）——**那四個 key 早就在四語字典裡、全部非空、zh-TW 還逐字元相同**，只是沒接上；匯入流程跳過了全 app 都在用的分類字典，從別的 App 搬過來的人會在對應與預覽兩個步驟看到中文分類名，匯入歷史的來源名稱也是原始 id；定期收入的分類名稱同樣硬編。月回顧則有三個各自獨立的問題：揭曉卡把題目的內部識別字原樣印出來（`· big_purchase`）、en 介面的標題渲染成「9 2026」（模板缺月份名稱）、輪播用鍵盤到不了第 2–4 張卡（捲動容器不可聚焦，而且原本的 live region 所有子元素都是 `aria-hidden`，換卡時什麼都不會念）。

- **搬家比較表用讀者看得懂的語言寫（#1185 #1188）**：`/migrate/[source]` 的比較表原本 210 個中文字串全部不翻，包括「介面語言：✓ 中英日四語」那一列——用中文向日文讀者宣稱自己支援日文。現在劃出一條線：`✓` / `✕` 這類看 glyph 就讀得出答案的短標籤維持不翻，`△` 格（後面那句條件才是重點，共 34 格）、「未說明」、以及介面語言那整列都收進四語字典，型別擋住之後新增的 source 不可能再放進一個只有中文的 `△` 格。use-case 頁的情境名稱先前有第二份硬編對照表，14 組名稱和主字典對不上，已刪除改讀同一份。

- **操作失敗時的錯誤訊息跟著介面語言（#1156）**：16 個 server action 檔約 116 條錯誤訊息是寫死的繁體中文，而 `describeError` 在訊息非空時直接原樣輸出——en / ja / zh-CN 使用者操作失敗時一律看到繁中，沒有錯誤、沒有 fallback，連 i18n 的 key 對齊測試也抓不到（那些字串根本不在 locale 檔裡）。現在 action 改丟錯誤代碼，82 條訊息在四語都有句子。**誠實揭露兩件事**：(1) Next.js 的 production build 會把 server action 丟出的 `Error.message` 換成 digest（以同版本 next 做最小重現實測過：client 收到的是固定的通用句子加一個 digest，代碼不在回應裡），所以 **prod 目前實際顯示的多半仍是各處的通用訊息**（例如「發生錯誤」），具體那句要等 action 改成回傳 `{ ok: false, code }`，記在 #1223；(2) `lib/validators.ts` 那約 96 條還沒代碼化的訊息，現在對 zh-TW 使用者也會退成通用訊息——原本看得到「名稱最長 32 字」，現在看到「發生錯誤」。這是刻意的取捨（使用者語系的通用訊息 > 別人語系的具體訊息），多數欄位 client 端已先擋過。

- **/records 的月份標題不再隨著「載入更多」跳動（#1208）**：每個月份標題的「N 筆 · NT$X」原本是把**已經載進來的那幾列**在前端加總，每按一次載入更多數字就變一次，在載完之前跟統計卡也對不上；標題只有一個金額，也沒說那是支出還是收入。現在三個分頁都由 server 按月聚合，標題寫成「12 筆 · 支出 NT$8,400」，全部分頁則兩者並列、為 0 的那段省略。連帶修掉一件更早的事：月份分組原本用 UTC 切，**台北時間每月 1 號 00:00–08:00 記下的紀錄會被分到上個月**——這個分組同時用在 dashboard 與愛物頁，所以那兩處的分組也跟著修正。

- **斷線的時候每個人都看得到提示（#1206）**：使用中斷線的提示原本只對開啟「離線瀏覽」的人顯示。當時只有一句文案（「離線中・顯示最近一次連線的資料」），那句話對沒有快取的人是假的，所以用開關擋掉——在只有一種文案的前提下是合理解，代價是開關預設關閉，等於幾乎所有人斷線時什麼提示都沒有，要到送出記帳失敗才知道。現在只要瀏覽器判定離線就顯示，開關只決定文案（沒開的人看到「離線中・恢復連線後會自動更新」，不提快取）。⚠️ 目前這條提示只掛在 dashboard，其他頁面斷線仍然沒有提示；殼內切飛航模式的實測還沒做，冷啟動就沒網路的情況另外記在 #1225。

- **底部導覽不再在十條路由上亮錯一顆（#1181 #1180）**：判斷當前分頁的程式對 `/assets` 用前綴比對、隔兩行對 `/settings` 卻用完全相等，其餘一律回「首頁」——所以在 `/settings/*`、`/trips`、`/review/[month]`、`/coming-soon` 等大約十條路由上，底部導覽都高亮「首頁」，`aria-current="page"` 也跟著，螢幕閱讀器會在使用者明明在設定子頁時念出「首頁，目前頁面」。**這是看得到的變化**：那些路由現在是四顆都不亮。同一批把導覽圖示寫死的 `#B89C8B`（約 2.6:1，門檻 3:1）換成上一行就已經算好的 token——那個 hex 正是 WCAG 修正前的舊值。

- **一批小控制項的點擊區補到 44px（#1227 #1169 #1174 #1197 #1186 #1189 #1172 #1177）**：/records 的兩個清除鍵只有 20×20 與 24×24；愛物頁大約 30 個控制項不到 44px，其中機敏欄位的清除鍵只有 24px；設定頁破壞性流程的 ✕ 只有 14×20；記帳 sheet 的分類 chip、付款人分段、狀態分段，結算金額 chip、待確認卡三顆按鈕、旅行橫幅的小圓鈕、月回顧橫幅；旅行 sheet 的七個輸入框只有 38–42px；共用的開關軌道 44×26。做法一律是加一層透明的擴張區，**外觀、間距、版面都沒有變**，只是可按的範圍變大。順帶修掉一個更隱蔽的：/records 與 dashboard 的橫向捲動列會在邊界裁掉往上延伸的點擊區，所以那些 chip 先前實際只有約 38px——`MonthSwitcher` 早就有的擴張也一直吃這個虧。⚠️ 全部只驗證了樣式，沒有在真機上實際點過邊緣。剩下兩個沒到 44px 的（記帳 sheet 的「恢復預設」、愛物切換器的觸發鍵）要動版面才做得到，留著。

- **讀不清楚的文字與根本沒畫出來的框（#1168 #1184 #1197 #1196 #1199）**：`--debit` 當文字色只有約 2.7:1，`globals.css` 自己就記著這件事，為此而生的 `--debit-text` 卻只擴散到 2 個站點；剩下 20 個全部是錯誤訊息——使用者最需要讀懂的那一刻。結算送出鍵的白字壓在 ember 上是 2.68:1（比上述任何一處都糟），改成 ink 底之後是 14.52:1，順帶解掉它和 FAB 在同一個畫面上撞色的問題。`--ink-3` 在 committed 底色上是 4.03:1（在一般底色上是 4.66:1，所以成敗取決於底色），逐點審計後在 privacy / terms / migrate / sign-in 共 9 處改成 `--ink-2`；落在白卡裡的維持不動。另外四個變數**從來沒有被定義過**，而 CSS 遇到未定義變數是整條宣告靜默作廢：房子 sheet 的地址／購入日期／購入價格三個輸入框**完全沒有邊框**、待確認金額退回繼承的 16px（和八行之上的標題一樣大）、愛物 sheet 的錯誤訊息渲染成色票外的飽和警報紅、問答的一個字級停在已經廢除的 15px。

- **字重收斂到 400 / 500，金額維持 600（#1167）**：26 個站點在請求一個**沒有載入的字重**。文字字型（Noto Sans TC、Fraunces）只出貨 400 和 500，請求 600 的地方會落回 500，或在某些平台上由瀏覽器合成假粗體——其中 12 個是選取狀態指示，也就是「選中」和「沒選中」很可能根本看起來一樣。19 個站點改成 500，並關掉合成粗體（只關字重合成，不關字形斜體合成，否則 migrate / use-case 的四處斜體會變成正體）。**金額維持 600**：金額用的是系統數字字族，它真的有 Semibold。看得到的差異：底部導覽選中態、/records 支出／收入切換、結算摘要卡的筆數與名字，都從 600 變成 500。⚠️ 這幾處靠顏色與底色辨識是否足夠，尚未在真機上看過。

- **Landing 與登入頁的一輪收斂（#1148 #1149 #1150 #1151 #1152 #1153 #1154 #1158 #1159 #1160 #1161 #1164）**：Landing 的九個字級跑在型別階梯之外（28 / 36 / 24 三階並不存在），壓回既有階梯之後，桌機的 features 標題從 36 降到 26、Trust 敘事句從 34 降到 26，features 與 use-case / migrate 三個區段標題變成一樣大；整頁的 `transition-colors` 是空轉的，沒有任何 hover / 按壓回饋，現在深色 CTA、文字連結、migrate 卡片、use-case 條目各有自己的回饋，觸控裝置走 `active:`；use-case 與 migrate 兩排卡片原本逐字元相同的視覺文法也分開了（use-case 改成上緣細線的條目，migrate 維持並列的卡片）。手機示意圖先前沒有標成裝飾，**螢幕閱讀器會把裡面的假帳本「NT$ 1,240」和三筆假交易當成頁面內容朗讀**。登入頁把 40 多處 inline 樣式換成 token、17 / 19px 的字級壓回階梯、標題順序改成 h1 先於 h2（Tab 也跟著先到登入按鈕）、兩個硬編英文的 aria-label 改成四語，登入按鈕高度 48 → 52px（**看得到 4px 的變化**）、圓角改成系統值；日文的 tagline 原本用了「始めましょう」這種轉換語言，違反登入頁的寫作規則。Apple 按鈕的 `#000` 不是違規，是 Apple HIG 強制的，已經就地加註解——那一條在每一輪設計審查都會被重新誤判一次。

- **文案把接下來會發生什麼說清楚（#1187 #1190）**：定期收支的規則列表依「下次執行日」排序，卻不顯示那個日期（翻譯早就存在，只是沒接上）；刪除一條規則不說會帶走什麼，編輯一條規則不說何時生效。現在列表每一列顯示下次執行日（暫停中與已超過結束日的不顯示，因為那一期不會產生），刪除確認寫明「還沒處理的待確認卡片會一起移除，已經記下的紀錄會留著」，編輯時在 sheet 頂端說明「改動從下一期開始套用，已經出現的待確認卡片金額、日期與分攤維持原樣」。另外兩處：信任頁「匯出功能即將推出」的警語是過期字串（匯出自 v0.12.0 就出貨了），而且就渲染在一顆能用的匯出按鈕下方，四語一併刪除；`/settings/past-times` 補上一句說明翻過去的章節只看不改——那個立場先前完全沒有在介面上出現過。

### 技術變更

- **新增三道會在偏離時變紅的靜態測試（#1198 #1167）**：這一輪 sweep 反覆撞到同一類問題——**視覺 token 可以錯很久而看起來完全正常**，而現有工具鏈沒有一個抓得到：`tsc` 認為 `var(--anything)` 是合法 TypeScript；Tailwind 認為 `text-[var(--x)]` 是合法的 arbitrary value；ESLint 不看 CSS 變數；impeccable detector 只比對字面**數值**，`var()` 沒有數值可比；code review 看起來完全正確，因為它確實引用了一個 token。`tests/design-token-integrity.test.ts` 解析三個 CSS 檔的自訂屬性定義，掃描 `app/` 與 `components/` 每一個 `var(--x)` 引用並斷言它有定義，**沒有 fallback 的引用單獨斷言**（那是整條宣告作廢的情況）。它在當時的 main 上直接失敗，抓到 9 處、5 個未定義的 token，其中 `--border` 與 `--fs-md` 是驗收條件裡沒有寫、測試自己找到的。`tests/design-contrast.test.ts` 從色票解析三種值形式（hex、rgba 合成、遞迴解析 `color-mix`）算 WCAG 對比度並印出完整矩陣——因為印的是整張表，`--credit` 在任何底色上都不到 3:1 這件事自己浮了出來（`RevealScreen` 正拿它當文字色，已記在 #1199，需要產品決策，不要逕自改色）。三個已知不合格的配對寫成**斷言目前的比值**，而不是 skip 或 `it.fails`：skip 在正常輸出裡看不見，`it.fails` 讀起來像意外壞掉，而斷言文件記載的數字只會在有人真的去改它的那天變紅——那正是需要停下來重讀 issue 的時刻。`tests/font-weight-loaded.test.ts` 解析 `@font-face` 實際載入的字重集合，掃描全樹的字重請求；數字字族的 600 例外**用結構性判定而非行號白名單**（只有元素自己的 style 或 className 寫了 `font-numeric` 才算，繼承來的不算——測試追不到，讀元件的人也看不到），字重若是從變數算出來的會直接 FAIL 並標示「無法驗證」，不會默默放行。

- **焦點與對話框機制收斂成一套（#1176 #1204 #1230 #1256 #1242）**：`useFocusTrap` 補上 module-level stack（比照 `useEscapeToClose`），只有最上層的 trap 處理 Tab，層級依啟用順序決定、與 DOM 位置無關；下層比上層先卸載時（刪除確認同時關掉 sheet）會把還原目標交接下去，焦點才不會還原進一個已經關閉的面板。「要還給誰」的讀取從 passive effect 移到 layout effect，才會早於 sheet 自己的 focus-on-open；還原動作仍留在 passive cleanup——整個 trap 改成 layout effect 試過，會被 React commit 結尾自己的 focus/selection restore 蓋掉。還原時若記錄的節點已經斷開，改用 `id` 重新查（節點參照撐不過 remount，id 可以），查回來的節點若落在 `inert` 子樹內視為查不到，否則 `focus()` 在真引擎是 no-op、看起來像焦點憑空消失。`ConfirmModal` 改用 portal 掛到 `<body>`；**連帶的疊層行為變化**：先前渲染在面板內的消費點（登出、愛物刪除），backdrop 被困在 sheet 的 stacking context 裡、剛好蓋住 sheet，portal 之後 sheet 本身不會再變暗，這與另外五個原本就是兄弟節點的消費點行為一致。另外撤回一句註解：`DeleteConfirmFlow` 原本寫「Modal 透過 portal 掛載，所以它在 JSX 樹裡的位置無所謂」——當時 `ConfirmModal` 裡一個 `createPortal` 都沒有，而 JSX 位置正是「能動的巢狀案例」與「壞掉的兄弟案例」唯一的差別；那是最危險的一種過期註解，它明確授權了一個會靜默弄壞東西的改動。#1171 當初說「本專案的 JSX typing 沒有 `inert`」也不成立，`@types/react` 19.2.14 已經有了。

- **server action 錯誤改丟代碼（#1156）**：新增 `lib/action-errors.ts`（`actionError` / `isActionError` / `translateActionError`），沿用 `membership-errors.ts` / `quiz-errors.ts` 的形狀。代碼本身就是 `errors.actions.*` 的 key，所以「新增一條錯誤」等於「四個 locale 各加一個 key」，沒有第二個 switch 可以忘記；型別從 zh-TW 推導，丟一個沒有翻譯的代碼會讓 `tsc` 失敗。帶參數的訊息以 `code?row=3` 編進 message，因為跨 server → client 邊界只有 message 留得下來。`describeError` **不再回傳 `e.message`**，未知一律走 fallback。有一個會靜默失效的連帶要注意：記帳與收入 sheet 的競態處理原本比對**已經渲染的訊息**（`msg.includes('待確認支出')`），訊息在地化之後這個判斷在 en / ja 會安靜地失效（競態從「關 sheet + 提示」退成顯示一行錯誤），現在改成比對代碼。`tests/action-errors.test.ts` 有一條 guard：`actions/` 底下任何 `throw new Error(<中文字面值>)` 都會讓測試失敗。

- **/records 的月份聚合下沉到 server（#1208）**：三個分頁的分頁查詢把「決定哪些列會出現」的條件抽成共用 builder，分頁與新的聚合函式共用同一份，篩選 / 下鑽 / 日期範圍 / 章節的條件不會各算各的；月份一律以 Asia/Taipei 計。SSR 抓 feed 時平行算出全部分頁的聚合，另外兩個分頁由 client 取得，結果綁在 feed 的 remount key 上——不綁的話切分頁時新分頁的標題會先顯示舊分頁的數字，抓取失敗（離線）就一直錯下去。realtime 事件觸發時 debounce 300ms 重抓並忽略過期的回應。`groupByMonth` 從 UTC 改為 Asia/Taipei，這同時影響 dashboard 與愛物頁的分組。已用 dev DB 做等價性比對：八組條件下，把分頁載到底後前端加總的結果與聚合結果完全相符。

- **新增 `TextArea` primitive，19 個手寫輸入框遷移到 `TextInput`（#1194）**：canonical 的 `TextInput` 原本只有 5 個檔案在用，手寫 `<input>` 有 19 個（定期規則 sheet 兩者都做）。`TextInput` 改用 `ComponentPropsWithRef<'input'>` 讓 ref 直接指到 `<input>`，並補上 `inputClassName`（表單控制項不會從外層繼承字族屬性）。新的 `TextArea` 與 `TextInput` 共用同一組 token，**沒有新增任何 token**。遷移涵蓋旅行、加油、愛物、篩選、首次設定等 40 多個欄位，**有看得到的規格變化**：愛物 sheet 的名稱與車輛欄位從「無框的一行字」變成 44px 的輸入框、多處圓角 12 → 14px、字級 14 → 16px、旅行 sheet 的錯誤框從 `--debit` 改用 `--destructive`，所有輸入框現在都有一致的聚焦環。刻意沒動的：金額輸入、結算大數字、描述自動完成（combobox）、比例滑桿、檔案選擇、留言編輯器（它的 textarea 本來就在有框的卡片裡，再套一層會變成兩層框）。

- **DESIGN.md 的兩條規則與程式碼現況不符，已更正（#1157 #1162）**：Serif-Speaks Rule 原本寫「Fraunces 在 dashboard 完全不會載入，所以在那裡用它既偏離品牌、字型也不會到」。實際上 root layout 把 `font-fraunces` 掛在 `<html>` 上，全站都解析得到，dashboard 裡有二十多個檔案在用。**這條假規則失效的方式是安靜的**：一次設計審查照著它推出一個引用完整、看起來很有說服力的 P1（#1162）。Flat-By-Default Rule 原本宣稱系統裡只有三種陰影，實際有 22 個站點。兩條規則都改成描述現況並保留撤回紀錄——撤回本身留在文件裡，是因為下一個人很可能重新推導出同一個錯誤結論。新的規則明確區分「功能性微陰影」與「真的離開頁面平面的元素」（sheet / modal / popover / toast / FAB），並改寫判定方法：在正常流裡跟著鄰居一起捲動的東西不該有陰影，零模糊的 `0 0 0 Npx` 是邊框不是陰影。順帶把 `TextArea` 納入 primitive 清單（四 → 五）。兩份文件都用局部 Edit 完成，沒有跑全檔重寫。**留下兩個未決**：app 的 L1 標題與月份區段標題目前是 serif，而文件的 Page tier 寫的是 sans，兩邊都沒動；`/setup`、`/onboarding`、`/invite`、`/offline` 用了 serif，但它們不在品牌 surface 清單裡。

- **比較表的翻譯範圍寫進型別（#1185）**：`ComparisonCell` 的 `partial` 格 label 只接受 `{ i18n: key }`，放中文字串會讓 `tsc` 直接失敗，所以之後新增的 source 不可能再出現一個只有中文的 `△` 格；`migrate.comparisonText` 的型別是完整的 `Record`，任何一語缺 key 同樣編不過。zh-TW 的輸出與改動前逐字相同。`contentUpdatedAt` 的護欄改成 hash **解析後的四語比較表**——原本只 hash 中文字面值，之後只改譯文不會觸發，SEO 的更新日期會停在原地。發現但沒處理：比較表的 glyph 疊了兩次（`TONE_GLYPH` 加一次、label 字串自己帶一次），SSR 實際輸出是 `✓✓ 預設模式`，改動前就存在，值得另開一張票。

- **原生殼的登入可以在 localhost / Vercel preview 上走完（#1214）**：原生授權完成後，`SignInButton` 原本一律導回寫死的 prod origin，殼用 `CAP_SERVER_URL` 指向其他環境時會永遠停在「正在帶你進去」。改為導回殼當下的 origin；殼連 prod 時兩者相同，行為不變。

- **補上原生登入的兩個 open redirect（#1214）**：iOS 原生 Apple 登入的 `?next=` 與 Android deep link 的回跳路徑原本未驗證（例：`next=@evil.com/x` 會導去 `evil.com`）。新增 `lib/auth/nativeRedirect.ts`，比照 `/auth/callback` 的規則並要求同源；不相干的 deep link 直接忽略、不會中止進行中的登入。

- **新增 `ship-issue` skill，並記下連三批都踩到的 merge 陷阱（#1219 #1228 #1254）**：`.claude/skills/ship-issue/` 讓 main session 當協調者，把一張 issue 從讀題做到開好 PR，使用者只在三個關卡做選擇。批次驗證多條 PR 的段落是這一版現場學到的，其中最貴的一條：**修正 commit 如果在 PR merge 之後才 push，會被孤立在已經 merge 的 branch 上**——GitHub 不提示、PR 顯示 merged、branch 和 commit 都還在，但 main 少了那個修正，只看 PR 頁面看不出來。這一版連續發生三次（#1213 / #1216 / #1221 → #1224；#1245 / #1247 / #1248 → #1253），其中一次被孤立的剛好是使用者親自做的決定（「金額保留 600」），main 上金額全部變成 500，而且沒有任何測試會紅。所以除了用 `git merge-base --is-ancestor` 逐條查 ancestry，還要回頭 grep 那個決定本身。另外一條：pin SHA 要讀 `refs/heads/<branch>`，`refs/pull/<n>/head` 與 `gh pr view` 會延遲，差別是靜默的——你會很有把握地驗證並 pin 一個過期的 commit。

- **`/impeccable critique` 全站 sweep 收尾（#1146）**：38 個 surface 的批次審查，這一版關掉其中 46 張衍生 issue。第一批修正（#1175）曾因為落在 v1.5.13 切版邊界上被整批 revert（#1193，理由是時機不是品質），再以 revert-the-revert 的方式重新上線（#1203）——**直接重新 merge 原本那條 branch 是沒有用的**，git 會認為那些 commit 已經合併過而不重新套用，產生一個看起來成功、實際什麼都沒帶進來的 merge，沒有警告也沒有衝突。

## [1.5.13] - 2026-09-14

主題：**solo 不是等待狀態**——一個人記帳本來就是完整的用法。dashboard 上那塊位置不再放「邀請對方」，而是使用者自己的數字；設定裡不再有一排灰掉、等著另一個人來才能按的選項。同一版還撞出一批「宣稱與實際不符」的東西：一個從來沒生效過的字距 token、一個恆為 false 的旗標、一個從未送出過的埋點——它們都不會報錯。
完整 diff：[v1.5.12...v1.5.13](https://github.com/redtear1115/oikos/compare/v1.5.12...v1.5.13)

### 使用者可見變化

- **一個人記帳時，dashboard 上有自己的主畫面了（#1118）**：原本那塊位置放的是「邀請對方」的 banner，關掉之後只剩一行灰字，看不到任何金額。現在顯示當月總額與筆數；收入模式與雙人一樣。邀請功能維持在 設定 → 成員。
- **主動把對方移除之後，不再被告知「對方已離開」（#1121）**：在設定裡打完確認字串、親手移除對方的人，回到 dashboard 會看到一張標題寫著「{對方} 已離開」的卡片——使用者自己做的事，被講成發生在他身上的事。現在這個情況有自己的說法（「回到一個人」），也不提被移除者的名字。已知限制：這個判斷記在裝置本機，若在手機上移除、改用筆電開 dashboard，仍會看到舊的說法。
- **一個人記帳時，分攤設定不再是三個灰掉的選項（#1122）**：設定 → 分攤方式原本把三個選項全留在畫面上（包含「全部對方的」），一律看得見、按不動。現在只顯示「全部我的」這個實際生效的選項。旁邊的說明也從「邀請對方加入後可調整」改成陳述現況——對一個對方剛離開的人，前一句話讀起來像在要他等。匯入精靈裡那個標籤是「—」的付款人按鈕，同樣收成一行說明。
- **一個人的時候打開兩個人的問答，看到的話不一樣了（#1123）**：原本是「等對方加入家計簿，再回來吧」，而真正送到眼前的那句錯誤訊息其實是寫死的繁體中文，英文與日文介面也照樣顯示。現在四種語言各有各的說法，措辭也不再把「一個人」講成某件事之前的中途。同一批還拿掉了「{對方} 已離開」標題開頭的 `⟂`——那是一個數學符號，在部分 Android WebView 上會渲染成空白方塊。
- **兩個人的問答，錯誤訊息會跟著介面語言了（#1140）**：先前四種情況（已經答完、已經揭曉、找不到這次的問答、問答不屬於這個家計簿）不論介面設定成哪一種語言，一律顯示繁體中文。最常遇到的是兩台裝置或兩個分頁同時送出同一次作答。
- **用鍵盤瀏覽設定頁，不會再誤觸一顆看不見的「刪除帳號」（#1171）**：確認對話框在關閉狀態下並沒有離開畫面，只是被設成透明、且不接受滑鼠——而那不擋鍵盤。在設定頁一路 Tab，焦點會停在一顆看不見的按鈕上，按下 Enter 就直接送出帳號刪除並登出：沒有打開過任何對話框，沒有讀到後果說明，也沒有任何視覺回饋。擋在資料永久消失前面的只剩 server 端的 14 天寬限期。用螢幕閱讀器的人更早遇到麻煩——關閉狀態的對話框內容會被當成頁面內容唸出來，所以會聽到「刪除帳號」，並合理地以為那是頁面上的一個功能。
- **離開帳本與移除對方的確認視窗，✕ 不會再落在瀏海底下（#1124）**：這兩個流程的視窗沒有替 safe-area 留位置，在 Dynamic Island 機型加上大字級時，唯一的離開出口會被切掉一半或整個蓋住。同一批也替最後一步補上「上一步」——那是整個產品風險最高的一步，先前的退路只有那個可能碰不到的 ✕。同樣的失效在帳號刪除頁出過一次。
- **每月 1 號早上，dashboard 的月份標題不再指向上個月（#1130）**：月份是用伺服器所在時區算出來的，而伺服器跑 UTC——台北時間每月 1 號 00:00 到 08:00，當月收入與（一個人時的）當月支出兩塊都會標成上個月，連數字也是上個月的。中午過後會自己恢復，所以先前沒有任何一處看起來像壞掉。
- **釘在過去章節時，不再出現一個寫著當月、金額為 0 的標題（#1131）**：一個人記帳時，把畫面釘到已經結束的章節，上方會顯示「{本月} · NT$ 0 · 0 筆」——那個月份根本不在該章節的範圍裡。過去章節是唯讀的回顧，現在這個位置留白，章節脈絡由上方的章節列說明。
- **表單小標籤的字距補回來了（#1143）**：定期規則、設定等處的欄位小標，設計上帶 0.6px 字距，但那個設定從來沒有生效過，12 個位置全部以預設字距顯示。修好之後這些標籤會略微變寬（最長的一個 +4.8px），沒有換行、高度或溢出的變化。

### 技術變更

- **觀測改用部署環境判斷，本機與 preview 的資料不再進 prod（#1116）**：Sentry、PostHog、GA4 三處都以 `NODE_ENV === 'production'` 當「這是正式環境」，但本機 `next build && next start`、Vercel preview deployment、指向本機 server 的模擬器殼，三者的 `NODE_ENV` 都是 `production`。症狀不是資料不見，是看起來完全正常的假訊號：Sentry 生出 84 events / 0 users 的 High priority issue（url tag 90 天全貌 100% 落在 `localhost:*` 與 `10.0.2.2`，在 prod 永遠重現不出來）；PostHog 在 cookieless 下每個 session 算一個新 person，近 30 天的假 person 佔 ~9%（事件量只佔 ~1.4%，所以看事件數看不出來）；GA4 的 `G-YHXFBMRQ3S` 是跨產品做 Ko-fi 收益來源歸因的 property，被灌髒的是歸因本身，而 `app/layout.tsx` 的註解當時還寫著「dev / preview stay clean」。改成單一 gate `lib/deployEnv.ts`（`DEPLOY_ENV` / `IS_PROD_DEPLOY`），值由 `next.config.ts` 從 `VERCEL_ENV` 注入成 `NEXT_PUBLIC_DEPLOY_ENV`（沿用該檔既有的 `NEXT_PUBLIC_BUILD_ID` 做法，不依賴 Vercel 那個可被專案設定關掉的鏡像變數），未知值一律落 `local` 而不是 `production`。**基準要從部署日重算**：prod 專案的訪客數會出現一階下降，那是雜訊被擋掉，不是流量掉了。反方向同樣要顧——這個改動的失效方式是靜默關掉正式環境的觀測，部署後要確認 PostHog 在 `futari.southern-light.dev` 仍有新事件、Sentry 的 `environment` 是 `production`、以及 GA 仍在收 Futari 的流量（最後這條最容易漏，斷了要好幾週才會有人發現）。
- **`partner_quiz_started` 從發不出去的地方搬到真正建立 session 的地方（#1139）**：唯一的發送點在 `startPartnerQuizSession()` 裡，而那個 action 自 lazy-create 改寫後就沒有生產呼叫端——事件在 prod 恆為 0，同一份 spec 的 `partner_quiz_completed` 卻正常送出，兩者併用會算出無限大的轉換率。埋點移入 `review/[month]/quiz/page.tsx` 的 insert 成功分支（UNIQUE 衝突後 re-read 那條刻意不送，否則每次重整都算一次「開始」），孤兒 action 與它的測試一併刪除。**基準要從部署日重算**：這不是成長，是終於有東西可以量了。
- **活化口徑改用 `record_created ≥ 1`（#1127）**：`first_record_created` 數的是 `paidBy = viewer.id` 的第一筆，所以主要替伴侶記帳的人永遠不會觸發它——90 天內 `record_created ≥ 1` 有 17 人，`first_record_created` 只有 11 人，差的 6 人確實在用產品。那不是 bug，是 #891 刻意的語意，對它原本的用途（里程碑卡、`via` 分流）也正確；錯的只有拿它當活化。失效的樣子不是查詢報錯，是**活化率緩慢地、看起來很合理地往下走**：雙人帳本愈多、單方代記的比例愈高，分子漏得愈多，而曲線沒有任何不連續，去追的人會先查 onboarding。還有一條反直覺的——小樣本上兩個口徑會算出一樣的數，所以「我算過，沒差」不能當成安全的理由。`first_record_created` 的發送條件與用途不動，但七個發送點的 `// Activation signal` 註解全部改掉；只改 issue 列的那兩處等於半套的撤回，下一個人打開 `fuelLog.ts` 會重新得出同一個錯誤結論。
- **安裝指引補上量測（#1126）**：`InstallGuide` 卡在唯一的活化窗口正中央（實測 8 個有記帳的人，從建帳本到第一筆是 0.5 / 1 / 1 / 1 / 2 / 12 分鐘，沒有事後回來記的族群），而我們對它一個數字都沒有。新增 `install_guide_shown` / `install_guide_dismissed`，各帶 `source` 與 `install_platform`。`source` 設成必填 prop：`setup` 是自動彈出、打斷活化窗口，`settings` 是使用者自己要看，混在一起的曝光數會讀起來像「有興趣」，而其中大部分是「被打斷」。埋在 `open` 變 true 時而不是掛載時——on-mount 會把每一次 `/setup` 與 `/settings` 的頁面載入都算成一次曝光。`dismissed` 包住整個 `onClose`，backdrop 點擊與下滑同樣算數。刻意不送 `install_guide_installed`：`appinstalled` 只在 Chromium 系觸發、iOS Safari 不發，送它會做出一個系統性低估 iOS 的安裝率，正是 #1127 的同一形狀；而 `platform` 維度（#1002）本來就答得出這個問題。預期量級是個位數到十位數／週；判斷「壞掉」的門檻是 `setup_completed` 有新增而 `install_guide_shown` 為 0。
- **solo 穩態收斂成一種（#1118 / #1119）**：`SoloBanner` 與 dashboard 上所有邀請 CTA 刪除，改由新的 `SoloMonthHero`（沿用 `monthlyStatsByCategory`，只在 solo 時查）填 hero slot；`MemberContext.hadPartner` 與 `ContextStrip` 的 partner-left 分支整組移除——`hadPartner` 讀當下的 `member_b`，在它要偵測的狀態下恆為 false，該分支從來沒有被渲染過。連帶清掉 `oikos_partner_left_dismissed` cookie 與 `oikos_solo_banner_dismissed` localStorage 這兩套 dismissal 機制。
- **solo 的錯誤訊息改走代碼映射，removal 狀態改用 epoch-keyed flag（#1121 / #1123）**：`quiz.errors.solo` 這個 i18n key **沒有任何渲染點**——真正送到使用者眼前的是 `actions/partnerQuiz.ts` 裡 `throw new Error('一個人的時候還沒辦法答題')` 經 `err.message` 原樣輸出，所以照 issue 改文案等於改一個沒人看的字串。新增 `lib/quiz-errors.ts`（形狀比照 `describeMembershipError`），action 改丟既有的 `'solo_group'` 代碼，附帶讓這條路徑吃到既有的離線偵測；`QuizClient` 的 solo 分支也不再用第二人稱複數的「你們的理財組合」。`removePartner` 改為回傳 `{ groupId, epochId }`，`RemovePartnerFlow` 成功時寫 `futari_partner_removed_<epochId>`——**選 epoch-keyed 而非 group-keyed**：group-keyed 的 flag 若設了卻沒被 dismiss（使用者沒開 dashboard，或對方先重新加入），會存活到日後一次真正的離開，把那次誤標成移除。另加四語 `⟂` 掃描測試防它回來。
- **partner quiz 的 server action 全面改丟錯誤代碼（#1140）**：`submitPartnerQuizAnswers` 剩下的四條繁中字面值換成 `session_not_found` / `wrong_group` / `already_revealed` / `already_answered`，由 `describeQuizError` 映射；`quiz.errors` 新增 `alreadyRevealed` / `wrongGroup` 兩個 key（4 語），另外兩條沿用既有的 `quiz.errors.alreadyAnswered` 與 `quiz.errorNotFound`。`describeQuizError` 的參數從 `quiz.errors` 放寬成整個 `quiz`，才拿得到 `errorNotFound`——那句話同時是 `QuestionCard` 壞 key fallback 的文案，複製一份會多出一個漂移點。
- **dismissal 統一成 epoch-keyed，✕ 依功能分成兩類（#1125）**：hero slot 一帶原本有四種記住「這張關掉了」的方式，其中兩種隨 #1118 / #1119 一起消失，剩下的 `WelcomeSoloCard`（group-keyed）與 `PartnerLeftCard`（epoch-keyed）統一成 epoch-keyed。**這不是在修 bug**——`leaveGroup` 每次離開都鑄造一個全新的 group，那邊的 `groupId` 本來就是一次性的、結構上不會過期；統一的是語意。`epochId` 的型別是 `string | null`（群組沒有 epoch row 時 fallback 回 `null`），沒有 guard 會組出字面的 `futari_just_left_null`，同一台裝置上所有無 epoch 的 group 共用一把 key，一個 group 的 dismissal 會蓋掉另一個的卡片。**有一個刻意接受、有界的行為回退**：部署前不久剛離開帳本的人身上帶著舊的 group-keyed key，新程式永遠不會讀它，他們那張一次性的歡迎卡片會靜默不出現（無資料損失，窗口很小）——若有人回報卡片不見，**不要加回 group-keyed 的 fallback 讀取**。✕ 則沒有統一成一個字符：關閉一個 surface 用 `✕` U+2715（`FirstRecordCard` / `ShellUpdateNotice` / `TransactionFeed` 從 `×` 改過來），清除一個已套用的篩選 chip 維持 `×` U+00D7，兩處各留註解說明分歧是刻意的。順帶把 `ContextStrip` 的 `text-[18px]` 換成 `text-lg`。
- **`ConfirmModal` 關閉時改為卸載，並補上對話框語義與焦點控制（#1171）**：面板原本永遠渲染，關閉時只靠 `opacity: 0` + `pointerEvents: 'none'` 隱藏，而 `pointer-events` 只擋指標事件、不擋鍵盤焦點與啟動；面板上 `inert` / `tabIndex={-1}` / `aria-hidden` / `role="dialog"` / `aria-modal` 實測全部 0 命中，兩顆按鈕也沒有條件式渲染（`disabled={pending}` 在關閉狀態下是 false）。改成關閉時整個面板不進 DOM——**不用 `inert`**：本專案的 React / TS JSX typing 沒有它，硬轉型會繞過型別系統。補上 `role="dialog"` / `aria-modal` / `aria-labelledby` / `aria-describedby`，id 由 `useId()` 產生，避免兩個同時掛載的 `ConfirmModal` 撞 id；Tab 循環與關閉時的焦點還原接上 repo 既有的 `useFocusTrap`（`SheetFrame` 已在用），不重複實作。開啟時焦點落在「取消」而非「確認」，避免快速打字的人一個 Enter 就觸發破壞性動作。淡入保留（mount 時 `opacity: 0`、下一個 frame 翻成 1），淡出不再有動畫。12 個消費點未改動。同批換掉 `DeleteConfirmFlow` 一則過期註解——原文寫「Modal mounts via portal so its position in the JSX tree doesn't matter」，但 `ConfirmModal` 裡零個 `createPortal`，而 JSX 樹裡的位置正是「能動的巢狀案例」與「壞掉的兄弟案例」唯一的差別。那是最危險的一種過期註解：它明確授權了一個會靜默弄壞東西的改動。**⚠️ 這個修正未在瀏覽器實跑**——Tab 循環、Escape、焦點還原、淡入時序全部只有靜態讀碼驗證。那是刻意接受的取捨：原本的 bug 確定會發生，而新的風險（焦點陷阱可能寫壞 Escape，或讓對話框打不開）是可能會發生。合併進 `release` 前建議實機走一次鍵盤。
- **modal safe-area 的形狀：外層付 inset、內層置中（#1124）**：`LeaveGroupFlow` 與 `RemovePartnerFlow` 的 modal 外殼原本逐字相同，缺口也相同，所以修法也刻意逐字相同——兩個 flow 長得一樣比各自最佳化更有價值。外層 `fixed inset-0` 的 layout box 付掉 safe-area inset，內層 panel `max-h-full` 置中其中，panel 在結構上不可能長進瀏海，與內容多高無關。外層全程 `pointer-events: none`，backdrop 點擊關閉仍由 `SheetBackdrop` 負責（那也是一條逃生路徑，不能為了修另一條而弄壞它）。**用 `env()` 而不是 `var(--safe-top)`**：該 token 在 dashboard shell 底下被 `.shell-top-strip ~ *` 歸零，用它的話配額是零而且沒有任何錯誤跡象——markup 看起來修好了、review 會通過、測試會綠，✕ 照樣在瀏海底下。幾何以代入實值的 harness 量過（inset 59 時修正前 ✕ 落在 54px、修正後 97px），**仍未在原生殼內驗證**：桌面瀏覽器的 `env(safe-area-inset-*)` 是 0，驗不到那個失效。
- **月份 key 從 `currentYearMonthInTaipei()` 推導（#1130）**：原本由 server-local `new Date()` 的欄位組成，而資料是用 `AT TIME ZONE 'Asia/Taipei'` 分桶的。改成從同一份 `todayYM` 推導、而不是在同一個檔案裡第二次讀時鐘——讓 hero 與月報 banner 不可能對「現在是哪個月」有不同看法。它能活這麼久是因為標籤與資料都來自同一個錯的 key，所以畫面上沒有一處看起來壞掉。測試刻意不依賴 process timezone（開發機本來就在 `Asia/Taipei`，bug 在這裡重現不了），UTC 那一側直接用 `getUTC*` 明寫。
- **Amount tier 與 landing 的 fluid 字級 token 化（#1132）**：`BalanceHero` 與 `SoloMonthHero` 各抄了一份 `clamp(40px, 12vw, 56px)` 與 `tracking-[-1.4px]`，landing 另有三處 clamp 字面值。五處全部收斂成 token，但**保留 product / brand 的分界並讓名字帶著它**（`text-amount-fluid` vs `text-display-wordmark` / `-tagline` / `-tagline-lg`）——併成單一「fluid scale」會抹掉 DESIGN.md §3 本來就有的那條線，並邀請未來某次「順手統一一下」靜默改掉 landing 的視覺。landing 的三個一次性字距不 token 化：各只出現一次、沒有漂移可防，把一次性值升格成 token 等於描述一個不存在的 scale。視覺零變化，在 1920px 與 320px 兩個寬度逐 token 比對 `getComputedStyle` 驗過。順帶記一件事：plugin detector 只比對字級與 type ramp，不看 spacing / height / tracking / color——**detector 乾淨不等於 token 紀律乾淨**。
- **`tracking-label` 用錯 namespace，從來沒有被產生過（#1143）**：`--letter-spacing-label` 不是 Tailwind v4 讀的 tracking namespace（要 `--tracking-*`），utility 根本沒有輸出，12 個呼叫點全部 computed 成 `letter-spacing: normal`。失效方式完全隱形：class 拼字正確、token 有定義還附了註解、build 沒有警告、CI 全綠，而 0.6px 小到只會讓文字看起來「有點緊」而不是壞掉。這個 bug 在 #1132 施工時差點被複製一份——照鄰居形狀寫的 `--letter-spacing-amount` 會靜默吃掉 `-1.4px`，是量測抓到才改成 `--tracking-amount`。修好之後 9 個可達的呼叫點實測寬度變化精確等於「字數 × 0.6px」；剩下 3 個在 `SoloMonthHero`，屬 solo 專屬畫面，未實測。
- **DESIGN.md 校準到 shipped code（#1136）**：§3 記的 Amount 是 44–56px、完整 scale 沒有 40，但兩個 hero 在窄螢幕就是 render 40px，`-1.4px` 字距也沒被記載。**這不只是過時**——Even-Px Rule 會讓一個照著文件做事的人把 40 當成違規去「修正」成 44，他依文件是對的、依現實是錯的，而那個改動會動到線上視覺，沒有任何測試會擋。§3 補上 40 的來歷、四個 fluid tier 與它們刻意分成兩個家族、「不要把 `clamp()` 下界往上校正」、以及 `--tracking-*` 才是 tracking token 的 namespace（把 #1143 當案例寫進去）。§4 補上 `--safe-top` 在 dashboard shell 底下會被 `.shell-top-strip ~ *` 歸零、那些位置要直接寫 `env()`——否則會得到「看起來處理了 safe-area、實際配額是零」，而 Existing-Token-First Rule 會主動引導下一個人把它改回去。
- **字型註解區分 committed 路徑與實際 serve 的路徑（#1113）**：註解寫著「self-hosted under `/fonts/fraunces/`」，但那個路徑在 prod 是 404——CSS 被 layout import 進 bundle，Next 的 CSS pipeline 把 `url()` 當模組資產處理，輸出到 `/_next/static/media/<hash>-s.woff2`。自架字型功能本身完全正常（prod 實測零外部字型相依），錯的只有敘述；照著它去 debug 字型問題的人會撞到 404 然後開始懷疑部署壞了。修正一併改掉 `scripts/fetch-google-fonts.mjs` 的 header 模板——那兩個 CSS 檔第一行寫著「GENERATED … do not edit by hand」，只改產物的話，下次有人重抓字型會在一個看起來完全正常的動作裡把修正靜默還原。
- **docgrad `claim_candidates_cap` 設 100（#1114）**：`inventory.mjs` 只發前 60 條候選，而抽樣只能從發出來的裡面取；本 repo 的 population 是 435，60 的視窗只看得到 14%。100 切在「排序還有意義」的邊界上（`refs ≥ 2` 只有 98 條，之後全是 `refs = 1`、退化成路徑字母序）。**這是買時間，不是解決問題**：cap 算的是發出幾條而不是幾條沒驗過，已在 ledger 的照樣佔視窗——ledger 愈長，視窗被已驗過的佔得愈滿，抽樣愈成功視窗愈沒用。根因在上游 [docgrad#54](https://github.com/redtear1115/docgrad/issues/54)，這裡只是把牆往後推約六輪。

## [1.5.12] - 2026-09-13

主題：**讓文件與 code 對帳**——把 36 條文件宣稱逐條打開 code 驗證，撞出三個沒人回報過的 bug：匯入舊帳後可以繞過幣別鎖、截圖轉 CSV 那條路走不到終點、檔案選擇器選不到一半支援的格式。這版修的都是「文件寫得好好的，但 code 沒照著做」——沒有一項是使用者抱怨出來的。
完整 diff：[v1.5.11...v1.5.12](https://github.com/redtear1115/oikos/compare/v1.5.11...v1.5.12)

### 使用者可見變化

- **OAuth 登入時蓋上等待畫面（#1083）**：從外部瀏覽器回來的那一瞬間，登入頁還能再按一次——而第二次點擊會讓回來的連結失去接收者，卡在原地。現在那段時間會明確顯示正在處理。
- **匯入舊帳後不能再改主體幣別（#1106）**：匯入一批去年的紀錄之後，幣別鎖沒有攔住，而改幣別不會換算任何數字——整本帳會被當成另一種貨幣解讀，且不會有任何錯誤訊息。
- **平均油耗兩個畫面顯示同一個數字（#1095）**：愛物列表與詳情頁先前用不同算法，同一台車會看到不同的油耗。現在統一為近 180 天的距離加權。
- **久沒加油的車不再被說「需要至少 2 次加油記錄」（#1097）**：紀錄其實夠多，只是都超過半年。現在會說清楚是沒有近期資料。
- **匯入的檔案選擇器補上 `.txt` / `.ofx` / `.qif`（#1088）**：這三種格式一直解析得了，但選檔時是灰的，只有拖放進得來。
- **截圖轉 CSV 的匯入補回自動辨識（#1094）**：用 ChatGPT 把截圖轉成 CSV 之後，選「通用 CSV」會讀不到任何一列。
- **字型改為自架（#978）**：不再需要連到 Google 的網域才能顯示正確字體。

### 技術變更

- **油耗計算收斂成一份（#1089 / #1095）**：`computeOverallEcon` 刪除，詳情頁與 hero 卡共用 `lib/fuelEcon.ts › computeAvgEcon()`；`listFuelLogsForAsset` 補上 `created_at` tie-break，同日多筆加油的排序不再不定。
- **幣別鎖收斂成單一 helper（#1106）**：`lib/db/queries/epoch.ts › currentEpochHasRecords()`，server action 與 settings 頁共用，改以 `created_at` 判定章節歸屬（先前用事件發生日，與 `epochClause` 的權威定義不一致）。
- **文件體系收斂 round 5–13（#1076 #1079 #1080 #1081 #1082 #1084 #1085 #1086 #1087 #1103）**：六維達標；`CLAUDE.md` 每次任務的固定 token 成本 9,209 → 5,391（Domain Model 與觀測段移入 `docs/superpowers/specs/`）；文件宣稱的抽樣覆蓋 3.9% → 10.1%。
- **文件健檢腳本與 runtime 平台約束（#1075 #1077）**：`scripts/check-docs.sh` 檢查破鏈、路徑引用、spec ↔ INDEX 雙向覆蓋；`CLAUDE.md` 記下「三平台共用同一份 prod deployment，平台差異只能 runtime 判斷」及其失效時的樣子。

## [1.5.11] - 2026-09-12

主題：**讓頁面被找到，讓點擊被算到**——三個語系子樹沒有任何一條可爬的連結、情境頁的 CTA 從來沒有歸因、`/use-case` 根本是 404。這版修的都是「東西在那裡，但 Google 找不到、我們也量不到」。沒有一項是使用者抱怨出來的，全部來自一次 GSC + Lighthouse + 程式碼的對帳。
完整 diff：[v1.5.10...v1.5.11](https://github.com/redtear1115/oikos/compare/v1.5.10...v1.5.11)

### 使用者可見變化

- **情境總覽頁（#1057）**：`/use-case` 先前是 404——十個情境頁只能靠 sitemap 與彼此的橫向連結被找到，其中 `monthly-bills` 與 `roommates` 兩頁 Google **從未抓取過**。現在有了總覽頁，landing 也連得過去。
- **從 Splitwise 搬家（#1060）**：新增第 15 個搬遷指引。Splitwise 有官方的試算表匯出，所以走直接上傳、不必截圖轉檔。
- **語系切換看得清楚了（#1059）**：切換鈕在暖色底上的對比只有 4.02，未達 WCAG AA 的 4.5。整組色階下沉一階後為 4.77 / 10.93，「非當前語系視覺退後」的層級仍在。migrate 頁內文另外兩處同樣成因的低對比也一併修掉。
- **情境卡用語音控制點得到了（#1059）**：卡片的 accessible name 是「查看 cohabitation 頁面」，與可見文字「同居 AA 制」對不上——唸出看得見的字反而點不到。改為讓可見文字自己當 accessible name。

### 技術變更

- **三個語系子樹第一次有了可爬的入口（#1063）**：語系切換是 `<button>` + `router.push()`，對使用者正常，**對 Googlebot 等於不存在**——從 zh-TW 的任何頁面，指向 `/en`、`/ja`、`/zh-CN` 的 `<a href>` 是 0 條。sitemap 裡 108 個 URL 有 81 個（四分之三）住在這三座孤島上，GSC 因此報「已檢索 - 目前尚未建立索引」12 頁，示例裡 9 個是 en 或 ja。已排除 `noindex`、canonical、hreflang、robots.txt、內容太薄五項——同模板的 zh-TW 雙胞胎全都有索引，剩下的唯一結構差異就是內部連結權重。修法只動 `mode === 'url'`；dashboard 的 cookie mode URL 不變，維持 button。
- **情境頁的轉換第一次量得到（#1056）**：`/use-case/*` 的 CTA 是裸的 `/sign-in`，既無 `?from=` 也無任何 `track()`。十個情境 × 四語系 = 40 個 URL 的註冊全部被算成 `direct`，CTA 點擊率是空白。與 #1027 同一類錯：測量點不存在，但漏斗查詢不會報錯，只會給出一個看似合理的數。歸因採 per-slug（`use_case_<slug>`）——這十頁存在的目的就是測「哪個情境拉得到人」，收斂成單一值會抹掉唯一要量的軸。
- **migrate 歸因涵蓋全部 15 個 source，並與 import-resume 拆開（#1062）**：`entrySourceFromParam()` 先前只認 `honeydue` / `spendee` / `cwmoney`，另外 11 個靜默落進 `direct`——而那 11 個正是有流量的（28 天 20 次點擊裡 17 次來自 migrate 頁，只有 2 次走在有接的 source 上）。**但那三個不是漂移的手抄清單，是有 CSV parser 的那三個**：`migrateSourceFromParam()` 供 import-resume 使用，放寬它會讓使用者從沒有 parser 的來源註冊回來時試圖續接匯入。修法是把兩個概念拆成兩軸、各自綁到自己的權威來源（分析綁 `lib/migrate/sources.ts`，import-resume 綁 `lib/csvImport/detector.ts`），並把後者改名為 `importResumeSourceFromParam` ——名字相近又同住一檔，正是它被誤讀成同一件事的原因。順手擋掉一個洞：slug 查表若用 `in` 會走 prototype chain，`?from=toString` 就能鑄出一列 breakdown。
- **情境頁補 BreadcrumbList（#1058）**：GSC 實測 `/migrate/*` 拿得到 Breadcrumbs 版位、`/use-case/*` 是 None。FAQ rich result 自 2023 起 Google 只對權威站點顯示，所以既有的 `FAQPage` 換不到 SERP 版位——breadcrumb 才是這裡實際拿得到的。
- **字級收斂回偶數（#1066）**：清掉最後 6 處 11/13px。其中 landing 兩處是 `text-sm md:text-[13px]`（桌機比手機小），查 blame 後發現**不是刻意的密度決定**：原文是 `text-label md:text-[13px]`，而 `--text-label` 當時就是 13px，`md:` 那層是 no-op；#876 的 codemod 只替換具名 token、沒碰 raw arbitrary value，把無作用的覆寫變成了反向斷差。諷刺的是 #876 的標題正是「drop 11/13/15 tiers」。
- **⚠️ 一次「兩張 PR 各自全綠、合起來爆掉」（#1068）**：#1056 讓 `UseCaseCta` 的 `slug` 成為必要 prop，#1057 新建的 hub 頁沒有傳——兩張**檔案層級零重疊**，git 無從報衝突，兩邊 CI 也都綠，因為各自是對「沒有對方」的 main 跑的。合併後 main 才 typecheck 失敗。修法是給 hub 自己的 `use_case_hub`，而**不是**把 `slug` 改成 optional——optional 會讓「忘了傳」與「這是 hub」塌陷成同一個狀態，等於把這次接住問題的那張網拆掉。**目前 CI 沒有任何一關在驗「合進 main 之後 main 是否仍成立」**；這次靠 typecheck 接住，下次未必。
- **epoch 歸屬的兩個時間戳分工寫進文件（#1050）**：`created_at` 決定章節歸屬、`transacted_at` 決定月份統計。選錯不會報錯，只會靜默算少——feed 照常顯示、balance 整批漏掉。
## [1.5.10] - 2026-09-12

主題：**看得見、按得到、算得準**——瀏海機種吃掉的按鈕、永遠空白的月度回顧、以及三個只在特定時刻才浮現的計算錯誤。這版修的都是「東西在那裡，但你碰不到或看不到」。
完整 diff：[v1.5.9...v1.5.10](https://github.com/redtear1115/oikos/compare/v1.5.9...v1.5.10)

### 使用者可見變化

- **月度回顧終於有內容（#1049）**：先前每個月的回顧都是空白。排程在算「剛開始的當月」而不是「剛結束的上個月」，而算出來的空白又因為寫入策略無法被更正——兩個問題串在一起才造成永久空白。既有的空白月份會在這版部署後補算回來（本月除外，它要等月底結束）。
- **瀏海機種上按得到了（#1021 / #1035 / #1037）**：刪除帳號倒數的「取消」按鈕、過去章節提示、旅行與愛物的標題列，先前在有瀏海的 iPhone 上會被狀態列吃掉。現在所有頂部固定元素收進單一容器依序排列，最壞情況三層同時出現也都看得見。刪除倒數的橫幅改為常駐——**14 天倒數的逃生出口不該捲出畫面之外**。
- **過去章節提示現在每頁都在（#1037）**：先前只有主畫面顯示，翻到帳務或統計時看到的是凍結的歷史，卻沒有任何標籤、也沒有返回的路。
- **「減少動態效果」真的會全部停下（#1022）**：三個動畫先前沒有尊重系統設定，其中金額游標是無限循環的。關掉動態後仍看得出對方剛記了一筆或刪了一筆，不會變成靜默。
- **可以移除對方了（#1033）**：先前帳本裡若有一個不該在的人，唯一的辦法是刪掉自己的帳號。現在設定頁可以移除，回到單人狀態。

### 技術變更

- **balance 限定當前章節（#1030）**：公式先前對整段歷史加總，所以前一段關係結清後留下的殘值會落到新伴侶頭上，且符號永遠對新伴侶不利。修復期間 verifier 攔下一個更嚴重的版本——第一版用 `transacted_at` 當邊界，會讓「補記昨天的收據」與「CSV 匯入歷史」整批從 balance 消失而 feed 照常顯示。最終採 `created_at`，與讀取層一致。
- **remove-partner（#1033）**：與 `leaveGroup` 對稱（關舊開新 epoch、active trip 時擋下），並**撤銷未接受的邀請**——否則 remover 自己先前鑄的邀請仍會通過 #1031 的「鑄造者仍是成員」檢查。刻意不要求 balance 先歸零：那會讓「拖著不結清」變成被移除者卡住移除的槓桿。
- **safe-area 的結構解（#1037）**：`ShellTopStack` 是唯一付 inset 的容器，頁面標題列釘在它下方。這一次同時消滅了三個先前「已知但接受」的取捨。
- **測試 guard 從檔案級改為逐元素（#1042）**：舊版一個檔案只要任何地方有 `env()`，其中新增的固定元素就不再被偵測——而修復模式正好是「每個檔案都加 env()」。新增「inset 由子元素支付」豁免類別，並加上 tripwire：掃描結果少於豁免數就報錯，避免 regex 壞掉時所有斷言以空集合靜默通過。
- **設計意圖與讀數據紀律寫進文件（#1023）**：`PRODUCT.md` 新增 Surface Intents，逐一寫明各 surface 的職責與**哪些低數字是預期的**；`CLAUDE.md` 收錄一天內六次結論被推翻得出的準則，第一條是「引用任何事件指標前先 grep 它的發送點」。

### ⚠️ 部署需要跑 migration

本版含 `0061`（月度回顧月份計算 + upsert 策略）與 `0062`（backfill 既有空白 snapshot）。**prod 與 dev 是獨立 project，兩邊都要跑**。

## [1.5.9] - 2026-09-12

主題：**讓伴侶真的進得來**——實測發現 72% 的人建立帳本後連試都沒試就跳過邀請，而真正送出去的有 83% 成功。所以問題不在連結、不在接受流程，在於「把連結交到對方手上」這一步。這版補上面對面的路徑，順手把整條漏斗從幾乎全黑修到看得見。
完整 diff：[v1.5.8...v1.5.9](https://github.com/redtear1115/oikos/compare/v1.5.8...v1.5.9)

### 使用者可見變化

- **面對面掃碼加入（#1017）**：邀請步驟多一個 QR，對方拿手機掃就能加入，不必先把連結傳出去。資料顯示成功的邀請幾乎都是當場完成的——五個成功案例裡三個在六分鐘內，對方就在旁邊。複製與分享連結照舊保留，遠距那條路沒有變。
- **邀請連結在通訊軟體裡有預覽了（#1016）**：先前貼到 LINE 是一條裸網址，現在有標題、說明與圖。
- **登入失敗與複製失敗不再無聲（#1014 / #1015）**：剪貼簿被瀏覽器拒絕時會明確告知，不再只是「按了沒反應」。

### 技術變更

- **🔒 安全修補（#1031，P1）**：`createInvite` 先前只檢查有沒有登入，不檢查呼叫者是不是該帳本的成員。group id 會隨每次 dashboard render 送到 client，所以**前任伴侶天然握有它**——離開後可為舊帳本鑄一張邀請並自己接受，取回帳本讀寫權與解密後的住家地址、兒童身分資料。修法是移除 `groupId` 參數、改由 viewer 反查，讓錯誤的呼叫形狀在結構上無法表達；accept 端另加「鑄造者仍是成員」檢查，關掉的是整類而非單一實例。**prod 當時零暴露**（符合條件的帳本為 0），修的是前瞻風險。
- **🔒 `editFuelLog` 補 group 約束（#1032，P3）**：被編輯的加油紀錄只用 id 查詢，唯一的檢查驗的是新傳入的 asset。改為比照同檔 `softDeleteFuelLog` 的「父層 scope 到 group、子層 scope 到父層」。
- **on-mount 的 `track()` 不再被丟棄（#1014）**：`posthog.init()` 在 provider 的 effect 裡，而 React effect 由子到父執行——任何子元件在 on-mount 呼叫 `track()` 都跑在 init 之前，事件靜默丟失。`invite_link_opened` 因此四個月 0 筆。改為未 init 時排隊，並由 provider 在 `register()` 之後顯式 flush，確保 queued 事件帶得到 super property。
- **邀請漏斗埋點（#1015）**：複製、分享、跳過、剪貼簿失敗各有具名事件，取代先前靠 autocapture 中文字串反推的做法（文案一改就斷，且只涵蓋 zh-TW）。
- **設計脈絡文件重整（#1025）**：`PRODUCT.md` 補 Surface Tiers（brand vs product register）、solo 定位、三平台交付前提；`DESIGN.md` 對齊 code 現況。
- **solo × 旅行 spec（#1039）**：回答「帳本出現第三種人之後狀態機怎麼走」，並鎖定 balance 看當前章節——理由是過去章節是凍結的歷史，跨章節的 balance 會顯示一個使用者無法結算也無法清除的欠款。

### ⚠️ 量測斷層

#1015 的新埋點與 #1014 的 queue 修復都會讓事件數跳升。**那不是成效，是先前量不到的東西終於量得到了。** 跨本次部署的前後比較無效。

## [1.5.8] - 2026-09-12

主題：**自然搜尋體質**——一次 90 天體檢，結果大半的工作是「查證後決定不做」。真正動手的只有兩處：讓 sitemap 的日期說實話，以及把搬家教學從落地頁的主流程收起來。
完整 diff：[v1.5.7...v1.5.8](https://github.com/redtear1115/oikos/compare/v1.5.7...v1.5.8)

### 使用者可見變化

- **競品搬家頁改成先講為什麼，再講怎麼搬（#1011）**：截圖轉 CSV 的四步教學原本佔掉整整一屏，擋在「為什麼值得用 Futari」前面；現在收摺成一列，想看的人點開，內容一字未改。頁面上也終於有一個不必先上傳檔案就能按的註冊入口。

### 技術變更

- **sitemap `lastmod` 改由 registry 提供（#1004 / #1005）**：日期先前寫死在 `app/sitemap.ts`，與內容實際更新時間脫節達三個半月（migrate 五頁宣稱 5/30、實際 7/13）。改為 `contentUpdatedAt` 跟內容放在一起，並加 CI 內容 hash 護欄：改了文案沒更新日期就 fail。#669 當初「不要用 moving lastmod」的判斷仍然成立，壞掉的是手動 bump 的紀律，所以用機器補紀律而不是改設計。
- **`jsonLdAppName` 依語系分流（#1009）**：四語共用 `'Futari · ふたり'`，Google 的 site-name 顯示行可能對英文搜尋者渲染日文假名。en → `Futari`、zh-TW → `Futari · 雙人記帳`、zh-CN → `Futari · 双人记账`、ja 不動。
- **migrate 頁補上真正的 CTA（#1011）**：⚠️ **量測斷層** —— 該頁先前**沒有任何 `landing_cta_clicked` 發送點**（唯一發送處在 `LandingCtaLink.tsx:45`，migrate header 是裸 `<Link>`），所以先前引用的「26% vs 6.5%」量的是「訪客願不願意退回首頁再點一次」。本版補上 `cta_location: 'migrate_primary'` 後該事件數會跳升，那不是改善，是終於有東西可以量了。跨本次部署的前後比較無效。
- **觀測的邊界寫進 CLAUDE.md（#1018）**：server 與 client 事件因 person_id 不同而無法 join（症狀是查詢靜默回 0 筆，不是錯誤）、`platform` 只存在於 client 事件、cookieless 下匿名訪客數膨脹、維度不回填、UA 分不出平台。另附業務 key 例外：兩邊事件若共用 `group_id` 這類 key 就能配對。
- **`release` skill 補 backlog 表維護**：先前每發一版，CLAUDE.md 的 milestone 表就漂移一次。

### 查證後撤銷的提案

這版有一半的產出是「證明不需要做」，記錄於此以免下次重新推導：

- **use-case 頁收斂（#1008）**：40 條 URL 佔 sitemap 37% 不構成問題。crawl budget 在 108 URL 的站不成立；thin content 也不成立——那些頁有排名（cohabitation 18.5 / newlyweds 7.5 / aa-split 7.7），有排名就是 Google 沒把它們當 thin content 的證據。
- **手機 title 截斷（#1009 原範圍）**：手機 CTR 3.05% vs 桌機 6.20% 看似腰斬，Fisher exact **p = 0.175**——分子是 8 和 8。高曝光的 migrate 頁 title 全部離截斷點很遠。
- **manebo 關鍵字前移**：GSC 顯示該頁 105 次曝光全數來自品牌詞 `manebo`，零品類詞。現況正確。

## [1.5.7] - 2026-09-12

主題：**讓三個平台分得開**——同一份網站送到瀏覽器、安裝版與原生殼，觀測上卻混成一團。這版補上平台維度，往後每筆事件與每個錯誤都知道自己來自哪個平台。
完整 diff：[v1.5.6...v1.5.7](https://github.com/redtear1115/oikos/compare/v1.5.6...v1.5.7)

### 使用者可見變化

_沒有；純觀測面改動。_

### 技術變更

- **平台維度（#1002）**：新增 `lib/platform.ts`，偵測 `ios_native` / `android_native` / `ios_pwa` / `android_pwa` / `web` 五種執行環境。PostHog 以 super property 註冊 `platform` / `is_native`（原生殼另帶 `shell_version`），既有 18 個 `track()` callsite 一行未改即自動帶上；Sentry client 加 `platform` tag。
- **為什麼需要**：UA 分不出來——實測 30 天 iOS 事件有 1621 筆是 WKWebView 卻被歸類為 Mobile Safari（佔 iOS 流量 43%），且原生殼、iOS 主畫面 PWA、其他 App 內嵌瀏覽器三者在 UA 上無法區分。維度只能在執行期注入，事後無法用 SQL 還原。
- **SSR 回 `null` 而非 `'web'`**：server render 沒有平台可言，猜一個等於把每次伺服器渲染標記成瀏覽器造訪。server 端 auth 事件改以 v1.5.6 的 `path` 屬性區分。
- **web bundle 零成本**：讀 `window.Capacitor` 全域而非 import `@capacitor/core`（native bridge 在 document start 就注入），`@capacitor/app` 走 dynamic import 並重用既有 chunk。實測 chunk 數 48 → 48、root layout +268 bytes，落地頁與登入頁不含任何 Capacitor runtime。
- **既有 5 處平台偵測不動**：它們各自回答不同問題（有沒有 bridge / 哪個商店門檻 / 是否 iOS / 清理 listener），且其中兩處是原生契約面檔案。註記 `@capacitor/core` 被引入時會自我安裝 `window.Capacitor`，因此「全域存在」不能證明是原生，必須呼叫 `isNativePlatform()`。

## [1.5.6] - 2026-09-12

主題：**讓殼跟上網站**——iOS 原生 Apple 登入修到真正可用，三平台的 CI、發版流程與殼版本偵測一次補齊；殼與網站之間的兩個盲區（登入漏斗、潛伏的編譯壞損）從此有訊號。
完整 diff：[v1.5.5...v1.5.6](https://github.com/redtear1115/oikos/compare/v1.5.5...v1.5.6)

### 使用者可見變化

- **iOS 原生 Apple 登入修復（#935）**：Sign in with Apple 的 entitlement 從專案建檔起就缺，原生登入在任何 TestFlight / App Store build 上從未可用；`1.5.5 (3)` 補回並已實機驗證。取消或失敗也不再無聲——原生流程失敗會自動退回瀏覽器登入，不會卡在原地。
- **未登入直開內頁不再出現錯誤頁（#997）**：未登入狀態直接開 dashboard / 帳務 / 愛物頁，先前會看到 500 錯誤，現在一律導回登入頁。
- **舊版 App 會收到溫和的更新提示（#991）**：安裝版低於門檻時，主畫面上方出現可關閉的提示。目前門檻低於所有已釋出版本，預設不顯示；抬門檻是之後看過版本分佈的營運決定。
- **隱私頁補上可用的聯絡 email**，刪除帳號對話框的取消期限文案改為正確數字。4 語同步。

### 技術變更

- **CI 三件組（#988）**：web PR 跑 lint / test / build（`test:ci` 排除需 DB 的 integration 檔）；原生殼編譯 smoke（path filter + 每月 cron + 手動觸發）——iOS archive 不簽章、Android `assembleDebug`。SPM 衝突類壞損改在引入當週的 PR 就紅，而不是送審當天才爆。
- **Capacitor 8 × apple-sign-in 的 SPM 衝突修復（#935）**：`patch-package` 放寬 plugin 的 `capacitor-swift-pm` 版本範圍（clean-room 驗收含對照組）；iOS native 計數 bump 至 `1.5.5 (3)`。
- **三平台 harness 制度化（#987 / #989）**：CLAUDE.md 新增三平台架構段落（送審 trigger、原生契約面、版本號策略）；`release` / `ship-native` 兩個 repo-scoped skill 取代外部 plugin 依賴，發版流程內建原生影響掃描。
- **`CAP_SERVER_URL` dev 覆寫（#990）**：殼可指向 localhost / Vercel preview 測原生契約面；未設定時產物 byte-identical，cleartext 只在 http 覆寫時放寬且 Android 限 loopback（`localhost` / `10.0.2.2`）。
- **登入轉換可歸因（#998）**：`signed_in` / `signed_up` 加 `path`（`web_oauth` / `ios_native`）與 `provider`；原生轉換路徑（`recordNativeAuthConversion`）補上首個測試檔。
- **殼版本偵測（#991）**：`lib/shellVersion.ts` per-platform `MIN_SHELL_VERSION` + 數值化版本比較（fail-open）；`shell_version_seen` 事件開始累積安裝版本分佈。web / PWA 路徑零影響（`@capacitor/app` 走 dynamic import，經 build chunk 驗證）。
- **lint 與工具鏈**：`no-html-link-for-pages` 全域保留、兩個查證過的檔案 scoped 豁免（#996）；Node 鎖 24 LTS（`.nvmrc`）；`.claude/settings.json` 補唯讀指令 allowlist。
- **上架素材與 runbook**：13" iPad 截圖、出口合規宣告、ASC API key 角色分工與填表實戰坑全數記入 `docs/app-store-submission-runbook.md`。

## [1.5.5] - 2026-08-12

主題：**讓失敗被看見**——修掉 solo 模式一個看得見的重複，把登入失敗路徑從三層靜音補成有訊號、有提示，並補齊首次送審在素材端的最後缺口。
完整 diff：[v1.5.4...v1.5.5](https://github.com/redtear1115/oikos/compare/v1.5.4...v1.5.5)

### 使用者可見變化

- **solo 模式不再出現兩組「支出／收入」切換（#969）**：單人帳本的主畫面上，模式切換器會上下各出現一次，現已修正。
- **登入沒成功時會看到說明（#973）**：先前登入失敗會回到一模一樣的登入頁、沒有任何訊息，只能反覆重試；現在會告訴你這次沒有完成、可以再試一次。4 語同步。

### 技術變更

- **#969**：`7d17f7d` 的 L1/L2/L3 重構把 ModeToggle 移到 Dashboard L2 列時，`BalanceHero` 有跟著移除自己那份、`SoloBanner` 沒有，於是 solo 路徑同時渲染兩個。移除 `SoloBanner` 內嵌的 `ModeTogglePlaceholder` 與四個隨之無用的 props，並清掉 `BalanceHero` 同源的死 prop `onModeChange`（`mode` 保留，仍決定版型）。
- **#973 失敗埋點**：`/auth/callback` 兩條失敗分支（缺 `code` / `exchangeCodeForSession` 出錯）各發一筆 `sign_in_failed`，帶 `reason` 與 `had_anon_id`；有 `aid` 時以該匿名 distinct_id 為 distinctId，讓失敗接回同一個人的 `sign_in_started`。缺 code 時另外記下 provider 自己回傳的 `error` / `error_description`（先前直接丟棄），可區分「使用者取消授權」與「什麼都沒拿到」。
- **#973 不再吞錯**：`lib/analytics/server.ts` 的 `captureServer` / `aliasServer` 與 `actions/auth.ts` 的 `recordNativeAuthConversion` 原本是空 catch，改為回報 Sentry（仍不向呼叫端拋錯）。exchange 失敗只送 `error.name` / `error.status`，不傳原始 error 物件，避免一次性 auth code 外流。
- **#973 client 端**：`SignInButton` 四條靜默 return（apple 無 idToken、idToken 被拒、拿不到 OAuth URL、web `signInWithOAuth` 回錯）補上 `sign_in_failed`，帶 `reason` / `provider` / `path`。
- 這批埋點是為了診斷 [#972](https://github.com/redtear1115/oikos/issues/972)（Google 登入在 iOS Safari 上幾乎全數失敗：16 人出發、1 人回來）。#972 本身仍待實機重現，未包含在本版。
- **上架素材與產生腳本（#971 / #935）**：`docs/store-assets/` 補齊 Play 512×512 圖示、四語 1024×500 feature graphic、App Store 6.7"（1290×2796）與 Play（1080×1920）截圖各 4 張；`scripts/og/` 新增 `capture-screens.mjs` / `render-store.mjs` / `store-graphic.html`。兩種截圖尺寸不可共用——Play 規定長邊不得超過短邊 2 倍，6.7" 的 2.167 比例會被退件。App Store submission runbook 同步更新實跑結果。
- **文件稽核（#976）**：三份 implementation 味道過重的 spec（`brand-register` / `migrate-pages` / `ia-unified-header`）剝除 schema、TS type、wireframe、檔案清單，淨 −323 行且未刪任何設計理由；五份 spec 的 `status` 從 `planned` / `approved` / `ready-to-implement` 查證後修正為 `shipped` 並補上實際首發版本；三份 spec 檔名去掉日期前綴改為 `<key>-design.md`；`CLAUDE.md` 補上漏列的 `--asset-color-item` 與「專案內建 skill」段（`run-oikos` / `ja-i18n` 先前沒有任何連結指向）。

## [1.5.4] - 2026-07-13

主題：**站穩地基**——修掉一次 prod 資料庫連線事故的根因，並把 migrate 競品頁從模板文案升級成查證過的專屬內容。
完整 diff：[v1.5.3...v1.5.4](https://github.com/redtear1115/oikos/compare/v1.5.3...v1.5.4)

### 使用者可見變化

- **/migrate 競品頁文案全面改寫（#940）**：以 GSC 搜尋資料鎖定 manebo、簡單記帳、記帳城市、CWMoney、麻布記帳五頁，改為上網查證後的競品專屬內容（匯出路徑、付費牆、收費制變動），並修正多處「沒有匯出功能」的錯誤宣稱。4 語同步。
- **/migrate 導覽頁（#939）**：新增列出所有搬家指南的 hub 頁，landing 與頁尾有入口。
- **短暫的全站錯誤不再發生（#953）**：7/5 晚間資料庫連線池被打滿導致約 4 分鐘查詢失敗，已從根因修正。

### 技術變更

- **db client 連線池設限**：`lib/db/client.ts` 顯式設定 `max: 5` / `idle_timeout: 20` / `max_lifetime: 30min` / `connect_timeout: 10`——postgres.js 預設閒置連線永不釋放，在 Vercel lambda 凍結模式下會累積撞上 Supavisor 200 client connections 上限（EMAXCONN）。
- **UTM convention 落地（#954）**：新增 `lib/utm.ts` builder 與 `docs/utm-convention.md`；sign-in 頁 blog 外連帶上 `utm_source` / `utm_medium`，與 GA event 分工記載於文件。
- **`package-lock.json` version 欄位補正**：自 v1.5.3 起 lockfile 未跟版（1.5.2），`npm ci` 會失敗；本版起與 `package.json` 同步。
- 內部：docgrad 文件收斂四輪（新鮮度／一致性／正確性／連結度 → ★4）、兩個既有測試失敗修復（#960）、worktree 工作流文件化。

## [1.5.3] - 2026-06-30

主題：**測試版回報修正**——安卓 / iOS 測試期間回報的三個問題：solo 旅行 500、鍵盤留白、已登入仍停在 landing。
完整 diff：[v1.5.2...v1.5.3](https://github.com/redtear1115/oikos/compare/v1.5.2...v1.5.3)

### 使用者可見變化

- **solo 模式進旅行不再 500（#946）**：單人帳本開啟旅行頁時會跳錯誤，現已修正——每個帳本建立時就會開好當前章節。既有受影響帳本已一併補回。
- **叫出鍵盤不再留一大片空白（#945）**：安卓 app 表單彈出鍵盤時，畫面會被一大片空白擋住、儲存鍵被遮住，現已讓畫面隨鍵盤縮放。
- **已登入直接進主畫面（#949）**：從已安裝的 app / PWA 開啟時，登入過就直接進 dashboard，不再每次都停在 landing。

### 技術變更

- **#946**：`createGroup` 在同一 transaction 內開出初始 `GroupEpochs` open row（比照 0030 backfill）；新增 idempotent migration `0060` 補回任何缺 open epoch 的帳本。修復系統不變式「每個 group 恰好一筆 open epoch」。
- **#945**：導入 `@capacitor/keyboard`，`resize: 'native'` + `resizeOnFullScreen`，讓 edge-to-edge WebView 在鍵盤彈出時原生 resize，搭配既有 `interactiveWidget: 'resizes-content'` 生效。
- **#949**：新增 `LandingStandaloneRedirect`，僅在安裝版 context（standalone / Capacitor 原生）偵測本地 session 後 hard redirect 到 dashboard；瀏覽器分頁 no-op，保留 public landing / SEO。

## [1.5.2] - 2026-06-11

主題：**首次送審就緒**——App Store / Play 首次送審前的最後收尾：暖燈品牌 app icon 正式落地、隱私頁補上 Apple 登入揭露、iOS 推播能力、上架 runbook 與原生版本號規則。
完整 diff：[v1.5.1...v1.5.2](https://github.com/redtear1115/oikos/compare/v1.5.1...v1.5.2)

### 使用者可見變化

- **暖燈 App icon（#899 / #904）**：iOS + Android 換上 Futari 暖燈品牌圖示，取代先前的 Capacitor 預設圖與低解析啟動圖示。
- **隱私政策補揭露 Apple 登入（#934）**：`/privacy` 第三方服務清單加入 Apple OAuth（4 語），與實際登入方式一致。

### 技術變更

- **iOS 推播能力（#936）**：啟用 Push Notifications capability（entitlements + AppDelegate APNs forwarding），讓定期收支提醒可透過 APNs 送達 iOS。
- **上架文案 / data-safety 對照**：新增 App Store / Play listing copy 與 data-safety / App Privacy 對照表。
- **原生版本號規則**：採「純單調計數器」策略——build number / versionCode 每次上傳商店 +1、與 semver 脫鉤、永不歸零；上架 runbook 改為行動導向並補版本規則小節。

## [1.5.1] - 2026-06-10

主題：**上架準備 · 帳號刪除 · 落地頁提速**——App Store / Play 上架前置（帳號刪除）、落地頁效能與無障礙打磨。
完整 diff：[v1.5.0...v1.5.1](https://github.com/redtear1115/oikos/compare/v1.5.0...v1.5.1)

### 使用者可見變化

- **帳號刪除（#923）**：設定頁危險區可申請刪除帳號，14 天緩衝期內可隨時取消（橫幅顯示預定移除日期）。App Store / Play 上架必要條件。
- **邀請接受分流（#912）**：已在單人帳本的人接受邀請前，會看到溫和告知（舊的單人帳本會成為過去章節）；已在雙人帳本的人被擋下，提示先離開目前帳本。
- **Ko-fi 懸浮 widget 範圍修正（#917）**：只在落地頁與設定頁出現；離開設定頁後不再殘留在整個 app。
- **落地頁提速（#920 / #921 / #922）**：移除關鍵路徑的兩次 auth round-trip、清理 preconnect、bundle 瘦身，改善 FCP / TTFB。
- **落地頁無障礙（#919）**：搬遷卡片 label-in-name、Ko-fi iframe frame-title。

### 技術變更

- **帳號刪除**：14 天 grace 軟刪除 + server-side 排程實刪；建立 App Store submission runbook（spec：account-deletion）。
- **公開落地頁不讀 server auth（#920 Phase 1）**：sign-in / landing 改為 client-side 偵測 session 後再導向，公開落地頁因此可 edge cache。
- **react-hooks/purity 修正（#926）**：sign-in 每請求隨機選文的邏輯移出 render。
- **邀請驗證**：加入「接受者既有 group」判斷 + server 端硬擋雙人（防雙重 group）。
- **測試對齊（#911 / #929）**：修正 stale 的 createGroup 測試以符合 idempotent 行為。

## [1.5.0] - 2026-06-09

主題：**iOS 啟程 · Sign in with Apple · 推播提醒**——iOS 改用 Capacitor 殼並加入推播；Sign in with Apple 滿足 App Store Guideline 4.8；GA4 + Ko-fi 開始長線經營。
完整 diff：[v1.4.3...v1.5.0](https://github.com/redtear1115/oikos/compare/v1.4.3...v1.5.0)

### 使用者可見變化

- **Sign in with Apple（#903）**：sign-in 頁加入「以 Apple 帳號繼續」，iOS 走原生登入、Android／web 走 OAuth，符合 App Store Guideline 4.8。
- **iOS App + 推播提醒（#901 / #874）**：iOS 改用 Capacitor 殼，定期收支提醒透過 APNs 推播，到期前提醒確認。
- **加權分攤「回到預設」（#902）**：調整加權分攤比例後，可一鍵還原回 group 預設值。
- **語言切換即時化（#906）**：切換語系移除約 2 秒的凍結等待，改為 optimistic 立即反映。
- **跨站 Ko-fi 支持入口（#893）**：landing／app 加入浮動 Ko-fi widget（iOS build 另行 gate）。
- **App icon 更新**：替換 iOS + Android 新版 app 圖示。
- **幣別頁返回修正（#898）**：新增表單點「幣別」不再需要多按一次返回才進入貨幣頁。

### 技術變更

- **建立群組 idempotent（#911）**：已在群組的使用者重入 `createGroup` 改回傳既有 group，不再丟未處理的 500（cross-tab／retry 競態）。
- **GA4 整合（#894）**：導入 Google Analytics 4 與點擊事件追蹤，production-only。
- **`first_record_created` 修正（#892）**：非手動路徑（如 import）也能正確發出啟用事件。
- **solo-mode 元件去重（#897）**：支出／收入 sheet 共用同一組 pattern 元件。
- **native-auth spec + Android 雜訊清理（#869）**。
- **SEO meta description 收斂（#702）**：7 個 use-case 英文描述縮到 ≤155 字。

## [1.4.3] - 2026-05-31

主題：**品牌面升溫 · 插圖欄位上線**——Landing、Sign-in、Migrate、Terms、Privacy 換上 Committed 暖底色；Landing hero 加入插圖欄位，Mobile 以插圖開場取代大 mark。
完整 diff：[v1.4.2...v1.4.3](https://github.com/redtear1115/oikos/compare/v1.4.2...v1.4.3)

### 使用者可見變化

- **Landing 插圖欄位（#832）**：桌面版 hero 右欄加入插圖（兩人並肩、暖燈、光點），PhonePreview 縮小為次要產品佐證疊在右下角；手機版改以插圖帶開場取代大 FutariMark。
- **品牌頁面換底色（#832）**：Landing、Sign-in、Migrate、Terms、Privacy 從 `--bg` 換成 `--bg-committed`（加深的晨間奶油色），視覺上與 app 內頁拉開情感距離。

### 技術變更

- **新增 `--bg-committed` token**：`#EFDDC4`，只供品牌面使用，app shell 與任務介面沿用 `--bg`；同步更新 `.impeccable/design.json` Brand-Surface Exemption 規則。
- **設計 token 收斂（#886）**：`FuelRow` + `NewFuelLog` 的 hardcoded hex 全面換 CSS variable（`var(--ink-3)` / `var(--bg-page)`），字級換 `text-micro` / `text-label` token。

## [1.4.2] - 2026-05-31

主題：**解密修復 · 設計 token 收斂**——修正愛物車牌／房子地址在正式環境無法解密顯示的問題（#881）；設計 token 全面收斂；無障礙與 SEO 打磨。
完整 diff：[v1.4.1...v1.4.2](https://github.com/redtear1115/oikos/compare/v1.4.1...v1.4.2)

### 使用者可見變化

- **車牌／地址可正常顯示（#881）**：愛物車輛的車牌、房子的地址先前在正式環境按「顯示」會出錯，現已修復，可正常解密查看。
- **Android 新增紀錄輸入法修正（#872）**：Android app 內開啟新增表單時，關閉輸入法不再誤觸返回、導致表單意外關閉。
- **無障礙改善（#875）**：修正 Lighthouse 無障礙檢測項目。

### 技術變更

- **PII 解密修復（#881）**：先前 PII backfill 對正式環境誤用了 dev 的 `ENCRYPTION_KEY`，導致車牌／地址 ciphertext 與 runtime key 不符、無法解密。已將受影響的 7 筆資料重新以正式 key 加密；新增 `scripts/rekey-mismatched-pii.mjs` re-key 工具備查（與 `encrypt-existing-pii.mjs` 並列）。
- **設計 token 收斂（#876）**：type scale 改為 even-px、移除 `text-caption`／`text-meta`／`text-button` 別名、field-label tracking 統一為 0.6px、導入 `border-hairline` token；以 CSS 變數取代 hardcoded 值。
- **英文 use-case meta description 修正（#702）**：3 條超過 155 字的描述縮短，避免 SERP 截斷。
- **Terms／Privacy 改版（#879）**：更新為正式上線狀態文案，補上敏感欄位加密說明，聯絡方式改用 GitHub Issues。
- **llms.txt 修正（#875）**。
- **開發協作規則（#883）**：push 延到 PR-time，避免每個 commit 都觸發 Vercel preview build。

## [1.4.1] - 2026-05-30

主題：**Android 登入修復**——修正 Android app 內 Google 登入後被導回首頁、無法進入主畫面的問題（#866）。
完整 diff：[v1.4.0...v1.4.1](https://github.com/redtear1115/oikos/compare/v1.4.0...v1.4.1)

### 使用者可見變化

- **Android 登入修復（#866）**：在 Android app 內用 Google 登入後，現在會直接進入主畫面，不再回到首頁要求重新登入。

### 技術變更

- **Capacitor OAuth deep link 路徑修正（#866）**：`buildAuthCallbackUrl` 已將 `/auth/callback` 接在 scheme origin 後，`appUrlOpen` handler 原本又把 `://login-callback` replace 成 `/auth/callback`，導致路徑重複（`/auth/callback/auth/callback`）回傳 404、OAuth code 從未 `exchangeCodeForSession`。改為只 strip scheme+host 前綴；並將 `appUrlOpen` listener 在首次 fire 後 `.remove()`，避免重複登入時 listener 累積。詳見 `app/[locale]/sign-in/SignInButton.tsx`。

## [1.4.0] - 2026-05-30

主題：**Android 上架 · 情境 landing 頁**——用 Capacitor 把 PWA 包成 Android app，開始 Google Play 上架流程（#846）；新增情境 use-case landing 頁，覆蓋「兩人記帳」「夫妻記帳」等搜尋入口（#851）。

### 使用者可見變化

- **Android app 上架準備（#846）**：Capacitor wrapper 完成，app icon 換成 Futari 品牌圖示，Google Play 上架流程進行中；登入改用 in-app browser 避免被導出到系統瀏覽器。
- **情境 use-case 頁（#851）**：新增「兩人記帳」「夫妻記帳」等情境入口頁，強化搜尋可見性。

### 技術變更

- **Capacitor Android wrapper（#846）**：`capacitor.config.ts` 設定 `server.url` 指向 prod，`android/` 為 Capacitor 生成的 Gradle 專案（appId `dev.southernlight.futari`）；`SignInButton.tsx` 偵測 `window.Capacitor` 並切換為 `@capacitor/browser` + deep link scheme OAuth 流程（`dev.southernlight.futari://login-callback`）；`AndroidManifest.xml` 加入 intent filter 處理 custom scheme；release signing 透過 env var 注入。
- **use-case landing 頁（#851）**：`lib/use-case/cases.ts` 為資料層，單一動態路由 `app/[locale]/use-case/[slug]/page.tsx`；4 語 i18n、OG / Twitter card、sitemap 自動衍生。

## [1.3.2] - 2026-05-30

主題：**競品搬遷頁全面鋪開 · futari = 記帳 品牌詞鞏固**——把 `/migrate/*` 從 Honeydue / Spendee / CWMoney 三頁擴成 10 個 Taiwan 競品搬遷頁，並把整個 migrate 子系統重構成 CMS / 資料驅動架構（#839 / #852 / #844）；沒有官方 CSV 匯出的 App 改走「截圖→ChatGPT→CSV」流程，新增 `futari_generic` parser 自動解析（#839）；用 structured data + site name 把 `futari = 記帳` 的品牌詞釘穩，跟同名社交 App 區隔（#843 / #845）；schema 面完成愛物 PII 加密遷移第二階段，移除車牌 / 地址 legacy 明文欄位（#837）。
完整 diff：[v1.3.1...v1.3.2](https://github.com/redtear1115/oikos/compare/v1.3.1...v1.3.2)

### 使用者可見變化

- **多了 10 個「從 X 搬到 Futari」教學頁（#839 / #844）**：Moneybook、AndroMoney、Mobills、簡單記帳、記帳城市、CashMan、1Money、iCost、隨手記、Manebo——每頁都有搬遷步驟、競品比較表、FAQ，搜尋競品名稱時找得到。
- **沒有 CSV 匯出的 App 也能搬（#839）**：在原本的 App 截圖、請 ChatGPT 整理成 CSV，再上傳即可；頁面附上可一鍵複製的提示詞，免費版 ChatGPT 就能做。
- **搜尋「futari 記帳」更容易找到正確產品（#843 / #845）**：補強 structured data 與 site name，跟同名的社交 App 區隔開。

### 技術變更

- **migrate 頁改為 CMS / 資料驅動（#852）**：競品資料（名稱、比較表、`screenshotWorkflow` flag）集中在 `lib/migrate/sources.ts`，由單一動態路由 `app/[locale]/migrate/[source]/page.tsx` 渲染；刪除 7 個個別 page 檔；sitemap / cross-link / Breadcrumb / HowTo / FAQPage / ItemList JSON-LD 全部自動衍生。i18n `pages` / `seo.migrate` 改為 `Record<MigrateSlug>`，新增來源由 tsc 強制補齊 4 語。spec: `docs/superpowers/specs/migrate-pages-design.md`。
- **新增 `futari_generic` CSV parser（#839）**：對應截圖→ChatGPT→CSV 的固定格式 `date,category,amount,description,currency,kind`；detector 以 `kind` 欄位辨識，`processBuffer` 自動 route 到 `mapFutariGeneric`（`kind` 決定收支、非 TWD 存 multi-currency tuple、import 時比照既有路徑丟回 base）。
- **structured data 品牌強化（#843 / #845）**：landing `SoftwareApplication`（`applicationCategory: FinanceApplication`）+ `alternateName` 品牌詞；layout `WebSite` + `Organization` `@id` graph；`<meta name="application-name">`、全站 OG `site_name`「Futari · 雙人記帳」、PWA manifest `name`。
- **schema — 愛物 PII 加密遷移第二階段（#837，destructive）**：移除愛車 legacy 明文 `plate` / `address` 欄位（`0053_drop_legacy_plate_address.sql`），readers 不再讀明文。**部署時** dev / prod 都要套此 migration，套之前先重跑一次 backfill `DRY_RUN=1` 確認 `plate=0 address=0`。
- **i18n 待確認**：5 個 P2 頁與共用 workflow 的 en / ja 文案標記 `// TODO(#839) pending native review`；zh-TW 為主稿、zh-CN 已跟進。

## [1.3.1] - 2026-05-30

主題：**公開 surface 清掃 · 愛物 PII 加密第一階段**——對 `/` 跟所有 non-login surface 跑了一輪 `/impeccable critique → polish → audit` 循環，把絕對 ban 的 side-stripe border 拆掉、補齊 WCAG AA 對比、把 landing 拉出 editorial-typographic reflex lane、四語 em dash 一次掃除（#828）；landing hero 字級升級＋PhonePreview 換上真實 `CategoryChip` / `AssetIcon`，順手修掉 logout 卡在 `/settings` 的 server-action redirect bug（#833）；把 dev server 啟動流程固定成 `run-oikos` project skill（#834）；愛物 PII 加密第一階段——車牌、房屋地址、孩子全名加密落庫、tap-to-reveal UI、backfill 腳本（#826 / #835 / #838）。
完整 diff：[v1.3.0...v1.3.1](https://github.com/redtear1115/oikos/compare/v1.3.0...v1.3.1)

### 使用者可見變化

- **邀請失敗的紅框不再像警報（#828, #829）**：拿掉 side-stripe + ⚠️ icon，改成溫和的 clay tint，伴侶第一次點壞掉的邀請連結不再被嚇到。
- **小字終於看得清楚（#828, #830）**：legal page 的「最後更新日期」、MADE IN TAIWAN 微標、migrate FAQ 答案等灰字全面加深到 WCAG AA 4.5:1 對比。
- **手機 landing tagline 變主角（#833, #832）**：「兩個人，一本帳。」字級加大、行高收緊、tracking 收進去，現在是首屏視覺中心。
- **首頁手機卡裡的 chip 和 dashboard 看起來一致（#833）**：PhonePreview 不再用 emoji 跟 placeholder dot，feed chip 顯示真實的「食 / 住 / 醫」、asset chip 顯示真實的 SVG glyph。
- **登出後乾淨跳到 `/`（#833）**：原本登出有時候卡在 `/settings`，現在會正確落回暖色 landing 頁。
- **桌面看 Privacy / Terms 不再像小紙條（#828）**：寬度從 mobile shell 拉到 max-w-2xl。
- **MigrateComparison 表格非顏色 cue（#828）**：「✓ / ◐ / —」加在每個 cell 前面，色弱使用者不再只能靠顏色判斷狀態。
- **車牌可加密儲存（#826, #835）**：愛車 detail 頁，車牌預設遮罩 `●●●●●●`、點「顯示」才解密；assets 列表的車牌 chip 一律遮罩。
- **房屋地址可加密儲存（#826, #835）**：house detail 頁 header subtitle 跟 InfoCard 都套上遮罩 + tap-to-reveal。
- **小孩可加上加密的「全名」（#826, #838）**：小孩編輯表單新增「全名」optional 欄位，detail 頁多一個「全名」row，遮罩預設、tap 解密。`name` 維持顯示用的「小名」不變，現有資料不被動到。

### 技術變更

- **Side-stripe border 拆除（#828 / #829）**：`InviteConfirm` 對齊 `LeaveGroupFlow` 的 alert 形狀（無 border、無 icon、`--debit-soft` 暖底）；`MigrateIntroCallout` 改用 `--surface-alt` tonal step。Absolute ban 違規清零。
- **WCAG AA token-level 修正（#828 / #830）**：`--ink-3` 從 `#B89C8B`（2.24:1）加深到 `#82654F`（4.66:1）；新增 `--debit-text` token（clay shifted 60% toward cocoa-ink，4.87:1 on `--debit-soft`）；section kickers 從 `--accent`（2.34:1）降階到 `--ink-2`（5.51:1）。`LandingCtaLink` 補 `focus-visible:oik-focus-ring`。Landing 手機 `<h1>` 從 wordmark 換成 tagline（screen-reader 導航落地點變正確）。
- **Editorial reflex 結構重整（#828 / #831）**：Landing Features 從 4-card grid → editorial column（hanging italic-Fraunces 數字 + glyph-accented title + body）；Trust 全段 narrative 升格成 24-34px serif 獨白；MigrateSteps / MigrateDifferentiators / MigrateTrustBlock / MigrateFaq / MigrateComparison / MigrateOtherSources 的 h2 從 italic-Fraunces ALL-CAPS tracked 降階成 plain Noto Sans TC 20-22px medium。
- **Em dash 全 locale 掃除（#828 / #831）**：依語境逐句改寫，zh-TW 10 條 / zh-CN 9 條 / ja 16 條 / en ~60 條 user-visible 字串清理；JSDoc 註解內的 em dash 保留（非 user-visible）。
- **手機 hero tagline 字級升級（#833 / #832）**：從 `fontSize: 26 / lh 1.45 / -0.3px` 改為 `clamp(34px, 9vw, 56px) / lh 1.15 / -1px`。
- **PhonePreview 套真實元件（#833 / #832）**：feed icon 從 `·` placeholder 換成 `<CategoryChip categoryId="dining|housing|health" size={28}>`；asset chip 從 emoji 換成 `<AssetIcon type="house|car|child|pet|plant" size={20}>`，跟 `/dashboard` 共用同一 source of truth。
- **Logout server-action redirect fix（#833）**：`LogoutButton` 拿掉 `useTransition` 包裝（React transition 會吞掉 `NEXT_REDIRECT` 的 throw），改用 plain `useState` 管 pending state。加 `window.location.replace('/')` safety net。`signOut()` 重新導向目標從 `localizedSignInPath` 改成新的 `localizedHomePath`。
- **`run-oikos` project skill（#834）**：`.claude/skills/run-oikos/{SKILL.md,smoke.sh,.gitignore}`。idempotent driver：偵測 `@next/bundle-analyzer` 缺裝就自動 `npm install`、檢查 Node ≥20、檢查 `.env.local`、`nohup npm run dev` background 啟動、poll `Ready in` signal、smoke `/` `/zh-TW` `/dashboard`，留著跑、`--stop` 一鍵收。
- **愛物 PII 加密 schema（#826 / #835）**：migration `0052_encrypt_asset_pii_columns.sql` 在 `Assets` / `CarDetails` / `HouseDetails` 加三個 nullable encrypted 欄（`name_encrypted` / `plate_encrypted` / `address_encrypted`），舊欄位保留作 dual-write 過渡。Drop legacy columns 留 #837（v1.3.2）。
- **加密 / 解密路徑（#826 / #835 / #838）**：`createCar` / `editCar` / `createHouse` / `editHouse` 加 dual-write；`createChild` / `editChild` 把 `fullName` 加密寫到 `Assets.name_encrypted`（trinary semantics 跟 nationalId 一致：undefined = keep、null = clear、string = encrypt set）。新 server actions `revealCarPlate` / `revealHouseAddress` / `revealChildName`，認證契約對齊既有的 `revealChildPii`（group ownership + asset.type + 非 soft-delete），plate / address 在 backfill 完成前 fallback 讀 legacy plaintext。`childHasFullName: boolean` 走 `AssetSheetInitial`，sheet 表單對齊 nationalId 的「先前已加密」placeholder + 「清除」按鈕 pattern。
- **共用 `RevealableRow` 元件（#826 / #835）**：從 `ChildDetailClient` 的 inline 元件抽到 `app/(dashboard)/_components/RevealableRow.tsx`。Caller bind 自己的 server action callback，元件處理 mask / pending / error translation / aria。`ChildDetailClient` 用共用版本渲染「全名」row，nationalId / nhiNo 仍走原 inline 版（cleanup 留 follow-up）。新增四語 `assetDetail.reveal.{show,hide,loading,error}` 共用 i18n key。
- **Backfill 腳本（#826 / #835）**：`scripts/encrypt-existing-pii.mjs` Node script，AES-256-GCM (`iv:authTag:ciphertext` hex)，idempotent、`DRY_RUN=1` 支援、讀 `DATABASE_URL`（後續 fix）／fallback `POSTGRES_URL`。
- **Drizzle journal 補回（#826 / #835）**：journal 之前漂移到 idx 50，這次補了 idx 52（idx 51 來自其他來源，留原狀）。
- **package-lock.json 版本 stamp 對齊（#833）**：lockfile 之前停在 1.2.4，這次跟 package.json 一起補進 1.3.0。

## [1.3.0] - 2026-05-27

主題：**觀測補強 · 行為事件埋點**——補齊記帳之後的 PostHog 行為事件（P0 核心黏著：`record_created` / `settlement_created` / `income_created`；P1 功能採用：旅行、愛物、定期規則；P2 關係：`group_left` / 伴侶問答 / 角色互換 / 幣別切換）；修正 Google OAuth 頭像在 next/image 的 remotePattern 缺漏。

### 使用者可見變化

- **Google 頭像正確顯示（#820）**：以 Google 帳號登入的使用者，頭像不再顯示為名字縮寫。

### 技術變更

- **PostHog 行為事件補齊（#811–#819）**：在 9 個 server action 埋入 11 個事件，涵蓋 P0 核心黏著（`record_created` 帶 split_type / category / currency 等屬性、`settlement_created` 帶 amount_bucket / direction、`income_created`）、P1 功能採用率（`trip_created` / `trip_ended` 帶 expense_count + duration_days、7 種愛物的 `asset_created`、`recurring_rule_created`）、P2 關係 / churn（`group_left`、`partner_quiz_started` / `partner_quiz_completed`、`swap_confirmed`、`base_currency_changed`）。全部走既有 `captureServer()` seam，不含原始金額或 PII。`createSettlement` / `createIncome` 補上遺漏的 `user` destructuring。`endTrip` transaction 改回傳 `{ row, expenseCount }` 供 `trip_ended` 記錄規模。
- **Google 頭像 remotePattern（#820）**：`next.config.ts` 補上 `lh3.googleusercontent.com`，修正 Google OAuth 頭像被 next/image 回 400 的問題。

## [1.2.5] - 2026-05-27

主題：**效能基礎建設 + 細節打磨**——DB 複合索引補齊（CashTransactions / Settlements）、Avatar 遷移到 next/image（AVIF/WebP + srcset）、bundle analyzer 接入、BrandHeader icon-only 按鈕 first-use hint、ja i18n 修正、font-semibold 全站清理。
完整 diff：[v1.2.4...v1.2.5](https://github.com/redtear1115/oikos/compare/v1.2.4...v1.2.5)

### 使用者可見變化

- **BrandHeader icon 按鈕首次使用提示（#765）**：✈ 旅行按鈕與頭像堆疊在第一次進入 dashboard 時出現小標籤說明用途，3.5 秒後自動消失，之後永不再顯示。
- **日文 balance 描述修正（#764）**：`があなたに貸し中`（語意反置）→ `があなたから借り中`（對方欠你，語意正確）。

### 技術變更

- **DB 複合索引（#800）**：`CashTransactions` 和 `Settlements` 補上 `(group_id, transacted_at DESC, created_at DESC) WHERE deleted_at IS NULL`，對齊 `IncomeTransactions` 既有 index，消除 records feed / dashboard / balance recalc 的 sequential scan。
- **Avatar 遷移 next/image（#799）**：從 raw `<img>` 改為 `next/image`，輸出 AVIF/WebP + responsive srcset，Supabase remotePatterns 已配置。
- **Bundle analyzer 接入（#801）**：安裝 `@next/bundle-analyzer`，`npm run analyze` 可開 HTML 報告，建立 JS bundle baseline。
- **font-semibold 全站清理（#766）**：weight 600 已回退為 500（render-blocking CSS 精簡），將所有 `font-semibold` callsite 誠實改為 `font-medium`，共 62 個檔案，無視覺變化。
- **SCHEMA_LANG 集中化（#346）**：`lib/i18n/seo.ts` 統一輸出 BCP-47 locale map，移除 `MigrateFaq` / `MigrateHowToJsonLd` 重複定義。

## [1.2.4] - 2026-05-26

主題：**settings 一輪精煉 + split ratio viewer 邊界補完 + dashboard 接上 Impeccable**——settings 頁面從清理開始（dead i18n keys / props、chevron a11y、token 對齊、query 收斂 #778）、補直接登出入口（#780）、重畫 loading skeleton 對齊真實版面（#779）、把預設分攤比例改成 optimistic 即時存（#782）；同步修掉分攤比例在 member B 視角顯示反邊的 bug（#785）、把 guardian 描述殘留的「DB」技術詞拿掉（#781）；dashboard 接上 Impeccable 設計脈絡（PRODUCT.md / DESIGN.md / 設計系統 token，#760 / #761）；README 版本歷史回填 v1.1.3–v1.2.3（#767）。
完整 diff：[v1.2.3...v1.2.4](https://github.com/redtear1115/oikos/compare/v1.2.3...v1.2.4)

### 使用者可見變化

- **分攤比例即時存（#782）**：在 settings 改預設分攤比例不再需要按「儲存」，拖完就生效；server 失敗自動 rollback 並提示。
- **/settings 加直接登出入口（#780）**：登出從 avatar 選單裡撈出來，settings 頁面就有按鈕。
- **settings loading skeleton 對齊真實版面（#779）**：載入時顯示的骨架對齊真實內容區塊，不再閃爍跳動。
- **member B 看分攤比例視角修正（#785）**：分攤比例（如 60/40）以 viewer 為主視角，member B 不再看到反過來的數字。
- **守護描述去掉技術詞（#781）**：原本含「DB」的字樣改成自然語言描述，避免只有工程師看得懂的縮寫（zh-TW / zh-CN / ja）。
- **dashboard 一輪語言／色彩／結構微調（#761）**：balance 描述「欠」→「待還」（witnessing tone）、L3 filter 收成「篩選」chip、tokens flat-by-default、witnessing color。

### 技術變更

- **settings 清理（#778）**：移除 dead i18n keys、dead prop、補 `aria-hidden` 在 chevron icon、合併重複的 query、tokens 對齊。
- **SplitRatioSection optimistic save + rollback（#782）**：拖完即送 server action，本地即時更新；server 失敗 rollback 並 surface error，消除「按了沒生效」與「沒按就丟失」兩種失誤狀態。
- **Split ratio viewer/perspective 邊界補完（#785）**：`lib/splitRatio.ts` 抽出 viewer-aware perspective helper，AddSheet / CompactRow / RecurringRuleSheet 三處 UI ↔ DB 邊界統一走同一份；新增 `tests/splitRatio.test.ts` + `tests/balance-weighted.test.ts` 全面覆蓋兩個 member 視角的所有 split type。
- **`SegmentedToggle` 抽共用 primitive（#761）**：BalanceHero / MemberDualToggle / ModeTogglePlaceholder 三處重複的 segmented control 抽到 `components/ui/SegmentedToggle.tsx`，視覺與行為由 design token 統一控制；新增 `tests/SegmentedToggle.test.tsx` / `tests/DashboardFilterRow.test.tsx`。
- **Impeccable 設計脈絡進專案（#760）**：新增 `PRODUCT.md`（策略：who / what / why、register、anti-references、5 條設計原則）+ `DESIGN.md`（視覺系統：色票、字體、elevation、元件、Do's/Don'ts，Stitch 六段格式）+ `.impeccable/design.json`（延伸層）；CLAUDE.md 加段「設計脈絡」指引；`skills-lock.json` pin 住 Impeccable skill 版本。
- **README 版本歷史回填 v1.1.3–v1.2.3（#767）**：README `## 版本歷史` 表之前漂移 ~10 版（#757 才發現），這次回填補齊；release skill 加 step 7「每次發版必須更新該表」防再次漂移。

## [1.2.3] - 2026-05-25

主題：**records 邊角修正 + profile 無障礙整備**——補一批 records 正確性／體驗缺口（手動輸入金額沒上限、篩選金額範圍顛倒會靜默清空列表、收支 tab 展開時當月總計消失），並把「個人資料」面板（avatar 選單）做一輪無障礙整備（共用 SheetFrame 的 dialog 語意 + focus trap、分攤方式改 radiogroup），順手修掉點「幣別」沒反應的導航 bug。
完整 diff：[v1.2.2...v1.2.3](https://github.com/redtear1115/oikos/compare/v1.2.2...v1.2.3)

### 使用者可見變化

- **點「幣別」沒反應修正（#757）**：在「個人資料」面板點「幣別」現在會正確開啟幣別設定，不再沒反應。
- **收支 tab 展開保留當月總計（#757）**：展開收支統計時，最上方補回「支出·收入·淨收入」總結行（#747 換成日趨勢圖後，該行只在此 tab 遺漏）。
- **手動輸入金額上限（#757）**：交易／收入金額超過上限會被擋下並友善提示，與 CSV 匯入一致，不再因超出整數範圍跳出原始資料庫錯誤。
- **篩選金額範圍自動對調（#757）**：篩選金額下限大於上限時自動對調，不再靜默清空整個列表（與日期範圍一致）。
- **個人資料面板無障礙改善（#757）**：avatar 選單面板補上正確的 dialog 語意與焦點管理；預設分攤方式選擇器，螢幕報讀器可辨識目前選取的選項。

### 技術變更

- **金額上限單一來源（#757）**：`MAX_AMOUNT` 收斂到 `lib/validators`，交易／收入驗證器以 opt-in 上限套用、CSV 匯入沿用同一常數；資產價格（房子等）維持不設上限。前端 `AddSheet` / `IncomeSheet` 同步擋下並顯示 `amountTooLarge`。
- **`resolveTxnFilter` 抽共用（#757）**：誰付→uuid 收斂與 cross-kind cut 規則抽成 `lib/resolveTxnFilter.ts`，SSR（`records/page.tsx`）與分頁 loader（`actions/transaction.ts`）共用同一份，避免兩處漂移。
- **AvatarMenuSheet 改用 SheetFrame（#757）**：移除手刻 sheet chrome，改用共用 `SheetFrame`（`role="dialog"` / `aria-modal` / focus trap）；`EditTextSheet` 補 dialog 語意；分攤方式選擇器改 `radiogroup` + `aria-checked`。
- **幣別導航延後到面板返回落地（#757）**：幣別列改走 `runAfterSheetCloseBack`，避免與關面板同 tick 導航被合成 `history.back()` revert（#745／#752 同類 race，這次落在導航而非篩選）。
- **loading skeleton 對齊版面（#757）**：records `loading.tsx` 補上 L1 標題 + L2 收支切換 placeholder，消除載入時版面位移（CLS）。
- **i18n（#757）**：新增 `addSheet`/`incomeSheet.errors.amountTooLarge`、`settings.defaultSplitLabel`（4 語；ja／en 待 native 複查）。

## [1.2.2] - 2026-05-25

主題：**收支 tab 看見當月節奏 + records 篩選體驗修正**——records 同時看支出與收入時，把該 tab 的分類圓環換成一張當月日趨勢圖（每日收入／支出長條 + 累計淨額折線），讓人一眼讀出「這個月的節奏長怎樣、月底落在淨流入還是淨流出」；同時修一批 records 篩選體驗 bug：付款人篩選沒同步過濾下方列表、月度統計展開時當月總額消失、按「套用」後網址被關面板的返回動作還原、每日趨勢圖與支出圓餅圖沒套到全部篩選維度。
完整 diff：[v1.2.1...v1.2.2](https://github.com/redtear1115/oikos/compare/v1.2.1...v1.2.2)

### 使用者可見變化

- **收支 tab 當月日趨勢圖（#747）**：在 records 同時選「支出 + 收入」時，原本的分類圓環改成一張當月日趨勢圖——每日支出長條朝下、收入朝上共用中央零線，外加一條累計淨額折線，末點依當月落在淨流入／淨流出染綠或橘。月內每一天都在軸上，沒有紀錄的日子留白、不壓縮時間軸。
- **篩選「我付的／對方付的」同步過濾列表（#745）**：在 records 頁用付款人篩選時，下方紀錄列表現在會跟著篩選，不再仍顯示全部紀錄。
- **月度統計展開時保留當月總額（#746）**：展開月度統計面板時，最上方保留一行當月收支總結，總額不再因為數字只放在圓環中心而消失（圓環中心會在點某分類時切換成該分類金額，且進帳模式 / 純收入月份不一定畫圓環）。
- **按「套用」後篩選確實生效（#752 / #753）**：在 records 頁按「套用」後，網址會帶上篩選且實際生效，不再被關閉篩選面板的返回動作立即還原。
- **每日趨勢圖跟著篩選（#747 後續 / #753）**：收支 tab 的每日趨勢圖現在和上方收入／支出圓餅圖一樣，套用所有篩選維度（誰付、分攤、分類、愛物、金額、狀態、負擔方）。
- **只篩收入分類時支出圓餅圖留空（#753）**：只篩「收入分類」時，支出圓餅圖會正確留空，與紀錄列表、收入圓餅圖一致。

### 技術變更

- **收支 tab 日趨勢圖（#747 / PR #750）**：新增 `DailyTrendChart`（dep-free inline SVG，沿用 donut「不引 chart lib」的決策、Recharts 仍排除）；資料源 `lib/db/queries/transactions.ts#dailyTrendByMonth`（zero-fill 月內每一天）；色票 `lib/chartPalette.ts` 加 `TREND_EXPENSE_COLOR` / `TREND_INCOME_COLOR`。bars 依當月單日最大值、累計折線依累計最大擺幅，各自 scale 共用中央零線，避免月末累計值壓扁單日 bar。spec 見 `docs/superpowers/specs/stats-design.md`。
- **付款人篩選 clean remount（#745 / PR #749）**：records feed 的 React `key` 加入結構化篩選簽名（`filterKey`），讓篩選變更與 drill / date-range 一致地觸發 clean remount，直接採用已在 SSR 過濾好的 `initial`，不再單靠 client refetch effect 同步。
- **統計展開保留總結（#746 / PR #748）**：`MonthlyStatsView` 展開狀態在 donut 上方加一行 `SummaryText`（收入 / 支出 / 淨額），把月總結從只靠 donut 中心（會被 drill 取代、進帳模式 / 純收入月份不畫 donut）獨立出來。
- **每日趨勢圖套完整 filter（#753）**：`dailyTrendByMonth` 改套完整 filter：expense branch 重用 `statsScopeClauses`（與 `monthlyStatsByCategory` 同一組 WHERE）、income branch 比照 `monthlyIncomeStatsByCategory`，`MonthlyStatsSection` 把 `filter` / `incomeFilter` 一併傳入；`cutAll` 時直接略過該 branch 的查詢回傳空，對齊圓餅圖的 cross-kind cut 行為。
- **純收入篩選下支出 donut 留空（#753）**：`monthlyStatsByCategory` / `monthlyStatsByAsset` 補上 `if (filter?.cutAll) return []` 早退（對齊 income donut `incomes.ts` 的做法），修正支出圓餅圖在純收入篩選下未留空的問題。
- **套用導航延後到面板返回落地（#752 / #753）**：`handleApplyFilter` 不再與面板關閉同一個 tick 內 `router.replace`：面板 backdrop 為了「Back 關面板」會在開啟時 push 一筆合成 history、關閉時 `window.history.back()`（`useEscapeToClose`），與導航同 tick 時這個 back 會在 `router.replace` 之後落地、把篩選網址 revert 回去。新增 `lib/sheetNavigation.ts#runAfterSheetCloseBack`，把導航延到該合成返回的 `popstate` 落地後再執行；`history.back()` 是非同步的，`requestAnimationFrame` / `setTimeout(0)` 都會搶在 popstate 前面，只有監聽 popstate 才可靠。同時移除 #752 加上的 `startTransition`（`router.replace` 內部本身就是 transition，該包裝對此問題無效）。

## [1.2.1] - 2026-05-25

主題：**觀測性收尾——PostHog reverse proxy + Sentry 設定補齊**——把 v1.1.7~v1.2.0 接上的分析 / 錯誤追蹤實際接通：PostHog 改走 managed reverse proxy（#738），降低被瀏覽器隱私 / 廣告攔截外掛擋下的比例；Sentry 補上確認的 org / project slug 並啟用 logs（#739）。純後端設定，對使用者無可見變化。
完整 diff：[v1.2.0...v1.2.1](https://github.com/redtear1115/oikos/compare/v1.2.0...v1.2.1)

### 使用者可見變化

_本版無使用者可見變化（觀測性設定補齊）。_

### 技術變更

- **PostHog managed reverse proxy（#738 / PR #740）**：分析事件改走 managed reverse proxy，提升事件抵達率（減少被攔截外掛擋下）。
- **Sentry org / project slug + logs（#739 / PR #741, #742）**：填上確認的 Sentry slug、啟用 logs，讓 v1.1.7 接上的錯誤追蹤實際送達。

## [1.2.0] - 2026-05-24

主題：**看見光從哪裡來——入口轉換追蹤**——為三個入口面（首頁 `/`、migrate 著陸頁 `/migrate/*`、伴侶邀請）接入 PostHog 轉換漏斗事件，量測「來訪 → 註冊 / 加入」的轉換率並歸因到來源。維持既有 cookieless（`persistence: 'memory'`、免同意橫幅）立場：OAuth 邊界以 server-side alias 串接匿名與註冊後事件，不新增 cookie / localStorage。本版對使用者無可見變化。
完整 diff：[v1.1.8...v1.2.0](https://github.com/redtear1115/oikos/compare/v1.1.8...v1.2.0)

### 使用者可見變化

_本版無使用者可見變化（純後端分析事件接入）。_

### 技術變更

- **轉換分析事件層（#734）**：新增 `lib/analytics/`——client `track()` 與 server `posthog-node`（`captureServer` / `aliasServer`）兩個 gated seam，事件僅在 `NODE_ENV === 'production'` 且有 key 時送出。涵蓋 pre-auth client 事件（`landing_cta_clicked`、`migrate_file_selected`、`migrate_preview_shown`、`migrate_preview_failed`、`migrate_cta_clicked`、`sign_in_started`）、auth boundary server 事件（`signed_up` / `signed_in`）、啟用事件（`setup_completed`、`first_record_created`、`import_completed`）與邀請漏斗（`invite_created`、`invite_link_opened`、`partner_joined`）。
- **跨 OAuth 邊界歸因**：`SignInButton` 把匿名 `distinct_id` + `from` 夾帶進 OAuth `redirectTo`，`/auth/callback` 以 `posthog-node` `alias()` 把 pre-auth 匿名事件串到註冊後的 user，`persistence: 'memory'` 維持不變。歸因軸 `entry_source`（`landing` / `migrate_*` / `invite` / `direct`）寫為 `$set_once` person property。
- **新依賴 `posthog-node`**（server-side capture / alias）。
- 設計見 `docs/superpowers/specs/conversion-analytics-design.md`。

## [1.1.8] - 2026-05-21

主題：**修正收合狀態 hydration 閃退 + PostHog 收斂到 production**——修掉 v1.1.7 (#726) 引入的 hydration mismatch：餘額卡與月度統計改用 `useState` lazy-init 直接讀 localStorage，讓「曾收合過」的使用者一載入就觸發 React #418（收合任一區塊後重新整理即重現）；改以 cookie 持久化，讓 server 端就 render 正確的收合狀態，根治 mismatch 又保留無閃爍。同時把 PostHog 收斂成只在 production 初始化，避免本機開發把事件送進正式專案。
完整 diff：[v1.1.7...v1.1.8](https://github.com/redtear1115/oikos/compare/v1.1.7...v1.1.8)

### 使用者可見變化

- **收合區塊載入不再閃退（#418 / #726）**：曾收合過儀表板餘額卡或紀錄頁月度統計的使用者，重新載入頁面不再出現畫面閃爍或錯誤，直接以正確的收合狀態呈現。

### 技術變更

- **收合 / 關閉偏好改 cookie 持久化（#731）**：`MonthlyStatsView`（collapsed）、`BalanceHero`（hero collapse + include-pending）、`ContextStrip`（partner-left dismissed + trip collapsed）由 `useState(() => localStorage…)` lazy-init 改為 server component 讀 cookie → 以 prop 傳入初始值，SSR 與 client 首次 render 一致，根治 React #418。新增 `lib/uiPrefsCookie.ts` 收斂 cookie 名稱與 server 讀 / client 寫 helper。既有使用者的這些 localStorage 偏好會 reset 一次後改由 cookie 持久化。
- **PostHog production gate（#731）**：`app/providers.tsx` / `app/posthog-pageview.tsx` 以 build-time `POSTHOG_ENABLED`（`NODE_ENV === 'production'` 且有 key）gate 住 init 與 pageview——本機 dev 不再送事件到正式專案，並消除缺 key 時的 "initialized without a token" warning。

## [1.1.7] - 2026-05-21

主題：**可觀測性接入 + 兩處體驗修正**——接入 Sentry 錯誤追蹤（#719）與 PostHog 產品分析（#720）兩套觀測工具，兩者皆只在 production 送出、本機開發不外送；Sentry 在送出前移除 cookie / header 做 PII scrubbing，PostHog 採 cookieless（memory persistence）模式免同意橫幅。另修兩個體驗 bug：在愛物 Sheet 內切換類型後 Android 返回鍵會誤離開 App 而非收起 Sheet（#723），以及儀表板餘額與月度統計的收合狀態在載入時會先閃一下（#726）。
完整 diff：[v1.1.6...v1.1.7](https://github.com/redtear1115/oikos/compare/v1.1.6...v1.1.7)

### 使用者可見變化

- **切換愛物類型後返回鍵正確收起 Sheet（#723）**：在新增 / 編輯愛物的 Sheet 內切換類型（如 Child → Pet）後，按 Android 系統返回鍵會正確收起 Sheet，而不是直接離開 App。
- **載入不再閃動收合狀態（#726）**：儀表板餘額卡片與紀錄頁月度統計的展開 / 收合偏好在頁面載入時直接以正確狀態呈現，不再先展開再跳收合。

### 技術變更

- **Sentry 錯誤追蹤（#719）**：以 `@sentry/nextjs` v10 手動接入 Next.js 16 App Router（不走 wizard）——client 用 `instrumentation-client.ts`（Turbopack 下取代已棄用的 `sentry.client.config.ts`），server / edge config 由 `instrumentation.ts` 的 `register()` 載入並 export `onRequestError` 涵蓋 Server Component / Route Handler / middleware，`app/global-error.tsx` 接 top-level render error，`next.config.ts` 以 `withSentryConfig` 包裹（保留既有 Serwist wrapper）。`enabled: NODE_ENV === 'production'` 故本機不送；`beforeSend` 移除 request cookie / header。Vercel 環境變數與 Sentry org slug 待填。
- **PostHog 產品分析（#720）**：`app/providers.tsx` 初始化 PostHog，cookieless（`persistence: 'memory'`）免同意橫幅、`person_profiles: 'identified_only'`；`app/posthog-pageview.tsx` 以 Suspense 包 `useSearchParams` 手動送 `$pageview`。
- **useEscapeToClose key-change remount（#723）**：以 render-phase `openRef` 讓 cleanup 能分辨「真正關閉」與「keyed body 換 key 重掛」，後者不呼叫 `history.back()`，避免與新實例的 `pushState` 競爭而吃掉一筆 history。補上 vitest 覆蓋。
- **localStorage 收合狀態改 lazy initializer（#726）**：`useLocalStorageBoolean` 與 MonthlyStatsView 的 collapsed 改在 `useState` lazy initializer 讀 localStorage（SSR fallback 預設值、try/catch 防 private mode），移除 mount 後再 `setState` 造成的 flash；寫入亦包 try/catch。
- **文件（doc-keeper sweep）**：`.env.local.example` 補 Sentry 環境變數、CLAUDE.md 架構速查補觀測段。

## [1.1.6] - 2026-05-21

主題：**Android PWA 體驗修正**——集中修正 Android edge-to-edge PWA 的多項體驗問題：safe-area inset 失效（#714）、系統返回鍵直接離開 App 而非收起開啟中的 Sheet（#716 / #683），以及 overscroll 回彈、tap highlight 灰閃、軟鍵盤遮擋輸入框、ja / zh-CN CJK 字型 fallback 缺字等一輪細節（#715 / #713）。
完整 diff：[v1.1.5...v1.1.6](https://github.com/redtear1115/oikos/compare/v1.1.5...v1.1.6)

### 使用者可見變化

- **Android 返回鍵先收起 Sheet（#716）**：在 Android 上開啟記帳 / 篩選等 Sheet 時，按系統返回鍵會先收起最上層的 Sheet，而不是直接離開 App；多層 Sheet 一次收一層，與點背景 / 按 X / Esc 的關閉行為一致。
- **Android 安全區與鍵盤貼合（#714 / #715）**：底部導覽列 / 浮動按鈕 / Sheet 正確避開 Android 螢幕邊緣的 safe-area；叫出軟鍵盤時版面跟著縮，輸入框不再被鍵盤蓋住。
- **Android 滑動與點按細節（#715）**：關掉頁面邊緣的下拉重整與回彈，點按控制項時不再出現灰色閃光；ja / zh-CN 介面在缺字時改用系統 CJK 字型，不再出現方塊（tofu）。

### 技術變更

- **系統返回鍵 / popstate 收起 Sheet（#716, #683）**：`useEscapeToClose` 在 Sheet 開啟時 push 一筆 same-URL synthetic history entry，Back 觸發 `popstate` 時收起 stack 最上層而非導航離開；以 module-level stack + self-pop 計數處理巢狀 Sheet 與「非 Back 關閉」時的 history 回收，避免多吃一次 Back。補上 vitest 覆蓋 push / 巢狀解疊 / self-pop 等情境。
- **viewport-fit + interactiveWidget（#714 / #713）**：`app/layout.tsx` viewport 加 `viewportFit: 'cover'` 讓 `env(safe-area-inset-*)` 在 Android edge-to-edge 解析到實際值（否則塌成 0、靜默關掉 safe-area offset）；加 `interactiveWidget: 'resizes-content'` 讓軟鍵盤開啟時縮 layout viewport，`dvh` Sheet 跟著鍵盤走。
- **overscroll / tap-highlight / CJK fallback（#715, #713）**：`html, body` 加 `overscroll-behavior: none` 擋下拉重整與回彈、`SheetBody` 加 `[overscroll-behavior:contain]` 擋 scroll chaining；全域 `-webkit-tap-highlight-color: transparent`；`--font-sans` fallback chain 補 JP / SC 系統字型，ja / zh-CN 缺字時改用原生 CJK face 而非 tofu。

## [1.1.5] - 2026-05-21

主題：**分頁載入改用 skeleton 骨架畫面**——承接 v1.1.4 (#690) 的載入過場工作，把四個主分頁原本共用的全螢幕 dim/blur 遮罩換成各自對應版面的 skeleton 骨架載入畫面（#710），讓載入過程更貼近實際內容、不再有黑屏閃爍。
完整 diff：[v1.1.4...v1.1.5](https://github.com/redtear1115/oikos/compare/v1.1.4...v1.1.5)

### 使用者可見變化

- **分頁載入骨架畫面（#710）**：切換儀表板 / 紀錄 / 愛物 / 設定四個主分頁時，載入期間改顯示對應分頁版面的 skeleton 骨架（儀表板：BrandHeader → BalanceHero → 篩選列 → feed；紀錄：月份切換 → 統計列 → 紀錄列；愛物：標題 → 愛物卡片；設定：頭像名稱 → 設定列），取代先前的全螢幕 dim/blur 遮罩，過場更貼近實際內容、不再黑屏閃爍。

### 技術變更

- **四分頁 loading.tsx 改 per-page skeleton（#710）**：dashboard / records / assets / settings 的 `loading.tsx` 從共用的全螢幕 overlay 改成各自的 skeleton，皆為純 Server Component（無 `'use client'`），用 Tailwind + CSS variable token（`--bg` / `--surface` / `--hairline`）+ `animate-pulse`，對齊既有 `DashboardFeedSkeleton` pattern；移除 v1.1.4 #690 的 overlay（PR #708 一併關閉）。

## [1.1.4] - 2026-05-21

主題：**設計系統收尾 + 前端品質續推 + 兩處 UX 微調**——承接 v1.1.2~v1.1.3 的 design system 工作，把 asset-sheet 最後 8 個殘留 raw `<input>` 收進 TextInput primitive（#695），完成 primitive 遷移；同時把 MonthlyStatsBars 的 chart 專用色抽成 `lib/chartPalette.ts` 單一 source of truth（#693）、arbitrary decimal font size 對齊 text scale token（#694）、~735 行的 Dashboard.tsx 拆成多個 sub-component（#696）。UX 面把 BottomNav 內容列高度從 56px 提到 64px 改善觸控目標（#689），並在四個主分頁切換時加上 dim+blur 載入遮罩讓過場更明確（#690）。
完整 diff：[v1.1.3...v1.1.4](https://github.com/redtear1115/oikos/compare/v1.1.3...v1.1.4)

### 使用者可見變化

- **底部導覽列更好按（#689）**：BottomNav 內容列高度從 56px 提到 64px，每顆分頁按鈕 min-height 64px，更貼合觸控目標標準；底部 safe-area home-indicator 區維持不變。
- **分頁切換載入遮罩（#690）**：切換儀表板 / 紀錄 / 愛物 / 設定四個主分頁時，新分頁載入期間蓋一層淡淡的 dim + blur 遮罩，過場更明確（紀錄頁原本的 skeleton 改用同一套遮罩）。

### 技術變更

- **Design system primitive 遷移收尾（#695）**：asset-sheet body（Child / Pet / Plant / Insurance）殘留的 8 個 raw `<input>`（6 個日期選擇 + 2 個 Child PII 欄位）改用 TextInput primitive，補上共用 focus ring / border / error state，對齊已遷移的 sibling 欄位（#670 §3.3）。
- **Chart 專用色票抽出（#693）**：MonthlyStatsBars 的 chart-only 色（per-asset hash palette / 未歸屬 fallback / active bar track）抽成 `lib/chartPalette.ts`，donut 與 detail bars 共用單一 source of truth；分類／收入分類 slice 色仍留在各自 domain 檔。
- **Text scale token 對齊（#694）**：arbitrary `text-[13.5px]` / `text-[14.5px]` snap 到 design system scale（13.5 → `text-meta` 14、14.5 → `text-body` 15）；sign-in 的 responsive base 維持 `text-meta` 讓 `lg:text-body` bump 保留。
- **Dashboard.tsx 拆檔（#696）**：~735 行的 Dashboard.tsx 把 L3 filter row、member dual-toggle helpers、transaction feed + skeleton 抽到 sibling 檔（`MemberDualToggle.tsx` / `DashboardFilterRow.tsx` / `DashboardFeed.tsx`）；純結構搬移，零 UI / props / 邏輯變更。
- **文件**：CLAUDE.md 色票章節補 `lib/chartPalette.ts` 參照（doc-keeper sweep）。

## [1.1.3] - 2026-05-20

主題：**品質打磨 — UX / 前端 / SEO 三輪 audit + design system 續推 + bug 修正**——承接 v1.1.2 的 design system primitives，把 TextInput / Button / FilterSheet 正式收進共用 primitive（#670），同時跑了三輪 audit：前端設計 audit #2（a11y / token / perf / RSC quick wins）、UX round 1（copy / ARIA / safe-area / error 頁）、SEO audit #2（JSON-LD 去重、HowTo schema、SERP 文案長度、footer 法務連結）。另修兩個使用者可見 bug：dashboard L3 篩選器文案語意不一致（#679）與旅行列表載入失敗（#685）。
完整 diff：[v1.1.2...v1.1.3](https://github.com/redtear1115/oikos/compare/v1.1.2...v1.1.3)

### 使用者可見變化

- **旅行列表不再「載入旅行失敗」（#685）**：`listAllTrips` / `listActiveTrips` / `listTripRecords` 三個 query 漏了 `await`，回傳 query builder 而非資料、讓旅行頁直接報錯；補上 await 後恢復正常。
- **Dashboard 篩選器文案語意修正（#679）**：付款人 toggle 文案對齊 records 篩選（「我 / 對方」）；負擔 toggle 改用「算我的 / 算對方的」，反映它篩的是「誰實際負擔」而非分攤類型，避免與「全付」語意混淆。多選全開＝不篩選的互動維持不變。
- **對方記帳即時提示 + 金額輸入游標修正（#671）**：對方新增一筆時跳 realtime toast；金額輸入框游標位置 bug 修掉。
- **SEO 收尾（#669）**：/migrate 頁補 HowTo JSON-LD；landing 與 /migrate footer 連到 /terms 與 /privacy；標題／描述長度修到 SERP 不截斷；sitemap lastmod / favicon / OG 形狀對齊。
- **介面細節打磨（UX audit round 1）**：copy 用詞、ARIA 標註、iOS safe-area、error 頁 digest 一輪修正。

### 技術變更

- **Design system adoption（#670）**：TextInput / Button / FilterSheet 收進 v1.1.2 建立的共用 primitive。
- **前端設計 audit #2（#670）**：a11y（toggle 補 `aria-pressed`、裝飾性 SVG 補 `aria-hidden`）、token（`on-fill` / z-layer / text scale 對齊）、perf（剩餘 sheet lazy-load）、quick wins（tokens / RSC / copy）。
- **JSON-LD schema 去重（#669）**：移除重複注入的結構化資料。
- **文件 audit（#667）**：research docs 更新、Domain Model 同步現況 schema、spec frontmatter 修正、v0.x 歷史精簡（doc-keeper sweep #668）。

## [1.1.2] - 2026-05-19

主題：**Design system primitives + 前端品質重構 + SEO 收尾**——issue #629 的 design system phase 0：token layer（control-height / sheet-spacing / focus-ring）+ Button / TextInput / Sheet 三組 primitive 一次到位，pilot 用 `InstallGuide` 驗 API，接著把 SettlementSheet / IncomeSheet / RecurringRuleSheet / AddSheet 4 個重點 sheet 收進來。issue #610 的前端品質重構同步推一輪（lazy-load sheets / SVG 改 server / CSS token 取代 hardcoded `#fff` / Dashboard state → useReducer / wizard 共用 hook 與 widget 抽取 / 統一 CSV parser 層 / 刪除 dead banner），把先前累積的 ad-hoc 樣式與 client boundary 清乾淨。SEO 收尾把 /migrate cross-link / 標題長度 / FAQ JSON-LD per-locale / GSC verification 補齊，承接 v1.1.0~v1.1.1 的 /migrate 站台。
完整 diff：[v1.1.1...v1.1.2](https://github.com/redtear1115/oikos/compare/v1.1.1...v1.1.2)

### 使用者可見變化

- **Sheet header / button / input 視覺一致化（#629, #649, #650, #651, #652, #653）**：先前 SettlementSheet / IncomeSheet / RecurringRuleSheet / AddSheet 各自的 padding、radius、按鈕 hover、focus ring 各做各的（11 種 button radius、3 種 input padding、`px-4`/`px-5`/`px-6` 與 `pb-6`/`pb-8`/`pb-12` 混用）；本版收進共用 Button + TextInput + Sheet primitive，視覺對齊；SheetHeader 也加上 leading slot 與 3-column centered variant 處理「左 icon + 中 title + 右 close」格式。
- **/migrate landing 多了「來自其他來源？」cross-link 區塊（#612）**：每條 /migrate 頁底新增 cross-link 卡片，把另外兩條 /migrate 頁列出來，方便 Honeydue / Spendee / CWMoney 三條 landing 之間互通。
- **Landing 補了 /migrate/* 內部連結（#613）**：landing 頁多了一段 trust copy 連到三條 /migrate 頁，給「正在找替代品但還不知道 Futari 是什麼」的訪客一條順路。
- **/migrate 頁標題不再被 SERP 截斷（#614）**：三條 /migrate 頁 title 長度縮到 ~50 chars 內，避開 Google SERP 60 char 截斷。
- **FAQ JSON-LD 每個 locale 各吐一份（#611）**：landing FAQPage JSON-LD 拆成 per-locale 注入（`inLanguage` 對應頁面 locale），讓 4 語 Google rich result 都抓得到，而不是只有 zh-TW 那份。

### 技術變更

- **Design system phase 0：token layer + primitives（#629）**：
  - Tokens (`app/globals.css`)：`--control-sm/md/lg`（36/44/52px）+ `--sheet-x/y-top/y-bottom`（20/16/24px）+ `--input-bg` + `--focus-ring-color` + `@utility oik-focus-ring` + `.oik-btn` / `.oik-input-wrapper`。
  - `components/ui/Button.tsx` — 4 variant（primary/secondary/ghost/danger）× 3 size（sm/md/lg）+ loading state（`aria-busy` 鎖 accessible name）。
  - `components/ui/TextInput.tsx` — 包 `leftAddon` / `rightAddon` slot + error state + 共用 focus ring。
  - `components/ui/Sheet/SheetHeader.tsx` / `SheetBody.tsx` / `SheetFooter.tsx` — header 標準（title row + 可選 centered 3-column variant）、body（scrollable）、footer（sticky + iOS safe-area handling）。
  - Pilot migration（`InstallGuide.tsx`）驗 API，接著 SettlementSheet（#650）/ IncomeSheet（#649）/ RecurringRuleSheet（#652）/ AddSheet（#651）四個重點 sheet 全部收進來。
  - Spec：`docs/superpowers/specs/design-system-primitives-design.md`（first_shipped_in v1.1.2）。
- **前端品質重構 (#610 umbrella) — code quality 一輪**：
  - **Bundle / boundary**：lazy-load sheet components via `next/dynamic`（#616）；SVG icon components 拿掉 `"use client"`（#630）；`SettingsContent` client boundary 收窄（#631）。
  - **Token / style**：hardcoded `#fff` / `bg-white` 改 CSS token（#620，承接 token layer 工作）；recurring sheet 的 Tailwind arbitrary value 移進 `@theme inline`（#621）。
  - **Hook / widget 抽取**：`useWizardSteps` 共用 hook（#624）；`WizardNavButtons` + `SectionCard` 統一（#618）；`CsvFileUploadWidget` 抽出（#619）；wizard CTA i18n key 統一 + 刪掉 orphan `autoSuggested`（#632）。
  - **State 結構**：`Dashboard.tsx` 多個 useState → `useReducer`（#626）；FilterSheet / RecordsList / BalanceHero state cleanup（#627）。
  - **共用 component / lib**：income vs expense `RecurringRuleSheet` merge 成同一個（#625）；CSV parser / detector 收進 `lib/csvImport/`（#623）。
  - **Dead code / 防呆**：刪除 `OfflineBanner` / `PastEpochBanner`（#617）；stats view + sheets 拿掉冗餘 type assertion（#628）；`useTranslations()` stable-reference contract 補 test 鎖死（#622）。
- **SEO 收尾**：
  - `MigrateOtherSources` server component（#612）— 每條 /migrate 頁底吐 cross-link card。
  - Landing → /migrate/* 內部連結（#613）。
  - /migrate page title 縮短（#614）— 平均 ~48 chars，避開 SERP 截斷。
  - FAQPage JSON-LD per-locale 注入（#611）— `inLanguage` 對應頁面 locale。
  - Google Search Console verification meta tag（#615）— `app/layout.tsx` 加 `<meta name="google-site-verification">`，前面 SEO 工作才有量測基礎。

## [1.1.1] - 2026-05-19

主題：**CSV 匯入續做（Spendee / 銀行對帳單 / OFX / QIF）+ /migrate SEO 強化**——把 v1.1.0 的 CSV import + /migrate landing pages 再推一輪。CSV mapper 修了 Spendee Transfer row 被誤分類成收入的 bug，並補銀行對帳單 → Futari 通用格式的 .xlsx 轉換模板（#585）；新增 OFX + QIF parser，把 `.ofx` / `.qif` 也走同一條 import pipeline（#586，Moze 樣本待補）。SEO 面把 /migrate 三條 landing 加 BreadcrumbList + FAQPage JSON-LD（#593, #599）、長尾關鍵字（Honeydue/Spendee/CWMoney 替代方案）+ Futari vs source app 比較表（#599）、sitemap/robots 對齊（#595, #596）、hreflang 行為鎖 regression test（#594）、meta description + og:description 4 語對齊（#597）、H1 下方 body 自然帶入「伴侶／夫妻記帳」關鍵字（#598）。
完整 diff：[v1.1.0...v1.1.1](https://github.com/redtear1115/oikos/compare/v1.1.0...v1.1.1)

### 使用者可見變化

- **Spendee Transfer row 不再被誤分類成收入（#585）**：Spendee 的 amount 永遠是正數，先前的 amount-sign fallback 會把所有 Transfer row 標成收入；改成 `type` 保持 undefined 讓 validator 直接 surface 給用戶在 preview wizard 確認。順手補 Spendee 標準分類同義詞（Food & Drinks / Life & Entertainment / Vehicle / Financial expenses / Communication / Others）。
- **銀行對帳單 → Futari Excel 轉換模板（#585）**：3-sheet `.xlsx`（轉換表 / 常見銀行欄位對照：台新・中信・國泰・玉山・富邦 / 類別建議 ~24 常見字串）。從 /migrate 入口下載，用戶在 Sheet/Excel 把銀行 CSV 對映成 Futari 通用格式再上傳。模板位置 `/bank-statement-template.xlsx`。
- **OFX + QIF 格式支援（#586）**：可直接拖 `.ofx`（OFX 1.x SGML + 2.x XML）或 `.qif`（line-oriented、`^` 分隔 record）進 import wizard；content-sniff + 副檔名 fallback。每 row 走原本的 `validateRow` pipeline，錯誤訊息形式與 CSV 匯入一致。Moze 樣本待補。
- **Spendee /migrate 頁多了 CSV header 預覽（#585）**：step 1 直接看到 Spendee CSV 欄位範例 + Transfer caveat（不必先匯出才知道格式長什麼樣），IA 對齊 cwmoney step-2 的寫法。
- **/migrate landing 多了 FAQ + 比較表（#599）**：每條 /migrate 頁底新增「常見問題」block（4 題：3 共通 + 1 source-specific）和 5 列 Futari vs source app 比較表（tone-driven cell colors）；同時吐 per-locale `FAQPage` JSON-LD（`inLanguage` 對應 page locale）讓 Google rich result 抓得到。
- **/migrate landing 多了 breadcrumb（#593）**：兩層 BreadcrumbList JSON-LD（Home → 來源頁），每條 /migrate 頁都有；首頁原本已有 WebSite/Organization/SoftwareApplication/FAQPage，本版補齊 migrate 那塊（避開 /migrate index 因該頁不存在會 fail Google validation）。
- **搜尋找到 Futari 更容易（#597, #598, #599）**：landing description 改寫到 70–80 chars（zh）/ ~155 chars（en）/ ~70 chars（ja），自然帶入「伴侶記帳 / 夫妻記帳 / 共同帳本」；H1 下方 body 加「為伴侶與夫妻設計的共同記帳」（zh-TW 主稿，4 語同步：en `shared ledger for partners and couples`、ja `夫婦・カップルのための共有家計簿`）；/migrate 三條頁 title/description 補長尾關鍵字（Honeydue 替代方案 / Spendee 伴侶記帳替代 / CWMoney 資料匯出匯入）。Tone 維持「有溫度的清醒」，零 conversion 語言、零「追蹤」/「管理」。

### 技術變更

- **CSV mapper Spendee polish（#585）**：`mapSpendee` 讓 Transfer row 的 `type` 保持 undefined（不再走 amount-sign 推測）；補 Spendee canonical category 同義詞表。`mapper.test.ts` 加 case lock 行為。
- **OFX + QIF parser（#586）**：新增 `lib/csvImport/ofxParser.ts`（OFX 1.x SGML leaf-tag-without-close + 2.x XML，抽 STMTTRN 的 TRNAMT / DTPOSTED / MEMO|NAME，負 TRNAMT → expense）+ `qifParser.ts`（`^` 分 record，D/T/M/P/L 單字母欄位，日期 US M/D/YYYY、M/D/YY pivot 50、apostrophe M/D'YY、ISO YYYY-MM-DD，transfer notation `L[Account]` 忽略避免污染同義詞）。`detector.ts#detectFormat(text)` content sniff `DetectedSource` 加入 `'ofx'` / `'qif'`；`processFile` 也認 `.ofx` / `.qif` 副檔名 fallback。新增 `ofx.test.ts`（188 LOC）+ `qif.test.ts`（212 LOC）+ 更新 `detector.test.ts`。
- **銀行對帳單 .xlsx 模板（#585）**：`scripts/build-bank-statement-template.py`（354 LOC）產生 3-sheet `.xlsx` 放 `public/bank-statement-template.xlsx`。
- **`MigrateFaq` + `MigrateComparison` + `MigrateBreadcrumbJsonLd` server components（#593, #599）**：三個 server component 收在 `app/[locale]/migrate/_components/`，FAQ 吐 per-locale `FAQPage` JSON-LD + visible Q/A list；Comparison 5×N table 用 tone-driven cell color；Breadcrumb 吐兩層 `BreadcrumbList`。3 個 /migrate page 各掛一份。
- **sitemap + robots align（#595, #596）**：`robots.ts` 每個 locale variant 加 `/sign-in` disallow + `/migrate/` explicit allow，給未來 /migrate/* 成長保留清楚 crawl signal；`sitemap.ts` 移除 /sign-in 條目（與 robots disallow 衝突）、三條 /migrate landing 升 priority 0.8。新增 `tests/seo-sitemap-robots.test.ts`（80 LOC）鎖 invariants：migrate 在 sitemap、/sign-in 不在 sitemap、robots disallow /sign-in 與 /api/、explicit allow /migrate/、Sitemap directive 存在。
- **hreflang regression test（#594）**：實作已隨 #567 在 v1.1.0 上線（live 驗證過 4 語 + x-default 在 / / /sign-in / /migrate/* / /terms / /privacy 全部 present），本版補 `tests/i18n-seo.test.ts`（104 LOC）鎖 `lib/i18n/seo.ts#buildAlternates(path, locale)` 行為，避免未來 regression。
- **meta description + og:description（#597）**：4 語 landing + /migrate 三頁同步；長度依語言調整，brand tone 鎖死（無 conversion 語言、無禁用詞）。
- **landing H1 body keyword 帶入（#598）**：H1 主標題保留「兩個人，一本帳。」，把 SEO 關鍵字塞 H1 下方 body copy；ja「夫婦・共有・家計簿」確認為日本家計簿 app 標準漢字用法（無誤觸 ja-i18n 白名單）。
- **i18n 4 語同步**：zh-TW 主稿；en / ja 多處 marked `TODO(#599): pending native review` per project rule。

## [1.1.0] - 2026-05-18

主題：**CSV 匯入歷史紀錄 + /migrate 站台（#51）**——換 app 最大的摩擦是「過去三年的紀錄怎麼辦」。Futari 提供通用 CSV 匯入（schema + parser + dedup + 預覽 wizard）和 CWMoney → Futari Excel 轉換模板（#557），讓 Honeydue / Spendee / CWMoney 出走者把歷史資料帶進來不用重打。順手做 /migrate/{honeydue,spendee,cwmoney} 三條 SEO landing 頁，把「Futari 是替代品」這件事說清楚。順帶 perf 優化把 landing 從 render-blocking 字型 chunk 解放（#572），LCP 7076ms → 2345ms、Lighthouse 61 → 98；修 dashboard 右上角小飛機按鈕點了沒反應的 bug（#587）。
完整 diff：[v1.0.5...v1.1.0](https://github.com/redtear1115/oikos/compare/v1.0.5...v1.1.0)

### 使用者可見變化

- **CSV 匯入歷史紀錄（#51, #552–556）**：上傳通用格式 CSV，系統做欄位驗證、hash-based dedup，跑完進入 preview wizard 確認 category / 預設付款人 / 跳過個別 row，最後一鍵寫入帳本。匯入 row 標記 imported_at + source 留 audit；不會自動還原 GroupBalance（來源 app 的金錢歸屬規則不同）。
- **CWMoney → Futari Excel 轉換模板（#557）**：提供 .xlsx 模板（公式驅動），用戶在 Sheet/Excel 把 CWMoney CSV 對映成通用格式再上傳。模板放在 /cwmoney-template.xlsx，從 /migrate/cwmoney step 2 直接下載；修了一個 auth redirect 把模板擋在登入後的 bug（#575）。
- **/migrate landing 頁（Honeydue / Spendee / CWMoney）**：三條 SEO landing 頁，每條都有 hero（italic Fraunces kicker + brand mark）、「為什麼 Futari」differentiator 區塊、3 步驟匯入 guide（italic Fraunces 01/02/03 numerals）、trust 區塊 + footer。Honeydue 附「自 2024 年起已由原團隊轉手」客觀背景說明（hairline-bordered italic callout，不攻擊性）。CWMoney 把模板下載折進 step 2，避免兩顆 CTA 競爭。設計細節見 #577–#583。
- **Landing 載入更快（#572）**：Noto Sans TC 從 root layout 移到 dashboard layout，landing 不再下載 ~190KB @font-face CSS chunk。Mobile-simulate Lighthouse：LCP 7076ms → 2345ms、perf 61 → 98。
- **Dashboard 右上角飛機按鈕修好了（#587）**：沒有 active trip 時右上的小飛機按鈕點下去現在會跳出新增旅行 sheet（先前是 no-op placeholder）。順便把圖示換成 Lucide `Plane` 真實客機輪廓。

### 技術變更

- **CSV 匯入 stack（#552–556）**：新增 `ImportBatches` / `ImportErrors` table；client-side 通用 CSV parser + 欄位 validator（`lib/csv/`）；hash-based dedup（同檔重傳 short-circuit、跨檔交叉檢核同 row）；server action 落地 batch + transaction 寫入；preview wizard 做類別 mapping + 預設 payer 選擇。
- **/migrate shared layout + components（#561, #584）**：`app/[locale]/migrate/_components/` 收 `MigrateHero` / `MigrateTool` / `MigratePreviewCard` / `MigrateSteps` / `MigrateDifferentiators` / `MigrateIntroCallout` / `MigrateTrustFooter`。三條頁面從 shared layout 組裝；i18n 4 語同步（zh-TW 主稿；ja 依 ja-i18n skill 漢字白名單檢核）。
- **Noto Sans TC scope 收斂（#572）**：`Noto_Sans_TC({ preload: false, display: 'swap' })` 從 root layout 移到 `app/(dashboard)/layout.tsx`，landing path 不再 fetch 那 ~11 個 unicode-range woff2 chunks。Onboarding (`app/onboarding/`) 改 system-ui fallback（接受小幅 first-visit 視覺 regression 換 perf）。
- **Dashboard 飛機按鈕 wire（#587）**：`Dashboard.tsx` 加 `tripSheetOpen` state，mount sibling `<TripSheet>`；`PaperPlaneIcon` → `PlaneIcon`（Lucide `Plane` path）；`BrandHeader` + `ActiveTripBanner` 兩處同步 rename。
- **docs cleanup**：CLAUDE.md 去重、README 重新整理；CHANGELOG 把 v0.x 收成 collapsible；breaking changes 區塊標明；csv-import-design.md frontmatter 改 shipped + first_shipped_in v1.1.0。

## [1.0.5] - 2026-05-18

主題：**三大入口 header / filter 統一（#545）**——Dashboard / Records / Assets 三頁 L1Header 規格對齊；Records L2 三 tab 收成「支出 + 收入」雙 toggle 並把月份切換改成 month picker popover；Dashboard 拆掉多餘 FilterSheet，payer / 負擔兩維直接做成 L3 雙 toggle，順手把「分攤」語意修成正確的 viewer × payer 負擔 cross-product；定期收支入口從 feed 中間 card 移到 L1 右側；愛物頁類型篩選改成 icon-only chip + 篩到空 bucket 的智慧 CTA。
完整 diff：[v1.0.4...v1.0.5](https://github.com/redtear1115/oikos/compare/v1.0.4...v1.0.5)

### 使用者可見變化

- **Records 篩選改雙 toggle（#548, #545 §3）**：「全部 / 支出 / 收入」三顆獨立 tab 改為「支出 + 收入」兩顆 toggle，包在同一外框 pill 內。兩顆都選中 = 全部、只選一顆 = 單一篩選；不允許兩顆都取消。
- **Records 月份切換改 month picker（#548）**：原本的「‹ 月 ›」左右箭頭改成 month picker — 點月份展開 popover（含年份左右切換 + 3×4 月份 grid），可直接跳到任意月份。
- **Dashboard 簡化篩選（#548, #545 §2）**：移除 L3 上多餘的「篩選 ›」chip 與 FilterSheet lite-mode 入口；payer 與「誰負擔」兩維直接做成 L3 雙 toggle（「我付 + 對方付」/「我負擔 + 對方負擔」），solo 模式整個 L3 row 隱藏。
- **「負擔」語意修正（#548）**：單獨選「我負擔」現在會包含 half / weighted 兩種 ratio-based 模式中 viewer 也確實負擔的記錄（不是只篩 `all_mine`）；正確語意 = viewer 最終承擔的記錄（cross-product of paid_by × split_type）。
- **定期收支入口上移（#548, #545 §4）**：原 Records feed 中間的 `RecurringSectionCard` 移除，改成 L1 右側「定期 ›」連結，點擊直接導 `/settings/recurring`，不再插隊在 feed 中間。
- **愛物類型篩選改 icon chip（#547, #545 §5）**：7 顆篩選 chip（全部 / 房 / 車 / 孩 / 寵 / 植 / 物）改成 40×40 icon-only chip，active 時填對應愛物主色、inactive 顯該類型主色，視覺對齊 list rail / cards 同一 hue family。
- **愛物空狀態 CTA（#547, #545 §6）**：移除 car-specific 永久顯示的虛按鈕；改為「篩到單一類型且 bucket 為空」時才顯示對應「新增 OO」虛按鈕，點擊直接開到對應類型 sheet body。
- **觸控目標 ≥44px（#548 polish）**：MonthSwitcher 年份箭頭與 trigger 雖然視覺維持 32–34px，但用 ::before pseudo 把 hit area 撐到 ≥44px，對齊 WCAG / iOS HIG（同 SettleButton 既有作法）。

### 技術變更

- **L1Header 規格統一（#548, #545 §1）**：Dashboard `BrandHeader`、`RecordsList`、`AssetsListClient` 三處 L1 統一為 `pt-[max(env(safe-area-inset-top),24px)] px-5 pb-3` + `flex items-center justify-between`，title 維持 serif `text-2xl font-medium tracking-tight`。L2 pill 三頁統一 `h-8` + `font-medium`，active 字重 600；視覺語彙 L2 = solid ink、L3 全部 = bordered ink、L3 per-type = asset hue 三層分明。
- **`tab` state 重構（#548, #545 §3）**：Records 頁內部 state 從 `'all' | 'expense' | 'income'` 改成 `Set<'expense' | 'income'>`；downstream 的 `TabContext`（FilterSheet / MonthlyStatsView / feed loader / drill 邏輯）仍是原本三選一 enum，由 `selectedKinds` 推導，零 downstream 改動。
- **新增 `burden` filter dim（#548 6th review）**：`TxnFilter` 加 `burden: 'all' | 'mine' | 'theirs'` 表達 payer × split cross-product；`ResolvedTxnFilter.burden` 含 viewerId + partnerId，SQL `_predicates.ts#burdenClause` 處理 4 個 callsite（listTxnsPaged / listFeedAllPaged cash / statsScopeClauses / income branch），income + settlement 在 burden 啟用時 short-circuit；`matchesFilter` in-memory matcher 同步；URL 序列化加 `fBurden`。Dashboard L3 split state 改寫 `burden` 不再動 `split` 維。
- **`MemberDualToggle` 抽出（#548 4th review）**：`PayerDualToggle` 與 `SplitDualToggle` 共用底層 pill UI，吃 left/right Side token + viewer/partner 色，兩個 wrapper 各自負責 value ↔ Side 對映。
- **MonthSwitcher popover portal 化（#548 2nd review）**：透過 `createPortal` 到 `document.body` 跳出 sticky header 的 `overflow-x-auto` clip 範圍；用 fixed position + `getBoundingClientRect` 追 trigger，open 時掛 scroll / resize listener；pointerdown 同時看 trigger 與 portalled popover 兩邊避免 portal 化後誤判點外部。
- **`RecurringSectionCard.tsx` 刪除（#548, #545 §4）**：整支檔案刪掉，無其他引用。
- **TYPE_CHIPS icon 化（#547, #545 §5）**：愛物 chip 改用 `AssetIcon` component，沿用 `--asset-color-{type}` token；「全部」chip 用 2×2 dots SVG；每顆 chip 加 `aria-label` + `aria-pressed`，鍵盤 / 螢幕閱讀器可辨識。
- **i18n 4 語同步**：新增 `assets.addHouse` / `addChild` / `addPet` / `addPlant` / `addItem`（智慧空狀態 CTA）、`assets.typeFilterAll`（chip aria-label）、`records.recurringShortcut`（L1 連結）、`records.monthPicker.*`（month picker UI）、`dashboard.splitFilter.{mine,theirs}`、`dashboard.payerMe` / `payerPartner` 改為短版「我 / 對方」；移除 `dashboard.payerAll` / `records.tabAll` / `splitFilter.shared`（不再有對應 UI）。

## [1.0.4] - 2026-05-17

主題：**前端 refactor 大掃除 + 效能優化**——清掉 `actions/` + `app/(dashboard)/` 累積的重複 / 巨大 component / 散落 helpers（#512 八個 PR），同時把首次載入跟靜態資源體積順手優化（#511 三個 PR + #517 一個 RLS 補洞）。零 schema 改動、零使用者 flow 變化，但啟動更快、icon 更小。
完整 diff：[v1.0.3...v1.0.4](https://github.com/redtear1115/oikos/compare/v1.0.3...v1.0.4)

### 使用者可見變化

- **首次載入更快（#518, #521）**：`next.config` 加上 AVIF/WebP image format 協商、Google Fonts preconnect；avatar 圖片改成 lazy load、guardian 模組改成 UA-gate 動態載入（沒開守護 beta 的客戶端不下載對應 chunk）。
- **App icon 變小 64–71%（#524）**：iOS / Android 主畫面 icon PNG 重新壓縮並加 WebP 變體；icon-512 從 382 KB → 112 KB、icon-192 從 63 KB → 23 KB。

### 技術變更

- **`lib/auth/asset.ts` + `lib/auth/member.ts` 抽出（#519, #512 pt 1）**：`actions/transaction.ts` / `income.ts` / `settlement.ts` / `tripExpense.ts` 內三份重複的 `assertAssetInGroup` / `assertMemberInGroup` 收歸統一 helpers；`lib/recurringActionHelpers.ts` 保留為 re-export shim 不破壞 recurring action imports。順手把「關聯資產」錯誤訊息統一為「關聯愛物」（CLAUDE.md 命名規範）。
- **`DateField` 統一（#520, #512 pt 2）**：dashboard sheet 與 asset sheet 兩份近似實作收成一個 `app/(dashboard)/_components/DateField.tsx`，card / inline 兩種變體用 `label` prop 判別；刪掉舊兩個檔案。
- **`lib/local-date.ts` 補三個 helper（#522, #512 pt 3）**：`todayLocalDate` / `daysBetween` / `parseLocalDate` 從 `InsuranceListItem.tsx` 內聯 helper 抽出，alongside 既有的 `localTodayISO` / `ymdToUTCNoon`。
- **`useSheetMutation` hook（#528, #512 pt 4）**：AddSheet + IncomeSheet 共用的 pending / error / confirmingDelete / runMutation / performDelete + race-resolution `onError` callback 收成 `app/(dashboard)/_components/useSheetMutation.ts`。TripSheet 的 error shape 不同（string | null + 與 sync validation 組合）未納入。
- **`useAssetSheetCommon` hook（#527, #512 pt 5）**：6 個 AssetSheet body（Car / Child / House / Insurance / Pet / Plant）共用的 name + notes + error + pending + open-reset effect + 350ms focus timeout + performDelete 收成 `shared/useAssetSheetCommon.ts`；每個 body 透過 `resetDomain` callback 重設自己的 domain 欄位。每個 body 約少 25 LOC。
- **MonthlyStatsView 拆檔（#529, #512 pt 6）**：791 LOC 拆成 `MonthlyStatsView.tsx`（376）+ `MonthlyStatsPieChart.tsx`（211）+ `MonthlyStatsBars.tsx`（237）；同時把 FilterSheet 的 `Section` / `Chip` / `AssetGroupSection` 抽到 `FilterSheetChrome.tsx`，FilterSheet 從 704 → 623 LOC。URL sync 留在 main component 內，不擴散到 chrome primitives。
- **`EndTripSheet` 抽出（#526, #512 pt 7）**：從 TripDetailClient 內 88 LOC 的 mini-form 提到 sibling 檔，parent 從 691 → 601 LOC。
- **MoF error map + recurring sync 註解（#525, #512 pt 8）**：`actions/invoice.ts` 的 `mapMofErrorToMessage` switch 改成 `const Record<string, string>`；`actions/recurringExpense.ts` + `recurringIncome.ts` 加 keep-in-sync header 註解。
- **`next.config.ts` hardening（#518, #511 phase 1）**：image AVIF/WebP format、mobile-first deviceSizes 收窄、Cache-Control headers 給 static assets、Google Fonts preconnect。零功能變更，純 config。
- **Avatar lazy + guardian UA-gate（#521, #511 phase 2）**：`<Avatar>` 加 `loading="lazy"` + `decoding="async"`，below-the-fold avatars（BottomNav / AvatarMenu / feed / settings）不再 eager fetch。Guardian module 改成 UA-check 動態載入，沒開 beta flag 的客戶端不下載對應 chunk。
- **PNG icons 壓縮 + WebP 變體（#524, #511 phase 3）**：512 / 192 icon 壓縮 64–71%，總共少傳 ~700 KB；加 WebP 變體讓 Accept-aware client 拿到更小檔。
- **`invites_select` RLS InitPlan 補洞（#523, #517）**：v1.0.3 的 0045 migration 漏到的 legacy `db/rls/policies.sql` 內 `invites_select` policy，0048 補上 `(select auth.uid())` wrap，Supabase advisor `auth_rls_initplan` WARN 完全清零。

## [1.0.3] - 2026-05-17

主題：**Supabase Advisor 全面清零**——把 security advisor 與 performance advisor 上累積的 RLS / SECURITY DEFINER / search_path / 多重 permissive policy 警告一次掃乾淨。沒有 schema 改動、沒有 UI 變化；其中 5 張表（CurrencyRates / PetDetails / PlantDetails / Trips / TripExpenses）原本因為缺 RLS policy，Realtime 訂閱者收不到 INSERT/UPDATE 事件，本版修好。
完整 diff：[v1.0.2...v1.0.3](https://github.com/redtear1115/oikos/compare/v1.0.2...v1.0.3)

### 使用者可見變化

- **Realtime 即時更新補齊（#504）**：愛物頁的寵物 / 植物細節、旅行子帳本、心理匯率表的變更，另一位伴侶現在會即時看到（過去需重整頁面）。

### 技術變更

- **補齊 5 張表的 RLS policy（#504, migration 0044）**：`CurrencyRates` / `PetDetails` / `PlantDetails` / `Trips` / `TripExpenses` 原本未啟用 RLS，anon role 無法 SELECT；Supabase Realtime 用同一套 RLS 做訂閱檢查，導致 client 端收不到變更事件。Server-side（postgres role）讀寫不受影響、不存在資料外洩，純 Realtime 沒接上。pattern 對齊 0023/0024/0030（`ENABLE RLS` + group-membership SELECT policy + `(select auth.uid())`）。
- **`auth.uid()` 全面包進 `(select ...)`（#505, migration 0045）**：剩餘 22 條 RLS policy 把 per-row 的 `auth.uid()` 改成 `(select auth.uid())`，planner 可以 hoist 成 InitPlan 每 query 只算一次。`CashTransactions` / `Settlements` / `GroupBalance` / 各 Detail table / `FuelLogs` / `IncomeTransactions` / recurring + pending 配對 / Invoice 三表 / MonthlyReview 配對 / PartnerQuiz 配對。USING / WITH CHECK 邏輯逐字保留，純機械改寫。
- **合併重複的 permissive SELECT policy（#506, migration 0046）**：三類 duplication 處理掉，advisor 5 條 `multiple_permissive_policies` WARN 清零。(1) `db/rls/policies.sql` 的舊版 `_select` policy 與 0005/0006 為 Realtime 加的 `_member_select` 在 OR-combine 下完全 dominated；(2) `invoice_creds_select`（任一成員可見）默默放寬了 0018 的 `invoice_credentials_owner_select`（owner-only，spec 明定「partner 看不到 barcode／驗證碼」），順手收緊（雲端發票功能未上線，無 client read，無風險）；(3) `profiles_self_select` + `profiles_partner_select` OR-merge 成 `profiles_self_or_partner_select`。同時把 3 張 Invoice 表從 `supabase_realtime` publication 移除（client 端從未訂閱）。
- **`rls_auto_enable` REVOKE EXECUTE（#502, migration 0043 → migration 0047）**：SECURITY DEFINER migration helper 不應該被 anon / authenticated 透過 `/rest/v1/rpc` 呼叫。0043 用了 `REVOKE FROM PUBLIC` 想跟 0023 對齊，但實測 Supabase 對 public-schema 函式預設直接 grant 給 anon/authenticated（不是只走 PUBLIC 繼承），所以 0043 對 advisor 而言是 no-op；0047 補上 direct REVOKE FROM anon, authenticated，advisor 兩條 `*_security_definer_function_executable` 清零。
- **pg_cron helper 固定 `search_path`（#501, migration 0042）**：`compute_next_occurrence` 與 `compute_monthly_review_snapshot` 用 `ALTER FUNCTION ... SET search_path = public, pg_temp`，對齊 0022 對 `handle_new_user` 的處理，advisor `function_search_path_mutable` 清零；用 ALTER 而非 CREATE OR REPLACE 是為了讓 function body 留在原 migration（0016 / 0026），避免將來改 body 時意外漂移。
- **`package-lock.json` 同步到 v1.0.2**：lockfile 在 v1.0.0 → v1.0.2 cycle 沒跟著 bump，`npm install` 下次跑時自動修正。

## [1.0.2] - 2026-05-17

主題：**Prod log 修復**——修正從 production log 發現的三類問題：RSC 導航繞過 layout guard、iOS apple-touch-icon 404、以及 Supabase security warning。

### 使用者可見變化

- **修復 RSC 導航 error state（#493）**：在 app 內部點選導航到 dashboard、紀錄、愛物頁面時，若 group context 遺失不再出現 error state，改為正確導向 `/onboarding`。
- **修復 iOS 主畫面圖示 404**：iOS 裝置請求 `/apple-touch-icon.png` 不再 404，主畫面 icon 正常顯示。

### 技術變更

- **RSC navigation group guard（#493）**：`dashboard` / `records` / `assets` / `assets/[id]` 四個 page 的 `if (!context) throw new Error('No group')` 改為 `redirect('/onboarding')`。RSC navigation（`_rsc=` 請求）不重新執行 layout，page 本身必須負責 guard。
- **`getCurrentUser()` 改用 `getUser()`（#494）**：消除 prod log 每次請求出現的 Supabase security warning（`getSession()` 從 cookie 讀取不驗證真實性）。
- **新增 `apple-touch-icon.png` / `precomposed`**：iOS 標準路徑 `/apple-touch-icon.png` 請求原本落入 `[locale]` dynamic route 回 404；將 `public/icons/` 的圖示複製至 `public/` 根目錄修復。
- **`InstallGuide` regression test**：補上 #490 修復的單元測試，防止 `TranslationsProvider` 缺失問題回歸。

## [1.0.1] - 2026-05-17

修復 `/setup` 頁面 500 錯誤：`InstallGuide` 元件在 `<TranslationsProvider>` 之外呼叫 `useTranslations()`，導致新用戶完成 Google OAuth 後無法進入建立帳本流程。

### 使用者可見變化

- **修復新用戶 /setup 500（#490）**：Google 登入後跳轉 `/setup` 不再 500，建立帳本流程恢復正常。

### 技術變更

- **`InstallGuide` 改接 `t` prop（#490）**：移除元件內部的 `useTranslations()` hook，改由 caller 傳入 `t: Translations`。`/setup` 在 `(dashboard)` layout 之外，沒有 `TranslationsProvider`，導致 SSR render throw；此修法讓元件在任何 context 下都能使用。

## [1.0.0] - 2026-05-17

主題：**公開 landing．接住歷史**——v1.0.0 把 Futari 從「兩個人的內部記帳工具」翻成「對外有臉面的產品」。`/` landing 全新三欄敘事（SEO 長文 + brand mark + 場景卡 + 部落格 feed），公開頁面改 URL-prefix locale routing（`/en` `/zh-CN` `/ja`），OG / Twitter / FAQ / SoftwareApplication / Organization JSON-LD 全套接好，品牌語氣與 i18n 全面收斂——任何陌生人從搜尋或社群點進來看到的，都是同一個產品聲音。沒有 schema migration，純前台 + SEO + copy。
完整 diff：[v0.17.6...v1.0.0](https://github.com/redtear1115/oikos/compare/v0.17.6...v1.0.0)

### 使用者可見變化

#### 公開 landing 三欄敘事（#416 #417 #418 #460 #482）

- **/sign-in 三欄結構**：桌機左欄七段 about narrative（每次造訪靜默輪播一段，#482）、中欄品牌 mark + Google CTA、右欄四張場景卡（#417）+ 部落格 feed（#460，從 southern-light.dev RSS 拉）。Mobile 自動垂直堆疊。
- **i18n landing narrative（#422）**：about narrative + feature cards 4 語齊備（zh-TW / zh-CN / en / ja）。
- **品牌語氣收斂（#474 #483）**：landing / sign-in / solo mode copy 對齊《品牌文案準則》（landing「有溫度的清醒」、sign-in「安靜的邀請」、solo「不預設等待焦慮」），禁用詞（管理 / 追蹤 / 監控 / 感嘆號）清查到 0 違規。

#### SEO 與分享

- ⚠️ **多語 URL-prefix routing（#400 #462）**：公開頁面（landing / sign-in / privacy / terms）改為 URL prefix `/<locale>`，每個 locale 都是獨立可索引 URL，搭配 hreflang alternates + sitemap per-locale 條目。
- **結構化資料齊備（#459 #467）**：landing 同時 ship WebSite / Organization / SoftwareApplication / FAQPage 四套 JSON-LD，全部跟著 locale 走。
- **OG / Twitter 預覽卡（#487）**：landing / sign-in / privacy / terms 全部接上 `og:image` 與 `twitter:image`（1200×630，`alt` locale-aware），LINE / FB / Slack / Threads 分享有圖。

#### 文件 / 流程

- **《品牌文案準則》（#478）**：CLAUDE.md 明定流量分層 × tone 對應、landing / sign-in / solo 寫作規則、app 內禁用詞、i18n 同步規則——任何動 copy 的 PR 之前都對照這份。
- **ja-i18n skill + 漢字白名單（#477）**：日文翻譯巡檢自動化，假陽性漢字白名單可從外部資料更新。

### 技術變更

- **i18n 完整覆蓋（#467 #468 #469 #471 #481）**：dashboard / public pages 殘存 hardcode 中文清完；zh-CN 213 個 + ja 68 個未翻譯 key 補完；intentional 空字串 key 加文件註記避免下次 audit 誤報。
- **每頁 `generateMetadata` 接 OG image（#487）**：`public/og-image.png` 從 #282 ship 但未 wire 進 metadata，造成 prod HTML 缺 `og:image` / `twitter:image`；本版 4 個 public page 各加 `openGraph.images` + `twitter.images`，`alt` 用 `t.title` locale-aware，無需新增 i18n key。
- **`settings.local.json` 列入 gitignore（#478）**：避免本地 hook / 權限設定外洩。

[Unreleased]: https://github.com/redtear1115/oikos/compare/v1.5.14...HEAD
[1.5.14]: https://github.com/redtear1115/oikos/compare/v1.5.13...v1.5.14
[1.5.13]: https://github.com/redtear1115/oikos/compare/v1.5.12...v1.5.13
[1.5.12]: https://github.com/redtear1115/oikos/compare/v1.5.11...v1.5.12
[1.5.11]: https://github.com/redtear1115/oikos/compare/v1.5.10...v1.5.11
[1.5.10]: https://github.com/redtear1115/oikos/compare/v1.5.9...v1.5.10
[1.5.9]: https://github.com/redtear1115/oikos/compare/v1.5.8...v1.5.9
[1.5.8]: https://github.com/redtear1115/oikos/compare/v1.5.7...v1.5.8
[1.5.7]: https://github.com/redtear1115/oikos/compare/v1.5.6...v1.5.7
[1.5.6]: https://github.com/redtear1115/oikos/compare/v1.5.5...v1.5.6
[1.5.5]: https://github.com/redtear1115/oikos/compare/v1.5.4...v1.5.5
[1.5.4]: https://github.com/redtear1115/oikos/compare/v1.5.3...v1.5.4
[1.5.3]: https://github.com/redtear1115/oikos/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/redtear1115/oikos/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/redtear1115/oikos/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/redtear1115/oikos/compare/v1.4.3...v1.5.0
[1.4.3]: https://github.com/redtear1115/oikos/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/redtear1115/oikos/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/redtear1115/oikos/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/redtear1115/oikos/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/redtear1115/oikos/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/redtear1115/oikos/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/redtear1115/oikos/compare/v1.2.5...v1.3.0
[1.2.5]: https://github.com/redtear1115/oikos/compare/v1.2.4...v1.2.5
[1.2.4]: https://github.com/redtear1115/oikos/compare/v1.2.3...v1.2.4
[1.2.3]: https://github.com/redtear1115/oikos/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/redtear1115/oikos/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/redtear1115/oikos/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/redtear1115/oikos/compare/v1.1.8...v1.2.0
[1.1.8]: https://github.com/redtear1115/oikos/compare/v1.1.7...v1.1.8
[1.1.7]: https://github.com/redtear1115/oikos/compare/v1.1.6...v1.1.7
[1.1.6]: https://github.com/redtear1115/oikos/compare/v1.1.5...v1.1.6
[1.1.5]: https://github.com/redtear1115/oikos/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/redtear1115/oikos/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/redtear1115/oikos/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/redtear1115/oikos/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/redtear1115/oikos/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/redtear1115/oikos/compare/v1.0.5...v1.1.0
[1.0.5]: https://github.com/redtear1115/oikos/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/redtear1115/oikos/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/redtear1115/oikos/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/redtear1115/oikos/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/redtear1115/oikos/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/redtear1115/oikos/compare/v0.17.6...v1.0.0
