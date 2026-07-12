---
last_updated: 2026-07-13
status: shipped
first_shipped_in: v1.2.0
related_specs: [csv-import, solo-mode]
related_issues: ["#734"]
---

# 轉換分析 — 從入口頁到註冊的事件追蹤

## 這是什麼

在既有 PostHog 之上加一層**轉換漏斗事件**，量測使用者從兩個入口面
（landing `/` 與 `/migrate/<source>`）一路走到「成為註冊用戶 / 啟用」的轉換率。

目前 PostHog 只送 `$pageview`（`app/posthog-pageview.tsx`），沒有任何自訂事件，
因此「首頁來了多少人、其中多少人按了 CTA、多少人真的註冊」這條漏斗無法回答。
本 spec 定義要補的事件、屬性、以及跨 OAuth 邊界的歸因方式。

## 為什麼

- **驗證入口面成效**：landing 與三個 migrate 著陸頁（honeydue / spendee / cwmoney）
  是目前主要獲客面（見 [csv-import](csv-import-design.md)）。沒有漏斗數據就無法判斷
  哪個入口、哪段文案、哪個 migrate 來源實際帶來註冊。
- **找出流失點**：migrate 的「上傳 → 預覽 → CTA」是 try-before-signup 流程，
  需要知道使用者卡在上傳、預覽失敗、還是看完預覽不願註冊。
- **歸因到來源**：兩人記帳的啟用成本高，需要知道不同入口來源的下游啟用率
  （setup 完成、第一筆記錄）差異，才能決定資源往哪放。

## 給誰用

產品 / 成長決策者（目前是團隊自己）。讀 PostHog 漏斗與 breakdown，
不是 end-user-facing 功能。

---

## 核心設計決策

### 決策一：保留 cookieless，跨 OAuth 邊界用 server-side 歸因（locked）

PostHog 目前刻意用 `persistence: 'memory'`（`app/providers.tsx`）以維持
**無 cookie、免同意橫幅**的隱私立場。代價是：匿名 `distinct_id` 在使用者
離站去 Google OAuth、回到 `/auth/callback` 時會重置——pre-auth 的匿名事件
與註冊後的使用者，預設是 PostHog 眼中的兩個人。

**觀察**：在單一 SPA session 內（landing → migrate → sign-in 都是 client-side 導航），
`distinct_id` 是穩定的；只有 OAuth round-trip 這一個邊界會斷。

**決策**：只橋接這一個邊界，不動隱私立場。

- 維持 `persistence: 'memory'`（不改成 localStorage / cookie）。
- pre-auth 事件用 client `posthog-js`，匿名、同 session 內自然 stitch。
- 在送使用者去 OAuth 前，於 sign-in 把當下匿名 `distinct_id` 與來源
  （`from`）一起夾帶進 OAuth 的 `redirectTo`。
- `/auth/callback` 用 server-side `posthog-node` 在認證成功後：
  - `alias`（或 `identify` 帶 `$anon_distinct_id`）把匿名 id 併到真實 user id，
    讓 pre-auth 匿名事件接上註冊後的人 → 形成端到端漏斗。
  - 送 `signed_up` / `signed_in`，帶 `entry_source`。
  - 以 `$set_once` 寫入 person property `entry_source`（首次來源不被覆寫）。

**不採用**：
- 改 `persistence: 'localStorage'`：雖能讓 posthog-js 自動 stitch，但 localStorage
  在歐盟普遍被視為需同意，違背現有免橫幅立場。
- 純 count-based 比率（不 stitch）：實作最省，但拿不到 per-user 漏斗與精確流失點，
  且匿名↔註冊無法對齊，breakdown 失真。

### 決策二：歸因 key 用單一 `from` query param（locked）

`entry_source` 是整套漏斗的歸因軸，取值：
`landing` | `migrate_honeydue` | `migrate_spendee` | `migrate_cwmoney` | `invite` | `direct`。

- migrate 流程**已經**把 `?from=<source>` 帶進 `/sign-in`（`MigrateCta`），復用同一個 param。
- landing 的 CTA 補上 `?from=landing`。
- sign-in 直接到達、無 `from` → `direct`。
- 分析讀 `from`；import-resume 語意只對已知 importer 來源生效，兩者不耦合
  （`from=landing` 不會觸發任何 importer）。
- `entry_source` 在 client 首次落地時決定（first-touch），透過 `redirectTo` 過邊界，
  callback 寫成 person property（`$set_once`）+ 事件屬性。

### 決策三：轉換的定義分層（locked）

- **主轉換（numerator）**：`signed_up`——使用者首次完成 OAuth 成為註冊用戶。
- **啟用（次要）**：`setup_completed`（建立 group / 設定 base currency）、
  `first_record_created`（第一筆 `CashTransaction`）。
- migrate 專屬深度轉換：`import_completed`（CSV 匯入完成）。
- `signed_up` 與 `signed_in` 區分：以是否為新用戶（profile 首次建立）判定；
  回訪登入只送 `signed_in`。

### 決策四：邀請漏斗——伴侶加入轉換（locked）

第三個入口面：member_a 邀請 member_b，量測「邀請出去後對方有沒有加入」。

- `invite_created`（member_a 發出邀請）為**分母**；`partner_joined`（member_b 接受加入）為**分子**。
- 兩個事件 distinct id 不同人（邀請者 vs 被邀請者），**無法做 per-person funnel**；
  邀請接受率以兩事件 count 的比值（ratio insight）量測。`partner_joined` 帶 `inviter_id`
  供需要時關聯兩端。
- 被邀請者若是**新用戶**：邀請頁的 sign-in 導向夾帶 `from=invite`，其註冊會以
  `entry_source=invite` 落進既有 signup 漏斗（`sign_in_started` → `signed_up` → `partner_joined`）。
- 被邀請者若是**既有用戶**：沒有 `signed_up`，`partner_joined` 仍是通用的轉換事件。
- `invite_link_opened`（被邀請者抵達 accept 畫面）為中段步驟，定位「點了連結但沒加入」的流失。
  匿名被邀請者會先被導去 sign-in（server redirect），故此事件只在已登入抵達 accept 畫面時送；
  匿名階段的「有沒有往下走」由 `sign_in_started[entry_source=invite]` 反映。

---

## 事件清單（設計契約）

> 事件名 snake_case；屬性名為下游漏斗 / breakdown 依賴，視為契約。
> 實作落地點僅列關鍵檔案，細節進 plan。

### Pre-auth — client（`posthog-js`，匿名，同 session stitch）

| event | 觸發時機 | 關鍵屬性 |
|---|---|---|
| `$pageview` *(已存在)* | 每個路由 | `$current_url` |
| `landing_cta_clicked` | 點 landing 的 hero / 次要 / nav CTA | `cta_location`、`target`（`sign_in` \| `migrate_*`） |
| `migrate_file_selected` | 在 `/migrate/*` 選了 CSV | `migrate_source` |
| `migrate_preview_shown` | 解析成功、預覽渲染 | `migrate_source`、`detected_source`、`row_count` |
| `migrate_preview_failed` | 解析失敗 | `migrate_source`、`reason` |
| `migrate_cta_clicked` | 看完預覽點「開始」CTA | `migrate_source` |
| `sign_in_started` | 點 Google 登入按鈕 | `entry_source` |

實作落地點：landing CTA → `app/[locale]/_landing/Landing.tsx`；
migrate 流程 → `app/[locale]/migrate/_components/MigrateTool.tsx` + `MigrateCta.tsx`
（解析 hook `lib/migrate/useCsvPreview.ts`）；登入按鈕 → `app/[locale]/sign-in/SignInButton.tsx`。

### Auth boundary — server（`posthog-node`，歸因 + alias）

| event | 觸發時機 | 關鍵屬性 |
|---|---|---|
| `signed_up` | 新用戶首次 OAuth 成功 | `entry_source`、`migrate_source?`、`locale` |
| `signed_in` | 回訪認證成功 | `entry_source?` |

實作落地點：`app/auth/callback/route.ts`（已能取得 `data.user`，可在此判定新／舊用戶並 alias + capture）。
`SignInButton` 需把匿名 `distinct_id` 與 `from` append 到 `redirectTo`。

### Post-auth — identified（次要指標）

| event | 觸發時機 | 關鍵屬性 |
|---|---|---|
| `setup_completed` | base / group 設定完成 | `base_currency`、`solo` |
| `import_completed` | CSV 匯入完成 | `migrate_source`、`imported_rows` |
| `first_record_created` | 第一筆 `CashTransaction` | `via`（`manual` \| `import`） |

實作落地點：setup → `app/setup/*` 對應 server action；import → CSV import 流程
（見 [csv-import](csv-import-design.md)，`ImportBatches` 寫入點）；first record →
建立 `CashTransaction` 的 server action（首筆判定）。

### 邀請漏斗 — 伴侶加入

| event | 觸發時機 | side | 關鍵屬性 |
|---|---|---|---|
| `invite_created` | member_a 產生邀請連結 | server | `group_id` |
| `invite_link_opened` | 被邀請者抵達 accept 畫面 | client | — |
| `partner_joined` | member_b 接受、加入 group | server | `group_id`、`inviter_id` |

實作落地點：`invite_created` / `partner_joined` → `actions/invite.ts`（`createInvite` / `acceptInvite`）；
`invite_link_opened` → `app/invite/[token]/InviteConfirm.tsx`；邀請頁匿名導向 sign-in
夾帶 `from=invite` → `app/invite/[token]/page.tsx`。

---

## 要回答的漏斗

1. **Landing 轉換**：`$pageview(/)` → `landing_cta_clicked` → `sign_in_started` → `signed_up`
   （breakdown：locale、`cta_location`）
2. **Migrate 轉換**：`$pageview(/migrate/*)` → `migrate_file_selected` → `migrate_preview_shown`
   → `migrate_cta_clicked` → `sign_in_started` → `signed_up` → `import_completed`
   （breakdown：`migrate_source`）
3. **啟用**：`signed_up` → `setup_completed` → `first_record_created`（breakdown：`entry_source`）
4. **邀請接受率**：`count(partner_joined) / count(invite_created)`（ratio insight，跨不同人）；
   被邀請者側 per-person 流失：`invite_link_opened` → `partner_joined`，
   新被邀請者另有 `sign_in_started[invite]` → `signed_up[invite]` → `partner_joined`

---

## Acceptance criteria

- 從 landing 點 CTA 註冊的使用者，PostHog 漏斗第 1 條全程可追，且 `signed_up`
  帶 `entry_source=landing`。
- 從 `/migrate/honeydue` 上傳 → 預覽 → 註冊 → 匯入的使用者，漏斗第 2 條全程可追，
  各步事件 `migrate_source=honeydue` 一致。
- pre-auth 匿名事件（同 session）在註冊後經 alias 接到該 user，不產生孤兒事件
  （前提：使用者未在過程中硬重整）。
- 維持 cookieless：不新增 cookie、不改 `persistence`、不出現同意橫幅。
- 所有事件僅在 `NODE_ENV === 'production'` 且有 PostHog key 時送出（沿用既有 gating）。
- `entry_source` person property 為 `$set_once`，回訪不覆寫首次來源。

## 已知限制

- 使用者若在 pre-auth 過程**硬重整**頁面，memory persistence 下匿名 id 會換，
  該次重整前的事件會成孤兒。屬 cookieless 取捨，可接受（多數人走 client-side 導航）。
- `signed_up` vs `signed_in` 的新用戶判定依賴 profile 首次建立的偵測；
  邊界 case（同帳號重綁）以「profile 已存在」為準。
