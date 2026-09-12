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

- **一句話（#issue）**：使用者實際感知到的事，不寫技術細節。

### 技術變更

- 技術決定、重構、schema migration、breaking change（沒有就省略整個小節）。
```

同時：

- `[Unreleased]` 留空殼，內容改成 `_Nothing unreleased yet._`
- 檔案最底下的連結定義區：`[Unreleased]` 改指 `vX.Y.Z...HEAD`，並新增一行 `[X.Y.Z]: .../compare/vPREV...vX.Y.Z`
- 文案遵守 CLAUDE.md 的品牌文案準則（zh-TW、不用感嘆號、不用「管理」「追蹤」「監控」）

**`[Unreleased]` 是空的（`_Nothing unreleased yet._`）**：警告使用者這版沒有累積任何 changelog 條目，
問他要「用 `git log vPREV..HEAD` 現場整理」還是「先補 `[Unreleased]` 再回來」。不要自作主張塞內容。

### 5. CLAUDE.md

「目前狀態」段更新為：

```markdown
**Latest released: vX.Y.Z** — 完整版本歷史見 [CHANGELOG.md](CHANGELOG.md)
```

（只動這一行。下面的 milestone 表是 backlog，不是版本歷史。）

### 6. README.md

「版本歷史」表最上面加一列，格式比照既有列（anchor 是 CHANGELOG 標題的 slug，注意點號會被吃掉）：

```markdown
| [vX.Y.Z](CHANGELOG.md#xyz---YYYY-MM-DD) | 範圍 · 用 · 中點分隔 |
```

> 這張表歷史上漏更新過（v1.5.2–v1.5.5 都沒進表）。只補本版那一列即可；
> 要不要回補舊版由使用者決定，別擅自大改。

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
7. 原生影響：<第 7 步的結論>
```

## Gotchas

- **`npm version` 會在 dirty working tree 上拒跑**（`Git working directory not clean`）。先確認工作區只剩要發版的改動，或用 `--force` 前先想清楚。
- **CHANGELOG anchor 格式**：`#151---2026-06-10` ← `1.5.1` 的點被拿掉、` - ` 變成 `---`。手寫容易錯，貼上後在 GitHub 上點一次確認。
- **`[Unreleased]` 的 compare link 一定要一起改**，否則永遠指著舊 tag，diff 會越積越多。
- **release PR 不要夾帶功能改動**。這條 branch 只放上面五個檔案的版本性變更；有東西沒進 `[Unreleased]` 就先回 feature branch 補。
