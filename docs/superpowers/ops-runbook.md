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

## Runtime DB role (futari_app)

> #1467。`drizzle/0072_futari_app_role.sql` 建立角色並授權；`scripts/ops/drop-futari-app-role.sql` 拆掉它。本節是 generic 的操作程序——不含任何連線字串、密碼、主機名稱。

**角色分工**

| 誰 | 連線 | 身分 |
|---|---|---|
| app runtime（Vercel、本機 `npm run dev`） | `DATABASE_URL`（pooler） | `futari_app`（逐環境切換完成之後；切換之前仍是 `postgres`） |
| migrations（`drizzle-kit migrate`） | `DATABASE_URL_DIRECT` | `postgres`，不變 |
| pg_cron jobs | DB 內部 | `postgres`，不變 |
| 需要管理權限的整合測試（seed `auth.users`、套 DDL、呼叫 SECURITY DEFINER function，例如 `__tests__/actions/accountDeletion0068.test.ts`） | `DATABASE_URL_DIRECT` | `postgres` |

### 為什麼是 BYPASSRLS

DB session 裡沒有 JWT claims——授權在 app 程式碼裡做（`requireViewerGroup`，見 [authorization-design.md](specs/authorization-design.md)），RLS policy 是給 client 端 anon key 用的。`futari_app` 不帶 BYPASSRLS 的話，policy 看不到任何 `auth.uid()`，每一條 Drizzle 查詢都會被 RLS 過濾掉。

- **失效的樣子**：不是權限錯誤，是**每個查詢都靜默回 0 筆**——dashboard 全空、記帳像沒存進去（INSERT 會被 `WITH CHECK` 擋成 42501，但讀取完全沒有錯誤）。看到「換了連線之後資料全不見」先查 `rolbypassrls`，不要去查資料。

### 擋得住／擋不住

- **擋得住**：建立角色（換掉密碼也還活著的後門）、DDL（`ALTER`／`DROP`／關 RLS／`TRUNCATE`）、改寫 `auth.*`、`cron` 排程加 `net.http_post` 把資料送出去、讀 `vault.decrypted_secrets`、讀 `storage.*`、在 `public` 建 function／table、建 schema。
- **擋不住**：**`DATABASE_URL` 外洩後，對方仍然讀得到、改得到 app 的每一筆資料**——BYPASSRLS 加上 public 全表的 SELECT／INSERT／UPDATE／DELETE，就是 app 本身能做的全部事情。另外 PUBLIC 預設的 `TEMPORARY` 讓它能建 temp table（session 結束就消失，碰不到其他 schema）。這個角色縮小的是「外洩之後能不能擴權、能不能留下來」，不是「外洩之後看不看得到資料」。
- **`postgres` 的密碼輪替之前，這份保護只涵蓋「目前這份 runtime env」外洩**：舊的 `postgres` 連線字串還在本機 env 檔與 secrets image 裡，拿到它的人仍有完整權限。輪替 `postgres` 密碼是另一個步驟（#1467 S4b），要等 Production 切換穩定之後。
- **規則：`futari_app` 的授權永遠只到 public 的 DML（加上 sequence 的 USAGE／SELECT）**。要多給任何東西（別的 schema、function EXECUTE、TRUNCATE）都要先過一次新的安全審查。測試撞到 42501 而那個測試本來就需要管理權限，修法是把測試換到 `DATABASE_URL_DIRECT`，不是加 grant。
  - **失效的樣子**：一次「順手補個 grant 讓測試過」不會有任何錯誤，只會讓這個角色慢慢長回 `postgres` 的樣子——控制點是 0072 之後每一個含 `futari_app` 的 migration 都要被當成安全變更審查。

### 連線方式：只有一種

所有 `postgres` 與 `futari_app` 的 psql session 都走 **service file + password file**，兩個檔都放在 secrets image 上：

```
PGSERVICEFILE="<secrets image>/pg_service.conf" PGPASSFILE="<secrets image>/.pgpass" \
  psql service=futari_dev_admin -f <file>.sql
```

- Service 名稱：`futari_dev_admin`、`futari_dev_app`、`futari_prod_admin`、`futari_prod_app`。
- `pg_service.conf` 只放 `host`／`port`／`user`／`dbname`（pooler 的 user 是 `futari_app.<project-ref>` 這種格式）；**密碼只在 `.pgpass`**（`host:port:dbname:user:<secret>` 一行一筆）。
- `.pgpass` 權限必須是 `600`。**失效的樣子**：權限太寬時 libpq 會印一行 `WARNING: password file … has group or world access` 然後**直接忽略這個檔**，接著改成在提示字元要你輸入密碼——看起來像「密碼錯了」，其實是檔案權限。
- 需要 psql 的每一步都由使用者自己跑；agent 只寫 SQL 檔、讀輸出（計數／名稱／OK-DENIED），**不經手任何密碼**，也不對 app 角色跑 psql。

### 禁止事項（`futari_app` 與 `postgres` 的密碼都適用）

- **不用直接帶密碼值的 libpq 環境變數**（只用 `PGPASSFILE` 指向檔案）；**不把連線字串或密碼放在指令列參數**（`psql "<url>"`、`-c` 帶密碼）。失效的樣子：兩者都會進 shell history 與進程列表（`ps`），當下什麼錯都沒有。
- **不把密碼寫進 SQL 文字**（包括自己打 `ALTER ROLE … WITH` 帶明文）。Supabase 對 `postgres` 開了 DDL statement logging，明文會原封不動進 Logs Explorer，任何能開 dashboard 的人都看得到、而且留存。失效的樣子：指令成功、角色能登入，一切正常——密碼只是安靜地躺在 log 裡。
- **不用 dashboard 的 SQL editor 做任何碰密碼的事**（它會留查詢歷史）。
- **密碼不進 repo（本 repo 是公開的）、不進任何 log、不進 agent transcript**。`tests/futari-app-role-guard.test.ts` 會掃本節與 `scripts/ops/drop-futari-app-role.sql`／`0072`，出現密碼形狀的字串就失敗；它擋不住 log 與 transcript，那兩個只能靠上面的做法。

### 啟用步驟（每個環境：先 dev，再 prod；全部由使用者執行）

1. **跑 migration**（dev：`npm run db:migrate`；prod：見上方〈Prod：npm script 到不了〉），然後照〈Dev：跑完必須驗證資料效果〉直接查資料確認 0072 真的跑了：`select rolname, rolcanlogin, rolbypassrls from pg_roles where rolname = 'futari_app'` 要有一列、`rolcanlogin = false`、`rolbypassrls = true`。
2. **確認 `SHOW password_encryption;` 是 `scram-sha-256`**（admin service）。不是就停。失效的樣子：若是 `md5`，下一步 psql 仍會在 client 端雜湊，但存進去的是 md5 驗證值——能登入、不報錯，只是比預期弱。
0. **工具**：需要 psql（macOS：`brew install libpq`，它是 keg-only，不會進 PATH——用 `/opt/homebrew/opt/libpq/bin/psql` 或自己加 PATH）。指令從文件複製時，留意貼進來的不換行空白（NBSP）。失效的樣子：zsh 回 `command not found: psql service=futari_dev_admin`——整串被當成一個指令名稱，因為中間的「空白」其實是 NBSP；手打一次就好。
3. **產生密碼並寫好 `.pgpass`**：`python3 scripts/ops/futari-app-pgpass.py "<secrets image>" <env>`（prod 要多帶 `--admin-env-file <存 prod DATABASE_URL_DIRECT 的檔>`，因為 `.env.local` 指向 dev）。它產生 64 hex 的新密碼寫進 `futari_<env>_app.pw`，並把 admin／app 兩行寫進 `.pgpass`，都是 `600`、不印出任何秘密；`futari_<env>_app.pw` 已存在就拒絕執行，避免重跑時產生第二組、跟伺服器上的對不起來。
4. **設定密碼**：`psql service=futari_<env>_admin` 裡執行 **`\password futari_app`**（一定要帶角色名稱），在提示字元貼上 `pbcopy < "<secrets image>/futari_<env>_app.pw"` 的內容，貼完 `pbcopy < /dev/null` 清掉剪貼簿。psql 在 client 端算好 SCRAM 驗證值才送出。
   - **失效的樣子（漏了角色名稱）**：`\password` 不帶參數改的是**目前登入的角色**，也就是 `postgres`。Supabase 會擋下來（`permission denied to alter role`），所以不會真的改到——但 `futari_app` 也就沒有密碼，下一步連線測試會得到 `EAUTHQUERY … unsupported or invalid secret format`（Supavisor 的說法是「這個角色沒有可用的密碼」，不是「密碼錯」）。重跑 `\password futari_app` 即可。
   - **剪貼簿是第二個外洩面**：沒清掉的剪貼簿會在下一次貼上時跟著出去——聊天框、issue、或替 agent 打字的瀏覽器工具（2026-10-01 dev 切換時，一段 terminal 輸出就是這樣被貼進了測試紀錄的描述；那段不含密碼，但下一次可能有）。
5. **開放登入**：`ALTER ROLE futari_app LOGIN;`
6. **確認 log 乾淨**：Logs Explorer（`postgres_logs`）搜 `PASSWORD`。Supabase 會把密碼語句記成 `ALTER USER "futari_app" …`，密碼值的位置顯示成 `{REDACTED}`——看到 `{REDACTED}` 或 `SCRAM-SHA-256$…` 都是乾淨的；同時確認被改的角色是 `"futari_app"`，不是 `"postgres"`（那就是步驟 4 漏了角色名稱）。
7. **連線測試一次**（circuit breaker，見下）：`psql service=futari_<env>_app -c 'select current_user'`，回 `futari_app` 才往下。
8. **寫進 env**：
   - dev：`python3 scripts/ops/futari-app-db-url.py "<secrets image>" dev` 從 service file + `.pgpass` 組出 transaction pooler（6543、`?pgbouncer=true`）的 URL，原地改寫 `.env.local` 的 `DATABASE_URL`（worktree 的 symlink 照樣有效），舊的那行備份到 `dev-DATABASE_URL.postgres.bak`（`600`）。退回：同一指令加 `--rollback`。之後重啟 `npm run dev`。
   - prod：`… prod --pbcopy` 把 URL 放進剪貼簿，貼到 Vercel 的 `DATABASE_URL`（標 **Sensitive**），然後**立刻** `pbcopy < /dev/null`。不寫進任何檔案。
   - **驗收**（dev 2026-10-01 的做法）：`pg_stat_activity` 裡 runtime 連線全是 `futari_app`；dashboard 有資料（BYPASSRLS 生效——沒生效的樣子是畫面空白、不報錯）；新增／編輯／刪除一筆紀錄＋月回顧留言成功；主要頁面 200；`postgres_logs` 從切換時間起沒有 permission denied。這條 log 查詢要先用切換前的時間窗確認抓得到已知錯誤，才能相信它回的「0 筆」。

### Circuit breaker：失敗一次就退回，不重試

Supabase 的 pooler 對同一來源的連續認證失敗會暫時封鎖該 IP（約 150 秒內 10 次失敗 → 封鎖約 120 秒）。

- 改任何 Vercel env 之前，先照步驟 7 從本機用**完全相同**的值連一次。
- Preview 驗證先只打**一個**請求；失敗就立刻把 env 改回去，不重試、不「再部署一次看看」。
- **失效的樣子**：錯的密碼進了 Vercel，每個 lambda 都在重試，幾秒內就把 Vercel 出口 IP 送進封鎖名單——之後連**正確**的連線也會連續兩分鐘失敗，看起來像是「改回去也沒用」，其實是還在封鎖期。

### 每次 migration 之後：覆蓋檢查

0072 的 `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` 讓之後 `postgres` 建的 table／sequence 自動授權給 `futari_app`。**只涵蓋 `postgres` 建的物件**——用別的角色建的（例如在 dashboard 以其他身分建表）不會被涵蓋。每次跑完 migration（dev 與 prod 都一樣），用 admin service 跑：

```sql
-- 必須 0 列：任何一列 = runtime 讀寫不了的 public table
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
  and not (has_table_privilege('futari_app', c.oid, 'SELECT')
       and has_table_privilege('futari_app', c.oid, 'INSERT')
       and has_table_privilege('futari_app', c.oid, 'UPDATE')
       and has_table_privilege('futari_app', c.oid, 'DELETE'));

-- 必須 2 列（objtype r 與 S）：default privileges 還在
select da.defaclobjtype
from pg_default_acl da join pg_namespace n on n.oid = da.defaclnamespace, aclexplode(da.defaclacl) a
where n.nspname = 'public' and pg_get_userbyid(da.defaclrole) = 'postgres'
  and a.grantee = (select oid from pg_roles where rolname = 'futari_app')
group by 1;
```

- **失效的樣子**：新表的 migration 部署後什麼事都沒有，直到 prod 第一次寫那張表時丟 `permission denied for table …`（42501）——在那之前沒有任何東西會失敗。有列就補 `GRANT SELECT, INSERT, UPDATE, DELETE ON "<table>" TO futari_app`（寫成新的 migration），不要改用別的角色。

### 錯誤監看

切換期間與之後，看 Supabase **Logs Explorer 的 `postgres_logs`**，篩 `user_name = 'futari_app'` 且 SQLSTATE `42501`；再加 Sentry（`lib/db/sanitizeError.ts` 清掉值但保留 `code`）。**不用 `pg_stat_statements`**——失敗的語句不會進它的統計，看起來會是「零錯誤」。

- **失效的樣子**：只看 `pg_stat_statements` 或只看 Vercel 回應碼，權限錯誤可能被 server action 轉成一般錯誤訊息，畫面上只是「儲存失敗」，不會有人聯想到 DB 角色。

### 逾時設定（安全網，不是調校）

0072 設了 `statement_timeout = 30s`、`idle_in_transaction_session_timeout = 60s`（只作用在 `futari_app`；migration 與 pg_cron 不受影響）。

- **失效的樣子**：合法的長查詢被砍會丟 57014 `canceling statement due to statement timeout`；交易開著不動超過 60 秒，連線會被終止（25P03）。看到這兩個 code 先確認是不是有 query 真的變慢了，不要直接把逾時調大。
- `futari_app` 可以對自己 `ALTER ROLE … SET` 改掉這兩個值——所以事故處理要 `RESET ALL` 再重設（見下）。

### 事故處理：懷疑 `futari_app` 的密碼外洩

1. **換密碼**：admin service 裡 `\password futari_app`（照啟用步驟 3–4；步驟 3 的腳本看到舊的 `futari_<env>_app.pw` 會拒絕執行，先把它改名成 `.pw.old`，新密碼上線後再刪），更新 `.pgpass` 與各環境 env（Vercel 標 Sensitive），redeploy。需要立刻切斷時先 `ALTER ROLE futari_app NOLOGIN;`（會造成 app 停擺，直到新密碼上線再 `LOGIN`）。
2. **重設角色設定**：`ALTER ROLE futari_app RESET ALL;` 再重跑 0072 最後兩條 `ALTER ROLE futari_app SET …`。
3. **踢掉既有連線**：`select pg_terminate_backend(pid) from pg_stat_activity where usename = 'futari_app';`（`postgres` 在 Supabase 上是 `pg_signal_backend` 的成員）。換密碼不會中斷已經登入的 session，這一步不能省。
4. **唯讀確認沒有留下東西**：`futari_app` 擁有的物件必須是 0（`pg_class`／`pg_proc`／`pg_namespace`／`pg_type`／`pg_largeobject_metadata` 的 owner），`pg_auth_members` 裡它不屬於任何角色，再跑一次上方覆蓋檢查確認沒有多出來的授權。同〈緊急輪替〉：全程唯讀，查完再處置。
5. **對方可能已經自己改了密碼**：一般角色可以改自己的密碼，症狀是 app 突然全面 28P01（認證失敗）。處理方式一樣是步驟 1，admin 的 `\password` 會蓋過去。
6. **資料本身已暴露**：這個角色本來就讀得到全部 app 資料（見「擋不住」），是否需要通知使用者是使用者的決定，同〈緊急輪替〉。

### Rollback

1. 把 `DATABASE_URL` 改回原本的 `postgres` pooler URL（原值保留在 secrets image），redeploy／重啟 dev server。
2. 要不要連角色一起拆：確認**沒有任何環境還在用 `futari_app`**之後，admin service 跑 `scripts/ops/drop-futari-app-role.sql`。
   - **失效的樣子**：順序反過來（先拆角色再改 env），app 在拆的那一刻開始每個請求都連不上 DB，沒有漸進的徵兆。
3. 之後要重建：用 admin 身分重跑 `0072` 的內容（idempotent）——`db:migrate` 不會重跑已記錄的 migration——再從〈啟用步驟〉2 開始。

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
