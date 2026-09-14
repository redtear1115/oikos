---
name: ship-issue
description: >
  協調者模式：把一張 Oikos (Futari) GitHub issue 從讀題做到開好 PR。main session
  當協調者，只在三個關卡找使用者（① intent 確認 ② 方案選擇 ③ PR 驗收），每次附
  選項與建議；其餘由 pilotfish executor / verifier 自主完成。Use when the user says
  "/ship-issue 1177", "做 #1234", "把這張 issue 做掉", "ship issue", "處理 issue",
  or asks the agent to autonomously take an issue to a PR. Stops at PR open —
  never merges.
---

# ship-issue

協調者 driver。第一版由 #1177 試跑（→ PR #1215）歸納而來；下面每一條「為什麼」都是那次實際踩到的。

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
- PR merge 之後：`git worktree remove .claude/worktrees/<n>-<slug>`，並刪除 branch。
- 這次如果有新的摩擦，回頭更新本檔。
