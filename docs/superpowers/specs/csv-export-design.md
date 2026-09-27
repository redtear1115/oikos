---
last_updated: 2026-09-27
status: shipped
first_shipped_in: v0.12.0
updates:
  - v1.6.3: 範圍改為「viewer 待過的章節」（不再是整個 group 的全部章節）；文字欄一律加引號、像公式的開頭加 `'`；group 反查改走 `getActiveGroupForUser`；每次匯出記一筆 `transactions_exported`（#1290）
related_specs: [csv-import, transactions, epoch-readonly, trip-multi-currency, authorization, observability]
related_issues: ["#37", "#48", "#1290"]
---

# CSV 匯出

> 讓使用者把自己的支出紀錄整包帶走。落在「信任宣示」頁而不是設定選單裡，因為它要回答的不是「我怎麼匯出」，是「我的資料到底是不是我的」。

---

## 為什麼

換 app 最大的障礙是「多年的資料怎麼辦」——這件事對留下來的人一樣重要。**能隨時帶走**是願意把家庭財務交出去的前提，不是離開時才用得到的功能。

所以入口不在 `/settings` 的功能清單，在 `/settings/trust`（信任宣示頁，#48）。同一頁講的是加密、資料歸屬、不賣資料；匯出鈕是那些宣稱的可驗證版本——說「你的資料是你的」，旁邊就放一個把它拿走的按鈕。

這也是 [csv-import](csv-import-design.md) 的鏡像：匯入接住從別的 app 來的人，匯出保證從這裡離開的人不會被扣住。兩邊都成立，「不鎖住使用者」才不是一句話。

## 範圍

`GET /api/export/transactions` → 一份 CSV，涵蓋 viewer 目前這本帳裡、**viewer 待過的每一個章節**的 active `CashTransactions`（不只當前章節，也不含 viewer 加入前或離開後的章節——見下方「範圍：viewer 待過的章節」）。

實作落地：`app/api/export/transactions/route.ts`（路由 + 信任邊界）、`lib/csv/transactions.ts`（CSV 組裝）、`lib/db/queries/transactions.ts#listAllActiveCashTransactionsForExport`（查詢）、`app/(dashboard)/settings/trust/_components/TrustContent.tsx`（UI 觸發）。

七個欄位：日期、說明、金額、分類、付款人、分攤方式、備註。欄位名與分類／分攤方式的顯示值都走 i18n（`csvExport.columns`），跟著使用者當前語言走。付款人輸出 `displayName` 而不是 UUID。

## 刻意不做的

| 不做 | 為什麼 |
|---|---|
| **不只當前章節**——匯出 viewer 待過的所有章節，不套 `epochClause` | 「帶走自己的資料」的對象是這個人在這本帳裡的歷史，不是當前這段關係。`/records`、stats、balance 都只看當前章節（[epoch-readonly](epoch-readonly-design.md)），匯出跨章節是**刻意的**——但只跨 viewer 自己待過的章節，見下一節 |
| 不跨帳本 | 只匯出 viewer 目前這本（`getActiveGroupForUser`）。離開過一本帳的人，留在舊帳本的章節不在這份檔案裡；「我在所有帳本的全部歷史」是另一個需求，尚未排入 |
| **含 pending**——不過濾 `status` | pending 不進 balance，但它是使用者記下的東西。匯出的語意是「我記了什麼」，不是「帳算成什麼」 |
| 不含進帳 / 還款 / 旅行支出 | `IncomeTransactions` / `Settlements` / `TripExpenses` 各有獨立 ledger 語意，塞進同一張表會需要一個「類型」欄和一堆空格。要做的話是各自一支端點，不是把這支撐大 |
| 不含原幣金額 | 只輸出 base 幣別整數。多幣別原幣（`original_currency` / `original_amount`）只有 trip 有，而 trip 支出本來就不在這支的範圍內 |
| 不含 `asset_id` / `trip_id` / epoch 標記 | 這些是 app 內的關聯，對「用 Excel 打開看」沒有意義。要做資料遷移用的完整 dump 是另一個需求 |
| 不做排程 / 定期寄送 | 匯出是使用者主動的動作。背景自動寄檔案違反「不侵略」 |

## 範圍：viewer 待過的章節

> **撤回紀錄（v1.6.3，#1290）**：這份 spec 原本寫「匯出跨所有 epoch……看到這裡沒有 epoch 條件時不要『修好』它」。那句話只設想了「同一段關係的舊章節」，沒有涵蓋帳本換過成員的情形。「帶走自己的資料」這個理由支持的範圍是「viewer 待過的章節」，不是「整本帳的所有章節」，所以範圍改成下面的規則。之後若又想把匯出放寬回整本帳，要先回答「viewer 沒待過的章節算不算他的資料」。

規則（`lib/db/queries/_predicates.ts#viewerChaptersClause`）：

- 一筆紀錄屬於它被記下的那個章節（`created_at`，與 balance / `/records` 同一個定義）。
- viewer 是否待過某個章節，看 `GroupEpochs` 那一列的 `member_a_id` / `member_b_id`——是「當時」的成員，不是 `OikosGroups` 的現任成員。角色互換（swap）不開新章節、也不影響結果。
- **帳本最早章節之前的紀錄，算進最早那個章節。** 這種紀錄會存在，是因為離開帳本的人會把自己的紀錄帶進一本新開的單人帳本，而那些紀錄保留原本的 `created_at`，早於新帳本的第一個章節（也就是離開者自己的單人章節）。這條規則讓離開者匯出時拿得到自己帶過來的紀錄；之後才加入那本新帳本的人不在最早章節裡，所以拿不到。
  - 失效的樣子：若把這條拿掉、只看各章節的 `[started_at, ended_at)`，離開者的匯出檔會安靜地少掉他帶過來的全部舊紀錄，沒有任何錯誤。
- 帳本沒有任何章節列 ⇒ 匯出檔只有標頭（fail closed）。

description 自動完成（[transactions](transactions-design.md)）用的是同一條規則。

## 相容性決定

- **UTF-8 BOM + CRLF**：Excel 沒有 BOM 就會把中文顯示成亂碼；RFC 4180 要求 CRLF。兩者都是為了「雙擊打開就是對的」，不是為了規格漂亮。
- **日期用台北時區的 `YYYY-MM-DD`**：`transacted_at` 存的是 timestamp，直接輸出會讓跨日的紀錄看起來差一天。固定 `Asia/Taipei` 而不是使用者 locale——匯出的是紀錄本身，不該因為在國外打開就換一個日期。
- **排序**：`transacted_at` 遞減，同日再依 `created_at` 遞減。與 `/records` feed 一致。
- **`Cache-Control: no-store`**：財務資料不進任何快取層。
- **試算表安全的文字欄**：說明、備註、付款人、分類、分攤方式與標頭一律加雙引號；開頭（略過前導空白、換行、NBSP、全形空白與零寬字元之後）是 `=` `+` `-` `@`（含全形）的儲存格，或以 tab／CR 開頭的儲存格，前面加一個 `'`，讓試算表當成文字而不是公式。日期與金額是程式產生的固定格式，不加引號，打開仍是日期與數字。代價是這類儲存格在試算表裡看得到那個 `'`，而且再匯入 Futari 時 `'` 會留在文字裡。

## 信任邊界

`route.ts` 用 `getActiveGroupForUser(viewer.id)` 反查 group——與 dashboard、server actions 同一個 resolver。同時待在兩本帳裡的人（離開後又被邀回），匯出的永遠是他現在使用的那一本，不是任意一本。

**查詢層不驗 membership**——`listAllActiveCashTransactionsForExport(groupId)` 收到什麼 groupId 就查什麼，它的 docstring 明寫「Caller is responsible for the group-membership check」。所以呼叫端必須自己把 groupId 綁到 viewer 身上，不能從輸入拿。這條規則不是這支端點獨有的，見 [authorization](authorization-design.md)。

## 觀測

每次成功匯出送一筆 server 事件 `transactions_exported`（`captureServer`，distinct_id = viewer），屬性只有 `group_id` 與 `row_count`，**不帶任何紀錄內容**。它是稽核用途（誰、何時、從哪本帳、匯出幾列），不是使用量指標；低數字是預期的。沒有匯出次數限制。

- 和所有 server 事件一樣，只在 prod 部署送出（見 [observability](observability-design.md)），而且 `captureServer` 失敗時不會擋下匯出。所以它是盡力而為的紀錄：**事件查不到，不代表沒有人匯出過。**

## Acceptance

- 雙人 group 的任一方匯出，拿到的是當前章節的**兩人**紀錄，不是只有自己付的
- viewer 待過的過去章節，紀錄在檔案裡；viewer 加入之前、或離開之後的章節不在
- 離開帳本的人，匯出新帳本時拿得到自己帶過來的紀錄；之後才加入那本帳的人拿不到
- 說明／備註以 `=` `+` `-` `@` 開頭（含前導空白）的儲存格，在試算表中顯示為文字
- 未登入 → 401；已登入但沒有 group → 404
- 中文說明與分類在 Excel 直接打開不是亂碼
- 軟刪除的紀錄不出現
