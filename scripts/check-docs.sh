#!/usr/bin/env bash
#
# 文件健檢。四項檢查對應四種「agent 會被誤導」的腐爛方式：
#
#   1. 破鏈           — 連到不存在的檔
#   2. 程式路徑腐爛   — CLAUDE.md 反引號裡的路徑被改名／刪除（破鏈檢查抓不到）
#   3. spec 索引漏洞  — spec 沒被 INDEX.md 索引（對 agent 等於不存在），或索引到空檔
#   4. 版本宣稱不實   — spec 的 first_shipped_in 指向沒發生過的 release
#
# 用法：bash scripts/check-docs.sh
# 從 repo 根目錄執行。全部通過時 exit 0。
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0

echo "=== 1. Markdown 破鏈 ==="
broken=$(
  find . -name '*.md' \
    -not -path './node_modules/*' -not -path './.next/*' \
    -not -path './.claude/worktrees/*' -not -path './.git/*' \
  | while read -r f; do
      dir=$(dirname "$f")
      grep -o ']([^)]*)' "$f" 2>/dev/null | sed 's/^](//; s/)$//' | while read -r t; do
        # [[ ]] not case: a case pattern's ")" terminates the enclosing $( ).
        [[ -z "$t" || "$t" == http://* || "$t" == https://* || "$t" == mailto:* || "$t" == '#'* ]] && continue
        p="${t%%#*}"; [ -z "$p" ] && continue
        [ -e "$dir/$p" ] || [ -e "$p" ] || echo "  BROKEN  $f  →  $t"
      done
    done
)
if [ -n "$broken" ]; then echo "$broken"; fail=1; else echo "  OK"; fi

echo "=== 2. CLAUDE.md 引用的程式路徑 ==="
# 下面是手工維護的清單，不是從 CLAUDE.md parse 出來的——只收「正文實際引用、
# 且腐爛會誤導 agent」的路徑。
#
# 所以這項檢查會單向漂移：CLAUDE.md 新增一條路徑引用而沒同步加進來，這裡照樣
# 全綠。失效的樣子不是報錯，是檢查通過但沒涵蓋到新引用。改 CLAUDE.md 的架構
# 速查／domain model 段落時，順手對一下這張表。
missing=$(while read -r p; do
  [ -n "$p" ] && [ ! -e "$p" ] && echo "  MISSING  $p"
done <<'PATHS'
actions/
lib/db/queries/
lib/validators.ts
app/(dashboard)/_components/RealtimeProvider.tsx
lib/i18n/
lib/migrate/sources.ts
app/[locale]/migrate/[source]/page.tsx
lib/csvImport/
lib/db/schema.ts
drizzle/
docs/superpowers/specs/
docs/superpowers/ops-runbook.md
instrumentation-client.ts
sentry.server.config.ts
sentry.edge.config.ts
instrumentation.ts
next.config.ts
app/providers.tsx
lib/balance.ts
lib/db/queries/balance.ts
lib/guardian.ts
lib/categories.ts
lib/incomeCategories.ts
lib/incomePalettes.ts
lib/chartPalette.ts
lib/colors.ts
app/globals.css
PRODUCT.md
DESIGN.md
.impeccable/design.json
.claude/skills/run-oikos/SKILL.md
.claude/skills/ja-i18n/SKILL.md
lib/i18n/locales/ja.ts
PATHS
)
if [ -n "$missing" ]; then echo "$missing"; fail=1; else echo "  OK"; fi

echo "=== 3. spec ↔ INDEX.md 雙向覆蓋 ==="
actual=$(cd docs/superpowers/specs && ls *-design.md | sort)
indexed=$(grep -o '](\([a-z0-9-]*-design\.md\))' docs/superpowers/specs/INDEX.md | sed 's/^](//; s/)$//' | sort -u)
orphan=$(comm -23 <(echo "$actual") <(echo "$indexed"))
dangling=$(comm -13 <(echo "$actual") <(echo "$indexed"))
[ -n "$orphan" ] && { echo "$orphan" | sed 's/^/  未被索引  /'; fail=1; }
[ -n "$dangling" ] && { echo "$dangling" | sed 's/^/  索引到不存在的檔  /'; fail=1; }
[ -z "$orphan$dangling" ] && echo "  OK ($(echo "$actual" | wc -l | tr -d ' ') 份 spec 全數索引)"

echo "=== 4. spec first_shipped_in ↔ CHANGELOG ==="
# v0.x 跳過：CHANGELOG 從 1.0.0 起算，pre-1.0 版本只在 git tag（見 CHANGELOG 開頭說明）。
badver=$(for f in docs/superpowers/specs/*-design.md; do
  v=$(awk -F': *' '/^first_shipped_in:/{print $2; exit}' "$f")
  [[ -z "${v:-}" || "$v" == v0.* ]] && continue
  grep -q "$v" CHANGELOG.md || echo "  NOT IN CHANGELOG  $(basename "$f")  →  $v"
done)
if [ -n "$badver" ]; then echo "$badver"; fail=1; else echo "  OK"; fi

echo
[ "$fail" -eq 0 ] && echo "文件健檢全數通過。" || echo "有項目未通過（見上）。"
exit "$fail"
