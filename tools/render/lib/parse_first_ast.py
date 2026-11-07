#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""parse_first_ast.py — the PYTHON half of the FIX10 parse-first fence (ORDER-CN8-731-FIX10; rebuilt on Fable pass 2, which showed a
text-level fence passing 34 differently spelled pre-scans). Judges ONE python file by its AST, in EXECUTION order, and prints a JSON
verdict for lib/parse-first-fence.mjs.

THE LAW: a tool that invalidates a prior artefact parses its WHOLE argv to completion FIRST — help exits 0, errors exit 2 — before ANY
filesystem or process effect; the first effect takes the PARSED result.

What is judged (fail-closed):
  * the statements EXECUTED before the parse: every module-level statement in order (compound statements' whole subtrees — try / if /
    for / with / class bodies, decorators, default arguments — except the bodies of functions that are merely defined), then, from the
    `if __name__ == '__main__'` dispatch, the body of every local function called before the parse (call graph, in order), up to the
    statement holding the parse: a `parse_args(` call, a call to a local function whose body reaches one, or the positional scripts'
    `# FIX10 parse-complete` marker (which counts only when the next statement is an invalidation call);
  * in that region: NO reference (call OR bare reference — a callback handed to map() is a reference) to an effect — os.remove / unlink /
    rmdir / rename / replace / makedirs / mkdir / system …, shutil.*, subprocess.*, Path.unlink / rmdir / rename / replace / write_text /
    write_bytes / touch / mkdir, open() in any mode but a literal 'r' / 'rb', atexit, exec / eval / __import__ / getattr / setattr /
    compile / importlib.import_module; NO call to a callee that is neither allowlisted (by FULL dotted name) nor a local function (whose
    body is then judged the same way — a local `def print` or `def bind_or_die` is judged by its body, never by its name);
  * imported local modules (import x / from x import …, resolved against the file's directory, tools/render, tools/render/lib and every
    directory named in a sys.path.insert literal) and every .py named in a string literal of the region (exec_module loads): their
    module-level statements are judged as executed code, recursively;
  * a file that invalidates (an invalidation helper import, or a removal reference anywhere) but has no parse → FAIL.
Output: {"file", "parser_line", "first_inv_line", "findings": [{"line", "kind", "text"}], "judged": bool}
"""
import ast
import json
import os
import re
import sys

EFFECT_OS = {'remove', 'unlink', 'rmdir', 'removedirs', 'rename', 'renames', 'replace', 'makedirs', 'mkdir', 'system', 'truncate', 'link',
             'symlink', 'chmod', 'chown', 'utime', 'popen', 'spawnl', 'spawnv', 'execv', 'execl', 'startfile', 'open', 'fdopen', 'write'}
EFFECT_PATH_METHODS = {'unlink', 'rmdir', 'rename', 'replace', 'write_text', 'write_bytes', 'touch', 'mkdir', 'chmod', 'symlink_to',
                       'hardlink_to', 'link_to', 'open'}
EFFECT_MODULES = {'shutil', 'subprocess', 'atexit', 'multiprocessing', 'signal', 'socket', 'http', 'socketserver', 'ctypes'}
EFFECT_BUILTINS = {'exec', 'eval', '__import__', 'getattr', 'setattr', 'delattr', 'compile', 'globals', 'locals', 'vars', 'breakpoint'}
EFFECT_FACTORIES = {'operator.methodcaller', 'operator.attrgetter', 'functools.partial', 'partial', 'methodcaller', 'attrgetter', 'sys.modules', 'importlib.import_module', 'importlib.reload'}
EFFECT_METHOD_STRINGS = EFFECT_PATH_METHODS | EFFECT_OS | {'rmtree', 'move', 'copyfile', 'copy', 'copy2', 'copytree', 'run', 'call', 'check_output', 'check_call', 'Popen', 'system', 'remove', 'unlink', 'rename', 'replace'}
INV_NAMES = {'invalidate_dest', 'invalidate_path', 'invalidate_prior', 'invalidate_for_mode', '_invalidate_dest', '_invalidate_path',
             '_invalidate_prior', '_invalidate_prior0', '_invalidate_for_mode'}
# calls allowed ahead of the parse — pure / read-only / declarative — by FULL dotted name (a local def of the same name is judged by its body instead)
ALLOW = {
    'argparse.ArgumentParser', 'argparse.RawDescriptionHelpFormatter', 'argparse.ArgumentDefaultsHelpFormatter', 'argparse.RawTextHelpFormatter',
    're.compile', 're.match', 're.search', 're.sub', 're.findall', 're.split', 're.escape',
    'os.path.join', 'os.path.dirname', 'os.path.abspath', 'os.path.realpath', 'os.path.basename', 'os.path.exists', 'os.path.isfile',
    'os.path.isdir', 'os.path.splitext', 'os.path.expanduser', 'os.path.normpath', 'os.path.relpath', 'os.path.getmtime', 'os.path.getsize',
    'os.environ.get', 'os.getenv', 'os.getcwd', 'os.listdir', 'os.scandir', 'os.stat', 'os.walk', 'os.cpu_count', 'os.getpid', 'os.fspath',
    'sys.path.insert', 'sys.path.append', 'sys.exit', 'sys.stderr.write', 'sys.stdout.write', 'sys.stderr.flush', 'sys.stdout.flush',
    'importlib.util.spec_from_file_location', 'importlib.util.module_from_spec',
    'json.load', 'json.loads', 'json.dumps',
    'np.array', 'np.zeros', 'np.ones', 'np.asarray', 'np.deg2rad', 'np.radians', 'np.float64', 'np.arange', 'np.linspace', 'np.eye',
    'math.radians', 'math.degrees', 'math.sqrt', 'math.tan', 'math.atan', 'math.atan2', 'math.hypot', 'math.floor', 'math.ceil', 'math.cos', 'math.sin',
    'collections.namedtuple', 'collections.OrderedDict', 'collections.defaultdict', 'collections.Counter', 'functools.lru_cache', 'functools.partial',
    'itertools.product', 'itertools.chain', 'itertools.combinations', 'hashlib.sha256', 'hashlib.md5', 'shlex.quote', 'shlex.split',
    'textwrap.dedent', 'copy.deepcopy', 'copy.copy', 'time.time', 'time.monotonic', 'datetime.datetime.now', 'datetime.datetime.utcnow',
    'datetime.datetime.fromtimestamp', 'fnmatch.fnmatch', 'fnmatch.filter', 'glob.glob', 'random.Random', 'random.seed',
    'pathlib.Path', 'Path', 'dataclasses.dataclass', 'dataclasses.field', 'dataclass', 'field', 'namedtuple', 'lru_cache', 'partial',
    'dict', 'set', 'frozenset', 'tuple', 'list', 'str', 'int', 'float', 'range', 'len', 'sorted', 'enumerate', 'zip', 'map', 'filter', 'min',
    'max', 'abs', 'round', 'print', 'hasattr', 'isinstance', 'issubclass', 'type', 'bool', 'any', 'all', 'sum', 'divmod', 'callable', 'format',
    'repr', 'iter', 'next', 'reversed', 'chr', 'ord', 'hex', 'bytes', 'bytearray', 'slice', 'id', 'hash', 'object', 'super', 'property',
    'staticmethod', 'classmethod', 'input', 'exit', 'quit', 'ValueError', 'RuntimeError', 'SystemExit', 'KeyError', 'IndexError', 'TypeError',
    'FileNotFoundError', 'OSError', 'AssertionError', 'NotImplementedError', 'Exception', 'ImportError', 'ZeroDivisionError', 'AttributeError',
    'tempfile.mkdtemp', 'tempfile.gettempdir', 'mkdtemp', 'gettempdir',
    'ImageFont.truetype', 'ImageFont.load_default', 'Image.open', 'Image.new', 'ImageDraw.Draw', 'cv2.imread', 'cv2.cvtColor', 'cv2.resize',
}
# methods allowed on an arbitrary expression (str / list / dict / set / re / argparse / Path READ methods)
METHODS = {
    'join', 'strip', 'lstrip', 'rstrip', 'split', 'rsplit', 'splitlines', 'startswith', 'endswith', 'lower', 'upper', 'title', 'capitalize',
    'format', 'replace', 'get', 'items', 'keys', 'values', 'append', 'extend', 'pop', 'index', 'count', 'sort', 'copy', 'update', 'add',
    'discard', 'encode', 'decode', 'isdigit', 'isalpha', 'zfill', 'ljust', 'rjust', 'center', 'partition', 'find', 'rfind', 'setdefault',
    'insert', 'reverse', 'clear', 'tolist', 'astype', 'reshape', 'group', 'groups', 'match', 'search', 'sub', 'findall', 'finditer',
    'fullmatch', 'read', 'readline', 'readlines', 'close', 'exists', 'is_file', 'is_dir', 'resolve', 'expanduser', 'with_suffix',
    'with_name', 'relative_to', 'read_text', 'read_bytes', 'stat', 'glob', 'rglob', 'iterdir', 'as_posix', 'hexdigest', 'total_seconds',
    'isoformat', 'strftime', 'timestamp', 'parse_args', 'parse_known_args', 'add_argument', 'add_mutually_exclusive_group',
    'set_defaults', 'add_subparsers', 'add_parser', 'error', 'print_help', 'print_usage', 'format_usage', 'exit', 'write', 'flush',
    'bind_or_die', 'spec_sha', 'exec_module', 'seek', 'tell', 'fileno', 'isatty', 'union', 'intersection', 'difference', 'issubset',
}
PARSE_CALL = {'parse_args', 'parse_known_args'}
PURE_DECORATORS = {'staticmethod', 'classmethod', 'property', 'dataclass', 'dataclasses.dataclass', 'lru_cache', 'functools.lru_cache', 'functools.cache',
                   'abstractmethod', 'abc.abstractmethod', 'functools.wraps', 'wraps', 'contextmanager', 'contextlib.contextmanager', 'total_ordering', 'functools.total_ordering'}
NUMERIC_METHODS = {'max', 'min', 'mean', 'sum', 'std', 'argmax', 'argmin', 'any', 'all', 'round', 'clip', 'transpose', 'flatten', 'ravel', 'squeeze', 'dot', 'copy', 'item', 'items', 'tobytes', 'nonzero', 'cumsum', 'prod', 'var', 'ptp', 'fill', 'sort', 'argsort', 'take', 'repeat', 'tile', 'reshape', 'astype', 'tolist', 'shape', 'size', 'ndim'}
PURE_MODULES = {'np', 'numpy', 'math', 're', 'json', 'collections', 'itertools', 'datetime', 'time', 'random', 'hashlib', 'fnmatch',
                'shlex', 'textwrap', 'copy', 'string', 'statistics', 'decimal', 'fractions', 'typing', 'dataclasses', 'enum', 'abc',
                'argparse', 'struct', 'base64', 'binascii', 'zlib', 'colorsys', 'bisect', 'heapq', 'array', 'unicodedata', 'difflib', 'pprint'}
MARKER = '# FIX10 parse-complete'


def executed_nodes(node):
    """yield the nodes a statement executes: function / lambda bodies are skipped (their decorators and defaults are not); class bodies run"""
    stack = [node]
    while stack:
        n = stack.pop()
        yield n
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            stack.extend(n.decorator_list); stack.extend(n.args.defaults); stack.extend([x for x in n.args.kw_defaults if x is not None]); continue
        if isinstance(n, ast.Lambda): continue
        stack.extend(ast.iter_child_nodes(n))


def dotted(node):
    """a.b.c → 'a.b.c' for Name / Attribute chains, else None"""
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr); node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id); return '.'.join(reversed(parts))
    return None


class Judge:
    def __init__(self, path, root, depth=0, seen=None):
        self.path = os.path.abspath(path); self.root = root; self.depth = depth; self.seen = seen if seen is not None else set()
        self.src = open(self.path, encoding='utf-8', errors='replace').read()
        self.lines = self.src.split('\n')
        self.findings = []
        self.tree = None
        try:
            self.tree = ast.parse(self.src, filename=self.path)
        except SyntaxError as e:
            self.findings.append({'line': e.lineno or 1, 'kind': 'unparseable', 'text': str(e)[:120]})
        self.funcs = {}      # local function name → node
        self.classes = {}    # local class name → node
        self.path_names = set()  # names bound to Path(...) (their .replace / .rename are effects)
        self.alias = {}      # imported alias → real module name (import os as _os0)
        self.marker_lines = [i + 1 for i, l in enumerate(self.lines) if MARKER in l]
        self.parser_line = None
        self.first_inv_line = None
        self.judged_funcs = set()
        self.sys_path_dirs = [os.path.dirname(self.path), os.path.join(root), os.path.join(root, 'lib')]

    # ---------- helpers
    def fail(self, node, kind, text):
        self.findings.append({'line': getattr(node, 'lineno', 0), 'kind': kind, 'text': text[:140]})

    def real(self, name):
        head, _, rest = name.partition('.')
        head = self.alias.get(head, head)
        if head == 'numpy': head = 'np'
        head = re.sub(r'^_+([a-z]+?)\d*$', r'\1', head) if head not in self.funcs else head
        return head + ('.' + rest if rest else '')

    def collect_defs(self):
        for n in ast.walk(self.tree):
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self.funcs.setdefault(n.name, n)
            elif isinstance(n, ast.ClassDef):
                self.classes.setdefault(n.name, n)
            elif isinstance(n, ast.Import):
                for a in n.names:
                    self.alias[(a.asname or a.name).split('.')[0]] = a.name.split('.')[0]
            elif isinstance(n, ast.ImportFrom) and n.module:
                for a in n.names:
                    if a.asname: self.alias[a.asname] = f'{n.module}.{a.name}'
            elif isinstance(n, ast.Assign) and isinstance(n.value, ast.Call):
                d = dotted(n.value.func)
                if d and self.real(d) in ('Path', 'pathlib.Path'):
                    for t in n.targets:
                        if isinstance(t, ast.Name): self.path_names.add(t.id)

    # ---------- the core: judge every node executed by `node`
    def judge_expr(self, node, ctx='expr'):
        """walk an executed subtree; function/lambda/class bodies inside expressions run only if called — a Lambda called on the
        same line is a Call whose func is a Lambda (judged), a def statement is registered, an IIFE-like call recurses"""
        for sub in ast.walk_iter(node) if hasattr(ast, 'walk_iter') else ast.walk(node):
            pass
        stack = [node]
        while stack:
            n = stack.pop()
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # a definition executes its decorators and defaults, never its body
                for d in n.decorator_list:
                    dn = dotted(d.func if isinstance(d, ast.Call) else d)
                    if dn and self.real(dn) in PURE_DECORATORS:
                        if isinstance(d, ast.Call):
                            for a in d.args: stack.append(a)
                            for kw in d.keywords: stack.append(kw.value)
                        continue
                    if dn and dn in self.funcs: self.judge_func(self.funcs[dn], d); continue   # a local decorator runs at definition time — judged by its body
                    self.fail(d, 'decorator', f'a decorator runs at definition time and is not allowlisted: {ast.unparse(d)[:60]}')
                for dflt in list(n.args.defaults) + [x for x in n.args.kw_defaults if x is not None]: stack.append(dflt)
                continue
            if isinstance(n, ast.Lambda):
                continue  # judged when called
            if isinstance(n, ast.ClassDef):
                for d in n.decorator_list: stack.append(d)
                for b in n.bases: stack.append(b)
                for kw in n.keywords: stack.append(kw.value)
                for ref in list(n.bases) + [kw.value for kw in n.keywords]:
                    rn = dotted(ref)
                    if rn and rn in self.classes:
                        for meth in self.classes[rn].body:
                            if isinstance(meth, (ast.FunctionDef, ast.AsyncFunctionDef)) and meth.name in ('__new__', '__init__', '__init_subclass__', '__set_name__', '__call__', '__prepare__'):
                                self.judge_func(meth, n)   # a local metaclass / base runs these at class definition
                for b in n.body: stack.append(b)   # a class body executes at definition
                continue
            # --- references to effects (call or not)
            if isinstance(n, ast.Subscript):
                d0 = dotted(n.value)
                if d0 and self.real(d0) in ('sys.modules', 'os.__dict__', '__builtins__', 'globals()'): self.fail(n, 'effect-ref', f'{d0}[…] — a module table subscript reaches any effect')
                if isinstance(n.value, ast.Attribute) and n.value.attr == '__dict__': self.fail(n, 'effect-ref', '__dict__[…] — attribute access by string')
            if isinstance(n, ast.Constant) and isinstance(n.value, str) and n.value in EFFECT_METHOD_STRINGS and ctx == 'callarg':
                self.fail(n, 'effect-ref', f'the string {n.value!r} names an effect method inside a call (methodcaller / getattr / partial)')
            if isinstance(n, (ast.Attribute, ast.Name)):
                d = dotted(n)
                if d:
                    r = self.real(d); head = r.split('.')[0]; last = r.split('.')[-1]
                    if r in EFFECT_FACTORIES or head == 'operator': self.fail(n, 'effect-ref', f'{r} — a callable factory / module table that reaches any effect')
                    if head in EFFECT_MODULES: self.fail(n, 'effect-ref', f'reference to {r}')
                    elif head == 'os' and last in EFFECT_OS and not r.startswith('os.path.') and r != 'os.environ': self.fail(n, 'effect-ref', f'reference to {r}')
                    elif isinstance(n, ast.Name) and r in EFFECT_BUILTINS and r not in self.funcs: self.fail(n, 'effect-ref', f'{r} — dynamic access / execution')
                    elif isinstance(n, ast.Attribute) and n.attr in EFFECT_PATH_METHODS and self.is_pathish(n.value): self.fail(n, 'effect-ref', f'Path.{n.attr}')
                if isinstance(n, ast.Attribute): stack.append(n.value)
                continue
            if isinstance(n, ast.Call):
                f = n.func
                if isinstance(f, ast.Lambda):
                    stack.append(f.body)
                else:
                    d = dotted(f)
                    if d is None:
                        # a call on a computed / subscripted / call-result callee: judge the callee expression, refuse unknown shapes
                        if isinstance(f, ast.Attribute) and f.attr in EFFECT_PATH_METHODS and (self.is_pathish(f.value) or f.attr not in METHODS): self.fail(n, 'effect-ref', f'.{f.attr}( on a Path / an expression'); stack.append(f.value)
                        elif isinstance(f, ast.Attribute) and f.attr in METHODS: stack.append(f.value)
                        elif isinstance(f, ast.Attribute): self.fail(n, 'unknown-call', f'.{f.attr}( on an expression is not an allowlisted method'); stack.append(f.value)
                        else: self.fail(n, 'unknown-call', f'a computed callee: {ast.unparse(f)[:60]}')
                    else:
                        r = self.real(d); head = r.split('.')[0]; last = r.split('.')[-1]
                        # the EFFECT BACKSTOP runs before any allow-list: an allow-list can widen pure names, never re-admit an effect (Fable pass 4)
                        if (head in EFFECT_MODULES or (head == 'os' and last in EFFECT_OS and not r.startswith('os.path.')) or r in EFFECT_BUILTINS or r in EFFECT_FACTORIES or head == 'operator') and head not in self.funcs:
                            self.fail(n, 'effect-ref', f'{r}( — an effect call (the backstop runs before any allow-list)')
                            for a in n.args: stack.append(a)
                            for kw in n.keywords: stack.append(kw.value)
                            continue
                        if r == 'open' or r == 'io.open':
                            mode = None
                            if len(n.args) > 1: mode = n.args[1]
                            for kw in n.keywords:
                                if kw.arg == 'mode': mode = kw.value
                            if mode is None: pass
                            elif isinstance(mode, ast.Constant) and isinstance(mode.value, str) and mode.value in ('r', 'rb', 'rt'): pass
                            else: self.fail(n, 'effect', f'open() in mode {ast.unparse(mode)[:20]}')
                        elif head in self.funcs and '.' not in r:
                            self.judge_func(self.funcs[head], n)     # a local function: judged by its body, never by its name
                        elif d in self.funcs:
                            self.judge_func(self.funcs[d], n)        # a local module's function (from a judged sibling), by body
                        elif '.' not in r and r in ALLOW: pass
                        elif r in ALLOW: pass
                        elif head in PURE_MODULES: pass                    # a pure module: every call is a computation
                        elif last in INV_NAMES: self.fail(n, 'inv-before-parse', f'{r}( — an invalidation executed before the parse')
                        elif last in PARSE_CALL: pass                 # the parse itself
                        elif isinstance(f, ast.Attribute) and f.attr in METHODS and not self.is_module_name(f.value): pass
                        elif isinstance(f, ast.Attribute) and not self.is_module_name(f.value) and f.attr not in EFFECT_PATH_METHODS and f.attr in NUMERIC_METHODS: pass
                        elif last == 'exec_module' or r.endswith('.loader.exec_module'):
                            self.exec_module_target(n)
                        else:
                            self.fail(n, 'unknown-call', f'{r}( is not an allowlisted read / declaration')
                if isinstance(f, ast.Attribute):
                    if f.attr in EFFECT_PATH_METHODS and (self.is_pathish(f.value) or isinstance(f.value, ast.Subscript)): self.fail(n, 'effect-ref', f'.{f.attr}( on a Path / a subscripted module')
                    stack.append(f.value)
                for a in n.args:
                    if isinstance(a, ast.Constant) and isinstance(a.value, str) and a.value in EFFECT_METHOD_STRINGS: self.fail(a, 'effect-ref', f'the string {a.value!r} names an effect method inside a call')
                    if isinstance(a, ast.Name) and a.id in self.funcs: self.judge_func(self.funcs[a.id], n)   # a local function handed as a callback (type=, map(), key=) is judged by body
                    stack.append(a)
                for kw in n.keywords:
                    if isinstance(kw.value, ast.Name) and kw.value.id in self.funcs: self.judge_func(self.funcs[kw.value.id], n)   # add_argument(type=_wipe): runs DURING parse_args
                    if isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str) and kw.value.value in EFFECT_METHOD_STRINGS: self.fail(kw.value, 'effect-ref', f'the string {kw.value.value!r} names an effect method inside a call')
                    stack.append(kw.value)
                continue
            if isinstance(n, ast.With):
                for it in n.items: stack.append(it.context_expr)
                for b in n.body: stack.append(b)
                continue
            for child in ast.iter_child_nodes(n): stack.append(child)

    def is_module_name(self, node):
        d = dotted(node)
        if not d: return False
        head = self.real(d).split('.')[0]
        return head in ('os', 'sys', 'shutil', 'subprocess', 'json', 're', 'math', 'np', 'pathlib', 'importlib', 'io', 'atexit', 'tempfile') or head in self.alias

    def is_pathish(self, node):
        if isinstance(node, ast.Call):
            d = dotted(node.func); return bool(d) and self.real(d) in ('Path', 'pathlib.Path')
        if isinstance(node, ast.Name): return node.id in self.path_names
        if isinstance(node, ast.Attribute): return self.is_pathish(node.value)
        return False

    def judge_func(self, fn, call_node):
        if id(fn) in self.judged_funcs: return
        self.judged_funcs.add(id(fn))
        for stmt in fn.body:
            if self.stmt_reaches_parse(stmt):
                self.judge_before_parse_in_stmt(stmt); return
            self.judge_imports(stmt)   # an import inside a function runs when the function runs
            self.judge_expr(stmt, 'func')

    def stmt_reaches_parse(self, stmt):
        for n in executed_nodes(stmt):
            if isinstance(n, ast.Call):
                d = dotted(n.func)
                if d and d.split('.')[-1] in PARSE_CALL: return True
                if d and d in self.funcs and self.func_reaches_parse(self.funcs[d], set()): return True
        # the positional scripts' marker: the statement right after the marker line is an invalidation call
        for ml in self.marker_lines:
            if getattr(stmt, 'lineno', 0) == ml + 1 and isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
                d = dotted(stmt.value.func)
                if d and d.split('.')[-1] in INV_NAMES: self.parser_line = ml; return True
        return False

    def func_reaches_parse(self, fn, seen):
        if fn.name in seen: return False
        seen.add(fn.name)
        for n in ast.walk(fn):
            if isinstance(n, ast.Call):
                d = dotted(n.func)
                if d and d.split('.')[-1] in PARSE_CALL: return True
                if d and d in self.funcs and self.func_reaches_parse(self.funcs[d], seen): return True
        return False

    def judge_before_parse_in_stmt(self, stmt):
        """the statement that holds the parse: everything in it except the parse call itself is judged"""
        if self.parser_line is None: self.parser_line = stmt.lineno
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call) and dotted(stmt.value.func) and dotted(stmt.value.func).split('.')[-1] in INV_NAMES and stmt.lineno - 1 in self.marker_lines:
            for a in stmt.value.args: self.judge_expr(a, 'inv-arg')
            return
        for n in executed_nodes(stmt):
            if isinstance(n, ast.Call):
                d = dotted(n.func)
                if d and d.split('.')[-1] in PARSE_CALL:
                    for a in n.args: self.judge_expr(a, 'parse-arg')
                    continue
        # everything else in the statement, minus the parse call: judge the value / target expressions that are not the parse
        if isinstance(stmt, (ast.Assign, ast.Expr, ast.AnnAssign)):
            v = stmt.value
            if isinstance(v, ast.Call) and dotted(v.func) and dotted(v.func).split('.')[-1] in PARSE_CALL: return
            if isinstance(v, ast.Call) and dotted(v.func) in self.funcs: self.judge_func(self.funcs[dotted(v.func)], v); return
        self.judge_expr(stmt, 'parse-stmt')

    def exec_module_target(self, call):
        """importlib exec_module: judge the loaded file's module scope (its path is the string literal of spec_from_file_location)"""
        for lit in re.findall(r"['\"]([\w./-]+\.py)['\"]", self.src[: self.src.find('exec_module')] if 'exec_module' in self.src else ''):
            self.judge_sibling(lit, call)

    def judge_sibling(self, rel, node):
        base = os.path.splitext(os.path.basename(rel))[0]
        cands = [os.path.join(d, rel) for d in self.sys_path_dirs + [os.path.dirname(self.path), os.path.join(os.path.dirname(self.path), 'cammatch'), os.path.join(self.root, 'cammatch')]]
        for c in cands:
            c = os.path.abspath(c)
            if os.path.isfile(c) and c != self.path:
                if base in PURE_MODULES or base in ('os', 'sys', 'shutil', 'subprocess', 'pathlib', 'argparse', 'importlib', 'io', 'tempfile', 'operator', 'functools'):
                    self.fail(node, 'sibling-effect', f'a local module {os.path.relpath(c, self.root)} shadows the pure / stdlib name {base!r}')
                if c in self.seen: return
                self.seen.add(c)
                sub = Judge(c, self.root, self.depth + 1, self.seen)
                if sub.tree is None: self.fail(node, 'sibling', f'{os.path.relpath(c, self.root)} unparseable'); return
                sub.collect_defs(); sub.judge_module_scope_only()
                for f in sub.findings: self.findings.append({'line': node.lineno, 'kind': 'sibling-effect', 'text': f'{os.path.relpath(c, self.root)}:{f["line"]} {f["kind"]}: {f["text"]}'[:140]})
                # the sibling's functions become judgeable at THIS tool's call sites (from x import f / x.f(...)): registered under both names
                for name, fn in sub.funcs.items():
                    self.funcs.setdefault(name, fn); self.funcs.setdefault(f'{base}.{name}', fn)
                return

    def judge_imports(self, stmt):
        names = []
        if isinstance(stmt, ast.Import): names = [a.name for a in stmt.names]
        elif isinstance(stmt, ast.ImportFrom) and stmt.module: names = [stmt.module]
        for nm in names:
            rel = nm.replace('.', '/') + '.py'
            self.judge_sibling(rel, stmt)
        # sys.path.insert(0, <literal dir>) widens the sibling search
        for n in ast.walk(stmt):
            if isinstance(n, ast.Call) and dotted(n.func) and self.real(dotted(n.func)) == 'sys.path.insert':
                for lit in re.findall(r"['\"]([\w./-]+)['\"]", ast.unparse(n)):
                    for base in (os.path.dirname(self.path), self.root):
                        self.sys_path_dirs.append(os.path.join(base, lit))

    def judge_module_scope_only(self):
        """a sibling module: everything executed at import (no dispatch)"""
        for stmt in self.tree.body:
            if isinstance(stmt, ast.If) and 'if __name__' in ast.unparse(stmt)[:20]: continue
            self.judge_imports(stmt)
            self.judge_expr(stmt, 'module')

    # ---------- entry
    def run(self):
        if self.tree is None: return self.result(judged=True)
        self.collect_defs()
        src_flat = self.src
        has_inv_ref = any(re.search(r'(?<![\w.])' + re.escape(n) + r'\s*\(', src_flat) for n in INV_NAMES) or bool(re.search(r'\b(os\.(remove|unlink|rmdir|rename|replace|removedirs)|shutil\.(rmtree|move)|\.(unlink|rmdir|replace|rename)\(|sys\.modules|methodcaller\(|__dict__\[)', src_flat))
        has_parse = bool(re.search(r'\bparse_args\s*\(', src_flat)) or bool(self.marker_lines)
        judged = has_inv_ref   # the law is about INVALIDATING tools; a non-invalidating tool's parse is its own business (FIX2 hygiene)
        if not judged: return self.result(judged=False)
        # module level, in order; the dispatch (`if __name__`) is followed into the local functions it calls
        for stmt in self.tree.body:
            if isinstance(stmt, ast.If) and 'if __name__' in ast.unparse(stmt)[:20]:
                for inner in stmt.body:
                    if self.stmt_reaches_parse(inner): self.judge_before_parse_in_stmt(inner); break
                    self.judge_imports(inner); self.judge_expr(inner, 'dispatch')
                    for n in executed_nodes(inner):
                        if isinstance(n, ast.Call) and dotted(n.func) in self.funcs: self.judge_func(self.funcs[dotted(n.func)], n)
                    if self.parser_line is not None: break
                break
            if self.stmt_reaches_parse(stmt): self.judge_before_parse_in_stmt(stmt); break
            self.judge_imports(stmt)
            self.judge_expr(stmt, 'module')
        # the first invalidation call in the file (by line), and the rule: invalidating ⇒ a parse exists
        for n in ast.walk(self.tree):
            if isinstance(n, ast.Call):
                d = dotted(n.func)
                if d and d.split('.')[-1] in INV_NAMES:
                    if self.first_inv_line is None or n.lineno < self.first_inv_line: self.first_inv_line = n.lineno
        if self.parser_line is None:
            for i, l in enumerate(self.lines):
                if re.search(r'\bparse_args\s*\(', l) and not l.strip().startswith('#'): self.parser_line = i + 1; break
        if has_inv_ref and self.parser_line is None: self.fail(self.tree, 'no-parser', 'the file invalidates / removes but has no parse to completion (parse_args / the parse-complete marker)')
        return self.result(judged=True)

    def result(self, judged):
        seen = set(); out = []
        for f in self.findings:
            k = (f['line'], f['kind'], f['text'])
            if k not in seen: seen.add(k); out.append(f)
        return {'file': os.path.relpath(self.path, os.path.join(self.root, '..', '..')), 'parser_line': self.parser_line, 'first_inv_line': self.first_inv_line, 'findings': out, 'judged': judged}


if __name__ == '__main__':
    if len(sys.argv) < 3: print('usage: parse_first_ast.py <tools/render root> <file.py> [more files]', file=sys.stderr); sys.exit(2)
    root = os.path.abspath(sys.argv[1]); out = []
    for f in sys.argv[2:]:
        out.append(Judge(f, root).run())
    print(json.dumps(out))
