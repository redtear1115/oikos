# Oikos — Agent Guide

> 家庭記帳工具，對使用者顯示為 **Futari**；codebase 用 Oikos。
> 固定兩人（夫妻／伴侶）使用。Mobile-first PWA。

這份是 agent 工作指南——架構、domain model、慣例、邊界。要把專案跑起來或部署，看 [README.md](README.md)。動文案、判讀指標、做產品取捨之前，看 [PRODUCT.md](PRODUCT.md)：各 surface 的意圖與「哪些低數字是預期的」寫在那裡。視覺 token 與元件規則在 [DESIGN.md](DESIGN.md)。後兩份由 Impeccable 維護，改動前先讀「設計脈絡（Impeccable）」那段。

---

## ⚠️ Next.js 版本提醒

This is **Next.js 16** with breaking changes. APIs, conventions, and file structure differ from your training data. Read `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## 目前狀態

**Latest released: v1.5.14** — 版本歷史見 [CHANGELOG.md](CHANGELOG.md)（1.0.0 起算；v0.x 只在 git tag）

## Backlog / 未釋出版本

`v0.x` 每版工時目標 ~2 週；`v1.0.0+` 是 phase 級別範圍，工時不固定。主題敘事用來決定 changelog 文案與 release 重點。每個版本對應一個 GitHub milestone — 詳細 issues 進度看 milestone 頁面，不在本檔維護。

| 版本 | 主題 |
|---|---|
| [v1.6.0](https://github.com/redtear1115/oikos/milestone/55) | 出團多人旅行（付費功能） |
| [v1.7.0](https://github.com/redtear1115/oikos/milestone/60) | 出遊．揪團一起記——多方分帳的擴散獲客 |
| [v2.0.0](https://github.com/redtear1115/oikos/milestone/2) | 買斷層．長線一起守 |
| [v3.0.0](https://github.com/redtear1115/oikos/milestone/3) | 訂閱層．AI 與資產管家 |

→ 沒指派 milestone 的候選：[no-milestone issues](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+no%3Amilestone) · [`backlog` 標籤](https://github.com/redtear1115/oikos/issues?q=is%3Aopen+label%3Abacklog)

---

> 策略背景與市場分析見 [oikos-competitive-analysis.md](docs/superpowers/oikos-competitive-analysis.md) · [user-feedback-analysis.md](docs/superpowers/user-feedback-analysis.md)

---

## 架構速查

```
寫入路徑：Client → Server Action → Drizzle → Supabase Postgres
讀取路徑：Server Component → Drizzle → Postgres
Realtime：Client subscribes → React state mutation
```

- Server Actions：`actions/`
- DB queries：`lib/db/queries/`
- Validators：`lib/validators.ts`
- Realtime：`app/(dashboard)/_components/RealtimeProvider.tsx`
- i18n：`lib/i18n/`（server `getTranslations()` → dashboard layout `<TranslationsProvider>` → client `useTranslations()`；4 語。public 頁走 URL prefix `app/[locale]` 並寫入 locale cookie，dashboard 讀該 cookie——`proxy.ts › isPublicLocalizedPath()` 是分岔點）
- Migrate（競品搬遷 SEO 頁）：`lib/migrate/sources.ts`（source registry：competitor facts + comparison + `screenshotWorkflow` flag）→ 單一動態路由 `app/[locale]/migrate/[source]/page.tsx`；sitemap / cross-link / JSON-LD 全部自動衍生。非匯出 App 走截圖→ChatGPT→CSV（`futari_generic` parser，見 `lib/csvImport/`）。spec: [migrate-pages-design.md](docs/superpowers/specs/migrate-pages-design.md)
- Schema：`lib/db/schema.ts`
- Migrations：`drizzle/`
- Specs：`docs/superpowers/specs/`
- 觀測：Sentry 錯誤追蹤（client `instrumentation-client.ts`／server `sentry.server.config.ts`＋edge `sentry.edge.config.ts`，由 `instrumentation.ts` 的 `register()` + `onRequestError` 載入；`next.config.ts` 以 `withSentryConfig` 包裹）＋ PostHog 分析（`app/providers.tsx`）。皆只在 `NODE_ENV === 'production'` 送出。**做數據分析前必讀 [observability-design.md](docs/superpowers/specs/observability-design.md)**——觀測的結構性邊界（症狀是查詢靜默回 0 筆、沒有任何錯誤，不是你 SQL 寫錯）與讀數據的紀律（第 0 條：引用任何事件指標前，先 grep 它的發送點）都在那裡。

### 編輯模式

「編輯」= soft delete + insert（atomic DB transaction）。DB 層不支援 UPDATE。`deleted_at` 超過 1 年由 pg_cron 物理刪除。

---

## Domain Model 速查

Entity 目錄、Entity 關係、Balance 計算規則、分類色 token 見 [domain-model-design.md](docs/superpowers/specs/domain-model-design.md)。

---

## Worktree 工作流

- **修改一律開 worktree**：任何會寫檔或動 git 狀態的任務（feature / fix / chore / docs）都先開 worktree，在裡面做事；main checkout 只做讀取。原因：main checkout 被多個平行 session 共用，HEAD 可能在指令之間被切走。
- **位置統一 `.claude/worktrees/{issue_no}-{slug}/`**（例 `.claude/worktrees/946-solo-trip-epoch/`；沒有對應 issue 就只留 slug）。feature branch 名取自任務上下文（`feat/...` / `fix/...` / `chore/...`），開 worktree 時直接 `git worktree add .claude/worktrees/<dir> -b <branch> main`。
- 工作模式不變：在本 session 依序做（一次一個任務）；平行背景 agent 只在明確要求時用，且各自有自己的 worktree。委派與否依全域 Orchestration 政策。
- **兩套 worktree 各管各的情境**：主 session 的任務 worktree 用上述 `.claude/worktrees/{issue_no}-{slug}/` 手動慣例；平行 subagent 的隔離交給 harness 的 `isolation: "worktree"`（自動建立與回收，不落在此路徑）。
- Worktree 缺 `.env.local` 時從 main checkout `ln -s`，不要 copy（copy 會在 key 輪替後 silently drift）。
- 做 iOS 原生工作的 worktree，開完先 `npx cap sync ios`（`cap sync` 產物沒進版控，乾淨 checkout 缺這步 Xcode 會開不起來）。`out/` 不必手動建——`capacitor:copy:before` hook 會建目錄並產生殼內離線頁（見下方「原生 build 雷點」）。
  - **在 worktree 裡跑 `cap sync` 會弄髒兩個有進版控的檔**：`android/capacitor.settings.gradle` 與 `ios/App/CapApp-SPM/Package.swift` 會被改寫成 worktree 深度的相對路徑（`../../../` → `../../../../../../`），因為 `node_modules` 是 symlink、Capacitor 解到 main checkout 的實體路徑。**commit 前一定要 `git checkout --` 這兩個檔**。失效的樣子不是哪裡報錯，是這兩行被 merge 進 main 之後，別人的 Xcode / Gradle 解不到 plugin 專案，而錯誤訊息只會說某個 package 找不到。
- Worktree 與 main repo 共用 git history；PR merge 後 worktree 連同 branch 一起清掉。

---

## 三平台架構（Web / iOS / Android）

Next.js 16 web app + Capacitor 8 **薄殼**：`capacitor.config.ts` 的 `server.url` 指向 prod（`https://futari.southern-light.dev`），iOS / Android 殼只是載入線上網站的 WebView。**web 改動經 Vercel 部署即時觸達三平台**，不必重送商店；只有動到原生輸入才要重新送審。

- **推論：平台差異只能 runtime 判斷。** 編譯期只有一份產物，`NEXT_PUBLIC_PLATFORM=ios` 這類 build-time flag 分不出平台；SSR 同理（`lib/platform.ts#detectPlatform` 在 server 回 `null`）。一律在 render 時讀 `Capacitor.getPlatform()`，範例 `components/KofiWidget.tsx`（iOS 隱藏 Ko-fi widget，Apple Guideline 3.1.1）。
  - **失效的樣子**：build 過、type check 過、`npm run dev` 正常、Vercel 部署成功——錯只在真機殼裡顯現，而且是靜默的：該隱藏的元件照樣顯示（或該顯示的不見），沒有任何錯誤訊息。

送審步驟、Xcode／Gradle 雷點、ASC API 用法見 [docs/app-store-submission-runbook.md](docs/app-store-submission-runbook.md)。

### 需要重新送審的 trigger

- `ios/**`、`android/**`
- `capacitor.config.ts`
- `patches/**`
- `package.json` 中 `@capacitor/*` 或 `@capacitor-community/*` 依賴變動
- app icon / splash
- 商店 metadata（`docs/store-assets/`、App Store Connect / Play Console 欄位）

### 原生契約面（web 端，改動即時生效）

以下是 Capacitor-aware 的 web 程式，**沒有送審這道防線**：改了就即時打到所有已安裝的殼（含舊版）。動到時要在真機殼內驗證，不能只看瀏覽器。

- `lib/pushNotifications.ts`
- `components/KofiWidget.tsx`（iOS IAP gate）
- `app/[locale]/sign-in/SignInButton.tsx`
- `app/[locale]/_landing/LandingStandaloneRedirect.tsx`
- `app/[locale]/_landing/Landing.tsx`
- `app/(dashboard)/_components/PushTokenRegistrar.tsx`

### 版本號

使用者可見版號（`MARKETING_VERSION` / `versionName`）與商店遞增計數（`CURRENT_PROJECT_VERSION` / `versionCode`）分離；計數每次上傳 +1、與 semver 脫鉤，日常 web release **不動**原生版本號。規則見 runbook §E。

### 原生 build 雷點

- Android 需 JDK 21：`export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`
  - 「21」是 Capacitor 8 `sourceCompatibility` 的**下限，不是上限**。Android Studio 內附的 JBR 會隨 Studio 更新往上漂，看到它比 21 新不代表這行過期——2026-09-13 實測 JBR 已是 JDK 25，Gradle 8.14.3 + AGP 8.13 下 `assembleDebug` 245 個 task 全過。**不要為了湊「21」另外裝 JDK**（Gradle 官方支援矩陣只寫到 24，照著推會得出「JBR 太新不能用」的錯誤結論，實際不會發生）。
- 乾淨 checkout / worktree 做 iOS 工作前先 `npx cap sync ios`
- **`webDir`（`out/`）現在有一個檔案：殼內離線頁 `offline.html`（#1225）。** `server.url` 架構下沒網路就載不到網站，所以 `server.errorPath` 指向這份打包進殼的靜態頁。它由 `scripts/build-native-offline-page.ts` 在 `capacitor:copy:before` hook 產生（文案來源 `lib/i18n/locales/*.ts › nativeOfflinePage`，四語烤在同一個檔、靠 `navigator.language` 選）。
  - **失效的樣子**：什麼紅燈都沒有。`cap sync` 成功、archive 成功、web 部署全綠——只有真機斷網冷啟動時是一片空白，而且 Sentry 收不到（那個情境沒有任何 JS 在跑）。護欄在 `__tests__/nativeOfflinePage.test.ts` 與 native-smoke 的檔案存在檢查，不在 build log。

---

## 環境

| env | project | URL |
|---|---|---|
| prod | `oikos` | https://cxbnlahuhdvrbwcnzoqo.supabase.co |
| dev  | `oikos-dev` | https://ufhcprrauwsxdmscbkrf.supabase.co |

兩個 Supabase project 完全獨立。Migration / realtime publication / pg_cron job 兩邊都要跑（`npm run db:migrate` 看本地 `.env.local` 指向哪個）。Vercel preview / prod 部署只連 prod project；本機 `npm run dev` 連 dev project。

Migration 慣例（手寫 SQL + 手動 journal）、prod migration 跑法、pg_cron 的 Vault 授權、Apple Sign In 雷點、GA 歸因等營運知識見 [docs/superpowers/ops-runbook.md](docs/superpowers/ops-runbook.md)。

---

## 部署流程

Branch 架構與 Vercel 對應見 [README.md](README.md)。

要 release 時：

1. 在 `chore/release-vX.Y.Z` 上跑 [`release`](.claude/skills/release/SKILL.md) skill（bump version + CHANGELOG + CLAUDE.md + README + tag）
2. 開 PR `chore/release-vX.Y.Z → main`，merge 後 push tag
3. 開 PR `main → release`，merge 後 Vercel 自動部 prod

本版動過「三平台架構」列的原生 trigger 路徑時，release 後要另外確認原生殼是否需要重送商店（skill 會在收尾 checklist 標示；流程見 [runbook](docs/app-store-submission-runbook.md)）。

---

## 常用指令

常用指令見 [README.md](README.md)。

## AI 開發協作規則

- **寫限制的時候，連它失效時長什麼樣子一起寫**：人是靠症狀認出問題的，不是靠機制推導。「跨 server/client 不能 join」要補一句「症狀是查詢靜默回 0 筆」；「手寫段落可能在 refresh 時遺失」要補一句「失效的樣子不是檔案被清空，是某段在看似正常的文件重整裡被壓縮掉」。只寫機制，讀者下次撞到時不會認出那就是文件警告過的事。
- **不要把沒解釋的選擇當疏忽**：看起來隨意的既有寫法，常是在一個沒被寫下來的約束底下的合理解。2026-09-12 踩了兩次——`pt-12` 看似魔術數字，實際是刻意大於 safe-area inset；safe-area guard 的檔案級比對看似偷懶，實際是唯一能容納「wrapper 負責 pin、內層負責 padding」這個正確形狀的粒度。兩次都是先當它是疏忽、動手改了才發現約束存在。**改之前先問「如果這是對的，它在解什麼我沒看到的問題」。**
- **撤回一個論證之後，要掃所有引用它的地方**：結論被推翻了，但引用它的段落還活著、而且看起來仍然合理。撤回本身也值得留在文件裡——它標示了哪條推論路徑會出錯，而下一個人很可能會重新推導出同一個錯誤結論。
- **偏好透過 subagent roles 分工**：開發任務優先委派給 subagent（有對應 role 就用 role，如 pilotfish 的 scout / executor / verifier；需要指定 model 時用 ad-hoc subagent），主 session 負責 framing、brief、驗收與整合。平行 subagent 各自用 worktree 隔離（見「Worktree 工作流」）。
- **commit 自主、push 延到 PR-time**：每完成一個邏輯單位（PR / feature）即自動 commit，不必問；但**不要每個 commit 都 push**——本機累積，只在「要開 PR / 更新已開的 PR」時才 push。原因：`vercel.json` 沒有 git/deploy 設定，Vercel 預設「任何 branch 每次 push 都建一個 preview deployment」，逐 commit push 會產生大量不必要的 build。**例外**：當任務本身需要 preview 部署才能進行（例如測試已部署的 endpoint），iterative push 是必要且合理的。
- **`main` / `release` 是 protected**：絕對不要直接 push 到這兩條，要進去都走 PR merge 流程。`gh pr merge --admin`（任何繞過 branch protection 的 merge）也要明確指令才執行。
- **destructive ops**：動 prod 資料、force push 到 main/release、`reset --hard` 之類仍要明確確認 scope 後才執行。force-push（含 `--force-with-lease`）到 feature branch 在 rebase 後可自動執行。
- **issue / PR 必須指定 milestone**：開 issue 或開 PR 時一律加上 `--milestone` 參數，不得省略。milestone 選當前正在開發的版本；若不確定歸屬，選最近的未關閉 milestone。

---

## 品牌文案準則（Futari Copy Guidelines）

> 任何涉及 copy 的 PR，動筆前先對照以下原則。

### 流量分層 × tone 對應

| 流量層 | 進入點 | 用戶狀態 | 核心任務 | tone |
|---|---|---|---|---|
| Landing | `/` | 陌生人，搜尋到達 | 建立情感認同，讓人願意試試 | 有溫度的清醒 |
| Sign-in | `/sign-in` | 有信任基礎（朋友推薦） | 減少摩擦，說清楚「接下來會發生什麼」 | 安靜的邀請 |
| App 內功能 | dashboard, records… | 已是用戶 | 清楚操作，不干擾 | 簡潔中性 |
| App 內情感節點 | 空狀態、首次設定、結算… | 已是用戶 | 溫和的見證，不說教 | 溫和的見證者 |

### Landing — 寫作規則

- **Hero copy 不放功能列表**：「記帳 / 分攤 / 圖表」不是 hero 要說的事，hero 要說的是「為什麼這兩個人要一起記帳」
- `heroKicker` 不放 SEO 語法（`·` / 斜線關鍵字），交給 `<meta>`
- Trust row 排序：免費 → 裝置 → 隱私（「只開放給你們倆」，最強 claim 放最後）
  - **撤回紀錄（#1191）**：這格原本是「端對端加密」，已撤回。寫成「端對端加密」「連我們也讀不到」看起來更有說服力，但實作是 server 持鑰的欄位級靜態加密（`lib/crypto.ts`，只涵蓋寶寶本名、身分證字號等少數欄位），交易內容是明文，宣稱不成立。失效的樣子不是哪裡報錯，是一句順口的信任文案被複製進 landing、SEO description、FAQ JSON-LD、比較表，一路擴散到幾十個站點。提加密時只說成立的部分：連線以 HTTPS 加密、機敏欄位加密後保存；不寫「全程」「端對端」「讀不到」。
- 情境感 > 功能感：「回頭看會很暖」比「追蹤花費」更對

### Sign-in — 寫作規則

- Tagline 不重複 landing 的「what is this」，要說「what happens next」
- 不以感嘆號製造興奮感
- 不用「開始」「立即」「免費試用」等 conversion 語言

### Solo 模式 — 寫作規則

- 不預設「他還沒加入」的性別（用「對方」「你的伴侶」）
- 不用「還在等」製造焦慮感；solo 本身不是問題狀態
- `soloHint` / `soloBanner` / `sendInviteHint` 每次改動都要對照此原則

### App 內 — 禁用詞

在 dashboard / app 情境中，以下詞匯**禁止使用**：

- 「管理」→ 改用「查看」「記錄」「整理」
- 「追蹤」→ 改用「記下」「看見」
- 「監控」→ 禁用，無替換
- 感嘆號（`！` / `!`）→ 禁用於 UI copy

### i18n 同步規則

- 任何 copy 改動一律 4 語同步（zh-TW / zh-CN / en / ja）
- zh-TW 是主稿；zh-CN 跟進但保留繁簡差異，不要機翻
- en / ja 如無 native reviewer，PR description 列出建議譯文，標記「待確認」

---

## 設計脈絡（Impeccable）

任何 UI／視覺工作開始前，先讀 [`PRODUCT.md`](PRODUCT.md)（策略層：who／what／why、register、anti-references、5 條設計原則）與 [`DESIGN.md`](DESIGN.md)（視覺系統：色票、字體、elevation、元件、Do's/Don'ts，採 Stitch 六段格式）。兩檔由 Impeccable design skill 每個指令載入；`.impeccable/design.json` 是延伸層（色階 ramp、陰影、動態、可渲染的元件 snippet）。

- 改動 UI 時以 `DESIGN.md` 為視覺準則；文案仍依上方「品牌文案準則」。
- Register＝`product`；Creative North Star＝「The Warm Lamp」。
- **DESIGN.md 與 PRODUCT.md 由 Impeccable 維護，refresh 是「model 全檔重寫」，不是機械產生。** `/impeccable document` 重寫 DESIGN.md、`/impeccable teach` 重寫 PRODUCT.md；真正機械地從 `app/globals.css` 抄過去的只有 `.impeccable/design.json` 的 token 值。工具不會靜默覆蓋（偵測到既有檔會先問要 refresh 哪一份），但**手寫段落能不能留下來，取決於當時跑 refresh 的 agent 有沒有先讀過現檔、刻意逐段帶過去**——那是判斷，不是保證。
  - 所以：**跑 refresh 前先讀現檔，逐段帶過，不要從零生成。** PRODUCT.md 的 Surface Intents、DESIGN.md 的任何手動補充都屬於這類。
  - 失效的樣子不是檔案被清空，而是某一段在一次看起來很正常的「文件重整」裡被壓縮掉。所以控制點是 git diff，不是工具。
  - 另一條邊緣路徑：任何 impeccable 指令偵測到 PRODUCT.md 缺失、空白、少於 200 字元或含 `[TODO]` 時，會把 teach 當成 setup blocker 自動拉起來。現況遠大於該門檻，實務上踩不到。
- **Token 紀律（硬性，見 DESIGN.md §3 The Existing-Token-First / Even-Px Rule）**：
  - 字級一律偶數 px，且必對應 `text-*` class；11/13/15 已廢除，落在中間就取最近偶數。
  - 任何視覺值先找既有 token：型別 `text-*`、間距 Tailwind utility＋`--sheet-*`、圓角 `--radius-*`、顏色 `--color-*` / `var(--ink*)`。
  - **禁止 inline `style` 寫 token 已涵蓋的靜態值**（`fontSize` / `padding` / `margin` / `borderRadius` / 顏色）；inline 只留給真正動態值（計算 transform、資料驅動尺寸）。
  - **不得自行新增字級／間距／圓角／token**；既有 scale 真的表達不了時，先停下來問使用者。

---

## 規格文件位置

所有 feature 設計 spec 都在 `docs/superpowers/specs/`。入口是 [`docs/superpowers/specs/INDEX.md`](docs/superpowers/specs/INDEX.md)，含：

- 寫作原則（what / why / who，不寫 how）
- Frontmatter schema（`status` / `first_shipped_in` / `updates` / `related_specs` / `related_issues` / `blocked_on`）
- 拆分原則 + 檔案命名
- Spec 清單分組：架構 / 記帳核心 / 體驗 / 提案與匯入 / 愛物 / 守護

版本歷史看 [`CHANGELOG.md`](CHANGELOG.md)；版本對應 issue 看 GitHub milestones。

---

## 專案內建 skill

`.claude/skills/` 有五個進版控的 repo-scoped skill，換機器 / cloud session / worktree subagent 都帶得走：

- [`run-oikos`](.claude/skills/run-oikos/SKILL.md) — 啟動並 smoke test dev server（`npm install` + `npm run dev` + curl），收錄冷機啟動會踩的雷（缺 `@next/bundle-analyzer`、缺 `.env.local`、port 3000 佔用、Turbopack lazy-compile 404）。
- [`ja-i18n`](.claude/skills/ja-i18n/SKILL.md) — 維護 `lib/i18n/locales/ja.ts`：偵測未翻譯 key、辨識合法漢字的假陽性、更新漢字白名單。
- [`release`](.claude/skills/release/SKILL.md) — 發版（bump version + CHANGELOG + CLAUDE.md + README + 本地 tag），附原生影響掃描與收尾 checklist；不 push、不碰 protected branch。
- [`ship-native`](.claude/skills/ship-native/SKILL.md) — 原生殼重送（版本計數 +1 → iOS archive/export/upload、Android AAB + 驗簽 → 實機驗證 checklist）；build 可自動跑，上傳前必停下來確認。
- [`ship-issue`](.claude/skills/ship-issue/SKILL.md) — 協調者模式：issue → 查證 → 關卡 ① intent → 關卡 ② 方案 → executor 實作 + verifier 驗收 → 開 PR → 關卡 ③ 驗收；使用者只做選擇，做到開好 PR 就停、不 merge。§8 批次驗證多條 PR（依 milestone 分組 → 整合試合 → 依風險派 agent → 依裝置分組的人工清單 → merge 後比對 head sha）。
