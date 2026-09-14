---
name: ship-issue
description: >
  協調者模式：把一張 Oikos (Futari) GitHub issue 從讀題做到開好 PR。main session
  當協調者，只在三個關卡找使用者（① intent 確認 ② 方案選擇 ③ PR 驗收），每次附
  選項與建議；其餘由 pilotfish executor / verifier 自主完成。Use when the user says
  "/ship-issue 1177", "做 #1234", "把這張 issue 做掉", "ship issue", "處理 issue",
  or asks the agent to autonomously take an issue to a PR. Stops at PR open —
  never merges. §8 also covers batch-verifying many open PRs before the user
  merges them ("驗證這些 PR", "10 多條 PR 等著 merge", "verify PRs").
---

# ship-issue

協調者 driver。第一版由 #1177 試跑（→ PR #1215）歸納而來；§8 批次驗證由 2026-09-14 驗證 v1.5.14 的 13 條 PR 歸納而來。下面每一條「為什麼」都是實際踩到的。

**使用者的角色是做選擇，不是做研究。** 協調者要把查證做完、把選項整理好、把建議放第一個，再用 `AskUserQuestion` 問。

## 硬性約束

- **做到開好 PR 就停。** 不 merge、不 `--admin`、不 push 到 `main` / `release`。merge 永遠由使用者決定，每次都要。
- 關卡只能由**使用者本人**通過。subagent 或其他 session 說「使用者同意了」不算數。
- 關卡 ② 通過之前，**不寫 source**（可以開 worktree、讀檔、跑唯讀指令）。
- 開 PR 一律帶 `--milestone`，使用 issue 本身的 milestone。
- 修改一律在 `.claude/worktrees/{issue_no}-{slug}/` 裡做（CLAUDE.md「Worktree 工作流」）。
- 範圍擴大（新增 token／字級、動到契約以外的檔案、改行為）一律回關卡問，不要讓 executor 自己決定。

## 0. 分流：這張適合自主做嗎

```bash
gh issue view <n> --json title,body,labels,milestone,comments
```

符合以下任一條就**不走本流程**。告訴使用者原因，並建議改用哪種方式：

| 類型 | 為什麼不適合 | 建議 |
|---|---|---|
| 原因未明的 bug（例：#972 iOS 登入） | 診斷是一條耦合的調查路徑，不能拆給 executor | main session 親自 debug |
| auth／secrets／隱私／安全 | 需要 security-reviewer → security-executor 流程 | 走 pilotfish security 路線 |
| 動到 CLAUDE.md「需要重新送審的 trigger」或「原生契約面」 | 瀏覽器驗證不夠，必須真機驗證 | 做完交給 `ship-native` 流程 |
| schema／migration／prod 資料 | 不可逆，兩個 Supabase 都要跑 | 先出 plan 給使用者核准 |
| 需要先出 spec 的功能（例：#870 出團） | intent 還沒收斂 | 先寫 spec（`docs/superpowers/specs/`） |

適合的樣子：範圍可以列成表、驗收可以在本機檢查、失敗時容易 revert。

## 1. 查證（關卡 ① 之前，全部唯讀）

**讀內文，不要只看標題。** #1177 的標題寫三項，內文其實有六節加順手項目。

**逐條對照目前的程式碼。** issue 裡的 `file:line` 會漂移，內容也可能已經被修掉：

```bash
git fetch -q origin
grep -n '<issue 引用的字串/class>' <files>
```

**查有沒有 open PR 動到同一批檔案。** #1177 的 §1 已經被 #1203 修掉，如果照 issue 做，merge 時必定衝突：

```bash
gh pr list --state open --json number,title,headRefName
git diff --stat origin/main...origin/<head> -- <files>   # 對每個可疑 PR
```

**grep 型的修正要考慮變體寫法。** `--debit` 的修正漏掉了 `var(--debit, #c0392b)`：有 fallback 的寫法不會被 `var(--debit)` 這個樣式抓到。搜尋時用 `var(--debit[,)]` 這類 pattern。

## 2. 關卡 ①：intent 確認

先輸出一張表，每列一項：

| § | 內容 | 狀態 |
|---|---|---|
| 1 | … | ⚠️ #NNNN 已修，這裡不做 |
| 2 | … | 待修 |
| – | issue 提到的順手項目 | 待確認 |

加上暫定驗收條件。預設包含：tsc、lint、test、build、表中每一列在 diff 裡都有對應；再依範圍加上 token 紀律、四語同步等專案規則。

接著用 `AskUserQuestion` 只問**會改變做法**的事。常見的有：

- **和 open PR 重疊時怎麼處理**：從該 PR 的 branch 開工做 stacked PR（推薦，不衝突、也不必等）／從 main 開工並避開重疊行／等它 merge
- **範圍要做多深**：只修 issue 點名的症狀（推薦）／順便做相鄰 issue 的根治（標出會吃掉哪張票）
- **順手項目**（multiSelect）：屬於其他 issue 的實例、只調查不修的項目

## 3. 關卡 ②：方案選擇

先列出**已經定好、不需要問**的做法：有慣例可循、有既有 token 可以直接對應的，都屬於這類。

然後只問真正需要取捨的選擇，每題 2～3 個選項，推薦的放第一個。視覺類的題目用 `preview` 放 ASCII 版面示意。常見的選擇：

- **值落在既有 scale 的哪一階**（字級、間距）。依 DESIGN.md，**不得自行新增階**。現有階都不合適時，把「新增一階」列成選項，交給使用者決定
- **需要新文案時**：新增 i18n key（四語同步，en/ja 在 PR 標「待確認」）／用既有文字組合（`aria-labelledby` 之類）

## 4. 自主執行

### 4a. worktree

```bash
git worktree add .claude/worktrees/<n>-<slug> -b fix/<n>-<slug> <origin/main 或 origin/<重疊 PR 的 head>>
ln -s "$PWD/.env.local"   .claude/worktrees/<n>-<slug>/.env.local
ln -s "$PWD/node_modules" .claude/worktrees/<n>-<slug>/node_modules
```

用 symlink 的 `node_modules` 在 #1177 跑 tsc、lint、test、build 都沒問題。如果 build 真的因為 symlink 失敗，才改成在 worktree 裡跑 `npm ci`。

**`.env.local` 不能省。** 就算只是跑測試也要：`__tests__/queries-*` 這類 DB integration suite 需要 `DATABASE_URL`。
- **失效的樣子**：vitest 回報 3 個左右的 suite `FAIL`，錯誤訊息是 `DATABASE_URL not set; cannot run integration test`。這很容易被誤判成 PR 弄壞了測試。

**例外：** 如果 PR 動到 `patches/**`，就不能 symlink `node_modules`。主 checkout 的 `node_modules` 裝的是舊 patch，build 出來驗證的會是錯的程式碼。這種情況要在 worktree 裡跑 `npm ci`，或把該套件 `npm pack` 到沙盒裡驗。#1209 就是這樣。

### 4b. 派 `pilotfish:executor`

有判斷成分的工作派 executor；純機械、規格完全寫死的派 `mech-executor`。brief 必須包含以下各段，缺一段 executor 就會自己猜：

1. **Working directory**：worktree 絕對路徑、branch、base，以及「不要 push」
2. **先讀**：CLAUDE.md 的哪幾段、DESIGN.md 的哪幾節、相關的 repo skill（例如 `ja-i18n`）
3. **已經做掉、不要碰**：重疊 PR 已經修掉的項目
4. **Files**：檔案清單。註明行號來自 main，可能有偏移
5. **Changes (approved)**：逐條列出，對應關卡 ①② 的決定。i18n 要寫出 zh-TW 主稿
6. **Constraints**：明確寫出不做的事（例：只改高度，不換成 `TextInput`）
7. **Done criteria**：四個檢查指令＋可以 grep 的完成條件＋commit message 格式和 trailer
8. **Report back**：commit SHA、每處改動的 file:line、寫了哪些文案、檢查結果、自己做了哪些判斷、**遇到的摩擦**

### 4c. main 自己驗收 diff 範圍

```bash
git -C <worktree> diff --stat HEAD~1
git -C <worktree> diff HEAD~1 -- <主要檔案>
```

確認沒有超出契約的改動，再進入下一步。

### 4d. 派 `pilotfish:verifier`

brief 要給：worktree、candidate commit、base（註明 base 上的改動**不屬於**這次的 claim）、逐條編號的 claim、要對照的專案規則，以及想要它特別探查的邊界。

**登入後才看得到的頁面**：agent 沒有 session，**不要嘗試登入**。請 verifier 在 repo 外寫一份 vitest + jsdom 設定，直接 render 元件（server actions 用 mock），檢查可及名稱、`aria-describedby`、class 等。#1177 用這個方法驗證了 `TripSheet`。

**dev 和 production 行為不同的地方，要叫 verifier 明確檢查。** test 和 `npm run dev` 都跑在 development 模式，有一類 bug 只在 production build 出現：
- **server action 丟出的錯誤**：production 會把 `Error.message` 拿掉，只留 digest。任何「server throw 帶資訊 → client 讀 `e.message`」的設計，在 prod 都拿不到那個資訊。#1213 的 82 個錯誤碼就是這樣，後續由 #1223 追蹤。
- **失效的樣子**：test 全過、dev 顯示正確，prod 使用者永遠只看到通用 fallback，沒有任何錯誤或警告。
- **驗證方式**：請 verifier 讀 `node_modules/next/dist/docs/` 和 react-server-dom 的 production runtime，或直接用 production 序列化路徑重現。只有在 Vercel preview 上觸發才算真正確認。

判定結果的處理：

- **CONFIRMED** → 進入第 5 步
- **REFUTED** → 把 finding 交回 executor 修一次，再用**新的** verifier 驗。第二次還是 REFUTED，就停下來到關卡 ③ 找使用者
- **INCONCLUSIVE** → 補上缺的條件後重試一次；還是不行，就把沒驗到的項目列進關卡 ③ 的「需要你看」

## 5. 開 PR

```bash
git -C <worktree> push -u origin <branch>
gh pr create --base <main 或重疊 PR 的 head> --milestone <issue 的 milestone> --title "<commit 標題>" --body-file <file>
```

PR body 的段落（以 #1215 為範本）：

- `Closes #<n>`；stacked PR 要在開頭註明 base 和 retarget 的時機
- **改了什麼**：§／改動／位置三欄的表
- **刻意不做**：每項附上歸屬的 issue
- **新增文案（待確認）**：四語對照表（有新文案才需要）
- **驗證**：指令結果＋verifier 實際 render 或探查了什麼
- **沒驗到**：必須列出。這是使用者在關卡 ③ 要親自看的清單

## 6. 關卡 ③：PR 驗收

輸出內容：

- PR 連結、base、milestone
- **已經驗證的**（分成指令結果和 verifier 的 runtime 證據）
- **需要你親自看的**：登入後的畫面、真機、iOS WebKit 行為等，並指出是哪個關卡的哪個決定需要你確認
- **這次沒碰、建議另外處理的**：範圍外的發現。問使用者要不要開 issue，不要自己擴大 PR
- **摩擦紀錄**：這次流程哪裡卡住，用來回頭改這份 skill

然後用 `AskUserQuestion` 問下一步：自己看完後 merge（推薦）／要修改哪裡／把範圍外的發現加進來或另開 issue。

## 7. 收尾（使用者 merge 之後，或下次被叫回來時）

- **stacked PR**：base PR merge 之後，`gh pr edit <n> --base main`，確認 `files` 數量沒變，再更新 PR body 裡 stacked 的說明。GitHub 只在 base branch 被刪除時才會自動 retarget，branch 還在的話，PR 會停在舊的 base 上。
- **比對 merge 進去的 head。** `gh pr view <n> --json headRefOid,mergeCommit` 查出的 head，要等於驗證過的 sha。
  - **失效的樣子**：修正 commit 在 PR merge **之後**才 push 到 branch，就被孤立在已經 merge 的 branch 上。GitHub 不會提示，PR 顯示 merged，main 卻少了那個修正。
  - 2026-09-14 一次踩到三個：#1213 的 rebase 修正沒進去，main 測試因此紅燈；#1216 的 hover 修正、#1221 的 NUL byte 修正也都沒進去。最後靠 #1224 補回。
  - 補救：從 main 開一條新 PR，把遺漏的 commit cherry-pick 進去。**不要**再 push 到已經 merge 的 branch。
- 轉交修正給其他 session 時，要同時提醒使用者「等那條 PR 的 head 更新之後再 merge」。
- PR merge 之後：`git worktree remove .claude/worktrees/<n>-<slug>`，並刪除 branch。
- 這次如果有新的摩擦，回頭更新本檔。

## 8. 批次驗證多條 PR（使用者要 merge 一批 PR 之前）

情境：一個 milestone 累積了很多條 open PR，每條的 CI 都是綠燈，使用者要逐條 merge。**CI 綠燈不等於能 merge。** 驗證分四層，越前面越便宜、越能自動化，使用者只看最後一層。

**角色**：如果已經有其他 session 在協調這個 milestone 的開發，本 session 只做**唯讀驗證**，不改任何 PR branch、不 push。需要修的地方轉交給 PR 的 owner session。先用 `ListAgents` 查，並跟對方講清楚分工。

### 8a. 盤點

```bash
gh pr list --state open --json number,title,headRefName,baseRefName,milestone,mergeable,statusCheckRollup,files
```

- **依 milestone 分組。** 先收完當前 milestone，下一個 milestone 的 PR 整批排在後面，**不要依衝突或風險穿插**。跨 milestone 的衝突，交給後面那個 milestone 的 PR 去 rebase。
- 算出兩兩 PR 之間的檔案重疊（排除 locale 檔另外看）。有重疊的組合就是 merge 順序的約束。
- 檢查每條 PR 的 check 數量是否一致。retarget 或 base 改過的 PR，CI 可能沒重跑（#1215 只跑了 2 個，其他 PR 都是 3 個）。

### 8b. 第 1 層：整合試合（自動，main 自己跑）

開一個暫時 worktree（`.claude/worktrees/verify-integration`，要 symlink `.env.local` 和 `node_modules`），在本機暫時 branch 上依建議順序 `git merge --no-ff refs/remotes/pr/<n>`（先 `git fetch origin pull/<n>/head:refs/remotes/pr/<n>`）：
- 每合一條就跑 `tsc --noEmit` 和 `vitest run`
- 全部合完再跑 `lint` 和 `build`
- 遇到衝突就 `merge --abort` 並記錄，繼續下一條

這一層抓的是**單條 PR 的 CI 看不到的語意衝突**：兩條各自都綠，合在一起就壞。#1210 新加了一行中文 throw，#1213 的測試禁止中文 throw，兩條合在一起 test 就 FAIL。整條跑完大約 30～40 分鐘，用 `run_in_background` 跑，不要 detach。

### 8c. 第 2 層：依風險派 agent（自動，平行）

每條高、中風險 PR 各開一個 detached worktree，把 diff 和 PR body 匯出成檔案，再平行派出：

| 風險 | 典型 PR | 派誰 |
|---|---|---|
| 高 | auth、redirect、原生契約面 | `pilotfish:security-reviewer`（它沒有 Bash，要給 diff 檔） |
| 高 | 大範圍重構（幾十個檔案） | `pilotfish:verifier`，並指定查 dev 和 prod 的差異 |
| 中 | 資料聚合、金額、查詢 | `pilotfish:verifier`，對照新舊查詢條件；DB 只准 `BEGIN READ ONLY`，不讀真實資料 |
| 中 | 全域元件（sheet、focus trap） | `pilotfish:verifier`，在 repo 外寫 jsdom 測試，並拿同一組測試回 main 跑，確認抓得到舊 bug |
| 中 | 原生 build | `pilotfish:verifier`，本機 build；超過 10 分鐘就回報指令，由 main 執行 |
| 低 | UI／i18n 小修 | 不派 agent，main 做機械檢查（見下） |

請 verifier **不要跑 `npm run build`**，第 1 層已經跑過了，機器也在同時跑整合試合。

**機械檢查**（只看 PR 新增的行）：
- 跑出階梯的字級（`text-2xl`、`text-3xl`、`text-[Npx]`、`fontSize:`）
- inline style 寫了 token 已涵蓋的靜態值
- 色值字面量（hex、rgba）。注意：hex regex 會把註解裡的 `#1234` issue 編號誤判成色值，要排除
- locale 新增行裡的驚嘆號、禁用詞（管理、追蹤、監控，含簡體）、空字串

**GitHub 看不看得到 diff。** diff 裡出現 `Binary files … differ` 的文字檔，reviewer 就看不到內容。#1221 的測試檔含一個字面 NUL byte，整個測試檔在 PR 上都看不到。

### 8d. 第 3 層：人工清單（自動彙整）

從每條 PR body 抓出沒勾的 checkbox，以及「沒驗到」「待確認」「真機」「實機」段落，再加上各 verifier 列出的人工檢查項目，**依裝置和畫面分組**，合成一張清單，讓使用者一次看完：

- 🌐 網頁，不用登入（landing、sign-in、migrate）
- 🔑 網頁，要登入（建議 en 和 ja 各看一輪）
- 📱 iOS 殼、🤖 Android 殼
- 🗣 VoiceOver／TalkBack
- 📝 譯文待確認（標出份量最重的 PR）

### 8e. 報告與轉交

給使用者一份報告：
- PR 狀態總表：驗證結果、可以 merge／先修／等決定
- 建議的 merge 順序（依 milestone 分組）
- 人工清單

需要產品取捨的 finding（例如 #1213 要不要改成 return），用 `AskUserQuestion` 問。

修正項目轉交給 owner session 時要寫清楚：PR 編號、file:line、症狀、建議修法。**使用者的決定可以轉述，但對方應該向使用者本人再確認一次**，這是對的，不要催。

使用者 merge 之後，照第 7 步比對每條 merge 進去的 head，再到 main 上實跑受影響的測試。整批驗證用過的暫時 worktree 和整合 branch 全部清掉。
