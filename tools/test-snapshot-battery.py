#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""test-snapshot-battery.py — the public snapshot battery's account-identity gate for files that are not text, and its
content-marker gate.

sync.battery() walks the public checkout before every publish and fails on any BATTERY marker. Its text pass
reads each file as UTF-8 and skips the rest; only the web/dist wasm string tables had a byte scan, so an image,
model or font whose metadata carried a home path or a personal account, or whose NAME did, shipped unchecked.
The gate: a file that is not UTF-8 text has its name checked against every marker and its bytes against the
account-identity markers (manifest BATTERY_BINARY), single-byte and UTF-16LE; an unreadable file is a failure.
The content-marker gate (manifest BATTERY_LINE): the private workflow's own vocabulary, in classes, judged per
line in every shipped text, and in every file name and dist wasm string table; a hit fails as file:line unless
manifest BATTERY_LINE_ALLOW names its exact path, marker and stripped line.
This arm builds small public trees from those markers (it names none itself: it ships in the snapshot, where the
battery reads it as text) and asserts:
  B0  a clean tree (a text file, a binary, a dist wasm): no failure
  B1  a text file carrying a marker: its text row (the text pass, unchanged). B1, B2, B4 and B5 plant the first identity
      marker that no content marker also flags (an account name can carry a two-word content marker's words)
  B2  a binary carrying a marker as single-byte text (an image metadata chunk): its '(binary)' row
  B3  a binary carrying a marker in UTF-16LE: its '(binary)' row
  B4  a binary whose name carries a marker: its name row
  B5  a dist wasm carrying a marker: its '(wasm)' row only (no second '(binary)' row)
  B6  a binary carrying a BATTERY word outside BATTERY_BINARY: no row (binary bytes meet the identity markers only)
  B7  an unreadable binary: its '(binary): unreadable' row (skipped when running as root, who reads it anyway)
  B8  BATTERY_BINARY is non-empty, inside BATTERY and pinned below by digest, BATTERY_BOUNDARY and the content
      marker set (BATTERY_LINE with BATTERY_LINE_START) are pinned by digest; this file carries no BATTERY marker
      and no content marker
  B9  a BATTERY_BOUNDARY marker matches as a word only: inside an identifier no row, bounded by punctuation its row
  B10 the two allow rows scoped to the render-only library's exclusion literals (ALLOW_PAIR: the precache skip and
      the native bundle exclusion, one marker for both, read from manifest BATTERY_ALLOW): each file carrying an
      exclusion literal of that marker gives no row
  B11 a shipped asset carrying the same literal: its row
  B12 a third tools file carrying the same literal: its row (the allow rows are exact paths, not a tools scope)
  B13 every content marker on its own line: a row per line; the class leaders in upper case: their rows; a lone CR
      inside a line: the row keeps that line's number; a binary named after a marker, a text file named after one in
      mixed case, and a file under a directory named after one: their name rows
  B14 the allow key is exact (the first BATTERY_LINE_ALLOW row whose line carries one marker): the allowed line in
      its file gives no row, nor does it indented or ending in CR LF; another line of that file naming the marker,
      the allowed line with text appended, with its case swapped and with an inner space doubled, and the allowed
      line in another file, in a same-named file elsewhere, under a path ending in the allowed path and in a sibling
      of the same directory give their rows; a line naming two markers, allowed for one of them (by a row this arm
      injects), gives the other's row
  B15 a BATTERY_LINE_START marker after a letter, or after a letter that follows a backslash escape: no row; after
      punctuation, an underscore, a digit or a backslash escape (a JSON string's \\n): its row; a marker outside
      BATTERY_LINE_START after a letter: its row
  B16 a two-word content marker split by a line break, wrapped onto a comment's next line (# // * -- > //! ; %), split
      by two spaces or an indent, joined by a quote concatenation, a backslash escape, a pipe, a dot, a colon or an
      HTML entity, or written in camelCase: its row, on its first line; its words joined by a letter or a digit: no row
  B17 dist wasms under pool-wasm and pool-rules carrying a content marker, one glued after a letter (a word-start
      marker) and one in upper case: their '(wasm)' rows
  B18 symlinks: a directory symlink named after a marker, a directory symlink whose target names one (by its base
      name, or only above it), a file symlink whose target names one, and a file symlink named after one: their rows
--selftest then plants copies of the pipeline, each where it must be caught, and requires the named case red:
  P1  the binary pass removed -> B2, B3, B4
  P2  the UTF-16LE form dropped -> B3
  P3  the binary name check dropped -> B4
  P4  BATTERY_BINARY emptied -> B2, B3, B8
  P5  the dist wasm skip dropped (a second row for one hit) -> B5
  P6  an unreadable binary skipped silently -> B7 (vacuous as root)
  P7  BATTERY_BOUNDARY emptied (every marker a bare substring) -> B9, B8
  P8  the precache skip's allow row widened to every web/tools file -> B12
  P9  the native bundle exclusion's allow row dropped -> B10
  P10 the per-line pass dropped -> B13, B14, B15, B16
  P11 the line allow keyed by path and marker only (any line passes) -> B14
  P12 BATTERY_LINE_START emptied (every content marker a bare substring) -> B15, B8
  P13 a two-word marker's words joined by one space only -> B16
  P14 the content-marker name check dropped -> B13
  P15 the content-marker wasm scan dropped -> B17
  P16 the first content marker of a class removed (one outside BATTERY_LINE_START and the allow rows) -> B13, B8
  P17 the per-line pass without case folding -> B13
  P18 the allow key matched by containment -> B14
  P19 the allow key matched by base name -> B14
  P20 the allow key without its marker -> B14
  P21 a directory symlink's own name unchecked -> B18
  P22 a directory symlink's target unchecked for content markers -> B18
  P23 the per-line pass skipped for a file symlink -> B18
  P24 the name check on the base name only -> B13
  P25 the word-start rule applied to every marker -> B15
  P26 the word-start rule also refusing an underscore -> B15
  P27 a two-word marker joined by whitespace only -> B16
  P28 a two-word marker joined by one character or escape only -> B16
  P29 the wasm scan with the word-start rule -> B17
  P30 the text read with newline translation (a lone CR splits its line) -> B13
  P31 the word-start rule also refusing a digit -> B15
  P32 the word-start rule refusing the letter of a backslash escape -> B15
  P33 the joiner without backslash escapes -> B16
  P34 the joiner without HTML entities -> B16
  P35 the joiner requiring a character (camelCase missed) -> B16
  P36 the joiner's characters narrowed to whitespace, comment leaders and - _ -> B16
  P37 the wasm scan limited to web/dist/pool-wasm -> B17
  P38 the allow key matched by path suffix -> B14
  P39 the allow key matched by directory -> B14
  P40 the allow key compared without case -> B14
  P41 the allow key compared with whitespace collapsed -> B14
  P42 the allow key compared unstripped -> B14
  P43 the content-marker name check without case folding -> B13
  P44 the wasm scan without case folding -> B17
  P45 the name check skipped for a file symlink -> B18
  P46 a directory symlink's target checked by its base name only -> B18
Usage: python3 tools/test-snapshot-battery.py [--sync-dir <dir>] [--selftest]
  --sync-dir: the pipeline under test (default scripts/opensource/sync-public-snapshot)
Exit 0 green, 1 red, 2 could not run. The public snapshot excludes scripts/opensource: there the arm prints a
named SKIP and exits 0.
"""
import hashlib, os, shutil, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNC = 'scripts/opensource/sync-public-snapshot'
# sha256 of '\n'.join(sorted(BATTERY_BINARY)): changing the account-identity marker set needs a deliberate edit here
EXPECTED_BINARY_DIGEST = '50e522d4e019524ca99b3b04bf60fabd894fcec8e97dc7eb86958b85fedac59b'
# sha256 of '\n'.join(sorted(BATTERY_BOUNDARY)): changing the word-boundary marker set needs a deliberate edit here
EXPECTED_BOUNDARY_DIGEST = '16ae1ea8f855a0f3f043dac342ae54f6fd30d8fea4c859cbe1e5509e8f2b0cae'
# sha256 of line_set(): changing the content marker set needs a deliberate edit here
EXPECTED_LINE_DIGEST = 'e24211a45fda99c0634e28c5a81909ed26b42cac2761ccb42671e02c20c57e46'
# the two files whose exclusion-only literals name the render-only library (B10-B12): one allow row each, one marker
ALLOW_PAIR = ('web/tools/gen-sw-precache.mjs', 'ios/tools/bundle-manifest.mjs')
FILLER = bytes(range(0x80, 0x100))  # never valid UTF-8, never a marker
INJECT = {}  # case name -> allow rows the arm adds to the pipeline's line allow-list while that case runs (B14)
PNG = b'\x89PNG\r\n\x1a\n'
WASM = b'\x00asm\x01\x00\x00\x00'


def die(why):
    print(f'snapshot battery: could not run — {why}')
    sys.exit(2)


def load(sync_dir):
    for m in ('sync', 'manifest'):
        sys.modules.pop(m, None)
    sys.path.insert(0, sync_dir)
    try:
        import sync  # noqa: E402 (a fresh module per pipeline directory)
        return sync
    finally:
        sys.path.remove(sync_dir)


def binary(payload=b''):
    return PNG + FILLER + payload + FILLER


def pair_marker(M):
    """the one marker both ALLOW_PAIR rows name (B10-B12 and P8/P9 are built from it, so this file names none)"""
    allow = {(p, m) for p, m in M.BATTERY_ALLOW}
    both = sorted(m for m in {m for _, m in M.BATTERY_ALLOW} if all((p, m) in allow for p in ALLOW_PAIR))
    if len(both) != 1:
        die(f'manifest BATTERY_ALLOW gives {len(both)} marker(s) shared by {", ".join(ALLOW_PAIR)}, not one')
    return both[0]


def line_set(M):
    """the content marker set as pinned: each class with its sorted markers, then the word-start markers"""
    rows = [f'{c}: {", ".join(sorted(ms))}' for c, ms in sorted(getattr(M, 'BATTERY_LINE', {}).items())]
    return '\n'.join(rows + [f'start: {", ".join(sorted(getattr(M, "BATTERY_LINE_START", set())))}'])


def line_cases(M):
    """B13-B18, built from manifest BATTERY_LINE, BATTERY_LINE_START and BATTERY_LINE_ALLOW (this file names none)"""
    classes = getattr(M, 'BATTERY_LINE', {})
    first = [ms[0] for ms in classes.values() if ms]
    start = sorted(getattr(M, 'BATTERY_LINE_START', set()))
    every = [m for ms in classes.values() for m in ms]
    plain = next((m for m in every if m not in start and ' ' not in m), None)
    two = next((m for m in every if ' ' in m), None)
    row = next((r for r in getattr(M, 'BATTERY_LINE_ALLOW', []) if sum(m in r[2].lower() for m in every) == 1), None)
    if len(first) < 3 or len(start) < 2 or plain is None or two is None or row is None:
        die('the content marker sets give fewer than 3 classes or 2 word-start markers, no other marker, no two-word '
            'marker or no allow row whose line carries one marker')
    path, mark, line = row[:3]
    if len(first) < 4 or len({first[0], start[1], first[3]}) < 3 or first[0].title() == first[0]:
        die('the content marker sets give no fourth class, no three distinct wasm markers or no cased class leader')
    if line.swapcase() == line or ' ' not in line:
        die(f'the allow row of {path} has no cased letter or no inner space to vary (B14)')
    base = f'elsewhere/{os.path.basename(path)}'
    sibling = os.path.join(os.path.dirname(path), f'zz-{os.path.basename(path)}')
    pair = f'{first[0]} and {first[2]}'
    INJECT['B14'] = {('docs/two.md', first[0], pair)}
    w1, w2 = two.split(' ', 1)
    wraps = ('#', '//', ' *', '--', '>', '//!', ';', '%')
    joins = ("' + '", '\\n', ' | ', '.', ': ', '&nbsp;', '&#160;')  # a quote concatenation, an escape, entities
    wasm, rules = 'web/dist/pool-wasm/y_bg.wasm', 'web/dist/pool-rules/z_bg.wasm'
    return {
        'B13': ({'docs/lines.md': ''.join(f'line {i} names {m} here\n' for i, m in enumerate(every, 1)).encode(),
                 'docs/upper.md': ''.join(f'{m.upper()}\n' for m in first).encode(),
                 'docs/cr.md': f'progress\rthen {first[0]}\n'.encode(),
                 f'assets/{first[0]}.png': binary(), f'docs/{first[0].title()}.txt': b'clean\n',
                 f'docs/{first[1]}/clean.txt': b'clean\n'},
                [f'docs/lines.md:{i}: {m}' for i, m in enumerate(every, 1)]
                + [f'docs/upper.md:{i}: {m}' for i, m in enumerate(first, 1)]
                + [f'docs/cr.md:1: {first[0]}', f'assets/{first[0]}.png: {first[0]}',
                   f'docs/{first[0].title()}.txt: {first[0]}', f'docs/{first[1]}/clean.txt: {first[1]}']),
        'B14': ({path: (f'{line}\nanother line names {mark}\n{line} and {mark}\n{line.swapcase()}\n'
                        f'{line.replace(" ", "  ", 1)}\n    {line}\n{line}\r\n').encode(),
                 'docs/copy.md': f'{line}\n'.encode(), base: f'{line}\n'.encode(), f'x/{path}': f'{line}\n'.encode(),
                 sibling: f'{line}\n'.encode(), 'docs/two.md': f'{pair}\n'.encode()},
                [f'{path}:{n}: {mark}' for n in (2, 3, 4, 5)]
                + [f'{p}:1: {mark}' for p in ('docs/copy.md', base, f'x/{path}', sibling)]
                + [f'docs/two.md:1: {first[2]}']),
        'B15': ({'docs/glued.md': ''.join(f'x{m}\n\\nx{m}\n' for m in start).encode(),
                 'docs/start.md': ''.join(f'({m})\n' for m in start).encode(),
                 'docs/under.md': ''.join(f'_{m}\n' for m in start).encode(),
                 'docs/digit.md': ''.join(f'2{m}\n' for m in start).encode(),
                 'docs/escape.md': ''.join(f'"a\\n{m}"\n' for m in start).encode(),
                 'docs/plain.md': f'x{plain}\n'.encode()},
                [f'docs/{f}.md:{i}: {m}' for f in ('start', 'under', 'digit', 'escape') for i, m in enumerate(start, 1)]
                + [f'docs/plain.md:1: {plain}']),
        'B16': ({'docs/wrap.md': f'the {w1}\n{w2} rule\n'.encode(),
                 'docs/wrap-comment.md': ''.join(f'the {w1}\n{lead} {w2} rule\n' for lead in wraps).encode(),
                 'docs/wrap-space.md': f'the {w1}  {w2} rule\nthe {w1}\n    {w2} rule\n'.encode(),
                 'docs/join.md': (''.join(f'the {w1}{j}{w2} rule\n' for j in joins)
                                  + f'the {w1}{w2[0].upper()}{w2[1:]} rule\n').encode(),
                 'docs/join-no.md': f'the {w1}x{w2} rule\nthe {w1}2{w2} rule\n'.encode()},
                [f'docs/wrap.md:1: {two}'] + [f'docs/wrap-comment.md:{2 * i + 1}: {two}' for i in range(len(wraps))]
                + [f'docs/wrap-space.md:1: {two}', f'docs/wrap-space.md:2: {two}']
                + [f'docs/join.md:{i}: {two}' for i in range(1, len(joins) + 2)]),
        'B17': ({wasm: WASM + FILLER + first[0].encode() + FILLER + f'error{start[1]}'.encode() + FILLER
                 + first[3].upper().encode() + FILLER,
                 rules: WASM + FILLER + first[1].encode() + FILLER},
                [f'{wasm} (wasm): {first[0]}', f'{wasm} (wasm): {start[1]}', f'{wasm} (wasm): {first[3]}',
                 f'{rules} (wasm): {first[1]}']),
        'B18': ({'docs/tgt/keep.txt': b'clean\n', f'docs/{first[0]}-link': ('symlink', 'tgt'),
                 f'docs/{first[1]}-dir': ('dir',), 'docs/link2': ('symlink', f'{first[1]}-dir'),
                 f'docs/{first[1]}-up/sub': ('dir',), 'docs/link3': ('symlink', f'{first[1]}-up/sub'),
                 'docs/flink': ('symlink', f'../{first[2]}/x.txt'),
                 f'docs/{first[0]}-flink': ('symlink', 'tgt/keep.txt')},
                [f'docs/{first[0]}-link: {first[0]}', f'docs/link2 (symlink target): {first[1]}',
                 f'docs/link3 (symlink target): {first[1]}', f'docs/flink:1: {first[2]}',
                 f'docs/{first[0]}-flink: {first[0]}']),
    }


def build_cases(M, sync):
    mk = list(M.BATTERY_BINARY)
    if not mk:
        die('manifest BATTERY_BINARY is empty: nothing to plant (B8 pins it)')
    orig = {m.lower(): m for m in M.BATTERY}
    # the identity markers no content marker also flags (sync's own wasm patterns, the widest), so B1, B4 and B5
    # each give their one BATTERY row
    lone = [m for m in mk if not any(rx.search(m) for rx in getattr(sync, 'WASM_RX', {}).values())]
    named = next((m for m in lone if '/' not in m), None)
    word = next((m for m in M.BATTERY if m.lower() not in mk and m.isalpha() and len(m) >= 5), None)
    if named is None or word is None:
        die('the marker sets give no file-name marker outside the content markers or no non-identity word to plant')
    a, b = lone[0], mk[-1]
    cases = {
        'B0': ({'README.md': b'a clean text file\n', 'assets/clean.png': binary(),
                'web/dist/pool-wasm/clean_bg.wasm': WASM + FILLER}, []),
        'B1': ({'docs/note.md': f'a note that names {a} here\n'.encode()}, [f'docs/note.md: {orig[a]}']),
        'B2': ({'assets/shot.png': binary(b'tEXtSource\x00' + a.encode() + b'render')}, [f'assets/shot.png (binary): {a}']),
        'B3': ({'assets/model.glb': binary(f'texture {b}t.png'.encode('utf-16-le'))}, [f'assets/model.glb (binary): {b}']),
        'B4': ({f'assets/{named}-logo.png': binary()}, [f'assets/{named}-logo.png: {orig[named]}']),
        'B5': ({'web/dist/pool-wasm/x_bg.wasm': WASM + FILLER + named.encode() + FILLER},
               [f'web/dist/pool-wasm/x_bg.wasm (wasm): {orig[named]}']),
        'B6': ({'assets/other.png': binary(word.encode())}, []),
        'B7': ({'assets/locked.png': binary()}, ['assets/locked.png (binary): unreadable (Permission denied)']),
        # the boundary markers, built from the manifest (this file names none): each inside an identifier, then bounded
        'B9': ({'docs/ident.md': (' '.join(f'a{m}b' for m in sorted(M.BATTERY_BOUNDARY)) + '\n').encode(),
                'docs/word.md': (' '.join(f'({m})' for m in sorted(M.BATTERY_BOUNDARY)) + '\n').encode()},
               [f'docs/word.md: {orig[m]}' for m in sorted(M.BATTERY_BOUNDARY)]),
    }
    pm = pair_marker(M)
    lit = f"const SKIP = ['web/vendor/{pm}/'];  // an exclusion-only literal\n".encode()
    cases['B10'] = ({p: lit for p in ALLOW_PAIR}, [])
    cases['B11'] = ({'web/app/zz-asset.js': lit}, [f'web/app/zz-asset.js: {orig[pm]}'])
    cases['B12'] = ({'web/tools/zz-third.mjs': lit}, [f'web/tools/zz-third.mjs: {orig[pm]}'])
    cases.update(line_cases(M))
    return cases


def run_case(sync, parent, name, files):
    tree = tempfile.mkdtemp(prefix=f'{name}-', dir=parent)
    for rel, data in files.items():
        full = os.path.join(tree, rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        if data == ('dir',):
            os.makedirs(full, exist_ok=True)
        elif isinstance(data, tuple):
            os.symlink(data[1], full)
        else:
            with open(full, 'wb') as f:
                f.write(data)
        if name == 'B7':
            os.chmod(full, 0)
    allow = getattr(sync, 'LINE_ALLOW', set())
    added = INJECT.get(name, set()) - allow
    allow |= added
    try:
        return sorted(sync.battery(tree))
    finally:
        allow -= added


def marker_set_red(sync):
    M = sync.M
    reds = []
    mk = list(getattr(M, 'BATTERY_BINARY', []))
    if not mk:
        reds.append('BATTERY_BINARY is empty')
    if not {m.lower() for m in mk} <= {m.lower() for m in M.BATTERY}:
        reds.append('BATTERY_BINARY is not inside BATTERY')
    digest = hashlib.sha256('\n'.join(sorted(mk)).encode()).hexdigest()
    if digest != EXPECTED_BINARY_DIGEST:
        reds.append(f'BATTERY_BINARY digest {digest[:12]} != the pinned {EXPECTED_BINARY_DIGEST[:12]}')
    bdigest = hashlib.sha256('\n'.join(sorted(getattr(M, 'BATTERY_BOUNDARY', set()))).encode()).hexdigest()
    if bdigest != EXPECTED_BOUNDARY_DIGEST:
        reds.append(f'BATTERY_BOUNDARY digest {bdigest[:12]} != the pinned {EXPECTED_BOUNDARY_DIGEST[:12]}')
    ldigest = hashlib.sha256(line_set(M).encode()).hexdigest()
    if ldigest != EXPECTED_LINE_DIGEST:
        reds.append(f'content marker digest {ldigest[:12]} != the pinned {EXPECTED_LINE_DIGEST[:12]}')
    own = open(os.path.abspath(__file__), encoding='utf-8').read().lower()
    named = [m for m in M.BATTERY if sync.marker_hit(m, own)]
    if named:
        reds.append(f'this file carries {len(named)} BATTERY marker(s)')
    rx = getattr(sync, 'line_marker_rx', None)
    content = [m for ms in getattr(M, 'BATTERY_LINE', {}).values() for m in ms
               if m in own or (rx is not None and rx(m).search(own))]
    if content:
        reds.append(f'this file carries {len(content)} content marker(s)')
    return reds


def arm(sync_dir, cases, parent, root_user):
    sync = load(sync_dir)
    reds = {}
    for name, (files, want) in cases.items():
        if name == 'B7' and root_user:
            continue
        got = run_case(sync, parent, name, files)
        if got != sorted(want):
            reds[name] = f'got {got}, want {sorted(want)}'
    r8 = marker_set_red(sync)
    if r8:
        reds['B8'] = '; '.join(r8)
    return reds


PLANTS = [
    ('P1', ['B2', 'B3', 'B4'], 'sync.py', '    for full, rel in binaries:\n', '    for full, rel in []:\n'),
    ('P2', ['B3'], 'sync.py', 'if marker.encode() in data or marker.encode("utf-16-le") in data:',
     'if marker.encode() in data:'),
    ('P3', ['B4'], 'sync.py', 'marker_hit(marker, rel.lower())', 'False'),
    ('P4', ['B2', 'B3', 'B8'], 'manifest.py', '\nBATTERY_BINARY = [', '\nBATTERY_BINARY = [] and ['),
    ('P5', ['B5'], 'sync.py', '        if rel.startswith("web/dist/") and rel.endswith(".wasm"):\n            continue\n', ''),
    ('P6', ['B7'], 'sync.py', '            fails.append(f"{rel} (binary): unreadable ({e.strerror})")\n', '            pass\n'),
    ('P7', ['B9', 'B8'], 'manifest.py', '\nBATTERY_BOUNDARY = {', '\nBATTERY_BOUNDARY = set() and {'),
    ('P10', ['B13', 'B14', 'B15', 'B16'], 'sync.py', '            fails += line_hits(rel, text)\n', ''),
    ('P11', ['B14'], 'sync.py', '            if (rel, marker, lines[n - 1].strip()) not in LINE_ALLOW:\n',
     '            if not any(a[:2] == (rel, marker) for a in LINE_ALLOW):\n'),
    ('P12', ['B15', 'B8'], 'manifest.py', '\nBATTERY_LINE_START = {', '\nBATTERY_LINE_START = set() and {'),
    ('P13', ['B16'], 'sync.py', 'words = LINE_JOINER.join(', 'words = " ".join('),
    ('P14', ['B13'], 'sync.py', '\n            fails += [f"{rel}: {m}" for m in name_hits(rel)]\n', '\n'),
    ('P15', ['B17'], 'sync.py', '            fails += [f"{wrel} (wasm): {m}" for m, rx in WASM_RX.items() if rx.search(blob)]\n', ''),
    ('P17', ['B13'], 'sync.py', '    low, lines, rows = text.lower(), None, []\n', '    low, lines, rows = text, None, []\n'),
    ('P18', ['B14'], 'sync.py', '            if (rel, marker, lines[n - 1].strip()) not in LINE_ALLOW:\n',
     '            if not any(a[:2] == (rel, marker) and a[2] in lines[n - 1] for a in LINE_ALLOW):\n'),
    ('P19', ['B14'], 'sync.py', '            if (rel, marker, lines[n - 1].strip()) not in LINE_ALLOW:\n',
     '            if not any(os.path.basename(a[0]) == os.path.basename(rel) and a[1:] == (marker, lines[n - 1].strip())'
     ' for a in LINE_ALLOW):\n'),
    ('P20', ['B14'], 'sync.py', '            if (rel, marker, lines[n - 1].strip()) not in LINE_ALLOW:\n',
     '            if not any((a[0], a[2]) == (rel, lines[n - 1].strip()) for a in LINE_ALLOW):\n'),
    ('P21', ['B18'], 'sync.py', '                fails += [f"{rel}: {m}" for m in name_hits(rel)]\n', ''),
    ('P22', ['B18'], 'sync.py', '                fails += [f"{rel} (symlink target): {m}" for m in name_hits(target)]\n', ''),
    ('P23', ['B18'], 'sync.py', '            fails += line_hits(rel, text)\n',
     '            fails += [] if os.path.islink(full) else line_hits(rel, text)\n'),
    ('P24', ['B13'], 'sync.py', '\n            fails += [f"{rel}: {m}" for m in name_hits(rel)]\n',
     '\n            fails += [f"{rel}: {m}" for m in name_hits(os.path.basename(rel))]\n'),
    ('P25', ['B15'], 'sync.py', '(LINE_START if start and marker in M.BATTERY_LINE_START else "")', 'LINE_START'),
    ('P26', ['B15'], 'sync.py', 'LINE_START = r"(?:(?<![a-z])|', 'LINE_START = r"(?:(?<![a-z_])|'),
    ('P27', ['B16'], 'sync.py', 'words = LINE_JOINER.join(', 'words = r"\\s+".join('),
    ('P28', ['B16'], 'sync.py', '|&#?[a-z0-9]+;)*"', '|&#?[a-z0-9]+;)?"'),
    ('P29', ['B17'], 'sync.py', 'for m, rx in WASM_RX.items() if rx.search(blob)]', 'for m, rx in LINE_RX.items() if rx.search(blob)]'),
    ('P30', ['B13'], 'sync.py', 'text = open(full, encoding="utf-8", newline="").read()', 'text = open(full, encoding="utf-8").read()'),
    ('P31', ['B15'], 'sync.py', 'LINE_START = r"(?:(?<![a-z])|', 'LINE_START = r"(?:(?<![a-z0-9])|'),
    ('P32', ['B15'], 'sync.py', 'LINE_START = r"(?:(?<![a-z])|(?<=\\\\[a-z]))"', 'LINE_START = r"(?<![a-z])"'),
    ('P33', ['B16'], 'sync.py', 'LINE_JOINER = r"(?:[^a-z0-9]|\\\\[a-z]|', 'LINE_JOINER = r"(?:[^a-z0-9]|'),
    ('P34', ['B16'], 'sync.py', '|&#?[a-z0-9]+;)*"', ')*"'),
    ('P35', ['B16'], 'sync.py', '|&#?[a-z0-9]+;)*"', '|&#?[a-z0-9]+;)+"'),
    ('P36', ['B16'], 'sync.py', 'LINE_JOINER = r"(?:[^a-z0-9]|', 'LINE_JOINER = r"(?:[\\s#*/>_-]|'),
    ('P37', ['B17'], 'sync.py', 'for dirpath, dirs, files in os.walk(os.path.join(public, "web/dist")):',
     'for dirpath, dirs, files in os.walk(os.path.join(public, "web/dist/pool-wasm")):'),
    ('P38', ['B14'], 'sync.py', '            if (rel, marker, lines[n - 1].strip()) not in LINE_ALLOW:\n',
     '            if not any(rel.endswith(a[0]) and a[1:] == (marker, lines[n - 1].strip()) for a in LINE_ALLOW):\n'),
    ('P39', ['B14'], 'sync.py', '            if (rel, marker, lines[n - 1].strip()) not in LINE_ALLOW:\n',
     '            if not any(os.path.dirname(a[0]) == os.path.dirname(rel) and a[1:] == (marker, lines[n - 1].strip())'
     ' for a in LINE_ALLOW):\n'),
    ('P40', ['B14'], 'sync.py', '            if (rel, marker, lines[n - 1].strip()) not in LINE_ALLOW:\n',
     '            if not any(a[:2] == (rel, marker) and a[2].lower() == lines[n - 1].strip().lower() for a in LINE_ALLOW):\n'),
    ('P41', ['B14'], 'sync.py', '            if (rel, marker, lines[n - 1].strip()) not in LINE_ALLOW:\n',
     '            if not any(a[:2] == (rel, marker) and a[2].split() == lines[n - 1].split() for a in LINE_ALLOW):\n'),
    ('P42', ['B14'], 'sync.py', '            if (rel, marker, lines[n - 1].strip()) not in LINE_ALLOW:\n',
     '            if (rel, marker, lines[n - 1]) not in LINE_ALLOW:\n'),
    ('P43', ['B13'], 'sync.py', '    low = name.lower()\n', '    low = name\n'),
    ('P44', ['B17'], 'sync.py', 'blob = open(full, "rb").read().lower().decode("latin-1")', 'blob = open(full, "rb").read().decode("latin-1")'),
    ('P45', ['B18'], 'sync.py', '\n            fails += [f"{rel}: {m}" for m in name_hits(rel)]\n',
     '\n            fails += [] if os.path.islink(full) else [f"{rel}: {m}" for m in name_hits(rel)]\n'),
    ('P46', ['B18'], 'sync.py', 'for m in name_hits(target)]', 'for m in name_hits(os.path.basename(target))]'),
]


def main():
    args = sys.argv[1:]
    selftest = '--selftest' in args
    sync_dir = os.path.join(ROOT, SYNC)
    if '--sync-dir' in args:
        i = args.index('--sync-dir')
        if i + 1 >= len(args):
            die('--sync-dir needs a value')
        sync_dir = os.path.abspath(args[i + 1])
    elif not os.path.exists(os.path.join(sync_dir, 'sync.py')):
        print(f'snapshot battery: SKIP — {SYNC}/sync.py is absent (the public snapshot excludes {SYNC})')
        return 0
    for f in ('sync.py', 'manifest.py'):
        if not os.path.exists(os.path.join(sync_dir, f)):
            die(f'--sync-dir {sync_dir} has no {f}')
    root_user = hasattr(os, 'geteuid') and os.geteuid() == 0
    parent = tempfile.mkdtemp(prefix='obw-snapshot-battery-')
    try:
        S = load(sync_dir)
        M = S.M
        cases = build_cases(M, S)  # the markers come from the pipeline under test, never from this file
        pm = pair_marker(M)
        plants = PLANTS + [
            ('P8', ['B12'], 'manifest.py', f'    ("{ALLOW_PAIR[0]}", "{pm}"),', f'    ("web/tools/*", "{pm}"),'),
            ('P9', ['B10'], 'manifest.py', f'    ("{ALLOW_PAIR[1]}", "{pm}"),\n', ''),
        ]
        cut = next((ms[0] for ms in M.BATTERY_LINE.values() if ms and ms[0] not in M.BATTERY_LINE_START
                    and all(r[1] != ms[0] for r in M.BATTERY_LINE_ALLOW)), None)
        if cut is None:
            die('no class leads with a content marker outside BATTERY_LINE_START and the allow rows (P16 removes one)')
        plants.append(('P16', ['B13', 'B8'], 'manifest.py', f'["{cut}", ', '['))
        reds = arm(sync_dir, cases, parent, root_user)
        for name in sorted(reds):
            print(f'  RED  {name}: {reds[name]}')
        if reds:
            print(f'snapshot battery: RED ({len(reds)})')
            return 1
        print(f'snapshot battery: OK — {len(cases) - (1 if root_user else 0)} trees as required'
              f'{" (B7 skipped: root reads every file)" if root_user else ""}, marker sets pinned, this file names no marker')
        if not selftest:
            return 0
        bad = 0
        for name, want, fname, old, new in plants:
            if name == 'P6' and root_user:
                print(f'  --   {name}: vacuous as root (B7 does not run)')
                continue
            copy = tempfile.mkdtemp(prefix=f'{name}-', dir=parent)
            for f in os.listdir(sync_dir):
                if f.endswith('.py'):
                    shutil.copyfile(os.path.join(sync_dir, f), os.path.join(copy, f))
            path = os.path.join(copy, fname)
            src = open(path, encoding='utf-8').read()
            if src.count(old) != 1:
                die(f'{name}: the plant target occurs {src.count(old)} times in {fname}')
            open(path, 'w', encoding='utf-8').write(src.replace(old, new))
            got = arm(copy, cases, parent, root_user)
            missing = [c for c in want if c not in got]
            if missing:
                bad += 1
                print(f'  BAD  {name}: expected red on {", ".join(want)}, missing {", ".join(missing)} (red: {", ".join(sorted(got)) or "none"})')
            else:
                print(f'  ok   {name}: red on {", ".join(want)}')
        if bad:
            print(f'snapshot battery --selftest: {bad} plant(s) not caught')
            return 1
        print(f'snapshot battery --selftest: OK ({len(plants)} plants)')
        return 0
    finally:
        for d, _, fs in os.walk(parent):
            for f in fs:
                try:
                    os.chmod(os.path.join(d, f), 0o600)
                except OSError:
                    pass
        shutil.rmtree(parent, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
