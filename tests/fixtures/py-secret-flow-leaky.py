# Self-test input for py-secret-flow-check.py: every line containing LEAK must
# be reported (a multi-line call reports the line it starts on), and no other line may be. Never executed.
# The comments with apostrophes and parens are deliberate: they're what broke
# the earlier regex-based guard (#1467 review).
import logging, os, subprocess, sys, warnings

pw = app_pw = url = direct = line = lines = new_line = 'x'
redacted = 'futari_app.<ref>'
w = 4

print(app_pw)  # LEAK
print('pw', pw)  # LEAK
# don't log this
print(app_pw)  # LEAK
os.chmod('f', 0o600)  # O_CREAT's mode only applies to a new file
print(f'ok: DATABASE_URL -> {url} (old line backed up)')  # LEAK
print('done',  # see runbook) LEAK
      app_pw)
print(f'{pw:>{w}}')  # LEAK
print(f'ok: '  # LEAK
      f'{app_pw}')
sys.exit(f'not touching .env.local: {line}')  # LEAK
sys.stderr.write(new_line)  # LEAK
sys.stdout.buffer.write(pw.encode())  # LEAK
os.write(1, app_pw.encode())  # LEAK
logging.warning(pw)  # LEAK
warnings.warn(url)  # LEAK
input(pw)  # LEAK
raise SystemExit(pw)  # LEAK
raise ValueError(f'bad {direct}')  # LEAK
subprocess.run(['psql', '-c', app_pw])  # LEAK
cmd = ['psql']
subprocess.run(cmd)  # LEAK
subprocess.run(['x'], env={'P': pw})  # LEAK
subprocess.run(['sh', '-c', 'true'], shell=True)  # LEAK
os.popen('echo ' + pw)  # LEAK
os.execv('/bin/echo', ['echo', pw])  # LEAK
os.environ['X'] = pw  # LEAK
os.environ |= {'X': pw}  # LEAK
os.environ.update(X=pw)  # LEAK
os.putenv('X', pw)  # LEAK
print(sys.argv)  # LEAK

# Benign: must not be reported.
print('the line, url and pw words in a literal')
print(f'{redacted} copied — paste into Vercel (line url pw)')
print("""multi
line pw url""")
subprocess.run(['pbcopy'], input=url.encode(), check=True)
x = os.environ.get('HOME') == 'prod'
# print(pw) in a comment is fine
