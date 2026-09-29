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

## 欄位級加密：本機沒有 prod 金鑰、金鑰輪替 runbook（#881 / #882 / #1287）

**陷阱**：本機與 Futari Secrets dmg 裡**每一份標成 prod 的 env 檔**（`.env.production`、dmg 的 `env/.env.production`、`reencrypt-prod.env`）裡的 `ENCRYPTION_KEY` 都是 **dev 的金鑰**。prod 的金鑰只存在 Vercel 的 Sensitive 變數裡（`vercel env pull` 拿回來的是 `[SENSITIVE]`），本機拿不到。那些檔案裡的 prod DB 連線字串是對的，只有金鑰不對。

**失效的樣子**：拿這些檔案對 prod 跑 `scripts/reencrypt-pii.ts --target=prod`，所有 guard 都會通過（DB URL 確實是 prod），然後 **preflight 在每一列都失敗——包括 app 自己寫進去的列**——什麼都沒寫入（2026-09-27 dry-run：preflight 22/22 失敗）。這不是資料壞了，是金鑰拿錯了。#881 是同一個錯誤往寫入方向走的版本：backfill 用 dev 金鑰加密了 prod 資料，prod runtime 解不開。

**怎麼做**：需要 prod 金鑰的工作要在**持有 prod 金鑰的 runtime 裡**跑——Vercel **preview** deployment 連的是 prod DB、帶的是 prod keyring。

- 做法是一條一次性、token 保護的 admin route，放在**永遠不 merge** 的丟棄 branch 上，推上去讓 Vercel 建 preview，跑完刪 branch、刪該 branch 的所有 deployment、刪 token 變數。#882（修 #881）與 #1287（k2 輪替）都是這個模式。
- route 只呼叫 `lib/reencryptCore.ts`（腳本用的同一份 preflight／compare-and-swap 與 SQL），不自帶第二份演算法——#881 的根因就是第二份 cipher 實作。
- 動手寫入前，route 先證明 runtime 手上真的是 prod 金鑰：解開一筆由 production 寫入、指定好的 anchor 列（#882 的 pre-flight 檢查、#1287 的 anchor gate）。解不開就零寫入。
- 閘門依序全部在碰 DB／crypto 之前：`VERCEL_ENV === 'preview'` → `VERCEL_GIT_COMMIT_REF` 等於丟棄 branch → 寫死的到期時間 → token（SHA-256 後 `timingSafeEqual`）；Deployment Protection 保持開啟。回應與 log 只有計數。
- 動手寫之前，route 還要求帶一個「錨點」：一個由 production 寫入、指定好 table／column／pk 的既有列，且已經是目標 kid 的格式。錨點解不開、格式不符、或指到不允許的欄位，就零寫入——route 不自行判定「這是不是 production 寫的」，那個保證來自操作者（在 prod 網域上手動建立這筆錨點）加上「先清空舊部署再開 route」這兩件事疊起來。
- 這條 route 只活在丟棄 branch 上，**永遠不 merge 進 main**；跑完連 branch、該 branch 的所有部署、token 環境變數一起刪掉，一個都不留。失效的樣子不是報錯，是這條有 admin 權限、只靠一個 token 擋著的 route 一直活在某個 preview URL 上，被忘記的機率遠高於被發現。

**操作時會踩到的雷（generic，來自 2026-09-27 那次實際執行）：**

- Preview 環境變數如果綁定特定 branch（`--git-branch`），那個 branch 要先存在於遠端才能加變數，否則會回「branch not found」。順序要是：先 push branch → 再加變數 → 再重新部署一次那個 preview；漏了最後一步，該 preview 建置當下還沒有 token，route 只會回 404（看起來像「還沒生效」，其實是建置時序錯了，不是變數沒生效）。
- Deployment Protection 自己擋下的回應也是 401，格式是 Vercel 自己的 JSON（`{"error":{"code":"401","message":"Protected deployment"}, ...}`），容易和 route 自己的 token 檢查搞混——那一層是 Vercel 在 route 程式碼跑之前就擋掉的，跟 token 對不對無關，看到這個訊息就先確認 Deployment Protection bypass 有沒有帶對，再去查 token。
- Vercel 的 automation bypass（用來讓一次性 curl 繞過 Deployment Protection 的那個值）要透過 Vercel 的 API 直接寫進本機的 header 檔，不要從後台網頁複製再貼——貼上這種高熵字串很容易在畫面上漏選、多選或多按一次，拿到錯誤長度或空字串卻不會有任何提示。
- 驗證那份 header 檔時只看**長度與字元類型**（例如逐行印出「欄位名稱＋值的長度」），不要把值本身印出來確認——確認的目的達到了，也沒有把機密留在終端機 scrollback 裡。

- 完整的 #1287 操作步驟（產生 k2 進 dmg、Vercel 變數順序、rollback floor、teardown）見 issue #1287。

### 金鑰輪替（k_old → k_new）：規劃內，8 步

跟上面「一次性重新加密」是同一個底層動作，多了金鑰本身要換這一層。以下步驟順序是硬性的——尤其步驟 4 一定要在步驟 5 之前完成，否則會漏寫。

1. **產生 k_new，直接寫進已掛載的 secrets image**，不印在終端機、不放進任何指令列參數。失效的樣子：只要 key 出現在指令列或被 echo／printf 到畫面上，它就進了 shell history 與終端機 scrollback，之後任何翻歷史紀錄的動作都能撈到它——跟外洩沒有本質差別。
2. **把 k_new 加進每一個會解密該 DB 的環境的 `ENCRYPTION_KEYS`**（prod：Vercel Production **與** Preview，都標 Sensitive；dev：`.env.local`），redeploy／restart 後確認「顯示」（reveal）還正常。失效的樣子：漏掉某個環境（最常見是 Preview，或某台還在跑 `npm run dev` 但沒同步 `.env.local` 的機器）——那個環境當下看起來完全正常，直到它需要解一筆已經用 k_new 寫入的資料時才失敗，而失敗時間點跟漏改的時間點可能隔了很久，難以追溯。
3. **把 `ENCRYPTION_WRITE_KID` 指到 k_new**，同樣每個環境都要改，redeploy／restart。**從這個部署開始記錄 rollback floor**——回退／promote 都不能低於這個部署。失效的樣子：只改了 Production 沒改 Preview，之後任何在 Preview 上跑的一次性動作（包含本節的 runtime route）仍在用舊 write kid 寫入，跟步驟 4 的漏網部署是同一種錯。
4. **在重新加密之前，先刪除或停用「步驟 3 之前建立的每一個部署」**（Production 與 Preview 都要）。失效的樣子：漏刪的舊部署還能接到流量、還在用 k_old 寫入；重新加密跑完之後，這些新寫入又變成一批漏網的 k_old 資料——不會報錯，只會在下一次計數時對不起來，得再跑一次才會補齊，而且沒人會直覺知道要再跑一次。
5. **依環境跑重新加密（見下方「按環境跑」）**，只有在步驟 4 確認做完之後才開始。
6. **只看計數（count-only）**，確認每一欄都是 `v1:k_new:`，沒有殘留的舊格式或 legacy。跑一次在重新加密結束後、跑一次在下一步之前再驗一次。失效的樣子：計數裡混著 `v1:k_old:` 或 legacy 格式，代表某個環境沒切乾淨、或步驟 4 漏刪了部署，這時不要往下一步走。
7. **只有在步驟 6 的計數確認過、且 #1466（密文出現在 client payload）已經解決之後，才把 k_old 從環境變數移除**。失效的樣子：漏跑、漏刪部署造成的舊列還沒被步驟 5 覆蓋到就先移除 k_old，那些列從此解不開，但這時還沒到不可逆——把 k_old 從 secrets image 加回 `ENCRYPTION_KEYS` 就能救回來（見下方「回退」）；#1466 沒解決前，RSC payload 與瀏覽器快取裡可能還留著 k_old 的密文副本，輪替碰不到它們；拿到舊 key 的人仍解得開。這個失效沒有任何畫面或錯誤，只能靠 #1466 的 grep 驗收確認（見下方緊急輪替）。真正不可逆的是**步驟 8 把 k_old 銷毀之後**——一旦銷毀，就沒有辦法把 k_old 加回來了。
8. **k_old 移除後仍要留在 secrets image 裡離線保存**，直到「每日備份保留期、PITR window、任何操作者手動 `pg_dump`」這三者裡最晚的那個都過了才銷毀。失效的樣子：從備份或 PITR 還原出來的資料是舊快照，裡面的密文仍是 k_old 格式；如果 k_old 已經銷毀，還原出來的那份資料就永久解不開，備份形同白做。

**回退**：步驟 7 之前，把 write kid 指回 k_old（rollback floor 隨之調整回去）、重跑重新加密即可；步驟 7 之後，從 secrets image 把 k_old 加回 `ENCRYPTION_KEYS`（k_old 的位元組本身永遠沒被丟棄，只是先不在環境變數裡）。**例外：今天 prod 的 k_old（k1）從沒匯出過 Vercel，secrets image 裡沒有它**——對 k1 來說，從 Vercel 移除就等於銷毀（步驟 7 就是步驟 8），沒有加回來的路。所以 k1 必須留在 Vercel，直到備份／PITR／dump 的保留期都過了、#1466 也完成。失效的樣子：提早移除 k1 之後，任何從保留期內備份還原的舊資料都永久解不開，而且不會有任何錯誤提醒你這件事，直到真的要還原那天。

**按環境跑（步驟 5 的細節）：**

- **dev**：

  ```
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/reencrypt-pii.ts \
    --target=dev --env-file=<secrets image 上的 dev env 檔>
  ```

  先 dry-run，確認 preflight 全過、`toRewrite` 數字合理，再加 `--apply`。腳本要求一定要帶 `--env-file`（沒帶會直接被參數解析擋掉），且 dev env 檔本身就同時放 k_old 與 k_new——本機拿得到 dev 的完整 keyring，preflight／apply 都能直接跑。
- **prod**：preflight（`lib/reencryptCore.ts` 的 `reencrypt`）會先解開每一列，任何 kid 不在 keyring 裡就被 `lib/crypto.ts` 丟出 `Unknown key id`、preflight 整批中止，所以 prod 步驟 5 用的 keyring **必須同時含 k_old 與 k_new**。
  - **k1 → k2 那次（2026-09）**：prod 的 k1 只活在 Vercel 裡（見本節開頭「陷阱」），當時本機與 dmg 裡標成 prod 的 env 檔放的都是 dev 金鑰——拿它們對 prod 跑腳本，preflight 會對每一列都失敗，不是資料壞了，是金鑰拿錯了。本機湊不出含 k1 的 keyring，所以用了上面「prod 重新加密：runtime route」那個模式。
  - **從 k2 開始**：k2 已經備份在 secrets image，下一次輪替（k2 → k_new）可以直接在本機用一份同時含 k2 與 k_new 的 keyring 跑腳本做步驟 5。runtime route 留作 k_old 不在離線備份裡時的備案。
  **只含 k_new 的 env 檔，只能用在重新加密**之後**的備份校驗**：在 k_new 已經備份進 secrets image、且步驟 5 已經把所有列轉成 `v1:k_new:` 之後，用一份只放 prod DB 連線字串、`ENCRYPTION_KEYS`（只有 k_new）與 `ENCRYPTION_WRITE_KID=k_new`（不放 `ENCRYPTION_KEY`）的 env 檔跑 dry-run，預期結果是全部 `current`、`preflight_failed=0`——這證明的是「secrets image 裡備份的 k_new 真的能解開全部 prod 資料」，不是在做步驟 5 本身；如果這時 DB 裡還混著任何 k_old 或 legacy 列，這份只含 k_new 的 keyring 一樣會在那些列上 preflight 失敗，因為它本來就解不開 k_old。

### 緊急輪替

順序跟上面規劃內的 8 步**完全一樣**（尤其步驟 4 一定要在重新加密之前做完），另外多這些：

- **同時輪替每一個跟這把加密金鑰放在一起的其他機密**：DB 密碼（`DATABASE_URL`／`DATABASE_URL_DIRECT`，包含所有本機 env 檔）、Supabase service key、其他 Vercel 機密、Vercel 團隊成員與 token。失效的樣子：只換了加密金鑰，其他放在同一份 dmg／同一個密碼管理器條目附近的機密沒有跟著換——攻擊者仍握有等價的存取路徑，輪替沒有真正把人趕出去。
- **唯讀的 persistence audit**：`pg_roles`、`cron.job`、`pg_proc`（找 SECURITY DEFINER functions）、triggers、RLS policies、`auth.users`／`auth.identities`。目的是找有沒有被植入的存取路徑，這一步全程唯讀，不要邊查邊改。失效的樣子：邊查邊改（例如查到可疑的 trigger 就順手刪掉）會把「調查」跟「處置」混在一起，事後說不清楚攻擊者留下的東西哪些是自己動手清掉的、哪些原本就不存在，稽核與後續通報都會失去依據。
- **是否通知受影響的人是使用者要做的決定**，不是自動化流程能自己判斷的一步——資料涵蓋兒童的身分證字號等個資，通知義務的判斷留給人。失效的樣子：自動化流程自己決定「這次影響不大不用通知」或反過來自動發出通知，兩種都是拿走了本該由人承擔的判斷與責任。
- **洩漏當下已經存在的備份、資料庫 dump、瀏覽器快取裡的密文，都是用洩漏的那把金鑰加密的**——輪替救不回它們；這些副本永遠暴露，直到它們自然過期或被找出來個別處理。
- **從 Vercel 移除 k_old（步驟 7）要等 #1466（密文出現在 client payload）解決之後才能做**——在那之前，RSC payload 或瀏覽器快取裡可能還留著用 k_old 加密的密文副本，任何拿到那份洩漏金鑰的人都還解得開它們；rotation 本身碰不到瀏覽器端的這些副本，app 也從來不會去解密它們，所以移除 k_old 前，這批副本的暴露狀態不會因為 rotation 而改變。

### 規則

- **kid 永遠不重複使用；一個 kid 對應的位元組永遠不原地修改**，輪替一律是新增一個 kid，不是換掉舊 kid 的內容。失效的樣子：如果把某個 kid 對應的 key bytes 直接換掉，等於在原地竄改一個本應不可變的映射——所有還沒被重新加密、標著那個 kid 的舊密文瞬間全部解不開，而且沒有任何錯誤訊息會指出「key 被換掉了」這個原因，看到的只是一片解密失敗，很難聯想到根因。
- **dev、prod 用的金鑰各自獨立，不共用**。失效的樣子：共用一把金鑰不會產生任何錯誤——傷害在於 dev 的金鑰散落在更多機器與檔案裡，dev 那邊一洩漏，prod 的資料也跟著暴露。（反過來「拿錯環境的金鑰」才會讓 preflight／reveal 全部失敗，就是本節開頭的「陷阱」。）
- **金鑰永遠不出現在指令列參數，也永遠不印到終端機畫面**。失效的樣子：指令列參數會進 shell history 與進程列表（`ps`）；印到畫面會留在終端機 scrollback 與任何終端機 log 或螢幕錄影裡——兩者都是「當下看起來一切正常，直到有人事後翻歷史紀錄或錄影才發現」的洩漏路徑。

### rollback floor 現況（S2 → S3b）

S2 導入時的回退方式是「把 `ENCRYPTION_WRITE_KID` 拿掉、redeploy／restart，資料照樣以 legacy 格式寫入」——這個回退方式**只在 legacy 格式還沒退場之前**成立。legacy 退場（S3b：拿掉 legacy 的 encode／decode 分支）在另一個 PR 做，一旦它上線，rollback floor 就上升到「**第一個帶著 `ENCRYPTION_WRITE_KID` 設定值上線的部署**」。實際能安全回退的底線是下面兩者中**較晚**的那個：(a) 這個 phase-2 floor；(b) 最近一次輪替步驟 3 的部署（第一個用 k_new 寫入的部署）。失效的樣子：回退到 (b) 之前的部署，那個 build 的 keyring 裡沒有 k_new，所有 `v1:k_new:` 的資料按「顯示」都會失敗。S2 那種「拿掉 write kid 就能退回」的做法**不再適用**——`encrypt` 在沒有 write kid 時會直接 throw，不會退回成 legacy 寫入。之後任何回退都只能是「把 write kid 指到另一個仍在 keyring 裡的 kid」，不能指望退回沒有 kid 的狀態。

### dev 演練（尚未執行）

在對 prod 真正輪替之前，規劃是先在 dev 上完整跑一次上面 8 步，驗證 runbook 本身寫得對，而不是直接拿 prod 試錯。演練的結局跟一般 rotation 不一樣：**dev 這次的 k_new 會變成 dev 之後永久使用的金鑰**，不是跑完就丟——所以步驟 8 的「k_old 銷毀」在 dev 演練裡照樣走完，k_old 不會被刻意留著等 rollback 之外的理由。

- 8 步全部在 dev 上跑一次，每一個「使用者跑的環境／金鑰操作」與每一次 `--apply` 都需要使用者自己動手，不代跑。
- 驗收標準：跑完後 dev 的計數顯示每一欄都是 `v1:k_new:`（沒有 legacy、沒有 k_old 殘留），並且每一種欄位型別都至少「顯示」一筆驗證解密正常。
- k_new 演練完之後同時留在 secrets image（離線備份）與 `.env.local`（讓本機 `npm run dev` 能繼續寫入／解密）兩處。
- 這次演練跟前面「prod 重新加密：runtime route」不是同一件事——dev 本機本來就拿得到完整 dev keyring，不需要 runtime route，直接用「按環境跑」段落裡 dev 那條腳本指令即可。

### 現況（generic，不含金鑰值）

prod 目前寫入與儲存用的是輪替後的新 kid；那把新 kid 已經備份進 secrets image。舊 kid 仍留在 Vercel，但只當作解密的備援，直到「備份／PITR 保留期」都過了，並且 #1466（密文出現在 client payload）落地之後，才會被真正移除。舊 kid 沒有離線備份，所以從 Vercel 移除它就是銷毀它（見上方「回退」的例外）。

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
