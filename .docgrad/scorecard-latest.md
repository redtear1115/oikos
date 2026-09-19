# docgrad scorecard — oikos @ b41540c · 2026-09-19

> Round 16 (loop, no `--judge`). Picked: `entry_cost`.

## Measure
measure_hash dd15ca3f · corpus_hash cf8df136

- `entry_cost`: 5863 — **WATCH** (line: "WATCH (not ≤ 5,000 tok (entry_cost_tiers[2]), not > 10,000 tok (entry_cost_tiers[1]))") · accept WATCH · meets_target true
- `pollution`: 0.0483 — **OK** (line: "OK < 10% (pollution_max)") · accept OK · meets_target true
- `dead_link_ratio`: 0 (0/234) — **OK** (line: "OK = 0%") · accept OK · meets_target true
- `orphan_ratio`: 0 (0/50) — **OK** (line: "OK ≤ 5%") · accept OK · meets_target true
- `reachable_ratio`: 1 — **OK** (line: "OK ≥ 95%") · accept OK · meets_target true
- `index_present`: 1 — **OK** (line: "OK = 1") · accept OK · meets_target true
- `date_coverage`: 0.9 (45/50) — **OK** (line: "OK ≥ 90%") · accept OK · meets_target true
- `key_doc_age`: 6 — **OK** (line: "OK ≤ 60 days (stale_after_days)") · accept OK · meets_target true
- `date_drift`: 0 — **OK** (line: "OK < 30 days") · accept OK · meets_target true
- `undocumented_dirs`: 0 — **OK** (line: "OK = 0") · accept OK · meets_target true
- `drifted_dirs`: 0 — **OK** (line: "OK = 0") · accept OK · meets_target true

- Freshness date_concentration: 16 files (35.6%) share 2026-07-13 — backfill trace; limits how well coverage distinguishes unmaintained docs.
- Economy: fixed cost ~5863 tokens (CLAUDE.md); pollution 0.0483 (exclude charged: docs/superpowers/plans/2026-05-30-migrate-cms-architecture.md); out_of_scope 0 files / 0 tokens; untracked 0 — corpus matches the commit.
- Thresholds: shipped defaults (customised: false).
- Config note: —
- Graduation gate `.docgrad/graduation/docs-gate.mjs` (run: `DOCGRAD_DIR=<docgrad install> node .docgrad/graduation/docs-gate.mjs --root .`): produced but not installed — no workflow references it. **The committed gate is red: entry cost 5863 > its declared 5500.** This gate predates the pollution threshold. Its judging logic differs from the template docgrad ships (expected for an older gate; regenerate at next graduation).

## Judge — not comparable across rounds
judge_hash 41cb532f

judge not run this round — no judged-dimension table

## Token economy (report-only)
- Fixed cost: ~5863 tokens (entry_files: CLAUDE.md)
- Marginal cost:
  - "actions/transaction.ts": ~17060 tokens, max_depth 1, fan_in 3, code_pointer yes, churn_commits 6
  - "lib/balance.ts": ~27967 tokens, max_depth 1, fan_in 5, code_pointer no, churn_commits 0
  - "app/(dashboard)/trips": ~5863 tokens, max_depth null, fan_in 0, code_pointer no, churn_commits 13
  - "lib/i18n": ~43226 tokens, max_depth 3, fan_in 9, code_pointer yes, churn_commits 70
  - Most taxed: `lib/i18n` (churn 70, ~32k tokens, depth 3).
- Pollution surface: 4.83% (exclude: docs/superpowers/plans/, docs/superpowers/perf-baselines/)
- Thresholds in force: shipped defaults
- Out of scope: 0 files / 0 tokens
- Untracked files in the corpus: 0 — corpus matches the commit
- Interpretation: every task pays the CLAUDE.md fixed tax; conditional material (native build pitfalls, copy guidelines, Impeccable context) belongs behind a pointer so only the tasks that need it pay for it.

### Traceability (report-only)
- code_pointer_ratio: 0.9167
- index_hotness: ratio 3.33 (top5: CLAUDE.md 53, docs/app-store-submission-runbook.md 23, docs/superpowers/specs/INDEX.md 10, DESIGN.md 9, docs/superpowers/specs/csv-import-design.md 9) — CLAUDE.md absorbs edits that child docs should carry.

## Outside docgrad's remit
3 open item(s):
- [other] `public/bank-statement-template.xlsx` — 銀行對帳單 3-sheet 模板（#585）已 ship 在 public/ 根目錄，scripts/build-bank-statement-template.py 也在，但全 repo 沒有任何連結指向它——lib/migrate/sources.ts 只有 cwmoney 有 templateDownload。CHANGELOG 寫的「從 /migrate 入口下載」不成立，使用者拿不到這個檔
- [other] `components/CsvFileUploadWidget.tsx` — csv-import spec 原訂「客戶端檔案大小上限 2 MB」，repo 內從未實作任何大小檢查（grep 2MB / 2097152 / maxSize / file.size 全無）。大檔目前的行為是瀏覽器 parse 到卡住
- [code-fix-required] `actions/currency.ts:29` — setBaseCurrency 的 epoch guard 用 transactedAt/occurredAt/settledAt，但 epoch 歸屬權威是 created_at（_predicates.ts#epochClause）。匯入舊帳後可繞過 guard，改幣別會靜默改寫所有既有金額的語意（TWD→JPY 同為整數幣別，無任何欄位不一致、不報錯）

## Suggested next steps
**Measure rows not meeting target:**
(none — all rows meet target)

(to also rate judged dimensions, run /docgrad judge or add --judge)
