---
status: planned
related_specs: [trip-multi-currency, onboarding, transactions, conversion-analytics, locale-currency]
depends_on: [transactions]
related_issues: []
---

# Group Outing — 揪團出遊分帳（對外名稱待定）

> 一個短期、連結分享、多方參與的分帳本（類 Splitwise），作為 Futari 的擴散獲客漏斗頂端。

## 這是什麼

固定兩人的 Futari 用戶常會跟一群朋友短期出遊（吃一餐、一趟小旅行），需要 N 人之間分帳。現有 Trip 子帳本只服務夫妻兩人，無法涵蓋。**Group Outing** 是一個獨立的多方分帳本：Futari 用戶開局、丟連結，朋友（有/無帳號皆可）從連結加入、平分支出、看「誰該付給誰」。

它同時是**擴散工具**：無帳號的朋友跳過 onboarding 直接用，用得順之後自然轉換成 Futari 用戶。這符合品牌策略「前 1000 個用戶靠真實使用情境塑形」——是真實使用場景的有機擴散，不是自動化觸及。

## 給誰用

- **開局者**：已是 Futari 帳號用戶（夫妻其中一人或兩人）。
- **參與者**：開局者的朋友，混合「有 Futari 帳號」與「臨時無帳號者」。無帳號者是漏斗的轉換對象。

## 為什麼獨立成新子系統（不擴充 Trip / 不複用 Profile）

現有架構綁死「auth.users + Profile（1:1 mirror）+ 兩人 group + 二元 `split_type` + 純量 balance」。本功能在三處破例:**多方參與**、**匿名連結存取**、**N 方結算**。

- **不擴充 Trips/TripExpenses**:trip 表深度兩人化(`split_type` 二元、`paid_by` notNull→profiles、全程 auth-gated),且 trip 與 outing 的 auth 模型相反(trip 要登入、outing 走匿名連結)。為對外擴散工具去改已上線的內部功能,回歸風險高。
- **不複用 Profile 當參與者**:`Profiles` 1:1 mirror `auth.users.id`;塞進沒有 auth user 的 ghost row 會破壞此不變式(RLS、大量 join 都假設背後有 auth user),風險擴散到整個現有系統。

**Locked decision**:全新獨立實體集,參與者(`OutingParticipant`)與 `Profile` 解耦,認領時才 link。三個破例全關進新子系統,碰不到已上線的兩人核心。

## Entity 語意

> Schema 真相在 `lib/db/schema.ts`,此處只說語意。純函式引擎落在 `lib/outing/`(與主 app `lib/balance.ts` 平行,語意隔離:主 app 兩人純量、此處 N 人向量)。

- **`Outings`** — 出遊本體。`group_id` + `epoch_id`(折回歸屬用,與 Trip 一致)+ `created_by`(只有帳號用戶能開)+ `name` + `currency`(**單一幣別,建立後有支出即鎖**)+ `share_token`(加入連結)+ `status`(`active` / `settling` / `ended` / `archived`)+ `folded_at`(折回 idempotency)。
- **`OutingParticipants`** — 出遊裡的「一個人」,與 Profile 解耦。`display_name`(臨時朋友只有名字)+ `profile_id`(**nullable**;Futari 用戶才填、認領後補上)+ `claim_token`(此 slot 的操作/認領密鑰,存 cookie)+ `claimed_at`。夫妻兩人參與時即兩個 `profile_id` 已填的 participant。可標記 inactive(中途退出,不刪歷史)。
- **`OutingExpenses`** — 支出。`paid_by_participant_id`(任何參與者)+ `amount`(outing 幣別整數,依幣別小數規則同主 app)+ optional `description` / `category` + `entered_by_participant_id`(稽核:匿名多人寫入要可追)。
- **`OutingExpenseShares`** — 一筆支出分給誰(挑參與者)。`participant_id` + `share_amount`(寫入時就算好的平分整數,含餘數分配;落地存而非每次除,避免 rounding drift 且可稽核)。不變量:同一支出 `Σ share_amount === amount`。
- **`OutingSettlements`** — 出遊內還款。`from_participant_id` → `to_participant_id` + `amount`。

編輯沿用主 app 慣例:**soft-delete + insert**(匿名多人協作下保留「誰刪了什麼」軌跡,信任感較好)。

## 設計決策

### 分帳:平分 + 挑參與者
每筆支出選「誰付」+「分給哪些參與者」,系統平分。餘數逐分發給排序在前的 participant,保證 `Σ share === amount`。v1 **不做**自訂金額 / 份數比例(YAGNI;平分+挑人涵蓋約 9 成出遊場景)。

### 結算:最少筆數轉帳建議(debt simplification)
每人淨額 = `Σ付的 − Σ自己的 share + Σ收到的還款 − Σ付出的還款`(不變量 `Σ net === 0`)。在淨額向量上跑 greedy 最少轉帳(最大債務人配最大債權人),n 人最多 n−1 筆。非理論最佳(最佳為 NP-hard)但對真實出遊規模穩定夠用,業界(含 Splitwise)同此做法。

### 折回兩人主帳本:只折相互欠額,只折 balance
**Locked decision (a)**:出遊結束時,只把**兩位 Futari 成員彼此之間**的相互欠額折回主帳本,寫一筆 `Settlement`(對齊 `GroupBalance` 正負號慣例),讓兩人 balance 不失真。朋友的份額純在出遊內結清,不進主帳本。

相互欠額只取「一方付款、另一方消費」的交叉項 + 兩成員出遊內的直接還款;成員自己付自己消費的份額是個人花費,自然排除。

- 不採 (b)「再寫 summary CashTransaction 把出遊個人花費灌進主 app 統計」:outing 混了朋友的錢,(a) 語意更準;統計整合留待驗證後。Trip 走 (b) 因其全程都是夫妻的錢,情境不同。
- `member_b IS NULL`(solo)或只有一位成員參與 → 相互欠額為 0,不折回。
- 折回 idempotent,`folded_at` 防重折。

### 匿名存取 & 授權
所有寫入走 Server Action(主 app 既有 `Client → Server Action → Drizzle` 路徑),不開放 client 直連 DB。

- **加入**:點 `share_token` 連結 → join 落地 → 認領空 slot 或新增自己 → 拿 `claim_token` 存 cookie,回訪即「我就是這個人」。登入的 Futari 用戶用登入身分認領(填 `profile_id`)。
- **授權**:寫入允許「持有該出遊某 participant 有效 `claim_token`」**或**「已登入且為該出遊 participant」。出遊層級操作(改名、結束、刪 participant)只限 `created_by` owner。`share_token` 只能加入,要先認領出身分才有寫權限。
- **RLS**:outing 五表對 client 直連一律 deny;Server Action server 端驗 token。不為匿名用戶開 `auth.uid()` RLS。
- **Locked decision**:任何拿到連結者都能認領身分並寫入(摩擦最低,符合「快速開始」);**不**要 owner approve 新參與者。
- **防濫用(v1 輕量)**:`share_token` 不可猜;participant 新增 rate limit;出遊人數上限(≤ 20);非 owner 不能刪別人已認領的 slot。

### Realtime:v1 不做
主 app realtime 綁登入 JWT,匿名者吃不到。v1 每次動作後 server action 回傳最新狀態、重抓即可(出遊人少、頻率低)。匿名 realtime(Supabase anonymous sign-in)留 phase 2。

### 轉換:認領 slot、帶走歷史
**Locked decision**:無帳號參與者註冊時,把當前持有 `claim_token` 對應的 participant `profile_id` 設為新 Profile。同一個 participant row 不搬資料,歷史(支出 / share / 還款全靠 `participant_id` 連著)天然續存。

- 一個 slot 只能被認領一次;一個 Profile 在同出遊只能對應一個 participant。
- 認領是選配:不註冊也能全程用(cookie 在即可);換裝置 / 清 cookie 會失去身分——這正是註冊誘因,不強迫。
- CTA **軟性、永不強制**:結算頁看到自己紀錄時、出遊結束後回訪時輕量提示;不在加入當下逼註冊。文案走品牌「安靜的邀請」,不用「立即 / 免費試用」這類 conversion 語言。

## 路由與兩個面

- **Owner 管理面(登入,`(dashboard)/outings`,與 trips 平行)**:出遊清單、詳情(參與者 / 支出 feed / 淨額 / 轉帳建議 / 分享連結 / 結束)、開局。
- **公開加入面(可匿名,`app/[locale]/outing/[shareToken]`,走 locale 路徑)**:join 落地 → 認領 / 新增自己 → 同畫面加支出、看淨額、看轉帳建議、標記還款。無帳號者整個體驗在此,不經 dashboard、不需登入——「快速開始」的實體。登入用戶點連結同樣落此,但用登入身分認領,事後在管理面「我參與的」看得到。

## UI / 文案立場

- 走現有 warm-lamp 視覺與既有 token(`text-*` / `--sheet-*` / `--radius-*` / 分類色系統),不新增字級 / 間距 / 圓角。
- participant 用 `lib/colors.ts` deterministic 推色,feed / 淨額 / 轉帳建議共用同一人同一色。
- 文案分層:公開 join 面「安靜的邀請」;出遊內操作「簡潔中性」;結算 / 結束為情感節點「溫和的見證」。禁用詞(管理 / 追蹤 / 監控 / 驚嘆號)避開。
- i18n 全程 4 語同步(zh-TW 主稿 → zh-CN / en / ja,en/ja 標待確認)。
- Landing 露出「開一個出遊分帳」v1 **不做**(與現有 hero 敘事打架,且開局限帳號用戶),留待驗證。

## 邊界情況

- 平分餘數逐分發,`Σ share === amount` 恆等。
- 參與者中途退出:已參與支出的 share 不可刪(會破帳)→ 標記 inactive、不再進新支出預設勾選,歷史保留。
- `claim_token` 一次性綁定,重放 / 重複認領擋下;同一 Profile 想認領同出遊兩 slot 擋下並提示。
- 出遊 `ended` 後加帳:v1 擋寫入並提示已結束。
- 幣別建立後有支出即不可改。金額整數規則依出遊 `currency`,與主 app 一致。

## Acceptance criteria（怎樣算 done）

- Futari 用戶能開局、拿分享連結;朋友從連結加入(認領空 slot 或新增自己),無帳號者全程不需登入、不經 onboarding。
- 任一參與者能加支出(選付款人 + 挑分攤者,系統平分)、看每人淨額、看最少筆數轉帳建議、標記還款。
- 帳目不變量成立:每筆 `Σ share === amount`;全體 `Σ net === 0`。
- 出遊結束時,兩位成員相互欠額正確折回主帳本 `Settlement`(只折 balance);朋友份額不進主帳本;折回 idempotent;solo / 單一成員參與時不折。
- 無帳號參與者註冊後,該出遊的自身紀錄續存於新帳號名下(認領 slot)。
- 匿名寫入僅透過 Server Action + `claim_token` 驗證;outing 表 client 直連被 RLS deny。
- 全部使用者可見字串 4 語齊全。

## 不在 v1 範圍

- 自訂金額 / 份數比例分帳。
- 多幣別(單一幣別鎖定)。
- Realtime 即時同步。
- 折回主 app 支出統計(decision (b))。
- Owner approve 新參與者。
- Landing 直接開局入口。
