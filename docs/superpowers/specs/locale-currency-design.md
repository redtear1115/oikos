---
last_updated: 2026-05-18
status: shipped
first_shipped_in: v0.11.1
updates:
  - v0.12.0: 愛物詳情頁 + AssetSheet 完整翻譯（#20 PR #69）、Settings 子頁 coming-soon + invite + trust（#21 PR #64）、`recurringIncome` / `recurringExpense` namespaces（PR #77）
  - v0.17.0: 加入 group `base_currency`（4 選 1：TWD / CNY / USD / JPY），預設 `'twd'`；Settings → 貨幣可改主體幣別；當前 epoch 無 record 時可改、有 record 則鎖（#68）
  - v0.17.1: `/settings/currency` UX pass — 主體幣別被鎖住的解釋卡、design token 對齊（PR #333 closes #322 #323 #324 #325 #326）
  - v0.17.3: spec 重組——i18n + base_currency 設定整合為「一次性決策」哲學（#364），擴充自原 `i18n-design.md`
related_specs: [onboarding, trip-multi-currency, product]
related_issues: ["#20", "#21", "#68", "#322", "#364"]
---

# 語言 × 初始幣別

> **核心哲學：保持簡單，選一次就好。**
> 語言（locale）與主體幣別（base_currency）都是「使用者進來幾分鐘內各選一次、之後不再打擾日常」的設定。兩者**獨立決策**——locale 影響顯示語言，base_currency 影響金額計算視角；中文使用者用日圓、日文使用者用台幣都合理。Settings 把兩者並排在同一個「語言 & 幣別」區塊，視覺上對齊「兩條一次性軌道」的形狀。

---

## 背景與動機

### 為什麼 locale 與 base_currency 該被視為同類

兩件事在產品流程上長得一樣：

| | Locale | Base currency |
|---|---|---|
| 何時選 | Onboarding（sign-in 頁 LanguageSwitcher / 進來後 Settings） | 建群組後第一筆紀錄前（Settings → 貨幣） |
| 選完之後 | 不需要再打擾使用者 | 不需要再打擾使用者 |
| 在主流程出現 | ❌ 不在每筆紀錄出現 | ❌ 不在每筆紀錄出現 |
| 改變頻率 | 極低（換手機 / 換生活環境才會改） | 極低（搬家 / 工作地點變化才會改，且需要當前 epoch 無 record） |
| 是否獨立 | ✅ 與 currency 獨立 | ✅ 與 locale 獨立 |

把兩者放在同一份 spec 講「一次性決策、不打擾日常」這條哲學，比把它們散在 i18n + 多幣別兩份 spec 裡更能傳達設計立場。

### 為什麼 locale 與 currency 必須獨立

許多競品（Spendee / MOZE 等）把語言與幣別綁在 region 設定。Futari 的 TA 真實樣貌：

- **中文使用者外派日本** → 介面想看 zh-TW、主體幣別想用 JPY
- **日文使用者來台留學** → 介面想看 ja、主體幣別想用 TWD
- **跨國伴侶** → 兩人母語不同，一個切 zh-TW 一個切 en；但帳本只有一個 base_currency（兩人協商一個）
- **海外薪資雙人家庭** → 介面用 zh-TW、薪水主幣別 USD

把 locale 與 currency 解耦，是承認雙人帳本服務的就是這種混搭情境。

### 為什麼 onboarding 不強迫一次選兩個

Onboarding 已經有三步（歡迎 → 建群組 → 邀請對方）。加第四步「選幣別」會壓垮 60 秒內完成第一筆紀錄的承諾。設計上：

- Sign-in 頁尾的 **LanguageSwitcher (footer variant)** ——「first-touch 就告訴你這個 app 願意說你的語言」是 brand 表態；不強迫，純引導
- Base currency **預設 `'twd'`**——主要 TA 是台灣，預設值對 90% 用戶免設定；非台灣用戶到第一筆紀錄前可去 Settings → 貨幣改
- 兩者**都不擋 onboarding 完成**

---

## Locked decisions

### Locale（語言）

| 維度 | 決定 | 理由 |
|---|---|---|
| 支援語系 | **zh-TW / zh-CN / en / ja**（4 語） | 主要 TA + 日本市場（Futari／ふたり 名稱就是對日本市場的邀請） |
| 預設語系 | **`zh-TW`** | 主要 TA；fallback 維持原 Phase 1 體驗 |
| Locale 識別 | **`lang` cookie**（1 年 max-age、SameSite=Lax）+ optional `?lang=` 入口 | URL prefix（`/zh-TW/dashboard`）成本高（路由全改）+ 視覺破壞；cookie 一次設好不影響 URL、shareable link 無須帶 locale |
| 切換 UX | **`document.cookie =` + `router.refresh()`** | 不過 server action（純 client），延遲最低；router.refresh 觸發 RSC 重新 render → server 讀新 cookie → 字典換掉 |
| 字典載體 | **TypeScript const object**，與 `Translations` type 對齊 | 編譯期檢查 missing key；無 runtime fetch；trade-off 是 4 個檔案要手動同步（接受） |
| 字典結構 | **巢狀 namespace**（`signIn` / `common` / `dashboard` / `records` / `settings` / `assets` 等） | 同 namespace 同一頁，避免 flat key 命名衝突；type 直接 mirror |
| Server 取得 | **`getTranslations()`**（`'server-only'`，讀 `cookies()`） | RSC 直接 await；proxy 不參與 dictionary lookup |
| Client 取得 | **`<TranslationsProvider value={t}>` + `useTranslations()`** | 由 dashboard layout / sign-in page 一次性 fetch + 注入；client 純讀 context、不重新 fetch |
| Provider 邊界 | **dashboard layout 包整個登入區；sign-in page 自帶** | sign-in 是 public 頁、layout 不適合 wrap；兩邊各自 await 簡單可預期 |
| LanguageSwitcher 變體 | **`pill`**（Settings、卡片式 segmented）/ **`footer`**（sign-in、低調 inline 文字） | 兩個情境視覺權重不同；單一元件 `variant` prop 切換 |
| 翻譯漏洞處理 | **不做 fallback**（type 強制每語系每 key 都填） | 漏字 = 編譯失敗，比 runtime fallback 更早暴露 |
| Plural / interpolation | **目前不需要** | 字典實際看下來都是固定字串；遇到動態量詞採 `${count} 筆紀錄` 直接拼，不引 ICU MessageFormat |
| 日期格式化 | **`Intl.DateTimeFormat(locale)`** | 字典只處理字串；日期格式留給平台 Intl，跟著 locale 自動切 |

### Base currency（主體幣別）

| 維度 | 決定 | 理由 |
|---|---|---|
| 支援幣別 | **TWD / CNY / USD / JPY**（enum 4 選 1） | MVP scope；之後擴充走 enum migration |
| 預設值 | **`'twd'`** | 主要 TA；對 90% 用戶免設定 |
| 設定位置 | **per-group**（`OikosGroups.base_currency`） | 一個帳本一個視角；雙人 group 兩人共用 |
| 設定入口 | **Settings → 貨幣**（不在 onboarding） | 預設 `twd` 涵蓋多數用戶；少數需要改的用戶到第一筆紀錄前去設定 |
| 修改規則 | **當前 epoch 無 record 時可改、有 record 則鎖** | 避免歷史紀錄的 base currency 語意漂移；新建 group 或剛開新 epoch 的群組能補設定 |
| 鎖住時的 UI | **disable + hint card**「為什麼鎖住」+「開新章節重設」替代路徑 | 用陪伴語解釋而非冷冰冰的錯誤 |
| 影響範圍 | balance / settlement / report / 主帳本所有顯示視角全圍繞此幣別 | 與 [trip-multi-currency](trip-multi-currency-design.md) 的「主帳本永遠單幣別」立場一致 |
| 與 locale 的耦合 | **完全獨立**——locale 切換不改 currency、currency 切換不改 locale | 雙人跨境家庭常見：介面語言與主體幣別屬不同決策 |
| Locale-aware currency formatting | **不做** | 金額顯示走 `lib/currency.ts#formatAmount(amount, currency)`，幣別符號與千分位由 currency 決定、不由 locale 決定 |

---

## 不採用

### Locale

- ❌ **next-intl / i18next**：framework 自帶的 plural / loader / namespace splitting 對目前體積過重；自製 70 行夠用
- ❌ **URL prefix locale（`/[locale]/...`）**：影響全 routing、所有 link、proxy 重做；cookie 路徑成本最低
- ❌ **Proxy 直接讀字典 + render 階段 inject**：proxy 跨 RSC / Server Action / Edge 多 runtime 邊界，字典體積會被多次序列化
- ❌ **每次 client 切語系打 server action**：純 cookie 寫 + router.refresh 已足夠；多一次 round-trip 沒必要
- ❌ **動態 import 字典**（依語系 lazy load）：4 語總體積仍小，code split 收益不抵複雜度
- ❌ **字典放 DB / Supabase**：語系不該需要 admin 流程；TS 編譯時鎖定即可
- ❌ **RTL 支援**：目前 4 語都是 LTR；需要時再加

### Base currency

- ❌ **Onboarding 強制選幣別**——預設 `'twd'` 已涵蓋多數用戶；多一步壓垮 60 秒首筆紀錄承諾
- ❌ **Locale-bound currency**（zh-TW → TWD、ja → JPY 自動綁）——雙人跨境家庭混搭情境常見、強綁會誤判
- ❌ **Per-user base currency**（同 group 兩人各自視角）——雙人帳本核心立場是「兩人共同一本帳」，視角分裂與哲學衝突
- ❌ **無限制改 base_currency**（即使 epoch 已有紀錄）——base 是 balance 計算單位、歷史會語意漂移
- ❌ **加密貨幣 / 自訂第 5 幣別**——enum 鎖 4 種；自訂幣別開門後 i18n / 排序 / 匯率矩陣會炸開

### 跨設定的耦合

- ❌ **Locale × currency 自動推導**（一個改了另一個跟著變）——獨立決策立場
- ❌ **Region 設定**（同時涵蓋 locale + currency + date format）——iOS / macOS 路線；對雙人混搭 TA 不合適

---

## 設計

### Part 1：Locale 資料流

```
Request 進來
  ↓ proxy：?lang=xx 若存在 → 寫 cookie
  ↓ Server entry：await getTranslations() ← 讀 cookie → 取對應 dict
  ↓ 渲染 RSC：t.signIn.tagline / t.dashboard.balance 等
  ↓ 傳到 dashboard layout：<TranslationsProvider value={t}>
  ↓ Client component：const t = useTranslations() → 讀 context
```

切換流程：

```
LanguageSwitcher click → document.cookie = `lang=xx; ...` → router.refresh()
  → RSC 重 render → getTranslations() 讀新 cookie → 整頁字串換掉
```

實作落地點：`lib/i18n/`（locales-meta、t.ts、client.tsx、LanguageSwitcher、locales/{zh-TW,zh-CN,en,ja}.ts）；Provider 接入點 `app/(dashboard)/layout.tsx` + `app/sign-in/page.tsx`。

### Part 2：Base currency 資料流

```
建立 group → OikosGroups.base_currency 預設 'twd'
  ↓ 用戶（option）：Settings → 貨幣 → 改 base_currency
  ↓ Server action `actions/group.ts#setBaseCurrency` 驗證當前 epoch 無 record
  ↓ 通過 → UPDATE OikosGroups.base_currency
  ↓ 失敗 → throw + UI disable + hint card

寫入路徑：所有 CashTransactions / IncomeTransactions / Settlements 用 group.base_currency
讀取路徑：所有顯示 amount 的 callsite → formatAmount(amount, group.base_currency)
```

實作落地點：`actions/group.ts#setBaseCurrency`、`app/(dashboard)/settings/currency/page.tsx`、`lib/currency.ts#formatAmount`。

### Part 3：Settings 結構

`/settings` 主頁的「語言 & 幣別」section（並排呈現）：

```
─────────────────────────────────
語言 & 幣別
─────────────────────────────────

語言
  [zh-TW] [zh-CN] [en] [ja]      ← LanguageSwitcher (pill variant)

主體幣別                  → /settings/currency
  目前：TWD（新台幣）
─────────────────────────────────
```

**並排呈現**反映兩條設定的同類性，但點進去各自有獨立子頁：

- LanguageSwitcher 直接在 `/settings` 主頁切換（無子頁、無確認 step）
- 主體幣別走 `/settings/currency` 子頁（同頁包含心理匯率設定——屬 [trip-multi-currency](trip-multi-currency-design.md) 範圍）

設計細節：
- `/settings/currency` 主體幣別被鎖住時顯示 hint card（v0.17.1 #324）：用陪伴語解釋「為什麼鎖住」+ 指向「開新章節重設」的替代路徑
- 主體幣別選擇器走 unified segmented selector（與 `--toggle-*` token 家族同套，v0.17.1 #323）

### Part 4：Onboarding 接入點

| 步驟 | 與本 spec 的接入 |
|---|---|
| Sign-in 頁 | 頁尾 LanguageSwitcher (footer variant)——first-touch brand 表態 |
| 建立群組 | `OikosGroups.base_currency` 自動填 `'twd'`、無需使用者選擇 |
| 邀請對方 | 不涉及 locale / currency |
| Dashboard | LanguageSwitcher 不再出現主流程，移至 Settings；base_currency 若需改去 `/settings/currency` |

詳見 [onboarding-design](onboarding-design.md) 的三步流程。

---

## 加新頁面 / 元件的接入流程（Locale）

1. 在 `lib/i18n/locales/zh-TW.ts` 的 `Translations` type 新增 namespace 或 key（type 改 → 其餘語系編譯失敗會逼你補）
2. 補 zh-CN / en / ja 三份 dict
3. Server component：`const t = await getTranslations()`
4. Client component：`'use client'` + `const t = useTranslations()`（必須在 `<TranslationsProvider>` 子樹內）
5. **不要**在 client component 裡 import dict 檔（會把全部語系打包進 bundle）

---

## 規範 / 行為

### Locale 切換

- LanguageSwitcher (pill) 在 `/settings` 主頁：4 個 segment 即點即切
- LanguageSwitcher (footer) 在 `/sign-in`：低調 inline 文字
- 切換不重整 URL、shareable link 不含 locale
- 切換立即生效（無 reload，靠 `router.refresh()`）

### Base currency 設定

- `/settings/currency` 頂部：主體幣別 4 選 1 segmented selector
- 當前 epoch 無 record → enabled
- 當前 epoch 有 record → disabled + hint card「已有紀錄、不可修改」+「開新章節重設」連結
- 變更立即生效，所有後續寫入用新 base
- **不會** retroactive 重算歷史 record（與 [trip-multi-currency](trip-multi-currency-design.md) 的 snapshot 立場一致）

### 顯示分工

- **語言** 影響：所有文字 string、`Intl.DateTimeFormat` 日期格式
- **幣別** 影響：金額符號、千分位、小數位數（USD 2 位、其他 0 位）
- **不交叉**：locale 不改幣別符號（en + TWD = `NT$1,234`，不是 `$1,234`）

---

## 資料模型

| Entity | 既有 / 新增 | 變更 |
|---|---|---|
| `OikosGroups.base_currency` | v0.17.0 既有 | enum，預設 `'twd'`；當前 epoch 無 record 時可改 |
| Cookie `lang` | 既有 | 1 年 max-age、SameSite=Lax；proxy 寫入 |

詳細欄位以 [lib/db/schema.ts](../../../lib/db/schema.ts) 為準。

---

## 風險與 follow-up

| 風險 | 緩解 |
|---|---|
| Base currency 鎖死後使用者反悔 | 文案明確；onboarding 引導預設 `twd`；極端情況走 admin SQL |
| 新用戶以為 locale 切英文就會自動切美元 | 透過設計（並排但獨立）+ 文案明示兩者獨立 |
| 翻譯漏字 | 編譯期 TypeScript 報錯（不靠 runtime fallback） |
| 4 語字典 4 份檔案手動同步 | TypeScript type 強制 + 漏字 = compile error；接受手動成本（規模可控時不引 framework） |

---

## Acceptance criteria

### Locale

- 任何頁面切 4 語都看到對應翻譯，無中文殘漏
- 漏一個 key 在編譯期 TypeScript 報錯（不靠 runtime 偵錯）
- 切換語系不重整 URL、shareable link 不含 locale
- 日期格式跟 locale 切換（`Intl.DateTimeFormat`）

### Base currency

- 新建 group → `base_currency = 'twd'`
- `/settings/currency` 可改 base_currency 當且僅當當前 epoch 無 record
- 改 base_currency 後：所有後續寫入用新 base、所有顯示用新 currency formatting
- 改 base_currency **不** retroactive 改歷史 record

### 獨立性

- 切換 locale 不改 base_currency
- 切換 base_currency 不改 locale
- Settings「語言 & 幣別」section 視覺上並排但操作獨立

---

## 永久 out

- **RTL（阿拉伯文 / 希伯來文）**：目前 TA 不需要
- **翻譯後端 / admin UI**：字典編譯時鎖定
- **動態 lazy load locale**：4 語體積夠小，不值
- **Per-user base currency**：與「兩人共同一本帳」立場衝突
- **Locale-bound currency**：與雙人跨境混搭 TA 不合適

---

## Open / deferred questions

1. **5+ 語**（韓、東南亞語系）：等實際 TA 訊號出現再評估
2. **第 5 幣別**：等實際跨境需求出現再評估 enum 擴充
3. **多 base_currency view toggle**（例如同一帳本同時看 TWD 視角 + USD 視角）：與「主帳本永遠單幣別」立場衝突，目前無計畫
