#!/usr/bin/env python3
"""#1467 — 啟用步驟 3: write the .pgpass lines for futari_<env>_admin and
futari_<env>_app, generating a fresh futari_app password. Run by the user,
never by an agent (ops-runbook §「Runtime DB role (futari_app)」).

  python3 scripts/ops/futari-app-pgpass.py "<secrets-dir>" dev
  python3 scripts/ops/futari-app-pgpass.py "<secrets-dir>" prod --admin-env-file "<file>"

- Host/port/user/dbname come from <secrets-dir>/pg_service.conf
  ([futari_<env>_admin], [futari_<env>_app]).
- The admin line's password is copied from DATABASE_URL_DIRECT in an env file:
  the repo's .env.local for dev; for prod you must name the file that holds the
  prod value (.env.local points at dev).
- The new futari_app password (64 hex) goes to .pgpass and to
  <secrets-dir>/futari_<env>_app.pw, for `pbcopy < …` at the `\\password futari_app`
  prompt.

Nothing secret is printed or passed through argv/env; both files are mode 600.
Refuses to run if futari_<env>_app.pw already exists, so a re-run cannot
silently replace a password you already set on the server.
  Failure look if that guard were missing: .pgpass and the server disagree,
  and the next connection test fails with 28P01 — which also counts toward the
  pooler's IP block (see 〈Circuit breaker〉).
"""
import argparse, configparser, os, re, secrets, sys
from urllib.parse import unquote

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def write600(path: str, text: str) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(text)
    os.chmod(path, 0o600)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('secrets_dir')
    ap.add_argument('env', choices=['dev', 'prod'])
    ap.add_argument('--admin-env-file', help='env file holding DATABASE_URL_DIRECT (required for prod)')
    a = ap.parse_args()

    if a.env == 'prod' and not a.admin_env_file:
        sys.exit('prod needs --admin-env-file: .env.local points at the dev project')
    env_file = a.admin_env_file or os.path.join(REPO, '.env.local')

    cfg = configparser.ConfigParser(interpolation=None)
    cfg.read(os.path.join(a.secrets_dir, 'pg_service.conf'))
    try:
        admin, app = cfg[f'futari_{a.env}_admin'], cfg[f'futari_{a.env}_app']
    except KeyError as e:
        sys.exit(f'pg_service.conf has no {e} section')

    pwfile = os.path.join(a.secrets_dir, f'futari_{a.env}_app.pw')
    if os.path.exists(pwfile):
        sys.exit(f'{os.path.basename(pwfile)} already exists — not generating a second password')

    direct = None
    with open(env_file) as f:
        for line in f:
            if line.startswith('DATABASE_URL_DIRECT='):
                direct = line.split('=', 1)[1].strip().strip('"\'')
    m = re.match(r'^postgres(?:ql)?://([^:@]+):([^@]*)@([^:/]+):(\d+)/', direct or '')
    if not m:
        sys.exit(f'could not parse DATABASE_URL_DIRECT in {env_file}')
    user, pw, host, port = unquote(m[1]), unquote(m[2]), m[3], m[4]
    if (user, host, port) != (admin['user'], admin['host'], admin['port']):
        sys.exit(f'DATABASE_URL_DIRECT does not match [futari_{a.env}_admin] (user/host/port) — wrong env file?')

    app_pw = secrets.token_hex(32)
    write600(pwfile, app_pw)

    pgpass = os.path.join(a.secrets_dir, '.pgpass')
    keep = []
    if os.path.exists(pgpass):
        with open(pgpass) as f:
            for line in f.read().splitlines():
                parts = line.split(':')
                if len(parts) >= 4 and parts[3] in (admin['user'], app['user']):
                    continue  # replaced below
                keep.append(line)
    esc = lambda s: s.replace('\\', '\\\\').replace(':', '\\:')
    keep.append(f"{admin['host']}:{admin['port']}:{admin['dbname']}:{admin['user']}:{esc(pw)}")
    keep.append(f"{app['host']}:{app['port']}:{app['dbname']}:{app['user']}:{esc(app_pw)}")
    write600(pgpass, '\n'.join(keep) + '\n')
    print(f'ok: .pgpass has futari_{a.env}_admin + futari_{a.env}_app lines; '
          f'new password in {os.path.basename(pwfile)} (600)')


if __name__ == '__main__':
    main()
