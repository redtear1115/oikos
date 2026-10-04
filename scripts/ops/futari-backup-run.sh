#!/bin/bash
# #1549 — launchd entry point for the nightly backup. Installed next to
# backup-prod.sh in ~/.local/libexec/futari-backup/ by scripts/ops/install-backup.sh.
#
# Checks every installed file against the SHA256SUMS the installer recorded,
# then runs backup-prod.sh. A mismatch means the installed copy is no longer
# the reviewed one: it does not run, it notifies.
#
# What this protects against, honestly: an accidental edit, a half-finished
# re-install, a copy from an unreviewed checkout. It does NOT stop a process
# running as you — that process can rewrite SHA256SUMS too (ops-runbook
# §「Prod backup (futari_backup)」, 擋得住／擋不住).
#   Failure look: a FAILED notification and the Desktop marker with stage
#   "checksum"; nothing was contacted. Re-run the installer from the reviewed
#   tag.

set -euo pipefail
umask 077

DIR="$(cd "$(dirname "$0")" && pwd)"
MARKER="${HOME}/Desktop/FUTARI-BACKUP-FAILED.txt"
LOG_FILE="${HOME}/Library/Logs/futari-backup.log"

cd "$DIR"
if ! /usr/bin/shasum -a 256 --status -c SHA256SUMS 2>/dev/null; then
  printf '%s FAILED stage=checksum: installed files differ from SHA256SUMS; not running\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG_FILE"
  /usr/bin/osascript -e 'display notification "Futari backup FAILED at stage checksum. Re-install from the reviewed tag." with title "Futari backup"' >/dev/null 2>&1 || true
  printf 'Futari backup failed\ntime: %s\nstage: checksum\nRe-run scripts/ops/install-backup.sh from the reviewed tag.\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$MARKER"
  exit 1
fi

exec /bin/bash "${DIR}/backup-prod.sh" "$@"
