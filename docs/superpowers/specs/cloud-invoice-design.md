---
last_updated: 2026-07-13
status: blocked
blocked_on: 財政部電子發票 API APP_ID（2023/3/31 新制不開放個人申請，需 ISO27001 認證）
related_specs: [transactions, income, inbox-layer]
related_issues: ["#16"]
---

# 雲端發票匯入

> 串接財政部電子發票 API，讓使用者用手機條碼載具一鍵把過去每月的雲端發票匯入成 CashTransaction。
> ⚠️ Schema 層已預先 seed（`invoiceCredentials` table + `cashTransactions.invoiceNumber` 欄位 + AES-256-GCM helper），等 APP_ID 卡點解掉才啟動實作。

---

## 背景與動機

台灣使用者買東西大多嗶手機條碼存雲端發票。這些發票本來就要進記帳，但手動 key 等於把已數位化的資料再抄一遍，是 friend test 最常被點名的痛點。

**Brand 對齊**：「不自動化取代感受」原則 → commit 前必經 **preview sheet**，使用者可勾選 / 取消個別發票。一鍵的是「拉資料」，不是「自動寫入」。永遠不做背景 cron（違反「不侵略」原則）。

---

## Scope

### In

- 載具類型：**手機條碼（cardType=3J0002）only**
- Settings 頁「雲端發票」section：新增 / 移除 / 重新驗證載具
- 匯入預覽 sheet：列出區間內發票、可勾選、可調 category、commit 後寫入 CashTransaction
- 自動 dedup（`(groupId, invoiceNumber)` unique，同一張發票不重複匯）
- 加密存載具驗證碼（複用 AES-256-GCM helper）
- 審計表（`InvoiceImportRuns`）+ 快照表（`InvoiceImportSnapshots`，作為折讓 / 作廢 diff base）
- 折讓 / 作廢 自動沖銷（每次預覽 fetch 時 diff MoF 狀態）
- 商家 → category keyword 對照（靜態規則表，落空 → `other`）
- 雙人 group：每位 member 可獨立綁自己的載具；匯入 paidBy = credential.userId

### Out

- 自然人憑證、悠遊卡、icash（其他 cardType）
- 發票明細 line item 拆分（一張發票永遠以總額為一筆）
- 背景定時 sync（永遠不做）
- 自動 asset 推測（買貓糧 → 寵物）— 留將來評估
- Records 來源標示（紀錄結果一律平等，不標「來自雲端發票」）

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 載具類型 | 手機條碼 only | 涵蓋 ≥ 90% friend test 用戶；其他類型 API 雷同，留擴充位 |
| APP_ID 來源 | 財政部 API v0.6 | 唯一官方來源；無第三方代理 |
| 驗證碼存法 | AES-256-GCM ciphertext，key 在 Vercel env | 既有加密 helper 沿用；DB 只看到 ciphertext |
| Barcode 存法 | 明文 | barcode 每家店嗶過，不是秘密；明文方便 SQL dedupe |
| 觸發模式 | 使用者主動點擊 | 永遠不做背景 cron；違反陪伴原則 |
| 匯入粒度 | 每張發票 → 一筆 CashTransaction（總額） | 不拆 line item；用戶要分類自己編輯 |
| Dedup key | `(groupId, invoiceNumber)` partial unique（`WHERE deleted_at IS NULL`） | 一張發票全 group 唯一，不管誰先匯；軟刪後可重匯 |
| 歸屬 paidBy | credential.userId | 載具本來就是個人持有，雙人各嗶各的 |
| splitType 預設 | viewer.defaultSplitType（solo 一律 all_mine） | 沿用既有設定；可逐筆在 records 編輯 |
| 預覽 → commit | 必經 preview sheet，可勾選 / 取消、可改 category | 對齊「不自動化取代感受」 |
| 折讓 / 作廢沖銷 | **自動沖銷**：作廢 → 軟刪 cashTxn；折讓 → 軟刪 + 重建 net amount | 以發票總額入帳，必須跟 MoF 狀態保持一致 |
| User 編輯過 + MoF 又變動 | preview 標記衝突行，不預設覆蓋 | 用戶編輯 = 顯式意圖，不能蓋掉 |
| Records 來源標示 | 不標示 | 紀錄結果一律平等 |

### 不採用

- ❌ 背景定時 cron 自動 sync：違反「不侵略」品牌
- ❌ 直接寫入不過 preview：批次自動化破壞記帳儀式感
- ❌ 拆 line item 成多筆：粒度太細，friend test 無人要求
- ❌ 商家名 fuzzy match 既有 transaction 做合併：複雜且容易誤判
- ❌ 折讓沖銷用「插入負金額 cashTxn」：schema `amount > 0` 限制，且雙筆破壞心智模型

---

## APP_ID 申請卡點

### 法規現況

- **2023/3/31 新制**：個人不可申請 APP_ID，開發者定義限「營業人、組織團體、政府機關」（[電子發票應用程式介面使用規範](https://law-out.mof.gov.tw/LawContent.aspx?id=GL010122)）
- 還需通過 **ISO27001 / CNS27001** 認證
- **沒有 sandbox**：消費者 API 只能用真實手機條碼打正式環境

### 可行路徑

| # | 路徑 | 風險 |
|---|---|---|
| 1 | 以申請者既有公司名義申請 | 需 ISO27001；個人專案掛公司是法規灰色地帶 |
| 2 | 接「加值中心」（綠界 / 鯨躍等）的 reseller API | 中介通常面向 B2B 開立，不一定轉售載具查詢 |
| 3 | 待產品公司化 + 過 ISO27001 後獨立申請 | 長期方案，時程不可預期 |

### 開發策略

- **Phase A**：mock fixture 走完整 UI / DB / sync diff 流程，可先驗證 UX；不需要 APP_ID
- **Phase B**：APP_ID 合規路徑確定才串真實 endpoint
- Mock fixture 必須涵蓋折讓 / 作廢場景（沒 sandbox，corner case 只能在 mock 裡測）

---

## 資料模型語意

詳細欄位以 `lib/db/schema.ts` 為準。本節只說「為什麼這個結構」。

### 為什麼需要 `InvoiceImportSnapshots`

每次預覽時 server action 向 MoF 拉同區間發票，與快照對比 status + amount，偵測折讓 / 作廢。沒有快照就沒有 diff base，無法得知「這張原來匯了多少」。

### 折讓 / 作廢 偵測：三向對照

每次 preview 執行時，snapshot 有無 × live cashTxn 有無 × MoF 當前狀態：

| 情境 | 動作 |
|---|---|
| 全新發票 + 開立 | preview 顯示可勾選 |
| 全新但已作廢 | skip |
| 已匯入、無變化 | 顯示「已匯入」disabled |
| 已匯入 → 作廢 | 預設勾選「需沖銷」，commit 時軟刪 cashTxn |
| 已匯入 → 折讓（amount 變小） | 「需沖銷」預設勾選，commit 時軟刪 + 重建 net amount |
| 已匯入但 user 編輯過 + MoF 又變動 | 顯示衝突行，附「以 MoF 為準」/「保留我的版本」，不預設勾選 |
| 已匯入但 user 軟刪 | skip — 尊重刪除意圖，不復活 |

Commit 整體在一個 DB transaction 內；任何步驟失敗整批 rollback + balance 重算一次。

---

## Acceptance criteria

- 使用者可在設定頁綁定 / 解綁 / 重新驗證一張手機條碼載具
- 預覽 sheet 可選擇日期區間、勾選個別發票、調整 category；commit 後在 records 看到對應 CashTransaction
- 同一張發票（同 `invoiceNumber`）匯入第二次自動 dedup，不重複建 row
- MoF 端標記作廢 → 下一次 preview 顯示「需沖銷」+ commit 後 cashTxn 軟刪
- MoF 端折讓 → preview 顯示「需沖銷」+ commit 後軟刪舊 row + insert net amount row
- 使用者編輯過的 row 在 MoF 又變動時，preview 標記衝突、不預設覆蓋
- 同 group 兩位 member 各自綁自己載具，paidBy 落各自帳上不混淆

---

## Open / deferred questions

1. **載具暱稱必填？** — 選填，雙人 group 兩人都綁時「我的」可能撞名 → 預設依 viewer.displayName 帶入
2. **跨月折讓的 sync 視窗** — 4 月發票 5 月折讓，5 月 preview 看不到。Phase B 末加「額外 sync 過去 6 個月有 active snapshot 的範圍」
3. **Description 字數** — sellerName 常見 30+ 字，截斷 + 移除常見後綴（「股份有限公司」、「分公司」）

---

## 索引

- 財政部電子發票 API 文件：[einvoice.nat.gov.tw](https://www.einvoice.nat.gov.tw/)
- Schema 真相：`lib/db/schema.ts`（`invoiceCredentials` / `cashTransactions.invoiceNumber`）
- 加密 helper：`lib/crypto.ts`
- 平行設計參考：[income](income-design.md)（平行 sheet 模式）/ [inbox-layer](inbox-layer-design.md)（將來作為 `bill_import` source 加入 Inbox 抽象）
