# i18n 架構設計 spec

> 目標：lock 多語架構決策，讓「加新語系」「翻新頁」「翻新元件」三件事有清楚的接入點。
> 範圍：**zh-TW / zh-CN / en / ja 四語**；server-driven locale；dictionary-based（無翻譯後端、無動態載入）。
> 狀態：基礎已 ship（PR #3 / #4 / #6 / #7 → v0.11.1）；日期 helper 已改用 `Intl.DateTimeFormat(locale)`（v0.11.1）。愛物詳情頁、設定子頁翻譯仍待補（見 [CLAUDE.md](../../../CLAUDE.md) Backlog）。

---

## 背景與動機

Phase 1 全 codebase hardcode 中文。friend test 階段有海外朋友、跨地區家庭、學日文 / 中英混用情境提出需求。原本想等規模再做、但兩件事讓它提前：

1. **登入頁尾的 LanguageSwitcher** 是「先讓使用者覺得這個 app 願意說他的語言」的入口，比純 prod feature 更像 brand 表態
2. **i18n 拖太久 = 每寫一行新 UI 都欠一筆翻譯債**；早做整合成本最低

不採用 next-intl / i18next：codebase 規模還小、字典體積也小，自製一層 70 行的 `lib/i18n/` 比帶整套 framework 更輕。日後字典或 plural / interpolation 需求複雜化再評估換軌。

---

## Locked decisions

| 維度 | 決定 | 理由 |
|---|---|---|
| Locale 識別 | **`lang` cookie**（1 年 max-age、SameSite=Lax）+ optional `?lang=` 入口 | URL prefix（`/zh-TW/dashboard`）成本高（路由全改）+ 視覺破壞；cookie 一次設好不影響 URL，shareable link 無須帶 locale |
| 切換 UX | **`document.cookie =` + `router.refresh()`** | 不過 server action（純 client），延遲最低；router.refresh 觸發 RSC 重新 render → server 讀新 cookie → 字典換掉 |
| 字典載體 | **TypeScript const object**（`lib/i18n/locales/{zh-TW,zh-CN,en,ja}.ts`），與 `Translations` type 對齊 | 編譯期檢查 missing key；無 runtime fetch；trade-off 是 4 個檔案要手動同步（接受） |
| 字典結構 | **巢狀 namespace**（`signIn` / `common` / `dashboard` / `records` / `settings` / `assets` 等） | 同 namespace 同一頁，避免 flat key 命名衝突；type 直接 mirror |
| 預設語系 | **`zh-TW`** | 主要 TA；fallback 維持原 Phase 1 體驗 |
| Server 取得 | **`lib/i18n/t.ts` 的 `getTranslations()`**（`'server-only'`，讀 `cookies()`） | RSC 直接 await；middleware 不參與 dictionary lookup（middleware 只負責把 `?lang=` 寫進 cookie） |
| Client 取得 | **`<TranslationsProvider value={t}>` + `useTranslations()`** | 由 dashboard layout / sign-in page 一次性 fetch + 注入；client component 純讀 context、不重新 fetch |
| Provider 邊界 | **`app/(dashboard)/layout.tsx` 包整個登入區；`app/sign-in/page.tsx` 自帶**（兩處 fetch、不共用） | sign-in 是 public 頁、layout 不適合 wrap；兩邊各自 await `getTranslations()` 簡單可預期 |
| LanguageSwitcher 變體 | **`pill`**（Settings、卡片式 segmented）/ **`footer`**（sign-in、低調 inline 文字） | 兩個情境視覺權重不同；單一元件 `variant` prop 切換 |
| 翻譯漏洞處理 | **不做 fallback**（type 強制每語系每 key 都填） | 漏字 = 編譯失敗，比 runtime fallback 更早暴露 |
| Plural / interpolation | **目前不需要** | 字典實際看下來都是固定字串；遇到動態量詞（"3 筆紀錄"）採 `${count} 筆紀錄` 直接拼，不引 ICU MessageFormat |
| 日期格式化 | **`Intl.DateTimeFormat(locale)`**（[lib/local-date.ts](../../../lib/local-date.ts) `dateLabel` / `weekday`、[lib/groupByMonth.ts](../../../lib/groupByMonth.ts) `monthLabel`）— v0.11.1 ship | 字典只處理字串；日期格式留給平台 Intl，跟著 locale 自動切 |

### 不採用

- ❌ **next-intl / i18next**：framework 自帶的 plural / loader / namespace splitting 對目前體積過重；自製 70 行夠用
- ❌ **URL prefix locale（`/[locale]/...`）**：影響全 routing、所有 link、middleware 重做；cookie 路徑成本最低
- ❌ **Middleware 直接讀字典 + render 階段 inject**：middleware 跨 RSC / Server Action / Edge 多 runtime 邊界，字典體積會被多次序列化；改由各 server entry 自己 await
- ❌ **每次 client 切語系打 server action**：純 cookie 寫 + router.refresh 已足夠；多一次 round-trip 沒必要
- ❌ **動態 import 字典**（依語系 lazy load）：4 語總體積仍小，code split 收益不抵複雜度
- ❌ **字典放 DB / Supabase**：語系不該需要 admin 流程；TS 編譯時鎖定即可
- ❌ **RTL 支援**：目前 4 語都是 LTR；需要時再加
- ❌ **Locale-aware number / currency formatting**：金額永遠新台幣整數，Intl 不會改變顯示；非 currency 數字先不處理

---

## 架構

### 元件清單

| 元件 | 路徑 | 角色 |
|---|---|---|
| Locale 常數 + helper（edge-safe） | [lib/i18n/locales-meta.ts](../../../lib/i18n/locales-meta.ts) | `SUPPORTED_LOCALES` / `Locale` / `DEFAULT_LOCALE` / `LOCALE_COOKIE` / `isLocale()` — no next/headers |
| Server i18n entry | [lib/i18n/t.ts](../../../lib/i18n/t.ts) | re-exports all of locales-meta + `getLocale()` / `getTranslations()` |
| Translations type 來源 | [lib/i18n/locales/zh-TW.ts](../../../lib/i18n/locales/zh-TW.ts) | `export type Translations` 從 zh-TW 推導，其他語系 `: Translations` 強制對齊 |
| 其他 dictionaries | [lib/i18n/locales/zh-CN.ts](../../../lib/i18n/locales/zh-CN.ts) · [en.ts](../../../lib/i18n/locales/en.ts) · [ja.ts](../../../lib/i18n/locales/ja.ts) | 對應語系字典 |
| Client provider | [lib/i18n/client.tsx](../../../lib/i18n/client.tsx) | `<TranslationsProvider>` + `useTranslations()` hook |
| LanguageSwitcher | [lib/i18n/LanguageSwitcher.tsx](../../../lib/i18n/LanguageSwitcher.tsx) | 兩變體 `pill` / `footer`；client-side cookie write + router.refresh |
| Middleware（PoC 入口） | [middleware.ts](../../../middleware.ts) | 把 `?lang=xx` query 寫進 cookie；非主要切換路徑 |

### 資料流

```
Request 進來
  ↓
middleware：?lang=xx 若存在 → 寫 cookie（給 SSR 用）
  ↓
Server entry（page.tsx / layout.tsx）
  await getTranslations()  ← 讀 cookie → 從 dictionaries map 取對應 dict
  ↓
渲染 RSC：直接 t.signIn.tagline / t.dashboard.balance 等
  ↓
傳到 dashboard layout：<TranslationsProvider value={t}>
  ↓
Client component：const t = useTranslations() → 讀 context
```

### 切換流程

```
LanguageSwitcher button click
  ↓
document.cookie = `lang=xx; path=/; max-age=...; SameSite=Lax`
  ↓
router.refresh()
  ↓
RSC 重新 render → getTranslations() 讀新 cookie → 整頁字串換掉
（中間 Settings 頁 toggle、Add Sheet 開啟態都會被 refresh，目前接受）
```

### 加新頁面 / 元件 checklist

1. 在 [zh-TW.ts](../../../lib/i18n/locales/zh-TW.ts) 的 `Translations` type 新增 namespace 或 key（type 改 → 其餘語系編譯失敗會逼你補）
2. 補 zh-CN / en / ja 三份 dict
3. Server component：`const t = await getTranslations()`，傳 `t` 到 props 或直接用
4. Client component：`'use client'` + `const t = useTranslations()`（必須在 `<TranslationsProvider>` 子樹內）
5. **不要**在 client component 裡 import dict 檔（會把全部語系打包進 bundle）

---

## Out of scope（不做 / 待補）

### 待補（CLAUDE.md backlog）

- **Assets 詳情頁 + AssetSheet 翻譯**：保險 / 車輛 / 兒童等 ~40 fields，翻譯量大需人工審稿後才能上線
- **Settings 子頁翻譯**：`recurring-income` / `invite` / `coming-soon` 等子頁仍 zh-TW only

### 永久 out

- **RTL（阿拉伯文 / 希伯來文）**：目前 TA 不需要
- **多幣別 / locale-aware currency**：金額永遠新台幣，與 locale 解耦
- **翻譯後端 / admin UI**：字典編譯時鎖定
- **動態 lazy load locale**：4 語體積夠小，不值

---

## 索引

- [CLAUDE.md](../../../CLAUDE.md) — Backlog（i18n date helpers / assets / settings 子頁）
- [lib/i18n/](../../../lib/i18n/) — 所有 i18n code
- [app/(dashboard)/layout.tsx](../../../app/%28dashboard%29/layout.tsx) — Provider 接入點
- [app/sign-in/page.tsx](../../../app/sign-in/page.tsx) — sign-in 自帶 fetch 範例
- [middleware.ts](../../../middleware.ts) — `?lang=` query 入口（PoC，非主要路徑）
