# Changelog

All notable changes to Oikos (Futari) are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

_Nothing unreleased yet._

## [0.13.0] - 2026-05-09

主題：**陪伴 × 起點 × 定期支出**——兩個人都有自己的第一步、自己的第一筆，再到不必再記住的每月固定。

完整 diff：[v0.12.0...v0.13.0](https://github.com/redtear1115/oikos/compare/v0.12.0...v0.13.0)

### Added
- **邀請流程雙向確認儀式**（PR #73，#43 Phase E）：把單向的信任宣示升級為雙向確認儀式。A 邀請者在 `/setup` 流程中，於 `name → trust → invite` 三步走中插入 `trust` 步驟，讀完三段承諾（加密／可攜／備份）並按「這是我希望的」才會 `createGroup + createInvite`；B 受邀者點 invite 連結改走 `previewInvite`（新 server action，驗 token 但不 commit）拿到 inviter displayName，看到「{name} 已經承諾了這些」+ 同樣三段承諾，按「我也是」才 `acceptInvite`。`TrustCommitments` 元件抽出共用，給 `/settings/trust`、setup trust step、invite confirm 三處復用。i18n 4 語新增 `trust.bilateral.{inviter,invitee}` + `invite.{joiningGroupLabel,fallbackInviter}`。
- **First-record 理念卡**（PR #74，#43 Phase C）：`createTransaction` server action 改回傳 `{ id, isFirstTransaction }`，trigger 是該使用者在這個 group 的 `paid_by` 計數於 insert 後 = 1。AddSheet 透過既有 `onMutated(info?: { isFirstTransaction })` callback 把訊號帶回 Dashboard；Dashboard 持有 `showFirstCard` state，跨 `router.refresh()` 維持顯示，使用者 dismiss 才消失。`<FirstRecordCard>` 顯示時即把 `oikos_first_record_card_seen_{userId}` 寫入 localStorage（per-user flag），確保 reload 不二次觸發、刪除重建也不二次觸發。兩位伴侶各自有自己的 first-record moment（trigger 是 per-user）。i18n 4 語齊備（`firstRecordCard.*`）。
- **定期支出 — server actions + db queries**（PR #76，#18 PR #2／5）：mirror `actions/recurringIncome.ts` 形狀，新增 `actions/recurringExpense.ts` 8 個 actions（`createRule` / `updateRule` / `pauseRule` / `resumeRule` / `softDeleteRule` / `confirmPending` / `editAndConfirmPending` / `skipPending`）+ `lib/db/queries/recurringExpense.ts`（`listActiveRules` / `listActivePendings` join rule 取 category & asset）。**vs income 的差異**：rule 帶 `paid_by` + `split_type` + `description`（NOT NULL），不是 `recipient_id` + `source`；`confirmPending` 在同一個 drizzle transaction 內寫 `CashTransactions` row + 跑 `recalcGroupBalance`（mirror `createTransaction`，income 的 confirm 沒有 balance impact）；`editAndConfirmPending` 接 partial-overrides + 用 PR #1 的 `validateConfirmPendingExpenseInput`；race guard：`proposed_paid_by` 已離開 group 時 surface partner-race 訊息給 UI 提示「改一下」而不是塞 orphan transaction。19 個 unit tests。
- **定期支出 — Settings 子頁 + Dashboard pending stack**（PR #77，#18 PR #3／5）：`/settings/recurring-expense` 列出規則 + 新增/編輯/暫停/恢復/刪除（mirror `recurring-income/`）；Settings 主頁加「定期進帳」+「定期支出」兩條入口。Dashboard 新增 `PendingExpenseStack` / `PendingExpenseCard`，用 category tint 做 glow（住=米色、樂=粉、融=藍，**不混 mint** 避免跟進帳訊號重疊）；payer line 顯示「{payer}・{splitType}」；「就這樣」「跳過」直通 server action，「改一下」先放 stub 留 PR #4 接 AddSheet prefill。`RealtimeProvider` 新增 `RecurringExpenseRules` + `PendingExpenseOccurrences` 訂閱 + `recurring-expense-changed` / `pending-expense-occurrence-changed` event kinds。**Breaking 改名**：`ModeTogglePlaceholder` 的 `pendingCount` → `incomePendingCount`，新增 `expensePendingCount`；4 處 callsite（Dashboard×3 + SoloBanner + BalanceHero）同 PR 全替換。
- **定期支出 — AddSheet「改一下」接通 + Records 入口**（PR #78，#18 PR #4／5，closes #18）：AddSheet 新增 `pendingExpenseId?` + `onRaceResolved?` props；submit 路徑分流，`isPending` 走 `editAndConfirmPending`，否則維持 `editTransaction` / `createTransaction`。Pending mode 隱藏 delete 按鈕 + notes 區塊（pending 不是真實 tx；notes 不在 override contract）。Race 偵測：error 訊息含 `'待確認支出'` 時觸發 `onRaceResolved` 顯示 toast「對方剛剛確認了這筆」。`PendingExpenseStack` 的 `onEdit` callback 帶完整 prefill payload（amount / description / category / splitType / payerId / transactedAt / assetId）給 AddSheet；新增 `edit-pending-expense` modal kind。Records sticky tab bar 下方加 inline link：tab=expense → 「⚙ 設定定期支出 →」、tab=income → 「⚙ 設定定期進帳 →」、tab=all → 不顯示。

### Design notes
- **`paid_by` 作為 row creator 代理**：CashTransactions 沒有 `created_by` 欄位；first-record 的 UX 場景是使用者記自己的支出，這個代理對暖訊息文案是足夠的。若日後需要嚴格的 creator 語意再加 migration。
- **Dashboard 載入零新增 query**：first-record signal 的成本完全收進 `createTransaction` insert path（一個 `count(*) WHERE paid_by = me`，在同一個 transaction 裡），不在 dashboard fast path 加任何 query。
- **定期支出 v.s. 定期進帳的 confirm 路徑刻意不對稱**：expense 的 `confirmPending` 必須跟 `recalcGroupBalance` 在同一個 drizzle transaction 裡（mirror `createTransaction`），income 不需要。共用一層抽象會讓 income 多扛不必要的 transaction overhead；複製 8 個 actions 比抽共用層更清楚反映「這兩種定期事件對 balance 的關係不同」。
- **「改一下」的 partial override 走 pending snapshot fallback**：使用者只改一個欄位（例如金額）不應該被迫補齊整張表；`editAndConfirmPending` 接 partial payload，未提供的欄位 fall back 到 pending occurrence 的 snapshot，再經 `validateConfirmPendingExpenseInput` 統一驗。

## [0.12.0] - 2026-05-09

主題：**陪伴 × 信任**——讓兩個人都安心把日子記下來。

### Added
- **信任宣示頁 + onboarding 信任卡**（PR #62，closes #48）：新增 `/settings/trust` 頁，三段式陪伴感文案（加密 / 可攜 / 備份），不講工程細節而是「連我們自己也讀不到」「我們替你們守著」這類軟性敘述；Settings 主頁加「資料」section 連到該頁。Onboarding flow 的 invite step 在「分享連結」與「稍後再邀請」之間插入 3 行信任卡。`trust.*` namespace × 4 語齊備（zh-TW / zh-CN / en / ja）。範圍對齊 #48 Phase A + B；Phase C（uptime status page）/ Phase D（Privacy/Terms 法規文案）out of scope。
- **CashTransactions 共同備註欄位**（PR #66，closes #34）：CashTransactions 新增 nullable `notes` 欄位（migration `0025_transaction_notes.sql`）。AddSheet 在日期下方加 multi-line textarea；列表 row 在備註非空時用引號樣式顯示一行（`line-clamp-2`），保持低調陪伴感。Phase 1 edit pattern (soft-delete + insert) 把 notes 帶到新 row；驗證走既有 `validateNotes`（≤2000 字、空白即 null）。Realtime payload 新增 `notes` 欄位（snake-case → camelCase 自動轉換）。i18n 4 語。
- **MiniCalendar 三層導覽（day → month → year）+ 3×4 年份格**（PR #67，closes #65）：day / month view title 加 `˅` chevron 暗示可下鑽；year view title 用 en-dash 分隔十年範圍。Year grid 由 5×2（10 in-decade）改為 3×4（1 leading overflow + 10 in-decade + 1 trailing overflow），overflow 年份 `opacity-40`，對齊 iOS / Google Calendar pattern；點 overflow 年份會跳到相鄰十年。Props (`value`, `onChange`) 維持不變，5 個既有 caller（DateField, SettlementForm, SettlementSheet, NewFuelLog, AssetSheet ×2）零 break。
- **CSV 匯出（v1：活躍 CashTransactions）**（PR #70，closes #37）：Settings → 資料 區新增「匯出資料（CSV）」按鈕，純 client-side `fetch → blob → <a download>` 觸發；`/api/export/transactions` route handler 在 `OikosGroups` 做成員身份檢查。CSV 為 UTF-8 with BOM + CRLF 行尾 + RFC 4180 跳脫，欄位：日期 / 描述 / 金額 / 分類 / 誰付的 / 分攤 / 備註，分類 + 分攤依 cookie locale 4 語翻譯，誰付的用 display name 不暴露 UUID；檔名 `futari-transactions-YYYY-MM-DD.csv`（Asia/Taipei）。`csvExport` namespace × 4 語。v1 範圍只匯出 CashTransactions；Settlements / IncomeTransactions / 日期範圍 / Google Sheets OAuth 留後續。
- **i18n：Settings 子頁（coming-soon + invite）**（PR #64，closes #21）：`/coming-soon` 與 `/invite/[token]` 兩個 server page 改用 `getTranslations()`；`comingSoon` + `invite` namespace × 4 語齊備。`validateInviteAcceptance` 改回傳 `InviteAcceptError` code，不再吐 zh-TW 字串；`acceptInvite` race condition 的 `'此帳本已有兩位成員'` 也改成 `'group_full'`，由頁面 map 成當前語系字串。
- **i18n：愛物 detail pages + AssetSheet**（PR #69，closes #20）：新增 `assetSheet`（建立／編輯表單）+ `assetDetail`（唯讀詳情頁）兩個 namespace × 4 語，~80 keys。重構整個愛物 detail flow 用 `useTranslations()`：6 種 type pickers + ~50 fields（car / child / pet / plant / house / insurance）+ 6 個 detail clients + AibutsuHeader / AssetSwitcher / AssetHero / AibutsuHintCard / aibutsu-ui (MoneyTwoCol / AgeDisplay) / FuelTypeButtonGroup / PrimaryUserToggle + Savings flow（SavingsView / MaturingSoonPrompt / MaturedAwaitingPrompt / SavingsHero）。Drop `insurance-copy.ts` string bank（superseded by dictionary entries）；strip display labels out of `lib/insurance.ts`（kept `getFramingGroup`）。

### Fixed
- **Solo mode 進帳模式 toggle 失效**（PR #63，closes #61）：`SoloBanner` 把 `pendingCount` forwards 給 `ModeTogglePlaceholder` 但漏掉 `mode` / `onChange`，導致 toggle 的 `onClick={() => onChange?.(o.id)}` 靜默 no-op，banner 顯示時 solo 使用者無法切到進帳模式。把 `mode` + `onModeChange` props 串通 `SoloBanner` → `Dashboard.tsx` 改 pass `mode` / `setMode`（鏡像 dismissed-banner 既有路徑）。新增 `tests/SoloBanner.test.tsx` regression test。
- **MiniCalendar year-view title chevron 拿掉**（commit `2f45fc2`）：year view 是頂層，本來就無處可下鑽，多餘的 chevron 拿掉避免 UX 訊號矛盾。

### Migration

Dev / prod 兩邊都要手動跑（`npm run db:migrate` 視 `.env.local`）：

```sql
ALTER TABLE "CashTransactions" ADD COLUMN "notes" text;
```

## [0.11.4] - 2026-05-09

### Added
- **`AssetListItem` 六種愛物類型 tint + 「儲蓄」badge**（PR #30，closes #28）：`app/globals.css` 新增六色 CSS vars（`--asset-tint-{house,car,child,pet,plant,insurance}`）；`AssetListItem` 圖示框由 `--surface-alt` 改為 per-type tint，每列再加 3px 左側 accent rail 同色系。`InsuranceDetails.insurance_type === 'savings'` 時 subtitle 列顯示 11px monospace 「儲蓄」badge（`--saving-soft` 底 / `--saving` 字）。`listAssetsForGroup` LEFT JOIN `InsuranceDetails` 暴露 `insuranceType`，`page.tsx` 推導 `isSavings` 並串到 `AssetsListClient` → `AssetListItem`。

### Fixed
- **`public/og-image.png` 從 768 KB 壓到 95 KB**（PR #29，closes #25）：原圖超過社群平台 ~300 KB 抓取上限，導致 Twitter / Facebook 預覽 fallback 為無圖。用 ImageMagick 256-color palette quantize（`magick og-image.png -strip -colors 256 -define png:compression-level=9 og-image.png`），壓縮 ~88%；視覺檢查設計師原稿的顆粒質感、雙人剪影、Futari wordmark 在預覽尺寸下無 banding。`app/layout.tsx` metadata 路徑不變。

## [0.11.3] - 2026-05-08

### Added
- **`app/robots.ts`**：用 Next 16 `MetadataRoute.Robots` 動態生成；`Allow: / /sign-in /terms /privacy`、`Disallow: /dashboard /setup /invite/ /auth/ /api/`，宣告 `Sitemap` 與 `Host`。
- **`app/sitemap.ts`**：含 `/sign-in`（priority 1.0、含 4 語 hreflang alternates）、`/terms`、`/privacy`（priority 0.3）。
- **`/sign-in` 結構化資料 `SoftwareApplication` JSON-LD**：含 `applicationCategory: FinanceApplication`、`featureList`（雙人共享記帳／費用自動分攤／資產盤點／保險／油耗等）、`offers: 0 TWD`、`inLanguage: zh-TW/zh-CN/en/ja`，給搜尋引擎結構化訊號。
- **品牌語意 heading**：`/sign-in` 的「Futari」品牌字由 `<div>` 改為 `<h1>`，內含 `sr-only` 副標「· 兩個人的家計簿｜伴侶／夫妻共享記帳 PWA」+ 頁底 sr-only 描述段；視覺零變化，搜尋引擎可正確判斷頁面主題。

### Changed
- **`middleware.ts` matcher 排除 `/robots.txt` 與 `/sitemap.xml`**：原 matcher 已排除 `manifest.json` 與圖片，但漏了 SEO 兩個關鍵檔案，導致 unauthed 爬蟲被 307→`/sign-in`，等同沒 robots.txt / sitemap.xml。
- **`app/layout.tsx` metadata 全面重寫**：
  - title：`Futari · ふたり 家計簿` → `Futari · 兩個人的家計簿｜伴侶／夫妻共享記帳`
  - description：25 字 → 100+ 字密集涵蓋伴侶／夫妻／共享／分攤／AA／資產／保險／油耗／PWA／台灣等關鍵字
  - 新增 `keywords`（22 個目標長尾詞，Bing/百度有讀）
  - 新增 `alternates.canonical: /sign-in` + 4 語 `hreflang`
  - 新增 `robots: { index, follow, googleBot: { 'max-image-preview': 'large' } }` 顯式宣告
  - `openGraph.url` 由 `/`（會 307）改為 `/sign-in`、加 `alternateLocale`、`og:image:alt` 含關鍵字
  - Twitter card 同步描述與標題

### SEO impact
- 對外可見項目：實際 GET `/robots.txt`、`/sitemap.xml` 改為 200 帶內容（原為 307）；`/sign-in` 帶完整 meta + JSON-LD + 語意 `<h1>`。
- 限制：站內仍只有 `/sign-in` 一個公開可索引頁；要拉 SEO 流量天花板需要日後另開 `/` 公開 landing（非本版範圍）。

## [0.11.2] - 2026-05-08

### Performance
- **CSS bundle 瘦身：drop unused font weights**（`b315565`）：稽核 `app/` / `components/` / `lib/` 後確認 `font-bold` / `fontWeight: 700` 與 Fraunces weight 600 完全無 caller。Noto Sans TC 每個 weight 因 Google Fonts 以 unicode-range 切片發送（即使指定 `latin` subset 也會帶全部 ~105 個 `@font-face`），單一未用 weight 就讓 font CSS 膨脹 ~25%。Noto Sans TC 4→3 weights、Fraunces 3→2 weights，主 font CSS chunk 397 KB → 298 KB raw（-25%）／ 144 KB → 108 KB gzipped。視覺零變化。
- **`/settings` RSC fetch 並行化**（`da9309c`）：`getCurrentUser` + `getLocale`、`viewerProfile` + group queries 原本串行；改為各自獨立的兩組 `Promise.all`，省掉短查詢 ~30–80ms 的等待 + `getLocale` 的 cookie 讀取延遲。
- **BottomNav full prefetch**（`a46d676`）：Next 16 中 `prefetch={undefined}` 在 dynamic route 上只預取到最近的 `loading.js` 邊界，導致 `/records` 切換時 skeleton 已預取但 `listFeedAllPaged` 仍在 click 後才跑、可見一段卡頓。改 `prefetch={true}` 在 `requestIdleCallback` 觸發時預取完整 RSC payload（含資料）。PR #2 的 idle gating 保留。
- **`/assets` batch GROUP BY query**（`2ecfeda`）：原本 N 個 asset 各跑一次 `getAssetSummary`（N×round-trip）；新增 `getAssetSummariesBatch`，用單一 `SUM ... GROUP BY asset_id` 取代。清單頁 batch summary + childNicknames + per-car heroStats 全部並行，項目同步組裝。N 個 asset 由 N 次 round-trip 縮為 1 次，節省 (N-1)×~30–80ms。Friend test 典型 5–8 個 asset → `/assets` RSC 預期省 120–560ms。詳情頁 single 版 `getAssetSummary` 保留，測試不受影響。

## [0.11.1] - 2026-05-08

### Fixed
- **`middleware.ts` Locale 型別僅 2 語 → 修補為 4 語**：原本 `type Locale = 'zh-TW' | 'en'` 與本地 `isLocale()` 只允許 2 語，`?lang=zh-CN` / `?lang=ja` 經 middleware 靜默丟棄。將常數抽成 edge-safe 模組 `lib/i18n/locales-meta.ts`（不 import `next/headers`），middleware 與 `lib/i18n/t.ts` 共同匯入；4 語 query param 入口現全部正常持久化。

### Changed
- **i18n Date helpers 改用 `Intl.DateTimeFormat(locale)`**：`dateLabel` / `weekday`（`lib/local-date.ts`）與 `monthLabel`（`lib/groupByMonth.ts`）由硬寫中文字串改為 `Intl.DateTimeFormat(locale, options).format()`，隨語系正確顯示日期格式。`TranslationsProvider` 新增 `locale` prop；`useLocale()` hook 供 client component 使用。影響元件：MonthSection、DateField、SettlementSheet、SettlementForm、AssetSheet。

### Performance
- **Pages 改用 `getSession()` 跳過 Auth API 往返**（PR #1，已 merge origin/main）：`middleware.ts` 仍用 `auth.getUser()` 作為 trust boundary；page / layout server component 改用 `lib/supabase/server.ts` 的 `getCurrentUser()`（內部 `getSession()`），省每頁 200–400ms HTTP 往返。Server actions 維持 `getUser()`。10 個 page / layout 改寫。
- **BottomNav 延遲 prefetch + Dashboard Suspense 邊界**（PR #2，已 merge origin/main）：冷啟動時不再 4 條 RSC prefetch 同時打；Hero balance 先 paint、feed 後到。

### Added
- **i18n 4 語架構**（PR #3 / #4 / #6 / #7，已 merge origin/main）：自製 `lib/i18n/`（server `getTranslations()` → dashboard layout `<TranslationsProvider>` → client `useTranslations()`）；cookie-based locale（`lang` cookie + `?lang=` query 入口）；4 語 zh-TW / zh-CN / en / ja；dashboard / records / settings / assets 字典已接通；sign-in footer + Settings 頁 LanguageSwitcher（footer / pill 兩變體）。詳見 [i18n-design.md](docs/superpowers/specs/i18n-design.md)。
- **Settings 離線瀏覽 toggle UI**（PR #6，已 merge origin/main）：`lib/offline/preference.ts` localStorage helper + Settings 頁 toggle。**僅 UI 層 ship；SW / runtime cache / banner 等仍 backlog**。詳見 [offline-browsing-design.md](docs/superpowers/specs/offline-browsing-design.md)「實作狀態」段。

## [0.10.0] - 2026-05-08

### Security
- **孩子愛物身分證／健保卡欄位端到端加密**：`childDetails.id_number_encrypted` 與 `insurance_id_encrypted` 過去寫入未呼叫 `encrypt()`、讀取也直接以 plaintext 送 client；本版補上加密／解密、改以 `revealChildPii` server action 按需解密、詳情頁以 `●●●●●●●●●●` 遮蔽（顯示／隱藏 toggle）、編輯頁改為「留空＝不變更／清除按鈕＝清為空／輸入＝加密後覆蓋」三態語意。dev / prod 兩個 Supabase project 既有 plaintext 已 wipe 為 NULL，本版本不需資料 migration。

### Added
- **MiniCalendar 兩級 year/month nav**：費用紀錄 / 進帳 / 結算 / 加油的 datepicker header 可點 → Months view（12 月份格 + 年份左右箭頭）→ 再點 → Years view（10 年格 + 十年左右箭頭）。原有月份左右箭頭保留。
- **孩子愛物自訂備註**：`Assets.notes` 新增 nullable text column；6 種愛物（車 / 孩子 / 寵物 / 植物 / 房子 / 保險）的詳情頁與編輯表單統一加備註區（textarea + `whitespace-pre-wrap` 顯示），上限 2000 chars，trim 後空字串視為 null。
- **進帳 pending 指示器**：未確認的定期進帳數 > 0 時，於 ModeTogglePlaceholder 的「進帳模式」tab 顯示薄荷綠小圓點。三條 hero 路徑（BalanceHero / Dashboard solo-dismissed / SoloBanner）均接通，banner 開／關都一致。

### Changed
- **小孩愛物暱稱優先顯示**：詳情頁 hero 與愛物清單改用 `childDetails.nickname` 為主、`assets.name`（法定名）退為小灰字。暱稱為空時 fallback 法定名。保險「被保人」欄位維持 free text 不動。
- **健保卡輸入格式 4-4-4**：`AssetSheet` 健保卡輸入 placeholder 改為 `0000 0000 0000`，`onChange` 自動每 4 位插空格、上限 12 位數字（顯示 14 chars），`inputMode="numeric"`。不擋送出，順「陪伴 > 評判」原則。
- **PendingIncomeStack 預覽收斂**：首屏預覽從 3 筆改為 2 筆，搭配「展開全部」按鈕；同時修正 expand 標籤 off-by-one（顯示正確的剩餘筆數）。
- **SavingsHero 視覺微調**：sub-copy 字級 12px → 14px、進度條高度 8px → 10px。

### Database
- `Assets.notes` 新增 nullable text column（`drizzle/0020_assets_notes.sql`）。dev / prod 整合時各跑一次 `npm run db:migrate`。

## [0.9.0] - 2026-05-08

### Added
- **保險 SavingsView**：儲蓄型保單詳情頁全新視圖（`insuranceType = 'savings'`）
  - 雙 bar hero：入（累計繳 / 估應繳總額）+ 出（已拿回 / 估滿期金），暖句隨進度切換
  - 合約進度條（時間軸 timeline）
  - 繳費紀錄 + 拿回紀錄（分頁）
  - Trigger UX：30 天前 `MaturingSoonPrompt`、滿期未收 `MaturedAwaitingPrompt`（含一鍵記滿期金）
  - 「記滿期金 +」section header 按鈕（returnRatio ≥ 1.05 時自動隱藏）
  - 非 savings 險種 fallback 到 `InsuranceDetailClientLegacy`（維持原樣）
- **`expected_maturity_amount` 欄位**（migration 0015）：儲蓄險預估滿期金，nullable
- **`computeSavingsProgress` helper**（`lib/insuranceProgress.ts`）+ 14 unit tests，覆蓋全部 edge cases
- **`AssetSheet` savings 險種**：picker 加入「儲蓄」選項，conditionally render 預估滿期金欄位
- **`IncomeSheet` prefilledCategory / prefilledAmount props**：供 MaturedAwaitingPrompt 一鍵預填

### Fixed
- **保險詳情頁 hero 橫線**：`InsuranceDetailClientLegacy` header 與 hero 之間的 subpixel gap，導致外層 `var(--bg)` 透出形成暗線；以共同父層 div 包住消除間隙

### Chore
- **Spec 文件 doc-keeper**：8 個 spec 由版本前綴命名改為穩定 topic 命名（e.g. `0_7_0-insurance-detail-design.md` → `insurance-design.md`）；移除完成狀態表、路徑表、已 ship 驗收 checklist；CLAUDE.md spec 索引對應更新；`.claude/settings.local.json` 移除舊允許路徑

## [0.8.1] - 2026-05-08

### Added
- **愛物清單分群**：`/assets` 頁面依「財產 / 生命體 / 保障」分群顯示，各群組附標題
- **House hero card**：入住天數統計（`movedInAt` 起算至今）
- **定期收入「改一下」wiring**：`editAndConfirmPending` 完整串接 — 點「改一下」開 IncomeSheet 預填全欄（amount / category / recipient / occurredAt / source / assetId），送出時同步 confirm pending（原子性）
- **DayPicker 元件**：7 欄 × 5 列格狀日期選取，加 `aria-pressed` / `aria-label` 無障礙標記
- **RecurringRuleSheet**：定期收入新增 / 編輯 bottom sheet，取代原本的獨立全頁表單

### Changed
- **定期收入設定頁架構重整**：`/settings/recurring-income` 改為 server component（`RecurringIncomeContent` client shell）；`/new` 和 `/[id]` sub-routes 廢除，改 redirect 回列表；`RuleListItem` 點擊即開 sheet，移除 inline 按鈕；`RuleForm.tsx` 刪除
- **Insurance / House 詳情頁 hero**：統一樣式（Insurance 顯示保障剩餘天數 / House 顯示入住天數）

### Fixed
- **定期收入 Pending Realtime**：INSERT / UPDATE event 拆分，解決 partner 確認 pending 時的 race condition
- **IncomeSheet race guard**：pending 模式下若 pending 已被 partner confirm，submit 時正確回應「已被處理」
- **Income design critique P0+P1**：IncomeSheet / Dashboard income mode 細節修正

### Schema（雲端發票基礎建設，無 user-facing UI）
- 雲端發票匯入 schema 預置：`InvoiceCredentials` table + `cashTransactions.invoiceNumber`（migrations 0017-0019）— 功能因財政部 API 申請限制暫緩，不對使用者顯示

## [0.8.0] - 2026-05-07

### Added
- **自訂定期收入（Phase 1）**：定期收入規則 + 待確認卡片 preview→commit 模型
- **`RecurringIncomeRules` + `PendingIncomeOccurrences` schema** + RLS + Realtime publication
- **`compute_next_occurrence` SQL helper**（PL/pgSQL，含月底 day clamp）
- **pg_cron `generate-pending-income`**：每日 16:00 UTC 跑（= 台北 00:00），idempotent
- **8 個 server actions**：`createRule`、`updateRule`、`pauseRule`、`resumeRule`、`softDeleteRule`、`confirmPending`、`editAndConfirmPending`（Phase 2 wiring 預留）、`skipPending`
- **`computeNextOccurrence` / `snapToFuture` / `firstAnchorFromStart` TS helpers**（mirror SQL function）
- **設定頁 `/settings/recurring-income`**：規則列表 + 新增/編輯，pause/resume inline toggle
- **Dashboard 進帳模式 pending card stack**：「就這樣 / 跳過」兩動作（「改一下」延後 Phase 2）
- **Realtime 同步**：partner 端建立/編輯規則、確認/跳過 pending 都即時刷新
- **`cleanup-soft-deleted` cron** 擴充：規則 1 年後物理刪、skipped pending 90 天後物理刪

### Changed
- 新增 `docs/superpowers/specs/0_8_0-recurring-income-design.md` — 自訂定期收入完整設計 spec
- 重命名 spec：`0_8_0-cloud-invoice-design.md` → `0_9_0-cloud-invoice-design.md`（cloud invoice 改排到 v0.9.0）
- 重命名 spec：`0_8_0-insurance-detail-design.md` → `0_7_0-insurance-detail-design.md`（保險 savings framing 實際在 v0.7.0 ship）

## [0.7.0] - 2026-05-06

### Added
- **進帳（Income）**：IncomeTransactions schema、RLS、Realtime、pg_cron cleanup
- **進帳 categories**：獨立 income category 定義 + mint palette token
- **進帳 server actions**：create / edit / softDelete + loadMoreIncomes
- **進帳 UI**：IncomeSheet（slide-up、category chips、policy picker、numpad）
- **Dashboard mode toggle**：支出 / 進帳模式切換；IncomeHero card
- **Records tab bar**：全部 / 支出 / 進帳三分頁 + income row mint glow
- **進帳 Realtime**：subscribe IncomeTransactions，partner 操作立即同步
- **月淨額**：Records 全部 tab 月份 header 顯示「進帳 − 支出」
- **Records income rows**：點擊直接開 IncomeSheet 編輯模式
- **愛物 Onboarding Hint**：Pet / Child / Plant / House 詳細頁首次使用提示卡
- **insurance↔vehicle 雙向關聯**：InsuranceDetails 加入 vehicleId FK，兩端詳細頁互相顯示

### Changed
- **typography tokens**：新增 `--fs-*` scale，統一替換全站 inline fontSize / `text-[Xpx]`
- **EditTextSheet**：改為 bottom sheet，支援 keyboard push-up
- **bottom sheet radius**：統一頂角 24px
- **Avatar bg**：改用 `--ink` token，移除 `--me-color` / `--them-color` aliases

### Fixed
- vehicleId FK 驗證：保險只能關聯自己 group 的車
- income Dashboard feed：CompactRow `kind=income` 型別問題
- Records sticky header + tab bar 捲動時保持可見
- FuelLogs pg_cron cleanup 因 migration 順序導致的 regression

---

## [0.6.0] - 2026-05-06

### Added
- **House**：schema、migration、getHouseDetails query、validateHouseInput、createHouse / editHouse server actions、HouseDetailClient 頁面
- **Insurance**：InsuranceDetails schema、CRUD actions、InsuranceDetailClient 頁面
- **愛物列表**：房子 / 保單 collapse 在「更多」下方 + house icon
- **AssetIcon**：insurance variant（shield+check）
- **Asset Switcher**：詳細頁跨愛物快速切換（名稱變 switcher trigger）
- **UI 統一**：所有詳細頁 name size / 30px height / back-name-edit-switcher 一致

### Changed
- 車輛 / 愛物詳細頁 hero：移除全色帶，改用左側 accent stripe
- 愛物列表：左側 accent stripe + dashed echo + inline mark

### Fixed
- AssetSheet 高度改用 fixed height（移除 maxHeight）
- InsuranceDetailClient 補上 edit pencil
- 各詳細頁補上 BottomNav + AddSheet
- car detail back arrow、aibutsu hero padding、AgeDisplay 尺寸

---

## [0.5.0] - 2026-05-05

### Added
- **Child**：ChildDetailClient，年齡統計 + 身分證欄位
- **Pet**：PetDetailClient，年齡 + 健康資訊；三態性別 toggle（公 / 母 / 不明）
- **Plant**：PlantDetailClient，species / location / sproutedAt / waterEvery chips
- **Aibutsu 擴展 schema**：ChildDetails / PetDetails / InsuranceDetails 表
- **validators**：validateChildInput / validatePetInput / validatePlantInput / validateInsuranceInput
- **server actions**：createChild / editChild、createPet / editPet、createInsurance / editInsurance、createPlant / editPlant
- **AibutsuHeader**：tinted 詳細頁 header，各類型色系
- **AssetSheet**：type picker + child / pet / insurance 各類型表單欄位
- **child / pet / plant 圖示**：AssetIcon 新增 paw + plant SVG
- **asset-switcher**：Child / Pet / Plant 詳細頁支援編輯、transactions、switcher
- **CarHeroCard**：單車 / 多車 layout（B1 car list）

### Changed
- 「資產」全面改名為「愛物」（UI 顯示層）
- AssetSheet type picker 支援所有愛物類型

### Fixed
- asset_type enum 補上 pet + plant
- `listAssetsForGroup` 不再限制 type='car'

---

## [0.4.0] - 2026-05-05

### Added
- **FuelLog schema**：FuelLog table reshape + cashTransactions.fuelLogId + carDetails.primaryUser / fuelType
- **FuelLog CRUD**：createFuelLog（雙寫 FuelLog + CashTransaction）、editFuelLog、softDeleteFuelLog
- **油耗計算**：singleEcon + computeAvgEcon（近 6 個月均值）
- **primaryUser helper**：從車輛 primaryUser 自動帶入 paidBy + splitType
- **FuelLog UI**：FuelRow + ActionBar + NewFuelLog sheet + 詳細頁 fuel timeline
- **誰付的 + 分攤方式**：NewFuelLog 表單新增欄位
- **FuelLog Realtime**：AssetDetailClient 訂閱 fuel-log-changed
- **車輛擴展欄位**：color / year / brand / model / initialOdometer，AssetHero 顯示 brand/model/year
- **色彩選擇器**：car form color picker，存 hex

### Changed
- 車輛詳細頁 layout：edit pencil 移到名稱旁，其他花費進 timeline header，加油 FAB 回歸
- 加油 station 欄位移除

### Fixed
- fuelType：移除 electric，改為 92 / 95 / 98 / diesel

---

## [0.3.0] - 2026-05-05

### Added
- **Assets（愛物）DB**：Assets table + CarDetails + RLS policies + Realtime publication
- **validateCarInput**：購買日期、金額驗證
- **Car server actions**：createCar（含購車自動產 CashTransaction）/ editCar / softDeleteCar
- **Car queries**：list、get、summary、paged transactions
- **/assets 列表頁**：空狀態 + accent FAB
- **/assets/[id] 詳細頁**：hero + scoped feed
- **AssetSheet**：car create / edit / delete bottom sheet
- **AssetIcon / AssetEmptyState / AssetListItem**：基礎元件
- **AssetPickerSheet**：AddSheet 內的關聯資產選擇
- **AddSheet 關聯資產**：wire 關聯資產 picker + zombie label
- **Assets Realtime**：subscribe Assets table + asset-changed event
- **BottomNav**：fabVariant prop + /assets routing
- **品牌資產 handoff**：icons / favicon / OG 圖片
- **OG metadata**：`/terms`、`/privacy` 頁面
- **PWA Install Guide**：platform-aware 加到主畫面說明 Sheet
- **component refactor**：PayerToggle / SplitTypeSelector 抽出共用；Realtime payload 全面型別化

### Fixed
- editTransaction 補上 soft-delete `.returning()` race guard
- addsheet：切換資產時清除舊 assetInfo

---

## [0.2.0] - 2026-05-03

### Added
- **Onboarding**：兩步驟建帳本流程（建立 → 邀請 / 跳過）、品牌化 welcome screen
- **Solo Mode**：SoloBanner 取代 BalanceHero；AddSheet 隱藏 payer / split UI，強制 all_mine
- **Solo dismissable banner**：關閉後 Settings 仍保有邀請入口
- **預設分攤偏好**：Settings inline radio + updateDefaultSplitType server action
- **Web Share API**：複製連結 fallback
- **Realtime**（Phase 1e）：RealtimeProvider + event bus；BalanceHero cross-fade；TransactionFeed prepend + highlight on INSERT
- **pg_cron**：每週日 03:00 物理刪除 `deleted_at > 1 year`
- **filter 篩選**（Phase 1d）：FilterSheet + 伺服器端 UNION filter（誰付 / 分攤 / 分類）
- **Settings 頁**（Phase 1d）：帳本名稱 / 顯示名稱編輯、Google 大頭貼、登出
- **Settlement**（Phase 1c）：BalanceHero 展開 SettlementForm + 智慧 chip；tap row 可編輯 / 刪除
- **Records 頁**（Phase 1b）：`/records` 分月份列表 + 分頁載入
- **editTransaction**（Phase 1b）：tap CompactRow → AddSheet edit / delete mode
- **Server Action 整合測試**：transaction / settlement / group / profile

### Fixed
- RLS SELECT policies 讓 Realtime 正常讀取
- OikosGroups Realtime publication idempotent migration
- MiniCalendar 月份導航
- WCAG zoom / SPA nav / invite error / OAuth redirect 參數保留

---

## [0.1.0] - 2026-05-03

### Added
- **專案骨架**：Next.js 16 + Supabase + Drizzle ORM + Tailwind CSS v4 + Vitest
- **AES-256-GCM**：加密工具（key 在 Vercel env，DB 只存 ciphertext）
- **Google OAuth**：sign-in + callback route + auth middleware
- **Drizzle schema**：Profiles / OikosGroups / GroupInvites / GroupBalance / CashTransactions / Settlements
- **RLS policies** + Profiles trigger
- **Group 建立流程** + Balance 初始化
- **Invite flow**：token 驗證 + 7 天 expire + group-full guard
- **PWA manifest** + meta tags
- **Futari 品牌**：design tokens、字型、manifest
- **Dashboard**：BalanceHero + 最近紀錄 + load-more（TransactionFeed）
- **AddSheet**：完整表單（金額 / 說明 / 分類 / 誰付 / 分攤 / 日期 + numpad + MiniCalendar）
- **createTransaction / softDeleteTransaction**：atomic + GroupBalance 重算
- **底部 Nav**：4 tabs + center FAB
- **FutariMark / Avatar / CategoryChip** 基礎元件
- **Balance math**：pure 函式 + viewer-flipped perspective
- **Settlement chip math**：快速還款金額計算

---

[Unreleased]: https://github.com/redtear1115/oikos/compare/v0.13.0...HEAD
[0.13.0]: https://github.com/redtear1115/oikos/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/redtear1115/oikos/compare/v0.11.4...v0.12.0
[0.11.4]: https://github.com/redtear1115/oikos/compare/v0.11.3...v0.11.4
[0.11.3]: https://github.com/redtear1115/oikos/compare/v0.11.2...v0.11.3
[0.11.2]: https://github.com/redtear1115/oikos/compare/v0.11.1...v0.11.2
[0.11.1]: https://github.com/redtear1115/oikos/compare/v0.10.0...v0.11.1
[0.10.0]: https://github.com/redtear1115/oikos/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/redtear1115/oikos/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/redtear1115/oikos/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/redtear1115/oikos/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/redtear1115/oikos/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/redtear1115/oikos/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/redtear1115/oikos/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/redtear1115/oikos/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/redtear1115/oikos/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/redtear1115/oikos/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/redtear1115/oikos/releases/tag/v0.1.0
