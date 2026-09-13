---
last_updated: 2026-09-13
status: shipped
first_shipped_in: v0.12.0
related_specs: [csv-import, transactions, epoch-readonly, trip-multi-currency]
related_issues: ["#37", "#48"]
---

# CSV 匯出

> 讓使用者把自己的支出紀錄整包帶走。落在「信任宣示」頁而不是設定選單裡，因為它要回答的不是「我怎麼匯出」，是「我的資料到底是不是我的」。

---

## 為什麼

換 app 最大的障礙是「多年的資料怎麼辦」——這件事對留下來的人一樣重要。**能隨時帶走**是願意把家庭財務交出去的前提，不是離開時才用得到的功能。

所以入口不在 `/settings` 的功能清單，在 `/settings/trust`（信任宣示頁，#48）。同一頁講的是加密、資料歸屬、不賣資料；匯出鈕是那些宣稱的可驗證版本——說「你的資料是你的」，旁邊就放一個把它拿走的按鈕。

這也是 [csv-import](csv-import-design.md) 的鏡像：匯入接住從別的 app 來的人，匯出保證從這裡離開的人不會被扣住。兩邊都成立，「不鎖住使用者」才不是一句話。

## 範圍

`GET /api/export/transactions` → 一份 CSV，涵蓋該 group 的**全部** active `CashTransactions`。

實作落地：`app/api/export/transactions/route.ts`（路由 + 信任邊界）、`lib/csv/transactions.ts`（CSV 組裝）、`lib/db/queries/transactions.ts#listAllActiveCashTransactionsForExport`（查詢）、`app/(dashboard)/settings/trust/_components/TrustContent.tsx`（UI 觸發）。

七個欄位：日期、說明、金額、分類、付款人、分攤方式、備註。欄位名與分類／分攤方式的顯示值都走 i18n（`csvExport.columns`），跟著使用者當前語言走。付款人輸出 `displayName` 而不是 UUID。

## 刻意不做的

| 不做 | 為什麼 |
|---|---|
| **不分章節**——匯出跨所有 epoch，不套 `epochClause` | 這是唯一刻意跨章節的讀取路徑。「帶走自己的資料」的對象是這個人的全部歷史，不是當前這段關係。`/records`、stats、balance 都只看當前章節（[epoch-readonly](epoch-readonly-design.md)），匯出是**例外而非疏漏**——看到這裡沒有 epoch 條件時不要「修好」它 |
| **含 pending**——不過濾 `status` | pending 不進 balance，但它是使用者記下的東西。匯出的語意是「我記了什麼」，不是「帳算成什麼」 |
| 不含進帳 / 還款 / 旅行支出 | `IncomeTransactions` / `Settlements` / `TripExpenses` 各有獨立 ledger 語意，塞進同一張表會需要一個「類型」欄和一堆空格。要做的話是各自一支端點，不是把這支撐大 |
| 不含原幣金額 | 只輸出 base 幣別整數。多幣別原幣（`original_currency` / `original_amount`）只有 trip 有，而 trip 支出本來就不在這支的範圍內 |
| 不含 `asset_id` / `trip_id` / epoch 標記 | 這些是 app 內的關聯，對「用 Excel 打開看」沒有意義。要做資料遷移用的完整 dump 是另一個需求 |
| 不做排程 / 定期寄送 | 匯出是使用者主動的動作。背景自動寄檔案違反「不侵略」 |

## 相容性決定

- **UTF-8 BOM + CRLF**：Excel 沒有 BOM 就會把中文顯示成亂碼；RFC 4180 要求 CRLF。兩者都是為了「雙擊打開就是對的」，不是為了規格漂亮。
- **日期用台北時區的 `YYYY-MM-DD`**：`transacted_at` 存的是 timestamp，直接輸出會讓跨日的紀錄看起來差一天。固定 `Asia/Taipei` 而不是使用者 locale——匯出的是紀錄本身，不該因為在國外打開就換一個日期。
- **排序**：`transacted_at` 遞減，同日再依 `created_at` 遞減。與 `/records` feed 一致。
- **`Cache-Control: no-store`**：財務資料不進任何快取層。

## 信任邊界

`route.ts` 自己反查 group：拿 viewer 的 id 去 `OikosGroups` 找他所屬的那一本。

**查詢層不驗 membership**——`listAllActiveCashTransactionsForExport(groupId)` 收到什麼 groupId 就查什麼，它的 docstring 明寫「Caller is responsible for the group-membership check」。所以呼叫端必須自己把 groupId 綁到 viewer 身上，不能從輸入拿。這條規則不是這支端點獨有的，見 [authorization](authorization-design.md)。

## Acceptance

- 雙人 group 的任一方匯出，拿到的是**整本**（兩人的紀錄都在），不是只有自己付的
- 有過去章節的 group 匯出，舊章節的紀錄在檔案裡
- 未登入 → 401；已登入但沒有 group → 404
- 中文說明與分類在 Excel 直接打開不是亂碼
- 軟刪除的紀錄不出現
