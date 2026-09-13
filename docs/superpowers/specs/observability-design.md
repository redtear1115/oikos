---
last_updated: 2026-09-13
status: shipped
first_shipped_in: v1.2.0
updates:
  - v1.5.11: 自 `CLAUDE.md` 搬入（入口檔固定 token 稅，#1086）；內容逐字保留，只改相對連結路徑
related_specs: [conversion-analytics, product]
related_issues: ["#1018", "#1086"]
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
- **UA 分不出平台**：iOS WKWebView 被 PostHog 歸類為 Mobile Safari（實測佔 iOS 流量 43%），原生殼／PWA／其他 App 內嵌瀏覽器三者在 UA 上同形。一律改看 `platform`。

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
