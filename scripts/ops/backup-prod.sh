#!/bin/bash
# #1549 — nightly prod backup: pg_dump → age → rclone (Google Drive).
#
# Runs on the owner's Mac from the installed, SHA-checked copy in
# ~/.local/libexec/futari-backup/ (scripts/ops/install-backup.sh), started by
# launchd at 03:30 through futari-backup-run.sh. Operator steps, what the
# backup role can and cannot reach, restore order and failure looks:
# docs/superpowers/ops-runbook.md §「Prod backup (futari_backup)」.
#
#   backup-prod.sh [--dry-run] [--accept-counts] [--clear-auth-block]
#
#   --dry-run           print the plan and the local checks; connects to
#                       nothing, reads no Keychain item, runs no tool.
#   --accept-counts     a table vanished or shrank on purpose (a migration):
#                       skip the drop checks once; the new counts become the
#                       baseline. The core non-empty check still runs.
#   --clear-auth-block  after fixing the credential, allow a run on the same
#                       day as an authentication failure.
#
# What it does, in order:
#   1. password from the Keychain into a transient 600 PGPASSFILE inside a 700
#      staging dir (deleted on exit, swept at the next start);
#   2. one REPEATABLE READ transaction exports a snapshot and stays open; the
#      manifest (encrypted) and the row counts come from that transaction;
#   3. pg_dump public+drizzle and auth.users+auth.identities with --snapshot,
#      each streamed straight into age — no plaintext dump ever touches disk;
#   4. size + age-header check, then .partial → final name;
#   5. sanity check of the counts against the previous run;
#   6. rclone upload, size + md5 compare, LAST_OK, then prune.
# Any failure: macOS notification + a FAILED marker file on the Desktop.
#
# Logging is status-only (stage names, counts, sizes, exit codes). Tool stderr
# goes to a 600 file in the state dir, never to the log, because libpq error
# text carries host and user names. Never paste either file anywhere public.

set -euo pipefail
umask 077
# A builtin write to the snapshot holder after it exited would otherwise kill
# this script with SIGPIPE before the EXIT trap could clean up and notify.
trap '' PIPE

# Pinned by scripts/ops/install-backup.sh in the installed copy. Never read
# from the mutable config: whoever can edit the config could otherwise make
# tonight's backup readable to a key of their choosing.
readonly AGE_RECIPIENT='__FUTARI_BACKUP_AGE_RECIPIENT__'

readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly CONF_DIR="${HOME}/.config/futari-backup"
readonly CONF_FILE="${CONF_DIR}/config"
readonly SERVICE_FILE="${CONF_DIR}/pg_service.conf"
readonly STATE_DIR="${HOME}/Library/Application Support/futari-backup"
readonly STAGING_PARENT="${HOME}/Library/Caches/futari-backup"
readonly LOG_FILE="${HOME}/Library/Logs/futari-backup.log"
readonly FAILED_MARKER="${HOME}/Desktop/FUTARI-BACKUP-FAILED.txt"
readonly COUNTS_SQL="${SCRIPT_DIR}/futari-backup-counts.sql"
readonly MANIFEST_SQL="${SCRIPT_DIR}/futari-backup-manifest.sql"

# Retention (plan D6). Fixed here, not configurable: the privacy policy
# promises "up to about 60 days" (30 backups + Drive trash).
readonly KEEP_NEWEST=30
readonly KEEP_MIN=7
readonly KEEP_DAYS=30

# Sanity thresholds. A table is only judged once it had at least this many
# rows last run: small, naturally transient tables (pending occurrences,
# open invites) would otherwise fail the run on ordinary days.
readonly SANITY_MIN_PREV=10

# Smallest plausible ciphertext per part (age header alone is ~200 bytes).
readonly MIN_BYTES_PUBLIC=4096
readonly MIN_BYTES_AUTH=512
readonly MIN_BYTES_MANIFEST=512

DRY_RUN=0
ACCEPT_COUNTS=0
CLEAR_AUTH_BLOCK=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --accept-counts) ACCEPT_COUNTS=1 ;;
    --clear-auth-block) CLEAR_AUTH_BLOCK=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------------------
# Config (KEY=value lines; parsed, never sourced). Defaults below.
# ---------------------------------------------------------------------------
CFG_PG_BIN_DIR='/opt/homebrew/opt/postgresql@17/bin'
CFG_PG_MAJOR='17'
CFG_AGE_BIN='/opt/homebrew/bin/age'
CFG_RCLONE_BIN='/opt/homebrew/bin/rclone'
CFG_RCLONE_DEST=''
CFG_PG_SERVICE='futari_prod_backup'
CFG_KEYCHAIN_SERVICE='futari-backup'
CFG_KEYCHAIN_ACCOUNT='futari_backup'
CFG_BUNDLE_PREFIX='futari-prod'

CONFIG_PROBLEMS=''
note_problem() { CONFIG_PROBLEMS="${CONFIG_PROBLEMS}  - $1"$'\n'; }

# Mode has no group/other bits and the file is ours.
is_private() {
  local p=$1 mode owner
  mode=$(stat -f '%Lp' "$p" 2>/dev/null) || return 1
  owner=$(stat -f '%u' "$p" 2>/dev/null) || return 1
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  [ "$owner" = "$(id -u)" ] && [ $(( 8#$mode & 8#077 )) -eq 0 ]
}

load_config() {
  if [ ! -d "$CONF_DIR" ]; then note_problem "config dir missing (~/.config/futari-backup)"; return 0; fi
  is_private "$CONF_DIR" || note_problem "config dir is not private to you (chmod 700)"
  if [ ! -f "$CONF_FILE" ]; then note_problem "config file missing"; return 0; fi
  is_private "$CONF_FILE" || note_problem "config file is not private to you (chmod 600)"
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key=${line%%=*}
    val=${line#*=}
    case "$key" in
      PG_BIN_DIR|PG_MAJOR|AGE_BIN|RCLONE_BIN|RCLONE_DEST|PG_SERVICE|KEYCHAIN_SERVICE|KEYCHAIN_ACCOUNT|BUNDLE_PREFIX)
        printf -v "CFG_${key}" '%s' "$val" ;;
      AGE_RECIPIENT)
        note_problem "config sets AGE_RECIPIENT — not allowed; the recipient is pinned at install" ;;
      *)
        note_problem "config has an unknown key: ${key}" ;;
    esac
  done < "$CONF_FILE"
}

# ---------------------------------------------------------------------------
# Logging / failure
# ---------------------------------------------------------------------------
STAGE_NAME='start'
STAGING=''
HOLDER_PID=''
HOLDER_FD_OPEN=0
FAIL_KIND=''
LOCK_DIR=''

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

log() {
  if [ "$DRY_RUN" -eq 0 ]; then
    printf '%s %s\n' "$(ts)" "$*" >> "$LOG_FILE"
  fi
  if [ -t 1 ] || [ "$DRY_RUN" -eq 1 ]; then
    printf '%s\n' "$*"
  fi
}

die() {
  log "FAILED stage=${STAGE_NAME}: $1"
  exit 1
}

# libpq / pg_dump / rclone stderr, kept out of the log. Overwritten each run.
ERR_FILE="${STATE_DIR}/last-run.err"

# Classify the tool error text without copying it anywhere.
classify_err() {
  if [ -f "$ERR_FILE" ] && grep -q -E 'password authentication failed|28P01|SASL authentication failed|no password supplied' "$ERR_FILE"; then
    printf 'auth'
  elif [ -f "$ERR_FILE" ] && grep -q -E 'certificate|SSL' "$ERR_FILE"; then
    printf 'tls'
  elif [ -f "$ERR_FILE" ] && grep -q -E 'too many connections|connection limit' "$ERR_FILE"; then
    printf 'connection-limit'
  elif [ -f "$ERR_FILE" ] && grep -q -E 'permission denied' "$ERR_FILE"; then
    printf 'permission'
  elif [ -f "$ERR_FILE" ] && grep -q -E 'lock|timeout' "$ERR_FILE"; then
    printf 'lock-or-timeout'
  else
    printf 'other'
  fi
}

die_tool() {
  local kind
  kind=$(classify_err)
  FAIL_KIND=$kind
  if [ "$kind" = 'auth' ]; then
    : > "${STATE_DIR}/auth-failed.$(date +%Y%m%d)"
    die "$1 (authentication failed — not retrying today; see runbook 〈Circuit breaker〉)"
  fi
  die "$1 (error kind: ${kind}; details in the state dir's last-run.err)"
}

notify_failure() {
  local msg="Futari backup FAILED at stage ${STAGE_NAME}. See ~/Library/Logs/futari-backup.log"
  /usr/bin/osascript -e "display notification \"${msg}\" with title \"Futari backup\"" >/dev/null 2>&1 || true
  {
    printf 'Futari backup failed\n'
    printf 'time: %s\n' "$(ts)"
    printf 'stage: %s\n' "$STAGE_NAME"
    printf 'kind: %s\n' "${FAIL_KIND:-see log}"
    printf 'log: ~/Library/Logs/futari-backup.log\n'
    printf 'Delete this file once the cause is fixed and a run has passed.\n'
  } >> "$FAILED_MARKER" 2>/dev/null || true
}

stop_holder() {
  if [ "$HOLDER_FD_OPEN" -eq 1 ]; then
    exec 3>&- || true
    HOLDER_FD_OPEN=0
  fi
  if [ -n "$HOLDER_PID" ]; then
    local i=0
    while kill -0 "$HOLDER_PID" 2>/dev/null && [ "$i" -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
    if kill -0 "$HOLDER_PID" 2>/dev/null; then
      pkill -P "$HOLDER_PID" 2>/dev/null || true
      kill "$HOLDER_PID" 2>/dev/null || true
    fi
    wait "$HOLDER_PID" 2>/dev/null || true
    HOLDER_PID=''
  fi
}

on_exit() {
  local rc=$?
  set +e
  stop_holder
  if [ -n "$STAGING" ] && [ -d "$STAGING" ]; then
    rm -f "${STAGING}/pgpass"
    rm -rf "$STAGING"
  fi
  if [ -n "$LOCK_DIR" ]; then
    rm -rf "$LOCK_DIR"
  fi
  if [ "$DRY_RUN" -eq 0 ] && [ "$rc" -ne 0 ]; then
    notify_failure
  fi
  exit "$rc"
}
trap on_exit EXIT
trap 'exit 130' INT TERM HUP

# ---------------------------------------------------------------------------
# Checks shared by --dry-run and a real run (local only)
# ---------------------------------------------------------------------------
PSQL=''; PG_DUMP=''; AGE=''; RCLONE=''
SVC_HOST=''; SVC_PORT=''; SVC_DB=''; SVC_USER=''; SVC_SSLMODE=''; SVC_ROOTCERT=''

# Reads the [service] section of the pg_service file. Values stay in memory.
read_service() {
  local in=0 line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case "$line" in
      '['*']') if [ "$line" = "[${CFG_PG_SERVICE}]" ]; then in=1; else in=0; fi; continue ;;
      ''|'#'*) continue ;;
    esac
    [ "$in" -eq 1 ] || continue
    key=${line%%=*}; val=${line#*=}
    key=${key// /}; val=${val# }
    case "$key" in
      host) SVC_HOST=$val ;;
      port) SVC_PORT=$val ;;
      dbname) SVC_DB=$val ;;
      user) SVC_USER=$val ;;
      sslmode) SVC_SSLMODE=$val ;;
      sslrootcert) SVC_ROOTCERT=$val ;;
      password) note_problem "pg_service file holds a password field — remove it; the password lives in the Keychain only" ;;
    esac
  done < "$SERVICE_FILE"
}

local_checks() {
  load_config

  if [[ ! "$AGE_RECIPIENT" =~ ^age1[02-9ac-hj-np-z]{58}$ ]]; then
    note_problem "age recipient not pinned — run the installed copy (scripts/ops/install-backup.sh)"
  fi
  [[ "$CFG_PG_MAJOR" =~ ^[0-9]+$ ]] || note_problem "PG_MAJOR is not a number"
  [[ "$CFG_BUNDLE_PREFIX" =~ ^[a-z0-9-]+$ ]] || note_problem "BUNDLE_PREFIX may only hold a-z 0-9 -"
  [[ "$CFG_PG_SERVICE" =~ ^[A-Za-z0-9_]+$ ]] || note_problem "PG_SERVICE may only hold letters, digits, _"
  [ -n "$CFG_RCLONE_DEST" ] || note_problem "RCLONE_DEST is not set"

  PSQL="${CFG_PG_BIN_DIR}/psql"
  PG_DUMP="${CFG_PG_BIN_DIR}/pg_dump"
  AGE=$CFG_AGE_BIN
  RCLONE=$CFG_RCLONE_BIN
  local t
  for t in "$PSQL" "$PG_DUMP" "$AGE" "$RCLONE" /usr/bin/security; do
    [ -x "$t" ] || note_problem "tool not found or not executable: ${t}"
  done
  for t in "$COUNTS_SQL" "$MANIFEST_SQL"; do
    [ -f "$t" ] || note_problem "missing next to the script: ${t##*/}"
  done

  if [ -f "$SERVICE_FILE" ]; then
    is_private "$SERVICE_FILE" || note_problem "pg_service file is not private to you (chmod 600)"
    read_service
    [ -n "$SVC_HOST" ] && [ -n "$SVC_PORT" ] && [ -n "$SVC_DB" ] && [ -n "$SVC_USER" ] \
      || note_problem "service [${CFG_PG_SERVICE}] needs host, port, dbname and user"
    [ "$SVC_SSLMODE" = 'verify-full' ] || note_problem "service [${CFG_PG_SERVICE}] must set sslmode=verify-full"
    if [ -z "$SVC_ROOTCERT" ] || [ ! -f "$SVC_ROOTCERT" ]; then
      note_problem "service [${CFG_PG_SERVICE}] needs sslrootcert pointing at the Supabase CA file"
    fi
  else
    note_problem "pg_service file missing (~/.config/futari-backup/pg_service.conf)"
  fi

  # psql meta-commands below quote these paths with single quotes.
  case "${STAGING_PARENT}${SCRIPT_DIR}${AGE}" in
    *"'"*) note_problem "a path contains a single quote; move it" ;;
  esac
}

print_plan() {
  local today_block="no"
  [ -f "${STATE_DIR}/auth-failed.$(date +%Y%m%d)" ] && today_block="yes"
  printf 'Futari backup — dry run (nothing contacted, no Keychain read, no tool run)\n\n'
  printf 'config dir      : %s\n' "$CONF_DIR"
  printf 'service         : %s (host %s, sslmode %s)\n' "$CFG_PG_SERVICE" "$([ -n "$SVC_HOST" ] && echo set || echo MISSING)" "${SVC_SSLMODE:-MISSING}"
  printf 'keychain item   : service=%s account=%s (not read)\n' "$CFG_KEYCHAIN_SERVICE" "$CFG_KEYCHAIN_ACCOUNT"
  printf 'pg tools        : %s (major %s required)\n' "$CFG_PG_BIN_DIR" "$CFG_PG_MAJOR"
  printf 'age recipient   : %s\n' "$([[ "$AGE_RECIPIENT" =~ ^age1 ]] && echo pinned || echo NOT PINNED)"
  printf 'upload to       : %s\n' "$([ -n "$CFG_RCLONE_DEST" ] && echo 'configured (RCLONE_DEST)' || echo MISSING)"
  printf 'bundle name     : %s-<UTC timestamp>/{public.dump.age,auth.dump.age,manifest.txt.age}\n' "$CFG_BUNDLE_PREFIX"
  printf 'state dir       : %s\n' "$STATE_DIR"
  printf 'staging parent  : %s\n' "$STAGING_PARENT"
  printf 'auth block today: %s\n\n' "$today_block"
  printf 'A real run would:\n'
  printf '  1. sweep stale staging dirs; make a 700 staging dir; write a 600 PGPASSFILE from the Keychain\n'
  printf '  2. open 1 snapshot-holder session: BEGIN REPEATABLE READ READ ONLY; pg_export_snapshot()\n'
  printf '  3. in that transaction: row counts (local state, counts only) + manifest -> age\n'
  printf '  4. pg_dump --snapshot -Fc -n public -n drizzle | age -r <pinned> -> public.dump.age.partial\n'
  printf '  5. pg_dump --snapshot -Fc --data-only -t auth.users -t auth.identities | age -> auth.dump.age.partial\n'
  printf '  6. end the transaction; size + age header checks; rename .partial\n'
  printf '  7. sanity: core tables > 0; vs last run (prev >= %s rows): no table gone, none to 0, none down > 50%%\n' "$SANITY_MIN_PREV"
  printf '  8. rclone copy --immutable; compare sizes + md5; write LAST_OK\n'
  printf '  9. prune: keep newest %s, never below %s, never younger than %s days (Drive trash keeps the rest ~30 days)\n' "$KEEP_NEWEST" "$KEEP_MIN" "$KEEP_DAYS"
  if [ -n "$CONFIG_PROBLEMS" ]; then
    printf '\nA real run would stop before connecting, because:\n%s' "$CONFIG_PROBLEMS"
  else
    printf '\nLocal checks: OK\n'
  fi
}

# ---------------------------------------------------------------------------
# Helpers for a real run
# ---------------------------------------------------------------------------
wait_for_file() { # path timeout_seconds what
  local f=$1 limit=$(( $2 * 5 )) what=$3 i=0
  while [ ! -s "$f" ]; do
    if ! kill -0 "$HOLDER_PID" 2>/dev/null; then die_tool "snapshot session ended during ${what}"; fi
    i=$((i + 1))
    [ "$i" -le "$limit" ] || die "timed out waiting for ${what}"
    sleep 0.2
  done
}

send() { # text to the snapshot holder's stdin
  printf '%s\n' "$1" >&3 || die_tool "snapshot session closed early"
}

age_header_ok() {
  local f=$1 first stanzas
  first=$(head -n 1 "$f" | LC_ALL=C tr -d '\r') || return 1
  [ "$first" = 'age-encryption.org/v1' ] || return 1
  stanzas=$(head -c 1024 "$f" | LC_ALL=C grep -a -c '^-> X25519 ' || true)
  [ "$stanzas" = '1' ]
}

finish_part() { # name min_bytes
  local f="${STAGING}/bundle/$1" size
  [ -f "${f}.partial" ] || die "$1: no output"
  size=$(stat -f '%z' "${f}.partial")
  [ "$size" -ge "$2" ] || die "$1: only ${size} bytes"
  age_header_ok "${f}.partial" || die "$1: not an age file for one X25519 recipient"
  mv "${f}.partial" "$f"
  log "ok ${1}: ${size} bytes"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
local_checks

if [ "$DRY_RUN" -eq 1 ]; then
  print_plan
  exit 0
fi

mkdir -p "$STATE_DIR" "$STAGING_PARENT" "$(dirname "$LOG_FILE")"
chmod 700 "$STATE_DIR" "$STAGING_PARENT"
if [ -f "$LOG_FILE" ] && [ "$(stat -f '%z' "$LOG_FILE")" -gt 524288 ]; then
  mv -f "$LOG_FILE" "${LOG_FILE}.1"
fi
touch "$LOG_FILE"; chmod 600 "$LOG_FILE"

log "start (pid $$)"
STAGE_NAME='lock'
# One run at a time: a manual run overlapping the 03:30 one would exceed the
# role's CONNECTION LIMIT 2 and fail both.
if ! mkdir "${STATE_DIR}/run.lock" 2>/dev/null; then
  OTHER=$(cat "${STATE_DIR}/run.lock/pid" 2>/dev/null || true)
  if [ -n "$OTHER" ] && kill -0 "$OTHER" 2>/dev/null; then
    die "another run is in progress (pid ${OTHER})"
  fi
  rm -rf "${STATE_DIR}/run.lock"
  mkdir "${STATE_DIR}/run.lock" || die "cannot take the run lock"
fi
LOCK_DIR="${STATE_DIR}/run.lock"
printf '%s\n' "$$" > "${LOCK_DIR}/pid"
# Truncated only once the lock is ours: a refused second run must not wipe
# the running one's error file.
: > "$ERR_FILE"; chmod 600 "$ERR_FILE"

STAGE_NAME='preflight'
if [ -n "$CONFIG_PROBLEMS" ]; then
  printf '%s' "$CONFIG_PROBLEMS" >> "$ERR_FILE"
  die "local checks failed (listed in last-run.err; run --dry-run to see them)"
fi

AUTH_BLOCK="${STATE_DIR}/auth-failed.$(date +%Y%m%d)"
if [ -f "$AUTH_BLOCK" ]; then
  if [ "$CLEAR_AUTH_BLOCK" -eq 1 ]; then
    rm -f "$AUTH_BLOCK"
    log "auth block for today cleared by operator"
  else
    FAIL_KIND='auth'
    die "authentication failed earlier today; not retrying (pass --clear-auth-block after fixing it)"
  fi
fi

# Every libpq setting comes from the service file; drop anything inherited.
for v in $(compgen -e); do
  case "$v" in PG*) unset "$v" ;; esac
done
export PGSERVICEFILE="$SERVICE_FILE"
export PGAPPNAME='futari-backup'
export PGCONNECT_TIMEOUT=30

STAGE_NAME='tools'
DUMP_VERSION=$("$PG_DUMP" --version | sed -E 's/^pg_dump \(PostgreSQL\) ([0-9]+(\.[0-9]+)?).*/\1/')
[[ "$DUMP_VERSION" =~ ^[0-9]+(\.[0-9]+)?$ ]] || die "cannot read the pg_dump version"
[ "${DUMP_VERSION%%.*}" = "$CFG_PG_MAJOR" ] || die "pg_dump major ${DUMP_VERSION%%.*} is not the pinned ${CFG_PG_MAJOR}"

STAGE_NAME='staging'
# Sweep what an earlier run could not clean up (power loss, kill -9).
find "$STAGING_PARENT" -mindepth 1 -maxdepth 1 -type d -name 'run.*' -exec rm -rf {} + 2>/dev/null || true
STAGING=$(mktemp -d "${STAGING_PARENT}/run.XXXXXX")
chmod 700 "$STAGING"
mkdir "${STAGING}/bundle"

STAGE_NAME='credential'
# The secret passes through a pipe into this shell's memory and out through
# the printf builtin into a 600 file — never argv, never the environment.
PW=$(/usr/bin/security find-generic-password -s "$CFG_KEYCHAIN_SERVICE" -a "$CFG_KEYCHAIN_ACCOUNT" -w 2>>"$ERR_FILE") \
  || die "Keychain item unreadable (locked keychain, missing item, or access denied)"
[ -n "$PW" ] || die "Keychain item is empty"
esc() { local s=${1//\\/\\\\}; printf '%s' "${s//:/\\:}"; }
printf '%s:%s:%s:%s:%s\n' "$(esc "$SVC_HOST")" "$(esc "$SVC_PORT")" "$(esc "$SVC_DB")" "$(esc "$SVC_USER")" "$(esc "$PW")" > "${STAGING}/pgpass"
PW=''
unset PW
chmod 600 "${STAGING}/pgpass"
export PGPASSFILE="${STAGING}/pgpass"

STAGE_NAME='snapshot'
mkfifo "${STAGING}/holder.in"
MANIFEST_OUT="${STAGING}/bundle/manifest.txt.age"
(
  set +e
  "$PSQL" -X -w -q -t -A -F $'\t' -v ON_ERROR_STOP=1 --dbname="service=${CFG_PG_SERVICE}" \
    < "${STAGING}/holder.in" 2>>"$ERR_FILE" \
    | "$AGE" -r "$AGE_RECIPIENT" -o "${MANIFEST_OUT}.partial" 2>>"$ERR_FILE"
  printf '%s %s\n' "${PIPESTATUS[0]}" "${PIPESTATUS[1]}" > "${STAGING}/holder.status"
) &
HOLDER_PID=$!
exec 3>"${STAGING}/holder.in"
HOLDER_FD_OPEN=1

send "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;"
send "\\o '${STAGING}/snapshot.id'"
send "SELECT pg_export_snapshot();"
send "\\o '${STAGING}/server.ver'"
send "SELECT current_setting('server_version_num');"
send "\\o '${STAGING}/ready.a'"
send "SELECT 'ready';"
send "\\o"
wait_for_file "${STAGING}/ready.a" 120 "the snapshot export"

SNAPSHOT=$(head -n 1 "${STAGING}/snapshot.id")
[[ "$SNAPSHOT" =~ ^[0-9A-F]+-[0-9A-F]+(-[0-9]+)?$ ]] || die "unexpected snapshot id format"
SERVER_NUM=$(head -n 1 "${STAGING}/server.ver")
[[ "$SERVER_NUM" =~ ^[0-9]+$ ]] || die "cannot read the server version"
[ $(( SERVER_NUM / 10000 )) = "$CFG_PG_MAJOR" ] \
  || die "server major $(( SERVER_NUM / 10000 )) is not the pinned ${CFG_PG_MAJOR}; install the matching pg_dump and update PG_MAJOR"
log "ok snapshot exported (server major $(( SERVER_NUM / 10000 )), pg_dump ${DUMP_VERSION})"

STAGE_NAME='manifest'
send "\\o '${STAGING}/counts.tsv'"
send "\\i '${COUNTS_SQL}'"
send "\\o"
send "\\i '${MANIFEST_SQL}'"
send "\\qecho '## dump'"
send "\\qecho 'pg_dump_version\\t${DUMP_VERSION}'"
send "\\qecho 'bundle_format\\t1'"
send "\\o '${STAGING}/ready.b'"
send "SELECT 'ready';"
send "\\o"
wait_for_file "${STAGING}/ready.b" 900 "the manifest queries"
TABLES=$(wc -l < "${STAGING}/counts.tsv" | tr -d ' ')
log "ok manifest + counts (${TABLES} tables)"

dump_part() { # name min_bytes pg_dump-args...
  local name=$1 min=$2
  shift 2
  STAGE_NAME="dump-${name%%.*}"
  set +e
  "$PG_DUMP" --dbname="service=${CFG_PG_SERVICE}" -w --snapshot="$SNAPSHOT" \
      --format=custom --lock-wait-timeout=60s "$@" 2>>"$ERR_FILE" \
    | "$AGE" -r "$AGE_RECIPIENT" -o "${STAGING}/bundle/${name}.partial" 2>>"$ERR_FILE"
  local st=("${PIPESTATUS[@]}")
  set -e
  [ "${st[0]}" -eq 0 ] || die_tool "pg_dump exited ${st[0]}"
  [ "${st[1]}" -eq 0 ] || die "age exited ${st[1]}"
  finish_part "$name" "$min"
}

dump_part public.dump.age "$MIN_BYTES_PUBLIC" --schema=public --schema=drizzle
dump_part auth.dump.age "$MIN_BYTES_AUTH" --data-only --table=auth.users --table=auth.identities

STAGE_NAME='snapshot-close'
send "ROLLBACK;"
send "\\q"
exec 3>&-
HOLDER_FD_OPEN=0
wait "$HOLDER_PID" || true
HOLDER_PID=''
read -r HOLDER_PSQL HOLDER_AGE < "${STAGING}/holder.status" || die "snapshot session left no status"
[ "$HOLDER_PSQL" = '0' ] || die_tool "snapshot session psql exited ${HOLDER_PSQL}"
[ "$HOLDER_AGE" = '0' ] || die "manifest age exited ${HOLDER_AGE}"
finish_part manifest.txt.age "$MIN_BYTES_MANIFEST"

STAGE_NAME='sanity'
COUNTS="${STAGING}/counts.tsv"
PREV="${STATE_DIR}/counts.prev"
for core in 'auth.users' 'public.Profiles'; do
  c=$(awk -F'\t' -v t="$core" '$1 == t { print $2 }' "$COUNTS")
  [ -n "$c" ] && [ "$c" -gt 0 ] || die "core table ${core} reports ${c:-no count}"
done
if [ -f "$PREV" ] && [ "$ACCEPT_COUNTS" -eq 0 ]; then
  PROBLEMS=$(awk -F'\t' -v min="$SANITY_MIN_PREV" '
    NR == FNR { prev[$1] = $2; next }
    { cur[$1] = $2 }
    END {
      for (t in prev) {
        if (prev[t] < min) continue
        if (!(t in cur)) { print "gone " t; continue }
        if (cur[t] == 0) { print "zero " t; continue }
        if (cur[t] * 2 < prev[t]) print "halved " t
      }
    }' "$PREV" "$COUNTS")
  if [ -n "$PROBLEMS" ]; then
    printf '%s\n' "$PROBLEMS" | while IFS= read -r p; do log "sanity: ${p}"; done
    die "row counts dropped sharply since the last run (if intended, re-run with --accept-counts)"
  fi
  log "ok sanity vs last run"
elif [ "$ACCEPT_COUNTS" -eq 1 ]; then
  log "sanity drop checks skipped by --accept-counts"
else
  log "ok sanity (first run: core tables only)"
fi

STAGE_NAME='upload'
BUNDLE="${CFG_BUNDLE_PREFIX}-$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${CFG_RCLONE_DEST%/}/${BUNDLE}"
"$RCLONE" copy --immutable "${STAGING}/bundle" "$DEST" 2>>"$ERR_FILE" || die_tool "rclone copy failed"

STAGE_NAME='verify'
REMOTE_MD5=$("$RCLONE" md5sum "$DEST" 2>>"$ERR_FILE") || die_tool "rclone md5sum failed"
REMOTE_SIZES=$("$RCLONE" lsf --format sp --separator $'\t' "$DEST" 2>>"$ERR_FILE") || die_tool "rclone lsf failed"
[ "$(printf '%s\n' "$REMOTE_SIZES" | grep -c .)" = '3' ] || die "remote bundle does not hold exactly 3 files"
for part in public.dump.age auth.dump.age manifest.txt.age; do
  lsize=$(stat -f '%z' "${STAGING}/bundle/${part}")
  lmd5=$(md5 -q "${STAGING}/bundle/${part}")
  rsize=$(printf '%s\n' "$REMOTE_SIZES" | awk -F'\t' -v f="$part" '$2 == f { print $1 }')
  rmd5=$(printf '%s\n' "$REMOTE_MD5" | awk -v f="$part" '$2 == f { print $1 }')
  [ "$rsize" = "$lsize" ] || die "${part}: remote size differs"
  [ "$rmd5" = "$lmd5" ] || die "${part}: remote md5 differs"
done
log "ok uploaded and verified ${BUNDLE}"

printf '%s %s\n' "$BUNDLE" "$(ts)" | "$RCLONE" rcat "${CFG_RCLONE_DEST%/}/LAST_OK" 2>>"$ERR_FILE" \
  || die_tool "could not write LAST_OK"
# One command per line: under set -e a failure inside an && chain is ignored,
# and a stale baseline would let the next run compare against old counts.
cp "$COUNTS" "${PREV}.new" || die "could not stage the count baseline"
chmod 600 "${PREV}.new" || die "could not stage the count baseline"
mv -f "${PREV}.new" "$PREV" || die "could not update the count baseline"
printf '%s %s\n' "$BUNDLE" "$(ts)" > "${STATE_DIR}/LAST_OK"

STAGE_NAME='prune'
LISTING=$("$RCLONE" lsf --dirs-only "${CFG_RCLONE_DEST%/}" 2>>"$ERR_FILE") || die_tool "rclone lsf (prune) failed"
BUNDLES=$(printf '%s\n' "$LISTING" | sed -n -E "s#^(${CFG_BUNDLE_PREFIX}-[0-9]{8}T[0-9]{6}Z)/\$#\\1#p" | sort)
printf '%s\n' "$BUNDLES" | grep -qx "$BUNDLE" || die "today's bundle missing from the listing; not pruning"
TOTAL=$(printf '%s\n' "$BUNDLES" | grep -c .)
CUTOFF="${CFG_BUNDLE_PREFIX}-$(date -u -v-"${KEEP_DAYS}"d +%Y%m%dT%H%M%SZ)"
REMAINING=$TOTAL
PRUNED=0
for b in $BUNDLES; do
  [ "$REMAINING" -gt "$KEEP_NEWEST" ] || break
  [ $((REMAINING - 1)) -ge "$KEEP_MIN" ] || break
  # Names sort chronologically; anything not older than the cutoff stays.
  [[ "$b" < "$CUTOFF" ]] || break
  "$RCLONE" purge "${CFG_RCLONE_DEST%/}/${b}" 2>>"$ERR_FILE" || die_tool "rclone purge failed"
  REMAINING=$((REMAINING - 1))
  PRUNED=$((PRUNED + 1))
done
log "ok prune: ${TOTAL} bundles, ${PRUNED} moved to Drive trash, ${REMAINING} kept"

STAGE_NAME='done'
log "done ${BUNDLE}"
