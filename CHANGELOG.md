# Changelog

All notable changes to Oikos (Futari) are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

每版分兩小節：
- **使用者可見變化** — 使用者實際感知到的功能 / 修正，一句話、不寫技術細節
- **技術變更** — 技術決定、重構、schema migration、breaking change（沒有的話省略）

---

## [Unreleased]

### 使用者可見變化
- _尚無_

### 技術變更
- _尚無_

## [0.16.1] - 2026-05-13

主題：**守護後的細節收尾．角色色 × 收入篩選 × 被保人自己/對方 × 兩條清理**——v0.16.0 把守護模組獨立化、設定頁重新分組、愛物模板與篩選分組一次到位之後，這版專注收掉幾個 surface 上的小裂縫：守護 beta 開了之後愛物頁不該再讓你選保險（兩條建立保單路徑會回到 v0.15.x 的混亂）；Dashboard 切到收入模式時 filter 入口不見了（spec 早就講過要 parity，這版補實作）；雙人帳本的頭像顏色從「以你視角左/右」改成「以絕對角色」（深咖啡 / 橘對到愛心 icon 兩瓣，跨頁面看到的我永遠是同一個顏色）；被保人原本只能選孩子愛物或自行輸入文字，這版把 schema 早就埋好的 group member FK 接到 UI，補上「我 / 對方」兩個選項；支出列每列右上的「我 $X」徽章在單人視角是冗餘訊息，拆掉留純粹。

完整 diff：[v0.16.0...v0.16.1](https://github.com/redtear1115/oikos/compare/v0.16.0...v0.16.1)

### 使用者可見變化

#### 守護開了之後，愛物頁不再 surface 保險（PR #241 closes #236）
- **愛物 FAB → TypePicker 不再有「保險」選項**：v0.16.0 第一輪在 ON 時把保險 tile 放進「更多」展開區，導致同時存在兩條建立保單路徑（愛物 FAB → 保險 vs 守護 tab FAB → 保險），心智上回到 v0.15.x 那種「保險到底屬於愛物還是守護」的混亂。這版直接把保險從 TypePicker 完全拿掉。
- **守護 tab FAB 改直接開保單 sheet**：守護 tab 是進入保險的唯一前門，按 FAB 不再多看一頁 TypePicker（裡面也沒有它了），AssetSheet 直接 mount `InsuranceSheetBody`。既有保單編輯流程不動。

#### Dashboard 收入模式補上 filter 入口（PR #242 closes #235）
- **Dashboard 切到收入模式，「篩選 ›」按鈕現在會出現**：v0.15.0 lite-mode FilterSheet 從一開始就是 mode-agnostic 的設計，但 Dashboard 實作把按鈕用 `mode === 'expense' &&` 包起來、收入 loader 也是 module-level 拿不到 filter 物件——切到收入模式 entry point 整個消失。修掉之後 expense / income 兩個 mode 走同一條 filter wire：payer / 金額範圍 / status 都能套，套了之後 feed 立刻收斂。
- 維度顯示沿用既有 lite-mode 規則（payer / amount / status 顯示，date / 愛物 / 分類 hidden），跟支出側一致。

#### 頭像顏色改為依絕對角色（PR #243 closes #238）
- **`member_a` 永遠是深咖啡（`--ink` #3A2419），`member_b` 永遠是橘色（`--accent` #E08856）**：兩個顏色已經是 `FutariMark` 愛心 icon 的兩瓣，這版把同一份 brand token 跨頁面套到所有頭像。先前是 viewer-relative —— 自己看自己永遠是某一色，看對方永遠是另一色，但雙方各自打開 Futari 看到的「自己 / 對方」恰好相反，跨裝置截圖比對會錯亂。改成絕對角色之後，兩個人在任何頁面看到同一個成員的頭像都是同一個顏色。
- 影響範圍涵蓋 BrandHeader / BalanceHero / 支出列付款人頭像 / PayerToggle / IncomeSheet recipient toggle / Settings 成員列表 / SoloBanner 佔位頭像 / 月度回顧編輯器與過去訊息，13 個 callsite 全部對齊。

#### 支出列拿掉「分擔的我」徽章（PR #240 closes #239）
- **支出列右上不再顯示「我 $X」/「對方 $X」徽章**：Futari 是單人視角的 app，每列已經有「你付」/「對方付」+ 金額 + pending badge，再多一塊「我這份是多少」的小徽章是冗餘訊息，視覺也讓 row 變擠。拆掉之後 row 回到純粹。資料層沒動——`split_type` / 比例還在，未來如果決定再呈現會走另一個位置。

#### 守護被保人支援自己/對方（PR #245 closes #237）
- **被保人 picker 補上「我」和「對方」兩個選項**：人身保險 / 旅平險 / 失能扶助這些常見的「被保人 = 自己或對方」情境，原本只能當成 freeform 文字填，FK 接不回 group 成員。這版把 schema 早就埋好的 `insured_user_id` 接到 UI，picker chip row 在現有的 Child 愛物 chips 與「自行輸入」之間多出「我」+「對方」（solo mode 隱藏「對方」）。
- **四個來源互斥，列卡與詳情頁優先顯示成員 displayName**：被保人四個來源（自己 / 對方 / 孩子愛物 / 自行輸入）UI 上互斥，選任何一個都把其他三個清空；action 層 `resolveInsuredFields()` 以同樣的 precedence（孩子 > 成員 > 文字）再防一層，DB 永遠只留一份真相。InsuranceListItem 與 SavingsView / InsuranceDetailClientLegacy 顯示時依同樣順序選 displayName。

### 技術變更

- **TypePicker 移除保險 + 守護 FAB 跳過 TypePicker**（PR #241 #236）：`TypePicker.tsx` 從 `SECONDARY_TYPES` 拿掉 `'insurance'`；`AssetSheet/index.tsx` 對 `initialType='insurance'` 的開啟流程跳過 TypePicker、直接 render `InsuranceSheetBody`。Server-side `createInsurance` 仍 throw `guardian_disabled` 作為防線。Edit flow 不動（`/assets/[id]` 對既有保單照常編輯）。詳見 [guardian-design.md](docs/superpowers/specs/guardian-design.md) 的「為什麼保險不在愛物 TypePicker」取捨小節。
- **Dashboard 收入模式 filter wire**（PR #242 #235）：`Dashboard.tsx` 拿掉 `mode === 'expense' &&` gate；`DashboardFeed` 的 income loader 改 `useMemo` 包進元件內，closure 帶住 filter ref，filter 變動時 ref 重建——`TransactionFeed` 既有的 filter-change refetch effect 自動接走。同 effect 順手擴成「有 custom loader 時 `loader(null)`、否則才走 cash-only `loadMoreTransactions`」；income 永遠 settled，`status='pending'` 透過既有 `cutAll` 規則 drop，無害。詳見 [structured-filter-design.md](docs/superpowers/specs/structured-filter-design.md) 的 lite mode 段落。
- **`Avatar` API: viewer-relative `who` → absolute `memberRole`**（PR #243 #238）：`Avatar.tsx` 的 prop 從 `who: 'M' \| 'T'` 換成 `memberRole: 'a' \| 'b'`，`bg` 直接讀 `--ink` / `--accent` brand token；`MemberContext` 加 `whoToMemberRole(who, viewerIsA)` helper 給仍以 viewer 視角思考的 callsite 用。13 個 callsite 全部更新；SoloBanner 的佔位頭像顯式設為 `memberRole='b'`（缺席的伴侶概念上 = member_b）。
- **`CompactRow` 移除 myShare 計算 + i18n key 清掉**（PR #240 #239）：刪除 `delta` / `myShare` / `showMyShare` / `myShareColor` derivation 與徽章 render；移除 4 語的 `compactRow.myShareLabel` key + zh-TW 的 shared interface 宣告。data layer 完全不動。
- **被保人接上 `insured_user_id` FK**（PR #245 #237）：`insurance_details.insured_user_id` 與 `insured_type='user'` discriminator 早就在 schema 內、`leaveGroup` 也已經依 `insured_user_id` 把保單帶走，但 form 一直沒 write path——這版補上**不需要 migration**。`actions/asset.ts` 新增 `resolveInsuredFields()` 把三個來源（child / member / text）收斂成一份正準，`assertInsuredUserInGroup()` 守 member FK 只能是 `member_a` / `member_b`；`InsuranceSheetBody` picker 加「我 / 對方」buttons，state 改成三個互斥 source；queries 加 `insuredUserProfile` LEFT JOIN 撈 displayName 給列卡與詳情頁。
- **Doc keeper pass**（commit 1 of release PR）：`guardian-design.md` Surface 表 TypePicker 行更新 + 新增「為什麼保險不在愛物 TypePicker」取捨段；`structured-filter-design.md` shipped_in 追加 v0.16.1 #235、lite mode 段落補 Dashboard 雙 mode parity。

## [0.16.0] - 2026-05-13

主題：**守護成為自己的模組．物品也記得進來．設定頁長出新分組**——v0.15.2 才把保險從愛物清單切到「守護」tab，這版直接把守護升格為獨立模組：per-group beta flag 控制可見性、單一 `canAccessGuardian()` 是將來付費層 cut-over 唯一要動的地方、beta 關掉時用一張友善的 GatedView 而不是 silent fallback。同期愛物模板系統 v1 ship 出「物品」這第七種 type，相機、單車、紀念物這些只想被記得、不需要任何後端行為的東西終於有地方去。設定頁重新分組成 帳本 / 成員 / 個人 / 應用 / 資料 / 守護 / 離開帳本，每個 toggle 都長在它該長的層級裡；篩選器愛物 chip 也按類型分成 sub-section，可以一鍵「全選車輛」「全選生命」。順手把 v0.15.0 那條 pending balance bug 也收掉。

完整 diff：[v0.15.3...v0.16.0](https://github.com/redtear1115/oikos/compare/v0.15.3...v0.16.0)

### 使用者可見變化

#### 守護模組獨立化（PR #225 closes #220 #221、PR #229 closes #227）
- **守護從愛物頁升級為獨立模組 + per-group Beta toggle**：保險不再是「愛物頁的另一個 tab」，而是「將來付費才能用的工具」的第一張卡。新帳本預設關閉；在 設定 → 守護（Beta） 一鍵打開，TabBar 的「守護」tab、TypePicker 的保險選項、`/records` 篩選器的守護 sub-section 同時出現。group-level flag 保證兩人視野永遠一致。
- **Beta 關掉時用 GatedView 取代 silent redirect**：先前 `/assets?tab=guardian` 會默默 fallback 回愛物 tab，`/assets/<insurance-id>` detail 頁會被 redirect 到 dashboard——關掉後分享連結 / 書籤 / 既有保單看起來像消失了。改成在原位顯示「守護目前是 Beta，到設定打開」一張溫和的卡，加 CTA → 設定。資料安全感維持、用戶知道東西還在。

#### 愛物模板系統 v1：物品（PR #226 closes #222）
- **TypePicker 加第七個選項「物品」**：相機、單車、紀念物這種「只想記得、不需要任何後端行為」的東西終於有地方去——選「物品」、填名稱 + 備註，就結束。**舊 6 種愛物（車 / 房 / 孩子 / 寵物 / 植物 / 保險）的建立與編輯流程完全沒變**。
- **愛物列表新增「物品」section**：與「財產 / 生命 / 守護」並列分組，每種愛物都有自己的光。

#### 設定頁重新分組（PR #228 closes #91）
- **設定頁按心智模型分成 7 個 section**：帳本（含分攤比例，從個人移過來——它本來就是 group 設定）→ 成員 → 個人（只剩 viewer-only 偏好）→ 應用（加到主畫面 / 語言 / 離線瀏覽，全 device/app 層級）→ 資料（定期收入 / 定期支出 / 過去的時光 / 匯出 / 資料安全）→ 守護（Beta）→ 離開帳本。每個 toggle 都長在它該長的層級裡。

#### 篩選器愛物分組（PR #230 closes #223）
- **`/records` 篩選器愛物 chip 按類型分 sub-section**：車輛 / 房子 / 生命（孩子 + 寵物 + 植物）/ 物品 / 守護 五個 sub-section，每個開頭一顆「全選」chip 可以一鍵把該類愛物全選 / 全取消，其他類不受影響。「我這個月所有車的支出」「最近半年所有生命的紀錄」終於不必逐個點。

#### 補修
- **「結算後」projection view 不再讓你按結算**（PR #224 closes #208）：先前在 結算後 view 按「結算」會把 settled + pending 的浮報金額帶進結算單，造成 `GroupBalance` cache 偏離 `±pendingDelta`，連續按下還會雪球（觀察到 3,610 → 36,103,610）。Fix：projection view 隱藏結算按鈕；想結算回到 現在 view（吻合 cache 的 settled-only 數字）。

### 技術變更

- **`OikosGroups.guardian_beta_enabled boolean NOT NULL DEFAULT false`**（PR #225 #220）：migration `0036_guardian_beta_flag.sql`；新 helper `lib/guardian.ts#canAccessGuardian(group)` 是唯一閘門，將來付費層只改該函式（`return hasSubscription(group) || group.guardianBetaEnabled`），所有 callsite 自動受益。`toggleGuardianBeta(enabled)` server action 透過 `requireViewerGroup()` 限定 group member 操作。
- **GatedView pattern**（PR #229 #227）：新增 `app/(dashboard)/_components/GatedView.tsx` + `InsuranceGatedClient.tsx`；`AssetsListClient` 對 `?tab=guardian` 而非 silent fallback、`/assets/[id]/page.tsx` 對 insurance asset 改 render Gated client 而非 `redirect('/dashboard')`；`createInsurance` server action 仍 throw `guardian_disabled` 作 defence in depth。
- **`asset_type` enum 擴充到 7 值 + `asset_template_key` enum + `Assets.template_key` + `Assets.template_fields jsonb`**（PR #226 #222）：migration `0036_asset_templates.sql`；舊愛物（`template_key IS NULL`）走原有 type → 子表路徑，模板愛物（`template_key IS NOT NULL`）一律 `type='item'` 走 `TemplateSheetBody` / `TemplateAssetDetailClient`，不接任何既有自動化（無 FuelLog 雙寫 / 無 InsuranceDetails / 無 cron）。v1 只宣告 `general` 模板（無欄位）；validator 已實作 text / number / date 三型別分支供未來模板擴充。
- **Settings UI 重組**（PR #228 #91）：i18n key `sectionDevice` → `sectionApp`（4 語同步），「分攤比例」block 從個人 section 搬到帳本 section、「加到主畫面 / 語言 / 離線瀏覽」收進新的應用 section。
- **FilterSheet 愛物 chip 分組**（PR #230 #223）：純 UI 層擴充，不動 URL / 資料模型 / SQL；「全選」chip 把該組 asset uuid 全部加進現有的 `fAssets` Set（語意冪等）。Share link 保留 snapshot 語意——之後新建同 type 愛物不會自動納入對方視圖。新增 i18n key `filterSheet.assetGroupSelectAll` + `filterSheet.assetGroup.{car,house,living,item,coverage}`（4 語）。
- **`isProjectionView` flag gates `canSettle`**（PR #224 #208）：`useBalanceWithPendingToggle` 派生 `isProjectionView = includePendingView && hasPending`；單一 derived flag，blast radius 為零（沒動 `debtAmount` / `createSettlement` 語意）。
- **Doc keeper pass**（commit 1 of release PR）：新增 `guardian-design.md`（守護模組獨立化的 WHY、`canAccessGuardian()` cut-over 計畫、GatedView vs silent redirect 取捨）；`aibutsu-design.md` 加 v0.16.0 chips；`product-design.md` schema 主要 tables 補 `guardian_beta_enabled` / `template_key` / 7 個 asset_type + spec links 補齊到所有 tracked spec；`CLAUDE.md` Domain Model 速查更新。

## [0.15.3] - 2026-05-13

主題：**章節邊界長進結構裡．過去章節變唯讀 + 投資型保單帳戶價值**——v0.15.0 才剛建立的關係章節（epoch）框架，這版把「pin 在過去章節時還能編輯紀錄、結果整筆從過去章節人間蒸發」這條 bug 收掉，並把背後的 read/write 兩端 epoch boundary 變成型別防呆，讓「transaction 完整歸屬於某段 epoch」從靠記憶變成結構性保證。同期把 v0.9.0 的儲蓄險詳情頁延伸到「投資型保單」家族——新增目前帳戶價值欄位，並讓保險可以自動產生 RecurringIncome 規則，滿期金 / 分紅金不再需要每次手動建。

完整 diff：[v0.15.2...v0.15.3](https://github.com/redtear1115/oikos/compare/v0.15.2...v0.15.3)

### 使用者可見變化

#### 過去章節 read-only（PR #207，closes #194/#195/#197/#198/#199/#200/#201/#202/#206）
- **過去章節整段變唯讀**：pin 在 past epoch 時，所有 transaction（cash / income / settlement / fuelLog）的編輯與刪除按鈕都隱藏；想動就回到當前章節。設計理由：過去章節是「已經發生的歷史」，不該被改寫；同時擋住「在過去章節點編輯 → 新 row 落到當前章節 window → 在過去章節 view 整筆紀錄消失」的 ghost migration bug。
- **Dashboard 本月進帳數值修正**：BalanceHero「本月進帳」總額先前在收錄模式（pin 在 past epoch）會吃進其他 epoch 的進帳，造成跨章節數字漂移；修掉後總額只算當下 view 的章節範圍。

#### 投資型保單帳戶價值 × 自動化（PR #212，closes #166）
- **投資型保單詳情頁顯示「目前帳戶價值」**：savings framing 新增一條 informational row，承載「投資型保單的當下市值」——與累計繳 / 已拿回兩條主軸數字並排但不混入，使用者根據對帳單自行更新。傳統儲蓄型保單沒這個概念，欄位空白不顯示。
- **保險可自動產生定期收入規則**：建立保單時若有設定預期滿期金 / 分紅，系統會自動建一條 `RecurringIncomeRule`，到期日由 cron 產 pending 卡片，使用者一鍵 confirm 落 IncomeTransaction；滿期金 / 分紅金不再需要每次手動建紀錄。

### 技術變更

- **`epochWindow` 型別防呆 across all transaction reads**（PR #207）：所有 transaction-class query（`listIncomesPaged` / `listIncomeMonthSummary` / `monthlyIncomeStatsByCategory` / 等價的 cash / settlement / fuelLog 查詢）改為 required `epochWindow` 參數，從 caller 強制傳入；先前 `listIncomeMonthSummary` 漏接 `epochWindow` 造成的 Dashboard 數值漂移從根本擋掉。
- **Write-side past-epoch guard**（PR #207）：`createTransaction` / `editTransaction` / `softDeleteTransaction` / `createIncome` / `editIncome` / `softDeleteIncome` / settlement / fuelLog 等所有 write server actions 加 past-epoch cookie 檢查，pin 在過去章節時直接 throw；同時 UI 收掉編輯/刪除按鈕作為第一道 guard。
- **`InsuranceDetails.account_value` 欄位新增**（PR #212，#166）：migration `0035_insurance_account_value` 加 `account_value integer NULL`（純加 nullable column、metadata-only DDL）；只對投資型保單 (`insuranceType === 'savings'` 且 isInvestmentLinked) 顯示。
- **`RecurringIncomeRules.source_type` / `source_ref_id` 跨 feature 來源欄位**（PR #212，#166）：在 `RecurringIncomeRules` schema 加上「這條規則是哪個 feature 自動產的」欄位，保險自動建立的規則會標 `source_type='insurance' / source_ref_id=<asset_id>`；後續刪除保單時可連動清掉對應規則。
- **Doc keeper pass**（PR #217）：epoch-readonly-design.md 從 design → shipped；recurring-income-design.md 補 v0.15.3 註腳；CLAUDE.md spec table 新增 epoch-readonly-design.md 一列。

## [0.15.2] - 2026-05-13

主題：**問答、跨章節與守護的下一步**——v0.15.0 才剛上線的關係章節（epoch）延伸成可跨 group 翻看的「過去」；保險脫離愛物清單獨立為「守護」tab、被保人也可以關聯 Child 愛物，讓保險紀錄真的長進了關係裡；PartnerQuiz 雙人異步問答 ship 出第一個小儀式；篩選器 v2 把金額範圍 + status 也納進來；底下三條 refactor（SQL predicate / AssetSheet 拆分 / auth/group 樣板統一）為之後的 v0.16 多幣別工作打底。

完整 diff：[v0.15.1...v0.15.2](https://github.com/redtear1115/oikos/compare/v0.15.1...v0.15.2)

### 使用者可見變化

#### 雙人陪伴
- **PartnerQuiz 雙人異步問答**（PR #187，closes #163）：兩人各自輪流回答關於對方的問題，答完才比對；想了解伴侶又不想直接問的小儀式。

#### 守護愛物升級
- **愛物頁加「愛物 / 守護」tab，保險併入守護**（PR #184，closes #178）：保險不再混在愛物清單裡，獨立為守護 tab，視覺與語意都跟其他愛物區分開。
- **保險被保人關聯 Child 愛物**（PR #180，closes #167）：保險詳情可指定被保人為自己 group 的 Child 愛物，`insured_child_id` wiring 建立 Child ↔ 保險的雙向關聯。

#### 紀錄與篩選
- **`/records` 結構化篩選器 v2：金額範圍 + status**（PR #185，closes #165）：篩選器加上金額區間（min/max）與 `settled / pending` status；URL-synced 可分享。
- **Balance toggle：settled vs include-pending**（PR #179，closes #164）：可切換 balance 只看已結算的金額，還是把 pending 簽帳也計入；對「信用卡這個月會扣多少」有具體判讀。
- **`/past-times` 跨 group 章節歷史**（PR #181，closes #141）：翻過去章節時不再被當前 group 鎖住，跨多段關係章節都看得到。
- **CompactRow 零分擔時 hide「我 $XXX」chip + 染色回復**（PR #182）：分攤 0% 那側不再硬塞 0 元 chip；分擔金額顏色從 PR #148 的灰恢復為支出紅 / 收入綠，掃讀時方向感回來。

### 技術變更

- **`PartnerQuizSessions` + `PartnerQuizAnswers` schema**（PR #187，#163）：新增雙人異步問答的 session + answer 兩 table，RLS + Realtime publication；migration `0034_partner_quiz`。
- **`InsuranceDetails.insured_child_id` FK → Assets**（PR #180，#167）：限制被保人指向同 group 的 Child 愛物；同步覆蓋 `validateInsuranceInput` 與 server actions。
- **`/records` filter schema 擴充**（PR #185，#165）：URL search params 新增 `amount_min` / `amount_max` / `status`；server-side WHERE clause 同步擴。
- **Refactor: SQL predicate helpers + `ListPagedOptions`**（PR #192，closes #188）：把分散在 query 層的 paged + filter 範本抽成共用 helpers；新增 `lib/db/queries/_predicates.ts` + 兩支 unit test。
- **Refactor: 統一 action / page auth/group 樣板 + 抽 revalidate helper**（PR #193，closes #190）：新增 `lib/auth/viewer.ts` + `lib/revalidate.ts`；server actions / pages 不再各自重複寫 auth + group lookup boilerplate。
- **Refactor: `AssetSheet` 拆成 per-type `*SheetBody`**（PR #191，closes #189）：原本一個巨大 sheet 拆成 Car / House / Child / Pet / Plant / Insurance 各自 body + 共用 shared/* 元件；之後新增愛物 type 不必動主 sheet。

## [0.15.1] - 2026-05-12

主題：**陪伴每處小細節更貼手．光的指認也更一致**——一輪跨頁 UX polish（Dashboard / Records / Assets list / 愛物詳情 / AddSheet 全家族），把這幾週累積的 UI/UX 審查回饋一次處理掉；底下用一份分類色 design token 把愛物與類別色彩收斂為「每個分類一個主色，chip tint 由主色推得」，鎖進「同一分類在哪都長同一個 hue」的承諾。

完整 diff：[v0.15.0...v0.15.1](https://github.com/redtear1115/oikos/compare/v0.15.0...v0.15.1)

### 使用者可見變化

#### 設計系統 / Token 收斂
- **分類色 design token 收斂**（PR #168，closes #149）：`lib/categories.ts` / `lib/incomeCategories.ts` 改為每個分類只宣告一個 primary `color`，chip 用的 `tint` 透過新增的 `lib/colors.ts#lightenHex()` deterministic 推導；`chart` 設為 `color` 的 alias，舊 callsite 不動。`globals.css` 同步把 `--asset-tint-*` 改寫成 `color-mix(in srgb, var(--asset-color-*) 35%, white)`，視覺值與先前一致但 6 個 asset type 也具備 `--asset-color-*` 主色 token，未來愛物 donut 可以對得上 list rail。設計理由：解決使用者在 feed icon 與 donut slice 之間缺乏顏色辨識的問題——同一分類在哪都長同一個 hue family。

#### Dashboard（PR #171，closes #146/#147/#148/#150）
- **BalanceHero 金額語意化**（closes #146）：對方欠你 → `--credit` 綠；你欠對方 → `--debit` 紅；平 → 中性；collapsed / expanded 兩種狀態都套用。
- **Settle 按鈕加標籤 + tap target ≥ 44px**（closes #147）：⇄ icon 旁加「結算 / Settle / 结算 / 精算」label；BalanceHero / MonthlyStatsView 共用的 `ToggleButton` 透過 `::before` 把點擊範圍擴到 44×44px，視覺環維持 28px。
- **CompactRow 常駐顯示「我的負擔」**（closes #148）：每筆紀錄都顯示「我 $XXX / You $XXX / 自分 $XXX」，從原本染色 delta 改為清楚的個人負擔金額；i18n key `compactRow.myShareLabel` 4 語譯齊。
- **Records feed 篩選按鈕降權**（closes #150）：標題列「篩選 ›」改 `font-normal` + `var(--ink-3)` 讓 section title 領主；active filter 小點仍保留作為視覺提示。

#### Records 頁 polish（PR #173，closes #151/#152/#153/#154）
- **月份切換箭頭 tap target ≥ 44px**（closes #151）：MonthSwitcher 的 `‹` `›` 按鈕從 36px 放大到 44px，符合 WCAG / iOS HIG 最小可點區域；容器 vertical padding 同步調整讓 pill 視覺高度維持原樣。
- **Donut chart 中央顯示總金額 + slice 切換**（closes #153）：先前總金額在圓圖下方一行小字，現在搬進 donut 圓心（serif 大字 + 標籤），第一眼即可讀；點任一 slice 或對應的 detail bar，圓心切換成該分類的金額與名稱，未選中的 slice dim 至 0.35 opacity。新增 i18n key `records.stats.donutCenterTotal`（4 語），移除已不再用到的 `records.stats.total`。
- **統計與 feed 之間視覺分隔強化**（closes #152）：stats section 的標題 weight 從 `font-medium` 升為 `font-semibold`；同時 #154 的 RecurringSectionCard 落在 stats 與 feed 之間，自然成為 section break。
- **「定期」入口從 popover 升為 section card**（closes #154）：原本標題列右側的 ⚙ 定期 popover 對 v0.13.0 才剛上線的功能來說太隱密，現在改為 stats 區塊與 feed 之間的橫向 section card，「定期支出」與「定期收入」各佔一個 44px 高的 tinted pill 連結；移除 `RecurringMenu` 組件與 `records.recurringMenuLabel` / `records.recurringMenuAriaLabel` i18n keys。

#### Assets list 頁 polish（PR #174，closes #158/#159/#160）
- **CarHeroCard 簡化**（closes #158）：list 卡片拿掉內聯平均油耗 stat，只放本月 / 累計 NT$（並排兩格），讓 list 維持 finance summary 定位；油耗詳情在 detail hero 已經有了。
- **InsuranceListItem 加付款倒數 badge**（closes #159）：多期保單（savings + multi-year protection）依 `startsAt + payCycle`（年 / 半年 / 季 / 月）計算下次扣款日，預設 `min(reminderDaysBefore, halfCycle)` 天內亮橘色 `繳費剩 N 天`；月繳保單因為門檻自動收斂到 halfCycle 不會永久亮燈，年繳走 30 天提醒。Savings 已滿期 / 單年期保單維持原本「繳費期滿 / 到期」徽章不重複。
- **Section headers 更清楚**（closes #160）：愛物分類標題改 serif `fs-button` 字級 + 各組 type tint 色點（house / child / insurance），取代原本不顯眼的 `xs ink-3` caption。

#### 愛物詳情 header 統一（PR #175，closes #161）
- **AibutsuHeader 採用 settings sub-page 三欄佈局**：`[← 返回] | [置中標題] | [編輯 ✎]`；移除 6 個 aibutsu 子頁面（Child / Pet / Plant / House / InsuranceLegacy / SavingsView）的 inline `AssetSwitcher`，跨愛物切換改回 /assets。Car detail 仍維持 AssetSwitcher。設計理由：原本 back arrow + AssetSwitcher chevron + edit pencil 三件擠在左邊，加上標題本身又是 dropdown trigger，跟 app 其他頁面慣例完全不一致；改成三欄佈局與 /settings 對齊。

#### AddSheet 家族 polish（PR #170，closes #155/#156/#157）
- **CategoryPicker overflow 提示**（closes #155）：分類 chips 右側加 fade overlay，讓使用者知道還能往右滑看更多。
- **Status 文案更清楚**（closes #156）：「已扣款 / 待扣款」改為「已付清 / 信用卡待扣」（4 語同步），helper text 與 CompactRow pending badge 一起對齊；「信用卡待扣不會算進兩個人的結算」這句話直接寫出來。
- **iOS home indicator 安全區**（closes #157）：AddSheet / IncomeSheet / SettlementSheet 底部 24px spacer 改 `calc(24px + env(safe-area-inset-bottom))`，notes textarea 與刪除按鈕不再被手勢列遮住。

#### Settings（PR #169，closes #162）
- **分攤比例 slider 10% snap**（closes #162）：把預設分攤比例 slider 從 step=1（1–99）改成 step=10（10–90），加上 `<datalist>` tick marks 視覺化 snap 點。設計理由：使用者實際需要的是 50/50、60/40、70/30 這類整數比例；step=1 看似彈性但實際讓人很難精準停在常用值。

### 技術變更

- **`lib/colors.ts` 新增**（PR #168）：`lightenHex(hex, amount = 0.35)` deterministic helper；對 malformed hex 在 module init 時 throw 而非 render 時 silently 壞掉。`Category` / `IncomeCategory` 介面新增 `color` field，`tint` 從 source 拿掉改為運算結果；callsite 透過 `chart` alias 維持 backward compatibility，無 churn。
- **`lib/insurance.ts` 新增 payCycle helper**（PR #174）：`payCycleMonths()` 把 enum 翻成月數；`computeNextPaymentDate(startsAt, payCycle, today)` 計算下一次扣款日，含月底 clamp（1/31 + 1 月 → 2/28）。9 個 unit tests 在 `__tests__/insurance-next-payment.test.ts`。`payCycle` 從 `listAssetsForGroup` query 一路串到 `InsuranceListItem.data`，**無新欄位**（`pay_cycle` 早已存在）。
- **`leaveGroup` 整合測試補完**（PR #172，closes #139）：新增 `__tests__/actions/leaveGroup.noOwnedAssets.test.ts` 覆蓋 viewer 沒有 owned 愛物時的 leave 路徑——驗證 epoch 正確關閉、`current_epoch_started_at` 更新、`OikosGroups.member_a/b` swap 邏輯。
- **`AssetSwitcher` 從 6 個 aibutsu 子頁面下架**（PR #175）：`page.tsx` 不再把 `allAssets` 透過 props 串給 5 個 aibutsu DetailClient + `SavingsView`；component 本身保留（car detail 仍 inline 使用）。`tests/PetDetailClient.test.tsx` 同步移除 AssetSwitcher mock。
- **CLAUDE.md domain model + worktree 工作流速查補完**（PR #176）：新增 entity 關係圖、Asset 沒有 owner_user_id 的設計理由、Epoch 是「時間軸 slice」而非 entity 的說明、worktree 命名與生命週期。CHANGELOG 兩小節格式（使用者可見變化／技術變更）正式定為 contract，每版皆需依此分節。

## [0.15.0] - 2026-05-12

主題：**離開也保留陪伴．pending 收斂**——把「兩人關係未必恆久」這件事正式收進 schema 與 UX：member_a/b 可換位、可離開、過往 chapter（epoch）不消失只是分章；同時把日常記帳的「賒帳 / 待扣款」獨立成 record status，不再混入 balance；外加保險愛物強化、PWA 離線回前景自動刷新、`/records` 結構化篩選器與 Inbox 概念註解。

完整 diff：[v0.14.2...v0.15.0](https://github.com/redtear1115/oikos/compare/v0.14.2...v0.15.0)

### 使用者可見變化

- **Pending（待扣款）紀錄**：信用卡簽完未過帳、預授權、IOU 可標為待扣款，feed 用低 opacity + 「待扣款」badge 顯示，不會混進兩人 balance（PR #122，closes #49）。
- **`/records` 結構化篩選器**：date range × 愛物 multi-select × 收入分類 multi-select，URL-synced 可分享連結；header 排版重整、「⚙ 定期」收進 popover（PR #124，closes #50）。
- **離開兩人帳本回到 solo mode**：Settings danger zone 入口 + 4 卡片 flow（資料分配 → 確認意願 → swap proposal → final confirm），過去的紀錄不消失只是收進「過去」（#79，PRs #123 / #130 / #135 / #134）。
- **`/past-times` 頁**：翻回過去的關係章節（PR #135）。
- **`AibutsuHintCard` mode-aware**：solo 模式不再顯示「邀請伴侶」勾子，改為陪伴繼續記（PR #134）。
- **對方離開後 dashboard 顯示「partner-left」卡片**；回 solo 後顯示「welcome-solo」卡片邀請繼續一個人的紀錄（PR #134）。
- **保險愛物強化**：險種家族 type-specific badge / 進度條 / framing（PR #129，closes #127）；單年期保單可自訂續保紅燈天數（預設 30）；儲蓄／還本險加「分紅」與「生存金」入帳分類並反映在累計拿回（PR #133，closes #132）；要保人關聯 Profile 自動同步 displayName + 頭像（PR #143，closes #142）。
- **iOS PWA 切回前景自動 refresh**：不用手動 pull-to-refresh 才能看到新紀錄（PR #125 / #128，closes #126）。
- **保險詳情頁進度條 hydration warning 修掉**（PR #136，closes #137）。

### 技術變更

- **`record_status` enum**（`'settled' | 'pending'`）+ `CashTransactions.status` 欄位；pending 不計入 `GroupBalance`，預設 `'settled'` 無需 backfill。
- **Chapter slicing（GroupEpochs）**：新增 `GroupEpochs` + `GroupBalanceEpochs` 兩 table；`cashTransactions` / `settlements` / `incomeTransactions` 全 epoch-scope 化；`/records` / stats / dashboard 預設只看當前 chapter。`OikosGroups` 加 pending swap 三欄 + `current_epoch_started_at`；新增 `swapMembers()` / `leaveGroup()` server actions。
- **`getActiveGroupForUser()` 收斂**（commit `31c3d80`）：分散的 active-group lookup 整合成單一 helper，為 epoch / swap / leave flow 提供 viewer-aware 一致解析。
- **Single-open-epoch invariant**（commit `f0552c6`）：accept invitation + layout pick 兩條路徑強制每 group 只一個 open epoch。
- **Inbox layer 概念註解**（PR #144，closes #101）：新增 `inbox-layer-design.md` spec 統一非使用者親手建立的資料邊界；v0.16.0 才實作 schema migration + UI。
- **保險 schema 強化**：`InsuranceDetails.reminder_days_before` (integer, 預設 30)；`policy_holder_user_id` (FK to `Profiles`)；要保人離開 group 可帶走政策、被保人保留 free text。
- **Migrations 0028–0033**：含校正性 migration 0032 修 0029/0030 把舊紀錄誤踢出 current epoch 的 bug（`DEFAULT now()` sentinel issue）。
- **Drizzle raw SQL casts 對 Date 參數**（commit `f249729`）：epoch Date 參數 stringify 後再 cast 避免 prepared-statement type 推斷錯誤。
- **Insurance subtype tint revert**（commit `52087d9` → `15b7564`）：嘗試 framing-based subtype tint 後改回 type-tinted border + avatar。
- **Solo-mode inline 新增按鈕移除**（commit `aeb8470`）：dashboard solo mode 改由 FAB 統一入口。

## [0.14.2] - 2026-05-11

主題：**紀錄可以更貼手**——v0.14.1 上完之後把當時暫時 revert 出來的兩件小事 ship 回去。

完整 diff：[v0.14.1...v0.14.2](https://github.com/redtear1115/oikos/compare/v0.14.1...v0.14.2)

### 使用者可見變化

- **AddSheet 描述自動完成**：輸入描述時即時 surface 同帳本歷史紀錄做 inline 建議，點選即填入（PR #114，closes #113）。
- **`/records` 月度統計 drill-down**：點 stats card detail bar（分類列 / 愛物列 / 收入分類列）直接把 transaction feed 套上對應 filter，配 `DrillFilterChip` 顯示「目前 filter 條件 + 一鍵清除」；同 row 再點清除（idempotent toggle）（PR #116，closes #102）。

### 技術變更

- 兩個 PR 都在 v0.14.1 release 時暫時 revert，本版 revert-the-revert 重新接回。
- 新增 `lib/db/queries/transactions.ts → suggestDescriptions()` query；`lib/drill.ts` 把 stats row `data-*` 翻成 feed `ResolvedTxnFilter`。
- 無 schema 變動。

## [0.14.1] - 2026-05-10

主題：**分擔可以不對半，陪伴的細節再收一輪**——v0.14.0 上完之後幾天衍生出的修補與小功能。

完整 diff：[v0.14.0...v0.14.1](https://github.com/redtear1115/oikos/compare/v0.14.0...v0.14.1)

### 使用者可見變化

- **依比例分（weighted split）**：自訂 1–99 整數分擔比例取代固定對半（剛好 50 顯示「平分」）；Settings 加 group 預設比例 slider（PR #115，closes #90）。
- **`/records` FAB 跟 tab 切色 + 切意義**：全部 / 支出 tab 維持深咖啡 ink 色開 AddSheet；收入 tab 變薄荷綠 accent 色開 IncomeSheet（PR #112，closes #110）。
- **Dashboard hero 可收起 + 排版穩固**：收合狀態 single-line 顯示我/對方欠款；settle ⇄ 按鈕固定在 +/− 左側不再跳位（PR #111，closes #109）。
- **prod Service Worker 註冊失敗修復**：Settings 離線開關被卡住的全 prod 使用者解開（PR #108，closes #107）。

### 技術變更

- **`split_type` enum 加 `'weighted'`**；`OikosGroups.default_split_ratio_a` / `CashTransactions.split_ratio_a` / `RecurringExpenseRules.split_ratio_a` / `PendingExpenseOccurrences.split_ratio_a` 全部加欄位（Migration 0027）。Postgres `ALTER TYPE ... ADD VALUE` 不能跑 in transaction，drizzle migrator 預設逐句執行即可。
- **Balance 算法**：付款人 A → B 欠 `ceil(amount × (100−ratioA) / 100)`；付款人 B → A 欠 `ceil(amount × ratioA / 100)`。`half` enum 保留作為 legacy，新舊紀錄都正確 render。
- **`/sw.js` Cache-Control: no-store**（`next.config.ts` headers）：Vercel CDN 把 SW 回 304 cache 導致 `register()` 靜默失敗。
- **延期到 v0.14.2**：PR #114（AddSheet 描述自動完成）與 PR #116（stats drill-down filter）在 main 上以 revert commits 暫時抽離。

## [0.14.0] - 2026-05-10

主題：**沒有訊號的時候，也還看得見**——把這個月攤開來一起看，網路斷了之後也看得見最近一次連線的樣子。

完整 diff：[v0.13.1...v0.14.0](https://github.com/redtear1115/oikos/compare/v0.13.1...v0.14.0)

### 使用者可見變化

- **`/records` inline 月度統計**：sticky 月份切換器同時控 stats card + transaction feed；三個 tab 各一張 donut 卡（全部 = 收支統計、支出 = 分類 / 愛物 toggle、收入 = 收入分類）（PR #93，closes #22）。
- **雙人月度回顧儀式**：每月 1 號 Taipei 00:05 自動凍結上月 snapshot；`/review/[YYYY-MM]` 4 張卡片 carousel + 兩人各自的「給下個月的我們」留言區（800ms debounce autosave、200 codepoint cap、月底鎖為 read-only）（PR #94，closes #44）。
- **離線瀏覽 PWA（opt-in）**：Settings 開啟後斷網仍可看最近一次連線的 dashboard / records / assets；離線時頁首顯示 `OfflineBanner`，新紀錄離線後重連會自動 refresh（PR #95，closes #19）。
- **Onboarding 桌面跑版修正**：philosophy cards 不再撐滿大螢幕（PR #98，closes #96）。
- **In-app browser 攔截 + 引導**：LINE / IG / Threads / FB / Messenger / WeChat / Telegram / X / LinkedIn / KakaoTalk 等 WebView 偵測到後 render blocker，提供「複製連結」與 iOS「在 Safari 開啟」按鈕，避免卡在 OAuth + SW + Supabase session 死巷（PR #99，closes #97）。

### 技術變更

- **新 schema**：`MonthlyReviewSnapshots`（denormalised paid_by name / asset names 凍結）+ `MonthlyReviewMessages`（lockable autosave）；`compute_monthly_review_snapshot(group, year, month)` plpgsql function；pg_cron `monthly-review-snapshot` 每月 1 號 16:00 UTC。Migration 0026。
- **Donut 用 inline SVG（~80 行）** 而非 Recharts / Chart.js：mobile bundle 不引入 ~50 KB+ 圖表 lib。
- **PWA 採 Serwist (`@serwist/next`)**，opt-in via Settings（preference 存 `localStorage` 非 Supabase — SW 是 per-device 而非 per-user 能力）；L1 precache app shell、L2 runtime cache NetworkFirst + 3s timeout（不 SWR — oikos 寫入路徑會 `revalidatePath`）；Sign-out 前 `caches.delete('dynamic-v1')` 防 PII 跨使用者。
- **Build script 改 `next build --webpack`**：Serwist 9.x 不相容 Next.js 16 預設 Turbopack production build；`app/sw.ts` 從主 tsconfig 排除（webworker 型別會把 `Navigator` 染成 `WorkerNavigator` 污染整個 client component typecheck）。
- **Snapshot 凍結語意**：軟刪除來源不回頭更新已凍的回顧頁；留言不加密、lock-after-cron 單向不可回頭改。
- **In-app browser blocker 在 root layout** 而非 dashboard layout：i18n 字串以 props 傳入（root layout 沒有 `TranslationsProvider`）。
- **Vercel Analytics + Speed Insights** 接通（commit `10acfe4`）。
- **`RealtimeProvider`** 聽 `online`/`offline` 事件呼叫 `disconnect()` / `connect()` 暫停 reconnect 迴圈。
- **不在 SW 攔截 server actions / 不預先 disable 寫入按鈕**：source of truth 是 server action response、不是 `navigator.onLine`。

## [0.13.1] - 2026-05-09

主題：**啟程之前的鋪陳**——v0.13.0 部署之後夾帶到 prod 的 polish 補上正式紀錄。

完整 diff：[v0.13.0...v0.13.1](https://github.com/redtear1115/oikos/compare/v0.13.0...v0.13.1)

### 使用者可見變化

- **Onboarding 哲學卡**：`sign-in → /setup` 之間插入 `/onboarding` 路由，5 張輕量哲學卡每張一個「光 × 顏色」視覺收尾（① Futari 不會問誰花得比較多 ②進到 Futari 的就是我們共同的 ③薪水進來的那天是兩個人一起感受的 ④保險是一起守護的承諾 ⑤就從第一筆慢慢開始），全部可跳過，看完 localStorage flag 第二次不再顯示（PR #83）。
- **Settings 法律連結修補**：原 `href="#"` 無效連結改為真實 `/terms` + `/privacy`（PR #84）。

### 技術變更

- **AI 協作規則放寬**（PR #85，doc-only）：commit + push 到 feature branch 都自動；main / release 仍 PR-only + protected；`gh pr merge --admin` 仍要明確指令。
- **這版是「補登」而非新部署**：v0.13.0 deploy PR 已把 PR #83 / #84 / #85 一併送上 prod，v0.13.1 release PR 純粹補 changelog + version bump、不再開 deploy PR、prod 不重新觸發。tag 打在 release HEAD（v0.13.0 deploy 的 merge commit）。

## [0.13.0] - 2026-05-09

主題：**陪伴 × 起點 × 定期支出**——兩個人都有自己的第一步、自己的第一筆，再到不必再記住的每月固定。

完整 diff：[v0.12.0...v0.13.0](https://github.com/redtear1115/oikos/compare/v0.12.0...v0.13.0)

### 使用者可見變化

- **邀請流程雙向確認儀式**：A 邀請者在 `/setup` 流程中 name → trust → invite 三步走，讀完三段承諾（加密／可攜／備份）按「這是我希望的」才建立邀請；B 受邀者點連結看到「{name} 已經承諾了這些」+ 同樣三段承諾，按「我也是」才 join（PR #73，#43 Phase E）。
- **第一筆 first-record 理念卡**：每位伴侶各自第一次記帳時出現，per-user 不重複觸發（PR #74，#43 Phase C）。
- **自訂定期支出（mirror 定期收入）**：`/settings/recurring-expense` 規則列表 + 新增/編輯/暫停/恢復/刪除；Dashboard `PendingExpenseStack` 「就這樣 / 改一下 / 跳過」三動作（PR #77 / #78，#18 closes）。
- **AddSheet「改一下」接通**：partial override 改一個欄位即送出，未填欄位 fallback pending occurrence snapshot；race 偵測「對方剛剛確認了這筆」toast（PR #78）。
- **`/records` sticky tab bar 加 inline 入口**：tab=expense → 「⚙ 設定定期支出 →」、tab=income → 「⚙ 設定定期進帳 →」、tab=all 不顯示。

### 技術變更

- **`actions/recurringExpense.ts`** mirror income 形狀：8 個 actions（create / update / pause / resume / softDelete / confirmPending / editAndConfirmPending / skipPending）+ `lib/db/queries/recurringExpense.ts`。
- **與 income 的差異**：rule 帶 `paid_by` + `split_type` + `description` (notNull) 而非 `recipient_id` + `source`；`confirmPending` 在同個 drizzle transaction 內寫 `CashTransactions` + 跑 `recalcGroupBalance`（mirror `createTransaction`，income 沒 balance impact 不需要）。**刻意不對稱**：抽共用層會讓 income 多扛不必要的 transaction overhead。
- **first-record signal 不增加 dashboard query**：`createTransaction` 回傳 `{ id, isFirstTransaction }`，trigger 在 insert path 一次 `count(*) WHERE paid_by = me`；per-user flag 存 `localStorage`（`oikos_first_record_card_seen_{userId}`）。
- **`RealtimeProvider`** 新增 `RecurringExpenseRules` + `PendingExpenseOccurrences` 兩個 event kinds。
- **Breaking**：`ModeTogglePlaceholder.pendingCount` → 拆 `incomePendingCount` + `expensePendingCount`，4 處 callsite 同 PR 替換。
- **`paid_by` 作為 row creator 代理**：CashTransactions 沒 `created_by` 欄位；first-record 場景是「記自己的支出」，代理對暖訊息文案足夠。

## [0.12.0] - 2026-05-09

主題：**陪伴 × 信任**——讓兩個人都安心把日子記下來。

### 使用者可見變化

- **信任宣示頁 + onboarding 信任卡**：`/settings/trust` 三段陪伴感文案（加密 / 可攜 / 備份），不講工程細節而是「連我們自己也讀不到」「我們替你們守著」這類軟性敘述（PR #62，closes #48 Phase A+B）。
- **CashTransactions 共同備註欄位**：AddSheet 日期下方加 multi-line textarea；列表 row 用引號樣式顯示一行（`line-clamp-2`）（PR #66，closes #34）。
- **MiniCalendar 三層導覽**：day → month → year，year view 改 3×4（1 leading overflow + 10 in-decade + 1 trailing overflow），對齊 iOS / Google Calendar pattern（PR #67，closes #65）。
- **CSV 匯出（v1：活躍 CashTransactions）**：Settings 加按鈕，純 client-side `fetch → blob → <a download>`；UTF-8 with BOM + CRLF + RFC 4180 跳脫；分類 + 分攤依 locale 4 語翻譯、誰付的用 display name（PR #70，closes #37）。
- **i18n 補完**：Settings 子頁（coming-soon + invite，PR #64，closes #21）；愛物 detail pages + AssetSheet（PR #69，closes #20）。
- **Solo mode 進帳模式 toggle 失效修復**：`SoloBanner` 漏 forward `mode` / `onChange` 導致 toggle 靜默 no-op（PR #63，closes #61）。

### 技術變更

- **Migration 0025**：`CashTransactions` 加 nullable `notes` text 欄位。
- `validateInviteAcceptance` 改回傳 `InviteAcceptError` code，不再吐 zh-TW 字串；`acceptInvite` race condition 訊息也 code 化由頁面 map。
- `MiniCalendar` props (`value`, `onChange`) 不變，5 個既有 caller 零 break。
- v1 CSV 範圍只匯出活躍 CashTransactions；Settlements / IncomeTransactions / 日期範圍 / Google Sheets OAuth 留後續。

## [0.11.4] - 2026-05-09

### 使用者可見變化

- **愛物 6 種類型分色 tint + 3px 左側 accent rail**（PR #30，closes #28）。
- **儲蓄險「儲蓄」badge**：`InsuranceDetails.insurance_type === 'savings'` 時 subtitle 列顯示 11px monospace badge（PR #30）。
- **`og-image.png` 從 768 KB 壓到 95 KB**：原圖超過社群平台 ~300 KB 抓取上限導致 Twitter / FB 預覽 fallback 無圖；ImageMagick 256-color palette quantize（PR #29，closes #25）。

### 技術變更

- `app/globals.css` 新增六色 CSS vars：`--asset-tint-{house,car,child,pet,plant,insurance}`。
- `listAssetsForGroup` LEFT JOIN `InsuranceDetails` 暴露 `insuranceType`，串到 `AssetListItem`。

## [0.11.3] - 2026-05-08

### 使用者可見變化

- **`/sign-in` 結構化資料 + 完整 SEO meta**：`SoftwareApplication` JSON-LD（`FinanceApplication`、`featureList`、4 語 `inLanguage`）+ keywords + canonical + 4 語 hreflang。
- **`robots.txt` / `sitemap.xml` 改 200 帶內容**（原為 307）：搜尋引擎可正常抓。
- **品牌語意 heading**：Futari 字由 `<div>` 改 `<h1>` + `sr-only` 副標「· 兩個人的家計簿｜伴侶／夫妻共享記帳 PWA」（視覺零變化）。

### 技術變更

- 新增 `app/robots.ts` + `app/sitemap.ts`（Next 16 `MetadataRoute.*`）。
- `middleware.ts` matcher 排除 `/robots.txt` 與 `/sitemap.xml`（原 matcher 漏掉這兩個，被 307→`/sign-in`）。
- `app/layout.tsx` metadata 全面重寫：title / description / keywords (22 個目標長尾詞) / alternates / robots / openGraph / Twitter card。
- **限制**：站內仍只有 `/sign-in` 一個公開可索引頁；要拉 SEO 流量天花板需要日後另開 `/` 公開 landing。

## [0.11.2] - 2026-05-08

### 使用者可見變化

- **冷啟動與切換更輕快**：`/settings` 與 `/records` RSC 並行化、`/assets` batch query、BottomNav 完整 prefetch（典型 5–8 個 asset → `/assets` RSC 預期省 120–560ms）。
- **CSS bundle 瘦身**：字型 weights 刪減後視覺零變化。

### 技術變更

- **`b315565`**：Noto Sans TC 4→3 weights、Fraunces 3→2 weights（Google Fonts 以 unicode-range 切片即使指定 `latin` subset 也帶全部 ~105 個 `@font-face`，單一未用 weight 膨脹 ~25%）；主 font CSS chunk 397 KB → 298 KB raw（-25%）／ 144 KB → 108 KB gzipped。
- **`da9309c`**：`/settings` RSC fetch 並行化（兩組 `Promise.all`）；省短查詢 ~30–80ms 等待。
- **`a46d676`**：BottomNav `prefetch={true}` 預取完整 RSC payload（含資料），保留 PR #2 的 idle gating。Next 16 中 `prefetch={undefined}` 在 dynamic route 上只預取到最近的 `loading.js` 邊界。
- **`2ecfeda`**：`/assets` 新增 `getAssetSummariesBatch`，單一 `SUM ... GROUP BY asset_id` 取代 N×round-trip；詳情頁 single 版 `getAssetSummary` 保留。

## [0.11.1] - 2026-05-08

### 使用者可見變化

- **i18n 4 語架構 ship**：zh-TW / zh-CN / en / ja，cookie-based locale，`?lang=` query param 入口 4 語都正確持久化；日期格式隨語系自動切換（PR #3 / #4 / #6 / #7）。
- **Settings 離線瀏覽 toggle UI ship**（SW 實作留到 v0.14.0）（PR #6）。
- **冷啟動更輕快**：RSC prefetch 不再 4 條同時打、Hero balance 先 paint、feed 後到（PR #1 / #2）。

### 技術變更

- **`middleware.ts` Locale 型別僅 2 語 → 修補為 4 語**：常數抽成 edge-safe 模組 `lib/i18n/locales-meta.ts`（不 import `next/headers`），middleware 與 `lib/i18n/t.ts` 共同匯入。
- **Date helpers 改用 `Intl.DateTimeFormat(locale)`**：`dateLabel` / `weekday` / `monthLabel` 由硬寫中文字串改 `Intl` API；`TranslationsProvider` 新增 `locale` prop + `useLocale()` hook。
- **Pages 改用 `getSession()` 跳過 Auth API 往返**（PR #1）：`middleware.ts` 仍用 `auth.getUser()` 作為 trust boundary；page / layout server component 改用 `getCurrentUser()`（內部 `getSession()`），省每頁 200–400ms HTTP 往返。Server actions 維持 `getUser()`。10 個 page / layout 改寫。
- **BottomNav 延遲 prefetch + Dashboard Suspense 邊界**（PR #2）。

## [0.10.0] - 2026-05-08

### 使用者可見變化

- **孩子愛物身分證／健保卡端到端加密**：詳情頁 `●●●●●●●●●●` 遮蔽 + 顯示 / 隱藏 toggle；編輯三態語意（留空＝不變更／清除按鈕＝清為空／輸入＝加密後覆蓋）。
- **MiniCalendar 兩級 year/month nav**：費用紀錄 / 進帳 / 結算 / 加油的 datepicker header 可點 → 12 月份格 → 10 年格。
- **6 種愛物詳情頁加備註區**：上限 2000 chars，trim 後空字串視為 null。
- **進帳 pending 指示器**：未確認的定期進帳數 > 0 時，進帳模式 tab 顯示薄荷綠小圓點。
- **小孩愛物暱稱優先顯示**：hero 與愛物清單改用 `nickname` 為主、法定名退為小灰字。
- **健保卡輸入 4-4-4 自動格式**：placeholder `0000 0000 0000`，每 4 位插空格、上限 12 位數字、`inputMode="numeric"`；不擋送出。
- **`PendingIncomeStack` 首屏改 2 筆 + 展開全部**（修 expand 標籤 off-by-one）。
- **`SavingsHero` 視覺微調**：sub-copy 字級 12px → 14px、進度條 8px → 10px。

### 技術變更

- **`childDetails.id_number_encrypted` 與 `insurance_id_encrypted`** 過去寫入未呼叫 `encrypt()`、讀取也直接 plaintext；本版補上加密／解密、改以 `revealChildPii` server action 按需解密。
- **既有 plaintext 已 wipe 為 NULL**：dev / prod 兩個 Supabase project 都 wipe，本版不需資料 migration。
- **Migration 0020**：`Assets.notes` 新增 nullable text column。
- 三條 hero 路徑（`BalanceHero` / Dashboard solo-dismissed / `SoloBanner`）均接通 pending 指示器，banner 開／關都一致。

## [0.9.0] - 2026-05-08

### 使用者可見變化

- **保險 SavingsView**：儲蓄型保單詳情頁全新視圖（`insuranceType = 'savings'`）——雙 bar hero（入：累計繳 / 估應繳總額；出：已拿回 / 估滿期金）、合約進度條 timeline、繳費 / 拿回紀錄分頁。
- **`MaturingSoonPrompt`（30 天前）+ `MaturedAwaitingPrompt`（滿期未收）**：含一鍵記滿期金；`returnRatio ≥ 1.05` 時自動隱藏「記滿期金 +」入口。
- **`AssetSheet` 險種 picker 加入「儲蓄」選項**，conditionally render 預估滿期金欄位。
- **保險詳情頁 hero 橫線修掉**：`InsuranceDetailClientLegacy` header 與 hero 之間的 subpixel gap（外層 `var(--bg)` 透出形成暗線）。

### 技術變更

- **Migration 0015**：`InsuranceDetails.expected_maturity_amount` (nullable)。
- 新增 `computeSavingsProgress` helper（`lib/insuranceProgress.ts`）+ 14 unit tests 覆蓋全部 edge cases。
- **`IncomeSheet`** 新增 `prefilledCategory` / `prefilledAmount` props 供 `MaturedAwaitingPrompt` 一鍵預填。
- 非 savings 險種 fallback 到 `InsuranceDetailClientLegacy`（維持原樣）。
- **Spec 文件 doc-keeper**：8 個 spec 由版本前綴命名改穩定 topic 命名（e.g. `0_7_0-insurance-detail-design.md` → `insurance-design.md`）；移除完成狀態表 / 路徑表 / 已 ship 驗收 checklist；CLAUDE.md spec 索引對應更新。

## [0.8.1] - 2026-05-08

### 使用者可見變化

- **愛物清單分群**：`/assets` 依「財產 / 生命體 / 保障」分群顯示，各群組附標題。
- **House hero card**：入住天數統計（`movedInAt` 起算）。
- **定期收入「改一下」接通**：`editAndConfirmPending` 完整串接——點「改一下」開 IncomeSheet 預填全欄（amount / category / recipient / occurredAt / source / assetId），送出時同步 confirm pending（原子性）。
- **Insurance / House 詳情頁 hero 統一樣式**（Insurance 顯示保障剩餘天數 / House 顯示入住天數）。
- **定期收入 Pending Realtime 修復**：INSERT / UPDATE event 拆分，解決 partner 確認 pending 時的 race condition；`IncomeSheet` race guard。

### 技術變更

- 新增 `DayPicker` 元件（7 欄 × 5 列 + `aria-pressed` / `aria-label`）。
- 新增 `RecurringRuleSheet` bottom sheet 取代獨立全頁表單。
- `/settings/recurring-income` 改為 server component（`RecurringIncomeContent` client shell）；`/new` 與 `/[id]` sub-routes 廢除改 redirect 回列表；`RuleForm.tsx` 刪除。
- **雲端發票匯入 schema 預置**（migrations 0017–0019）：`InvoiceCredentials` table + `cashTransactions.invoiceNumber`——功能因財政部 API 申請限制暫緩，不對使用者顯示。

## [0.8.0] - 2026-05-07

### 使用者可見變化

- **自訂定期收入 Phase 1**：規則 + 待確認卡片 preview→commit 模型；設定頁 `/settings/recurring-income` 規則列表 + 新增/編輯，pause/resume inline toggle。
- **Dashboard 進帳模式 pending card stack**：「就這樣 / 跳過」兩動作（「改一下」延後 Phase 2）。
- **Realtime 同步**：partner 端建立 / 編輯規則、確認 / 跳過 pending 都即時刷新。

### 技術變更

- **`RecurringIncomeRules` + `PendingIncomeOccurrences` schema** + RLS + Realtime publication。
- **`compute_next_occurrence` SQL helper**（PL/pgSQL，含月底 day clamp）+ `computeNextOccurrence` / `snapToFuture` / `firstAnchorFromStart` TS mirror helpers。
- **pg_cron `generate-pending-income`**：每日 16:00 UTC（= 台北 00:00），idempotent。
- 8 個 server actions（含 Phase 2 預留的 `editAndConfirmPending`）。
- `cleanup-soft-deleted` cron 擴充：規則 1 年後物理刪、skipped pending 90 天後物理刪。
- 新增 `docs/superpowers/specs/0_8_0-recurring-income-design.md`；spec 重命名 `0_8_0-cloud-invoice-design.md` → `0_9_0-cloud-invoice-design.md`、`0_8_0-insurance-detail-design.md` → `0_7_0-insurance-detail-design.md`。

## [0.7.0] - 2026-05-06

### 使用者可見變化

- **進帳（Income）ship**：`IncomeSheet`（slide-up、category chips、policy picker、numpad）+ Dashboard mode toggle（支出 / 進帳）+ `IncomeHero` card。
- **Records tab bar 三分頁**：全部 / 支出 / 進帳；income row mint glow；月份 header 顯示「進帳 − 支出」淨額。
- **Records income rows 點擊直接開 `IncomeSheet` 編輯**。
- **愛物 Onboarding Hint**：Pet / Child / Plant / House 詳細頁首次使用提示卡。
- **保險 ↔ 車輛雙向關聯**：兩端詳細頁互相顯示。

### 技術變更

- **`IncomeTransactions` schema** + RLS + Realtime publication + pg_cron cleanup；獨立 income category 定義 + mint palette token。
- 進帳 server actions（create / edit / softDelete + loadMoreIncomes）。
- `InsuranceDetails.vehicleId` FK；驗證保險只能關聯自己 group 的車。
- **Typography tokens**：新增 `--fs-*` scale，統一替換全站 inline `fontSize` / `text-[Xpx]`。
- `EditTextSheet` 改 bottom sheet，支援 keyboard push-up；bottom sheet radius 統一頂角 24px。
- Avatar bg 改用 `--ink` token，移除 `--me-color` / `--them-color` aliases。
- FuelLogs pg_cron cleanup 因 migration 順序導致的 regression 修復。

## [0.6.0] - 2026-05-06

### 使用者可見變化

- **House 愛物 ship**：詳細頁 + 列表 collapse 在「更多」下方 + house icon。
- **Insurance 愛物 ship**：詳細頁 + 列表 + `AssetIcon` insurance variant（shield+check）。
- **Asset Switcher**：詳細頁跨愛物快速切換（名稱變 switcher trigger）。
- **詳細頁 UI 統一**：所有詳細頁 name size / 30px height / back-name-edit-switcher 一致；hero 移除全色帶改用左側 accent stripe；愛物列表左側 accent stripe + dashed echo + inline mark。

### 技術變更

- `HouseDetails` schema + migration + `getHouseDetails` query + `validateHouseInput` + `createHouse` / `editHouse` server actions + `HouseDetailClient`。
- `InsuranceDetails` schema + CRUD actions + `InsuranceDetailClient`。
- `AssetSheet` 高度改 fixed height（移除 maxHeight）。

## [0.5.0] - 2026-05-05

### 使用者可見變化

- **Child / Pet / Plant 三種愛物 ship**：各自詳細頁 + 年齡 / 健康 / species 資訊。
- **「資產」全面改名為「愛物」**（UI 顯示層）。
- **`AibutsuHeader`** tinted 詳細頁 header，各類型色系。
- **`AssetSheet` type picker** 支援所有愛物類型。
- **Pet 三態性別 toggle**（公 / 母 / 不明）。
- **CarHeroCard** 單車 / 多車 layout（B1 car list）。

### 技術變更

- `ChildDetails` / `PetDetails` / `InsuranceDetails` / `PlantDetails` 子表 schema。
- 對應 validators（`validateChildInput` / `validatePetInput` / `validatePlantInput` / `validateInsuranceInput`）+ server actions（create / edit）。
- `asset_type` enum 補上 `pet` + `plant`；`listAssetsForGroup` 不再限制 `type='car'`。
- `AssetIcon` 新增 paw + plant SVG。

## [0.4.0] - 2026-05-05

### 使用者可見變化

- **FuelLog ship**：車輛詳細頁加油時間軸 + ActionBar + `NewFuelLog` sheet。
- **油耗計算**：singleEcon + 近 6 個月均值。
- **primaryUser 自動帶入**：車輛 `primaryUser` 自動帶 `paidBy` + `splitType`。
- **車輛擴展欄位**：color / year / brand / model / initialOdometer；hero 顯示 brand/model/year；color picker 存 hex。
- **NewFuelLog 表單新增「誰付的 + 分攤方式」欄位**。
- **車輛詳細頁 layout 整理**：edit pencil 移到名稱旁、其他花費進 timeline header、加油 FAB 回歸。

### 技術變更

- `FuelLog` table reshape + `cashTransactions.fuelLogId` + `carDetails.primaryUser` / `fuelType`。
- `createFuelLog` 雙寫 `FuelLog` + `CashTransaction`；`editFuelLog` / `softDeleteFuelLog`。
- `singleEcon` + `computeAvgEcon`（近 6 個月均值）helpers。
- `fuelType` enum：移除 `electric`，改 `92` / `95` / `98` / `diesel`（'92' legacy 留在 enum 因為 pg 無法 drop value）。
- `AssetDetailClient` 訂閱 `fuel-log-changed` realtime event；加油 station 欄位移除。

## [0.3.0] - 2026-05-05

### 使用者可見變化

- **愛物概念 + 「車」愛物 ship**：`/assets` 列表頁（空狀態 + accent FAB）+ `/assets/[id]` 詳細頁（hero + scoped feed）。
- **`AssetSheet`** bottom sheet：car create / edit / delete。
- **AddSheet 加關聯資產 picker**（`AssetPickerSheet`） + zombie label。
- **品牌資產 handoff**：icons / favicon / OG 圖片；`/terms` / `/privacy` 頁面 OG metadata。
- **PWA Install Guide**：platform-aware 加到主畫面說明 sheet。

### 技術變更

- `Assets` + `CarDetails` schema + RLS policies + Realtime publication。
- `validateCarInput`、`createCar`（含購車自動產 `CashTransaction`）、`editCar`、`softDeleteCar` server actions + queries（list / get / summary / paged transactions）。
- `editTransaction` 補上 soft-delete `.returning()` race guard。
- `PayerToggle` / `SplitTypeSelector` 抽出共用元件；Realtime payload 全面型別化。
- `BottomNav` 新增 `fabVariant` prop + `/assets` routing。
- AddSheet 切換資產時清除舊 `assetInfo`。

## [0.2.0] - 2026-05-03

### 使用者可見變化

- **Onboarding 兩步驟建帳本**：建立 → 邀請 / 跳過；品牌化 welcome screen。
- **Solo Mode（單人模式）**：`SoloBanner` 取代 `BalanceHero`；AddSheet 隱藏 payer / split UI，強制 `all_mine`；solo dismissable banner 關閉後 Settings 仍保有邀請入口。
- **預設分攤偏好**：Settings inline radio + `updateDefaultSplitType` server action。
- **Web Share API**：複製連結 fallback。
- **Filter 篩選**（Phase 1d）：`FilterSheet` + 伺服器端 UNION filter（誰付 / 分攤 / 分類）。
- **Settings 頁**（Phase 1d）：帳本名稱 / 顯示名稱編輯、Google 大頭貼、登出。
- **Settlement（還款）**（Phase 1c）：`BalanceHero` 展開 `SettlementForm` + 智慧 chip；tap row 可編輯 / 刪除。
- **Records 頁**（Phase 1b）：`/records` 分月份列表 + 分頁載入。
- **編輯既有紀錄**（Phase 1b）：tap `CompactRow` → AddSheet edit / delete 模式。
- **WCAG zoom / SPA nav / invite error / OAuth redirect 參數保留修復**。

### 技術變更

- **Realtime Phase 1e**：`RealtimeProvider` + event bus；`BalanceHero` cross-fade；`TransactionFeed` prepend + highlight on INSERT。
- **pg_cron 每週日 03:00** 物理刪除 `deleted_at > 1 year`。
- RLS SELECT policies 讓 Realtime 正常讀取。
- `OikosGroups` Realtime publication idempotent migration。
- Server Action 整合測試（transaction / settlement / group / profile）。
- `MiniCalendar` 月份導航修復。

## [0.1.0] - 2026-05-03

### 使用者可見變化

- **登入（Google OAuth）+ 建帳本 + 邀請伴侶**（7 天 token + group-full guard）。
- **Dashboard**：`BalanceHero` + 最近紀錄 + load-more（`TransactionFeed`）。
- **AddSheet 完整表單**：金額 / 說明 / 分類 / 誰付 / 分攤 / 日期 + numpad + `MiniCalendar`。
- **底部 Nav**：4 tabs + center FAB。
- **PWA manifest + meta tags**。
- **Futari 品牌**：design tokens、字型、manifest。

### 技術變更

- 專案骨架：Next.js 16 + Supabase + Drizzle ORM + Tailwind CSS v4 + Vitest。
- **AES-256-GCM 加密工具**（key 在 Vercel env，DB 只存 ciphertext）。
- Google OAuth + sign-in + callback route + auth middleware。
- Drizzle schema：`Profiles` / `OikosGroups` / `GroupInvites` / `GroupBalance` / `CashTransactions` / `Settlements`。
- RLS policies + Profiles trigger。
- Group 建立流程 + Balance 初始化。
- `createTransaction` / `softDeleteTransaction`：atomic + `GroupBalance` 重算。
- Balance math：pure 函式 + viewer-flipped perspective。
- Settlement chip math：快速還款金額計算。
- `FutariMark` / `Avatar` / `CategoryChip` 基礎元件。

---

[Unreleased]: https://github.com/redtear1115/oikos/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/redtear1115/oikos/compare/v0.15.3...v0.16.0
[0.15.3]: https://github.com/redtear1115/oikos/compare/v0.15.2...v0.15.3
[0.15.2]: https://github.com/redtear1115/oikos/compare/v0.15.1...v0.15.2
[0.15.1]: https://github.com/redtear1115/oikos/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/redtear1115/oikos/compare/v0.14.2...v0.15.0
[0.14.2]: https://github.com/redtear1115/oikos/compare/v0.14.1...v0.14.2
[0.14.1]: https://github.com/redtear1115/oikos/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/redtear1115/oikos/compare/v0.13.1...v0.14.0
[0.13.1]: https://github.com/redtear1115/oikos/compare/v0.13.0...v0.13.1
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
