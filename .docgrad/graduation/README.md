# Documentation gate (produced by docgrad, not installed)

This directory holds a CI gate docgrad generated when this repo hit its targets. **It is not
running.** Nothing installed it, and nothing will until someone does the step below.

- `docs-gate.mjs` — the check. Reads the output of docgrad's `links`, `freshness` and `inventory`
  scripts and exits 0 (pass), 1 (docs failed the gate) or 2 (environment problem: it could not find
  a docgrad install, or that install's `inventory` output has no numeric `pollution.ratio`).
- `docs-gate.yml` — a workflow that runs it.

## Run it by hand

```bash
DOCGRAD_DIR=/path/to/docgrad node .docgrad/graduation/docs-gate.mjs --root .
```

`DOCGRAD_DIR` may point at the docgrad repo root or at the skill directory itself. With it unset the
script looks in the usual install locations and exits 2 if it cannot find one.

## Install it

Put `docs-gate.mjs` in `.github/scripts/` and `docs-gate.yml` in `.github/workflows/`. docgrad
deliberately does not do this for you — it does not modify anyone's CI.

## 本 repo 的畢業紀錄（2026-09-19，round 16）

這份 gate 由 docgrad 2.0.1 模板重產，取代 round 13 那份。舊的那份從沒被安裝過；到 2026-09-19 已經是紅燈：CLAUDE.md 的入口成本 6,578 tokens，超過它宣告的 5,500。

`max_entry_cost_tokens` 從 5,500 調到 5,863，這是刻意放寬。使用者決定接受 `entry_cost: WATCH`（OK 線是 ≤ 5,000），讓品牌文案準則留在入口檔。Round 16 把原生 build 雷點搬進 runbook，成本降到 5,863。下次想再調高這個門檻之前，先看 CLAUDE.md 多了什麼：2026-09-13 到 09-19 之間它長了約 1,200 tokens，沒有人發現。

## The thresholds expire. Plan for it.

`THRESHOLDS` at the top of `docs-gate.mjs` was pinned to this repo's state on the day it graduated:

| Threshold | Pinned to | State at graduation |
|---|---|---|
| `max_dead_links` | 0 | 0 dead / 234 links |
| `max_bad_anchors` | 0 | 0 |
| `max_orphans` | 0 | 0 / 50 docs |
| `min_freshness_coverage` | 0.9 | 0.90 (45/50) |
| `max_entry_cost_tokens` | 5863 | 5,863 tokens (CLAUDE.md) |
| `max_pollution_ratio` | 0.0483 | 0.0483 (8,175 excluded tokens) |

Four of those are absolute numbers and stay meaningful. **`min_freshness_coverage` and
`max_pollution_ratio` are both ratios, and a ratio threshold can go red on its own as the corpus
changes shape.** Freshness coverage falls when the corpus grows faster than its date signal does —
adding documents enlarges the denominator, and new documents usually arrive without a date signal.
Pollution can move **either way**: a new junk file matched by `exclude` raises it (tracked or not), a new clean doc
lowers it (it grows the denominator without adding to the numerator). Growing the corpus is something
docgrad encourages, so either of these moving is a normal event, not a failure by itself.

`max_pollution_ratio` is pinned to this repo's `inventory.pollution.ratio` at graduation (the same
"current values become the thresholds" rule as the other five) — never to docgrad's shipped default.
That default only stands in for a repo that has not graduated yet, and it stays true even for a repo
that graduated with `targets: pollution: WATCH`. CI runs on a clean checkout, so it reads the clean
corpus; a local run may read a different ratio if it has untracked files (see `pollution.note` in
`inventory.mjs`'s output).

Measured on a real repo: pinned at 0.93 when the corpus was 46 files; four rounds later the corpus
was 50 files, coverage read 0.90, and the gate had been red for four rounds without anyone noticing,
because nothing was running it.

When it goes red, decide which happened:

- **The documentation decayed** → fix the documentation. That is what the gate is for.
- **The corpus grew and the new files have no date signal** → add the signal to the new files,
  which is also fixing the documentation.
- **The threshold no longer describes what this repo is willing to enforce** → change it
  deliberately, and record why. Lowering it to make a red light go away converts the gate into
  decoration.

`docgrad measure` and `docgrad report` evaluate these thresholds against current measurements on every
run and tell you the verdict. They **do not execute this file** — running a script committed into
the repo being graded is not something a docs scorer should do. Treat their verdict as a reading of
what this gate declares, and this file as the thing CI actually runs once you install it.
