#!/usr/bin/env bash
# PreToolUse(Bash) hook: before `gh pr merge`, require that the PR adds a
# CHANGELOG.md entry — or carries the `no-changelog` label (test-only, revert,
# release, pure refactor with nothing user- or ops-facing).
#
# Why: v1.6.3 shipped 25 merged PRs with an empty [Unreleased]; the entries
# had to be reconstructed from diffs at release time. Writing the entry while
# the PR (and its verification) is fresh is cheaper and more accurate.
#
# Failure looks like: nothing. If this hook stops firing (settings not loaded,
# `gh` not authenticated, command shape it doesn't recognise), merges go
# through silently and [Unreleased] is empty again at release time. It fails
# OPEN on anything it can't evaluate, by design — it must never block a merge
# because of its own bug — so the release skill's "[Unreleased] is empty"
# warning stays the backstop.
set -uo pipefail

cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0

# Only act on `gh pr merge ...` (anywhere in a compound command, incl. subshells).
MERGE_RE='(^|[;&|(`[:space:]]|\$\()gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)'
printf '%s' "$cmd" | grep -Eq "$MERGE_RE" || exit 0

# Every merge in the command is checked (a chained `merge A && merge B` must
# not let A through). Split on each occurrence; for each segment take the PR
# number: a /pull/N URL, else the first bare integer argument.
prs=$(printf '%s' "$cmd" | awk '{ n = split($0, parts, /gh[[:space:]]+pr[[:space:]]+merge/); for (i = 2; i <= n; i++) print parts[i] }' | while IFS= read -r seg; do
  seg=$(printf '%s' "$seg" | sed -E 's/(&&|\|\||;|\)).*//')
  n=$(printf '%s' "$seg" | grep -Eo '/pull/[0-9]+' | head -1 | grep -Eo '[0-9]+')
  [ -z "$n" ] && n=$(printf '%s' "$seg" | tr ' \t' '\n\n' | grep -Ex '#?[0-9]+' | head -1 | tr -d '#')
  # No number in this segment → the current branch's PR (fail open if unknown).
  [ -z "$n" ] && n=$(gh pr view --json number -q .number 2>/dev/null)
  [ -n "$n" ] && printf '%s\n' "$n"
done | sort -u)
[ -z "$prs" ] && exit 0

missing=""
for pr in $prs; do
  info=$(gh pr view "$pr" --json files,labels 2>/dev/null) || continue
  touches=$(printf '%s' "$info" | jq -r '[.files[].path] | index("CHANGELOG.md") != null')
  skip=$(printf '%s' "$info" | jq -r '[.labels[].name] | index("no-changelog") != null')
  if [ "$touches" != "true" ] && [ "$skip" != "true" ]; then missing="$missing #$pr"; fi
done
[ -z "$missing" ] && exit 0
pr=$(printf '%s' "$missing" | awk '{print $1}' | tr -d '#')
reason="PR$missing 沒有改到 CHANGELOG.md。merge 前請先在這條 PR 的 CHANGELOG.md [Unreleased] 補上條目（三行短條目格式，見 CHANGELOG.md 開頭；Security 小節的門檻是「有沒有造成暴露」），並讓 verifier 一起核對；或者，如果這條 PR 沒有使用者或營運看得到的變化（純測試、revert、release PR），加上 no-changelog label：gh pr edit $pr --add-label no-changelog"
jq -n --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0
