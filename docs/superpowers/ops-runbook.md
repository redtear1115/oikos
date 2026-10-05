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
   - **每日備份保留期（#1549）＝約 60 天**：Drive 上 30 份，加上被清掉之後在 Drive 垃圾桶的 30 天（見〈Prod backup (futari_backup)〉）。哪一份備份依賴哪些 kid，看該份 manifest 的 `## encrypted_kids`——k_old 要等到**最後一份含 `v1:k_old:` 的備份**被清出垃圾桶之後才能銷毀。
   - PITR：prod 是 Free plan，沒有。

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

**備份與 PITR 這個條件（#1287 的關卡）**：prod 沒有 PITR（Free plan）。#1549 的每日備份從輪替完成之後才開始，當時 prod 的加密欄位已經全部是新 kid（22 筆，2026-10-04），所以**這些備份只依賴新 kid，不會延長舊 kid 的保留**。這要用第一份 prod 備份 manifest 的 `## encrypted_kids` 確認：除了 `null`（該列這欄沒有值）之外只能有新 kid。出現舊 kid 或 `other`，就停下來改寫這一段，不要照原計畫移除舊 kid。任何操作者手動 `pg_dump` 那一項不受影響，仍要個別確認。

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
     - **Vercel 不讓你改 Sensitive 變數的環境勾選**：原本 Production＋Preview 共用一個 Sensitive 的 `DATABASE_URL` 時，取消勾選 Preview 會被擋。做法是刪掉重建成兩個（Production 用舊值、Preview 用新值）。正在跑的部署不受影響，因為環境變數在部署建立時就固定了；但刪掉到重建 Production 之間不能有 Production 部署。Production 的值重貼之後，要等下一次 Production 部署才算驗收。
     - **驗收時要看 prod 資料庫，不是看 Vercel**：`pg_stat_activity` 要出現 `futari_app`／Supavisor 的連線。閒置連線會被回收，所以要先打一個請求，否則「沒有連線」什麼都說明不了。
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

1. **換密碼**：admin service 裡 `\password futari_app`（照啟用步驟 3–4；步驟 3 的腳本看到舊的 `futari_<env>_app.pw` 會拒絕執行，先把它改名成 `.pw.old`，新密碼上線後再刪；dev 的 `.env.local` 要先 `futari-app-db-url.py … dev --rollback` 再重跑，因為它看到已經是 `futari_app` 會拒絕），更新 `.pgpass` 與各環境 env（Vercel 標 Sensitive），redeploy。需要立刻切斷時先 `ALTER ROLE futari_app NOLOGIN;`（會造成 app 停擺，直到新密碼上線再 `LOGIN`）。
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

## Prod backup (futari_backup)

> #1549。prod 是 Supabase Free plan：**沒有自動備份、沒有 PITR**，在這之前從沒備份過。`drizzle/0081_futari_backup_role.sql` 建唯讀角色；`drizzle/0082_backup_auth_views.sql` 建 `backup_auth` 的兩個唯讀 view（auth 資料只從這裡讀）；`scripts/ops/backup-prod.sh` 每天備份；`scripts/ops/backup-restore-drill.sh` 演練還原；`scripts/ops/drop-futari-backup-role.sql` 拆角色。本節是 generic 的操作程序——不含連線字串、主機名稱、Drive 路徑、金鑰。

**流程一覽**

| 環節 | 在哪裡 | 說明 |
|---|---|---|
| 排程 | 使用者的 Mac（桌機、常開），launchd 每天 03:30 | `~/Library/LaunchAgents/local.futari.backup.plist` → `~/.local/libexec/futari-backup/futari-backup-run.sh`（先比對 SHA-256）→ `backup-prod.sh` |
| 連線 | session pooler、`sslmode=verify-full` | 身分 `futari_backup`；密碼在 macOS 鑰匙圈，執行時寫成暫存的 600 `PGPASSFILE`，結束即刪 |
| 一致性 | 一個 `REPEATABLE READ` 交易 `pg_export_snapshot()` 後一直開著 | `pg_dump --snapshot`、兩段 auth 的 `COPY`（第二個 session `SET TRANSACTION SNAPSHOT`）與 manifest 的計數都來自同一個快照；同時最多 2 條連線 |
| 加密 | `pg_dump \| age -r <公鑰>`、`COPY … TO STDOUT \| age -r <公鑰>` 串流 | 硬碟上從來沒有明文；公鑰在安裝時寫死進安裝的副本，不從設定檔讀 |
| 上傳 | rclone → Google Drive（`drive.file` scope） | 上傳後比對大小與 md5，寫 `LAST_OK`，再清舊備份 |
| 解密金鑰 | 「Futari Backup Key」dmg（密碼和 Futari Secrets **不同**）＋一份**異地的紙本** | 只有演練與還原時掛載 |

每份備份是 Drive 上的一個資料夾 `futari-prod-<UTC 時間>/`，**4 個檔**（manifest 的 `## dump` 寫 `bundle_format 2`）：

- `public.dump.age`：public＋drizzle 的 schema 與資料（`pg_dump -Fc`）。
- `auth-users.copy.age`、`auth-identities.copy.age`：`auth.users`、`auth.identities` 的資料，**只有資料**——`COPY (SELECT r FROM backup_auth.<表>) TO STDOUT` 的輸出，一行一個整列的 jsonb（`to_jsonb`，含 generated 欄位；還原時略過）。
- `manifest.txt.age`：計數、加密欄位各 kid 的筆數、realtime publication、`cron.job`、extensions、auth 上的 trigger、各表與欄位的 ACL、版本、`bundle_format`。

`bundle_format 1`（auth 是 pg_dump 檔 `auth.dump.age`）從來沒有真的產生過——0081 的 auth grant 在 Supabase 上被拒，備份在第一次跑之前就改成現在的格式；演練腳本只接受 2。

**保留**：最新 30 份；永遠不少於 7 份；未滿 30 天的不刪。清掉的進 Drive 垃圾桶（再留約 30 天）——所以一份資料最長約 **60 天**後才真正消失，隱私權政策寫的就是這個數字。改保留規則＝改隱私權政策。

### 擋得住／擋不住

- **擋得住**：
  - `futari_backup` 外洩後的寫入、DDL、建角色、讀 `vault.decrypted_secrets`、讀 `storage.*`、讀 auth 的其他表（sessions、refresh tokens、MFA）——它只有 SELECT／USAGE，而且只在 public、drizzle、`backup_auth.users`／`backup_auth.identities`（schema `backup_auth` 的 USAGE）、`cron.job`。對 schema `auth` 本身**沒有任何權限**。
  - 透過 view 改 auth 資料：兩個 view 加了 `OFFSET 0`，不是可更新的 view（DELETE 會 55000）；角色本來也只有 SELECT。備份每次在 `privileges` 階段確認自己對 `backup_auth` 沒有 INSERT／UPDATE／DELETE／TRUNCATE、沒有 CREATE，有就拒絕執行。
  - Drive 帳號被入侵：拿到的是 age 密文，沒有 identity 解不開。
  - 備份檔或暫存目錄被別的使用者帳號讀到：目錄 700、檔案 600，也沒有明文 dump。
- **擋不住**：
  - **`futari_backup` 的密碼外洩＝全部 app 資料加上 `auth.users`、`auth.identities`（Email、各種 token 欄位）都讀得到**——BYPASSRLS 加上全表 SELECT，就是一份完整的備份。`backup_auth` 的 view 是 `postgres` 擁有、以 `postgres` 的權限讀的**同一份資料**（整列，每個欄位），換成 view 沒有縮小暴露面，只是不用動 schema `auth` 的權限。這個角色縮小的是「能不能改、能不能留下來」，不是「看不看得到」。
  - **鑰匙圈擋不住以你身分執行的程式，包括 agent**：對 `/usr/bin/security` 點過「永遠允許」之後，同一使用者的任何程序都能讀出這個密碼。SHA-256 檢查也一樣——同一使用者能改腳本，也能改 `SHA256SUMS`。它擋的是手滑與裝錯版本，不是同帳號的惡意程式。
  - **age identity＋任何一份備份＝那一天的全部資料**。加密欄位在備份裡仍是密文，要再加上 `ENCRYPTION_KEYS` 的 k2 才讀得到；其餘欄位就是明文。
  - `default_transaction_read_only` 只是護欄：session 可以自己 `SET` 回來。真正的控制是 grant 只有 SELECT。
  - 擁有 Drive 帳號的人可以刪光備份；Drive 垃圾桶的 30 天是最後一道緩衝。
- **規則：`futari_backup` 的授權永遠只有上面那幾處的 SELECT／USAGE**，`tests/futari-backup-role-guard.test.ts` 會擋。要多給（別的 schema、`pg_read_all_data`、EXECUTE、SECURITY DEFINER 函式）先過一次新的安全審查。
  - **失效的樣子**：某個 grant 被拒、或備份讀不到某張表時，最快的「修法」是給 `pg_read_all_data`——不會有任何錯誤，只是這個角色從此讀得到 vault、storage 與每一個 schema。遇到就停下來問，不要這樣補。
  - **撤回紀錄（2026-10-05）**：這裡原本寫「`auth.*` 的 grant 被拒就**停**」，當成 migration 出錯的訊號。實際上那是 Supabase 的常態：`auth` 屬於 `supabase_admin`，`postgres` 對它只有不帶 grant option 的 USAGE，所以 0081 的 `GRANT USAGE ON SCHEMA auth TO futari_backup` 一定被拒（WARNING 01007，什麼都沒給；dev 上確認過），表的 grant 成功了也用不到。解法是 0082 的 `backup_auth` view，不是停下來、更不是更大的權限。0081 本身已套用、不改；它那行在 prod 會照樣跳 WARNING，無害。0082 也把 0081 給 `auth.users`／`auth.identities` 的表 grant 收回。
- **`backup_auth` 的 view 必須維持「擁有者權限」**（不開 `security_invoker`）：view 以擁有者 `postgres` 的權限讀 `auth`，`futari_backup` 才不需要 `auth` 的任何權限。
  - **失效的樣子**：有人為了清掉 Supabase advisor 的警告把 view 設成 `security_invoker=on`——設定當下什麼都沒壞；之後**每一晚**的備份都在 `copy-auth-users` 階段失敗，錯誤種類 `permission`（`permission denied for table users`）。改回來：`ALTER VIEW backup_auth.users RESET (security_invoker);`（identities 同），或用 admin service 重跑 0082 的內容（最後的 DO 區塊會拒絕帶選項的 view）。
- **Supabase Auth 升級不會被這兩個 view 擋住**：view 是 `to_jsonb(整列)`，在 `pg_depend` 只記整張表、不記任何欄位，所以 Supabase Auth 自己的 migration（DROP COLUMN、ALTER COLUMN TYPE、RENAME）照常執行，新欄位自動出現在 `r` 裡（dev 上在會 rollback 的交易裡實測過）。所以沒有欄位漂移檢查，也沒有 refresh 腳本。
  - **失效的樣子**：如果有人把 view 改成列出欄位（`SELECT id, email, … FROM auth.users`），平常一切正常；直到某次 Supabase Auth rollout 要改那個欄位，Auth 的 migration 失敗——**使用者登入失敗**，Supabase 的 Auth log 出現 `2BP01`（cannot drop … because other objects depend on it）或 `0A000`（cannot alter type of a column used by a view），訊息裡點名 `backup_auth`。立刻用 admin service 跑 `DROP SCHEMA backup_auth CASCADE;`（只是 view，不丟資料；當晚備份會失敗），讓 Auth 恢復，再把 0082 的整列版本重套回去。
- **BYPASSRLS 是必要的**：沒有它，`pg_dump` 遇到第一張有 RLS 的表就失敗；`cron.job` 也受 pg_cron 的 RLS 保護，manifest 會列出 0 個 job。**不要用 `pg_dump --enable-row-security` 繞過**：session 沒有 JWT，每條 policy 的 `auth.uid()` 都是 NULL，備份會「成功」，但每張表都是 0 筆——只有還原那天才會發現。

### 設定步驟（每個環境：先 dev，再 prod；全部由使用者執行）

0. **工具**：`brew install age rclone postgresql@17`，演練另外要 Supabase CLI 與 colima（docker）。`postgresql@17` 是 keg-only，路徑在 `/opt/homebrew/opt/postgresql@17/bin`。**pg_dump 的大版本要等於伺服器的大版本**（目前 17）；Supabase 升級到 18 時，腳本會在 `tools` 或 `snapshot` 階段失敗並說明，裝 `postgresql@18`、改設定檔的 `PG_BIN_DIR` 與 `PG_MAJOR`。
1. **跑 migration**（見〈Drizzle Migrations〉；0081 與 0082），然後直接查資料：`select rolname, rolcanlogin, rolbypassrls, rolconnlimit from pg_roles where rolname = 'futari_backup'` 要有一列、`false`／`true`／`2`。再確認：
   - `true`：`has_schema_privilege('futari_backup', 'backup_auth', 'USAGE')`、`has_table_privilege('futari_backup', 'backup_auth.users', 'SELECT')`、`has_table_privilege('futari_backup', 'backup_auth.identities', 'SELECT')`、`has_table_privilege('futari_backup', 'cron.job', 'SELECT')`。
   - `false`：`has_table_privilege('futari_backup', 'backup_auth.users', 'INSERT,UPDATE,DELETE,TRUNCATE')`（identities 同）；anon／authenticated／service_role 對 `backup_auth` 的 USAGE 與兩個 view 的 SELECT。
   - **預期是 `false`**：`has_schema_privilege('futari_backup', 'auth', 'USAGE')`。這是 Supabase 的常態，不是錯（見上方撤回紀錄）；備份不讀 `auth`。
   - 0082 最後的 DO 區塊會逐一核對 `backup_auth` 的擁有者、ACL 與 view 選項，不符就 RAISE、整個 migration 失敗——那時**停下來問**，不要手動補 grant。cron 的 grant 失敗也一樣停。
   - **dev 的例外**：dev 已經套用過時間更晚的 outing migration，drizzle 只套用 `when` 比最後一筆新的項目，所以 `npm run db:migrate` 在 dev 上會**靜默跳過** 0082（沒有錯誤，`backup_auth` 就是不存在）。dev 的 0082 是 2026-10-05 用 admin service 手動執行檔案內容套上的，不補 journal 列（已經有更新的項目）。prod 沒有這個問題：0081、0082、outing 會依序套用。
     - **失效的樣子**：在 dev 以外的環境也遇到同樣的跳過時，migration「成功」，備份當晚在 `privileges` 階段失敗，`last-run.err` 有 `relation "backup_auth.users" does not exist`。
   - **MFA 檢查**（用 admin service 查，dev 演練與 prod 都要）：`select count(*) from auth.mfa_factors`。是 `0` 就照現狀繼續；**大於 0 就停下來問 owner**，決定要不要把 `auth.mfa_factors` 加進備份（要加就是另一次 review 過的改動：migration 的 grant、`backup-prod.sh` 的 `--table`、演練的比對一起改），不要自己先加。
   - **失效的樣子**：有人開了 MFA，備份照樣每晚成功、演練照樣 PASS；直到真的還原那天，這些人的第二因素全部消失，登入流程要他們重新設定或直接卡住。
2. **產生 age 金鑰**：建一個新的加密 dmg「Futari Backup Key」，密碼和 Futari Secrets **不同**，掛載後：

   ```
   age-keygen | age -p > "/Volumes/Futari Backup Key/key.age"
   ```

   `age-keygen` 把公鑰（`age1…`）印在畫面上，記下來（公鑰不是秘密）；私鑰直接經 pipe 進 `age -p` 用 passphrase 加密，不落地。
   - **紙本（必要）**：在沒有錄影、沒有 agent 的終端機視窗執行 `age -d "/Volumes/Futari Backup Key/key.age" | grep AGE-SECRET-KEY`，手抄那一行，抄完 ⌘K 清掉 scrollback、關掉視窗。紙本放在**不同地點**（不是跟 Mac 放一起）。
   - **失效的樣子**：dmg 密碼忘了、紙本又抄錯一個字，每一份備份都還在、每晚都還「成功」，只是永遠解不開——直到真的要還原那天。所以 **prod 的第一次演練一定用紙本**（`--identity-paper`）。
3. **設定密碼**：照〈Runtime DB role〉的禁止事項（不進 SQL 文字、不進指令列、不進 dashboard SQL editor）。產生一組隨機值放進剪貼簿（例如 `openssl rand -hex 32 | pbcopy`），然後：
   - `psql service=futari_<env>_admin` 裡執行 **`\password futari_backup`**（一定要帶角色名稱，原因同 futari_app 步驟 4），貼上；
   - 存進鑰匙圈，`-w` 一定放**最後**、不帶值，讓它用提示字元問：

     ```
     security add-generic-password -s futari-backup -a futari_backup -U -w
     ```

   - `pbcopy < /dev/null` 清剪貼簿；admin service 裡 `ALTER ROLE futari_backup LOGIN;`；Logs Explorer 確認只看到 `{REDACTED}`（同 futari_app 步驟 6）。
   - **失效的樣子**：`-w` 後面直接接密碼，密碼就進了 shell history 與 `ps`，指令一樣成功。
4. **設定檔**：`~/.config/futari-backup/`（700），兩個檔都是 600：
   - `pg_service.conf`：一個 `[futari_prod_backup]` 區段（dev 用 `[futari_dev_backup]`），只放 `host`／`port`（session pooler）／`dbname`／`user`（`futari_backup.<project-ref>` 格式）／`sslmode=verify-full`／`sslrootcert=<Supabase dashboard 下載的 CA 檔路徑>`。**不放密碼**——出現 `password` 欄位腳本就拒絕執行。
   - `config`：`KEY=value` 一行一個。必填 `RCLONE_DEST=<remote>:<資料夾>`；可選 `PG_BIN_DIR`、`PG_MAJOR`、`AGE_BIN`、`RCLONE_BIN`、`PG_SERVICE`、`KEYCHAIN_SERVICE`、`KEYCHAIN_ACCOUNT`、`BUNDLE_PREFIX`（dev 演練用 `futari-dev`，`RCLONE_DEST` 可以是本機資料夾）。不認得的 key、或 `AGE_RECIPIENT`，腳本都拒絕執行。
   - **失效的樣子**：權限太寬（不是 700／600）時腳本在 `preflight` 停下；`--dry-run` 會列出原因。
5. **rclone**：`rclone config` 新增一個 Google Drive remote，scope 選 **`drive.file`**（只看得到它自己建的檔案）。token 存在 `~/.config/rclone/rclone.conf`，確認是 600。
   - **失效的樣子**：選成完整的 `drive` scope 一樣能用，只是這個 token 外洩時，整個 Google Drive 都跟著暴露。
6. **安裝**：從 review 過的 tag 安裝（dev 演練可加 `--allow-untagged`）：

   ```
   git checkout <tag>
   scripts/ops/install-backup.sh --recipient <age1… 公鑰>
   ```

   然後先跑 `/bin/bash ~/.local/libexec/futari-backup/futari-backup-run.sh --dry-run`（不連任何東西、不讀鑰匙圈，只列計畫與本機檢查），再不帶參數手動跑一次。第一次手動跑時鑰匙圈會問 `security` 能不能讀這個項目，選「永遠允許」。
   - **失效的樣子**：沒有手動跑過就直接交給 launchd，03:30 那個詢問視窗沒人回答，每晚都在 `credential` 階段失敗。
7. **驗證通知（prod）**：暫時把 `RCLONE_DEST` 改成不存在的 remote，`launchctl kickstart gui/$(id -u)/local.futari.backup`，確認 launchd 底下真的跳出通知、桌面出現 `FUTARI-BACKUP-FAILED.txt`，再改回來、刪掉標記。
8. **載入排程**：`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.futari.backup.plist`。驗收：隔天 Drive 上的 `LAST_OK` 是當天凌晨的時間。
9. **演練一次**（見下方〈還原演練〉）。prod 的第一次用紙本。

### 每次 migration 之後：覆蓋檢查

0081 的 default privileges 只涵蓋 `postgres` 建的物件。每次 migration 之後（dev 與 prod）用 admin service 跑：

```sql
-- 必須 0 列：任何一列 = 備份讀不到的表
select n.nspname, c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'drizzle') and c.relkind in ('r', 'p')
  and not has_table_privilege('futari_backup', c.oid, 'SELECT');
```

- **失效的樣子**：migration 本身一切正常；當晚的備份在 `dump-public` 階段失敗，錯誤種類是 `permission`。有列就補 `GRANT SELECT ON "<table>" TO futari_backup`（寫成新的 migration）。

### 平常的樣子、失效的樣子

成功時 `~/Library/Logs/futari-backup.log`（600，只有階段、計數、大小、exit code）最後一行是 `done futari-prod-…`，Drive 的 `LAST_OK` 更新。工具的原始錯誤訊息在 `~/Library/Application Support/futari-backup/last-run.err`（600，每次覆寫）——裡面有主機與使用者名稱，**這兩個檔都不要貼到任何公開的地方，也不要貼進 agent session**。

失敗時：macOS 通知＋桌面上的 `FUTARI-BACKUP-FAILED.txt`。這個標記檔**不會自己消失**——之後跑成功也不會刪，修好、確認一次成功之後手動刪。log 的 `FAILED stage=…` 告訴你停在哪裡：

| stage | 常見原因 | 怎麼辦 |
|---|---|---|
| `checksum` | 安裝的副本被改過或沒裝完 | 從 review 過的 tag 重跑安裝 |
| `preflight` | 設定檔、權限、工具路徑；或今天已經認證失敗過 | `--dry-run` 看原因 |
| `credential` | 鑰匙圈鎖著、項目不見、存取被拒 | 確認鑰匙圈在登入期間不會自動上鎖；手動跑一次重新允許 |
| `snapshot`（auth） | 密碼不對 | **當天不重試**（pooler 連續認證失敗會封鎖 IP，見〈Circuit breaker〉）。修好後 `--clear-auth-block` 手動跑 |
| `snapshot`（tls） | CA 檔錯或過期、或 pooler 換了憑證 | 重新下載 CA；**不要**改成 `sslmode=require` |
| `tools` | pg_dump 大版本和設定不符 | 見設定步驟 0 |
| `privileges`（`relation "backup_auth.users" does not exist`） | 資料庫沒有 `backup_auth`：還原之後沒重套 0082，或 `db:migrate` 跳過了它（見設定步驟 1） | admin service 執行 `drizzle/0082_backup_auth_views.sql` 的內容 |
| `privileges`（`write-privilege`） | 有人給了 `futari_backup` 對 `backup_auth` 的寫入權限或 CREATE | **當成事故**：查是誰、什麼時候給的，收回後再跑 |
| `dump-public` | 新表沒有 grant；或等鎖超過 60 秒 | 覆蓋檢查；鎖的話隔天通常就好 |
| `copy-auth-users`／`copy-auth-identities`（`permission`） | view 被設成 `security_invoker`；或 `backup_auth` 的 grant 被收回 | 見上方〈擋得住／擋不住〉的 view 規則；重套 0082 |
| `sanity` | 某張表（上次 ≥ 10 筆）不見了、歸零、或少了一半以上；或 `auth.users`／`Profiles` 是 0 | **先確認是不是 prod 真的掉資料**。是的話不要 `--accept-counts`——之前的備份才是好的那份，30 天內都不會被清掉。確定是預期內的（migration 刪表、清資料）才 `--accept-counts` 手動跑一次 |
| `upload`／`verify` | Drive token 過期或被撤銷、空間滿 | `rclone config reconnect <remote>:` |
| `prune` | 清舊備份失敗 | 今天的備份已經上傳並驗證過；只是清理沒做完 |

**已接受的盲點（使用者 2026-10-04 決定，不加外部 heartbeat）**：如果排程**根本沒跑**（plist 沒載入、macOS 更新後被停用、Mac 關機），**不會有任何通知**——失敗通知只在腳本有跑起來時才會出現。最長可能約 30 天沒人發現，直到下一次每月演練看到 `LAST_OK` 的日期。所以演練的第一步就是看 `LAST_OK`。

### 還原演練（每月；使用者在自己的終端機跑）

輸出只有計數、錯誤數與物件名稱，但**不要貼進 agent session、issue 或 PR**。

1. 看 Drive 上 `LAST_OK` 的日期：不是昨天或今天，就是上面那個盲點發生了——先查排程。
2. 掛載「Futari Backup Key」（或準備紙本）。把最新的備份下載到本機：`rclone copy <remote>:<資料夾>/<bundle> <本機目錄>`。
3. 起一個用完即丟的本機 Supabase（PG 17）：在空的暫存目錄 `supabase init` → `supabase start`。colima 的 VM 磁碟要排除在 Time Machine 之外（`tmutil addexclusion` 加到 colima 的目錄），否則還原出來的資料會跟著進時光機。
4. 跑：

   ```
   scripts/ops/backup-restore-drill.sh --bundle <本機目錄> --identity "/Volumes/Futari Backup Key/key.age"
   scripts/ops/backup-restore-drill.sh --bundle <本機目錄> --identity-paper     # 用紙本
   ```

   腳本只接受 `127.0.0.1` 而且 public 沒有任何表的目標；順序跟真正還原一樣（見下），除了 cron：**只比對、不建 job、不載入任何 Vault 機密**。
   腳本只接受 `bundle_format 2`，四個檔要齊。auth 的兩個檔只當**資料**載入（見下方真正還原步驟 3），每張表印出筆數與「沒還原的 key」——正常是 generated 欄位（`users` 的 `confirmed_at`、`identities` 的 `email`）；出現別的名稱代表本機 stack 的 Auth 版本比備份舊，那些欄位的資料不會進來。
5. **通過條件**（腳本最後印 `DRILL PASS`）：`role does not exist` 錯誤 0、計數／加密 kid／表與欄位與 function 的 ACL／publication／auth trigger 跟 manifest 0 差異、本機 active 的 cron job 0、anon／authenticated 讀得到的 `*_encrypted` 欄位 0。
   - 其他 pg_restore 錯誤（例如 `schema "public" already exists`）會列出物件名稱，不影響判定；第一次 dev 演練時記下基準數字，之後數字變了就去看 `drill-*.err`。
   - 可選：用 k2 的 keyring 對本機這份資料跑 `scripts/reencrypt-pii.ts` dry-run，預期 preflight 0 失敗。這個腳本能不能指向本機 stack，第一次 dev 演練時確認。
6. 收尾：`supabase stop --no-backup`、刪掉本機的 bundle 目錄、退出 dmg、收好紙本。
   - **失效的樣子**：忘了 `--no-backup`，還原出來的 prod 資料留在 docker volume 裡，沒有任何提示。

### 真正還原（prod 壞了）

順序跟演練相同；不同的只有 cron／Vault 與最後幾步。全部用 admin service（〈Runtime DB role〉的連線方式）對**目標** project 執行。每一步都寫了漏掉時的樣子——它們都不會在還原當下報錯。

1. **先建全域角色**：`futari_app`、`futari_backup`，NOLOGIN，執行 `0072` 與 `0081` 開頭的 DO 區塊。
   - 漏掉：pg_restore 對每個給這兩個角色的 GRANT 報 `role … does not exist`，然後繼續——表都在，grant 都沒了；app 切回 `futari_app` 後每個查詢 42501。
2. **default privileges 先關**：

   ```sql
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
   ```

   - 漏掉：還原出來的每張表都帶著 Supabase 預設給 anon／authenticated 的 ALL，Data API 重新打開（#1518），沒有任何錯誤。
3. **還原順序**：
   1. `age -d -i <identity> public.dump.age | pg_restore -d <目標> --section=pre-data`。
   2. **重套 0082**：`psql -X -v ON_ERROR_STOP=1 -f drizzle/0082_backup_auth_views.sql`（用 review 過的 repo 裡那份）。還原出來的 `drizzle.__drizzle_migrations` 已經列著 0082，`db:migrate` 不會再跑它。
      - 漏掉：還原本身一切正常；之後第一個晚上的備份在 `privileges` 階段失敗，`relation "backup_auth.users" does not exist`。
   3. `age -d … public.dump.age | pg_restore -d <目標> --section=data`。
   4. **auth 資料（只當資料）**，`users` 先、`identities` 後。**絕對不要**把解密出來的內容直接 pipe 進 `psql`（那會把每一行當指令執行，一行 `\!` 就是在你的 Mac 上跑 shell）。照 `scripts/ops/backup-restore-drill.sh` 的 `restore_auth` 做：
      - `CREATE SCHEMA futari_restore_staging; CREATE TABLE futari_restore_staging.users (r jsonb NOT NULL);`
      - `age -d … auth-users.copy.age | psql -X -v ON_ERROR_STOP=1 -c "SET client_encoding = 'UTF8'" -c "\copy futari_restore_staging.users (r) FROM STDIN"`——指令只來自 `-c`，stdin 只是 `\copy` 的資料。
      - 用演練腳本裡那個 DO 區塊 `INSERT INTO auth.users (<欄位>) SELECT <欄位> FROM futari_restore_staging.users s CROSS JOIN LATERAL jsonb_populate_record(NULL::auth.users, s.r) x`：欄位＝目標表非 generated、而且在資料裡出現的 key，名稱符合 `^[a-z_][a-z0-9_]*$`、用 `format('%I')` 加引號；插入筆數要等於 staging 筆數。
      - `identities` 同上；最後 `DROP SCHEMA futari_restore_staging CASCADE;`。
      - 漏掉 staging 的清理：auth 的完整內容留在一個沒人會看的 schema 裡，沒有任何錯誤。
   5. `age -d … public.dump.age | pg_restore -d <目標> --section=post-data`。auth 的資料要在 post-data（外鍵）之前、在步驟 4 的 trigger 之前。
4. **重套 `db/triggers/handle_new_user.sql`**（它不在 migrations 裡，不在 dump 裡）。
   - 漏掉：既有使用者一切正常，**新註冊的人沒有 Profiles 列**，登入後畫面壞掉。
5. **realtime publication**：依 manifest 的 `## publication` 把表加回 `supabase_realtime`。
   - 漏掉：畫面不再即時更新，重新整理才看得到，沒有錯誤。
6. **Vault 與 cron**：
   - 先建 Vault 機密，值從 Futari Secrets dmg 讀，不打字、不進指令列。psql 裡：

     ```
     \set srk `cat "<dmg 上存 service_role key 的檔案>"`
     SELECT vault.create_secret(:'srk', 'oikos_service_role_key', 'Auth bearer for notify-recurring-push cron');
     \unset srk
     ```
   - 再依 manifest 的 `## cron` 逐一 `SELECT cron.schedule('<jobname>', '<schedule>', convert_from(decode('<base64 command>', 'base64'), 'UTF8'));`。還原到**新的** project 時，command 裡的 Edge Function 網址是舊 project 的，要改。
   - 漏掉：定期收支推播不再送出，**帳號刪除也不再自動執行**——隱私權政策承諾的 14 天就此失效，而且沒有任何錯誤。
7. **重新套用備份日之後處理過的刪除**：
   - 開放 app 之前，先手動跑一次 `SELECT public.process_account_deletions();`。在備份時已提出、之後才到期的刪除請求，就是在這一步重新執行的。
   - 備份之後才提出的刪除請求不在備份裡。從客服信件，以及舊 prod 還讀得到時拿它的 `auth.users`／`Profiles.deletion_requested_at` 比對，逐一補上。
   - 漏掉：已經刪除的帳號和資料，在還原後又回來了。
8. **比對**：`psql -f scripts/ops/futari-backup-manifest.sql` 的輸出逐段對 manifest（演練腳本只接受本機目標，這裡手動比）。再跑一次上方的覆蓋檢查，以及〈Runtime DB role〉的覆蓋檢查。
9. **角色登入**：`futari_app`、`futari_backup` 照各自的步驟重設密碼、`LOGIN`，更新 env。
10. **加密金鑰**：manifest 的 `## encrypted_kids` 列出這份備份需要哪些 kid；目標環境的 `ENCRYPTION_KEYS` 必須都有。
11. 備份之後到壞掉之間的資料（最多約一天）沒有了；要不要通知使用者，是使用者的決定。

### 事故處理

**懷疑 age identity 外洩**（dmg 與其密碼、或紙本被人看到）：

1. 照設定步驟 2 產生新的 identity（新的 dmg、新的紙本），用新的公鑰重跑安裝。
2. 手動跑一次備份並驗證，用新的 identity 演練一次。
3. 新的備份確定存在之後，才刪掉 Drive 上**所有**舊的備份資料夾，並清空 Drive 垃圾桶裡的它們（`rclone cleanup <remote>:`）。順序反過來的話，中間有一段時間完全沒有可用的備份。
4. 已經被複製走的舊備份救不回來：拿到舊 identity 又拿到某份舊備份的人，讀得到那一天的資料。要不要通知使用者，是使用者的決定（同〈緊急輪替〉）。

**懷疑 `futari_backup` 的密碼外洩**：

1. `ALTER ROLE futari_backup NOLOGIN;`（備份暫停，不影響 app）。
2. 踢掉既有連線（換密碼不會中斷已登入的 session）：

   ```sql
   WITH targets AS MATERIALIZED (
     SELECT pid FROM pg_stat_activity WHERE usename = 'futari_backup' AND pid <> pg_backend_pid()
   )
   SELECT pid, pg_terminate_backend(pid) FROM targets;
   ```

3. 換密碼：`\password futari_backup`，`security add-generic-password -s futari-backup -a futari_backup -U -w` 更新鑰匙圈（照設定步驟 3）。
4. `ALTER ROLE futari_backup RESET ALL;` 再重跑 0081 的 `ALTER ROLE futari_backup SET default_transaction_read_only = on;`（角色可以改自己的設定）。
5. 唯讀確認沒有留下東西：`futari_backup` 擁有的物件 0、`pg_auth_members` 裡不屬於任何角色、`has_table_privilege` 的 INSERT／UPDATE／DELETE 在 public 與 `backup_auth` 全是 false、`backup_auth` 沒有 CREATE。全程唯讀，查完再處置（同〈緊急輪替〉）。
6. `ALTER ROLE futari_backup LOGIN;`，手動跑一次備份。
7. 這個角色本來就讀得到全部 app 資料與 `auth.users`（見「擋不住」），應視為資料已暴露；是否通知使用者是使用者的決定。

**懷疑 Drive 帳號或 rclone token 外洩**：在 Google 帳戶的第三方存取裡撤銷 rclone，`rclone config reconnect`。備份本身是密文；要擔心的是對方是否也拿到了 identity。

### Rollback

1. `launchctl bootout gui/$(id -u)/local.futari.backup`，刪掉 plist 與 `~/.local/libexec/futari-backup/`。
2. admin service 跑 `scripts/ops/drop-futari-backup-role.sql`（先收回 default privileges，再 DROP ROLE），再跑 `scripts/rollback/0082_backup_auth_views.down.sql`（`DROP SCHEMA backup_auth CASCADE`，只有 view、不丟資料）。順序反過來（先拆角色、排程還在）的樣子：下一次 03:30 失敗通知，其他都不受影響。
3. 刪掉 Drive 上的備份資料夾並清空垃圾桶；在 Google 帳戶撤銷 rclone；`security delete-generic-password -s futari-backup -a futari_backup`。
4. 隱私權政策的備份段落一起改回去——政策寫著「保留約 60 天」，實際做法要跟它一致。

---

## pg_cron → Edge Function 授權：走 Vault

pg_cron job 要帶 `service_role` bearer token 呼叫 Edge Function 時，**token 存 Supabase Vault，不可用 `ALTER DATABASE postgres SET app.*`**。

**Why**：Supabase 2024 年收掉了一般使用者對自訂 GUC 的 `ALTER DATABASE SET` 權限（`42501 permission denied`）。舊文件／舊 PR 模板還在教這個 pattern，而且它**靜默失敗**：schedule 建立成功，但每日觸發送出的是空的 `Authorization: Bearer `，Edge Function 全數拒絕。

**How**：

1. 操作者每個 project 跑一次 `SELECT vault.create_secret('<service_role_key>', '<secret_name>', '<purpose>')`
2. cron body 內用 `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '<secret_name>'` 讀回組進 header——完整範例見 [drizzle/0056_recurring_push_cron_vault.sql](../../drizzle/0056_recurring_push_cron_vault.sql)（它取代了用 ALTER 寫壞的 0055）
3. 需要 extensions：`pg_cron`、`pg_net`、`supabase_vault`（`SELECT * FROM pg_extension WHERE extname IN ('pg_net','pg_cron','supabase_vault')` 驗證；缺了到 Dashboard → Database → Extensions 開）

---

## Supabase Auth：JWT 簽章金鑰與 refresh token（#1540）

**JWT 簽章金鑰：先輪替、等它簽過的 access token 全部過期（~1 小時）之後才 revoke**；並在兩個 project 的 Auth 設定確認 refresh token reuse interval（唯讀查看）。失效的樣子：提早 revoke 會讓 `getUser()` 回 `bad_jwt`，`proxy.ts` 把它當「確定被拒」清掉登入 cookie——所有在那一小時內簽發 token 的使用者同時被登出，沒有任何錯誤。

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

**Why 看起來可刪但不能刪**：從 Oikos 單體看，142 KiB 的 GA 只為一個事件、且已有 PostHog / Vercel Analytics，像是效能 easy win——但它承載跨產品商業需求。

**也不要 lazy load gtag（例如比照 #1520 用 `whenIdle` 延後）**。除了 `app/layout.tsx` 那道「只在 production deployment 載入」的 gate（#1116），不要再加任何條件。理由有兩個：

- **Ko-fi 點擊會無聲消失**：`KofiWidget` 呼叫的是 `window.gtag?.(…)`，`window.gtag` 還沒定義前這次呼叫什麼都不做。延後載入，太早發生的 `kofi_widget_click` 就直接不見，不會有任何錯誤。
- **GA 是品牌頁唯一完整的流量基準**：#1520 之後，品牌頁的 PostHog 會晚 1–2 秒才啟動，太快離開的訪客不會進 PostHog。observability-design.md 因此指定「跨部署日比流量看 GA」。gtag 一延後，這個基準就跟著偏掉。

**撤回紀錄（2026-10-06）**：這裡原本寫「歸因需要 pageview + referrer 上下文」，這個理由不成立。Ko-fi 收益歸因（#1308）只用 `kofi_widget_click` 的 `source` 加點擊時間，去對 Ko-fi 的交易時間，不用 pageview 也不用 referrer。規則本身沒變，換掉的只是理由。以後如果有人再以「歸因需要 pageview」為由反對改動 GA，先回來看這段。

**How**：landing JS 的效能工作對準 first-party chunks 與 PostHog module，把這 142 KiB 當必要商業成本。見 oikos#922 與 `components/KofiWidget.tsx` 檔頭註解（runtime iOS gate + `SOURCE` 歸因常數）。

**已接受的風險（#1300）**：這個 property 收得到 Futari 的原始網址，包括邀請 token（`dl`／`dr`）和 `/records` 的篩選值。原因是共用串流上開著「依瀏覽器歷史記錄計算網頁變化」，而它不能為了 Futari 單獨關掉。GA 後台的網址不會跟著 token 失效；要清除只能在 GA 後台處理。完整脈絡和什麼會改變這個決定，見 [observability-design.md](specs/observability-design.md)「GA 會收到原始網址」那條。**不要在這條串流上關歷史記錄設定**：Wildcard／blog 的站內換頁 page view 會一起消失。
