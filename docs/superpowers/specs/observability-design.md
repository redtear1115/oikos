---
last_updated: 2026-09-19
status: shipped
first_shipped_in: v1.2.0
updates:
  - v1.5.11: 自 `CLAUDE.md` 搬入（入口檔固定 token 稅，#1086）；內容逐字保留，只改相對連結路徑
  - v1.5.13: 補「`first_record_created` 不是活化指標」這條邊界（#1127）
  - v1.5.15: 補「autocapture 不帶文字」這條邊界（#1267）
  - v1.5.17: 補「catch 住的錯誤只進 Sentry Logs」這條邊界（#1314）
  - v1.5.18: 補「Sentry 看不到原始網址、cookie、請求 body」這條邊界（#1274，v1.5.16 起生效）
related_specs: [conversion-analytics, product]
related_issues: ["#1018", "#1086", "#1127", "#1267", "#1274", "#1314"]
---

# 觀測的邊界與讀數據的紀律

> **做任何數據分析、引用任何事件指標之前先讀這份。** 觀測堆疊本身（Sentry / PostHog 掛在哪）在 `CLAUDE.md`「架構速查」；這裡只講「拿到數字之後會怎麼讀錯」。
>
> 原本住在 `CLAUDE.md`，因為只有做數據分析時才需要、卻每個任務都在付它的 token 稅而搬出（#1086）。

---

## 觀測的邊界（分析前必讀）

> 這幾條是結構性限制，不是資料不足。不知道的話會算出看似合理、實際無意義的數字——已經各發生過一次（#1018）。

- **server 與 client 事件不 join**：`captureServer`（`lib/analytics/server.ts`）用 userId 當 distinct_id；client 在 `person_profiles: 'identified_only'` + `persistence: 'memory'`（cookieless）下是匿名 id。跨兩邊的漏斗**算不出來**，單邊分析才成立。**症狀是查詢靜默回 0 筆、沒有任何錯誤**——那是結構限制，不是你 SQL 寫錯，也不是資料不足。
  - **例外：若兩邊事件都帶同一個業務 key，用那個 key 配對就能繞過 person 斷裂。** person 不通不代表事件無法關聯。實例：`invite_created` 與 `partner_joined` 都帶 `group_id`，藉此算出「建立群組 → 夥伴加入」的時間差（#1017），那是純 person join 拿不到的。**放棄之前先找有沒有共同的業務 key。**
- **`platform` 只在 client 事件上**：`detectPlatform()`（`lib/platform.ts`）在 SSR 回 `null`（server render 沒有平台可言）。server 端的 `signed_in` / `signed_up` 要改用 `path`（`web_oauth` / `ios_native`）分辨。所以「iOS 殼使用者的登入成功率」這類跨維度問題無解。
- **匿名訪客數是膨脹的**：cookieless 下每個 session 算新 person。已登入用戶走 identify 所以人數可靠。訪客絕對值不可用，只有同類頁面的**相對**比較有效。
- **維度不回填**：`platform` 自 v1.5.7 部署起才有，`path` 自 v1.5.6 起。更早的事件永遠沒有，事後無法用 SQL 補。
- **autocapture 事件不帶任何文字或屬性，`$el_text` 永遠是空的。** `mask_all_text` + `mask_all_element_attributes` 自 v1.5.15 起鎖死（#1267）：dashboard 的交易列把說明與金額渲染在可點擊元素裡，autocapture 預設會把那些字串送給 PostHog，而隱私權政策寫的是 `no third-party analytics tracking financial data`。autocapture 留下來的只有 tag、classes、`$elements_chain` 的位置、`$current_url`，以及連結的 `attr__href`。
  - **推論：「哪顆按鈕被點了」不能用 `$el_text` 問，要用具名 `track()` 事件。** 這不是 v1.5.15 才成立的紀律——#1015 就已經把邀請漏斗從 `$el_text` 反推改成具名事件（理由是文案一改就斷、而且只涵蓋 zh-TW）。現在只是從慣例變成結構。需要一個新的互動指標時，加一個 `track()` 埋點，不要想辦法從 autocapture 還原。
  - **失效的樣子是查詢回 0 筆，不是報錯。** 對 `$el_text` 下條件會安靜地 match 不到任何事件，看起來像「這個按鈕沒人點」而不是「這個欄位不存在」。v1.5.15 以前的事件仍然帶著文字，所以跨這個部署日的查詢會得到一條在 2026-09 突然歸零的曲線——那是遮罩上線，不是使用者行為改變。
- **Sentry 的 Issues 空白，不代表沒有錯誤：被 `catch` 住的錯誤只會出現在 Logs。** client 的 `consoleLoggingIntegration`（`instrumentation-client.ts`）把 `console.error` / `console.warn` 轉成 Sentry **Logs**，不會建 Issue。被 `try/catch` 接住、只 `console.error` 的錯誤，就只存在 Logs 資料集裡。
  - **失效的樣子**：Issues 頁面乾乾淨淨，PostHog 卻有失敗事件，看起來像「有東西壞了但沒留下任何錯誤」。#1314 就這樣被誤判成「錯誤內容沒被記錄」：iOS 殼 Google 登入的 `ChunkLoadError` 其實在 Logs 裡躺了四天。
  - 所以：追查 client 端的失敗時，Issues 和 Logs 都要查（`search_events` 用 `dataset: logs`）。要讓某條 catch 路徑被看見，就明確呼叫 `Sentry.captureException`，並先處理訊息裡的 URL query（client scrub 不會處理 exception 的訊息內容）。
- **Session Replay 在前端鎖死（`disable_session_recording: true`）。** PostHog 專案後台那個開關現在是無效的；要開必須先連同 replay 自己的遮罩（`session_recording.maskAllInputs` + `maskTextSelector: '*'`）一起改 code，因為上面那兩個選項管不到 recorder。
- **Sentry 的 request、breadcrumb、span、log 裡看不到原始網址、cookie、header、請求 body 與 client IP——但 exception 的訊息內容不經清洗。** 自 v1.5.16 起（#1274），client / server / edge 三份 Sentry config 的 `beforeSend` / `beforeSendTransaction` / `beforeSendSpan` / `beforeBreadcrumb` / `beforeSendLog` 全部走 `lib/observability/sentryScrub.ts`：網址套用與 PostHog 共用的 `lib/analytics/urlSanitizer.ts` 規則（路徑與 query key 保留，邀請 token 變 `:token`，非白名單 query 值變 `<masked>`），header / cookie / `request.data` 整段拿掉。所以「重現某個錯誤時的完整網址或 server action 參數」在 Sentry 上查不到，要從 issue 的路徑形狀與 stack 回推。錯誤訊息（`exception.values[].value`）不在清洗範圍內：丟出含 URL 的 `Error` 前要自己處理（同「catch 住的錯誤只進 Logs」那條的做法）。
  - **失效的樣子是沒有任何錯誤。** 某份 config 漏接一個 hook，原始網址與 cookie 會安靜地重新出現在 Sentry，而沒人會去那裡看；hook 自己 throw 時，`beforeSend*` 那幾個會讓 SDK 丟掉整筆事件，breadcrumb／log 的則漏給呼叫端。唯一會變紅的是 `tests/sentry-scrub-wiring.test.ts`。
- **UA 分不出平台**：iOS WKWebView 被 PostHog 歸類為 Mobile Safari（實測佔 iOS 流量 43%），原生殼／PWA／其他 App 內嵌瀏覽器三者在 UA 上同形。一律改看 `platform`。
- **`first_record_created` 不是活化指標，活化用 `record_created ≥ 1`。** 它的語意是「**viewer 記了自己付的那一筆**」——`isUserFirstNonDeletedRecord()`（`lib/analytics/server.ts`）數的是 `paidBy = viewer.id` 的列，所以**替伴侶記帳的人永遠不會觸發它**（#891 刻意如此）。那個語意對它原本的用途（#734 的啟用里程碑、`via` 分流）是對的，只是不等於活化。
  - 證據：90 天內 `record_created ≥ 1` 有 17 人，`first_record_created` 只有 11 人——差的 6 人確實在用產品，卻在活化口徑下被算成沒活化。
  - **失效的樣子不是查詢報錯，是活化率緩慢地、看起來很合理地往下走。** 雙人帳本愈多、其中一方主要替另一方記帳的比例愈高，分子就漏得愈多，而曲線沒有任何不連續。等到有人去追「為什麼活化率降了」，會先去查 onboarding，不會想到是口徑。
  - 小樣本上兩個口徑會**看起來一樣**（2026-09 的新客群裡剛好都是 8 人），所以「我算過，沒差」不能當成安全的理由。

---

## 讀數據的紀律

> 2026-09-12 一天之內有六個結論被推翻。**沒有一個是算錯數字。**

**第 0 條先做，它不需要判斷力：引用任何事件指標之前，先 grep 它的發送點。**

不是問「這個數字代表什麼」，是問「這行 `track()` 在哪、什麼條件下會跑」。實例：`landing_cta_clicked` 全站只有 `app/[locale]/_landing/LandingCtaLink.tsx:45` 一處發送，migrate 頁的 header 是裸 `<Link>`——所以被引用一整天的「migrate 頁 CTA 轉換率 26% vs 6.5%」，量的其實是「訪客願不願意退回首頁再點一次」。一次 grep、10 秒就能發現。

這條和下面三條性質不同：下面三條要你**在對的時機想起來**，而人不會知道自己正處在該用它的時機；第 0 條無條件執行，所以它不會失效。它擋掉的也是最貴的錯——不是讀錯數字，是**數字根本不是那個量**，而且那種錯沒有任何內部矛盾會讓人起疑。

其餘三條：

1. **極端值（0 / 1 / 100%）先問預期值。** 極端值最像洞見，也最常是誤讀。`import_completed` 90 天只有 1 筆看起來像功能壞了，實際上那個頁面從來不以它為 KPI（見 [PRODUCT.md](../../../PRODUCT.md) 的 Surface Intents）。先問「這個數字本來該長什麼樣」，再問它為什麼偏離。
2. **看到百分比，先還原成分子分母。** 分子是個位數或十位數時，任何比例都是雜訊。「手機 CTR 3.05% vs 桌機 6.20%」看起來像腰斬，實際是 8/262 vs 8/129，Fisher exact **p = 0.175**。`3.05%` 有三位有效數字、讀起來像精密測量——**百分比這個呈現格式本身隱藏了脆弱性**。同一件事寫成「262 次曝光只有 8 個人點」，任何人都會先問「8 個人夠判斷嗎」。
3. **下結論前，檢查手上是否已有能否證它的資料。** 不是缺資料，是資料在手上卻沒被用進判斷。

新增測量點會製造一個**看起來像成效的斷層**（例：#1027 補上 migrate 頁的 CTA 之後，`landing_cta_clicked` 會跳升，那不是改善，是終於有東西可以量了）。跨部署的前後比較一律無效，基準要從部署日重算。
