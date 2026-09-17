---
name: release
description: >
  Cut an Oikos (Futari) release: bump version, roll CHANGELOG `[Unreleased]`
  into a dated section, update CLAUDE.md / README.md, scan the diff for
  native-shell impact, commit and tag locally. Use when the user says
  "release vX.Y.Z", "發版", "出 v1.6.0", "準備 release", "bump 版本",
  "切一版", or asks to prepare a release branch / changelog for a new
  version. Never pushes; never touches `main` / `release` directly.
---

# release

發版 driver。取代先前 CLAUDE.md 引用的 `git-develop:release`（該 plugin 未安裝，
且假設的 CLAUDE.md 格式與本 repo 已漂移、收尾還會直推 `main`）。

**路徑皆相對 repo root。**

## 硬性約束

- **絕不 push**，不論 branch。push / 開 PR 一律留給收尾 checklist 由人執行。
- **絕不**產生或執行 `git push origin main` 之類直推 protected branch 的指令。`main` / `release` 只能走 PR merge。
- 只 stage 下面列出的檔案（`package.json` / `package-lock.json` / `CHANGELOG.md` / `CLAUDE.md` / `README.md`），不要順手 commit 工作區其他改動。
- **不自動 bump 原生版本號**（`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` / `versionName` / `versionCode`）。那是送審當下手動做的，見 [runbook §E](../../../docs/app-store-submission-runbook.md)。
- 任何一步資訊不足或判斷模糊（版本號、CHANGELOG 主題句、原生影響歸類），**停下來問使用者**，不要猜。

## 流程

### 1. 確認版本號

使用者要給 semver `X.Y.Z`。沒給就停下來問——**不要**從 commit 內容自行推導 major/minor/patch。

記下前一版 `vPREV`（`git describe --tags --abbrev=0`，或 CHANGELOG 最上面那個已釋出版本），第 7 步要用。

### 2. 確認 branch

必須在 `chore/release-vX.Y.Z` 上：

```bash
git branch --show-current
# 不在就從 main 開（依 CLAUDE.md「Worktree 工作流」，在 worktree 裡做）
git checkout -b chore/release-vX.Y.Z main
```

### 3. Bump version

```bash
npm version X.Y.Z --no-git-tag-version
```

`--no-git-tag-version` 讓 npm 只改檔、不自己 commit/tag（tag 第 8 步自己建）。

> **v1.5.4 的教訓**：`package-lock.json` 的 `version` 欄位自 v1.5.3 起沒跟上 `package.json`，
> prod `npm ci` 直接失敗。`npm version` 會同時更新兩檔——**不要**手改 `package.json` 的版本字串。
> 若因故只動了 `package.json`，補跑 `npm install --package-lock-only`，並確認兩檔 `version` 一致。

### 4. CHANGELOG.md

把 `## [Unreleased]` 底下的內容整段搬到新的 `## [X.Y.Z] - YYYY-MM-DD`（日期用今天），格式比照既有版本：

```markdown
## [X.Y.Z] - YYYY-MM-DD

主題：**一句話主題**——這版在講什麼。
完整 diff：[vPREV...vX.Y.Z](https://github.com/redtear1115/oikos/compare/vPREV...vX.Y.Z)

### 使用者可見變化

- **一句話＋issue 號（#issue）**
  使用者：使用者實際感知到的事，一句話。
  技術：動了什麼、為什麼，一句話（純文案 / 純 UI 微調可以省略這行）。

### 技術變更

- 沒有對應使用者條目的技術決定、重構、schema migration、breaking change（沒有就省略整個小節）。

### Security

- 隱私 / 安全性質的條目（文案更正、資料遮罩、權限修補……）獨立列在這裡，不要混進上面兩節（沒有就省略整個小節）。
```

**條目本身遵守 CHANGELOG.md 開頭「條目格式：三行短條目」那段規則**——標題一句話＋issue 號、
使用者／技術各一句話，「失效的樣子」「確切行號」這類論證留在 issue 本身，CHANGELOG 只連號碼。
`[Unreleased]` 底下如果已經有人寫成長段落（舊習慣），先依這個格式改寫再搬，不要原樣搬過去。

同時：

- `[Unreleased]` 留空殼，內容改成 `_Nothing unreleased yet._`
- 檔案最底下的連結定義區：`[Unreleased]` 改指 `vX.Y.Z...HEAD`，並新增一行 `[X.Y.Z]: .../compare/vPREV...vX.Y.Z`
- 文案遵守 CLAUDE.md 的品牌文案準則（zh-TW、不用感嘆號、不用「管理」「追蹤」「監控」）

**改完跑這段驗證，不要只靠肉眼**：

```bash
# 每個 ## [X.Y.Z] 標題都必須有對應的 [X.Y.Z]: 定義行，缺了標題就是壞掉的參照連結
diff <(grep -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md | tr -d '#[] ' | sort) \
     <(grep -oE '^\[[0-9]+\.[0-9]+\.[0-9]+\]:' CHANGELOG.md | tr -d '[]:' | sort) \
  && echo '✓ 連結定義完整' || echo '✗ 上列版本不對稱（< = 有標題沒定義，> = 有定義沒標題）'

# [Unreleased] 必須指向剛發的這一版
grep -E '^\[Unreleased\]: .*compare/vX\.Y\.Z\.\.\.HEAD$' CHANGELOG.md \
  && echo '✓ [Unreleased] 已更新' || echo '✗ [Unreleased] 沒指向 vX.Y.Z'
```

> **為什麼是「驗證」而不只是「提醒」**：下面 Gotchas 從一開始就寫著「`[Unreleased]` 的 compare
> link 一定要一起改」，而 **v1.5.11 仍然漏了**——`[Unreleased]` 留在 `v1.5.10`，`[1.5.11]` 那行
> 根本沒被加進去，`## [1.5.11]` 標題因此是壞的參照連結，直到 v1.5.12 發版才被發現。
> **指令存在、但沒有檢查，等於沒有。** 這段 diff 在當時就會抓到（實測對 `v1.5.11:CHANGELOG.md`
> 跑會印出 `< 1.5.11`）。

**`[Unreleased]` 是空的（`_Nothing unreleased yet._`）**：警告使用者這版沒有累積任何 changelog 條目，
問他要「用 `git log vPREV..HEAD` 現場整理」還是「先補 `[Unreleased]` 再回來」。不要自作主張塞內容。

### 5. CLAUDE.md

兩處要動：

**(a)「目前狀態」段：**

```markdown
**Latest released: vX.Y.Z** — 完整版本歷史見 [CHANGELOG.md](CHANGELOG.md)
```

**(b)「Backlog / 未釋出版本」表：把 `vX.Y.Z` 那一列刪掉。**

這張表的定義是**還開著的 milestone**。發版意味著該 milestone 即將關閉（見第 9 步 checklist），所以它不再屬於 backlog。漏了這步表就會每發一版漂一次——v1.5.6 發布後就在表上多留了一版才被發現。

表的其餘列不要動：那是別人的 backlog，不歸發版流程管。若發現表裡還有其他**已關閉**的 milestone，或缺了**開著**的，那是既有漂移——回報給使用者，不要順手塞進 release commit（release PR 只放版本性變更）。

### 6. README.md

「版本歷史（最近 3 版）」表**只留最近 3 個已釋出版本**（#1293 起的格式）：新版本加在最上面一列，
同時把表格最下面那一列（現在最舊的第 3 版）刪掉，維持固定 3 列。格式比照既有列（anchor 是
CHANGELOG 標題的 slug，注意點號會被吃掉）：

```markdown
| [vX.Y.Z](CHANGELOG.md#xyz---YYYY-MM-DD) | 範圍 · 用 · 中點分隔 |
```

舊版本不會因此不見——表格底下已經連到 CHANGELOG.md，完整歷史留在那裡；README 這張表只回答
「最近在幹嘛」，不是版本總表。

### 7. 原生影響檢查

薄殼架構下 web release 通常不影響 iOS / Android（見 CLAUDE.md「三平台架構」）。掃這版有沒有碰到送審 trigger：

```bash
git log vPREV..HEAD --name-only --pretty=format: | sort -u | grep -E '^(ios/|android/|capacitor\.config\.ts|patches/)'
git log vPREV..HEAD -p -- package.json | grep -E '^[+-].*"@capacitor(-community)?/'
```

- **有命中** → 收尾 checklist 明確標示：**本版含原生殼變更，需依 [runbook](../../../docs/app-store-submission-runbook.md) 重送商店（版本計數 +1 規則見 §E）**，並列出命中的路徑。
- **沒命中** → 標示：**純 web release，原生殼不需動作**（merge 到 `release` 後 Vercel 部署即觸達三平台）。

skill 本身到此為止，**不**改任何原生檔。

### 8. Commit + 本地 tag

```bash
git add package.json package-lock.json CHANGELOG.md CLAUDE.md README.md
git commit -m "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"   # 既有 tag 都是 annotated，維持一致
```

tag **不 push**（第 9 步 checklist 裡等 PR merge 後才推）。

### 9. 收尾 checklist（印給使用者，不要自己跑）

```
1. git push -u origin chore/release-vX.Y.Z
2. gh pr create --base main --head chore/release-vX.Y.Z \
     --title "chore(release): vX.Y.Z" --milestone "<當前 milestone>"
   ※ milestone 必填（CLAUDE.md 政策），不確定就選最近未關閉的
3. PR merge 後：git push origin vX.Y.Z
4. gh pr create --base release --head main --title "release: vX.Y.Z" --milestone "<同上>"
5. 該 PR merge 後 Vercel 自動部 prod
6. (optional) gh release create vX.Y.Z --notes-from-tag  或用 CHANGELOG 該段內容
7. 關閉 milestone：gh api -X PATCH repos/redtear1115/oikos/milestones/<number> -f state=closed
   ※ 第 5 步 (b) 已把它從 CLAUDE.md backlog 表移除，這步讓 GitHub 那邊也對齊
8. 原生影響：<第 7 步的結論>
```

## Gotchas

- **`npm version` 會在 dirty working tree 上拒跑**（`Git working directory not clean`）。先確認工作區只剩要發版的改動，或用 `--force` 前先想清楚。
- **CHANGELOG anchor 格式**：`#151---2026-06-10` ← `1.5.1` 的點被拿掉、` - ` 變成 `---`。手寫容易錯，貼上後在 GitHub 上點一次確認。
- **`[Unreleased]` 的 compare link 一定要一起改**，否則永遠指著舊 tag，diff 會越積越多。這條光靠提醒擋不住（v1.5.11 就漏了），所以第 4 步有一段 diff 驗證——**跑它**。
- **release PR 不要夾帶功能改動**。這條 branch 只放上面五個檔案的版本性變更；有東西沒進 `[Unreleased]` 就先回 feature branch 補。
