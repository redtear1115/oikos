# Changelog

All notable changes to Oikos (Futari) are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

每版分兩小節：
- **使用者可見變化** — 使用者實際感知到的功能 / 修正，一句話、不寫技術細節
- **技術變更** — 技術決定、重構、schema migration、breaking change（沒有的話省略）

---

## [Unreleased]

_Nothing unreleased yet._

## [1.1.6] - 2026-05-21

主題：**Android PWA 體驗修正**——集中修正 Android edge-to-edge PWA 的多項體驗問題：safe-area inset 失效（#714）、系統返回鍵直接離開 App 而非收起開啟中的 Sheet（#716 / #683），以及 overscroll 回彈、tap highlight 灰閃、軟鍵盤遮擋輸入框、ja / zh-CN CJK 字型 fallback 缺字等一輪細節（#715 / #713）。
完整 diff：[v1.1.5...v1.1.6](https://github.com/redtear1115/oikos/compare/v1.1.5...v1.1.6)

### 使用者可見變化

- **Android 返回鍵先收起 Sheet（#716）**：在 Android 上開啟記帳 / 篩選等 Sheet 時，按系統返回鍵會先收起最上層的 Sheet，而不是直接離開 App；多層 Sheet 一次收一層，與點背景 / 按 X / Esc 的關閉行為一致。
- **Android 安全區與鍵盤貼合（#714 / #715）**：底部導覽列 / 浮動按鈕 / Sheet 正確避開 Android 螢幕邊緣的 safe-area；叫出軟鍵盤時版面跟著縮，輸入框不再被鍵盤蓋住。
- **Android 滑動與點按細節（#715）**：關掉頁面邊緣的下拉重整與回彈，點按控制項時不再出現灰色閃光；ja / zh-CN 介面在缺字時改用系統 CJK 字型，不再出現方塊（tofu）。

### 技術變更

- **系統返回鍵 / popstate 收起 Sheet（#716, #683）**：`useEscapeToClose` 在 Sheet 開啟時 push 一筆 same-URL synthetic history entry，Back 觸發 `popstate` 時收起 stack 最上層而非導航離開；以 module-level stack + self-pop 計數處理巢狀 Sheet 與「非 Back 關閉」時的 history 回收，避免多吃一次 Back。補上 vitest 覆蓋 push / 巢狀解疊 / self-pop 等情境。
- **viewport-fit + interactiveWidget（#714 / #713）**：`app/layout.tsx` viewport 加 `viewportFit: 'cover'` 讓 `env(safe-area-inset-*)` 在 Android edge-to-edge 解析到實際值（否則塌成 0、靜默關掉 safe-area offset）；加 `interactiveWidget: 'resizes-content'` 讓軟鍵盤開啟時縮 layout viewport，`dvh` Sheet 跟著鍵盤走。
- **overscroll / tap-highlight / CJK fallback（#715, #713）**：`html, body` 加 `overscroll-behavior: none` 擋下拉重整與回彈、`SheetBody` 加 `[overscroll-behavior:contain]` 擋 scroll chaining；全域 `-webkit-tap-highlight-color: transparent`；`--font-sans` fallback chain 補 JP / SC 系統字型，ja / zh-CN 缺字時改用原生 CJK face 而非 tofu。

## [1.1.5] - 2026-05-21

主題：**分頁載入改用 skeleton 骨架畫面**——承接 v1.1.4 (#690) 的載入過場工作，把四個主分頁原本共用的全螢幕 dim/blur 遮罩換成各自對應版面的 skeleton 骨架載入畫面（#710），讓載入過程更貼近實際內容、不再有黑屏閃爍。
完整 diff：[v1.1.4...v1.1.5](https://github.com/redtear1115/oikos/compare/v1.1.4...v1.1.5)

### 使用者可見變化

- **分頁載入骨架畫面（#710）**：切換儀表板 / 紀錄 / 愛物 / 設定四個主分頁時，載入期間改顯示對應分頁版面的 skeleton 骨架（儀表板：BrandHeader → BalanceHero → 篩選列 → feed；紀錄：月份切換 → 統計列 → 紀錄列；愛物：標題 → 愛物卡片；設定：頭像名稱 → 設定列），取代先前的全螢幕 dim/blur 遮罩，過場更貼近實際內容、不再黑屏閃爍。

### 技術變更

- **四分頁 loading.tsx 改 per-page skeleton（#710）**：dashboard / records / assets / settings 的 `loading.tsx` 從共用的全螢幕 overlay 改成各自的 skeleton，皆為純 Server Component（無 `'use client'`），用 Tailwind + CSS variable token（`--bg` / `--surface` / `--hairline`）+ `animate-pulse`，對齊既有 `DashboardFeedSkeleton` pattern；移除 v1.1.4 #690 的 overlay（PR #708 一併關閉）。

## [1.1.4] - 2026-05-21

主題：**設計系統收尾 + 前端品質續推 + 兩處 UX 微調**——承接 v1.1.2~v1.1.3 的 design system 工作，把 asset-sheet 最後 8 個殘留 raw `<input>` 收進 TextInput primitive（#695），完成 primitive 遷移；同時把 MonthlyStatsBars 的 chart 專用色抽成 `lib/chartPalette.ts` 單一 source of truth（#693）、arbitrary decimal font size 對齊 text scale token（#694）、~735 行的 Dashboard.tsx 拆成多個 sub-component（#696）。UX 面把 BottomNav 內容列高度從 56px 提到 64px 改善觸控目標（#689），並在四個主分頁切換時加上 dim+blur 載入遮罩讓過場更明確（#690）。
完整 diff：[v1.1.3...v1.1.4](https://github.com/redtear1115/oikos/compare/v1.1.3...v1.1.4)

### 使用者可見變化

- **底部導覽列更好按（#689）**：BottomNav 內容列高度從 56px 提到 64px，每顆分頁按鈕 min-height 64px，更貼合觸控目標標準；底部 safe-area home-indicator 區維持不變。
- **分頁切換載入遮罩（#690）**：切換儀表板 / 紀錄 / 愛物 / 設定四個主分頁時，新分頁載入期間蓋一層淡淡的 dim + blur 遮罩，過場更明確（紀錄頁原本的 skeleton 改用同一套遮罩）。

### 技術變更

- **Design system primitive 遷移收尾（#695）**：asset-sheet body（Child / Pet / Plant / Insurance）殘留的 8 個 raw `<input>`（6 個日期選擇 + 2 個 Child PII 欄位）改用 TextInput primitive，補上共用 focus ring / border / error state，對齊已遷移的 sibling 欄位（#670 §3.3）。
- **Chart 專用色票抽出（#693）**：MonthlyStatsBars 的 chart-only 色（per-asset hash palette / 未歸屬 fallback / active bar track）抽成 `lib/chartPalette.ts`，donut 與 detail bars 共用單一 source of truth；分類／收入分類 slice 色仍留在各自 domain 檔。
- **Text scale token 對齊（#694）**：arbitrary `text-[13.5px]` / `text-[14.5px]` snap 到 design system scale（13.5 → `text-meta` 14、14.5 → `text-body` 15）；sign-in 的 responsive base 維持 `text-meta` 讓 `lg:text-body` bump 保留。
- **Dashboard.tsx 拆檔（#696）**：~735 行的 Dashboard.tsx 把 L3 filter row、member dual-toggle helpers、transaction feed + skeleton 抽到 sibling 檔（`MemberDualToggle.tsx` / `DashboardFilterRow.tsx` / `DashboardFeed.tsx`）；純結構搬移，零 UI / props / 邏輯變更。
- **文件**：CLAUDE.md 色票章節補 `lib/chartPalette.ts` 參照（doc-keeper sweep）。

## [1.1.3] - 2026-05-20

主題：**品質打磨 — UX / 前端 / SEO 三輪 audit + design system 續推 + bug 修正**——承接 v1.1.2 的 design system primitives，把 TextInput / Button / FilterSheet 正式收進共用 primitive（#670），同時跑了三輪 audit：前端設計 audit #2（a11y / token / perf / RSC quick wins）、UX round 1（copy / ARIA / safe-area / error 頁）、SEO audit #2（JSON-LD 去重、HowTo schema、SERP 文案長度、footer 法務連結）。另修兩個使用者可見 bug：dashboard L3 篩選器文案語意不一致（#679）與旅行列表載入失敗（#685）。
完整 diff：[v1.1.2...v1.1.3](https://github.com/redtear1115/oikos/compare/v1.1.2...v1.1.3)

### 使用者可見變化

- **旅行列表不再「載入旅行失敗」（#685）**：`listAllTrips` / `listActiveTrips` / `listTripRecords` 三個 query 漏了 `await`，回傳 query builder 而非資料、讓旅行頁直接報錯；補上 await 後恢復正常。
- **Dashboard 篩選器文案語意修正（#679）**：付款人 toggle 文案對齊 records 篩選（「我 / 對方」）；負擔 toggle 改用「算我的 / 算對方的」，反映它篩的是「誰實際負擔」而非分攤類型，避免與「全付」語意混淆。多選全開＝不篩選的互動維持不變。
- **對方記帳即時提示 + 金額輸入游標修正（#671）**：對方新增一筆時跳 realtime toast；金額輸入框游標位置 bug 修掉。
- **SEO 收尾（#669）**：/migrate 頁補 HowTo JSON-LD；landing 與 /migrate footer 連到 /terms 與 /privacy；標題／描述長度修到 SERP 不截斷；sitemap lastmod / favicon / OG 形狀對齊。
- **介面細節打磨（UX audit round 1）**：copy 用詞、ARIA 標註、iOS safe-area、error 頁 digest 一輪修正。

### 技術變更

- **Design system adoption（#670）**：TextInput / Button / FilterSheet 收進 v1.1.2 建立的共用 primitive。
- **前端設計 audit #2（#670）**：a11y（toggle 補 `aria-pressed`、裝飾性 SVG 補 `aria-hidden`）、token（`on-fill` / z-layer / text scale 對齊）、perf（剩餘 sheet lazy-load）、quick wins（tokens / RSC / copy）。
- **JSON-LD schema 去重（#669）**：移除重複注入的結構化資料。
- **文件 audit（#667）**：research docs 更新、Domain Model 同步現況 schema、spec frontmatter 修正、v0.x 歷史精簡（doc-keeper sweep #668）。

## [1.1.2] - 2026-05-19

主題：**Design system primitives + 前端品質重構 + SEO 收尾**——issue #629 的 design system phase 0：token layer（control-height / sheet-spacing / focus-ring）+ Button / TextInput / Sheet 三組 primitive 一次到位，pilot 用 `InstallGuide` 驗 API，接著把 SettlementSheet / IncomeSheet / RecurringRuleSheet / AddSheet 4 個重點 sheet 收進來。issue #610 的前端品質重構同步推一輪（lazy-load sheets / SVG 改 server / CSS token 取代 hardcoded `#fff` / Dashboard state → useReducer / wizard 共用 hook 與 widget 抽取 / 統一 CSV parser 層 / 刪除 dead banner），把先前累積的 ad-hoc 樣式與 client boundary 清乾淨。SEO 收尾把 /migrate cross-link / 標題長度 / FAQ JSON-LD per-locale / GSC verification 補齊，承接 v1.1.0~v1.1.1 的 /migrate 站台。
完整 diff：[v1.1.1...v1.1.2](https://github.com/redtear1115/oikos/compare/v1.1.1...v1.1.2)

### 使用者可見變化

- **Sheet header / button / input 視覺一致化（#629, #649, #650, #651, #652, #653）**：先前 SettlementSheet / IncomeSheet / RecurringRuleSheet / AddSheet 各自的 padding、radius、按鈕 hover、focus ring 各做各的（11 種 button radius、3 種 input padding、`px-4`/`px-5`/`px-6` 與 `pb-6`/`pb-8`/`pb-12` 混用）；本版收進共用 Button + TextInput + Sheet primitive，視覺對齊；SheetHeader 也加上 leading slot 與 3-column centered variant 處理「左 icon + 中 title + 右 close」格式。
- **/migrate landing 多了「來自其他來源？」cross-link 區塊（#612）**：每條 /migrate 頁底新增 cross-link 卡片，把另外兩條 /migrate 頁列出來，方便 Honeydue / Spendee / CWMoney 三條 landing 之間互通。
- **Landing 補了 /migrate/* 內部連結（#613）**：landing 頁多了一段 trust copy 連到三條 /migrate 頁，給「正在找替代品但還不知道 Futari 是什麼」的訪客一條順路。
- **/migrate 頁標題不再被 SERP 截斷（#614）**：三條 /migrate 頁 title 長度縮到 ~50 chars 內，避開 Google SERP 60 char 截斷。
- **FAQ JSON-LD 每個 locale 各吐一份（#611）**：landing FAQPage JSON-LD 拆成 per-locale 注入（`inLanguage` 對應頁面 locale），讓 4 語 Google rich result 都抓得到，而不是只有 zh-TW 那份。

### 技術變更

- **Design system phase 0：token layer + primitives（#629）**：
  - Tokens (`app/globals.css`)：`--control-sm/md/lg`（36/44/52px）+ `--sheet-x/y-top/y-bottom`（20/16/24px）+ `--input-bg` + `--focus-ring-color` + `@utility oik-focus-ring` + `.oik-btn` / `.oik-input-wrapper`。
  - `components/ui/Button.tsx` — 4 variant（primary/secondary/ghost/danger）× 3 size（sm/md/lg）+ loading state（`aria-busy` 鎖 accessible name）。
  - `components/ui/TextInput.tsx` — 包 `leftAddon` / `rightAddon` slot + error state + 共用 focus ring。
  - `components/ui/Sheet/SheetHeader.tsx` / `SheetBody.tsx` / `SheetFooter.tsx` — header 標準（title row + 可選 centered 3-column variant）、body（scrollable）、footer（sticky + iOS safe-area handling）。
  - Pilot migration（`InstallGuide.tsx`）驗 API，接著 SettlementSheet（#650）/ IncomeSheet（#649）/ RecurringRuleSheet（#652）/ AddSheet（#651）四個重點 sheet 全部收進來。
  - Spec：`docs/superpowers/specs/design-system-primitives-design.md`（first_shipped_in v1.1.2）。
- **前端品質重構 (#610 umbrella) — code quality 一輪**：
  - **Bundle / boundary**：lazy-load sheet components via `next/dynamic`（#616）；SVG icon components 拿掉 `"use client"`（#630）；`SettingsContent` client boundary 收窄（#631）。
  - **Token / style**：hardcoded `#fff` / `bg-white` 改 CSS token（#620，承接 token layer 工作）；recurring sheet 的 Tailwind arbitrary value 移進 `@theme inline`（#621）。
  - **Hook / widget 抽取**：`useWizardSteps` 共用 hook（#624）；`WizardNavButtons` + `SectionCard` 統一（#618）；`CsvFileUploadWidget` 抽出（#619）；wizard CTA i18n key 統一 + 刪掉 orphan `autoSuggested`（#632）。
  - **State 結構**：`Dashboard.tsx` 多個 useState → `useReducer`（#626）；FilterSheet / RecordsList / BalanceHero state cleanup（#627）。
  - **共用 component / lib**：income vs expense `RecurringRuleSheet` merge 成同一個（#625）；CSV parser / detector 收進 `lib/csvImport/`（#623）。
  - **Dead code / 防呆**：刪除 `OfflineBanner` / `PastEpochBanner`（#617）；stats view + sheets 拿掉冗餘 type assertion（#628）；`useTranslations()` stable-reference contract 補 test 鎖死（#622）。
- **SEO 收尾**：
  - `MigrateOtherSources` server component（#612）— 每條 /migrate 頁底吐 cross-link card。
  - Landing → /migrate/* 內部連結（#613）。
  - /migrate page title 縮短（#614）— 平均 ~48 chars，避開 SERP 截斷。
  - FAQPage JSON-LD per-locale 注入（#611）— `inLanguage` 對應頁面 locale。
  - Google Search Console verification meta tag（#615）— `app/layout.tsx` 加 `<meta name="google-site-verification">`，前面 SEO 工作才有量測基礎。

## [1.1.1] - 2026-05-19

主題：**CSV 匯入續做（Spendee / 銀行對帳單 / OFX / QIF）+ /migrate SEO 強化**——把 v1.1.0 的 CSV import + /migrate landing pages 再推一輪。CSV mapper 修了 Spendee Transfer row 被誤分類成收入的 bug，並補銀行對帳單 → Futari 通用格式的 .xlsx 轉換模板（#585）；新增 OFX + QIF parser，把 `.ofx` / `.qif` 也走同一條 import pipeline（#586，Moze 樣本待補）。SEO 面把 /migrate 三條 landing 加 BreadcrumbList + FAQPage JSON-LD（#593, #599）、長尾關鍵字（Honeydue/Spendee/CWMoney 替代方案）+ Futari vs source app 比較表（#599）、sitemap/robots 對齊（#595, #596）、hreflang 行為鎖 regression test（#594）、meta description + og:description 4 語對齊（#597）、H1 下方 body 自然帶入「伴侶／夫妻記帳」關鍵字（#598）。
完整 diff：[v1.1.0...v1.1.1](https://github.com/redtear1115/oikos/compare/v1.1.0...v1.1.1)

### 使用者可見變化

- **Spendee Transfer row 不再被誤分類成收入（#585）**：Spendee 的 amount 永遠是正數，先前的 amount-sign fallback 會把所有 Transfer row 標成收入；改成 `type` 保持 undefined 讓 validator 直接 surface 給用戶在 preview wizard 確認。順手補 Spendee 標準分類同義詞（Food & Drinks / Life & Entertainment / Vehicle / Financial expenses / Communication / Others）。
- **銀行對帳單 → Futari Excel 轉換模板（#585）**：3-sheet `.xlsx`（轉換表 / 常見銀行欄位對照：台新・中信・國泰・玉山・富邦 / 類別建議 ~24 常見字串）。從 /migrate 入口下載，用戶在 Sheet/Excel 把銀行 CSV 對映成 Futari 通用格式再上傳。模板位置 `/bank-statement-template.xlsx`。
- **OFX + QIF 格式支援（#586）**：可直接拖 `.ofx`（OFX 1.x SGML + 2.x XML）或 `.qif`（line-oriented、`^` 分隔 record）進 import wizard；content-sniff + 副檔名 fallback。每 row 走原本的 `validateRow` pipeline，錯誤訊息形式與 CSV 匯入一致。Moze 樣本待補。
- **Spendee /migrate 頁多了 CSV header 預覽（#585）**：step 1 直接看到 Spendee CSV 欄位範例 + Transfer caveat（不必先匯出才知道格式長什麼樣），IA 對齊 cwmoney step-2 的寫法。
- **/migrate landing 多了 FAQ + 比較表（#599）**：每條 /migrate 頁底新增「常見問題」block（4 題：3 共通 + 1 source-specific）和 5 列 Futari vs source app 比較表（tone-driven cell colors）；同時吐 per-locale `FAQPage` JSON-LD（`inLanguage` 對應 page locale）讓 Google rich result 抓得到。
- **/migrate landing 多了 breadcrumb（#593）**：兩層 BreadcrumbList JSON-LD（Home → 來源頁），每條 /migrate 頁都有；首頁原本已有 WebSite/Organization/SoftwareApplication/FAQPage，本版補齊 migrate 那塊（避開 /migrate index 因該頁不存在會 fail Google validation）。
- **搜尋找到 Futari 更容易（#597, #598, #599）**：landing description 改寫到 70–80 chars（zh）/ ~155 chars（en）/ ~70 chars（ja），自然帶入「伴侶記帳 / 夫妻記帳 / 共同帳本」；H1 下方 body 加「為伴侶與夫妻設計的共同記帳」（zh-TW 主稿，4 語同步：en `shared ledger for partners and couples`、ja `夫婦・カップルのための共有家計簿`）；/migrate 三條頁 title/description 補長尾關鍵字（Honeydue 替代方案 / Spendee 伴侶記帳替代 / CWMoney 資料匯出匯入）。Tone 維持「有溫度的清醒」，零 conversion 語言、零「追蹤」/「管理」。

### 技術變更

- **CSV mapper Spendee polish（#585）**：`mapSpendee` 讓 Transfer row 的 `type` 保持 undefined（不再走 amount-sign 推測）；補 Spendee canonical category 同義詞表。`mapper.test.ts` 加 case lock 行為。
- **OFX + QIF parser（#586）**：新增 `lib/csvImport/ofxParser.ts`（OFX 1.x SGML leaf-tag-without-close + 2.x XML，抽 STMTTRN 的 TRNAMT / DTPOSTED / MEMO|NAME，負 TRNAMT → expense）+ `qifParser.ts`（`^` 分 record，D/T/M/P/L 單字母欄位，日期 US M/D/YYYY、M/D/YY pivot 50、apostrophe M/D'YY、ISO YYYY-MM-DD，transfer notation `L[Account]` 忽略避免污染同義詞）。`detector.ts#detectFormat(text)` content sniff `DetectedSource` 加入 `'ofx'` / `'qif'`；`processFile` 也認 `.ofx` / `.qif` 副檔名 fallback。新增 `ofx.test.ts`（188 LOC）+ `qif.test.ts`（212 LOC）+ 更新 `detector.test.ts`。
- **銀行對帳單 .xlsx 模板（#585）**：`scripts/build-bank-statement-template.py`（354 LOC）產生 3-sheet `.xlsx` 放 `public/bank-statement-template.xlsx`。
- **`MigrateFaq` + `MigrateComparison` + `MigrateBreadcrumbJsonLd` server components（#593, #599）**：三個 server component 收在 `app/[locale]/migrate/_components/`，FAQ 吐 per-locale `FAQPage` JSON-LD + visible Q/A list；Comparison 5×N table 用 tone-driven cell color；Breadcrumb 吐兩層 `BreadcrumbList`。3 個 /migrate page 各掛一份。
- **sitemap + robots align（#595, #596）**：`robots.ts` 每個 locale variant 加 `/sign-in` disallow + `/migrate/` explicit allow，給未來 /migrate/* 成長保留清楚 crawl signal；`sitemap.ts` 移除 /sign-in 條目（與 robots disallow 衝突）、三條 /migrate landing 升 priority 0.8。新增 `tests/seo-sitemap-robots.test.ts`（80 LOC）鎖 invariants：migrate 在 sitemap、/sign-in 不在 sitemap、robots disallow /sign-in 與 /api/、explicit allow /migrate/、Sitemap directive 存在。
- **hreflang regression test（#594）**：實作已隨 #567 在 v1.1.0 上線（live 驗證過 4 語 + x-default 在 / / /sign-in / /migrate/* / /terms / /privacy 全部 present），本版補 `tests/i18n-seo.test.ts`（104 LOC）鎖 `lib/i18n/seo.ts#buildAlternates(path, locale)` 行為，避免未來 regression。
- **meta description + og:description（#597）**：4 語 landing + /migrate 三頁同步；長度依語言調整，brand tone 鎖死（無 conversion 語言、無禁用詞）。
- **landing H1 body keyword 帶入（#598）**：H1 主標題保留「兩個人，一本帳。」，把 SEO 關鍵字塞 H1 下方 body copy；ja「夫婦・共有・家計簿」確認為日本家計簿 app 標準漢字用法（無誤觸 ja-i18n 白名單）。
- **i18n 4 語同步**：zh-TW 主稿；en / ja 多處 marked `TODO(#599): pending native review` per project rule。

## [1.1.0] - 2026-05-18

主題：**CSV 匯入歷史紀錄 + /migrate 站台（#51）**——換 app 最大的摩擦是「過去三年的紀錄怎麼辦」。Futari 提供通用 CSV 匯入（schema + parser + dedup + 預覽 wizard）和 CWMoney → Futari Excel 轉換模板（#557），讓 Honeydue / Spendee / CWMoney 出走者把歷史資料帶進來不用重打。順手做 /migrate/{honeydue,spendee,cwmoney} 三條 SEO landing 頁，把「Futari 是替代品」這件事說清楚。順帶 perf 優化把 landing 從 render-blocking 字型 chunk 解放（#572），LCP 7076ms → 2345ms、Lighthouse 61 → 98；修 dashboard 右上角小飛機按鈕點了沒反應的 bug（#587）。
完整 diff：[v1.0.5...v1.1.0](https://github.com/redtear1115/oikos/compare/v1.0.5...v1.1.0)

### 使用者可見變化

- **CSV 匯入歷史紀錄（#51, #552–556）**：上傳通用格式 CSV，系統做欄位驗證、hash-based dedup，跑完進入 preview wizard 確認 category / 預設付款人 / 跳過個別 row，最後一鍵寫入帳本。匯入 row 標記 imported_at + source 留 audit；不會自動還原 GroupBalance（來源 app 的金錢歸屬規則不同）。
- **CWMoney → Futari Excel 轉換模板（#557）**：提供 .xlsx 模板（公式驅動），用戶在 Sheet/Excel 把 CWMoney CSV 對映成通用格式再上傳。模板放在 /cwmoney-template.xlsx，從 /migrate/cwmoney step 2 直接下載；修了一個 auth redirect 把模板擋在登入後的 bug（#575）。
- **/migrate landing 頁（Honeydue / Spendee / CWMoney）**：三條 SEO landing 頁，每條都有 hero（italic Fraunces kicker + brand mark）、「為什麼 Futari」differentiator 區塊、3 步驟匯入 guide（italic Fraunces 01/02/03 numerals）、trust 區塊 + footer。Honeydue 附「自 2024 年起已由原團隊轉手」客觀背景說明（hairline-bordered italic callout，不攻擊性）。CWMoney 把模板下載折進 step 2，避免兩顆 CTA 競爭。設計細節見 #577–#583。
- **Landing 載入更快（#572）**：Noto Sans TC 從 root layout 移到 dashboard layout，landing 不再下載 ~190KB @font-face CSS chunk。Mobile-simulate Lighthouse：LCP 7076ms → 2345ms、perf 61 → 98。
- **Dashboard 右上角飛機按鈕修好了（#587）**：沒有 active trip 時右上的小飛機按鈕點下去現在會跳出新增旅行 sheet（先前是 no-op placeholder）。順便把圖示換成 Lucide `Plane` 真實客機輪廓。

### 技術變更

- **CSV 匯入 stack（#552–556）**：新增 `ImportBatches` / `ImportErrors` table；client-side 通用 CSV parser + 欄位 validator（`lib/csv/`）；hash-based dedup（同檔重傳 short-circuit、跨檔交叉檢核同 row）；server action 落地 batch + transaction 寫入；preview wizard 做類別 mapping + 預設 payer 選擇。
- **/migrate shared layout + components（#561, #584）**：`app/[locale]/migrate/_components/` 收 `MigrateHero` / `MigrateTool` / `MigratePreviewCard` / `MigrateSteps` / `MigrateDifferentiators` / `MigrateIntroCallout` / `MigrateTrustFooter`。三條頁面從 shared layout 組裝；i18n 4 語同步（zh-TW 主稿；ja 依 ja-i18n skill 漢字白名單檢核）。
- **Noto Sans TC scope 收斂（#572）**：`Noto_Sans_TC({ preload: false, display: 'swap' })` 從 root layout 移到 `app/(dashboard)/layout.tsx`，landing path 不再 fetch 那 ~11 個 unicode-range woff2 chunks。Onboarding (`app/onboarding/`) 改 system-ui fallback（接受小幅 first-visit 視覺 regression 換 perf）。
- **Dashboard 飛機按鈕 wire（#587）**：`Dashboard.tsx` 加 `tripSheetOpen` state，mount sibling `<TripSheet>`；`PaperPlaneIcon` → `PlaneIcon`（Lucide `Plane` path）；`BrandHeader` + `ActiveTripBanner` 兩處同步 rename。
- **docs cleanup**：CLAUDE.md 去重、README 重新整理；CHANGELOG 把 v0.x 收成 collapsible；breaking changes 區塊標明；csv-import-design.md frontmatter 改 shipped + first_shipped_in v1.1.0。

## [1.0.5] - 2026-05-18

主題：**三大入口 header / filter 統一（#545）**——Dashboard / Records / Assets 三頁 L1Header 規格對齊；Records L2 三 tab 收成「支出 + 收入」雙 toggle 並把月份切換改成 month picker popover；Dashboard 拆掉多餘 FilterSheet，payer / 負擔兩維直接做成 L3 雙 toggle，順手把「分攤」語意修成正確的 viewer × payer 負擔 cross-product；定期收支入口從 feed 中間 card 移到 L1 右側；愛物頁類型篩選改成 icon-only chip + 篩到空 bucket 的智慧 CTA。
完整 diff：[v1.0.4...v1.0.5](https://github.com/redtear1115/oikos/compare/v1.0.4...v1.0.5)

### 使用者可見變化

- **Records 篩選改雙 toggle（#548, #545 §3）**：「全部 / 支出 / 收入」三顆獨立 tab 改為「支出 + 收入」兩顆 toggle，包在同一外框 pill 內。兩顆都選中 = 全部、只選一顆 = 單一篩選；不允許兩顆都取消。
- **Records 月份切換改 month picker（#548）**：原本的「‹ 月 ›」左右箭頭改成 month picker — 點月份展開 popover（含年份左右切換 + 3×4 月份 grid），可直接跳到任意月份。
- **Dashboard 簡化篩選（#548, #545 §2）**：移除 L3 上多餘的「篩選 ›」chip 與 FilterSheet lite-mode 入口；payer 與「誰負擔」兩維直接做成 L3 雙 toggle（「我付 + 對方付」/「我負擔 + 對方負擔」），solo 模式整個 L3 row 隱藏。
- **「負擔」語意修正（#548）**：單獨選「我負擔」現在會包含 half / weighted 兩種 ratio-based 模式中 viewer 也確實負擔的記錄（不是只篩 `all_mine`）；正確語意 = viewer 最終承擔的記錄（cross-product of paid_by × split_type）。
- **定期收支入口上移（#548, #545 §4）**：原 Records feed 中間的 `RecurringSectionCard` 移除，改成 L1 右側「定期 ›」連結，點擊直接導 `/settings/recurring`，不再插隊在 feed 中間。
- **愛物類型篩選改 icon chip（#547, #545 §5）**：7 顆篩選 chip（全部 / 房 / 車 / 孩 / 寵 / 植 / 物）改成 40×40 icon-only chip，active 時填對應愛物主色、inactive 顯該類型主色，視覺對齊 list rail / cards 同一 hue family。
- **愛物空狀態 CTA（#547, #545 §6）**：移除 car-specific 永久顯示的虛按鈕；改為「篩到單一類型且 bucket 為空」時才顯示對應「新增 OO」虛按鈕，點擊直接開到對應類型 sheet body。
- **觸控目標 ≥44px（#548 polish）**：MonthSwitcher 年份箭頭與 trigger 雖然視覺維持 32–34px，但用 ::before pseudo 把 hit area 撐到 ≥44px，對齊 WCAG / iOS HIG（同 SettleButton 既有作法）。

### 技術變更

- **L1Header 規格統一（#548, #545 §1）**：Dashboard `BrandHeader`、`RecordsList`、`AssetsListClient` 三處 L1 統一為 `pt-[max(env(safe-area-inset-top),24px)] px-5 pb-3` + `flex items-center justify-between`，title 維持 serif `text-2xl font-medium tracking-tight`。L2 pill 三頁統一 `h-8` + `font-medium`，active 字重 600；視覺語彙 L2 = solid ink、L3 全部 = bordered ink、L3 per-type = asset hue 三層分明。
- **`tab` state 重構（#548, #545 §3）**：Records 頁內部 state 從 `'all' | 'expense' | 'income'` 改成 `Set<'expense' | 'income'>`；downstream 的 `TabContext`（FilterSheet / MonthlyStatsView / feed loader / drill 邏輯）仍是原本三選一 enum，由 `selectedKinds` 推導，零 downstream 改動。
- **新增 `burden` filter dim（#548 6th review）**：`TxnFilter` 加 `burden: 'all' | 'mine' | 'theirs'` 表達 payer × split cross-product；`ResolvedTxnFilter.burden` 含 viewerId + partnerId，SQL `_predicates.ts#burdenClause` 處理 4 個 callsite（listTxnsPaged / listFeedAllPaged cash / statsScopeClauses / income branch），income + settlement 在 burden 啟用時 short-circuit；`matchesFilter` in-memory matcher 同步；URL 序列化加 `fBurden`。Dashboard L3 split state 改寫 `burden` 不再動 `split` 維。
- **`MemberDualToggle` 抽出（#548 4th review）**：`PayerDualToggle` 與 `SplitDualToggle` 共用底層 pill UI，吃 left/right Side token + viewer/partner 色，兩個 wrapper 各自負責 value ↔ Side 對映。
- **MonthSwitcher popover portal 化（#548 2nd review）**：透過 `createPortal` 到 `document.body` 跳出 sticky header 的 `overflow-x-auto` clip 範圍；用 fixed position + `getBoundingClientRect` 追 trigger，open 時掛 scroll / resize listener；pointerdown 同時看 trigger 與 portalled popover 兩邊避免 portal 化後誤判點外部。
- **`RecurringSectionCard.tsx` 刪除（#548, #545 §4）**：整支檔案刪掉，無其他引用。
- **TYPE_CHIPS icon 化（#547, #545 §5）**：愛物 chip 改用 `AssetIcon` component，沿用 `--asset-color-{type}` token；「全部」chip 用 2×2 dots SVG；每顆 chip 加 `aria-label` + `aria-pressed`，鍵盤 / 螢幕閱讀器可辨識。
- **i18n 4 語同步**：新增 `assets.addHouse` / `addChild` / `addPet` / `addPlant` / `addItem`（智慧空狀態 CTA）、`assets.typeFilterAll`（chip aria-label）、`records.recurringShortcut`（L1 連結）、`records.monthPicker.*`（month picker UI）、`dashboard.splitFilter.{mine,theirs}`、`dashboard.payerMe` / `payerPartner` 改為短版「我 / 對方」；移除 `dashboard.payerAll` / `records.tabAll` / `splitFilter.shared`（不再有對應 UI）。

## [1.0.4] - 2026-05-17

主題：**前端 refactor 大掃除 + 效能優化**——清掉 `actions/` + `app/(dashboard)/` 累積的重複 / 巨大 component / 散落 helpers（#512 八個 PR），同時把首次載入跟靜態資源體積順手優化（#511 三個 PR + #517 一個 RLS 補洞）。零 schema 改動、零使用者 flow 變化，但啟動更快、icon 更小。
完整 diff：[v1.0.3...v1.0.4](https://github.com/redtear1115/oikos/compare/v1.0.3...v1.0.4)

### 使用者可見變化

- **首次載入更快（#518, #521）**：`next.config` 加上 AVIF/WebP image format 協商、Google Fonts preconnect；avatar 圖片改成 lazy load、guardian 模組改成 UA-gate 動態載入（沒開守護 beta 的客戶端不下載對應 chunk）。
- **App icon 變小 64–71%（#524）**：iOS / Android 主畫面 icon PNG 重新壓縮並加 WebP 變體；icon-512 從 382 KB → 112 KB、icon-192 從 63 KB → 23 KB。

### 技術變更

- **`lib/auth/asset.ts` + `lib/auth/member.ts` 抽出（#519, #512 pt 1）**：`actions/transaction.ts` / `income.ts` / `settlement.ts` / `tripExpense.ts` 內三份重複的 `assertAssetInGroup` / `assertMemberInGroup` 收歸統一 helpers；`lib/recurringActionHelpers.ts` 保留為 re-export shim 不破壞 recurring action imports。順手把「關聯資產」錯誤訊息統一為「關聯愛物」（CLAUDE.md 命名規範）。
- **`DateField` 統一（#520, #512 pt 2）**：dashboard sheet 與 asset sheet 兩份近似實作收成一個 `app/(dashboard)/_components/DateField.tsx`，card / inline 兩種變體用 `label` prop 判別；刪掉舊兩個檔案。
- **`lib/local-date.ts` 補三個 helper（#522, #512 pt 3）**：`todayLocalDate` / `daysBetween` / `parseLocalDate` 從 `InsuranceListItem.tsx` 內聯 helper 抽出，alongside 既有的 `localTodayISO` / `ymdToUTCNoon`。
- **`useSheetMutation` hook（#528, #512 pt 4）**：AddSheet + IncomeSheet 共用的 pending / error / confirmingDelete / runMutation / performDelete + race-resolution `onError` callback 收成 `app/(dashboard)/_components/useSheetMutation.ts`。TripSheet 的 error shape 不同（string | null + 與 sync validation 組合）未納入。
- **`useAssetSheetCommon` hook（#527, #512 pt 5）**：6 個 AssetSheet body（Car / Child / House / Insurance / Pet / Plant）共用的 name + notes + error + pending + open-reset effect + 350ms focus timeout + performDelete 收成 `shared/useAssetSheetCommon.ts`；每個 body 透過 `resetDomain` callback 重設自己的 domain 欄位。每個 body 約少 25 LOC。
- **MonthlyStatsView 拆檔（#529, #512 pt 6）**：791 LOC 拆成 `MonthlyStatsView.tsx`（376）+ `MonthlyStatsPieChart.tsx`（211）+ `MonthlyStatsBars.tsx`（237）；同時把 FilterSheet 的 `Section` / `Chip` / `AssetGroupSection` 抽到 `FilterSheetChrome.tsx`，FilterSheet 從 704 → 623 LOC。URL sync 留在 main component 內，不擴散到 chrome primitives。
- **`EndTripSheet` 抽出（#526, #512 pt 7）**：從 TripDetailClient 內 88 LOC 的 mini-form 提到 sibling 檔，parent 從 691 → 601 LOC。
- **MoF error map + recurring sync 註解（#525, #512 pt 8）**：`actions/invoice.ts` 的 `mapMofErrorToMessage` switch 改成 `const Record<string, string>`；`actions/recurringExpense.ts` + `recurringIncome.ts` 加 keep-in-sync header 註解。
- **`next.config.ts` hardening（#518, #511 phase 1）**：image AVIF/WebP format、mobile-first deviceSizes 收窄、Cache-Control headers 給 static assets、Google Fonts preconnect。零功能變更，純 config。
- **Avatar lazy + guardian UA-gate（#521, #511 phase 2）**：`<Avatar>` 加 `loading="lazy"` + `decoding="async"`，below-the-fold avatars（BottomNav / AvatarMenu / feed / settings）不再 eager fetch。Guardian module 改成 UA-check 動態載入，沒開 beta flag 的客戶端不下載對應 chunk。
- **PNG icons 壓縮 + WebP 變體（#524, #511 phase 3）**：512 / 192 icon 壓縮 64–71%，總共少傳 ~700 KB；加 WebP 變體讓 Accept-aware client 拿到更小檔。
- **`invites_select` RLS InitPlan 補洞（#523, #517）**：v1.0.3 的 0045 migration 漏到的 legacy `db/rls/policies.sql` 內 `invites_select` policy，0048 補上 `(select auth.uid())` wrap，Supabase advisor `auth_rls_initplan` WARN 完全清零。

## [1.0.3] - 2026-05-17

主題：**Supabase Advisor 全面清零**——把 security advisor 與 performance advisor 上累積的 RLS / SECURITY DEFINER / search_path / 多重 permissive policy 警告一次掃乾淨。沒有 schema 改動、沒有 UI 變化；其中 5 張表（CurrencyRates / PetDetails / PlantDetails / Trips / TripExpenses）原本因為缺 RLS policy，Realtime 訂閱者收不到 INSERT/UPDATE 事件，本版修好。
完整 diff：[v1.0.2...v1.0.3](https://github.com/redtear1115/oikos/compare/v1.0.2...v1.0.3)

### 使用者可見變化

- **Realtime 即時更新補齊（#504）**：愛物頁的寵物 / 植物細節、旅行子帳本、心理匯率表的變更，另一位伴侶現在會即時看到（過去需重整頁面）。

### 技術變更

- **補齊 5 張表的 RLS policy（#504, migration 0044）**：`CurrencyRates` / `PetDetails` / `PlantDetails` / `Trips` / `TripExpenses` 原本未啟用 RLS，anon role 無法 SELECT；Supabase Realtime 用同一套 RLS 做訂閱檢查，導致 client 端收不到變更事件。Server-side（postgres role）讀寫不受影響、不存在資料外洩，純 Realtime 沒接上。pattern 對齊 0023/0024/0030（`ENABLE RLS` + group-membership SELECT policy + `(select auth.uid())`）。
- **`auth.uid()` 全面包進 `(select ...)`（#505, migration 0045）**：剩餘 22 條 RLS policy 把 per-row 的 `auth.uid()` 改成 `(select auth.uid())`，planner 可以 hoist 成 InitPlan 每 query 只算一次。`CashTransactions` / `Settlements` / `GroupBalance` / 各 Detail table / `FuelLogs` / `IncomeTransactions` / recurring + pending 配對 / Invoice 三表 / MonthlyReview 配對 / PartnerQuiz 配對。USING / WITH CHECK 邏輯逐字保留，純機械改寫。
- **合併重複的 permissive SELECT policy（#506, migration 0046）**：三類 duplication 處理掉，advisor 5 條 `multiple_permissive_policies` WARN 清零。(1) `db/rls/policies.sql` 的舊版 `_select` policy 與 0005/0006 為 Realtime 加的 `_member_select` 在 OR-combine 下完全 dominated；(2) `invoice_creds_select`（任一成員可見）默默放寬了 0018 的 `invoice_credentials_owner_select`（owner-only，spec 明定「partner 看不到 barcode／驗證碼」），順手收緊（雲端發票功能未上線，無 client read，無風險）；(3) `profiles_self_select` + `profiles_partner_select` OR-merge 成 `profiles_self_or_partner_select`。同時把 3 張 Invoice 表從 `supabase_realtime` publication 移除（client 端從未訂閱）。
- **`rls_auto_enable` REVOKE EXECUTE（#502, migration 0043 → migration 0047）**：SECURITY DEFINER migration helper 不應該被 anon / authenticated 透過 `/rest/v1/rpc` 呼叫。0043 用了 `REVOKE FROM PUBLIC` 想跟 0023 對齊，但實測 Supabase 對 public-schema 函式預設直接 grant 給 anon/authenticated（不是只走 PUBLIC 繼承），所以 0043 對 advisor 而言是 no-op；0047 補上 direct REVOKE FROM anon, authenticated，advisor 兩條 `*_security_definer_function_executable` 清零。
- **pg_cron helper 固定 `search_path`（#501, migration 0042）**：`compute_next_occurrence` 與 `compute_monthly_review_snapshot` 用 `ALTER FUNCTION ... SET search_path = public, pg_temp`，對齊 0022 對 `handle_new_user` 的處理，advisor `function_search_path_mutable` 清零；用 ALTER 而非 CREATE OR REPLACE 是為了讓 function body 留在原 migration（0016 / 0026），避免將來改 body 時意外漂移。
- **`package-lock.json` 同步到 v1.0.2**：lockfile 在 v1.0.0 → v1.0.2 cycle 沒跟著 bump，`npm install` 下次跑時自動修正。

## [1.0.2] - 2026-05-17

主題：**Prod log 修復**——修正從 production log 發現的三類問題：RSC 導航繞過 layout guard、iOS apple-touch-icon 404、以及 Supabase security warning。

### 使用者可見變化

- **修復 RSC 導航 error state（#493）**：在 app 內部點選導航到 dashboard、紀錄、愛物頁面時，若 group context 遺失不再出現 error state，改為正確導向 `/onboarding`。
- **修復 iOS 主畫面圖示 404**：iOS 裝置請求 `/apple-touch-icon.png` 不再 404，主畫面 icon 正常顯示。

### 技術變更

- **RSC navigation group guard（#493）**：`dashboard` / `records` / `assets` / `assets/[id]` 四個 page 的 `if (!context) throw new Error('No group')` 改為 `redirect('/onboarding')`。RSC navigation（`_rsc=` 請求）不重新執行 layout，page 本身必須負責 guard。
- **`getCurrentUser()` 改用 `getUser()`（#494）**：消除 prod log 每次請求出現的 Supabase security warning（`getSession()` 從 cookie 讀取不驗證真實性）。
- **新增 `apple-touch-icon.png` / `precomposed`**：iOS 標準路徑 `/apple-touch-icon.png` 請求原本落入 `[locale]` dynamic route 回 404；將 `public/icons/` 的圖示複製至 `public/` 根目錄修復。
- **`InstallGuide` regression test**：補上 #490 修復的單元測試，防止 `TranslationsProvider` 缺失問題回歸。

## [1.0.1] - 2026-05-17

修復 `/setup` 頁面 500 錯誤：`InstallGuide` 元件在 `<TranslationsProvider>` 之外呼叫 `useTranslations()`，導致新用戶完成 Google OAuth 後無法進入建立帳本流程。

### 使用者可見變化

- **修復新用戶 /setup 500（#490）**：Google 登入後跳轉 `/setup` 不再 500，建立帳本流程恢復正常。

### 技術變更

- **`InstallGuide` 改接 `t` prop（#490）**：移除元件內部的 `useTranslations()` hook，改由 caller 傳入 `t: Translations`。`/setup` 在 `(dashboard)` layout 之外，沒有 `TranslationsProvider`，導致 SSR render throw；此修法讓元件在任何 context 下都能使用。

## [1.0.0] - 2026-05-17

主題：**公開 landing．接住歷史**——v1.0.0 把 Futari 從「兩個人的內部記帳工具」翻成「對外有臉面的產品」。`/` landing 全新三欄敘事（SEO 長文 + brand mark + 場景卡 + 部落格 feed），公開頁面改 URL-prefix locale routing（`/en` `/zh-CN` `/ja`），OG / Twitter / FAQ / SoftwareApplication / Organization JSON-LD 全套接好，品牌語氣與 i18n 全面收斂——任何陌生人從搜尋或社群點進來看到的，都是同一個產品聲音。沒有 schema migration，純前台 + SEO + copy。
完整 diff：[v0.17.6...v1.0.0](https://github.com/redtear1115/oikos/compare/v0.17.6...v1.0.0)

### 使用者可見變化

#### 公開 landing 三欄敘事（#416 #417 #418 #460 #482）

- **/sign-in 三欄結構**：桌機左欄七段 about narrative（每次造訪靜默輪播一段，#482）、中欄品牌 mark + Google CTA、右欄四張場景卡（#417）+ 部落格 feed（#460，從 southern-light.dev RSS 拉）。Mobile 自動垂直堆疊。
- **i18n landing narrative（#422）**：about narrative + feature cards 4 語齊備（zh-TW / zh-CN / en / ja）。
- **品牌語氣收斂（#474 #483）**：landing / sign-in / solo mode copy 對齊《品牌文案準則》（landing「有溫度的清醒」、sign-in「安靜的邀請」、solo「不預設等待焦慮」），禁用詞（管理 / 追蹤 / 監控 / 感嘆號）清查到 0 違規。

#### SEO 與分享

- ⚠️ **多語 URL-prefix routing（#400 #462）**：公開頁面（landing / sign-in / privacy / terms）改為 URL prefix `/<locale>`，每個 locale 都是獨立可索引 URL，搭配 hreflang alternates + sitemap per-locale 條目。
- **結構化資料齊備（#459 #467）**：landing 同時 ship WebSite / Organization / SoftwareApplication / FAQPage 四套 JSON-LD，全部跟著 locale 走。
- **OG / Twitter 預覽卡（#487）**：landing / sign-in / privacy / terms 全部接上 `og:image` 與 `twitter:image`（1200×630，`alt` locale-aware），LINE / FB / Slack / Threads 分享有圖。

#### 文件 / 流程

- **《品牌文案準則》（#478）**：CLAUDE.md 明定流量分層 × tone 對應、landing / sign-in / solo 寫作規則、app 內禁用詞、i18n 同步規則——任何動 copy 的 PR 之前都對照這份。
- **ja-i18n skill + 漢字白名單（#477）**：日文翻譯巡檢自動化，假陽性漢字白名單可從外部資料更新。

### 技術變更

- **i18n 完整覆蓋（#467 #468 #469 #471 #481）**：dashboard / public pages 殘存 hardcode 中文清完；zh-CN 213 個 + ja 68 個未翻譯 key 補完；intentional 空字串 key 加文件註記避免下次 audit 誤報。
- **每頁 `generateMetadata` 接 OG image（#487）**：`public/og-image.png` 從 #282 ship 但未 wire 進 metadata，造成 prod HTML 缺 `og:image` / `twitter:image`；本版 4 個 public page 各加 `openGraph.images` + `twitter.images`，`alt` 用 `t.title` locale-aware，無需新增 i18n key。
- **`settings.local.json` 列入 gitignore（#478）**：避免本地 hook / 權限設定外洩。

[Unreleased]: https://github.com/redtear1115/oikos/compare/v1.1.6...HEAD
[1.1.6]: https://github.com/redtear1115/oikos/compare/v1.1.5...v1.1.6
[1.1.5]: https://github.com/redtear1115/oikos/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/redtear1115/oikos/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/redtear1115/oikos/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/redtear1115/oikos/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/redtear1115/oikos/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/redtear1115/oikos/compare/v1.0.5...v1.1.0
[1.0.5]: https://github.com/redtear1115/oikos/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/redtear1115/oikos/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/redtear1115/oikos/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/redtear1115/oikos/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/redtear1115/oikos/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/redtear1115/oikos/compare/v0.17.6...v1.0.0
