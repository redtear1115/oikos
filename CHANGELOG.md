# Changelog

All notable changes to Oikos (Futari) are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

_Nothing unreleased yet._

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
- 新增 `docs/superpowers/specs/0_9_0-recurring-income-design.md` — 自訂定期收入完整設計 spec

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

[Unreleased]: https://github.com/redtear1115/oikos/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/redtear1115/oikos/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/redtear1115/oikos/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/redtear1115/oikos/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/redtear1115/oikos/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/redtear1115/oikos/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/redtear1115/oikos/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/redtear1115/oikos/releases/tag/v0.1.0
