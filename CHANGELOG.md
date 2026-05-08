# Changelog

All notable changes to Oikos (Futari) are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

### Backlog
- i18n Assets 詳情頁 + AssetSheet 翻譯（~40 fields）
- i18n 設定子頁（`recurring-income` / `invite` / `coming-soon`）
- 離線瀏覽 SW 實作（Serwist + runtime cache + `/offline` page + banner + sign-out cache clear）

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
- **Settings 離線瀏覽 toggle UI**（PR #6，已 merge origin/main）：`lib/offline/preference.ts` localStorage helper + Settings 頁 toggle。**僅 UI 層 ship；SW / runtime cache / banner 等仍 backlog**。詳見 [2026-05-08-offline-browsing-design.md](docs/superpowers/specs/2026-05-08-offline-browsing-design.md)「實作狀態」段。

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

[Unreleased]: https://github.com/redtear1115/oikos/compare/v0.10.0...HEAD
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
