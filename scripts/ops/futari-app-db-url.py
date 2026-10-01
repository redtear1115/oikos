#!/usr/bin/env python3
"""#1467 — 啟用步驟 8: build the futari_app DATABASE_URL from
<secrets-dir>/pg_service.conf + .pgpass. Run by the user, never by an agent
(ops-runbook §「Runtime DB role (futari_app)」).

  python3 scripts/ops/futari-app-db-url.py "<secrets-dir>" dev             # rewrite .env.local in place
  python3 scripts/ops/futari-app-db-url.py "<secrets-dir>" dev --rollback  # restore the postgres URL
  python3 scripts/ops/futari-app-db-url.py "<secrets-dir>" prod --pbcopy   # URL → clipboard, for Vercel

dev: the old DATABASE_URL line is saved to <secrets-dir>/dev-DATABASE_URL.postgres.bak
  (mode 600) before it is replaced. The file is rewritten in place so worktree
  symlinks to it keep working.
prod: never written to any file; it goes to the clipboard for pasting into the
  Vercel env var. Clear the clipboard afterwards (`pbcopy < /dev/null`).
  Failure look if you skip that: the next paste anywhere — a chat box, an issue,
  a browser tool typing for an agent — carries the prod credential, with no
  error at any point.

Nothing secret goes through argv, env vars or stdout.
"""
import argparse, configparser, os, subprocess, sys
from urllib.parse import quote

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENV_FILE = os.path.join(REPO, '.env.local')


def replace_line(new_line: str) -> None:
    with open(ENV_FILE) as f:
        lines = f.read().split('\n')
    hits = [i for i, l in enumerate(lines) if l.startswith('DATABASE_URL=')]
    if len(hits) != 1:
        sys.exit(f'expected exactly one DATABASE_URL= line in .env.local, found {len(hits)}')
    lines[hits[0]] = new_line
    with open(ENV_FILE, 'w') as f:  # in place: keeps the inode (and worktree symlinks)
        f.write('\n'.join(lines))


def app_url(secrets_dir: str, env: str) -> tuple[str, str]:
    pgpass = os.path.join(secrets_dir, '.pgpass')
    if os.stat(pgpass).st_mode & 0o077:
        sys.exit('.pgpass is group/world readable; chmod 600 it first (libpq would ignore it too)')

    service = f'futari_{env}_app'
    cfg = configparser.ConfigParser(interpolation=None)
    cfg.read(os.path.join(secrets_dir, 'pg_service.conf'))
    if service not in cfg:
        sys.exit(f'[{service}] not found in pg_service.conf')
    s = cfg[service]
    host, port, user, db = s['host'], s['port'], s['user'], s['dbname']

    pw = None
    with open(pgpass) as f:
        for raw in f:
            parts = raw.rstrip('\n').split(':')
            if len(parts) < 5:
                continue
            h, p, d, u = parts[:4]
            if h in (host, '*') and p in (port, '*') and d in (db, '*') and u in (user, '*'):
                pw = ':'.join(parts[4:]).replace('\\:', ':').replace('\\\\', '\\')
                break
    if not pw:
        sys.exit(f'no .pgpass line matches the {service} service')

    url = f'postgresql://{quote(user, safe=".")}:{quote(pw, safe="")}@{host}:{port}/{db}?pgbouncer=true'
    redacted = f'{user.split(".")[0]}.<ref>@<host>:{port}/{db}'
    return url, redacted


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('secrets_dir')
    ap.add_argument('env', choices=['dev', 'prod'])
    ap.add_argument('--rollback', action='store_true', help='dev only: restore the backed-up postgres URL')
    ap.add_argument('--pbcopy', action='store_true', help='prod only: copy the URL to the clipboard')
    a = ap.parse_args()

    if a.env == 'prod':
        if a.rollback or not a.pbcopy:
            sys.exit('prod only supports --pbcopy (Vercel env is edited by hand; rollback = paste the old value back)')
        url, redacted = app_url(a.secrets_dir, 'prod')
        subprocess.run(['pbcopy'], input=url.encode(), check=True)
        print(f'ok: {redacted} copied to clipboard — paste into Vercel, then `pbcopy < /dev/null`')
        return
    if a.pbcopy:
        sys.exit('--pbcopy is prod only; dev rewrites .env.local')

    backup = os.path.join(a.secrets_dir, 'dev-DATABASE_URL.postgres.bak')
    if a.rollback:
        with open(backup) as f:
            line = f.read().strip()
        if '\n' in line or not line.startswith('DATABASE_URL=postgresql://postgres.'):
            sys.exit('backup does not look like the postgres URL; not touching .env.local')
        replace_line(line)
        print('ok: DATABASE_URL restored to the postgres role (restart npm run dev)')
        return

    url, redacted = app_url(a.secrets_dir, 'dev')
    with open(ENV_FILE) as f:
        current = [l for l in f.read().split('\n') if l.startswith('DATABASE_URL=')]
    if len(current) != 1:
        sys.exit('expected exactly one DATABASE_URL= line in .env.local')
    if '://futari_app.' in current[0]:
        sys.exit('.env.local already points at futari_app; nothing to do')
    fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(current[0] + '\n')
    os.chmod(backup, 0o600)  # O_CREAT's mode only applies to a new file
    replace_line(f'DATABASE_URL={url}')
    print(f'ok: DATABASE_URL -> {redacted} (old line backed up; restart npm run dev)')


if __name__ == '__main__':
    main()
