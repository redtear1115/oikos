---
status: shipped
first_shipped_in: v0.11.1
updates:
  - v0.12.0: 愛物詳情頁 + AssetSheet 完整翻譯（#20 PR #69）、Settings 子頁 coming-soon + invite + trust（#21 PR #64）、`recurringIncome` / `recurringExpense` namespaces（PR #77）
  - v0.17.0: 加入 `OikosGroups.base_currency`（4 幣別 enum）+ Settings 主體貨幣 section；主帳本 / Settlement / Income UI 不暴露幣別 picker（PR #357）
related_specs: [product, onboarding, trip-multi-currency]
related_issues: ["#20", "#21", "#68"]
---

# 多語 × 初始幣別選擇

> **核心哲學：保持簡單**
>
> Locale（4 語）與 base currency（4 幣別）都是「onboarding 選一次、之後不再打擾日常」的決策。
> 兩個軸獨立、不互相污染；日常使用永遠不會看到 picker。

---

## 為什麼把兩件事放一起講

語言（i18n）與初始幣別（base currency）在表面是兩個 feature，但**設計哲學完全一樣**：

| 共通點 | 解釋 |
|---|---|
| 是「使用者一次性表態」 | 中文用戶選 zh-TW、用日圓的家庭選 JPY — 都是身份 / 場景的宣告 |
| 設好後極少改變 | 1 年內可能 0 次調整 |
| 日常每筆記帳不該再問 | 記午餐時不該被迫選語言、也不該被迫選幣別 |
| 兩軸彼此獨立 | 中文用戶可以記日圓、日文用戶可以記台幣 — locale ⊥ currency |

把兩件事放在同一份 spec，是為了讓「保持簡單」這個立場有單一論述地點，避免將來修改時各自漂移。

---

## 與「邊界複雜」的關係

「保持簡單」與「邊界複雜」是 Futari 設計立場的兩面：

- 主帳本（日常）— **保持簡單**（本 spec）：永遠單一 locale、永遠單一幣別、UI 不暴露 picker
- 旅行（邊界）— **邊界複雜**（[trip-multi-currency](trip-multi-currency-design.md)）：在這個有時間邊界的 context 才允許多幣別 / 心理匯率

→ 兩條哲學的並列敘述見 [product § 4 設計立場](product-design.md#4-設計立場)。

---

## Part 1：多語架構（i18n）

### 背景與動機

Phase 1 全 codebase hardcode 中文。friend test 階段有海外朋友、跨地區家庭、學日文 / 中英混用情境提出需求。兩件事讓它從「等規模再做」提前：

1. **登入頁尾的 LanguageSwitcher** 是「先讓使用者覺得這個 app 願意說他的語言」的入口，比純 prod feature 更像 brand 表態
2. **i18n 拖太久 = 每寫一行新 UI 都欠一筆翻譯債**；早做整合成本最低

不採用 next-intl / i18next：codebase 規模還小、字典體積也小，自製一層 70 行的 `lib/i18n/` 比帶整套 framework 更輕。日後字典或 plural / interpolation 需求複雜化再評估換軌。

### Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 支援語系 | **zh-TW / zh-CN / en / ja**（4 語） | 主 TA（台 / 中 / 海外華人 / 日本）；Futari/ふたり 命名即對日本市場的邀請 |
| Locale 識別 | **`lang` cookie**（1 年 max-age、SameSite=Lax）+ optional `?lang=` 入口 | URL prefix（`/zh-TW/...`）成本高（路由全改）+ 視覺破壞；cookie 一次設好不影響 URL，shareable link 無須帶 locale |
| 切換 UX | **`document.cookie =` + `router.refresh()`** | 不過 server action（純 client），延遲最低；router.refresh 觸發 RSC 重新 render → server 讀新 cookie → 字典換掉 |
| 字典載體 | **TypeScript const object**，與 `Translations` type 對齊 | 編譯期檢查 missing key；無 runtime fetch；trade-off 是 4 個檔案要手動同步（接受） |
| 字典結構 | **巢狀 namespace**（`signIn` / `common` / `dashboard` / `records` / `settings` / `assets` 等） | 同 namespace 同一頁，避免 flat key 命名衝突；type 直接 mirror |
| 預設語系 | **`zh-TW`** | 主要 TA；fallback 維持原 Phase 1 體驗 |
| Server 取得 | **`getTranslations()`**（`'server-only'`，讀 `cookies()`） | RSC 直接 await；middleware 不參與 dictionary lookup |
| Client 取得 | **`<TranslationsProvider value={t}>` + `useTranslations()`** | 由 dashboard layout / sign-in page 一次性 fetch + 注入；client 純讀 context、不重新 fetch |
| Provider 邊界 | **dashboard layout 包整個登入區；sign-in page 自帶**（兩處 fetch、不共用） | sign-in 是 public 頁、layout 不適合 wrap；兩邊各自 await 簡單可預期 |
| LanguageSwitcher 變體 | **`pill`**（Settings、卡片式 segmented）/ **`footer`**（sign-in、低調 inline 文字） | 兩個情境視覺權重不同；單一元件 `variant` prop 切換 |
| 翻譯漏洞處理 | **不做 fallback**（type 強制每語系每 key 都填） | 漏字 = 編譯失敗，比 runtime fallback 更早暴露 |
| Plural / interpolation | **目前不需要** | 字典實際看下來都是固定字串；遇到動態量詞採 `${count} 筆紀錄` 直接拼，不引 ICU MessageFormat |
| 日期格式化 | **`Intl.DateTimeFormat(locale)`** | 字典只處理字串；日期格式留給平台 Intl，跟著 locale 自動切 |

### 不採用（i18n）

- ❌ **next-intl / i18next**：framework 自帶的 plural / loader / namespace splitting 對目前體積過重；自製 70 行夠用
- ❌ **URL prefix locale（`/[locale]/...`）**：影響全 routing、所有 link、middleware 重做；cookie 路徑成本最低
- ❌ **Middleware 直接讀字典 + render 階段 inject**：middleware 跨 RSC / Server Action / Edge 多 runtime 邊界，字典體積會被多次序列化
- ❌ **每次 client 切語系打 server action**：純 cookie 寫 + router.refresh 已足夠；多一次 round-trip 沒必要
- ❌ **動態 import 字典**（依語系 lazy load）：4 語總體積仍小，code split 收益不抵複雜度
- ❌ **字典放 DB / Supabase**：語系不該需要 admin 流程；TS 編譯時鎖定即可
- ❌ **RTL 支援**：目前 4 語都是 LTR；需要時再加

---

## Part 2：初始幣別選擇（base currency）

### 背景與動機

i18n 已支援 ja，但金額過去硬寫成 TWD 整數 — 對「Futari／ふたり」這個命名要對日本市場成立是硬卡點。雙人家庭跨境情境也真實存在：外派、留學、跨國伴侶、海外薪資。

但「多幣別」不等於「每筆都要選幣別」。Futari 走自訂心理匯率路線而非接 API，**主帳本永遠單一幣別、UI 不暴露 picker**，這是與 Spendee / MOZE「中階差異化」不同的立場。

### Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| 支援幣別 | **TWD / CNY / USD / JPY**（enum 4 選 1） | MVP scope 對應主 TA 市場；之後擴充走 enum migration |
| 主體幣別 | per-group **`OikosGroups.base_currency`**，預設 `'twd'` | balance / settlement / report / 主帳本顯示全圍繞此幣別 |
| 修改規則 | **當前 epoch 無 record 時可改、有 record 則鎖** | 避免歷史紀錄的 base currency 語意漂移；新建 group 或剛開新 epoch 的群組能補設定 |
| 主帳本記帳 UI | **不暴露幣別 picker** | 守住「記錄要素低認知負擔」；多幣別輸入只在旅行 context 出現（見 [trip-multi-currency](trip-multi-currency-design.md)） |
| Settlement 多幣別 | **強制 base 幣別、UI 無 picker** | 跨幣別結算對帳語意複雜、低頻；保持簡單 |
| Income 多幣別 | **schema 加欄位、UI 不接** | 避免未來再 migration；symmetry 保留可能性；但 UI 仍守單幣別 |
| `lib/balance.ts` | **幣別無感**：`GroupBalance.balance` 永遠 base 幣別整數 | 主帳本一切都是 base 幣別 integer，balance 層完全不需感知幣別 |

### locale ⊥ currency

兩個軸**互相獨立**，可任意組合：

| Locale | Base currency | 場景 |
|---|---|---|
| zh-TW | TWD | 預設 |
| zh-TW | JPY | 在日本生活的台灣家庭 |
| ja | TWD | 在台灣生活的日本家庭 |
| en | USD | 海外留學夫妻 |
| zh-CN | CNY | 中國雙人 |

設計上不假設任何相關性（例如「選 ja → 自動設 JPY」這種猜測），讓使用者明確表態。

### 不採用（base currency）

- ❌ **主帳本 AddSheet / 主記帳表單暴露幣別 picker** — 違反「保持簡單」核心立場；多幣別只在旅行 context 出現
- ❌ **Settlement 跨幣別** — 跨幣別結算對帳語意複雜、低頻
- ❌ **Income 主帳本多幣別 UI** — schema 欄位已加但 UI 不接；保持與 Cash / Settlement 一致
- ❌ **Locale 自動 inference base currency**（選 ja → 自動 JPY） — 兩軸獨立、使用者明確表態
- ❌ **Base currency 修改 retroactive 換算歷史 record** — 與 snapshot 立場衝突，且 base 鎖定後不可改的限制本就避免此問題
- ❌ **自訂第 5 幣別 / 加密貨幣** — enum 鎖 4 種；自訂幣別開門後排序 / 匯率矩陣會炸開
- ❌ **登入頁強制選 base currency** — 不在 onboarding 強推；新建 group 預設 TWD、有需要的人去 Settings 改

---

## 資料流

```
Request 進來
  ↓ middleware：?lang=xx 若存在 → 寫 cookie
  ↓ Server entry：await getTranslations() ← 讀 cookie → 取對應 dict
  ↓ 渲染 RSC：t.signIn.tagline / t.dashboard.balance 等
  ↓ 傳到 dashboard layout：<TranslationsProvider value={t}>
  ↓ Client component：const t = useTranslations() → 讀 context
```

切換 locale：

```
LanguageSwitcher click → document.cookie = `lang=xx; ...` → router.refresh()
  → RSC 重 render → getTranslations() 讀新 cookie → 整頁字串換掉
```

修改 base currency（限當前 epoch 無 record 時）：

```
Settings → 主體貨幣 → 選新幣別 → actions/group.ts#setBaseCurrency
  → server 檢查當前 epoch 無 record → UPDATE OikosGroups.base_currency
  → router.refresh() → 整頁金額顯示換 currency 符號
```

實作落地點：
- i18n：`lib/i18n/`（locales-meta、t.ts、client.tsx、LanguageSwitcher、locales/{zh-TW,zh-CN,en,ja}.ts）；Provider 接入點 `app/(dashboard)/layout.tsx` + `app/sign-in/page.tsx`
- 幣別：`actions/group.ts#setBaseCurrency`、Settings → 主體貨幣 section、`lib/currency.ts#formatAmount`（顯示）

---

## 加新頁面 / 元件的接入流程

### i18n

1. 在 `lib/i18n/locales/zh-TW.ts` 的 `Translations` type 新增 namespace 或 key（type 改 → 其餘語系編譯失敗會逼你補）
2. 補 zh-CN / en / ja 三份 dict
3. Server component：`const t = await getTranslations()`
4. Client component：`'use client'` + `const t = useTranslations()`（必須在 `<TranslationsProvider>` 子樹內）
5. **不要**在 client component 裡 import dict 檔（會把全部語系打包進 bundle）

### 幣別顯示

所有顯示 amount 的地方走 `lib/currency.ts#formatAmount(amount, currency)`：
- `currency` 由 caller 提供（通常是 `group.base_currency`）
- TypeScript 強制傳 currency 參數，漏帶 → compile error
- USD 精度 2、其他 0（cent ↔ 整數由 helper 處理）

---

## Acceptance criteria

### i18n
- 任何頁面切 4 語都看到對應翻譯，無中文殘漏
- 漏一個 key 在編譯期 TypeScript 報錯（不靠 runtime 偵錯）
- 切換語系不重整 URL、shareable link 不含 locale
- 日期格式跟 locale 切換（`Intl.DateTimeFormat`）

### Base currency
- 新建 group 預設 `base_currency = 'twd'`
- Settings 可改 base currency；當前 epoch 無 record 時 enabled、有 record 則 server reject + UI disabled + 文案
- 主帳本所有金額顯示走 `formatAmount` + group.base_currency
- 主帳本 / Settlement / Income 表單都**沒有** currency picker（多幣別 picker 只在 TripExpenseSheet 出現，見 [trip-multi-currency](trip-multi-currency-design.md)）
- `tsc --noEmit` pass — `formatAmount` 強制傳 currency 參數

### 整合
- locale 與 base currency 可任意組合，無 inference / 自動聯動
- 改 locale 不動 base currency；改 base currency 不動 locale

---

## 永久 out

- **RTL（阿拉伯文 / 希伯來文）**：目前 TA 不需要
- **翻譯後端 / admin UI**：字典編譯時鎖定
- **動態 lazy load locale**：4 語體積夠小，不值
- **主帳本多幣別 picker**：核心立場，違反「保持簡單」
- **Locale-aware currency 自動 inference**：兩軸獨立

---

## Out of scope（屬於其他 spec）

- 旅行子帳本內的多幣別 / 心理匯率 snapshot / trip 結束 fold → 見 [trip-multi-currency](trip-multi-currency-design.md)
- Onboarding flow 內 base currency 的引導文案 → 見 [onboarding](onboarding-design.md)
- 加密貨幣、即時匯率 API → 已在「不採用」列出
