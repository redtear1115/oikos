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

## [1.5.0] - 2026-06-09

主題：**iOS 啟程 · Sign in with Apple · 推播提醒**——iOS 改用 Capacitor 殼並加入推播；Sign in with Apple 滿足 App Store Guideline 4.8；GA4 + Ko-fi 開始長線經營。
完整 diff：[v1.4.3...v1.5.0](https://github.com/redtear1115/oikos/compare/v1.4.3...v1.5.0)

### 使用者可見變化

- **Sign in with Apple（#903）**：sign-in 頁加入「以 Apple 帳號繼續」，iOS 走原生登入、Android／web 走 OAuth，符合 App Store Guideline 4.8。
- **iOS App + 推播提醒（#901 / #874）**：iOS 改用 Capacitor 殼，定期收支提醒透過 APNs 推播，到期前提醒確認。
- **加權分攤「回到預設」（#902）**：調整加權分攤比例後，可一鍵還原回 group 預設值。
- **語言切換即時化（#906）**：切換語系移除約 2 秒的凍結等待，改為 optimistic 立即反映。
- **跨站 Ko-fi 支持入口（#893）**：landing／app 加入浮動 Ko-fi widget（iOS build 另行 gate）。
- **App icon 更新**：替換 iOS + Android 新版 app 圖示。
- **幣別頁返回修正（#898）**：新增表單點「幣別」不再需要多按一次返回才進入貨幣頁。

### 技術變更

- **建立群組 idempotent（#911）**：已在群組的使用者重入 `createGroup` 改回傳既有 group，不再丟未處理的 500（cross-tab／retry 競態）。
- **GA4 整合（#894）**：導入 Google Analytics 4 與點擊事件追蹤，production-only。
- **`first_record_created` 修正（#892）**：非手動路徑（如 import）也能正確發出啟用事件。
- **solo-mode 元件去重（#897）**：支出／收入 sheet 共用同一組 pattern 元件。
- **native-auth spec + Android 雜訊清理（#869）**。
- **SEO meta description 收斂（#702）**：7 個 use-case 英文描述縮到 ≤155 字。

## [1.4.3] - 2026-05-31

主題：**品牌面升溫 · 插圖欄位上線**——Landing、Sign-in、Migrate、Terms、Privacy 換上 Committed 暖底色；Landing hero 加入插圖欄位，Mobile 以插圖開場取代大 mark。
完整 diff：[v1.4.2...v1.4.3](https://github.com/redtear1115/oikos/compare/v1.4.2...v1.4.3)

### 使用者可見變化

- **Landing 插圖欄位（#832）**：桌面版 hero 右欄加入插圖（兩人並肩、暖燈、光點），PhonePreview 縮小為次要產品佐證疊在右下角；手機版改以插圖帶開場取代大 FutariMark。
- **品牌頁面換底色（#832）**：Landing、Sign-in、Migrate、Terms、Privacy 從 `--bg` 換成 `--bg-committed`（加深的晨間奶油色），視覺上與 app 內頁拉開情感距離。

### 技術變更

- **新增 `--bg-committed` token**：`#EFDDC4`，只供品牌面使用，app shell 與任務介面沿用 `--bg`；同步更新 `.impeccable/design.json` Brand-Surface Exemption 規則。
- **設計 token 收斂（#886）**：`FuelRow` + `NewFuelLog` 的 hardcoded hex 全面換 CSS variable（`var(--ink-3)` / `var(--bg-page)`），字級換 `text-micro` / `text-label` token。

## [1.4.2] - 2026-05-31

主題：**解密修復 · 設計 token 收斂**——修正愛物車牌／房子地址在正式環境無法解密顯示的問題（#881）；設計 token 全面收斂；無障礙與 SEO 打磨。
完整 diff：[v1.4.1...v1.4.2](https://github.com/redtear1115/oikos/compare/v1.4.1...v1.4.2)

### 使用者可見變化

- **車牌／地址可正常顯示（#881）**：愛物車輛的車牌、房子的地址先前在正式環境按「顯示」會出錯，現已修復，可正常解密查看。
- **Android 新增紀錄輸入法修正（#872）**：Android app 內開啟新增表單時，關閉輸入法不再誤觸返回、導致表單意外關閉。
- **無障礙改善（#875）**：修正 Lighthouse 無障礙檢測項目。

### 技術變更

- **PII 解密修復（#881）**：先前 PII backfill 對正式環境誤用了 dev 的 `ENCRYPTION_KEY`，導致車牌／地址 ciphertext 與 runtime key 不符、無法解密。已將受影響的 7 筆資料重新以正式 key 加密；新增 `scripts/rekey-mismatched-pii.mjs` re-key 工具備查（與 `encrypt-existing-pii.mjs` 並列）。
- **設計 token 收斂（#876）**：type scale 改為 even-px、移除 `text-caption`／`text-meta`／`text-button` 別名、field-label tracking 統一為 0.6px、導入 `border-hairline` token；以 CSS 變數取代 hardcoded 值。
- **英文 use-case meta description 修正（#702）**：3 條超過 155 字的描述縮短，避免 SERP 截斷。
- **Terms／Privacy 改版（#879）**：更新為正式上線狀態文案，補上敏感欄位加密說明，聯絡方式改用 GitHub Issues。
- **llms.txt 修正（#875）**。
- **開發協作規則（#883）**：push 延到 PR-time，避免每個 commit 都觸發 Vercel preview build。

## [1.4.1] - 2026-05-30

主題：**Android 登入修復**——修正 Android app 內 Google 登入後被導回首頁、無法進入主畫面的問題（#866）。
完整 diff：[v1.4.0...v1.4.1](https://github.com/redtear1115/oikos/compare/v1.4.0...v1.4.1)

### 使用者可見變化

- **Android 登入修復（#866）**：在 Android app 內用 Google 登入後，現在會直接進入主畫面，不再回到首頁要求重新登入。

### 技術變更

- **Capacitor OAuth deep link 路徑修正（#866）**：`buildAuthCallbackUrl` 已將 `/auth/callback` 接在 scheme origin 後，`appUrlOpen` handler 原本又把 `://login-callback` replace 成 `/auth/callback`，導致路徑重複（`/auth/callback/auth/callback`）回傳 404、OAuth code 從未 `exchangeCodeForSession`。改為只 strip scheme+host 前綴；並將 `appUrlOpen` listener 在首次 fire 後 `.remove()`，避免重複登入時 listener 累積。詳見 `app/[locale]/sign-in/SignInButton.tsx`。

## [1.4.0] - 2026-05-30

主題：**Android 上架 · 情境 landing 頁**——用 Capacitor 把 PWA 包成 Android app，開始 Google Play 上架流程（#846）；新增情境 use-case landing 頁，覆蓋「兩人記帳」「夫妻記帳」等搜尋入口（#851）。

### 使用者可見變化

- **Android app 上架準備（#846）**：Capacitor wrapper 完成，app icon 換成 Futari 品牌圖示，Google Play 上架流程進行中；登入改用 in-app browser 避免被導出到系統瀏覽器。
- **情境 use-case 頁（#851）**：新增「兩人記帳」「夫妻記帳」等情境入口頁，強化搜尋可見性。

### 技術變更

- **Capacitor Android wrapper（#846）**：`capacitor.config.ts` 設定 `server.url` 指向 prod，`android/` 為 Capacitor 生成的 Gradle 專案（appId `dev.southernlight.futari`）；`SignInButton.tsx` 偵測 `window.Capacitor` 並切換為 `@capacitor/browser` + deep link scheme OAuth 流程（`dev.southernlight.futari://login-callback`）；`AndroidManifest.xml` 加入 intent filter 處理 custom scheme；release signing 透過 env var 注入。
- **use-case landing 頁（#851）**：`lib/use-case/cases.ts` 為資料層，單一動態路由 `app/[locale]/use-case/[slug]/page.tsx`；4 語 i18n、OG / Twitter card、sitemap 自動衍生。

## [1.3.2] - 2026-05-30

主題：**競品搬遷頁全面鋪開 · futari = 記帳 品牌詞鞏固**——把 `/migrate/*` 從 Honeydue / Spendee / CWMoney 三頁擴成 10 個 Taiwan 競品搬遷頁，並把整個 migrate 子系統重構成 CMS / 資料驅動架構（#839 / #852 / #844）；沒有官方 CSV 匯出的 App 改走「截圖→ChatGPT→CSV」流程，新增 `futari_generic` parser 自動解析（#839）；用 structured data + site name 把 `futari = 記帳` 的品牌詞釘穩，跟同名社交 App 區隔（#843 / #845）；schema 面完成愛物 PII 加密遷移第二階段，移除車牌 / 地址 legacy 明文欄位（#837）。
完整 diff：[v1.3.1...v1.3.2](https://github.com/redtear1115/oikos/compare/v1.3.1...v1.3.2)

### 使用者可見變化

- **多了 10 個「從 X 搬到 Futari」教學頁（#839 / #844）**：Moneybook、AndroMoney、Mobills、簡單記帳、記帳城市、CashMan、1Money、iCost、隨手記、Manebo——每頁都有搬遷步驟、競品比較表、FAQ，搜尋競品名稱時找得到。
- **沒有 CSV 匯出的 App 也能搬（#839）**：在原本的 App 截圖、請 ChatGPT 整理成 CSV，再上傳即可；頁面附上可一鍵複製的提示詞，免費版 ChatGPT 就能做。
- **搜尋「futari 記帳」更容易找到正確產品（#843 / #845）**：補強 structured data 與 site name，跟同名的社交 App 區隔開。

### 技術變更

- **migrate 頁改為 CMS / 資料驅動（#852）**：競品資料（名稱、比較表、`screenshotWorkflow` flag）集中在 `lib/migrate/sources.ts`，由單一動態路由 `app/[locale]/migrate/[source]/page.tsx` 渲染；刪除 7 個個別 page 檔；sitemap / cross-link / Breadcrumb / HowTo / FAQPage / ItemList JSON-LD 全部自動衍生。i18n `pages` / `seo.migrate` 改為 `Record<MigrateSlug>`，新增來源由 tsc 強制補齊 4 語。spec: `docs/superpowers/specs/migrate-pages-design.md`。
- **新增 `futari_generic` CSV parser（#839）**：對應截圖→ChatGPT→CSV 的固定格式 `date,category,amount,description,currency,kind`；detector 以 `kind` 欄位辨識，`processBuffer` 自動 route 到 `mapFutariGeneric`（`kind` 決定收支、非 TWD 存 multi-currency tuple、import 時比照既有路徑丟回 base）。
- **structured data 品牌強化（#843 / #845）**：landing `SoftwareApplication`（`applicationCategory: FinanceApplication`）+ `alternateName` 品牌詞；layout `WebSite` + `Organization` `@id` graph；`<meta name="application-name">`、全站 OG `site_name`「Futari · 雙人記帳」、PWA manifest `name`。
- **schema — 愛物 PII 加密遷移第二階段（#837，destructive）**：移除愛車 legacy 明文 `plate` / `address` 欄位（`0053_drop_legacy_plate_address.sql`），readers 不再讀明文。**部署時** dev / prod 都要套此 migration，套之前先重跑一次 backfill `DRY_RUN=1` 確認 `plate=0 address=0`。
- **i18n 待確認**：5 個 P2 頁與共用 workflow 的 en / ja 文案標記 `// TODO(#839) pending native review`；zh-TW 為主稿、zh-CN 已跟進。

## [1.3.1] - 2026-05-30

主題：**公開 surface 清掃 · 愛物 PII 加密第一階段**——對 `/` 跟所有 non-login surface 跑了一輪 `/impeccable critique → polish → audit` 循環，把絕對 ban 的 side-stripe border 拆掉、補齊 WCAG AA 對比、把 landing 拉出 editorial-typographic reflex lane、四語 em dash 一次掃除（#828）；landing hero 字級升級＋PhonePreview 換上真實 `CategoryChip` / `AssetIcon`，順手修掉 logout 卡在 `/settings` 的 server-action redirect bug（#833）；把 dev server 啟動流程固定成 `run-oikos` project skill（#834）；愛物 PII 加密第一階段——車牌、房屋地址、孩子全名加密落庫、tap-to-reveal UI、backfill 腳本（#826 / #835 / #838）。
完整 diff：[v1.3.0...v1.3.1](https://github.com/redtear1115/oikos/compare/v1.3.0...v1.3.1)

### 使用者可見變化

- **邀請失敗的紅框不再像警報（#828, #829）**：拿掉 side-stripe + ⚠️ icon，改成溫和的 clay tint，伴侶第一次點壞掉的邀請連結不再被嚇到。
- **小字終於看得清楚（#828, #830）**：legal page 的「最後更新日期」、MADE IN TAIWAN 微標、migrate FAQ 答案等灰字全面加深到 WCAG AA 4.5:1 對比。
- **手機 landing tagline 變主角（#833, #832）**：「兩個人，一本帳。」字級加大、行高收緊、tracking 收進去，現在是首屏視覺中心。
- **首頁手機卡裡的 chip 和 dashboard 看起來一致（#833）**：PhonePreview 不再用 emoji 跟 placeholder dot，feed chip 顯示真實的「食 / 住 / 醫」、asset chip 顯示真實的 SVG glyph。
- **登出後乾淨跳到 `/`（#833）**：原本登出有時候卡在 `/settings`，現在會正確落回暖色 landing 頁。
- **桌面看 Privacy / Terms 不再像小紙條（#828）**：寬度從 mobile shell 拉到 max-w-2xl。
- **MigrateComparison 表格非顏色 cue（#828）**：「✓ / ◐ / —」加在每個 cell 前面，色弱使用者不再只能靠顏色判斷狀態。
- **車牌可加密儲存（#826, #835）**：愛車 detail 頁，車牌預設遮罩 `●●●●●●`、點「顯示」才解密；assets 列表的車牌 chip 一律遮罩。
- **房屋地址可加密儲存（#826, #835）**：house detail 頁 header subtitle 跟 InfoCard 都套上遮罩 + tap-to-reveal。
- **小孩可加上加密的「全名」（#826, #838）**：小孩編輯表單新增「全名」optional 欄位，detail 頁多一個「全名」row，遮罩預設、tap 解密。`name` 維持顯示用的「小名」不變，現有資料不被動到。

### 技術變更

- **Side-stripe border 拆除（#828 / #829）**：`InviteConfirm` 對齊 `LeaveGroupFlow` 的 alert 形狀（無 border、無 icon、`--debit-soft` 暖底）；`MigrateIntroCallout` 改用 `--surface-alt` tonal step。Absolute ban 違規清零。
- **WCAG AA token-level 修正（#828 / #830）**：`--ink-3` 從 `#B89C8B`（2.24:1）加深到 `#82654F`（4.66:1）；新增 `--debit-text` token（clay shifted 60% toward cocoa-ink，4.87:1 on `--debit-soft`）；section kickers 從 `--accent`（2.34:1）降階到 `--ink-2`（5.51:1）。`LandingCtaLink` 補 `focus-visible:oik-focus-ring`。Landing 手機 `<h1>` 從 wordmark 換成 tagline（screen-reader 導航落地點變正確）。
- **Editorial reflex 結構重整（#828 / #831）**：Landing Features 從 4-card grid → editorial column（hanging italic-Fraunces 數字 + glyph-accented title + body）；Trust 全段 narrative 升格成 24-34px serif 獨白；MigrateSteps / MigrateDifferentiators / MigrateTrustBlock / MigrateFaq / MigrateComparison / MigrateOtherSources 的 h2 從 italic-Fraunces ALL-CAPS tracked 降階成 plain Noto Sans TC 20-22px medium。
- **Em dash 全 locale 掃除（#828 / #831）**：依語境逐句改寫，zh-TW 10 條 / zh-CN 9 條 / ja 16 條 / en ~60 條 user-visible 字串清理；JSDoc 註解內的 em dash 保留（非 user-visible）。
- **手機 hero tagline 字級升級（#833 / #832）**：從 `fontSize: 26 / lh 1.45 / -0.3px` 改為 `clamp(34px, 9vw, 56px) / lh 1.15 / -1px`。
- **PhonePreview 套真實元件（#833 / #832）**：feed icon 從 `·` placeholder 換成 `<CategoryChip categoryId="dining|housing|health" size={28}>`；asset chip 從 emoji 換成 `<AssetIcon type="house|car|child|pet|plant" size={20}>`，跟 `/dashboard` 共用同一 source of truth。
- **Logout server-action redirect fix（#833）**：`LogoutButton` 拿掉 `useTransition` 包裝（React transition 會吞掉 `NEXT_REDIRECT` 的 throw），改用 plain `useState` 管 pending state。加 `window.location.replace('/')` safety net。`signOut()` 重新導向目標從 `localizedSignInPath` 改成新的 `localizedHomePath`。
- **`run-oikos` project skill（#834）**：`.claude/skills/run-oikos/{SKILL.md,smoke.sh,.gitignore}`。idempotent driver：偵測 `@next/bundle-analyzer` 缺裝就自動 `npm install`、檢查 Node ≥20、檢查 `.env.local`、`nohup npm run dev` background 啟動、poll `Ready in` signal、smoke `/` `/zh-TW` `/dashboard`，留著跑、`--stop` 一鍵收。
- **愛物 PII 加密 schema（#826 / #835）**：migration `0052_encrypt_asset_pii_columns.sql` 在 `Assets` / `CarDetails` / `HouseDetails` 加三個 nullable encrypted 欄（`name_encrypted` / `plate_encrypted` / `address_encrypted`），舊欄位保留作 dual-write 過渡。Drop legacy columns 留 #837（v1.3.2）。
- **加密 / 解密路徑（#826 / #835 / #838）**：`createCar` / `editCar` / `createHouse` / `editHouse` 加 dual-write；`createChild` / `editChild` 把 `fullName` 加密寫到 `Assets.name_encrypted`（trinary semantics 跟 nationalId 一致：undefined = keep、null = clear、string = encrypt set）。新 server actions `revealCarPlate` / `revealHouseAddress` / `revealChildName`，認證契約對齊既有的 `revealChildPii`（group ownership + asset.type + 非 soft-delete），plate / address 在 backfill 完成前 fallback 讀 legacy plaintext。`childHasFullName: boolean` 走 `AssetSheetInitial`，sheet 表單對齊 nationalId 的「先前已加密」placeholder + 「清除」按鈕 pattern。
- **共用 `RevealableRow` 元件（#826 / #835）**：從 `ChildDetailClient` 的 inline 元件抽到 `app/(dashboard)/_components/RevealableRow.tsx`。Caller bind 自己的 server action callback，元件處理 mask / pending / error translation / aria。`ChildDetailClient` 用共用版本渲染「全名」row，nationalId / nhiNo 仍走原 inline 版（cleanup 留 follow-up）。新增四語 `assetDetail.reveal.{show,hide,loading,error}` 共用 i18n key。
- **Backfill 腳本（#826 / #835）**：`scripts/encrypt-existing-pii.mjs` Node script，AES-256-GCM (`iv:authTag:ciphertext` hex)，idempotent、`DRY_RUN=1` 支援、讀 `DATABASE_URL`（後續 fix）／fallback `POSTGRES_URL`。
- **Drizzle journal 補回（#826 / #835）**：journal 之前漂移到 idx 50，這次補了 idx 52（idx 51 來自其他來源，留原狀）。
- **package-lock.json 版本 stamp 對齊（#833）**：lockfile 之前停在 1.2.4，這次跟 package.json 一起補進 1.3.0。

## [1.3.0] - 2026-05-27

主題：**觀測補強 · 行為事件埋點**——補齊記帳之後的 PostHog 行為事件（P0 核心黏著：`record_created` / `settlement_created` / `income_created`；P1 功能採用：旅行、愛物、定期規則；P2 關係：`group_left` / 伴侶問答 / 角色互換 / 幣別切換）；修正 Google OAuth 頭像在 next/image 的 remotePattern 缺漏。

### 使用者可見變化

- **Google 頭像正確顯示（#820）**：以 Google 帳號登入的使用者，頭像不再顯示為名字縮寫。

### 技術變更

- **PostHog 行為事件補齊（#811–#819）**：在 9 個 server action 埋入 11 個事件，涵蓋 P0 核心黏著（`record_created` 帶 split_type / category / currency 等屬性、`settlement_created` 帶 amount_bucket / direction、`income_created`）、P1 功能採用率（`trip_created` / `trip_ended` 帶 expense_count + duration_days、7 種愛物的 `asset_created`、`recurring_rule_created`）、P2 關係 / churn（`group_left`、`partner_quiz_started` / `partner_quiz_completed`、`swap_confirmed`、`base_currency_changed`）。全部走既有 `captureServer()` seam，不含原始金額或 PII。`createSettlement` / `createIncome` 補上遺漏的 `user` destructuring。`endTrip` transaction 改回傳 `{ row, expenseCount }` 供 `trip_ended` 記錄規模。
- **Google 頭像 remotePattern（#820）**：`next.config.ts` 補上 `lh3.googleusercontent.com`，修正 Google OAuth 頭像被 next/image 回 400 的問題。

## [1.2.5] - 2026-05-27

主題：**效能基礎建設 + 細節打磨**——DB 複合索引補齊（CashTransactions / Settlements）、Avatar 遷移到 next/image（AVIF/WebP + srcset）、bundle analyzer 接入、BrandHeader icon-only 按鈕 first-use hint、ja i18n 修正、font-semibold 全站清理。
完整 diff：[v1.2.4...v1.2.5](https://github.com/redtear1115/oikos/compare/v1.2.4...v1.2.5)

### 使用者可見變化

- **BrandHeader icon 按鈕首次使用提示（#765）**：✈ 旅行按鈕與頭像堆疊在第一次進入 dashboard 時出現小標籤說明用途，3.5 秒後自動消失，之後永不再顯示。
- **日文 balance 描述修正（#764）**：`があなたに貸し中`（語意反置）→ `があなたから借り中`（對方欠你，語意正確）。

### 技術變更

- **DB 複合索引（#800）**：`CashTransactions` 和 `Settlements` 補上 `(group_id, transacted_at DESC, created_at DESC) WHERE deleted_at IS NULL`，對齊 `IncomeTransactions` 既有 index，消除 records feed / dashboard / balance recalc 的 sequential scan。
- **Avatar 遷移 next/image（#799）**：從 raw `<img>` 改為 `next/image`，輸出 AVIF/WebP + responsive srcset，Supabase remotePatterns 已配置。
- **Bundle analyzer 接入（#801）**：安裝 `@next/bundle-analyzer`，`npm run analyze` 可開 HTML 報告，建立 JS bundle baseline。
- **font-semibold 全站清理（#766）**：weight 600 已回退為 500（render-blocking CSS 精簡），將所有 `font-semibold` callsite 誠實改為 `font-medium`，共 62 個檔案，無視覺變化。
- **SCHEMA_LANG 集中化（#346）**：`lib/i18n/seo.ts` 統一輸出 BCP-47 locale map，移除 `MigrateFaq` / `MigrateHowToJsonLd` 重複定義。

## [1.2.4] - 2026-05-26

主題：**settings 一輪精煉 + split ratio viewer 邊界補完 + dashboard 接上 Impeccable**——settings 頁面從清理開始（dead i18n keys / props、chevron a11y、token 對齊、query 收斂 #778）、補直接登出入口（#780）、重畫 loading skeleton 對齊真實版面（#779）、把預設分攤比例改成 optimistic 即時存（#782）；同步修掉分攤比例在 member B 視角顯示反邊的 bug（#785）、把 guardian 描述殘留的「DB」技術詞拿掉（#781）；dashboard 接上 Impeccable 設計脈絡（PRODUCT.md / DESIGN.md / 設計系統 token，#760 / #761）；README 版本歷史回填 v1.1.3–v1.2.3（#767）。
完整 diff：[v1.2.3...v1.2.4](https://github.com/redtear1115/oikos/compare/v1.2.3...v1.2.4)

### 使用者可見變化

- **分攤比例即時存（#782）**：在 settings 改預設分攤比例不再需要按「儲存」，拖完就生效；server 失敗自動 rollback 並提示。
- **/settings 加直接登出入口（#780）**：登出從 avatar 選單裡撈出來，settings 頁面就有按鈕。
- **settings loading skeleton 對齊真實版面（#779）**：載入時顯示的骨架對齊真實內容區塊，不再閃爍跳動。
- **member B 看分攤比例視角修正（#785）**：分攤比例（如 60/40）以 viewer 為主視角，member B 不再看到反過來的數字。
- **守護描述去掉技術詞（#781）**：原本含「DB」的字樣改成自然語言描述，避免只有工程師看得懂的縮寫（zh-TW / zh-CN / ja）。
- **dashboard 一輪語言／色彩／結構微調（#761）**：balance 描述「欠」→「待還」（witnessing tone）、L3 filter 收成「篩選」chip、tokens flat-by-default、witnessing color。

### 技術變更

- **settings 清理（#778）**：移除 dead i18n keys、dead prop、補 `aria-hidden` 在 chevron icon、合併重複的 query、tokens 對齊。
- **SplitRatioSection optimistic save + rollback（#782）**：拖完即送 server action，本地即時更新；server 失敗 rollback 並 surface error，消除「按了沒生效」與「沒按就丟失」兩種失誤狀態。
- **Split ratio viewer/perspective 邊界補完（#785）**：`lib/splitRatio.ts` 抽出 viewer-aware perspective helper，AddSheet / CompactRow / RecurringRuleSheet 三處 UI ↔ DB 邊界統一走同一份；新增 `tests/splitRatio.test.ts` + `tests/balance-weighted.test.ts` 全面覆蓋兩個 member 視角的所有 split type。
- **`SegmentedToggle` 抽共用 primitive（#761）**：BalanceHero / MemberDualToggle / ModeTogglePlaceholder 三處重複的 segmented control 抽到 `components/ui/SegmentedToggle.tsx`，視覺與行為由 design token 統一控制；新增 `tests/SegmentedToggle.test.tsx` / `tests/DashboardFilterRow.test.tsx`。
- **Impeccable 設計脈絡進專案（#760）**：新增 `PRODUCT.md`（策略：who / what / why、register、anti-references、5 條設計原則）+ `DESIGN.md`（視覺系統：色票、字體、elevation、元件、Do's/Don'ts，Stitch 六段格式）+ `.impeccable/design.json`（延伸層）；CLAUDE.md 加段「設計脈絡」指引；`skills-lock.json` pin 住 Impeccable skill 版本。
- **README 版本歷史回填 v1.1.3–v1.2.3（#767）**：README `## 版本歷史` 表之前漂移 ~10 版（#757 才發現），這次回填補齊；release skill 加 step 7「每次發版必須更新該表」防再次漂移。

## [1.2.3] - 2026-05-25

主題：**records 邊角修正 + profile 無障礙整備**——補一批 records 正確性／體驗缺口（手動輸入金額沒上限、篩選金額範圍顛倒會靜默清空列表、收支 tab 展開時當月總計消失），並把「個人資料」面板（avatar 選單）做一輪無障礙整備（共用 SheetFrame 的 dialog 語意 + focus trap、分攤方式改 radiogroup），順手修掉點「幣別」沒反應的導航 bug。
完整 diff：[v1.2.2...v1.2.3](https://github.com/redtear1115/oikos/compare/v1.2.2...v1.2.3)

### 使用者可見變化

- **點「幣別」沒反應修正（#757）**：在「個人資料」面板點「幣別」現在會正確開啟幣別設定，不再沒反應。
- **收支 tab 展開保留當月總計（#757）**：展開收支統計時，最上方補回「支出·收入·淨收入」總結行（#747 換成日趨勢圖後，該行只在此 tab 遺漏）。
- **手動輸入金額上限（#757）**：交易／收入金額超過上限會被擋下並友善提示，與 CSV 匯入一致，不再因超出整數範圍跳出原始資料庫錯誤。
- **篩選金額範圍自動對調（#757）**：篩選金額下限大於上限時自動對調，不再靜默清空整個列表（與日期範圍一致）。
- **個人資料面板無障礙改善（#757）**：avatar 選單面板補上正確的 dialog 語意與焦點管理；預設分攤方式選擇器，螢幕報讀器可辨識目前選取的選項。

### 技術變更

- **金額上限單一來源（#757）**：`MAX_AMOUNT` 收斂到 `lib/validators`，交易／收入驗證器以 opt-in 上限套用、CSV 匯入沿用同一常數；資產價格（房子等）維持不設上限。前端 `AddSheet` / `IncomeSheet` 同步擋下並顯示 `amountTooLarge`。
- **`resolveTxnFilter` 抽共用（#757）**：誰付→uuid 收斂與 cross-kind cut 規則抽成 `lib/resolveTxnFilter.ts`，SSR（`records/page.tsx`）與分頁 loader（`actions/transaction.ts`）共用同一份，避免兩處漂移。
- **AvatarMenuSheet 改用 SheetFrame（#757）**：移除手刻 sheet chrome，改用共用 `SheetFrame`（`role="dialog"` / `aria-modal` / focus trap）；`EditTextSheet` 補 dialog 語意；分攤方式選擇器改 `radiogroup` + `aria-checked`。
- **幣別導航延後到面板返回落地（#757）**：幣別列改走 `runAfterSheetCloseBack`，避免與關面板同 tick 導航被合成 `history.back()` revert（#745／#752 同類 race，這次落在導航而非篩選）。
- **loading skeleton 對齊版面（#757）**：records `loading.tsx` 補上 L1 標題 + L2 收支切換 placeholder，消除載入時版面位移（CLS）。
- **i18n（#757）**：新增 `addSheet`/`incomeSheet.errors.amountTooLarge`、`settings.defaultSplitLabel`（4 語；ja／en 待 native 複查）。

## [1.2.2] - 2026-05-25

主題：**收支 tab 看見當月節奏 + records 篩選體驗修正**——records 同時看支出與收入時，把該 tab 的分類圓環換成一張當月日趨勢圖（每日收入／支出長條 + 累計淨額折線），讓人一眼讀出「這個月的節奏長怎樣、月底落在淨流入還是淨流出」；同時修一批 records 篩選體驗 bug：付款人篩選沒同步過濾下方列表、月度統計展開時當月總額消失、按「套用」後網址被關面板的返回動作還原、每日趨勢圖與支出圓餅圖沒套到全部篩選維度。
完整 diff：[v1.2.1...v1.2.2](https://github.com/redtear1115/oikos/compare/v1.2.1...v1.2.2)

### 使用者可見變化

- **收支 tab 當月日趨勢圖（#747）**：在 records 同時選「支出 + 收入」時，原本的分類圓環改成一張當月日趨勢圖——每日支出長條朝下、收入朝上共用中央零線，外加一條累計淨額折線，末點依當月落在淨流入／淨流出染綠或橘。月內每一天都在軸上，沒有紀錄的日子留白、不壓縮時間軸。
- **篩選「我付的／對方付的」同步過濾列表（#745）**：在 records 頁用付款人篩選時，下方紀錄列表現在會跟著篩選，不再仍顯示全部紀錄。
- **月度統計展開時保留當月總額（#746）**：展開月度統計面板時，最上方保留一行當月收支總結，總額不再因為數字只放在圓環中心而消失（圓環中心會在點某分類時切換成該分類金額，且進帳模式 / 純收入月份不一定畫圓環）。
- **按「套用」後篩選確實生效（#752 / #753）**：在 records 頁按「套用」後，網址會帶上篩選且實際生效，不再被關閉篩選面板的返回動作立即還原。
- **每日趨勢圖跟著篩選（#747 後續 / #753）**：收支 tab 的每日趨勢圖現在和上方收入／支出圓餅圖一樣，套用所有篩選維度（誰付、分攤、分類、愛物、金額、狀態、負擔方）。
- **只篩收入分類時支出圓餅圖留空（#753）**：只篩「收入分類」時，支出圓餅圖會正確留空，與紀錄列表、收入圓餅圖一致。

### 技術變更

- **收支 tab 日趨勢圖（#747 / PR #750）**：新增 `DailyTrendChart`（dep-free inline SVG，沿用 donut「不引 chart lib」的決策、Recharts 仍排除）；資料源 `lib/db/queries/transactions.ts#dailyTrendByMonth`（zero-fill 月內每一天）；色票 `lib/chartPalette.ts` 加 `TREND_EXPENSE_COLOR` / `TREND_INCOME_COLOR`。bars 依當月單日最大值、累計折線依累計最大擺幅，各自 scale 共用中央零線，避免月末累計值壓扁單日 bar。spec 見 `docs/superpowers/specs/stats-design.md`。
- **付款人篩選 clean remount（#745 / PR #749）**：records feed 的 React `key` 加入結構化篩選簽名（`filterKey`），讓篩選變更與 drill / date-range 一致地觸發 clean remount，直接採用已在 SSR 過濾好的 `initial`，不再單靠 client refetch effect 同步。
- **統計展開保留總結（#746 / PR #748）**：`MonthlyStatsView` 展開狀態在 donut 上方加一行 `SummaryText`（收入 / 支出 / 淨額），把月總結從只靠 donut 中心（會被 drill 取代、進帳模式 / 純收入月份不畫 donut）獨立出來。
- **每日趨勢圖套完整 filter（#753）**：`dailyTrendByMonth` 改套完整 filter：expense branch 重用 `statsScopeClauses`（與 `monthlyStatsByCategory` 同一組 WHERE）、income branch 比照 `monthlyIncomeStatsByCategory`，`MonthlyStatsSection` 把 `filter` / `incomeFilter` 一併傳入；`cutAll` 時直接略過該 branch 的查詢回傳空，對齊圓餅圖的 cross-kind cut 行為。
- **純收入篩選下支出 donut 留空（#753）**：`monthlyStatsByCategory` / `monthlyStatsByAsset` 補上 `if (filter?.cutAll) return []` 早退（對齊 income donut `incomes.ts` 的做法），修正支出圓餅圖在純收入篩選下未留空的問題。
- **套用導航延後到面板返回落地（#752 / #753）**：`handleApplyFilter` 不再與面板關閉同一個 tick 內 `router.replace`：面板 backdrop 為了「Back 關面板」會在開啟時 push 一筆合成 history、關閉時 `window.history.back()`（`useEscapeToClose`），與導航同 tick 時這個 back 會在 `router.replace` 之後落地、把篩選網址 revert 回去。新增 `lib/sheetNavigation.ts#runAfterSheetCloseBack`，把導航延到該合成返回的 `popstate` 落地後再執行；`history.back()` 是非同步的，`requestAnimationFrame` / `setTimeout(0)` 都會搶在 popstate 前面，只有監聽 popstate 才可靠。同時移除 #752 加上的 `startTransition`（`router.replace` 內部本身就是 transition，該包裝對此問題無效）。

## [1.2.1] - 2026-05-25

主題：**觀測性收尾——PostHog reverse proxy + Sentry 設定補齊**——把 v1.1.7~v1.2.0 接上的分析 / 錯誤追蹤實際接通：PostHog 改走 managed reverse proxy（#738），降低被瀏覽器隱私 / 廣告攔截外掛擋下的比例；Sentry 補上確認的 org / project slug 並啟用 logs（#739）。純後端設定，對使用者無可見變化。
完整 diff：[v1.2.0...v1.2.1](https://github.com/redtear1115/oikos/compare/v1.2.0...v1.2.1)

### 使用者可見變化

_本版無使用者可見變化（觀測性設定補齊）。_

### 技術變更

- **PostHog managed reverse proxy（#738 / PR #740）**：分析事件改走 managed reverse proxy，提升事件抵達率（減少被攔截外掛擋下）。
- **Sentry org / project slug + logs（#739 / PR #741, #742）**：填上確認的 Sentry slug、啟用 logs，讓 v1.1.7 接上的錯誤追蹤實際送達。

## [1.2.0] - 2026-05-24

主題：**看見光從哪裡來——入口轉換追蹤**——為三個入口面（首頁 `/`、migrate 著陸頁 `/migrate/*`、伴侶邀請）接入 PostHog 轉換漏斗事件，量測「來訪 → 註冊 / 加入」的轉換率並歸因到來源。維持既有 cookieless（`persistence: 'memory'`、免同意橫幅）立場：OAuth 邊界以 server-side alias 串接匿名與註冊後事件，不新增 cookie / localStorage。本版對使用者無可見變化。
完整 diff：[v1.1.8...v1.2.0](https://github.com/redtear1115/oikos/compare/v1.1.8...v1.2.0)

### 使用者可見變化

_本版無使用者可見變化（純後端分析事件接入）。_

### 技術變更

- **轉換分析事件層（#734）**：新增 `lib/analytics/`——client `track()` 與 server `posthog-node`（`captureServer` / `aliasServer`）兩個 gated seam，事件僅在 `NODE_ENV === 'production'` 且有 key 時送出。涵蓋 pre-auth client 事件（`landing_cta_clicked`、`migrate_file_selected`、`migrate_preview_shown`、`migrate_preview_failed`、`migrate_cta_clicked`、`sign_in_started`）、auth boundary server 事件（`signed_up` / `signed_in`）、啟用事件（`setup_completed`、`first_record_created`、`import_completed`）與邀請漏斗（`invite_created`、`invite_link_opened`、`partner_joined`）。
- **跨 OAuth 邊界歸因**：`SignInButton` 把匿名 `distinct_id` + `from` 夾帶進 OAuth `redirectTo`，`/auth/callback` 以 `posthog-node` `alias()` 把 pre-auth 匿名事件串到註冊後的 user，`persistence: 'memory'` 維持不變。歸因軸 `entry_source`（`landing` / `migrate_*` / `invite` / `direct`）寫為 `$set_once` person property。
- **新依賴 `posthog-node`**（server-side capture / alias）。
- 設計見 `docs/superpowers/specs/conversion-analytics-design.md`。

## [1.1.8] - 2026-05-21

主題：**修正收合狀態 hydration 閃退 + PostHog 收斂到 production**——修掉 v1.1.7 (#726) 引入的 hydration mismatch：餘額卡與月度統計改用 `useState` lazy-init 直接讀 localStorage，讓「曾收合過」的使用者一載入就觸發 React #418（收合任一區塊後重新整理即重現）；改以 cookie 持久化，讓 server 端就 render 正確的收合狀態，根治 mismatch 又保留無閃爍。同時把 PostHog 收斂成只在 production 初始化，避免本機開發把事件送進正式專案。
完整 diff：[v1.1.7...v1.1.8](https://github.com/redtear1115/oikos/compare/v1.1.7...v1.1.8)

### 使用者可見變化

- **收合區塊載入不再閃退（#418 / #726）**：曾收合過儀表板餘額卡或紀錄頁月度統計的使用者，重新載入頁面不再出現畫面閃爍或錯誤，直接以正確的收合狀態呈現。

### 技術變更

- **收合 / 關閉偏好改 cookie 持久化（#731）**：`MonthlyStatsView`（collapsed）、`BalanceHero`（hero collapse + include-pending）、`ContextStrip`（partner-left dismissed + trip collapsed）由 `useState(() => localStorage…)` lazy-init 改為 server component 讀 cookie → 以 prop 傳入初始值，SSR 與 client 首次 render 一致，根治 React #418。新增 `lib/uiPrefsCookie.ts` 收斂 cookie 名稱與 server 讀 / client 寫 helper。既有使用者的這些 localStorage 偏好會 reset 一次後改由 cookie 持久化。
- **PostHog production gate（#731）**：`app/providers.tsx` / `app/posthog-pageview.tsx` 以 build-time `POSTHOG_ENABLED`（`NODE_ENV === 'production'` 且有 key）gate 住 init 與 pageview——本機 dev 不再送事件到正式專案，並消除缺 key 時的 "initialized without a token" warning。

## [1.1.7] - 2026-05-21

主題：**可觀測性接入 + 兩處體驗修正**——接入 Sentry 錯誤追蹤（#719）與 PostHog 產品分析（#720）兩套觀測工具，兩者皆只在 production 送出、本機開發不外送；Sentry 在送出前移除 cookie / header 做 PII scrubbing，PostHog 採 cookieless（memory persistence）模式免同意橫幅。另修兩個體驗 bug：在愛物 Sheet 內切換類型後 Android 返回鍵會誤離開 App 而非收起 Sheet（#723），以及儀表板餘額與月度統計的收合狀態在載入時會先閃一下（#726）。
完整 diff：[v1.1.6...v1.1.7](https://github.com/redtear1115/oikos/compare/v1.1.6...v1.1.7)

### 使用者可見變化

- **切換愛物類型後返回鍵正確收起 Sheet（#723）**：在新增 / 編輯愛物的 Sheet 內切換類型（如 Child → Pet）後，按 Android 系統返回鍵會正確收起 Sheet，而不是直接離開 App。
- **載入不再閃動收合狀態（#726）**：儀表板餘額卡片與紀錄頁月度統計的展開 / 收合偏好在頁面載入時直接以正確狀態呈現，不再先展開再跳收合。

### 技術變更

- **Sentry 錯誤追蹤（#719）**：以 `@sentry/nextjs` v10 手動接入 Next.js 16 App Router（不走 wizard）——client 用 `instrumentation-client.ts`（Turbopack 下取代已棄用的 `sentry.client.config.ts`），server / edge config 由 `instrumentation.ts` 的 `register()` 載入並 export `onRequestError` 涵蓋 Server Component / Route Handler / middleware，`app/global-error.tsx` 接 top-level render error，`next.config.ts` 以 `withSentryConfig` 包裹（保留既有 Serwist wrapper）。`enabled: NODE_ENV === 'production'` 故本機不送；`beforeSend` 移除 request cookie / header。Vercel 環境變數與 Sentry org slug 待填。
- **PostHog 產品分析（#720）**：`app/providers.tsx` 初始化 PostHog，cookieless（`persistence: 'memory'`）免同意橫幅、`person_profiles: 'identified_only'`；`app/posthog-pageview.tsx` 以 Suspense 包 `useSearchParams` 手動送 `$pageview`。
- **useEscapeToClose key-change remount（#723）**：以 render-phase `openRef` 讓 cleanup 能分辨「真正關閉」與「keyed body 換 key 重掛」，後者不呼叫 `history.back()`，避免與新實例的 `pushState` 競爭而吃掉一筆 history。補上 vitest 覆蓋。
- **localStorage 收合狀態改 lazy initializer（#726）**：`useLocalStorageBoolean` 與 MonthlyStatsView 的 collapsed 改在 `useState` lazy initializer 讀 localStorage（SSR fallback 預設值、try/catch 防 private mode），移除 mount 後再 `setState` 造成的 flash；寫入亦包 try/catch。
- **文件（doc-keeper sweep）**：`.env.local.example` 補 Sentry 環境變數、CLAUDE.md 架構速查補觀測段。

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

[Unreleased]: https://github.com/redtear1115/oikos/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/redtear1115/oikos/compare/v1.4.3...v1.5.0
[1.4.3]: https://github.com/redtear1115/oikos/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/redtear1115/oikos/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/redtear1115/oikos/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/redtear1115/oikos/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/redtear1115/oikos/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/redtear1115/oikos/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/redtear1115/oikos/compare/v1.2.5...v1.3.0
[1.2.5]: https://github.com/redtear1115/oikos/compare/v1.2.4...v1.2.5
[1.2.4]: https://github.com/redtear1115/oikos/compare/v1.2.3...v1.2.4
[1.2.3]: https://github.com/redtear1115/oikos/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/redtear1115/oikos/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/redtear1115/oikos/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/redtear1115/oikos/compare/v1.1.8...v1.2.0
[1.1.8]: https://github.com/redtear1115/oikos/compare/v1.1.7...v1.1.8
[1.1.7]: https://github.com/redtear1115/oikos/compare/v1.1.6...v1.1.7
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
