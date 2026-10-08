#!/bin/bash
# #1549 — monthly restore drill: decrypt a backup bundle and restore it into a
# throwaway LOCAL Supabase stack, then compare the result with the manifest.
# Run by the owner in their own terminal. Never paste its output into an agent
# session, an issue or a PR (ops-runbook §「Prod backup (futari_backup)」, 演練).
#
#   scripts/ops/backup-restore-drill.sh --bundle <dir> --identity <key.age>
#   scripts/ops/backup-restore-drill.sh --bundle <dir> --identity-paper
#
#   --bundle <dir>      a downloaded bundle (bundle_format 2): public.dump.age,
#                       auth-users.copy.age, auth-identities.copy.age,
#                       manifest.txt.age (`rclone copy <remote>/<bundle> <dir>`)
#   --identity <file>   the passphrase-protected age identity (key.age) on the
#                       mounted "Futari Backup Key" image; age asks for the
#                       passphrase once
#   --identity-paper    type the AGE-SECRET-KEY-1… line from the offsite paper
#                       copy (hidden input). The FIRST prod drill uses this.
#   --port <n>          local stack database port (default 54322)
#
# Target: 127.0.0.1 only, user postgres, a fresh `supabase start` stack whose
# public schema has no tables (`supabase stop --no-backup` throws it away).
# The script refuses any other host and any non-empty target.
#
# Restore order (identical to a real restore, except step 6):
#   1. global roles futari_app / futari_backup, NOLOGIN, same attributes as
#      0072 / 0081;
#   2. default privileges for postgres in public: revoke everything from anon,
#      authenticated and service_role, so new objects start closed and the
#      dump's own GRANT / REVOKE decide. pg_dump writes grants relative to the
#      built-in default (owner + PUBLIC), never relative to pg_default_acl, so
#      any role left in the target's defaults gets a grant the source never
#      had. Failure look with service_role left in: "function ACLs 4
#      difference(s)" (frozen_copy_visible, viewer_in_chapter, whose source
#      ACL has no service_role) — first dev drill, 2026-10-06;
#   3. pre-data → re-apply drizzle/0082 (backup_auth views; the restored
#      journal lists 0082, so db:migrate would skip it) → data → auth data
#      (users, then identities) → post-data. Auth parts are DATA ONLY: each is
#      loaded with `\copy … FROM STDIN` into a staging table (r jsonb) and
#      inserted from there with jsonb_populate_record. Bundle content is never
#      run as a psql script;
#   4. re-apply db/triggers/handle_new_user.sql (lives outside the migrations);
#   5. re-add tables to publication supabase_realtime from the manifest;
#   6. cron: compare only — creates no job and loads no Vault secret. A real
#      restore recreates both (runbook).
# Then compares counts, ACLs and encrypted-key counts with the manifest, and
# checks that anon / authenticated cannot read any *_encrypted column.
#
# Output: counts, error counts and object names only. Raw tool stderr goes to
# a 600 file under ~/Library/Caches/futari-backup-drill/. Decrypted data only
# ever flows through pipes into pg_restore or psql's \copy (as data, never as
# commands); auth rows sit in a staging schema of the local stack until they
# are inserted, then the schema is dropped. The manifest is held in memory.

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MANIFEST_SQL="${SCRIPT_DIR}/futari-backup-manifest.sql"
TRIGGER_SQL="${REPO}/db/triggers/handle_new_user.sql"
BACKUP_AUTH_SQL="${REPO}/drizzle/0082_backup_auth_views.sql"
CONF_FILE="${HOME}/.config/futari-backup/config"
DRILL_DIR="${HOME}/Library/Caches/futari-backup-drill"

BUNDLE=''
IDENTITY_FILE=''
IDENTITY_PAPER=0
PORT='54322'
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle) BUNDLE=${2:-}; shift 2 ;;
    --identity) IDENTITY_FILE=${2:-}; shift 2 ;;
    --identity-paper) IDENTITY_PAPER=1; shift ;;
    --port) PORT=${2:-}; shift 2 ;;
    -h|--help) sed -n '2,47p' "$0"; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

fail() { printf 'DRILL STOPPED: %s\n' "$1" >&2; exit 1; }

[ -n "$BUNDLE" ] && [ -d "$BUNDLE" ] || fail "--bundle <dir> is required"
if [ -n "$IDENTITY_FILE" ] && [ "$IDENTITY_PAPER" -eq 1 ]; then fail "pick one of --identity / --identity-paper"; fi
if [ -z "$IDENTITY_FILE" ] && [ "$IDENTITY_PAPER" -eq 0 ]; then fail "need --identity <key.age> or --identity-paper"; fi
[[ "$PORT" =~ ^[0-9]+$ ]] || fail "--port must be a number"

# Tool paths: the same config keys the backup uses (only these are read).
PG_BIN_DIR='/opt/homebrew/opt/postgresql@17/bin'
PG_MAJOR='17'
AGE_BIN='/opt/homebrew/bin/age'
if [ -f "$CONF_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      PG_BIN_DIR=*) PG_BIN_DIR=${line#*=} ;;
      PG_MAJOR=*) PG_MAJOR=${line#*=} ;;
      AGE_BIN=*) AGE_BIN=${line#*=} ;;
    esac
  done < "$CONF_FILE"
fi
PSQL="${PG_BIN_DIR}/psql"
PG_RESTORE="${PG_BIN_DIR}/pg_restore"
for t in "$PSQL" "$PG_RESTORE" "$AGE_BIN"; do [ -x "$t" ] || fail "tool not found: ${t}"; done
for t in "$MANIFEST_SQL" "$TRIGGER_SQL" "$BACKUP_AUTH_SQL"; do [ -f "$t" ] || fail "missing: ${t}"; done
for part in public.dump.age auth-users.copy.age auth-identities.copy.age manifest.txt.age; do
  [ -f "${BUNDLE}/${part}" ] || fail "bundle has no ${part}"
  [ "$(head -n 1 "${BUNDLE}/${part}" | LC_ALL=C tr -d '\r')" = 'age-encryption.org/v1' ] || fail "${part} is not an age file"
done

mkdir -p "$DRILL_DIR"
chmod 700 "$DRILL_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ERR="${DRILL_DIR}/drill-${STAMP}.err"
: > "$ERR"
chmod 600 "$ERR"
TMP=$(mktemp -d "${DRILL_DIR}/tmp.XXXXXX")
chmod 700 "$TMP"
IDENT=''
cleanup() {
  IDENT=''
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

# Local target only. Every inherited libpq setting is dropped first so nothing
# can point this script at a remote database.
for v in $(compgen -e); do
  case "$v" in PG*) unset "$v" ;; esac
done
export PGHOST='127.0.0.1'
export PGPORT="$PORT"
export PGUSER='postgres'
export PGDATABASE='postgres'
export PGAPPNAME='futari-drill'
export PGPASSFILE="${TMP}/pgpass"
# `supabase start` gives its local database the fixed, published development
# value below. It is not a secret and only opens 127.0.0.1.
LOCAL_STACK_DEFAULT='postgres'
printf '127.0.0.1:%s:*:postgres:%s\n' "$PORT" "$LOCAL_STACK_DEFAULT" > "$PGPASSFILE"
chmod 600 "$PGPASSFILE"

q() { "$PSQL" -X -w -q -t -A -v ON_ERROR_STOP=1 -c "$1" 2>>"$ERR"; }
# SQL with psql variables (-v name=value) goes in on stdin: psql interpolates
# :'name' there (quoted, so values from the manifest stay literals), not in -c.
qv() { local sql=$1; shift; printf '%s\n' "$sql" | "$PSQL" -X -w -q -t -A -v ON_ERROR_STOP=1 "$@" 2>>"$ERR"; }

printf 'Futari restore drill %s\n' "$STAMP"
printf 'raw stderr: %s\n\n' "$ERR"

SERVER_NUM=$(q "SELECT current_setting('server_version_num')") || fail "cannot reach the local stack on 127.0.0.1:${PORT} (is \`supabase start\` running?)"
[ $(( SERVER_NUM / 10000 )) = "$PG_MAJOR" ] || fail "local server major $(( SERVER_NUM / 10000 )) is not ${PG_MAJOR}"
RESTORE_MAJOR=$("$PG_RESTORE" --version | sed -E 's/^pg_restore \(PostgreSQL\) ([0-9]+).*/\1/')
[ "$RESTORE_MAJOR" = "$PG_MAJOR" ] || fail "pg_restore major ${RESTORE_MAJOR} is not ${PG_MAJOR}"
SHAPE=$(q "SELECT (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated')) || ' ' || (SELECT count(*) FROM pg_namespace WHERE nspname = 'auth') || ' ' || (SELECT count(*) FROM pg_publication WHERE pubname = 'supabase_realtime')")
[ "$SHAPE" = '2 1 1' ] || fail "target is not a Supabase-shaped stack (roles / auth schema / realtime publication missing)"
USER_TABLES=$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p')")
[ "$USER_TABLES" = '0' ] || fail "target already has ${USER_TABLES} tables in public/drizzle; use a fresh stack (supabase stop --no-backup; supabase start)"
printf 'target: local stack, server major %s, empty — ok\n' "$(( SERVER_NUM / 10000 ))"

# Identity: decrypted once into this shell's memory; handed to each age call
# through a pipe (process substitution), never written to disk.
if [ "$IDENTITY_PAPER" -eq 1 ]; then
  printf 'Type the AGE-SECRET-KEY-1… line from the paper copy (input hidden): ' > /dev/tty
  IFS= read -r -s IDENT < /dev/tty
  printf '\n' > /dev/tty
  IDENT=$(printf '%s' "$IDENT" | tr -d ' ' | tr '[:lower:]' '[:upper:]')
  [[ "$IDENT" =~ ^AGE-SECRET-KEY-1[0-9A-Z]{58}$ ]] || fail "that is not an AGE-SECRET-KEY-1 line (check for typos)"
else
  [ -f "$IDENTITY_FILE" ] || fail "identity file not found"
  IDENT=$("$AGE_BIN" -d "$IDENTITY_FILE") || fail "could not unlock the identity file"
  printf '%s\n' "$IDENT" | grep -q '^AGE-SECRET-KEY-1' || fail "identity file holds no AGE-SECRET-KEY"
fi

decrypt() { "$AGE_BIN" -d -i <(printf '%s\n' "$IDENT") "$1"; }

MANIFEST=$(decrypt "${BUNDLE}/manifest.txt.age" 2>>"$ERR") || fail "cannot decrypt the manifest with this identity"
section() { printf '%s\n' "$1" | awk -v s="## $2" '$0 == s { f = 1; next } /^## / { f = 0 } f && NF'; }
# Format 1 (auth as a pg_dump archive) was never produced by a real run; only
# format 2's data-only parts are restored by this script.
BUNDLE_FORMAT=$(section "$MANIFEST" dump | awk -F'\t' '$1 == "bundle_format" { print $2 }')
[ "$BUNDLE_FORMAT" = '2' ] || fail "bundle_format is '${BUNDLE_FORMAT:-missing}', this drill restores format 2 only"
printf 'manifest: taken_at %s, %s tables\n' \
  "$(section "$MANIFEST" meta | awk -F'\t' '$1 == "taken_at" { print $2 }')" \
  "$(section "$MANIFEST" row_counts | grep -c . || true)"

step() { printf '%s\n' "== $1" >> "$ERR"; printf '%s\n' "$1"; }

step '1. global roles (NOLOGIN)'
for role in futari_app futari_backup; do
  qv "SELECT format('CREATE ROLE %I WITH NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOINHERIT BYPASSRLS', :'role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role')
\\gexec" -v role="$role" >/dev/null || fail "creating role ${role} failed"
done

step '2. default privileges: start closed for the API roles'
q "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role" >/dev/null || fail "default privileges (tables)"
q "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role" >/dev/null || fail "default privileges (sequences)"
q "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role" >/dev/null || fail "default privileges (functions)"

restore_pass() { # label file pg_restore-args...
  local label=$1 file=$2
  shift 2
  step "3. restore ${label}"
  set +e
  # pg_restore stops reading stdin once its section is done (pre-data and
  # post-data never reach the end of the archive), so age would die of
  # SIGPIPE (141) on a perfectly good file. Drain the rest: age then always
  # reads, authenticates and exits on the whole file, and its status means
  # "decrypted" again.
  #   Failure look without the drain: "DRILL STOPPED: age could not decrypt
  #   public.dump.age" right after "3. restore pre-data", with an empty .err
  #   (found in the first dev drill, 2026-10-06).
  # LC_MESSAGES=C: the error count below greps pg_restore's English text; a
  # localized pg_restore ("pg_restore: 錯誤:") counted 0 errors.
  decrypt "$file" 2>>"$ERR" | { LC_MESSAGES=C "$PG_RESTORE" -w --dbname=postgres "$@" 2>>"$ERR"; rc=$?; cat >/dev/null; exit "$rc"; }
  local st=("${PIPESTATUS[@]}")
  set -e
  [ "${st[0]}" -eq 0 ] || fail "age could not decrypt ${file##*/}"
  printf '   pg_restore exit %s\n' "${st[1]}"
}
# Auth rows: data only, through a staging table. psql gets its command from
# -c and the decrypted part on stdin, read by \copy as data — a line in the
# part can never run as a psql command (`\!` included). After the \copy psql
# exits; nothing else is read from stdin. The INSERT then takes only target
# columns that are not generated and appear as keys in the data, with names
# checked against ^[a-z_][a-z0-9_]*$ and quoted by format('%I').
#   Failure look: a part that is not one JSON object per line stops the drill
#   at the \copy (invalid input syntax for type json) or at the object check;
#   a short load stops it at the row count check — never a partial success.
STAGE_SCHEMA='futari_restore_staging'
restore_auth() { # table
  local t=$1
  [[ "$t" =~ ^(users|identities)$ ]] || fail "unexpected auth table ${t}"
  step "3. restore auth.${t} (data only: staged \\copy)"
  q "CREATE TABLE ${STAGE_SCHEMA}.${t} (r jsonb NOT NULL)" >/dev/null || fail "creating the staging table for ${t} failed"
  set +e
  decrypt "${BUNDLE}/auth-${t}.copy.age" 2>>"$ERR" \
    | "$PSQL" -X -w -q -v ON_ERROR_STOP=1 -c "SET client_encoding = 'UTF8'" -c "\\copy ${STAGE_SCHEMA}.${t} (r) FROM STDIN" >/dev/null 2>>"$ERR"
  local st=("${PIPESTATUS[@]}")
  set -e
  [ "${st[0]}" -eq 0 ] || fail "age could not decrypt auth-${t}.copy.age"
  [ "${st[1]}" -eq 0 ] || fail "loading auth-${t}.copy.age into staging failed (psql exit ${st[1]})"
  q "DO \$restore\$
DECLARE
  cols text[];
  bad text;
  n_stage bigint;
  n_ins bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM ${STAGE_SCHEMA}.${t} WHERE jsonb_typeof(r) <> 'object') THEN
    RAISE EXCEPTION 'auth.${t}: a staged line is not a JSON object';
  END IF;
  SELECT count(*) INTO n_stage FROM ${STAGE_SCHEMA}.${t};
  SELECT array_agg(a.attname::text ORDER BY a.attnum) INTO cols
    FROM pg_attribute a
   WHERE a.attrelid = 'auth.${t}'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
     AND a.attname::text IN (SELECT DISTINCT jsonb_object_keys(r) FROM ${STAGE_SCHEMA}.${t});
  IF n_stage = 0 THEN
    RETURN;
  END IF;
  IF cols IS NULL THEN
    RAISE EXCEPTION 'auth.${t}: no staged key matches a column';
  END IF;
  SELECT string_agg(c, ' ') INTO bad FROM unnest(cols) c WHERE c !~ '^[a-z_][a-z0-9_]*\$';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'auth.${t}: unexpected column name(s): %', bad;
  END IF;
  EXECUTE format('INSERT INTO auth.%I (%s) SELECT %s FROM %I.%I s CROSS JOIN LATERAL jsonb_populate_record(NULL::auth.%I, s.r) x',
    '${t}',
    (SELECT string_agg(format('%I', c), ', ') FROM unnest(cols) c),
    (SELECT string_agg(format('x.%I', c), ', ') FROM unnest(cols) c),
    '${STAGE_SCHEMA}', '${t}', '${t}');
  GET DIAGNOSTICS n_ins = ROW_COUNT;
  IF n_ins <> n_stage THEN
    RAISE EXCEPTION 'auth.${t}: inserted % of % staged rows', n_ins, n_stage;
  END IF;
END
\$restore\$" >/dev/null || fail "inserting auth.${t} from staging failed"
  # Keys in the backup that this stack has no (non-generated) column for —
  # generated columns are expected here; anything else is data the target
  # version drops. Column names only, never values.
  printf '   rows %s; keys not restored: %s\n' \
    "$(q "SELECT count(*) FROM ${STAGE_SCHEMA}.${t}")" \
    "$(q "SELECT coalesce(string_agg(k, ' ' ORDER BY k), 'none') FROM (SELECT DISTINCT jsonb_object_keys(r) AS k FROM ${STAGE_SCHEMA}.${t}) d WHERE k NOT IN (SELECT attname::text FROM pg_attribute WHERE attrelid = 'auth.${t}'::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = '')")"
}

restore_pass pre-data "${BUNDLE}/public.dump.age" --section=pre-data
step '3. re-apply drizzle/0082_backup_auth_views.sql (backup_auth views)'
"$PSQL" -X -w -q -v ON_ERROR_STOP=1 -f "$BACKUP_AUTH_SQL" >/dev/null 2>>"$ERR" || fail "0082 re-apply failed (see the ACL check message in the .err file)"
restore_pass data "${BUNDLE}/public.dump.age" --section=data
q "CREATE SCHEMA ${STAGE_SCHEMA}; REVOKE ALL ON SCHEMA ${STAGE_SCHEMA} FROM PUBLIC" >/dev/null || fail "creating the staging schema failed (left over from an earlier run?)"
restore_auth users
restore_auth identities
q "DROP SCHEMA ${STAGE_SCHEMA} CASCADE" >/dev/null || fail "dropping the staging schema failed"
restore_pass post-data "${BUNDLE}/public.dump.age" --section=post-data

step '4. re-apply db/triggers/handle_new_user.sql'
"$PSQL" -X -w -q -v ON_ERROR_STOP=1 -f "$TRIGGER_SQL" >/dev/null 2>>"$ERR" || fail "trigger re-apply failed"

step '5. publication supabase_realtime from the manifest'
PUB_ADDED=0; PUB_PRESENT=0; PUB_MANUAL=0
while IFS= read -r line; do
  # cut, not read with a tab IFS: tabs are IFS whitespace, so an empty column
  # list would collapse and shift the row filter into its place.
  schema=$(printf '%s\n' "$line" | cut -f1)
  table=$(printf '%s\n' "$line" | cut -f2)
  cols=$(printf '%s\n' "$line" | cut -f3)
  rowfilter=$(printf '%s\n' "$line" | cut -f4)
  [ -n "$table" ] || continue
  if [ -n "$rowfilter" ]; then
    printf '   needs a manual step (row filter): %s.%s\n' "$schema" "$table"
    PUB_MANUAL=$((PUB_MANUAL + 1)); continue
  fi
  present=$(qv "SELECT count(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = :'s' AND tablename = :'t';" \
    -v s="$schema" -v t="$table") || fail "publication check failed"
  if [ "$present" = '1' ]; then PUB_PRESENT=$((PUB_PRESENT + 1)); continue; fi
  qv "SELECT format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I%s', :'s', :'t',
  CASE WHEN :'c' = '' THEN ''
       ELSE ' (' || (SELECT string_agg(quote_ident(x), ', ') FROM unnest(string_to_array(:'c', ',')) x) || ')' END)
\\gexec" -v s="$schema" -v t="$table" -v c="$cols" >/dev/null || fail "adding ${schema}.${table} to the publication failed"
  PUB_ADDED=$((PUB_ADDED + 1))
done < <(section "$MANIFEST" publication)
printf '   added %s, already present %s, manual %s\n' "$PUB_ADDED" "$PUB_PRESENT" "$PUB_MANUAL"

step '6. cron: compare only (nothing scheduled, no Vault secret loaded)'
MANIFEST_JOBS=$(section "$MANIFEST" cron | cut -f1)
printf '   backup has %s job(s): %s\n' "$(printf '%s\n' "$MANIFEST_JOBS" | grep -c . || true)" "$(printf '%s' "$MANIFEST_JOBS" | tr '\n' ' ')"
HAS_CRON=$(q "SELECT count(*) FROM pg_extension WHERE extname = 'pg_cron'")
ACTIVE_JOBS=0
if [ "$HAS_CRON" = '1' ]; then
  ACTIVE_JOBS=$(q "SELECT count(*) FROM cron.job WHERE active") || fail "cannot read local cron.job"
  printf '   local active jobs: %s (must be 0)\n' "$ACTIVE_JOBS"
else
  printf '   local stack has no pg_cron: 0 jobs\n'
fi

step '7. compare with the manifest'
LOCAL=$("$PSQL" -X -w -q -f "$MANIFEST_SQL" 2>>"$ERR" || true)
DIFFS=0
compare() { # section label fields-to-print
  local name=$1 label=$2 fields=$3 out n
  out=$(diff <(section "$MANIFEST" "$name" | LC_ALL=C sort) <(section "$LOCAL" "$name" | LC_ALL=C sort) | grep '^[<>]' || true)
  n=$(printf '%s\n' "$out" | grep -c . || true)
  printf '   %-16s %s difference(s)\n' "$label" "$n"
  if [ "$n" -gt 0 ]; then
    printf '%s\n' "$out" | sed -e 's/^</    backup  /' -e 's/^>/    restored/' | cut -f"$fields"
    DIFFS=$((DIFFS + n))
  fi
}
compare row_counts 'row counts' '1-2'
compare encrypted_kids 'encrypted kids' '1-3'
compare relacl 'table ACLs' '1-2'
compare column_acl 'column ACLs' '1-3'
compare function_acl 'function ACLs' '1'
compare publication 'publication' '1-2'
compare auth_triggers 'auth triggers' '1-2'
printf '   informational (not part of the verdict):\n'
# diff exits 1 whenever the lists differ, which under pipefail + set -e
# ended the drill right here.
#   Failure look: output stops after "informational (not part of the
#   verdict):" with no DRILL line (first dev drill: the backup has pg_cron /
#   pg_net, the local stack doesn't).
EXT_MISSING=$({ diff <(section "$MANIFEST" extensions | cut -f1 | sort) <(section "$LOCAL" extensions | cut -f1 | sort) || true; } | sed -n 's/^< //p' | tr '\n' ' ')
printf '     extensions in the backup but not local: %s\n' "${EXT_MISSING:-none}"
DEFACL=$(diff <(section "$MANIFEST" default_acl | sort) <(section "$LOCAL" default_acl | sort) | grep -c '^[<>]' || true)
printf '     default ACL lines differing: %s\n' "$DEFACL"

step '8. encrypted columns closed to anon / authenticated'
OPEN_COLS=$(q "SELECT coalesce(string_agg(c.relname || '.' || a.attname, ' '), '') FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped AND a.attname LIKE '%\_encrypted' AND (has_column_privilege('anon', c.oid, a.attnum, 'SELECT') OR has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT'))") || fail "privilege check failed"
printf '   readable *_encrypted columns: %s\n' "${OPEN_COLS:-none}"

IDENT=''

ERRORS=$(grep -c '^pg_restore: error:' "$ERR" || true)
ROLE_MISSING=$(grep -c -E 'role "[^"]+" does not exist' "$ERR" || true)
printf '\nrestore errors: %s total, %s "role does not exist"\n' "$ERRORS" "$ROLE_MISSING"
if [ "$ERRORS" -gt 0 ]; then
  printf 'objects with errors (type name owner):\n'
  sed -n -E 's/^pg_restore: from TOC entry [0-9]+; [0-9]+ [0-9]+ (.*)$/  \1/p' "$ERR" | LC_ALL=C sort | uniq -c
fi
printf '\noptional: reencrypt-pii dry-run against this local copy with the k2 keyring expects 0 preflight failures (runbook).\n'

VERDICT=PASS
[ "$ROLE_MISSING" = '0' ] || VERDICT=FAIL
[ "$DIFFS" = '0' ] || VERDICT=FAIL
[ "$ACTIVE_JOBS" = '0' ] || VERDICT=FAIL
[ -z "$OPEN_COLS" ] || VERDICT=FAIL
printf '\nDRILL %s\n' "$VERDICT"
[ "$VERDICT" = PASS ]
