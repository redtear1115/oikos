# 雲端發票匯入設計（v0.9.0）

> 串接財政部電子發票 API，讓使用者用手機條碼載具一鍵把過去每月的雲端發票匯入成 CashTransaction。
> 優先級：v0.8.0 自訂定期收入完成後 ship。
> ⚠️ **外部依賴卡點**：財政部 2023/3/31 新制後個人不能申請 APP_ID，僅限**營業人 / 組織團體 / 政府機關**且需 **ISO27001 / CNS27001 認證**（[法規](https://law-out.mof.gov.tw/LawContent.aspx?id=GL010122)）。本專案目前為個人專案，Phase A（mock fixture）可先 ship；Phase B（真實 API）需先解決法規路徑——詳見「APP_ID 申請卡點」段落。

---

## 實作狀態

⬜ 全部未實作。schema 層已預先 seed：
- [InvoiceCredentials](../../../lib/db/schema.ts) table（id / groupId / userId / barcode / verificationCodeEncrypted）— v0.1.0 起就埋著
- [cashTransactions.invoiceNumber](../../../lib/db/schema.ts) 欄位 — 同上
- [lib/crypto.ts](../../../lib/crypto.ts) — AES-256-GCM helper 已可直接複用

---

## 背景與動機

台灣使用者買東西大多會嗶手機條碼存雲端發票。這些發票本來就要進記帳，但手動 key 等於把已數位化的資料再抄一遍，是 friend test 階段最常被點名的痛點之一。

**為什麼 v0.7.0（進帳）之後 ship**：
- 進帳結構就位之後，「匯入」概念第一次有需要——支出能匯，將來進帳（薪轉、利息）也可能匯
- 進帳已建立「平行 sheet 而非 row 攤平」的 pattern，這次匯入也借用：preview sheet 不是 AddSheet 的延伸，是獨立物理空間
- v0.5 / v0.6 愛物 ship 之後，我們有 6 種 entity 可以做「商家 → 愛物」heuristic mapping

**Brand 對齊**：
- 「不自動化取代感受」原則：自動匯入容易破壞「記下一筆」的儀式感。對策是 **commit 之前必經 preview sheet**，使用者可以勾選 / 取消勾選個別發票，category 預設可改。一鍵的是「拉資料」，不是「自動寫入」。
- 「陪伴而不侵略」：不做背景定時 cron 偷偷拉。匯入永遠由使用者觸發。
- 光點品牌延伸：匯入頁的成功狀態 = 一筆一筆光點亮起，而不是 toast「已匯入 27 筆」。

---

## Scope

### In（v0.9.0）

- 載具類型：**手機條碼（cardType=3J0002）only**
- 設定頁新增「雲端發票」區塊：新增 / 移除 / 重新驗證 載具
- 一鍵匯入入口：設定頁卡片 + dashboard 條件式 banner（有未匯入發票時）
- 匯入預覽 sheet：列出區間內發票、可勾選、可調 category、commit 後寫入 CashTransaction
- 自動 dedup（同一張發票不重複匯）
- 加密存載具驗證碼（AES-256-GCM 既有 helper）
- 匯入記錄表 `InvoiceImportRuns` — 審計 + 去抖
- 匯入快照表 `InvoiceImportSnapshots` — 折讓 / 作廢 沖銷時的 diff base
- **折讓 / 作廢 自動沖銷**：每次預覽 fetch 時 diff status，作廢→軟刪原 cashTxn；折讓→以「軟刪+插入」rebuild 為新淨額。詳見下方「折讓 / 作廢 自動沖銷」段落。
- 商家 → category 的 keyword 對照表（小規模、靜態，可日後擴）
- API 失敗 / 驗證碼失效 / 載具被改 等錯誤處理
- 雙人 group：每位 member 可獨立綁自己的載具；匯入歸屬 paidBy = credential.userId

### Out（v0.9.0 不做）

- 自然人憑證、悠遊卡、icash、會員載具（其他 cardType）— 之後評估
- 發票明細 line item 拆分（一張發票 = 多筆 transaction）— 不做，永遠以發票總額作為一筆
- 自動 asset 推測（買貓糧 → 寵物 / 加油 → 車輛）— Phase 2 評估；MVP 一律 assetId=null
- 背景定時 sync（cron 自動拉）— 永遠不做（違反「不侵略」原則）
- 發票中獎查詢 / 對獎通知 — 不在範圍內
- 匯入到 IncomeTransactions（薪轉、利息）— 雲端發票不含這類資料，不適用
- Records 列表「來源」標示（📃 來自雲端發票之類圖示）— 不做，紀錄結果一律平等

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 載具類型 | 手機條碼 only | 涵蓋 ≥ 90% friend test 用戶；其他類型 API 雷同，留擴充位 |
| API 來源 | [財政部電子發票整合服務平台 API](https://api.einvoice.nat.gov.tw/) v0.6 | 唯一官方來源；無第三方代理 |
| APP_ID 取得 | **法規灰區，待解** — 個人不可申請（2023/3/31 起）、需公司 + ISO27001。本專案 Phase A 用 mock fixture，Phase B 上線前必須先確定合規路徑 | 詳見「APP_ID 申請卡點」 |
| 驗證碼存法 | AES-256-GCM ciphertext，key 在 Vercel env | 既有 [lib/crypto.ts](../../../lib/crypto.ts) 沿用；DB 只看到 ciphertext |
| Barcode 存法 | 明文 | barcode 本身在每家店嗶過，不是秘密；明文方便 SQL dedupe / 顯示 |
| 觸發模式 | **使用者主動點擊** | 永遠不做背景 cron；違反陪伴原則 |
| 匯入粒度 | 每張發票 → 一筆 CashTransaction（總額） | 不拆 line item；用戶要分類自己編輯 |
| Dedup key | `(groupId, invoiceNumber)` partial unique（活的 + 有號） | 一張發票全 group 唯一，不管誰先匯 |
| 歸屬 paidBy | `credential.userId`（誰綁載具誰付） | 載具本來就是個人持有，雙人 group 兩人各嗶各的 |
| splitType 預設 | `viewer.defaultSplitType`（solo 一律 `all_mine`） | 沿用既有設定；批次匯入後若要逐筆改可在 records 編輯 |
| Category 預設 | keyword 規則匹配，落空 → `other` | 規則表 < 50 條，靜態維護；user 可預覽時改 |
| 預覽 → commit | 必經 preview sheet，可勾選 / 取消、可改 category | 對齊「不自動化取代感受」；一鍵拉資料 ≠ 一鍵寫入 |
| 區間選擇 | 整月 chunk（YYYY-MM）；首次匯入給「最近 6 個月」shortcut | API 限制單次區間；月為自然單位 |
| 失敗處理 | 一次 retry 後 surface error；驗證碼錯誤 → 載具標記 `invalid` | 簡單可預期；不做 exponential backoff |
| 已作廢發票（首次見到就是作廢） | skip（不匯入） | 不存在的支出沒理由建紀錄 |
| 已匯入後 → 變作廢 / 折讓 | **自動沖銷**：作廢→軟刪 cashTxn；折讓→軟刪+重建 net amount。user 編輯過 → preview 標記，不自動覆蓋 | 因為都以發票總額入帳，必須跟 MoF 狀態保持一致；user 編輯 = 顯式意圖，不能蓋掉 |
| Records 來源標示 | **不標示** | 紀錄結果一律平等；來源是後台事實，不該在前台分類 |
| 多人雙寫 | 第一個匯入的得分（unique 失敗就跳過） | 對齊 dedup key；對方匯到時看到「該發票已匯入」inline 標示 |

### 不採用

- ❌ 背景定時 cron 自動 sync：違反「不侵略」品牌
- ❌ 直接寫入不過 preview：批次自動化破壞記帳儀式感
- ❌ 拆 line item 成多筆 transaction：粒度太細，friend test 沒有 user 要求過
- ❌ 商家名 fuzzy match 既有 transaction 做合併：複雜且容易誤判
- ❌ 用 user email / phone 直接驗證（OTP 流）取代手機條碼驗證碼：MoF API 不支援
- ❌ 匯入頁做動態載入大量發票（infinite scroll）：批次 ≤ 一個月份範圍，固定渲染即可
- ❌ 折讓沖銷用「插入負金額 cashTxn」：schema `amount > 0` 限制，且雙筆呈現破壞「一筆 = 一次消費」的心智模型；改用 rebuild 模式（軟刪+重插）

---

## APP_ID 申請卡點（外部依賴 — 上 Phase B 前必解）

### 法規現況

- **2023/3/31 新制**：個人不可申請 APP_ID。開發者定義限「營業人、組織團體、政府機關(構)」（[電子發票應用程式介面使用規範](https://law-out.mof.gov.tw/LawContent.aspx?id=GL010122)）
- 還需通過 **ISO27001 / CNS27001** 認證；範圍涵蓋使用 API 之軟體產品所有資訊業務活動
- **沒有 sandbox**：消費者 API 只能用真實手機條碼打正式環境，dev 期間每次 verify 都會 hit 自己 / 受測者的真載具

### 對本專案的影響

本專案目前是個人專案（Futari friend test 階段）。可行路徑：

| # | 路徑 | 適用性 | 風險 |
|---|---|---|---|
| 1 | 以申請者既有公司名義申請 | 須有 ISO27001 公司支援 | 規範要求 APP_ID 與「申請用途」綁定，個人專案掛公司是**法規灰色地帶** |
| 2 | 接「加值中心」（綠界 / 鯨躍 / 承映等持有 APP_ID 的中介）的 reseller API | 視中介條款而定；多數面向 B2B 開立而非 B2C 載具查詢 | 中介通常不轉售載具查詢；需個案談 |
| 3 | 接已有 APP_ID 的個人記帳 APP（如「記帳城市」）的 export / share | 視該 APP 是否提供開放介面 | 仰賴第三方政策；非首選 |
| 4 | 待專案規模成熟、產品團隊正式公司化 + 過 ISO27001 後獨立申請 | 長期方案 | 時程不可預期 |

### 開發策略

- **Phase A 不卡**：mock fixture 走得通整套 UI / DB / sync diff 流程，friend test 可以先驗證 UX
- **Phase B 卡 APP_ID 合規路徑確定**：在路徑沒確定前不串真實 endpoint，避免 user 期望落空
- **Mock fixture 必須涵蓋折讓 / 作廢場景**：因為沒 sandbox，這些 corner case 只能在 mock 裡測

> 此段是專案級決策，跨 Phase。實作 Phase A 不需要動到，但 Phase B kickoff 必須先回到這裡確認路徑。

---

## 財政部 API 串接

### Endpoint

```
POST https://api.einvoice.nat.gov.tw/PB2CAPIVAN/invServ/InvServ
Content-Type: application/x-www-form-urlencoded
```

### 用到的 actions

| action | 用途 | 權限 |
|---|---|---|
| `carrierInvChk` | 查指定區間發票 header list | cardNo + cardEncrypt |
| `carrierInvDetail` | 查單張發票 detail（line items + 商家） | cardNo + cardEncrypt |

> v0.9.0 因為以發票總額入帳，**只用 header list 即可拿到金額 + 商家 + 發票號碼 + 開立日期**。`carrierInvDetail` 留 Phase 2（line item 拆分時）再用。

### `carrierInvChk` 必填參數

| param | 值 | 說明 |
|---|---|---|
| `version` | `0.5` | API 版本（撰文時最新公開） |
| `cardType` | `3J0002` | 手機條碼 |
| `cardNo` | `/AB12CD3` | barcode（含斜線，總長 8） |
| `expTimeStamp` | unix sec + 600 | 簽章 10 分鐘有效 |
| `action` | `carrierInvChk` | |
| `timeStamp` | unix sec | 當下時間 |
| `startDate` | `YYYY/MM/DD` | 區間起 |
| `endDate` | `YYYY/MM/DD` | 區間迄 |
| `onlyWinningInv` | `N` | 不限中獎 |
| `uuid` | client uuid | 可任意 random 生成 |
| `appID` | env: `MOF_INVOICE_APP_ID` | 申請取得 |
| `cardEncrypt` | 驗證碼明文（8 字元） | 從 DB ciphertext 解密後丟入 |

### Response shape（簡化）

```json
{
  "v": "0.5",
  "code": "200",
  "msg": "查詢成功",
  "details": [
    {
      "invNum": "AB12345678",
      "invDate": "2026-04-15",
      "sellerName": "全家便利商店股份有限公司",
      "amount": "55",
      "invStatus": "開立",
      "invDonatable": "Y",
      "cardType": "3J0002",
      "cardNo": "/AB12CD3"
    }
  ]
}
```

非 200 code（範例）：
- `919` cardNo 與 cardEncrypt 不符 → 載具標記 invalid
- `953` 系統忙線 → retry 一次
- `998` appID 失效 → infra alert，user 不顯示細節

### Implementation location

| 檔案 | 內容 |
|---|---|
| `lib/invoice/api.ts`（新） | `fetchInvoicesByCarrier(barcode, code, start, end)` — 包 fetch + 簽章 + parse + retry |
| `lib/invoice/mapping.ts`（新） | `mapInvoiceToTxnDraft(inv, viewer, group)` — pure，不碰 DB |
| `lib/invoice/categories.ts`（新） | `merchantToCategory(sellerName)` — keyword 規則表 |
| `actions/invoice.ts`（新） | server actions：CRUD credential / list preview / commit import |
| `lib/db/queries/invoice.ts`（新） | DB 層 query helper |

---

## 資料模型

### `InvoiceCredentials` 擴充

既有：
```ts
{ id, groupId, userId, barcode, verificationCodeEncrypted, createdAt }
```

v0.9.0 加：
```ts
{
  ...,
  nickname: text | null,            // user 自定（"我的"、"老婆的"），UI 顯示
  status: enum('active', 'invalid'), // API 回 919 時翻 invalid
  lastSyncedAt: timestamptz | null,  // 最近一次成功匯入結束時間
}
```

UNIQUE constraint：`(groupId, userId, barcode)` — 同一 group 同一人不重綁同號。

### 新表 `InvoiceImportSnapshots`

匯入時的快照，作為日後折讓 / 作廢 diff base。**不可被使用者直接修改**，commit 時由 server action 寫入。

```ts
{
  invoiceNumber: text PK,
  groupId: uuid (FK),
  importedAmount: int,
  importedDescription: text,
  importedCategory: text,
  importedAt: timestamptz,
  voidedAt: timestamptz | null,    // MoF 回報作廢時 set；軟刪原 cashTxn 時也回填
  lastSyncedAt: timestamptz,
  // 即使原 cashTxn 軟刪、user 自己刪、或變動，這張快照永遠保留作為「我們曾經匯入過」的事實
}
```

PK 是 `invoiceNumber`（全國唯一）；用 `groupId` 做 RLS。`voidedAt` 為 NULL 代表「目前 MoF 端仍是有效的」。

### 新表 `InvoiceImportRuns`

匯入操作的審計 + debounce。每按一次「開始匯入」（拉資料）就建一筆。

```ts
{
  id: uuid,
  groupId: uuid (FK),
  credentialId: uuid (FK),
  startedAt: timestamptz,
  finishedAt: timestamptz | null,
  rangeStart: date,
  rangeEnd: date,
  fetchedCount: int,         // API 回幾張
  importedCount: int,        // 實際 commit 幾張（preview 取消勾選的不算）
  skippedDupCount: int,      // dedup 掉幾張
  skippedVoidCount: int,     // 已作廢跳過幾張
  status: enum('fetching','preview','committed','failed','cancelled'),
  errorCode: text | null,    // MoF API code 或 'network'
}
```

不做軟刪除（這是 audit log）。pg_cron 留 1 年後物理刪除。

### `cashTransactions` 不改 schema

`invoice_number` 已存在，只是現在沒 writer。新增 partial unique：

```sql
CREATE UNIQUE INDEX cash_tx_invoice_uniq
  ON "CashTransactions" (group_id, invoice_number)
  WHERE invoice_number IS NOT NULL AND deleted_at IS NULL;
```

> 注意：這是 **partial unique**，軟刪後可以重匯（罕見但合法的場景：user 手動刪了又後悔）。

### 發票 → CashTransaction mapping

| Invoice 欄位 | CashTransaction 欄位 | 規則 |
|---|---|---|
| `invNum` | `invoiceNumber` | 直接 copy；dedup key 之一 |
| `invDate` | `transactedAt` | 解析為 local midnight Date |
| `amount` | `amount` | parseInt（API 回 string） |
| `sellerName` | `description` | 截斷至 32 字（`validateTransactionInput` 沒 max len，但 UI 行寬要顧）|
| `sellerName` → keyword 表 | `category` | `merchantToCategory()`，落空 → `other` |
| — | `paidBy` | credential.userId |
| — | `splitType` | viewer profile.defaultSplitType（solo → all_mine） |
| — | `assetId` | null（v0.9.0） |
| — | `groupId` | credential.groupId |

---

## 折讓 / 作廢 自動沖銷

### 為什麼要做

v0.9.0 以發票總額入帳。如果使用者買 $1000 → 退 $300，MoF 端發票會被開折讓單；我們本機紀錄若還停在 $1000，當月支出就虛增。我們的 source of truth 必須跟 MoF 對齊。

### 為什麼可以做

每張發票有全國唯一的 `invoiceNumber`，存在 `cashTransactions.invoice_number` + `InvoiceImportSnapshots`。每次預覽時 fetch 同區間的所有發票（包含已匯入過的），就能 diff 出狀態變化。

### 偵測機制

每次使用者開預覽 sheet（即使是查同月份的第二次），server action `previewInvoiceImport(credentialId, range)` 都會：

1. 向 MoF API 拉該區間的所有發票（不分已匯入與否）
2. 對每張回傳的發票，三向對照：
   - 是否有 **InvoiceImportSnapshots** 紀錄（= 我們曾經匯過）
   - 是否有 **live CashTransaction**（`invoice_number` match、`deleted_at IS NULL`）
   - MoF 回傳的當前 `invStatus` + `amount`

3. 分流為以下狀態：

| 情境 | snapshot | live cashTxn | MoF 狀態 | 動作 |
|---|---|---|---|---|
| 全新發票 | ❌ | ❌ | 開立 | preview 顯示「新發票」可勾選 commit |
| 全新但已作廢 | ❌ | ❌ | 作廢 | skip，不顯示 |
| 已匯入、無變化 | ✅ | ✅，amount 與 snapshot 同 | 開立、amount 同 | preview 顯示「已匯入」disabled gray row |
| **已匯入 → 作廢** | ✅ | ✅ | 作廢 | 預覽以「需沖銷」section 顯示，預設勾選；commit 時 server 軟刪 cashTxn + 更新 snapshot.voidedAt |
| **已匯入 → 折讓**（amount 變小但 > 0）| ✅，importedAmount 較大 | ✅，amount 與 snapshot 同 | 開立、amount 變小 | 預覽以「需沖銷」section 顯示「全家便利商店 $1000 → $700（折讓 -$300）」，預設勾選；commit 時 server soft-delete + insert（amount 改成新值，invoice_number 帶過去）+ 更新 snapshot.importedAmount |
| 已匯入但 user 編輯過（cashTxn.amount ≠ snapshot.importedAmount）+ MoF 又變動 | ✅ | ✅，amount ≠ snapshot | 任 | preview 顯示衝突 row：「此發票 MoF 端有變動，但你已編輯過此紀錄。」附 〔以 MoF 為準〕〔保留我的版本〕 兩按鈕；不預設勾選 |
| 已匯入但 user 軟刪了 | ✅ | ❌ | 任 | skip — 尊重使用者刪除意圖；不自動復活 |

### Commit 時的 atomic 流程

`commitInvoiceImport(runId, selections)` 在一個 DB transaction 內：

1. 對每個「新發票」selection：insert `cashTransactions` + insert `InvoiceImportSnapshots`（dedup unique 失敗的當作 skip 計數）
2. 對每個「需沖銷 - 作廢」selection：`UPDATE CashTransactions SET deleted_at = now() WHERE invoice_number = $1 AND group_id = $2 AND deleted_at IS NULL` + `UPDATE InvoiceImportSnapshots SET voided_at = now()`
3. 對每個「需沖銷 - 折讓」selection：mirror `editTransaction` 模式 — soft-delete 舊 row + insert 新 row（新 amount，其餘欄位 carry over：paidBy / splitType / category / description / assetId）+ `UPDATE InvoiceImportSnapshots SET imported_amount = $newAmount`
4. 對「以 MoF 為準」衝突 selection：跟 (3) 同邏輯，但 user 編輯過的 category / split 也會被覆蓋（這是使用者顯式選擇的後果）
5. 對「保留我的版本」衝突 selection：只更新 `InvoiceImportSnapshots.lastSyncedAt`，不動 cashTxn —— 之後若 MoF 再有變動，這張仍會被偵測為衝突 row 再次 prompt
6. `recalcGroupBalance(groupId)` 一次（所有變動結束後）

整個流程是一個 DB transaction；任何步驟失敗整批 rollback。

### 折讓多次累加

MoF 端可以對同一張發票多次折讓。每次 sync `InvoiceImportSnapshots.importedAmount` 都會更新成最新值，所以不存在「漏掉前一次折讓」的狀況——快照永遠跟 MoF 端的最新總額一致。

### Edge cases 補充

| 情境 | 處理 |
|---|---|
| 折讓導致 amount = 0 | 視同作廢處理（軟刪原 cashTxn） |
| MoF 回 amount 比 snapshot **大**（理論上不可能） | 視為衝突 row，人工確認；不自動加 |
| 同月份第一次匯 + 拿到 30 張，user 只勾 20 張 commit；第二次再開 preview | 沒勾的 10 張 snapshot 沒寫，視為「新發票」再次出現 — 正常 |
| 跨年份的折讓（4 月匯入、5 月折讓） | 5 月的 sync 不會在 4 月區間出現；提案：sync 時除了當月外也再 sync 過去 6 個月已匯入的 snapshot 範圍（額外的 carrierInvChk call）。Phase B 末再加，初版只 sync 當月即可 |
| User 連結了 asset / 改了 category / split → 折讓來了 | 屬「user 編輯過」分支；不自動覆蓋 |

### `merchantToCategory` keyword 表（初版）

```ts
const RULES: Array<[regex: RegExp, category: CategoryId]> = [
  [/全家|7-?ELEVEN|統一超商|萊爾富|OK 超商/, 'dining'],   // 超商買的多半是吃的
  [/餐廳|食堂|早餐|咖啡|拉麵|火鍋|燒肉|飲料/, 'dining'],
  [/全聯|家樂福|大潤發|好市多|COSTCO/, 'dining'],         // 賣場以食材為主
  [/中油|台塑|加油站/, 'transit'],
  [/捷運|高鐵|台鐵|高速公路|停車/, 'transit'],
  [/H&M|UNIQLO|ZARA|GU|服飾/, 'clothing'],
  [/屈臣氏|康是美|大樹|寶雅/, 'health'],                  // 藥妝
  [/Netflix|Spotify|YouTube|Apple|Google/, 'entertainment'],
  [/誠品|博客來|MOMO|蝦皮/, 'other'],                     // 太雜
]
```

落空 → `other`。Friend test 期間人工觀察哪些 category 太多落空，再加規則。

---

## UI / UX

### 1. Settings page — 雲端發票區塊

位置：`SettingsContent` 的「個人」section 之後新增獨立 section「雲端發票」。

```
雲端發票
─────────────────────────
+ 加入手機條碼            ›    ← 沒 credential 時
─────────────────────────
我的（/AB12CD3）          ›    ← 有 credential 時
最近匯入：4/30
─────────────────────────
匯入發票                  ›    ← 任一 credential active 時顯示
```

**Add carrier flow**：點「+ 加入手機條碼」開 bottom sheet：
1. Barcode input（pattern `/[A-Z0-9]{7}`，自動加斜線）
2. 驗證碼 input（8 字 alphanumeric；右側 eye toggle 顯示 / 隱藏）
3. （選填）暱稱 input（"我的"、"老婆的"）
4. 「驗證並儲存」按鈕 → call `/api` 試打一次小區間（過去 7 天）verify → 成功才寫 DB
5. 失敗訊息：
   - 919 → 「條碼或驗證碼有誤，請確認」
   - 998 → 「服務暫時無法使用，稍後再試」
   - network → 「網路錯誤，請重試」

**Edit carrier**：點 row 開同一 sheet（reset 模式）— 只允許改暱稱、重輸驗證碼、移除。barcode 不能改（要刪了重加）。

**Status invalid 視覺**：barcode row 左側橘點 + 副標「驗證碼可能已變更，點擊重新輸入」。

### 2. 匯入入口

兩個入口：
- **設定頁「匯入發票」row**（主）— 永遠有 active credential 時顯示
- **Dashboard 條件式 banner**（補）— 當「最近 6 個月有 ≥ 1 張未匯入」時顯示一張薄條（類似 SoloBanner 的設計），CTA「整理一下這個月的發票 →」。如何知道有未匯入？不知道，因為要查 API 才知道。所以 banner 改用「上次匯入超過 30 天」當 trigger（lazy），文案軟一些：「好一陣子沒整理發票了 →」。
- **Dashboard 同時 active 兩個 banner（Solo + 雲端發票）**：Solo 優先；雲端發票讓位。

> 不在 AddSheet 裡放「從雲端發票拉」。AddSheet 是手動單筆紀錄的物理空間，混入 batch import 會破壞單一目的。

### 3. 匯入預覽 sheet

點「匯入發票」開 full-height sheet（不是 bottom sheet — 內容多）：

```
[X]               匯入發票
─────────────────────────────────
  區間  [ 2026 年 4 月 ▾ ]  「6 個月內」shortcut chip
─────────────────────────────────
 〔載入中… 或 〕

  ✓ 4/15 全家便利商店      飲食   $55   /AB12CD3
  ✓ 4/14 中油              交通  $1280  /AB12CD3
  ✗ 4/12 蝦皮（已匯入）    其他   $899   ← 灰底，dedup hit
  ✓ 4/10 屈臣氏            醫療  $480
  ...
─────────────────────────────────
        〔 匯入 18 筆（共 22 筆）〕
```

**互動細節**：
- 每 row 左側 checkbox（已匯入的 dedup row：disabled + 灰）
- Tap row body → 展開 inline category picker（chips 同 AddSheet 的 8 色）
- Tap 商家名 → inline 編輯 description
- Sheet header sticky；底部 commit button sticky 顯示「匯入 N 筆（共 M 筆）」
- 區間 chip click 開另一個小 sheet 選月份（最近 12 個月可選；逾期 API 不回）
- 「最近 6 個月」shortcut → 自動連續 fetch 6 個月並 union 顯示
- 拉取中：sheet body 顯示 skeleton rows（4 條）
- API 失敗：sheet body 顯示 illustrative empty + 「重試」按鈕；不關 sheet

**Commit 行為**：
- 一個 server action `commitInvoiceImport(runId, selections)` — 跑 atomic：建 N 筆 cashTxn → 對應 dedup index 拒絕的當作 skip → 更新 `InvoiceImportRuns` 統計 → recalc GroupBalance 一次（一次足夠，不要 N 次）
- Commit 完成 → close sheet → toast「已匯入 N 筆 · 在紀錄看 →」
- Records 列表 realtime 各 row 進來時是 prepend + 既有 mint glow 弱化版（v0.7.0 已建立的 pattern）；不要 confetti

### 4. Empty state（光點品牌延伸）

未綁載具、未匯入過的設定頁 row：點進去先導入「為什麼要綁」一段文案，不要直接到 form。文案草：

> 嗶過手機條碼的發票會自動上雲。綁定一次，之後可以一鍵把這些花費整理進來。
>
> 〔開始 →〕

設定頁主清單仍是 row，不在那邊塞文案。把文案放在「+ 加入手機條碼」點進去後的第一個 step。

---

## 行為規範 / Edge cases

| 情境 | 處理 |
|---|---|
| 同一張發票兩人載具都嗶到（罕見：店員嗶錯） | 第一個 commit 的成功，第二人 preview 顯示「（已匯入）」灰底 row、不可勾 |
| 一張發票 ≤ 0 元（純折讓） | API 不應該回，但若回 → skip + log skippedVoidCount |
| 發票狀態非「開立」（已作廢、已退貨） | skip + count 進 skippedVoidCount |
| 同一張匯入後使用者在 records 軟刪 | dedup index 是 partial（WHERE deleted_at IS NULL）→ 重匯允許；但預覽 UI 會偵測到「過去匯過」並預設不勾（用 `InvoiceImportRuns` 反查）|
| 同一張匯入後手動編輯（split / category）→ 重匯 | 編輯 = soft delete + insert，新 row invoice_number 仍非 null → dedup 阻擋 → 預覽顯示「已匯入」|
| API 回 919（驗證碼錯） | credential.status → 'invalid'；UI 設定頁 row 顯示橘點；commit / preview action 立即 throw 「載具驗證碼可能已變更，請到設定重新輸入」|
| API 回 953（系統忙線） | 一次 retry（500ms 後）；仍失敗 → surface「服務忙線中，稍後再試」；run.status='failed' |
| API timeout（> 15s） | 視同 network failure；run.status='failed', errorCode='network' |
| 區間 endDate 在未來 | 自動截到今日 |
| 區間跨年 | UI 給的是月份 chunk；不可能跨年；若是「最近 6 個月」shortcut，內部拆 6 個月份分次 fetch（保護 API 限額） |
| credential 被另一裝置刪除 | preview sheet 跑到一半 → server action 失敗「載具不存在」；UI 退回設定頁 |
| Solo mode | credential 仍可綁；splitType 一律 `all_mine`；匯入照常 |
| 沒有 partner 的 credential.userId | userId = viewer.id（建立時 server 帶入）；雙人模式後對方仍看不到對方的 credential（RLS 限制）|
| 同月份重複按「匯入發票」 | 拉資料每次都重來；dedup 自然處理；但 UX 上 commit 後 close sheet，user 不會誤點 |
| 不同 credential 同一發票（不可能，但理論上） | dedup key 是 invoiceNumber unique per group，無關 credential |
| 保險 / 房 / 寵物相關發票 | v0.9.0 一律 assetId=null；user 在 records 編輯加關聯（既有功能） |
| 商家規則匹配出 settle | 永遠不會（settle 不在 PICKABLE_CATEGORIES）；落空都丟 'other' |

### Realtime 行為

- credential 寫入：發 INSERT/UPDATE 到 `InvoiceCredentials` channel，雙方裝置同步（雖然各自 user 只看自己的，partner 不會看到對方的 credential）
- import commit 一次 `recalcGroupBalance` → BalanceHero 跨 fade 既有行為照常
- 對方在另一裝置正在匯入時：viewer 看到 records 突然 prepend 一批新 row，每 row 用既有的 1s `--realtime-flash` 黃光（不另設批次特效，避免轟炸）

### RLS

`InvoiceCredentials`：select / insert / update / delete 都限 `userId = auth.uid() AND group_id IN viewer's groups`。對方看不到自己的 credential。

`InvoiceImportRuns`：select 限 `group_id IN viewer's groups`（雙方都可看 audit）；insert / update 限 owner（credential.userId = viewer）。

---

## 分階段交付

### Phase A — Schema + 設定 UI（無 API）

可在無 APP_ID 的情況下推進。

| 工作 | 位置 |
|---|---|
| migration：擴充 InvoiceCredentials（nickname/status/lastSyncedAt）+ InvoiceImportRuns table + cashTransactions partial unique | `drizzle/0015_invoice_v080.sql` |
| validators：`validateBarcodeInput`、`validateInvoiceCarrierInput` | `lib/validators.ts` |
| server actions：CRUD credential（create / rename / refresh code / delete） | `actions/invoice.ts` |
| Settings UI：「雲端發票」section + add carrier sheet | `app/(dashboard)/settings/_components/SettingsContent.tsx`（加 section）+ `InvoiceCredentialSheet.tsx`（新） |
| RLS policies | `drizzle/0016_invoice_rls.sql` |
| Realtime publication | 同 0015 |
| Mock 模式 fixture：固定回 ~30 張範例發票 | `lib/invoice/api.ts` 內以 `MOF_INVOICE_APP_ID` 是否存在分流 |

**Deliverable**：使用者可在設定頁綁 / 移除手機條碼，**驗證流程跑 mock fixture**。

### Phase B — 真實 API + 匯入流程

**啟動條件**（不可忽略）：
- APP_ID 已透過合規路徑取得（見「APP_ID 申請卡點」段落）
- 至少一名 ISO27001 認證的法人實體掛名申請者

**Phase A 與 Phase B 之間的 buffer**：等 APP_ID 同時，Phase A 上線 friend test，收 UX 反饋；mock fixture 涵蓋折讓 / 作廢場景以驗證沖銷邏輯。

| 工作 | 位置 |
|---|---|
| API client（fetch + 簽章 + parse + retry） | `lib/invoice/api.ts` |
| Merchant → category mapper | `lib/invoice/categories.ts` |
| Invoice → txn draft mapper | `lib/invoice/mapping.ts` |
| `previewInvoiceImport(credentialId, range)` server action | `actions/invoice.ts` |
| `commitInvoiceImport(runId, selections)` server action（atomic） | `actions/invoice.ts` |
| 匯入預覽 sheet UI | `app/(dashboard)/settings/_components/InvoiceImportSheet.tsx`（新） |
| Settings page 「匯入發票」row | `SettingsContent.tsx` |
| Dashboard banner（30 天提醒） | `app/(dashboard)/dashboard/_components/InvoiceReminderBanner.tsx`（新） |
| 整合測試：mock API + dedup + commit atomicity | `__tests__/invoice/*.test.ts` |

**Deliverable**：使用者可一鍵預覽 + 勾選 + commit 過去任意月份的發票。

### Phase C — Polish（隨 friend test 反饋走）

- merchantToCategory 規則擴充（依 unmatched 樣本）
- 「最近 6 個月」shortcut 真做（Phase B 預設只支援單月）
- 匯入完成後動畫（光點亮起 batched）
- 失敗復原：partial commit 後重試只跑剩下的（v0.9.0 commit 是 atomic，不需要部分復原；保留位）

### Phase D — 之後（不在 v0.9.0）

- 自動 asset heuristic（中油 → primaryUserId 的車 / 寵物店 → 寵物 entity）
- 發票折讓 / 退貨沖銷
- 自然人憑證 / 悠遊卡 等其他 cardType
- IncomeTransactions 從哪來？薪轉是銀行 API 不在 MoF 範圍，不規劃

---

## 環境變數

| name | 用途 | 階段 |
|---|---|---|
| `MOF_INVOICE_APP_ID` | API 必填 appID | Phase B 起必須 |
| `ENCRYPTION_KEY` | 載具驗證碼加密 key | 既有 |
| `MOF_INVOICE_API_BASE` | 預設 `https://api.einvoice.nat.gov.tw/PB2CAPIVAN/invServ/InvServ`，覆蓋方便 dev | optional |
| `INVOICE_MOCK_MODE` | `1` 強制走 fixture（即使 APP_ID 存在） | Phase A debug |

---

## Open / deferred questions

> 已 lock 的舊問題：APP_ID 申請主體（公司，但卡法規灰區，見「APP_ID 申請卡點」）／ 折讓退貨沖銷（自動沖銷，見「折讓 / 作廢 自動沖銷」）／ Records 列表來源標示（不標示）。

1. **載具暱稱必填？**：當前設計是選填。雙人 group 兩人都綁時，預設值「我的」可能撞名 → 預設依 viewer.displayName 帶入
2. **跨月折讓的 sync 視窗**：4 月發票 5 月折讓時，5 月 preview 看不到。提案：每次 sync 額外 fetch 過去 6 個月有 active snapshot 的發票做 status diff（多 1–6 次 API call）。Phase B 末加，初版只 sync 當月即可
3. **跨年區間 UX**：「最近 6 個月」shortcut 跨年時如何顯示月份 chip？提案：chip 顯示「2025-12」full year-month，避免歧義
4. **Dedup 範圍**：目前是 group 內 unique。若同一人有多個 group（v0.9.0 不支援，但 schema 允許）會在另一 group 重複匯到；接受，因為兩個 group 是兩本不同帳
5. **Description 字數**：sellerName 常見 30+ 字（"○○○○股份有限公司桃園分公司"）；提案：截斷 + 移除常見後綴（「股份有限公司」、「分公司」）
6. **invStatus 真值對照**：MoF API spec PDF 未開放純文字版，「開立 / 作廢 / 已折讓」這幾個值的實際字串需 Phase B kickoff 時打 mock + 真環境確認，本 spec 暫以中文當常數示意

---

## 索引

- [財政部電子發票 API 文件](https://www.einvoice.nat.gov.tw/) （申請 APP_ID 入口、規格書 PDF）
- 既有 schema：[lib/db/schema.ts](../../../lib/db/schema.ts) → `invoiceCredentials`, `cashTransactions.invoiceNumber`
- 既有加密 helper：[lib/crypto.ts](../../../lib/crypto.ts)
- 設定頁：[app/(dashboard)/settings/_components/SettingsContent.tsx](../../../app/%28dashboard%29/settings/_components/SettingsContent.tsx)
- 既有 category 系統：[lib/categories.ts](../../../lib/categories.ts)
- 平行設計參考（如何做平行 sheet）：[0_7_0-incomesheet-design.md](0_7_0-incomesheet-design.md)
