#!/bin/bash
# #1549 — install the reviewed backup scripts for launchd. Run by the owner,
# from a clean checkout of a release tag:
#
#   git checkout vX.Y.Z
#   scripts/ops/install-backup.sh --recipient <age public key>
#
#   --recipient       the age PUBLIC key (age1…) printed by `age-keygen` when
#                     the backup identity was made. Pinned into the installed
#                     backup-prod.sh; never read from config at run time.
#   --allow-untagged  dev rehearsal only (plan S2): install from a commit that
#                     is not a tag. The tree must still be clean.
#
# What it does:
#   - copies backup-prod.sh (recipient substituted), futari-backup-run.sh and
#     the two manifest SQL files to ~/.local/libexec/futari-backup/ (700; files
#     read-only);
#   - records their SHA-256 in SHA256SUMS there, which futari-backup-run.sh
#     checks before every run;
#   - writes the LaunchAgent plist from scripts/ops/launchd/ to
#     ~/Library/LaunchAgents/local.futari.backup.plist.
# It does NOT load the LaunchAgent, read the Keychain, or contact anything.
# Loading is the owner's step (ops-runbook §「Prod backup (futari_backup)」).
#
# Re-running replaces the installed copy (e.g. after a reviewed change).
#   Failure look if the installed copy is edited by hand afterwards: the next
#   run stops at stage "checksum" with a FAILED notification.

set -euo pipefail
umask 077

RECIPIENT=''
ALLOW_UNTAGGED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --recipient) RECIPIENT=${2:-}; shift 2 ;;
    --allow-untagged) ALLOW_UNTAGGED=1; shift ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

# bech32 alphabet: an age X25519 recipient is "age1" + 58 characters.
if [[ ! "$RECIPIENT" =~ ^age1[02-9ac-hj-np-z]{58}$ ]]; then
  printf 'need --recipient age1… (the PUBLIC key; never the AGE-SECRET-KEY line)\n' >&2
  exit 2
fi

SRC="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "${SRC}/../.." && pwd)"
DEST="${HOME}/.local/libexec/futari-backup"
AGENTS="${HOME}/Library/LaunchAgents"
PLIST="${AGENTS}/local.futari.backup.plist"
LAUNCHD_LOG="${HOME}/Library/Logs/futari-backup.launchd.log"
PLACEHOLDER='__FUTARI_BACKUP_AGE_RECIPIENT__'
FILES='backup-prod.sh futari-backup-run.sh futari-backup-counts.sql futari-backup-manifest.sql'

cd "$REPO"
if [ -n "$(git status --porcelain -- scripts/ops)" ]; then
  printf 'scripts/ops has uncommitted changes; install only what was reviewed\n' >&2
  exit 1
fi
if TAG=$(git describe --exact-match --tags HEAD 2>/dev/null); then
  :
elif [ "$ALLOW_UNTAGGED" -eq 1 ]; then
  TAG="untagged $(git rev-parse --short HEAD)"
else
  printf 'HEAD is not a tag; check out the reviewed release tag (or --allow-untagged for the dev rehearsal)\n' >&2
  exit 1
fi

case "${DEST}${LAUNCHD_LOG}" in
  *[\&\<\>\'\"]*) printf 'home path contains characters the plist / psql quoting cannot carry\n' >&2; exit 1 ;;
esac

[ "$(grep -c "$PLACEHOLDER" "${SRC}/backup-prod.sh")" = '1' ] \
  || { printf 'backup-prod.sh does not hold exactly one recipient placeholder\n' >&2; exit 1; }

mkdir -p "$DEST" "$AGENTS"
chmod 700 "$DEST"
for f in $FILES; do
  rm -f "${DEST}/${f}"
done
rm -f "${DEST}/SHA256SUMS"

sed "s/${PLACEHOLDER}/${RECIPIENT}/" "${SRC}/backup-prod.sh" > "${DEST}/backup-prod.sh"
cp "${SRC}/futari-backup-run.sh" "${SRC}/futari-backup-counts.sql" "${SRC}/futari-backup-manifest.sql" "$DEST/"

grep -q "$PLACEHOLDER" "${DEST}/backup-prod.sh" && { printf 'recipient substitution failed\n' >&2; exit 1; }
[ "$(grep -c "^readonly AGE_RECIPIENT='${RECIPIENT}'\$" "${DEST}/backup-prod.sh")" = '1' ] \
  || { printf 'recipient line not found after substitution\n' >&2; exit 1; }

chmod 500 "${DEST}/backup-prod.sh" "${DEST}/futari-backup-run.sh"
chmod 400 "${DEST}/futari-backup-counts.sql" "${DEST}/futari-backup-manifest.sql"
(cd "$DEST" && /usr/bin/shasum -a 256 $FILES > SHA256SUMS)
chmod 400 "${DEST}/SHA256SUMS"

sed -e "s#__RUN_SCRIPT__#${DEST}/futari-backup-run.sh#g" \
    -e "s#__LAUNCHD_LOG__#${LAUNCHD_LOG}#g" \
    "${SRC}/launchd/futari-backup.plist.template" > "${PLIST}.new"
grep -q '__[A-Z_]*__' "${PLIST}.new" && { rm -f "${PLIST}.new"; printf 'plist placeholders left\n' >&2; exit 1; }
chmod 644 "${PLIST}.new"
mv -f "${PLIST}.new" "$PLIST"
/usr/bin/plutil -lint "$PLIST" >/dev/null

printf 'installed from %s into %s\n' "$TAG" "$DEST"
printf 'recipient pinned: %s\n' "$RECIPIENT"
printf 'SHA256SUMS:\n'
sed 's/^/  /' "${DEST}/SHA256SUMS"
printf '\nplist written (not loaded): %s\n' "$PLIST"
printf 'next (owner): try a manual run first —\n  /bin/bash %s/futari-backup-run.sh --dry-run\n' "$DEST"
printf 'then load it:\n  launchctl bootstrap gui/$(id -u) %s\n' "$PLIST"
