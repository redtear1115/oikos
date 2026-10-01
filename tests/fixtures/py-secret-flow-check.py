"""Static check for scripts/ops/futari-app-*.py (#1467), run by
tests/futari-app-role-guard.test.ts: no secret-holding name may reach the
terminal (stdout/stderr, exit messages, tracebacks, logging, warnings, input
prompts), a child process's argv, or the environment.

Uses Python's own parser, so comments, f-strings and multi-line calls can't
hide anything. Prints one line per violation; no output = clean. A file that
doesn't parse is reported as a violation.
"""
import ast, sys

SECRETS = {'pw', 'app_pw', 'url', 'direct', 'current', 'line', 'lines', 'new_line', 'raw', 'parts'}
OUTPUT = {'print', 'exit', 'quit', 'input', 'sys.exit', 'sys.stdout.write', 'sys.stderr.write',
          'sys.stdout.buffer.write', 'sys.stderr.buffer.write', 'os.write', 'warnings.warn'}
FORBIDDEN_CALLS = {'os.system', 'os.popen', 'os.putenv'}
ENV_WRITES = {f'os.environ.{m}' for m in ('update', 'setdefault', '__setitem__', '__ior__')}


def dotted(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = dotted(node.value)
        return f'{base}.{node.attr}' if base else None
    return None


def secret_names(nodes):
    return sorted({n.id for x in nodes if x is not None for n in ast.walk(x)
                   if isinstance(n, ast.Name) and n.id in SECRETS})


def check(path):
    try:
        tree = ast.parse(open(path).read(), path)
    except SyntaxError as e:
        return [f'{path}: does not parse ({e.msg} line {e.lineno})']
    out = []
    bad = lambda node, msg: out.append(f'{path}:{node.lineno}: {msg}')
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and dotted(node) == 'sys.argv':
            bad(node, 'sys.argv')
        if isinstance(node, ast.Raise) and node.exc is not None:
            if hits := secret_names([node.exc]):
                bad(node, f'secret in raised exception: {hits}')
        if isinstance(node, (ast.Assign, ast.AugAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for t in targets:
                base = t.value if isinstance(t, ast.Subscript) else t
                if dotted(base) == 'os.environ':
                    bad(node, 'writes os.environ')
        if not isinstance(node, ast.Call):
            continue
        name = dotted(node.func) or ''
        args = list(node.args) + [k.value for k in node.keywords]
        for k in node.keywords:
            if k.arg == 'env':
                bad(node, 'env= passed to a call')
            if k.arg == 'shell' and not (isinstance(k.value, ast.Constant) and k.value.value is False):
                bad(node, 'shell= on a call')
        if name in FORBIDDEN_CALLS or name.startswith(('os.exec', 'os.spawn')) \
                or name in ENV_WRITES:
            bad(node, f'forbidden call {name}')
        elif name in OUTPUT or name.startswith('logging.'):
            if hits := secret_names(args):
                bad(node, f'secret reaches output via {name}: {hits}')
        elif name.startswith('subprocess.'):
            if not node.args or not isinstance(node.args[0], ast.List):
                bad(node, f'{name} argv is not an inline list')
            # stdin (input=) is the one sanctioned channel for a secret.
            rest = list(node.args) + [k.value for k in node.keywords if k.arg != 'input']
            if hits := secret_names(rest):
                bad(node, f'secret in {name} argv/kwargs: {hits}')
    return out


if __name__ == '__main__':
    for p in sys.argv[1:]:
        for v in check(p):
            print(v)
