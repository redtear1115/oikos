# Specs — Index & Writing Guide

> 這個目錄記錄 Oikos / Futari 每個 feature 的**設計**：要做什麼、為什麼這樣做、要回答誰的需求。
> 不記錄怎麼做（實作細節、PR 拆分、工時、測試指令）— 那些是 plan / code / git history 的工作。

---

## 用途

讀者（agent 或人）想了解一個 feature 的設計決策時，從這份 INDEX 切入：

1. 用下面的「Spec 清單」找到對應 spec
2. 進去看 frontmatter 知道是否已 ship、ship 在哪版
3. 讀 body 拿到 what / why / who 三件事

新增或修改 spec 時，先讀本檔的「寫作原則」、「Frontmatter schema」、「拆分原則」三節。

---

## 寫作原則

Spec 寫 **what / why / who**，不寫 **how**。

| 要寫 | 不要寫 |
|---|---|
| 這個 feature 是什麼、解決什麼問題 | PR 拆分計畫 |
| 設計決策 + 為什麼（locked decisions / 不採用 列表） | 工時估算 |
| 產品立場（陪伴 / 不評判 / 不背景自動化等） | 實作順序、step-by-step |
| Entity 語意、欄位語意 | 完整 DDL（schema 真相在 `lib/db/schema.ts`） |
| Acceptance criteria — 怎樣算 done | 「如何 run 測試」這類 ops 知識 |
| 驗收用的場景列表（保留 what） | 測試矩陣含 implementation 細節（砍） |
| 與其他 spec / 既有元件 的概念連結 | TypeScript code blocks / 元件 props diff |

關於 schema：spec 描述「這個欄位語意是什麼、為什麼存在」即可，不抄完整 `CREATE TABLE` 或 Drizzle 宣告——那些放 `lib/db/schema.ts` + `drizzle/<migration>.sql`。spec 內 ref to 程式碼路徑。

關於 implementation reference：可以列關鍵 helper / file 路徑當「實作落地點」，但不抄程式碼。例如「dispatch 邏輯 → `lib/insurance.ts`」OK，「`const [open, setOpen] = useState(false)`」不 OK。

---

## Frontmatter schema

每份 spec 頂部用 YAML frontmatter 標 metadata：

```yaml
---
status: shipped | planned | blocked
first_shipped_in: v0.x.y         # 省略代表還沒 ship
updates:
  - v0.x.z: 一句話描述變更（含 PR/issue 編號）
  - v0.x.y: 同上
related_specs: [transactions, structured-filter]   # spec key（檔名去掉 -design 後綴）
depends_on: [stats]                                # subset of related_specs；強依賴才填
related_issues: ["#22", "#102"]                    # 主軸 issue
blocked_on: 外部依賴敘述                            # 只有 status=blocked 時填
---
```

欄位語意：

- **`status`** — 三選一：
  - `shipped`：至少一個版本 ship 過（後續 updates 仍是 shipped）
  - `planned`：spec 已 lock，等開發
  - `blocked`：spec lock 但等外部依賴（例：cloud-invoice 卡 APP_ID）
- **`first_shipped_in`** — 第一次落 prod 的版本。後續變更走 `updates`。
- **`updates`** — 結構化 changelog，**只寫主要變更**（不是逐次 polish）。每筆一行，含 PR/issue 編號。
- **`related_specs`** / **`depends_on`** — 用 spec key（檔名 stem，不含 `-design.md`）。
- **`related_issues`** — 用字串避免 YAML 把 `#` 當註解。
- **`blocked_on`** — 只在 `status: blocked` 時填，說明卡在哪。

不放在 frontmatter 的東西：工時、版本主題敘事、PR 編號清單（這些放 CHANGELOG.md 或 milestone）。

---

## 拆分原則

- **一個 spec = 一個 feature**（一個可獨立講清楚的產品能力）
- **小 feature 併進母 spec**：例如 FAB 在 /records tab 的 context-awareness 不獨立成 spec，併進記帳核心 spec
- **合集要拆**：早期的「Phase X 設計 bundle」這類混合 spec 隨時間累積，應拆成各自獨立的 feature spec
- **橫切關注獨立成 spec**：locale / 幣別、離線、epoch read-only 這類跨多個 feature 的決策

判斷一個東西是不是 feature 的標準：能不能用「這個 feature 是什麼 / 為什麼存在 / 給誰用」三句話講完。如果只能講「這個元件怎麼改」，那是 implementation 不是 feature。

---

## 檔案命名

- 檔案：`<key>-design.md`（保留 `-design.md` 後綴以區隔目錄內其他類型文件）
- Key：snake-or-kebab-case 對應 feature 概念（`transactions`、`structured-filter`、`monthly-review`）
- Frontmatter 內互相 reference 用 key（不含 `-design` 後綴）
- INDEX.md 是這個目錄的唯一非 spec 文件

---

## Spec 清單

> 每筆：`[spec key](file) — 一句話 feature scope`。狀態看 spec 內 frontmatter。

### 架構

- [product](product-design.md) — Tech stack / 整體架構 / Auth 分層 / Schema 設計原則
- [locale-currency](locale-currency-design.md) — 「保持簡單」：多語（4 語 cookie-based locale）+ 初始幣別選擇（per-group base_currency），onboarding 一次性決策、locale ⊥ currency、日常無 picker
- [offline-browsing](offline-browsing-design.md) — PWA / Service Worker / opt-in 離線瀏覽
- [realtime](realtime-design.md) — Realtime 訂閱規則：INSERT prepend / UPDATE fade / balance cross-fade / reconnect / filter 靜默跳過

### 記帳核心

- [transactions](transactions-design.md) — 雙人記帳 CRUD / Settlement / Balance / /records FAB context-awareness
- [income](income-design.md) — IncomeTransactions + IncomeSheet（進帳獨立 ledger）
- [structured-filter](structured-filter-design.md) — /records 結構化篩選器（日期 / 愛物 / 誰付 / 分攤 / 分類 + URL 分享）
- [stats](stats-design.md) — /records 月度／分類統計（含 drill-down 從 stats row → feed filter chip）
- [trip-multi-currency](trip-multi-currency-design.md) — 「邊界複雜」：旅行子帳本（TripExpense sandbox）+ 多幣別 record + 心理匯率 snapshot；建立時鎖匯率、結束時 fold 為 2 筆 summary 回主帳本

### 體驗

- [design-system-primitives](design-system-primitives-design.md) — Button, TextInput, Sheet primitives + token layer
- [ia-unified-header](ia-unified-header-design.md) — 四大入口三層標頭統一（L1/L2/L3）+ ContextStrip 取代分散 banner
- [onboarding](onboarding-design.md) — 新人 onboarding flow（sign-in → 建群組 → 邀請對方／稍後再說）
- [solo-mode](solo-mode-design.md) — 單人帳本模式：分攤鎖 all_mine、balance hero 隱藏、邀請 banner、升雙人不 retroactive
- [epoch-readonly](epoch-readonly-design.md) — 過去章節 read-only + read-path 型別防呆
- [monthly-review](monthly-review-design.md) — 雙人月度回顧儀式
- [avatar-quick-settings](avatar-quick-settings-design.md) — Dashboard avatar 可點開 bottom sheet（個人 + 帳本身份設定）；Settings 主頁瘦身成 app + data + 危險區

### 提案與匯入

> 不直接記帳：設一次規則或匯入外部來源，使用者 review / confirm 才落 transaction。

- [recurring](recurring-design.md) — 自訂定期收支：規則 → cron 產 pending → 用戶 confirm 落 transaction
- [inbox-layer](inbox-layer-design.md) — 統一所有「非親手建立」資料的 review flow（recurring / LINE / 帳單匯入 共用 Inbox）
- [cloud-invoice](cloud-invoice-design.md) — 雲端發票匯入（blocked on 財政部 APP_ID）
- [csv-import](csv-import-design.md) — 通用 CSV 匯入歷史紀錄（換 app 用戶的歷史資料保留 + import_batch undo）

### 愛物

- [aibutsu](aibutsu-design.md) — 愛物概念命名 + IA + Pet/Plant/Child entity types
- [car-fuellog](car-fuellog-design.md) — 車輛 entity + FuelLog 雙寫
- [aibutsu-templates](aibutsu-templates-design.md) — 愛物模板系統（item type，純文字紀錄）

### 守護

- [guardian](guardian-design.md) — 守護模組獨立化 + beta gate（將來付費層 wedge）
- [insurance](insurance-design.md) — Insurance entity + 險種家族
- [savings-view](savings-view-design.md) — 儲蓄險詳情頁 framing（累計繳 vs 拿回）

---

## 其他位置

- 競品 / 用戶分析：[oikos-competitive-analysis.md](../oikos-competitive-analysis.md) · [user-feedback-analysis.md](../user-feedback-analysis.md)
- 版本歷史：[CHANGELOG.md](../../../CHANGELOG.md)
- 版本對應 issue：GitHub milestones
- 實作進行中的 plans / scratch docs：`docs/superpowers/plans/`（**gitignored**，本地工作用，不進 spec）
