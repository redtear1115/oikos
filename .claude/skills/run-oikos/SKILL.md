---
name: run-oikos
description: >
  Bootstrap, launch, and smoke-test the Oikos (Futari) Next.js 16 dev server.
  Use when the user asks to "run the app", "start dev", "啟動 dev server",
  "smoke test landing", "open the dashboard locally", verify a UI change,
  or screenshot the warm-lamp app. Wraps `npm install` + `npm run dev` +
  curl smokes into a single idempotent driver, captures the gotchas that
  trip cold-machine starts (missing `@next/bundle-analyzer`, missing
  `.env.local`, port 3000 reuse, Turbopack lazy-compile 404s).
---

# run-oikos

Idempotent driver for the Oikos repo's Next.js 16 (Turbopack) dev server.
Paths below are relative to **repo root** (`<unit>/` = oikos repo root).

## The agent path: smoke.sh

One script, one command, all paths verified in this container:

```bash
.claude/skills/run-oikos/smoke.sh
```

What it does, in order:

1. Sanity-checks Node ≥ 20 (Next 16 requires it). Bails on the user's
   shell PATH if `node` / `npm` aren't visible (fnm/nvm shells without
   `use` activated will trip this).
2. Confirms `.env.local` exists. If missing, prints a directive to
   copy `.env.local.example` or (in worktrees) symlink from the main
   checkout.
3. Detects the **stale-install state**: `package.json` declares
   `@next/bundle-analyzer` but `node_modules/@next/bundle-analyzer`
   doesn't exist. Symptom from a vanilla `next dev`: `Error: Cannot
   find module '@next/bundle-analyzer'` and dev silently dies. Fix:
   the script runs `npm install` automatically when this signature
   matches.
4. If `:3000` is already serving (probably your prior session),
   reuses it instead of double-launching.
5. Otherwise launches `npm run dev` via `nohup` into
   `.claude/skills/run-oikos/.logs/dev-3000.log`, then polls the log
   for `Ready in <Nms>` with a 60s ceiling. Crashes are surfaced by
   greppping for `Error|EADDRINUSE|Failed to` and tailing the log.
6. Smokes three routes that are reliable under Turbopack cold-start:
   `/` → 200, `/zh-TW` → 200, `/dashboard` → 307. See **Gotchas**
   for why `/sign-in` is intentionally not in the smoke set.
7. Leaves the server running, prints the URL + PID + log path + how
   to stop it.

To stop:

```bash
.claude/skills/run-oikos/smoke.sh --stop
```

(Or the underlying: `lsof -ti :3000 | xargs kill`.)

Override port if 3000 is in use by another project:

```bash
PORT=3001 .claude/skills/run-oikos/smoke.sh
```

## Prerequisites

- macOS or Linux with Node ≥ 20 (Next 16 requirement). This session
  ran Node v24.15.0 / npm 11.12.1 on darwin 24.0.0.
- `.env.local` at the repo root, populated with the **Supabase dev**
  project credentials. `.env.local.example` has the template. The
  user has a separate `oikos` prod and `oikos-dev` dev Supabase
  project; local `npm run dev` must talk to the dev one. In worktrees
  the convention is to symlink rather than copy
  (`ln -s ../../.env.local`) so key rotations don't drift.
- A clean `:3000` (or set `PORT`).

## Direct invocation: drive the running app

Once `smoke.sh` returns the server is live, use plain `curl` to drive
routes from an agent:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/zh-TW
# → 200

# Signed-out user hitting an auth-walled route 307s to the
# locale-aware sign-in path.
curl -sI http://localhost:3000/dashboard | grep -i '^location:'
# → location: /zh-TW/sign-in

# Inspect the rendered HTML of the landing for a chip / glyph change:
curl -s http://localhost:3000/zh-TW | grep -o 'phoneMock[A-Za-z]*'
```

For visual verification (DOM mutations, screenshots, focus rings),
fall through to a real browser at `http://localhost:3000/` — the
script keeps the server alive in the background for as long as you
need it.

## Run (human path)

```bash
npm install      # if you just pulled / switched node_modules-disturbing branches
npm run dev      # interactive; Ctrl-C to stop
```

Open `http://localhost:3000/` in a browser. Same dev server as the
agent path; useful for actual visual inspection.

## Gotchas

- **`Error: Cannot find module '@next/bundle-analyzer'` after a
  branch swap or fresh clone.** `next.config.ts` imports the analyzer
  unconditionally (gated only by `ANALYZE=true` for actually running
  it), so an absent package kills *dev* too. The script auto-runs
  `npm install` when it detects this; if you bypassed the script, run
  it manually.
- **`/sign-in` 404s on first cold curl under Turbopack.** Verified
  this session: `/zh-TW/sign-in` and `/sign-in` both 404 from a fresh
  `next dev` even though `app/[locale]/sign-in/page.tsx` exists. The
  same route renders 200 once you reach it via the in-app
  `/dashboard` → 307 → sign-in redirect chain from a real browser
  session — Turbopack apparently warms the route through that path
  but not via a direct curl. Hence the smoke set intentionally skips
  `/sign-in`; check it through a browser session if you need it.
- **`package-lock.json` `version` field drift.** The lockfile's
  `"version"` was stamped `1.2.4` while `package.json` was `1.3.0`
  (release didn't push the lockfile bump). Harmless to dev but will
  rage `npm ci`; the v1.3.1 PR fixed it.
- **`bundle-analyzer` adds ~16 packages on first install.** Not a
  bug — they're transitive deps of the analyzer. Worth noting so the
  npm install output isn't surprising.
- **Dev server binds to `0.0.0.0` and prints a LAN URL.** If you're
  driving from another device on the same network, use the
  `192.168.x.x` URL Next prints, not just localhost.
- **`.env.local` is not in any repo lock.** Loss of the file (e.g.
  deleted by accident in a worktree) leaves dev launching but every
  Supabase call failing. The script catches the missing-file case;
  it can't catch wrong-but-present keys.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Error: Cannot find module '@next/bundle-analyzer'` on `npm run dev`. | `node_modules/@next/bundle-analyzer` missing despite the dep being in `package.json`. | `npm install` (the script does this automatically; only happens if you bypassed). |
| `[run-oikos] .env.local missing.` | No `.env.local` at repo root. | Copy `.env.local.example` → `.env.local` and fill the Supabase **dev** keys. In a worktree, symlink from main. |
| `EADDRINUSE :3000`. | A prior dev server (or another project) is on the port. | `./smoke.sh --stop` to kill an oikos one, or `PORT=3001 ./smoke.sh` to relocate. |
| Smoke `/` returns 200 but `/zh-TW` 404. | Turbopack lazy-compile error in the `[locale]` segment. Rare. | Stop, `rm -rf .next`, restart. The script handles fresh `.next` cleanly (verified this session). |
| Logout doesn't bounce away from `/settings`. | Known: pre-v1.3.1 `LogoutButton` wraps the redirecting server action in `useTransition`. | Fixed in PR #833. Pull main if you're on a branch from before that. |

## Layout

```
.claude/skills/run-oikos/
  SKILL.md      # this file
  smoke.sh      # the driver (chmod +x)
  .logs/        # gitignored; dev server logs land here
```

`.logs/` is created on first run. Add to `.gitignore` if you
maintain one (this repo doesn't ignore inside `.claude/skills/`
explicitly).
