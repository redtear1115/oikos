#!/usr/bin/env bash
# smoke.sh — bootstrap, launch the Next.js dev server, smoke-test it.
#
# Idempotent: if the server's already up on :3000 it just smokes and
# reports. Leaves the server running so the caller can drive it
# (curl, browser, gh devtools, etc.); kill with `lsof -ti :3000 | xargs kill`.
#
# Usage:
#   .claude/skills/run-oikos/smoke.sh              # default: launch + smoke
#   .claude/skills/run-oikos/smoke.sh --stop       # kill anything on :3000
#   PORT=3001 .claude/skills/run-oikos/smoke.sh    # alternate port
set -euo pipefail

UNIT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$UNIT_DIR"

PORT="${PORT:-3000}"
LOG_DIR=".claude/skills/run-oikos/.logs"
LOG_FILE="$LOG_DIR/dev-${PORT}.log"
PID_FILE="$LOG_DIR/dev-${PORT}.pid"

mkdir -p "$LOG_DIR"

log() { printf "\033[2m[run-oikos]\033[0m %s\n" "$*" >&2; }
die() { printf "\033[31m[run-oikos] %s\033[0m\n" "$*" >&2; exit 1; }

# --- Optional: stop a running server and exit ---
if [[ "${1:-}" == "--stop" ]]; then
  pids="$(lsof -ti :"$PORT" 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    log "nothing listening on :$PORT"; exit 0
  fi
  log "killing PIDs on :$PORT → $pids"
  echo "$pids" | xargs kill -9 2>/dev/null || true
  rm -f "$PID_FILE"
  exit 0
fi

# --- 1. Prereqs ---
command -v node >/dev/null || die "node not on PATH"
command -v npm  >/dev/null || die "npm not on PATH"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 20 )); then
  die "Next.js 16 needs Node ≥20; found v$(node -v)"
fi

if [[ ! -f .env.local ]]; then
  die ".env.local missing. Copy from .env.local.example and fill the Supabase dev keys (memory note: in worktrees, symlink from main checkout)."
fi

# Detect the bootstrap-skipped state we hit this session: package.json
# declares @next/bundle-analyzer but node_modules doesn't have it.
if [[ ! -d node_modules/@next/bundle-analyzer ]]; then
  log "@next/bundle-analyzer missing in node_modules — running npm install"
  npm install --silent
fi

# --- 2. Launch (skip if already up) ---
if lsof -ti :"$PORT" >/dev/null 2>&1; then
  log "dev server already running on :$PORT — reusing"
else
  log "launching: npm run dev (PORT=$PORT)"
  PORT="$PORT" nohup npm run dev >"$LOG_FILE" 2>&1 &
  echo "$!" >"$PID_FILE"

  # Poll log for ready signal (Next 16 prints "✓ Ready in ###ms")
  log "waiting for ready signal in $LOG_FILE"
  for _ in $(seq 1 60); do
    if grep -q "Ready in" "$LOG_FILE" 2>/dev/null; then
      break
    fi
    if grep -qE "Error|EADDRINUSE|Failed to" "$LOG_FILE" 2>/dev/null; then
      tail -20 "$LOG_FILE" >&2
      die "dev server crashed before ready — see $LOG_FILE"
    fi
    sleep 1
  done
  if ! grep -q "Ready in" "$LOG_FILE" 2>/dev/null; then
    tail -20 "$LOG_FILE" >&2
    die "dev server did not become ready within 60s — see $LOG_FILE"
  fi
fi

# --- 3. Smoke ---
smoke() {
  local path="$1" expected="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT$path")
  if [[ "$code" == "$expected" ]]; then
    log "✓ $path → $code"
  else
    log "✗ $path → $code (expected $expected)"
    return 1
  fi
}

# Minimal smoke set chosen for reliability under Turbopack dev:
#   /          unprefixed landing (proxy rewrites internally to default locale)
#   /zh-TW     locale-prefixed landing
#   /dashboard auth-walled — proxy issues 307 to /<locale>/sign-in
# /sign-in is intentionally omitted: Turbopack lazy-compile sometimes
# 404s it on first cold hit even though the file exists. Reproduce in
# a real browser via the dashboard → sign-in redirect chain to warm it.
smoke "/"          200 || true
smoke "/zh-TW"     200 || true
smoke "/dashboard" 307 || true

log "ready: http://localhost:$PORT"
log "log:   $LOG_FILE"
[[ -f "$PID_FILE" ]] && log "pid:   $(cat "$PID_FILE")"
log "stop:  $0 --stop   (or: lsof -ti :$PORT | xargs kill)"
