# Ops Runbook

> 營運層知識：migration 怎麼跑、cron 怎麼授權、外部服務設定的雷點。
> 這些事實原本散在單機的 agent memory，沉澱到 repo 讓所有 session（cloud／worktree／換機器）都拿得到。
> Schema 與程式的 WHAT 看程式碼；這裡只留 WHY 與操作程序。

---

## Drizzle Migrations

### 慣例：手寫 SQL + 手動 journal，0008+ 不產 snapshot

本 repo 的 migration 是**手寫 SQL 檔 + 手動 `_journal.json` entry**。snapshot 檔（`drizzle/meta/NNNN_snapshot.json`）自 `0007` 之後不再產生、不再維護。

**Why**：多數 schema 變更帶著 `drizzle-kit generate` 產不出來的自訂 SQL（RLS policies、realtime publication、pg_cron job、extensions），直接手寫比繞過 codegen 乾淨。

**新增 migration 步驟**：

1. 寫 `drizzle/NNNN_<name>.sql`，**必須 idempotent**（`CREATE TABLE IF NOT EXISTS`、先 `DROP POLICY IF EXISTS` 再 `CREATE POLICY`⋯⋯）
2. 在 `drizzle/meta/_journal.json` 的 `entries` 追加：`{ "idx": NNN, "version": "7", "when": <前一筆 when + 100000000>, "tag": "NNNN_<name>", "breakpoints": true }`
3. 不要建 snapshot 檔
4. 先對 dev 跑 `npm run db:migrate` 測試

**雷（#874）**：只寫 SQL 檔忘了 journal entry，`db:migrate` 會**默默跳過**該檔還回報成功。修復模式見 `git show 373efe5` / `bb1bc09`。

### Dev：跑完必須驗證資料效果

共用的 dev Supabase project（`oikos-dev`）的 `drizzle.__drizzle_migrations` 歷史已被污染——本機 worktree branch 各自對同一個 dev project 跑 migration，導致記錄筆數多於 journal。`drizzle-kit migrate` 以「journal 的 `when` vs 已記錄的最大 `created_at`」決定要跑什麼，所以新 migration 可能被**記錄為已套用、SQL 本體卻默默沒執行**——回報 "migrations applied successfully" 不可信。

**Implication**：dev 跑完 `db:migrate` 一律直接查資料驗證效果（Supabase MCP query）。被跳過時，手動經 MCP 執行 migration 本體（migration 都是 idempotent 的，重跑安全）。

### Prod：npm script 到不了，要手動指 env file

`npm run db:migrate` 寫死 `--env-file=.env.local`，指向 **dev**。要 migrate **prod**（`oikos`）：

```
node --env-file=.env.production node_modules/.bin/drizzle-kit migrate
```

`.env.production` 是**本機檔案**（被 `.gitignore` 的 `.env*` 擋住，不進版控），內含 prod DB 連線字串；新機器要從密碼管理器重建。

Caveats：

- `drizzle-kit migrate` 套用**所有** pending migrations，不是單一檔。跑 prod 前先確認 pending 清單。
- 直接讀 prod DB 需要使用者明確授權 prod 為目標（「跑 prod」算數）；migration 後的驗證查詢也要同一份授權。
- Prod 不被本機 worktree 碰，migration 正常照 journal 順序執行；但**歷史不是乾淨的**（見下）——仍然要驗證資料效果，不要只信成功訊息。

**修正（#1405）**：上一版這裡寫「歷史乾淨」，不成立。`0065`（`when` 為 `1782300000000`，加 `Profiles.avatar_hidden`）在 prod 上是欄位已經手動／繞過工具存在、但 `drizzle.__drizzle_migrations` 沒有對應紀錄；紀錄是在 v1.6.0 migrate（2026-09-22）時才補上——見 #1354 crew log「0065 補上紀錄（欄位本來就在，跳過），0066 建好出遊的 5 張表」，唯讀驗證從 pre-flight 的 65 筆變成 67 筆（`0065` 本體是 `ADD COLUMN IF NOT EXISTS`，重跑是 no-op，事後補紀錄無害）。之後 v1.6.1 的 `0067` 再讓筆數變成 68，那是另一批、不是這次修正的一部分。

**每次跑 prod migrate 前，先讀資料比對，不要只看 journal 檔案**：

```sql
select hash, created_at from drizzle.__drizzle_migrations order by created_at;
```

照 drizzle 實際判斷邏輯算出「這次會被套用的清單」——journal 裡 `when` 大於 DB 已記錄最大 `created_at` 的那些 entries——而不是單純比對總筆數。算出來的清單如果不完全等於這次 release 預期要跑的那幾個 migration，就先停，不要照跑。

**已知的基準差異，不算異常**：journal 目前有 67 筆 entries、`idx` 跳過 `51`（`drizzle/0051_cash_settlement_indexes.sql` 檔案本身存在，只是 idx 編號本來就不連續）；#1374 也記錄過早期幾筆 `created_at` 和目前 journal 的 `when` 不一致，是早期重新編號留下的痕跡。這些是健康 prod 也會出現的既有落差，只要它們都落在目前的 watermark 之下（不會被誤判成待跑），不必為此停下——**規則要抓的是「待套用清單」對不對，不是「文件和資料庫長得一不一樣」**，不然久了會學會忽略這個檢查。

**失效的樣子有兩種**：

1. 缺紀錄的那一筆在目前 watermark **之上**：待跑清單比預期多一筆，`drizzle-kit migrate` 不會為此報錯——它只看 journal 的 `when` 是否大於 DB 已記錄的最大 `created_at`，缺紀錄的那筆會被當成「還沒跑過」重新套用一次（`node_modules/drizzle-orm/pg-core/dialect.js:56-62`）。這就是 0065 的情況：因為是 `IF NOT EXISTS` 所以無害；換成一個不能重跑的 migration，就會在 prod 上直接失敗。
2. 缺紀錄的那一筆在目前 watermark **之下**：不會被重新套用，永遠被跳過，而且不會有任何錯誤或警告——這是 #1374 在 dev 上發現的 0060（epoch backfill）情況，該筆從未在 dev 上跑過，watermark 已經越過它，之後也不會自動補跑。症狀是「這個 migration 明明存在，效果卻永遠沒發生」，只有直接查資料才會發現。

兩個 Supabase 環境對照見 [CLAUDE.md §環境](../../CLAUDE.md)。

**0065 是怎麼在工具之外套用的**：PR #1332（`feat/1328-hide-avatar`）內文寫「dev 與 prod 都已套用（使用者 2026-09-20 明示同意兩邊一起跑）」，早於該 PR merge、也早於它自己的 journal entry 走一般流程被記錄；確切是手動 SQL 還是透過 Supabase MCP `apply_migration` 執行，repo 內找不到直接證據，沒有查清楚。

---

## pg_cron → Edge Function 授權：走 Vault

pg_cron job 要帶 `service_role` bearer token 呼叫 Edge Function 時，**token 存 Supabase Vault，不可用 `ALTER DATABASE postgres SET app.*`**。

**Why**：Supabase 2024 年收掉了一般使用者對自訂 GUC 的 `ALTER DATABASE SET` 權限（`42501 permission denied`）。舊文件／舊 PR 模板還在教這個 pattern，而且它**靜默失敗**：schedule 建立成功，但每日觸發送出的是空的 `Authorization: Bearer `，Edge Function 全數拒絕。

**How**：

1. 操作者每個 project 跑一次 `SELECT vault.create_secret('<service_role_key>', '<secret_name>', '<purpose>')`
2. cron body 內用 `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '<secret_name>'` 讀回組進 header——完整範例見 [drizzle/0056_recurring_push_cron_vault.sql](../../drizzle/0056_recurring_push_cron_vault.sql)（它取代了用 ALTER 寫壞的 0055）
3. 需要 extensions：`pg_cron`、`pg_net`、`supabase_vault`（`SELECT * FROM pg_extension WHERE extname IN ('pg_net','pg_cron','supabase_vault')` 驗證；缺了到 Dashboard → Database → Extensions 開）

---

## Sign in with Apple 外部設定

Apple Developer Portal + 兩個 Supabase project 都已設定完成（#903 / PR #910）。具體 ID 值與 `.p8` 私鑰不進 public repo——ID 存單機 agent memory，私鑰存密碼管理器。

**雷點 1 — Supabase「Client IDs」順序有意義**：Supabase 拿清單**第一個**當 web authorize 的 `client_id`，必須 **Services ID 在前、Bundle ID 在後**。Bundle ID 排第一時，web/Android OAuth 會被 Apple 以 `invalid_client` 擋下（Bundle ID 不是合法的 web Services ID）。Bundle ID 仍要留在清單裡供 native `signInWithIdToken` 驗 token。

**雷點 2 — OAuth Secret 每 6 個月過期**：Supabase 的「Secret Key (for OAuth)」是用 .p8 + Team/Service/Key ID 產的 JWT，**約 2026-12 到期**；到期前用 Supabase 文件頁的產生工具重產，並更新 dev / prod 兩個 project。過期的症狀：web/Android Apple 登入壞掉、native 不受影響。

**驗證**（不需 anon key）：

```
curl -sI "https://<ref>.supabase.co/auth/v1/authorize?provider=apple"
```

看 `Location` header 的 `client_id` 是否為 Services ID。

---

## GA / Ko-fi 收益歸因：不可移除

`app/layout.tsx` 的 `<GoogleAnalytics gaId="G-YHXFBMRQ3S">` 是**跨產品共用**的 property，服務 Ko-fi 收益來源歸因；`components/KofiWidget.tsx` 的 `kofi_widget_click` 事件（repo 內唯一的 `gtag` 呼叫）是歸因鏈的輸入。

**Why 看起來可刪但不能刪**：從 Oikos 單體看，142 KiB 的 GA 只為一個事件、且已有 PostHog / Vercel Analytics，像是效能 easy win——但它承載跨產品商業需求。也不要 lazy load 或條件載入 gtag：歸因需要 pageview + referrer 上下文。

**How**：landing JS 的效能工作對準 first-party chunks 與 PostHog module，把這 142 KiB 當必要商業成本。見 oikos#922 與 `components/KofiWidget.tsx` 檔頭註解（runtime iOS gate + `SOURCE` 歸因常數）。

**已接受的風險（#1300）**：這個 property 收得到 Futari 的原始網址，包括邀請 token（`dl`／`dr`）和 `/records` 的篩選值。原因是共用串流上開著「依瀏覽器歷史記錄計算網頁變化」，而它不能為了 Futari 單獨關掉。GA 後台的網址不會跟著 token 失效；要清除只能在 GA 後台處理。完整脈絡和什麼會改變這個決定，見 [observability-design.md](specs/observability-design.md)「GA 會收到原始網址」那條。**不要在這條串流上關歷史記錄設定**：Wildcard／blog 的站內換頁 page view 會一起消失。
