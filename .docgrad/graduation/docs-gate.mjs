#!/usr/bin/env node
// docs-gate.mjs — 畢業用的 CI 守門腳本（docgrad 產出的範本，**不由 docgrad 安裝**）
//
// 這支腳本刻意**不 import** docgrad 的 lib.mjs：它會被複製到你的 repo 裡，
// 跟 docgrad 的安裝路徑脫鉤。它只做一件事——呼叫已安裝的 docgrad 量測腳本，
// 讀回 JSON，套上門檻，違規就非零 exit。門檻由你決定，docgrad 不替你決定嚴格度。
//
// 用法：
//   DOCGRAD_DIR=/path/to/docgrad node docs-gate.mjs [--root <repo>]
//
// 找不到 DOCGRAD_DIR 時會沿著常見的 plugin 安裝位置猜一次，猜不到就明確報錯。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

// ---- 門檻：改這裡，不要改判定邏輯 ---------------------------------------------
const THRESHOLDS = {
  max_dead_links: 0, // 死鏈一條都不准進 main
  max_bad_anchors: 0, // 壞錨同理（slug 與 GitHub 對齊後不再有誤報）
  max_orphans: 0, // 從索引走不到的文件＝agent 檢索不到
  min_freshness_coverage: 0.93, // 日期訊號覆蓋率（round 8 現況 0.9348，門檻只准往上）
  max_entry_cost_tokens: 9100, // 入口檔固定成本（round 8 現況 CLAUDE.md 9,037；要往 ★4 就把它壓到 5000）
};

function resolveDocgradDir() {
  if (process.env.DOCGRAD_DIR) {
    const dir = path.resolve(process.env.DOCGRAD_DIR);
    if (fs.existsSync(path.join(dir, 'scripts/links.mjs'))) return dir;
    console.error(`docs-gate: DOCGRAD_DIR=${dir} 裡找不到 scripts/links.mjs，請確認路徑指向 docgrad 根目錄。`);
    process.exit(2);
  }
  const candidates = [
    path.join(os.homedir(), '.claude/skills/docgrad'),
    ...['claude-plugins-official', 'docgrad'].map((m) =>
      path.join(os.homedir(), '.claude/plugins/cache', m, 'docgrad')
    ),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'scripts/links.mjs'))) return c;
  }
  console.error(
    'docs-gate: 找不到 docgrad 安裝目錄。請設定 DOCGRAD_DIR 環境變數指向 docgrad repo／plugin 根目錄。'
  );
  process.exit(2); // 2 = 環境問題，與 1 = 文件不合格分開，CI 才分得出是誰的錯
}

function runScript(docgradDir, name, root) {
  const script = path.join(docgradDir, 'scripts', name);
  try {
    return JSON.parse(execFileSync(process.execPath, [script, '--root', root], { encoding: 'utf8' }));
  } catch (err) {
    console.error(`docs-gate: ${name} 執行失敗 — ${err.message}`);
    process.exit(2);
  }
}

const rootIdx = process.argv.indexOf('--root');
const root = path.resolve(rootIdx >= 0 && process.argv[rootIdx + 1] ? process.argv[rootIdx + 1] : process.cwd());
const docgradDir = resolveDocgradDir();

const links = runScript(docgradDir, 'links.mjs', root);
const freshness = runScript(docgradDir, 'freshness.mjs', root);
const inventory = runScript(docgradDir, 'inventory.mjs', root);

const violations = [];
const check = (label, actual, ok, limit) => {
  if (!ok) violations.push(`${label}: ${actual}（門檻 ${limit}）`);
};

check('死鏈', links.dead_links.length, links.dead_links.length <= THRESHOLDS.max_dead_links, THRESHOLDS.max_dead_links);
check('壞錨', links.bad_anchors.length, links.bad_anchors.length <= THRESHOLDS.max_bad_anchors, THRESHOLDS.max_bad_anchors);
check('孤兒', links.orphans.length, links.orphans.length <= THRESHOLDS.max_orphans, THRESHOLDS.max_orphans);
check(
  '新鮮度覆蓋率',
  freshness.coverage_ratio,
  freshness.coverage_ratio >= THRESHOLDS.min_freshness_coverage,
  `≥ ${THRESHOLDS.min_freshness_coverage}`
);
check(
  '入口檔固定成本',
  `${inventory.entry_cost.tokens_est} tokens`,
  inventory.entry_cost.tokens_est <= THRESHOLDS.max_entry_cost_tokens,
  `≤ ${THRESHOLDS.max_entry_cost_tokens}`
);

if (violations.length) {
  console.error('docs-gate: 文件未通過門檻\n');
  for (const v of violations) console.error(`  ✗ ${v}`);
  if (links.dead_links.length) {
    console.error('\n死鏈明細：');
    for (const d of links.dead_links) console.error(`  ${d.file}:${d.line} → ${d.target}`);
  }
  if (links.orphans.length) console.error(`\n孤兒：${links.orphans.join(', ')}`);
  process.exit(1);
}

console.log(
  `docs-gate: 通過（死鏈 0／壞錨 0／孤兒 0／新鮮度 ${freshness.coverage_ratio}／` +
    `固定成本 ${inventory.entry_cost.tokens_est} tokens）`
);
