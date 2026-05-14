---
status: shipped
first_shipped_in: v0.11.1
updates:
  - v0.12.0: 愛物詳情頁 + AssetSheet 完整翻譯（#20 PR #69）、Settings 子頁 coming-soon + invite + trust（#21 PR #64）、`recurringIncome` / `recurringExpense` namespaces（PR #77）
related_specs: [product]
related_issues: ["#20", "#21"]
---

# i18n 架構

> 多語架構：**zh-TW / zh-CN / en / ja 四語**；server-driven locale；dictionary-based（無翻譯後端、無動態載入）。

## 背景與動機

Phase 1 全 codebase hardcode 中文。friend test 階段有海外朋友、跨地區家庭、學日文 / 中英混用情境提出需求。兩件事讓它從「等規模再做」提前：

1. **登入頁尾的 LanguageSwitcher** 是「先讓使用者覺得這個 app 願意說他的語言」的入口，比純 prod feature 更像 brand 表態
2. **i18n 拖太久 = 每寫一行新 UI 都欠一筆翻譯債**；早做整合成本最低

不採用 next-intl / i18next：codebase 規模還小、字典體積也小，自製一層 70 行的 `lib/i18n/` 比帶整套 framework 更輕。日後字典或 plural / interpolation 需求複雜化再評估換軌。

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| Locale 識別 | **`lang` cookie**（1 年 max-age、SameSite=Lax）+ optional `?lang=` 入口 | URL prefix（`/zh-TW/dashboard`）成本高（路由全改）+ 視覺破壞；cookie 一次設好不影響 URL，shareable link 無須帶 locale |
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

### 不採用

- ❌ **next-intl / i18next**：framework 自帶的 plural / loader / namespace splitting 對目前體積過重；自製 70 行夠用
- ❌ **URL prefix locale（`/[locale]/...`）**：影響全 routing、所有 link、middleware 重做；cookie 路徑成本最低
- ❌ **Middleware 直接讀字典 + render 階段 inject**：middleware 跨 RSC / Server Action / Edge 多 runtime 邊界，字典體積會被多次序列化
- ❌ **每次 client 切語系打 server action**：純 cookie 寫 + router.refresh 已足夠；多一次 round-trip 沒必要
- ❌ **動態 import 字典**（依語系 lazy load）：4 語總體積仍小，code split 收益不抵複雜度
- ❌ **字典放 DB / Supabase**：語系不該需要 admin 流程；TS 編譯時鎖定即可
- ❌ **RTL 支援**：目前 4 語都是 LTR；需要時再加
- ❌ **Locale-aware number / currency formatting**：金額永遠新台幣整數，Intl 不會改變顯示；非 currency 數字先不處理

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

切換流程：

```
LanguageSwitcher click → document.cookie = `lang=xx; ...` → router.refresh()
  → RSC 重 render → getTranslations() 讀新 cookie → 整頁字串換掉
```

實作落地點：`lib/i18n/`（locales-meta、t.ts、client.tsx、LanguageSwitcher、locales/{zh-TW,zh-CN,en,ja}.ts）；Provider 接入點 `app/(dashboard)/layout.tsx` + `app/sign-in/page.tsx`。

---

## 加新頁面 / 元件的接入流程

1. 在 `lib/i18n/locales/zh-TW.ts` 的 `Translations` type 新增 namespace 或 key（type 改 → 其餘語系編譯失敗會逼你補）
2. 補 zh-CN / en / ja 三份 dict
3. Server component：`const t = await getTranslations()`
4. Client component：`'use client'` + `const t = useTranslations()`（必須在 `<TranslationsProvider>` 子樹內）
5. **不要**在 client component 裡 import dict 檔（會把全部語系打包進 bundle）

---

## Acceptance criteria

- 任何頁面切 4 語都看到對應翻譯，無中文殘漏
- 漏一個 key 在編譯期 TypeScript 報錯（不靠 runtime 偵錯）
- 切換語系不重整 URL、shareable link 不含 locale
- 日期格式跟 locale 切換（`Intl.DateTimeFormat`）

---

## 永久 out

- **RTL（阿拉伯文 / 希伯來文）**：目前 TA 不需要
- **多幣別 / locale-aware currency**：金額永遠新台幣，與 locale 解耦
- **翻譯後端 / admin UI**：字典編譯時鎖定
- **動態 lazy load locale**：4 語體積夠小，不值
