"""Static check for scripts/ops/futari-app-*.py (#1467), run by
tests/futari-app-role-guard.test.ts: no secret-holding name may reach the
terminal (stdout/stderr, exit messages, tracebacks, logging, warnings, input
prompts), a child process's argv, or the environment.

Uses Python's own parser, so comments, f-strings and multi-line calls can't
hide anything. Prints one line per violation; no output = clean. A file that
doesn't parse is reported as a violation.

Which names hold a secret is computed, not listed: SEEDS, anything read from a
file (`open(...)`), and `secrets.*` results are tainted, and taint spreads to
every name assigned, unpacked, iterated, bound by `with … as` or mutated
(`.append` etc.) from a tainted expression, to a fixpoint. A hand-kept name
list was tried first and missed holders like `m = re.match(…, direct)` (#1467
review); the failure look was a natural debugging edit to an error message
passing the suite. Analysis is flow- and scope-insensitive (one taint set per
file) — conservative, so a reused name can only add findings, not hide them.
`len(...)` and names in SANITIZED are treated as safe to print.

This is a tripwire for ordinary edits, NOT a proof that no secret can leak.
Known gaps (#1467 review, five passes; accepted rather than chased):
  - no interprocedural flow: function parameters and return values are not
    tainted, so a debug print inside write600()/replace_line() (whose `text`/
    `new_line` carry the secret), or a helper `def die(msg): sys.exit(msg)`,
    passes. Review edits inside helpers by hand.
  - SANITIZED matches the name, not the value: anything assigned to
    `redacted` is trusted. Changes to how `redacted` is built need review.
  - sinks are matched by qualified name: logger objects
    (`logging.getLogger().info`), pprint, `.writelines`, `ArgumentParser.error`
    and similar are not covered; sources other than open()/os.fdopen
    (e.g. pathlib.read_text) don't seed taint.
  - false positive: user/host/port parsed from the same regex match as the
    password are tainted. Don't add them to SANITIZED to silence it — that
    exempts the names everywhere; print from the pg_service.conf values instead.
"""
import ast, sys

SEEDS = {'pw', 'app_pw', 'url'}
# Deliberately derived, display-safe values. Adding a name here is a security
# review decision, same as a futari_app grant.
SANITIZED = {'redacted'}
TAINT_CALLS = {'open', 'os.fdopen'}
MUTATORS = {'append', 'extend', 'insert', 'add', 'update', 'setdefault', 'write'}
SANITIZERS = {'len'}
OUTPUT = {'print', 'exit', 'quit', 'input', 'sys.exit', 'sys.stdout.write', 'sys.stderr.write',
          'sys.stdout.buffer.write', 'sys.stderr.buffer.write', 'os.write', 'warnings.warn'}
FORBIDDEN_CALLS = {'os.system', 'os.popen', 'os.putenv'}
ALIASED_MODULES = {'os', 'sys', 'subprocess', 'logging', 'warnings'}
ENV_WRITES = {f'os.environ.{m}' for m in ('update', 'setdefault', '__setitem__', '__ior__')}


def dotted(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = dotted(node.value)
        return f'{base}.{node.attr}' if base else None
    return None


def names_in(node, tainted):
    """Tainted names read anywhere in `node`, skipping sanitizer-call arguments."""
    found = set()

    def visit(n):
        if isinstance(n, ast.Call) and dotted(n.func) in SANITIZERS:
            return
        if isinstance(n, ast.Name) and n.id in tainted:
            found.add(n.id)
        if isinstance(n, ast.Call) and (dotted(n.func) in TAINT_CALLS or (dotted(n.func) or '').startswith('secrets.')):
            found.add(f'<{dotted(n.func)}()>')
        for c in ast.iter_child_nodes(n):
            visit(c)

    if node is not None:
        visit(node)
    return found


def bound_names(target):
    return {n.id for n in ast.walk(target) if isinstance(n, ast.Name)} - SANITIZED


def taint(tree):
    tainted = set(SEEDS)
    while True:
        before = len(tainted)
        for n in ast.walk(tree):
            pairs = []
            if isinstance(n, ast.Assign):
                for t in n.targets:
                    if isinstance(t, ast.Tuple) and isinstance(n.value, ast.Tuple) and len(t.elts) == len(n.value.elts):
                        pairs += list(zip(t.elts, n.value.elts))
                    else:
                        pairs.append((t, n.value))
            elif isinstance(n, (ast.AnnAssign, ast.AugAssign, ast.NamedExpr)) and n.value is not None:
                pairs.append((n.target, n.value))
            elif isinstance(n, (ast.For, ast.comprehension)):
                pairs.append((n.target, n.iter))
            elif isinstance(n, ast.withitem) and n.optional_vars is not None:
                pairs.append((n.optional_vars, n.context_expr))
            elif isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr in MUTATORS \
                    and isinstance(n.func.value, ast.Name):
                pairs.append((n.func.value, ast.Tuple(elts=list(n.args) + [k.value for k in n.keywords])))
            for target, value in pairs:
                if names_in(value, tainted):
                    tainted |= bound_names(target)
        if len(tainted) == before:
            return tainted


def secret_names(nodes, tainted):
    return sorted(set().union(*(names_in(x, tainted) for x in nodes)) if nodes else set())


def check(path):
    try:
        tree = ast.parse(open(path).read(), path)
    except SyntaxError as e:
        return [f'{path}: does not parse ({e.msg} line {e.lineno})']
    tainted = taint(tree)
    out = []
    bad = lambda node, msg: out.append(f'{path}:{node.lineno}: {msg}')
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and dotted(node) == 'sys.argv':
            bad(node, 'sys.argv')
        if isinstance(node, ast.Assert) and (hits := secret_names([node.msg], tainted)):
            bad(node, f'secret in assert message: {hits}')
        if isinstance(node, ast.ImportFrom) and node.module in ALIASED_MODULES:
            bad(node, f'from {node.module} import … (calls must stay fully qualified)')
        if isinstance(node, ast.Import) and any(a.asname and a.name in ALIASED_MODULES for a in node.names):
            bad(node, 'import … as … of a checked module')
        if isinstance(node, ast.Raise) and node.exc is not None:
            if hits := secret_names([node.exc, node.cause], tainted):
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
            if hits := secret_names(args, tainted):
                bad(node, f'secret reaches output via {name}: {hits}')
        elif name.startswith('subprocess.'):
            if not node.args or not isinstance(node.args[0], ast.List):
                bad(node, f'{name} argv is not an inline list')
            # stdin (input=) is the one sanctioned channel for a secret.
            rest = list(node.args) + [k.value for k in node.keywords if k.arg != 'input']
            if hits := secret_names(rest, tainted):
                bad(node, f'secret in {name} argv/kwargs: {hits}')
    return out


if __name__ == '__main__':
    for p in sys.argv[1:]:
        for v in check(p):
            print(v)
