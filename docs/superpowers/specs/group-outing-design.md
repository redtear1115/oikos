---
last_updated: 2026-10-08
status: shipped
first_shipped_in: v1.6.0
updates:
  - v1.7.1: 折回金額改為「兩位成員之間的那一條建議轉帳」,撤回交叉項規則,結束前預覽折回金額（#1634）
  - v1.7.0: 公開加入面——分享連結、認領 slot、匿名寫入、註冊後帶走歷史；管理者＝開局帳本的兩位成員；重設連結與釋放 slot（#1558）
related_specs: [solo-trip, trip-multi-currency, epoch-readonly, onboarding, transactions, conversion-analytics, locale-currency]
depends_on: [transactions]
related_issues: ["#943", "#870", "#1558", "#1634", "#1635"]
---

# Group Outing — 出遊（對外名稱「出遊」；codebase 用 outing）

> 一個短期、連結分享、多方參與的分帳本（類 Splitwise），作為 Futari 的擴散獲客漏斗頂端。

## 這是什麼

固定兩人的 Futari 用戶常會跟一群朋友短期出遊（吃一餐、一趟小旅行），需要 N 人之間分帳。現有 Trip 子帳本只服務夫妻兩人，無法涵蓋。**Group Outing** 是一個獨立的多方分帳本：Futari 用戶開局、丟連結，朋友（有/無帳號皆可）從連結加入、平分支出、看「誰該付給誰」。

它同時是**擴散工具**：無帳號的朋友跳過 onboarding 直接用，用得順之後自然轉換成 Futari 用戶。這符合品牌策略「前 1000 個用戶靠真實使用情境塑形」——是真實使用場景的有機擴散，不是自動化觸及。

它也是 v1.6.0 的多人功能：2026-09-21 使用者決定以本模型取代 #870「出團」（決策紀錄在 #870），分兩個階段交付，見「分階段」。

## 給誰用

- **開局者**：已是 Futari 帳號用戶（夫妻其中一人或兩人）。
- **參與者**：開局者的朋友，混合「有 Futari 帳號」與「臨時無帳號者」。無帳號者是漏斗的轉換對象。

## 為什麼獨立成新子系統（不擴充 Trip / 不複用 Profile）

現有架構綁死「auth.users + Profile（1:1 mirror）+ 兩人 group + 二元 `split_type` + 純量 balance」。本功能在三處破例:**多方參與**、**匿名連結存取**、**N 方結算**。

- **不擴充 Trips/TripExpenses**:trip 表深度兩人化(`split_type` 二元、`paid_by` notNull→profiles、全程 auth-gated),且 trip 與 outing 的 auth 模型相反(trip 要登入、outing 走匿名連結)。為對外擴散工具去改已上線的內部功能,回歸風險高。
- **不複用 Profile 當參與者**:`Profiles` 1:1 mirror `auth.users.id`;塞進沒有 auth user 的 ghost row 會破壞此不變式(RLS、大量 join 都假設背後有 auth user),風險擴散到整個現有系統。

**Locked decision**:全新獨立實體集,參與者(`OutingParticipant`)與 `Profile` 解耦,認領時才 link。三個破例全關進新子系統,碰不到已上線的兩人核心。

## 分階段

> 2026-09-21 使用者決定（#870）。兩個階段合起來才是本 spec 描述的完整功能；下文「v1」指這兩個階段合起來的首版範圍。

| 階段 | 使用者能做什麼 | 朋友是什麼 | 為什麼是這個切點 |
|---|---|---|---|
| **v1.6.0** | 開局者（Futari 帳號用戶）開出遊、加朋友、代為記下每筆支出（選誰付、分給誰），看每人淨額與最少筆數轉帳建議、標記還款、結束出遊。結束時，兩位成員之間的那一條建議轉帳**實際折回**主帳本 balance | **名字**：`OutingParticipant` 沒有對應的 `Profile`，但從第一天就是獨立的 entity，之後可以接上帳號 | 先讓功能會動，驗證有沒有人要用。見 [solo-trip](solo-trip-design.md) Locked decision 1 的「為什麼分兩階段」 |
| **v1.7.0** | 朋友從分享連結加入、以 `claim_token` 認領自己的 slot，自己記帳、看淨額、標記還款；無帳號者註冊後帶走自己的歷史 | 可以是**使用者**：認領時填上 `profile_id` | 這才是擴散漏斗本身。有了 v1.6 的真實使用，才知道值不值得打開匿名寫入 |

- v1.6.0 **沒有**公開加入面，也沒有匿名存取；所有寫入都來自已登入的帳本成員。下方「匿名存取 & 授權」與「轉換:認領 slot、帶走歷史」兩節描述的是 v1.7.0 的行為。
- 兩個階段都**免費**。付費層不在本 spec：等計費基礎設施（含 iOS IAP）存在後另外開票（#870 決策）。
- v1.6.0 → v1.7.0 **不需要資料遷移**：v1.6 建立的名字參與者，就是 v1.7 可被認領的 slot。

## 與旅行的界線

旅行（[trip-multi-currency](trip-multi-currency-design.md)）與出遊是兩個不同的帳務模型，差別來自「這筆錢是誰的」：

| | 旅行 | 出遊 |
|---|---|---|
| 參與的人 | 夫妻兩人（solo 時一人） | 開局者＋朋友，N 人；可含夫妻兩人或其中一人 |
| 錢是誰的 | 全程都是夫妻的錢 | 夫妻的錢混了朋友的錢 |
| 幣別 | 多幣別＋心理匯率 | 單一幣別，有支出後鎖定 |
| 結束時回主帳本 | 2 筆 summary `CashTransactions`，進統計 | 只折夫妻之間那一條建議轉帳，寫一筆 `Settlement`：只動 balance、不進統計（理由見「折回兩人主帳本」） |
| 夫妻以外的人的債 | 不存在 | 活在出遊裡，不進 `GroupBalance`（[solo-trip](solo-trip-design.md) Locked decision 2） |

**已決定的約束（2026-09-21，#870）**：對使用者只有**一個入口**。旅行與出遊在資料模型上分開，但使用者不必先懂這個差別才能開始。

**待決定**：
- 單一入口怎麼分流到兩個模型（例如依「有沒有夫妻以外的人」判斷，或開局時讓使用者選），以及對外叫什麼。這是 IA 決定，不在本 spec。
- [solo-trip](solo-trip-design.md) Locked decision 3 要求 dashboard 在有未結清的旅行時，分開呈現「外人欠我」。出遊要不要有同樣的 dashboard 區塊，本 spec 尚未決定；目前只在出遊詳情頁逐人呈現淨額。

## Entity 語意

> Schema 真相在 `lib/db/schema.ts`,此處只說語意。純函式引擎落在 `lib/outing/`(與主 app `lib/balance.ts` 平行,語意隔離:主 app 兩人純量、此處 N 人向量)。

- **`Outings`** — 出遊本體。`group_id` + `epoch_id`(折回歸屬用,與 Trip 一致)+ `created_by`(只有帳號用戶能開)+ `name` + `currency`(**單一幣別,建立後有支出即鎖**)+ `share_token`(加入連結)+ `status`(`active` / `settling` / `ended` / `archived`)+ `folded_at`(折回 idempotency)。
- **`OutingParticipants`** — 出遊裡的「一個人」,與 Profile 解耦。`display_name`(臨時朋友只有名字)+ `profile_id`(**nullable**;Futari 用戶才填、認領後補上)+ `claim_token`(此 slot 的操作/認領密鑰,存 cookie)+ `claimed_at`。夫妻兩人參與時即兩個 `profile_id` 已填的 participant。可標記 inactive(中途退出,不刪歷史)。
- **`OutingExpenses`** — 支出。`paid_by_participant_id`(任何參與者)+ `amount`(outing 幣別的最小單位整數,USD 為分;主帳本是整數單位,兩者不同,只在 outing 結束 fold 成 Settlement 時由 `minorToWhole` 換算;撤回「同主 app」的舊說法,#1582)+ optional `description` / `category` + `entered_by_participant_id`(稽核:匿名多人寫入要可追)。
- **`OutingExpenseShares`** — 一筆支出分給誰(挑參與者)。`participant_id` + `share_amount`(寫入時就算好的平分整數,含餘數分配;落地存而非每次除,避免 rounding drift 且可稽核)。不變量:同一支出 `Σ share_amount === amount`。
- **`OutingSettlements`** — 出遊內還款。`from_participant_id` → `to_participant_id` + `amount`。

編輯沿用主 app 慣例:**soft-delete + insert**(匿名多人協作下保留「誰刪了什麼」軌跡,信任感較好)。

## 設計決策

### 分帳:平分 + 挑參與者
每筆支出選「誰付」+「分給哪些參與者」,系統平分。餘數逐分發給排序在前的 participant,保證 `Σ share === amount`。v1 **不做**自訂金額 / 份數比例(YAGNI;平分+挑人涵蓋約 9 成出遊場景)。

### 結算:最少筆數轉帳建議(debt simplification)
每人淨額 = `Σ付的 − Σ自己的 share + Σ付出的還款 − Σ收到的還款`(creditor-positive:net > 0 = 此人被欠錢;不變量 `Σ net === 0`)。注意還款符號:**付出**還款(債務人還錢)使自身 net 上升趨近 0、**收到**還款(債權人被還)使自身 net 下降趨近 0。在淨額向量上跑 greedy 最少轉帳(最大債務人配最大債權人),n 人最多 n−1 筆。非理論最佳(最佳為 NP-hard)但對真實出遊規模穩定夠用,業界(含 Splitwise)同此做法。

### 折回兩人主帳本:只折相互欠額,只折 balance
**Locked decision (a)**:出遊結束時,只把**兩位 Futari 成員彼此之間**的相互欠額折回主帳本,寫一筆 `Settlement`(對齊 `GroupBalance` 正負號慣例),讓兩人 balance 不失真。朋友的份額純在出遊內結清,不進主帳本。

折回金額**就是這場出遊的建議轉帳裡,兩位成員之間的那一條**:`minimalTransfers(computeOutingNets(全部參與者, 未刪除支出與份額, 未刪除還款))` 之中 A↔B 的那一筆。B 欠 A x → 折回 +x(`Settlement` 由 A 付、`GroupBalance` +x);A 欠 B x → 折回 −x;沒有這一條就不折。兩位成員之間在出遊內已記的直接還款已在淨額裡,不會重複折。朋友的線永遠不折。成員以**當下的 group 列**(`member_a` / `member_b`)對應參與者,檢視頁與結束動作共用同一個函式(`memberPidsOf`、`lib/outing/foldback.ts`);成員無對應參與者(solo 的 `member_b`、帳號已刪)則為 0。greedy 雙指標每組(債務人,債權人)最多配一次,所以 A↔B 至多一條。

性質:朋友照建議轉帳還清、再加上折回之後,每個人實際付出的錢等於自己的份額總和。

結束前的確認畫面與詳情頁(僅進行中、且屬目前章節的出遊)會用既有文案預覽這個金額;已結束或已過章節的出遊不預覽。

> **撤回(2026-10-08,#1634)**:v1.6.0 的定義是「一方付款、另一方消費」的成對交叉項加上兩成員之間的直接還款。這會重複計算:建議轉帳是在**所有人**的淨額上跑 greedy,朋友的債會被繞道到任一位成員身上,朋友照建議還清後大家其實已經打平,交叉項卻仍寫出一筆。例:你付 8,000、伴侶付 4,000、朋友付 800,四人均分,交叉項折回「伴侶→你 1,000」;朋友還清後,伴侶實付 4,200、你實付 2,200,而各自的份額都是 3,200。失效的樣子沒有任何錯誤,只有逐人對帳才會看到偏差。
>
> **已知後續(#1635)**:出遊結束後,A↔B 那一條仍列在建議轉帳裡。要可靠地隱藏它,得把結束當下的折回決定存在出遊上(需要 migration):事後推導會因帳號刪除(參與者 `profile_id` 被清空)而翻轉,以時鐘比對章節結束也不可靠。本版不處理。

- 不採 (b)「再寫 summary CashTransaction 把出遊個人花費灌進主 app 統計」:outing 混了朋友的錢,(a) 語意更準;統計整合留待驗證後。Trip 走 (b) 因其全程都是夫妻的錢,情境不同。
- `member_b IS NULL`(solo)或兩位成員之間沒有建議轉帳 → 折回為 0。
- 折回 idempotent,`folded_at` 防重折。

### 匿名存取 & 授權
所有寫入走 Server Action(主 app 既有 `Client → Server Action → Drizzle` 路徑),不開放 client 直連 DB。

- **加入**:點 `share_token` 連結 → join 落地 → 認領空 slot 或新增自己 → 拿 `claim_token` 存 cookie,回訪即「我就是這個人」。登入的 Futari 用戶用登入身分認領(填 `profile_id`)。
- **授權**:寫入允許「持有該出遊某 participant 有效 `claim_token`」**或**「已登入且為該出遊 participant」**或**「已登入且為開局帳本的成員」。`share_token` 只能加入,要先認領出身分才有寫權限。
- **管理者＝開局帳本的兩位成員**(2026-10-05 使用者決定,#1558;延續 v1.6.0 #943 Q4):出遊層級操作(改名、結束、刪除出遊、移除參與者、重設連結、釋放 slot)只有開局帳本當前章節的成員能做。朋友不論有沒有 Futari 帳號都不是管理者。理由:結束時折回的那筆 Settlement 同時影響夫妻兩人,與旅行、結算的權限一致。
  > **撤回紀錄(2026-10-05,#1558)**:本條原寫「v1.7.0 出遊層級操作只限 `created_by` owner」。那樣會讓伴侶在 v1.7 失去 v1.6 已有的結束權限,而折回的帳是兩個人的。`created_by` 只是稽核欄位,不是權限來源。容易重新推導出錯的地方:看到「匿名世界要收緊權限」就想縮到開局者一人——要收緊的是朋友,不是伴侶。
- **朋友的寫權限**(2026-10-05,#1558):已認領的參與者可以新增、編輯、刪除**任何一筆**支出與還款,不限自己記的(同 Splitwise)。編輯走 soft-delete + insert,`entered_by_participant_id` 記下是誰動的,軌跡就是信任的來源。不做「只能改自己記的」:朋友記錯別人那筆時要找成員代改,摩擦比風險大。
- **RLS**:outing 五表對 client 直連一律 deny;Server Action server 端驗 token。不為匿名用戶開 `auth.uid()` RLS。
- **Locked decision**:任何拿到連結者都能認領身分並寫入(摩擦最低,符合「快速開始」);**不**要管理者 approve 新參與者。
- **防濫用(v1 輕量)**:`share_token` / `claim_token` 不可猜(高熵隨機值);出遊人數上限(≤ 20)就是新增參與者的天花板——codebase 沒有 rate-limit 基礎設施,v1.7 不為此新建;只有管理者能移除參與者。
- **補救:重設連結與釋放 slot**(2026-10-05,#1558):
  - **重設分享連結**:管理者換一個新的 `share_token`,舊連結立即失效;已認領的人靠 `claim_token`／登入身分繼續用,不受影響。給「連結貼錯群組」用。
  - **釋放 slot**:管理者可以把一個**沒有綁帳號**(`profile_id` 為空)的已認領 slot 釋放回未認領,舊的 `claim_token` 隨之失效,朋友在新裝置從連結重新認領。歷史留在同一個 participant row,不搬資料。已綁帳號的 slot 不能釋放——那個人登入就拿回身分。
  - 失效的樣子:朋友換手機後點連結,看到自己的名字顯示「已認領」、認領不了,也沒有任何錯誤——他會以為壞了,改「新增自己」,於是同一個人在帳上變成兩個。公開頁對已認領 slot 要說清楚「請開局的人釋放」。

### Realtime:v1 不做
主 app realtime 綁登入 JWT,匿名者吃不到。v1 每次動作後 server action 回傳最新狀態、重抓即可(出遊人少、頻率低)。匿名 realtime(Supabase anonymous sign-in)留 phase 2。

### 轉換:認領 slot、帶走歷史
**Locked decision**:無帳號參與者註冊時,把當前持有 `claim_token` 對應的 participant `profile_id` 設為新 Profile。同一個 participant row 不搬資料,歷史(支出 / share / 還款全靠 `participant_id` 連著)天然續存。

- 一個 slot 只能被認領一次;一個 Profile 在同出遊只能對應一個 participant。
- 認領是選配:不註冊也能全程用(cookie 在即可);換裝置 / 清 cookie 會失去身分——這正是註冊誘因,不強迫;沒註冊的人另有「釋放 slot」可救(見「匿名存取 & 授權」)。
- **註冊後回到出遊頁**(2026-10-05,#1558):從出遊頁註冊／登入的人,完成後經 `?next=` 回到同一個公開出遊頁,手上 `claim_token` 對應的 slot 自動綁到這個帳號。**不**在這時拉進 onboarding——他來是為了把出遊記完;等他自己進 dashboard、沒有帳本時,才走一般 onboarding。dashboard 有「我參與的出遊」入口,列出他以參與者身分綁定、但不屬於自己帳本的出遊,點進去回到公開出遊頁。
  - 已登入的 Futari 用戶點連結時同樣落在公開頁,直接用登入身分認領(填 `profile_id`),不經 cookie。
- CTA **軟性、永不強制**:結算頁看到自己紀錄時、出遊結束後回訪時輕量提示;不在加入當下逼註冊。文案走品牌「安靜的邀請」,不用「立即 / 免費試用」這類 conversion 語言。

## 路由與兩個面

- **管理面(登入,帳本成員,`(dashboard)/outings`)**:入口與旅行合一(見「與旅行的界線」);在那個 IA 決定前,這裡只描述它包含什麼——出遊清單、詳情(參與者 / 支出 feed / 淨額 / 轉帳建議 / 分享連結 / 結束)、開局。
- **公開加入面(v1.7.0;可匿名,`app/[locale]/outing/[shareToken]`,走 locale 路徑)**:join 落地 → 認領 / 新增自己 → 同畫面加支出、看淨額、看轉帳建議、標記還款。無帳號者整個體驗在此,不經 dashboard、不需登入——「快速開始」的實體。登入用戶點連結同樣落此,但用登入身分認領,事後在 dashboard「我參與的出遊」看得到。
  - 公開頁 `noindex`、不進 sitemap:內容是私人帳目,連結是唯一的鑰匙。分享預覽(OG)只放通用標題,不放出遊名稱、參與者或金額——連結會被貼進群組,預覽就是公開的。
  - `ended` 的出遊公開頁仍可開、唯讀:結算結果是大家回來看的東西。
  - 原生殼不攔截這個連結(沒有 universal link),朋友在手機瀏覽器打開即可;不需要重新送審。
- **管理面在 v1.7.0 加的東西**:複製分享連結、重設連結、每個參與者的認領狀態(未認領／已認領／已綁帳號)與「釋放」。

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
- 出遊 `ended` 後加帳:v1 擋寫入並提示已結束;公開頁唯讀。
- 已綁帳號的人想在同一出遊再認領另一個 slot:擋下並提示他已經是誰。
- 認領中的 slot 被管理者移除(inactive)或釋放:持舊 `claim_token` 的人回訪時落回「選擇你是誰」,不是錯誤頁。
- 重設連結後,舊連結落地顯示「這個連結已失效,請向開局的人要新連結」,不洩漏出遊內容。
- 刪除帳號:已綁帳號的 participant 解除 `profile_id` 並匿名化名字,歷史保留(與 v1.6 離開者的處理一致)。
- 幣別建立後有支出即不可改。金額整數規則依出遊 `currency`,與主 app 一致。
- 當前章節有進行中的出遊時，離開帳本與移除伴侶都擋下，與旅行相同。出遊綁在 `epoch_id` 上，章節關閉會留下無法結束、也無法折回的孤兒出遊（[solo-trip](solo-trip-design.md) 狀態機「孤兒 trip 的柵欄」）。

## Acceptance criteria（怎樣算 done）

**v1.6.0**

- Futari 用戶能開局、以名字加入朋友；帳本成員能代任一參與者加支出（選付款人＋挑分攤者，系統平分）、看每人淨額、看最少筆數轉帳建議、標記還款、結束出遊。
- 帳目不變量成立：每筆 `Σ share === amount`；全體 `Σ net === 0`。
- 出遊結束時，兩位成員相互欠額正確折回主帳本 `Settlement`（只折 balance）；朋友份額不進主帳本；折回 idempotent；solo／單一成員參與時不折。
- 帳本兩位成員都能結束或刪除出遊。
- 當前章節有進行中的出遊時，離開帳本與移除伴侶都被擋下，訊息說明下一步。
- outing 表 client 直連被 RLS deny；所有寫入只經 Server Action。
- 全部使用者可見字串 4 語齊全。

**v1.7.0**

- 帳本成員能複製分享連結、重設連結（舊連結失效、已加入者不受影響）、釋放未綁帳號的 slot。
- 朋友從連結加入（認領空 slot 或新增自己），無帳號者全程不需登入、不經 onboarding。
- 已認領的參與者能新增、編輯、刪除任何一筆支出、看淨額與轉帳建議、標記還款；每次寫入記下 `entered_by_participant_id`。
- 出遊層級操作（改名、結束、刪除、移除參與者、重設連結、釋放 slot）只有開局帳本的成員能做；朋友呼叫一律被拒。
- 無帳號參與者從出遊頁註冊後回到同一頁，該 slot 綁到新帳號、歷史續存；不被拉進 onboarding。dashboard 有「我參與的出遊」。v1.6.0 期間建立的名字參與者不需資料遷移即可被認領。
- 匿名寫入僅透過 Server Action＋`claim_token` 驗證；outing 表對 client 直連仍一律 deny。
- 公開頁 `noindex`、不進 sitemap、OG 不含出遊內容；`ended` 出遊唯讀。
- 全部使用者可見字串 4 語齊全。

## 不採用

| 方案 | 為什麼不 |
|---|---|
| 把共旅者的份額寫回共旅者自己 group 的 `GroupBalance`（#870 原案） | `GroupBalance.balance` 是伴侶兩人之間的一個帶符號純量（見 [transactions](transactions-design.md)），只能表達「這對伴侶之間誰欠誰」。共旅者欠的是**另一對**夫妻的錢，在他自己的伴侶純量裡沒有意義；共旅者是 solo 時更無處可寫。[solo-trip](solo-trip-design.md) Locked decision 2 已因同一個理由拒絕 |
| v1.6.0 就要求共旅者有 Futari 帳號（#870 原案） | 在驗證需求之前先要求朋友註冊，會讓 v1.6.0 自己失效，也把擴散漏斗做反了。見 [solo-trip](solo-trip-design.md) Locked decision 1 |
| 擴充 Trips／TripExpenses 承載多人 | 見上方「為什麼獨立成新子系統」 |

## 不在 v1 範圍

- 自訂金額 / 份數比例分帳。
- 多幣別(單一幣別鎖定)。
- Realtime 即時同步。
- 折回主 app 支出統計(decision (b))。
- 管理者 approve 新參與者。
- IP／裝置層級的 rate limit(人數上限 20 就是天花板)。
- 原生殼 universal link。
- Landing 直接開局入口。
