---
status: shipped
first_shipped_in: v1.1.0
related_specs: [transactions, income, inbox-layer, recurring, solo-mode, trip-multi-currency, locale-currency]
related_issues: ["#51", "#552", "#553", "#554", "#555", "#556", "#557", "#585", "#586"]
---

# CSV 匯入歷史紀錄

> 換 app 最大的摩擦是「多年的資料怎麼辦」。Futari 提供一份**通用 CSV 格式**，讓使用者把過去在其他 app（Honeydue / Spendee / CWMoney / 自製 Sheet）的紀錄帶進來。
> Phase 1 MVP 只支援這份通用格式；競品原生 CSV 的轉換走 Phase 2 Excel 模板，不在 app 內做。

---

## 背景與動機

`docs/superpowers/user-feedback-analysis.md` 的時間窗口觀察：

> Honeydue 的衰退是時間窗口。現況是 1–10 人維護、客服失聯、用戶焦慮。這批用戶正在尋找替代品，且他們已經被「雙人記帳」的價值說服過，只需要一個更可靠的選項。

以及反覆出現的高頻 feature request：

> 用戶換 app 最大障礙是「多年的資料怎麼辦」。CSV 匯出、跨 app 匯入需求是高頻 feature request。

沒有匯入工具，Honeydue 出走用戶最多嘗試一個月就會放棄 Futari——「過去三年的紀錄丟了」這件事比新 app 的所有優點都重。

**Brand 對齊**：「不自動化取代感受」原則 → 匯入永遠經過 preview sheet，使用者可調 category / 預設付款人 / 跳過個別 row。一鍵的是「拉檔案」，不是「自動寫入」。

---

## Scope

### In（v1.1.0 MVP）

- `/settings` →「從其他 app 匯入」入口
- 上傳通用 CSV（schema 見下）
- 互動式預覽：前 10 列、欄位驗證、類別 mapping、預設付款人
- Dedup：依 `(transacted_at, amount, paid_by, category, note[:10])` hash 比對既有 CashTransaction
- Import metadata：每筆匯入的 row 都標 `import_batch_id` + `source` + `imported_at`，給未來 audit / 回滾用

### Out（給後續 phase）

- 競品原生 CSV 自動 parse（→ Phase 2 提供 Excel 轉換模板，#557 起）
- 多帳戶 / 銀行對帳單 / OFX / QIF
- 自動偵測來源 app（樣本不齊、覆蓋率低，CWMoney 等需 VIP 才能匯出，MVP 階段不投資）
- Settlement 重建：匯入 record 視為歷史快照，**不重算 GroupBalance 之外的雙人結算狀態**（來源 app 的金錢歸屬規則不同）
- 還原原 app 的轉帳 row（轉帳概念不對應 Futari schema，一律 drop）

### 競品研究 ref

完整競品 CSV 欄位調查見 [`csv-import-research.md`](csv-import-research.md)（若該檔尚未補上，可參考 [#51 issue](https://github.com/redtear1115/oikos/issues/51) 的研究結果章節）。本 spec 不重複那份內容；本 spec 只 lock Futari 端要接收的格式。

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| MVP 接收格式 | **單一通用 CSV**（中文 header） | 對齊「天天記帳」標竿，TW 用戶最熟；不投資多種 parser |
| 來源 app 自動偵測 | **不做**（手動上傳對應好的 CSV） | 樣本不齊、CWMoney 欄位是底層 schema 難穩定偵測 |
| 編碼 | **UTF-8**（接受 BOM） | Excel / Numbers 匯出常帶 BOM；不接受 Big5 等舊編碼 |
| 金額表示 | **正整數 + 獨立 `類型` 欄** | 不用正負號表達收支；明確、不會誤讀；對齊 Futari schema base-currency integer 慣例 |
| 幣別 | **預設 group `base_currency`**；MVP 不接收 multi-currency CSV | 多幣別走後續版本；當期 CSV 一律視為 base 幣別 |
| 分攤 split_type | **匯入時統一指定（單一規則）**；row-level 無法覆寫 | 來源 app 沒有 split 概念；強制 user 在預覽階段一次選定（all_mine / all_theirs / half / 50%） |
| 預設付款人 | **整檔指定**，row-level 可由 `成員` 欄覆寫 | 與分攤同邏輯：能批量處理就批量處理；row-level 給個別覆蓋空間 |
| 落地對象 | **僅 CashTransactions** + 收入落 **IncomeTransactions** | MVP 不匯入 settlement / asset / trip / recurring rule |
| 章節歸屬 | **照 `transacted_at` 落到對應 epoch** | 包含過去 chapter；過去 chapter 仍然 read-only（[epoch-readonly](epoch-readonly-design.md)），但匯入是寫入動作，視為章節之外的歷史補登 |
| 重複偵測 | **Hash-based dedup**，碰撞時 user 選擇（跳過 / 雙寫 / 取代既有） | 重要：每次匯入都比對既有 row，避免再次匯入造成雙重紀錄 |
| Dry-run | **預覽 = dry-run**，confirm 才寫入 DB；中途錯誤整批 rollback | atomic transaction，符合「不留半成品」 |
| 匯入規模上限 | **單檔 ≤ 5000 列**（超過要拆檔） | UI preview 與 dedup 比對的可預期上界；保護 DB |
| 回滾 | **MVP 提供 import_batch undo**（限同次匯入 24 小時內，未被後續編輯動到的 row） | 給「按錯」的安全網；不做長期歷史回滾 |

---

## 通用 CSV 格式

### Schema

```csv
日期,類型,金額,類別,成員,備註
2026-05-09,支出,250,餐飲,member_a,午餐
2026-05-09,支出,1200,生活用品,member_b,日常雜貨
2026-05-08,收入,40000,薪資,member_a,五月薪資
```

| 欄位 | 必填 | 接受值 | 落入 Futari 的對應 |
|---|---|---|---|
| `日期` | ✅ | `yyyy-MM-dd` / `yyyy/MM/dd` / `yyyyMMdd` | `transacted_at`（時區當作 group 主時區 Asia/Taipei，00:00:00 local） |
| `類型` | ✅ | `支出` / `收入` / `expense` / `income`（大小寫不敏感） | 決定落 `CashTransactions` 或 `IncomeTransactions` |
| `金額` | ✅ | 正整數，無正負號、無小數、無千位逗號 | `amount`（base 幣別整數） |
| `類別` | ❌ | 字串，留空 → `其他` | `category`（透過 mapping wizard 轉成 Futari `Category.id`） |
| `成員` | ⚠️ | `member_a` / `member_b`，留空 → 取「預設付款人」 | 支出落 `paid_by`；收入落 `recipient_id` |
| `備註` | ❌ | 自由字串（≤ 500 char） | `description`（必填，留空時 fallback 為「匯入紀錄」） |

### 接受值的 normalisation 規則

- **日期**：解析後一律轉成 `yyyy-MM-dd`，再用 Asia/Taipei midnight 升成 timestamptz
- **類型**：`支出`/`expense`/`Expense`/`EXPENSE` 都算支出
- **金額**：拒收 `1,200`（要 `1200`）、拒收 `-250`（用 `類型=支出`）、拒收 `1.50`（USD 以 \*100 整數儲存的規則由匯入後的編輯流程處理，匯入 MVP 階段一律整數）
- **類別**：原始字串保留在預覽，mapping wizard 才轉成 `Category.id`；無對應時保留 `其他`
- **成員**：`member_a` / `member_b` 為通用代號（**不是** UUID）；匯入時解成當前 group 的 `member_a` / `member_b` profile id

### 不接受 / 拒收

| Row 狀態 | 行為 |
|---|---|
| 必填欄空 | 該 row 標記 `error`，預覽顯示紅字；user 必須在預覽編輯或捨棄該 row 才能繼續 |
| 日期未來 > 7 天 | 該 row 標記 `warning`，預覽顯示橘字；user 確認後可繼續（容許「明天的房租已預扣」場景） |
| 日期早於 group 建立日 | OK，照 `transacted_at` 落到對應 epoch；若該日期早於最早 epoch，落入該 epoch |
| 金額 = 0 | 拒收（語意不明） |
| 金額 > 9,999,999（base 幣別整數） | 拒收（保護 DB；user 應拆分） |
| 重複 row（檔內自身重複） | 預覽顯示 `duplicate-in-file` 標記，user 選跳過 / 全留 |
| 重複 row（檔 vs 既有 DB） | 走 dedup 流程，見下節 |

---

## Import UX flow

入口：`/settings` →「資料管理」section →「從其他 app 匯入」

### Step 1 — 上傳檔案

- 支援副檔名：`.csv`、`.txt`（內容仍須為 CSV）
- 客戶端檔案大小上限：2 MB
- 上傳後立即在 client 端 parse + 跑 schema validation；不過 schema 直接跳錯誤頁，無 server round-trip

### Step 2 — 預覽表格

- 顯示前 10 列 + 總列數 + 錯誤 / 警告計數
- 每列標籤：`ok` / `warning` / `error` / `duplicate-in-file` / `duplicate-existing`
- 提供「只看錯誤」/「只看警告」filter
- User 可在預覽**單列編輯**（修日期 / 金額 / 類別 / 成員 / 備註）；編輯後立即重跑該列 validation
- User 可在預覽**單列刪除**（不會匯入該 row）

### Step 3 — 類別 mapping wizard

- 列出 CSV 中**所有 distinct 類別字串** → 對映到 Futari 內建 `Category.id`（支出）或 income category id（收入）
- 自動 fuzzy match：`餐飲` → `dining`、`衣服` → `clothing`、`交通` → `transit`（同義字 / 簡繁通用詞表內建）
- 未自動對映的，用 dropdown 讓 user 選；沒選的一律 fallback 到 `other`
- Mapping 結果在當次匯入後**不保存**（MVP 不做 per-group preference；下次匯入要重新對映）

### Step 4 — 整檔指定預設付款人 + split rule

- 預設付款人：dropdown 選 `member_a` / `member_b`（CSV `成員` 欄留空時用此）
- Split rule：dropdown 選 `all_mine` / `all_theirs` / `half`（對應 [transactions](transactions-design.md) `split_type`）；MVP 不支援匯入 `weighted`（要編輯）
- Solo group（[solo-mode](solo-mode-design.md)）強制 `all_mine`，UI 鎖定
- 收入 row 不適用 split：照 `成員` 欄落 `recipient_id`

### Step 5 — Dedup 決策（若有 `duplicate-existing`）

- 預設「全部跳過重複」（保守，不雙寫）
- User 可在 list 看每筆既有 row 對照，選個別覆寫 / 雙寫
- 若沒有 `duplicate-existing`，本 step 直接跳過

### Step 6 — 確認 + 匯入

- 顯示 summary：`即將匯入 N 筆（支出 X / 收入 Y）／ 跳過 M 筆（K 筆重複、L 筆錯誤）`
- 「開始匯入」按鈕 → 整批 atomic DB transaction → 完成頁顯示結果
- 完成頁包含「24 小時內可整批還原」按鈕（→ `import_batch` undo）

### 錯誤狀態

| 狀態 | UI 行為 |
|---|---|
| 檔案非 CSV / 解析失敗 | Step 1 直接拒收，顯示「請使用通用 CSV 格式」+ 連結到範本下載 |
| 檔案超過 5000 列 | Step 1 拒收，顯示「請拆成多份匯入」 |
| 全部 row 都是 error | Step 2 預覽顯示，但 Step 6「開始匯入」按鈕 disabled |
| 匯入中 transaction 失敗 | 整批 rollback、顯示錯誤訊息；不留半批 |
| Realtime 連線中斷 | 匯入照常進行（server-side transaction），完成後 Realtime 補播 INSERT |

---

## Dedup 規則

### Hash 組成

```
sha256(
  transacted_at(date-only, Asia/Taipei) || '|' ||
  amount(integer) || '|' ||
  paid_by(uuid) || '|' ||
  category(Category.id) || '|' ||
  description.slice(0, 10)
)
```

語意：**同一天、同一個人、同一金額、同一分類、備註前 10 字相同**就視為重複。

選擇這組欄位的理由：

- `transacted_at` date-only：跨 app 匯入時 time 通常是 00:00，不應因 time 差被當作不同筆
- `paid_by`：CSV 同金額同分類同天還是可能是雙方各自的支出（例：兩人都買咖啡），保留付款人維度
- `category`：避免「分類不同」被算成重複
- `description.slice(0, 10)`：完全用 description 過嚴（一個字差就被當不同），不用又會把雙方各自買的午餐視為同一筆；前 10 字是 PTT/Honeydue 用戶實測較穩定的長度

### 碰撞時的 UI

| 選項 | 行為 | UI default |
|---|---|---|
| 跳過 | 不匯入該 CSV row，保留 DB 既有 row | ✅ 預設 |
| 雙寫 | 兩筆都留（CSV row 帶 `import_batch_id`） | 給「我真的這天有兩次同分類同金額」場景 |
| 取代 | soft delete DB 既有 row，匯入新 row | 給「DB 那筆是手 key 錯，CSV 才是正確」場景 |

### 跨次匯入

每次匯入都重跑 dedup。重複匯入同一份 CSV 預設不會雙寫（全部會被標 `duplicate-existing` + 預設跳過）。

---

## Import metadata + DB schema 需求

> 本節是給 #556（schema 子 issue）的需求清單；實際欄位定義以 `lib/db/schema.ts` 為準。

### 新 entity: `ImportBatches`

每次匯入產生一筆 `ImportBatches` row，記錄：

- `id` (uuid PK)
- `group_id` (FK → OikosGroups)
- `imported_by` (FK → Profiles，誰按下「開始匯入」)
- `source` (text；free string，user 在預覽階段填，例：`honeydue-2026-q1`、`cwmoney-export`、`manual`)
- `row_count` (integer，實際落地的 row 數)
- `skipped_count` (integer，dedup 跳過數)
- `imported_at` (timestamptz)
- `undone_at` (timestamptz，nullable；按下「整批還原」時設值)

### `CashTransactions` / `IncomeTransactions` 新欄位

- `import_batch_id` (uuid FK → ImportBatches，nullable)：手動建立的 row 為 NULL；匯入 row 帶 batch id

### Undo 規則

- 「整批還原」= soft delete 該 `import_batch_id` 底下所有 row
- 限制：`imported_at` < 24 小時 且 batch 內無 row 被後續編輯過（soft delete + insert 鏈會打斷 batch 連結，此情況不允許 undo）
- 24 小時後 undo 按鈕消失（但 `import_batch_id` metadata 永久保留，給未來 audit）

### Audit 用途（未來）

未來若做「資料來源檢視」/「按來源分群統計」/「客服除錯」，全部靠 `import_batch_id` + `ImportBatches.source` 兩個欄位就能組出 query。MVP 不做 UI，但 schema 先 seed。

---

## 與其他 spec 的互動

- [transactions](transactions-design.md)：匯入直接寫 `CashTransactions`，不過 AddSheet UI；split_type / split_ratio 由整檔規則決定
- [income](income-design.md)：類型=收入的 row 寫 `IncomeTransactions`；不影響 balance
- [inbox-layer](inbox-layer-design.md)：CSV 匯入**不走 Inbox**（Inbox 是 row-level 確認，CSV 一次大量 row，UX 不同；預覽 sheet 就是 CSV 的「Inbox 階段」）
- [recurring](recurring-design.md)：匯入不建立 recurring rule，只匯入歷史 row
- [solo-mode](solo-mode-design.md)：Solo group 強制 `all_mine`，預覽 UI 鎖定
- [epoch-readonly](epoch-readonly-design.md)：匯入 row 照 `transacted_at` 落到對應 epoch（包含過去章節）；落地後仍受過去章節 read-only 保護（不可後續編輯）
- [trip-multi-currency](trip-multi-currency-design.md)：MVP **不支援匯入到 trip**；trip 是 epoch-bound 子帳本，跨 trip 的歷史 row 沒有對應 trip_id 可填
- [locale-currency](locale-currency-design.md)：匯入 row 一律 base 幣別整數；多幣別匯入延後

---

## 範本與下載

- `/settings` →「從其他 app 匯入」頁面提供：
  - 通用 CSV 範本下載（.csv，含 header + 3 列範例）
  - Phase 2 Excel 轉換模板連結（v1.1.0 ship 時可能只有 CWMoney→Futari，#557）
- 範本檔由 spec 文件描述格式，實際檔案放在 `public/import-templates/`

---

## Acceptance criteria

匯入 feature 視為 done 的條件：

- [ ] User 從 `/settings` 點「從其他 app 匯入」可上傳通用 CSV
- [ ] 預覽顯示前 10 列 + 錯誤 / 警告 / 重複標記
- [ ] 類別 mapping wizard 能將 CSV 類別字串對映到 Futari `Category.id`
- [ ] 整檔指定預設付款人 + split rule，row-level 可覆寫
- [ ] Dedup 比對既有 DB row，碰撞時 user 可選跳過 / 雙寫 / 取代
- [ ] 確認後 atomic 寫入 DB；中途失敗整批 rollback
- [ ] 每筆匯入 row 帶 `import_batch_id`；`ImportBatches` 表記錄 source / count / imported_at
- [ ] 完成頁 24 小時內可整批還原（soft delete）
- [ ] 過去 epoch 的 row 落入正確 chapter；落地後不可編輯（受 epoch-readonly 保護）
- [ ] Solo group 強制 all_mine

非 acceptance criteria（明確不在 v1.1.0 範圍）：

- ❌ 競品原生 CSV 自動 parse
- ❌ 多幣別匯入
- ❌ Settlement / Asset / Trip / Recurring rule 匯入
- ❌ 24 小時後的還原 / 跨 batch 復原
- ❌ Mapping 偏好跨次保存

---

## 開放問題

- 範本 i18n：通用 CSV header 是否要支援英文 / 日文 / 簡中 header？目前傾向 **只支援中文 header**（標竿是 TW「天天記帳」，海外用戶可改 header 後再上傳）；待 v1.1.0 海外用戶反饋後決定。
- Mapping 偏好保存：MVP 後若觀察到「同 user 多次匯入」高頻，再考慮 per-group 保存 mapping table。
