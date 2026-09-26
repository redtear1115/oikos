---
last_updated: 2026-09-27
status: shipped
first_shipped_in: v1.0.0
related_specs: [product, epoch-readonly, native-auth, sign-in-with-apple, invite-existing-group]
related_issues: ["#1031", "#1032"]
---

# 授權模型

> 誰可以讀寫哪一本帳、在哪一層檢查、以及為什麼查詢層刻意不管這件事。
>
> 這份講的是**授權**（authorization，你能碰什麼）。**認證**（authentication，你是誰）走 Supabase Auth，見 [native-auth](native-auth-design.md) 與 [sign-in-with-apple](sign-in-with-apple-design.md)。

---

## 一條不變式

**查詢層不驗 membership。** `lib/db/queries/` 收到什麼 `groupId` 就查什麼——它不知道也不檢查呼叫者是誰。

這是刻意的：查詢是純資料存取，把授權混進去會讓每個 query 都要多帶一個 viewer 參數，而且會有人忘記傳。代價是**責任整個落在呼叫端**——每一支 server action、每一個 route handler，都必須自己把 `groupId` 綁到當前 viewer 身上，不能從輸入拿。

所以這份 spec 存在的理由不是「有哪些 helper」，是「這條責任線在哪、怎麼不掉下去」。

## 四層閘門

| 層 | 在哪 | 管什麼 |
|---|---|---|
| 0. 路由牆 | `proxy.ts` | 未登入不得進入非公開頁面，redirect 到 sign-in。**只管路由，不管資料** |
| 1. Viewer 閘門 | `lib/auth/viewer.ts` | 你是誰、你屬於哪一本 |
| 2. 寫入 context | `lib/actionContext.ts#getViewerWriteContext` | 第 1 層 ＋ 過去章節不可寫 |
| 3. Payload 斷言 | `lib/auth/member.ts`、`lib/auth/asset.ts` | 你送進來的那些 id 是不是也屬於這一本 |

### 第 1 層：四個 viewer 閘門，選錯不會報錯

`lib/auth/viewer.ts` 有四支，差別在兩個軸：**要不要解 group** × **throw 還是 redirect**。

|  | 只要 viewer | 要 viewer + group |
|---|---|---|
| **Server action**（throw） | `requireViewer()` | `requireViewerGroup()` |
| **Page / layout**（redirect） | `requireViewerOrRedirect()` | `requireViewerGroupOrRedirect()` |

真正的差別不在 throw 或 redirect，在**要不要重驗 JWT**——server action 那兩支每次都往 Supabase Auth 打一趟，page 那兩支吃快取。哪個位置該用哪個 Supabase call、以及為什麼可以吃快取，是認證分層的決定，權威在 [product](product-design.md) §Auth 驗證分層，此處不複述。

授權這一側只要記住後果：**在 server action 裡用 redirect 版本不會有任何錯誤訊息**——它會正常回傳一個沒有重驗過的 user，action 照跑。`requireViewerGroupOrRedirect` 的 docstring 明寫 `Do NOT use in server actions`，那句話是這個原因。

### 第 2 層：改動帳務資料要用 `getViewerWriteContext()`

`CashTransactions` / `IncomeTransactions` / `Settlements` / `FuelLogs` 的任何寫入都走這支。它在第 1 層之上多做一件事：**擋掉釘在過去章節的 viewer**（[epoch-readonly](epoch-readonly-design.md)）。

過去章節 read-only 的政策就住在這一支，是單一真相來源。繞過它直接用 `requireViewerGroup()` 寫帳務資料，政策就漏了——一樣沒有錯誤訊息。

目前有 5 支 action 用它：`transaction` / `income` / `settlement` / `fuelLog` / `import`。

### 第 3 層：payload 裡的 id 也要驗

viewer 對了、group 對了，不代表他送進來的 id 屬於這一本：

- `assertMemberInGroup(memberId, group, msg)` — 付款人 / 收款人 / 還款人必須是這本的兩個座位之一
- `assertAssetInGroup(assetId, groupId)` — 選填的愛物 FK 必須屬於這本且未軟刪

## 失效長什麼樣子

**驗了送進來的東西，沒驗被改的那一列。**

#1032 是這個形狀：`editFuelLog` 只用 id 查既有的 log，沒有任何 group 條件；唯一的所有權檢查驗的是攻擊者**新傳入**的 `assetId`。持有他人 `fuelLogId` 時因此可以覆寫受害者的加油紀錄、軟刪受害者關聯的 `CashTransaction`，並把替代交易插進攻擊者自己的 group 卻帶著受害者的 `fuelLogId`（跨 group FK 汙染），而且只重算攻擊者的 balance，受害者的 `GroupBalance` cache 變成 stale。

同一支檔案的 `softDeleteFuelLog` 與 `getFuelLogById` 都有這個檢查——**所以那是疏漏不是設計**，而且從 code 讀起來完全正常：該有的 assert 都在，只是驗錯了對象。

#1031 是同一條線的另一端：`createInvite` 從輸入拿 group，而不是從 viewer 反查。

**編輯類 action 的檢查清單**：被編輯的那一列屬於這本嗎（不只是新值）？如果 payload 可以把它搬到別的地方（改 `assetId`、改 group），新舊兩邊都驗了嗎？

## 不走這套的地方

- **`app/api/export/transactions/route.ts`** 不用 `lib/auth/`（它是唯一的 route handler，沒有 server action 的 context），但反查 group 用的是同一個 `getActiveGroupForUser(viewer.id)`，行為等價於第 1 層；匯出內容再限縮到 viewer 待過的章節。見 [csv-export](csv-export-design.md)。
- **`actions/auth.ts`** — `signOut` 與一支 analytics action，不碰 group 資料。
- **`actions/epoch-view.ts`** — 只設一個 httpOnly cookie，**刻意不驗 `epochId`**。讀取側的 `getActiveEpochWindow` 會拒絕不屬於 viewer group 的 id，惡意值只會 fallback 回當前章節。驗證放在讀取側而不是寫入側，是因為 cookie 值隨時可能因為 group 變動而失效，寫入時驗過不代表讀取時仍然有效。

## Acceptance

- 持有他人資源 id（transaction / fuelLog / asset / invite）的請求，一律 throw，且受害者的資料一個位元都沒動
- 釘在過去章節時，任何帳務寫入被擋
- Server action 收到過期或偽造的 JWT 時 throw `Unauthorized`（不吃快取 session）
- 查詢層函式維持不驗 membership；新增的 query 不得偷偷加 viewer 參數來「順便」檢查——那會讓責任線變得不可預測
