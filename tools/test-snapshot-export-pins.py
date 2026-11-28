#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""test-snapshot-export-pins.py — pins in shipped files that the public snapshot's export must keep true.

Shipped files pin text that the export changes:
  - web/tools/fixtures/equipment-mixed-cache-census.json pins each call site by line ([path, start, end, anchor]). The
    export adds the copyright header to the cited sources, so sync.shift_census_line_pins moves every span by the lines
    the cited file's export adds (sync.census_shift), and sync.public_changed re-exports the census whenever a cited
    source changes;
  - crates/pool-rules/tests/snooker_v2_slice.rs pins sha256(expect) for each case of its frozen slice
    (scripts/fixtures/rules-corpus-variants/wpbsa-snooker-full.json). The export rewrites the slice's dialect words, so
    a real sync refuses while a case would ship past its pin (sync.slice_pins_left in main());
  - three shipped files read the export's own copyright header as their tree marker (MARKER_FILES):
    web/tools/gen-sw-precache.mjs accepts the public +snapshot kernel stamp, sdk/ts/test/share.test.ts skips its two
    lineage-ledger tests, and sdk/ts/tools/sync-web.mjs writes the header on the dist files it mirrors, each only when
    its own line 1 is `// ` and manifest HEADER. The export stamps that line because each file names the holder only
    past the 800 characters add_header reads; the private tree must never carry it.
This arm asserts:
  N1  at --rev, the census exports with every span moved by its cited file's export offset (found here independently:
      the number of lines above the exported copy of the whole source), each moved span holding its anchor exactly once
  N2  sync.census_shift moves a clean span by the export offset, and refuses an anchor held twice in the source span,
      one held twice once moved, a missing anchor, a cited file that does not ship, and an anchor that occurs twice in
      the file. The boundary-shift case: a call repeated 20 lines apart, pinned at its second occurrence, with 20 lines
      prepended to the source and the pin left stale, the first occurrence lands in the pinned span and both span
      counts stay 1. The repeated call alone refuses; the call plus its next line resolves to the right line
  N3  sync.public_changed re-exports the census when only a cited source changed, and not when an uncited one did
  N4  sync.census_cited fails closed: a failed read, invalid JSON, a rows value that is not a list, a row whose
      call_sites is null, a call site that is not [path, start, end, anchor] (three fields, a string or boolean line,
      an empty path) and a failed tree listing refuse; it is empty when a listing of rev's tree shows the census
      absent; at --rev it returns exactly the census's cited paths
  S1  sync.slice_pin_mismatches names exactly the cases whose exported expect no longer hashes to its pin: the real
      slice at --rev with one case's expect replaced by one carrying a rewritten word (taken from manifest SED_PAIRS)
      and re-pinned, next to the cases the export already rewrites there
  S2  sync.py main() checks sync.slice_pins_left before its in-progress marker and raises outside --dry-run
  S3  sync.slice_pin_mismatches checks the frozen census before it hashes, on the real slice at --rev: the slice as it
      is passes, and it refuses one case removed, one case too many, no cases, a non-string expect, a case without
      id, kind or its own ruleset, another slice name or ruleset and an expectSha256 that is not 64 hex; sync's
      census constants equal the slice test's own assertions at --rev
  H1  at --rev, no marker file starts with the header line, and the export of each (sync.export_blob of the blob it
      ships) does
  H2  the marker files are exactly the shipped files at --rev whose text holds manifest HEADER, besides those
      CENSUS_OTHER lists with the reason each is not a reader, so a new reader of the marker joins MARKER_FILES and
      meets H1
  H3  the exported sdk/ts/tools/sync-web.mjs (the public mirror, run with node) writes byte for byte what
      sync.heal_dist_headers leaves, on every web/dist/pool-sdk file at --rev and on fixtures for each input where a
      naive mirror differs: CRLF and lone CR line ends, a #! line (with CRLF), a BOM, a file already headed (LF and
      CRLF), the holder inside the first 800 code points but past 800 UTF-16 units, and the holder just past 800
      code points; and a #! line with no newline is refused by both
  T1  every source the census cites at --rev, the census itself, the snooker slice, the slice test, the marker
      files, this arm, the pipeline's sync.py and manifest.py, and site-data.yml itself match a path filter of
      site-data.yml's push AND pull_request triggers, so a change to any of them runs this arm. It models literal
      paths and '**' only, and fails closed on any pattern it does not model: an exclusion ('!'), a '*' outside '**',
      '?', '+' or '['
--selftest plants copies of the pipeline, each where it must be caught, and requires its row red:
  P1  the census spans kept at their source lines -> N1
  P2  the span check removed (a span that misses its anchor accepted) -> N2
  P3  the census invalidation dropped from public_changed -> N3
  P4  slice_pin_mismatches always empty -> S1
  P5  main() prints the stale slice pin instead of refusing -> S2
  P6  a site-data.yml copy whose pull_request filters lose the web/app tree -> T1
  P7  the file-wide anchor check relaxed to presence only (the span counts left as the guard) -> N2
  P8  a site-data.yml copy whose push filter narrows sdk/ts/src/** to sdk/ts/src/* -> T1
  P9  a site-data.yml copy whose pull_request filters append !web/app/settings.js -> T1
  P10 a site-data.yml copy whose push filters append sdk/ts/src+/** (every cited source still covered) -> T1
  P11 census_cited swallowing a failed read or invalid JSON as an empty set again -> N4
  P12 slice_pin_mismatches hashing without the census check -> S3
  P14 census_cited taking a boolean as a line number -> N4
  P15 census_cited taking an empty path -> N4
  P16 census_cited reading a null call_sites as no call sites -> N4
  P17 the slice census checked from below only (one case too many passes) -> S3
  P18 the slice field check without id and the case's own ruleset -> S3
  P19 a site-data.yml copy whose pull_request filters lose the slice test -> T1
  P24 census_cited refusing at once -> N3 and N4 (arm() reports rows; it does not raise)
  P27 a marker file whose private copy starts with the header line -> H1
  P28 a marker file that names the holder in its first 800 characters (the export no longer stamps its line 1) -> H1
  P29 a manifest copy whose HEADER_SLASH drops .mjs (the export stamps no header on the two .mjs readers) -> H1
  P30 sdk/ts/tools/sync-web.mjs left out of MARKER_FILES -> H2
  P31 a site-data.yml copy whose push filters lose sdk/ts/tools/sync-web.mjs -> T1
  P32 a sync-web.mjs copy that keeps CR line ends when it adds the header -> H3
  P33 a sync-web.mjs copy that looks for the holder in the first 800 UTF-16 units -> H3
  P34 a sync-web.mjs copy that puts the header above a #! line -> H3
  P35 a sync-web.mjs copy that mirrors a #! line with no newline instead of refusing it -> H3
  P36 a pipeline copy whose heal reads without newline translation -> H3
  K1  this script, run end to end in scratch git repos (no GIT_* variable of the caller, no system git config, and
      HOME at an empty directory, so no user git config, ignore or attributes file): a tree without the pipeline SKIPs
      (exit 0); these exit 2 and never SKIP: a --rev that does not resolve, a --rev without a value, an unknown
      argument (--rev=X), git missing from PATH, a tree that has scripts/opensource/sync-public-snapshot/sync.py while
      the working copy does not (an incomplete checkout), a tree whose listing fails (the pipeline's tree object
      missing), and a --rev other than HEAD whose tree has the pipeline that HEAD dropped
  K2  K1 run with GIT_DIR and GIT_INDEX_FILE pointing at a decoy repo (as a rebase step or a hook would export them)
      stays green and leaves the decoy's HEAD and index as they were
  P13 a copy of this script with the old SKIP (a missing local sync.py SKIPs before --rev resolves) -> K1 on exactly
      bad-rev, no-git, incomplete, failed-listing and rev-has-pipeline
  P20 a copy that reads a failed listing as the pipeline absent -> K1 on exactly failed-listing
  P21 a copy that lists HEAD's tree instead of --rev's -> K1 on exactly rev-has-pipeline
  P22 a copy with a lenient argument parse (a bad --rev falls back to HEAD) -> K1 on exactly rev-without-value and
      unknown-argument
  P25 a copy that lets a missing git crash (exit 1) -> K1 on exactly no-git
  P23 K1 passing GIT_DIR (in K2, the decoy's) through to its scratch commands -> K2, by the decoy's change
  P26 K1 passing GIT_INDEX_FILE (in K2, the decoy's) through to its scratch commands -> K2, by the decoy's change
  A copy is caught only when the K1 cases off their want are exactly its own (a copy that crashes everywhere is not).
Usage: python3 tools/test-snapshot-export-pins.py [--rev <rev>] [--selftest]
Exit 0 green, 1 red, 2 could not run. The public snapshot excludes scripts/opensource: there the arm prints a named
SKIP and exits 0, but only once --rev resolves and a listing of its tree shows the pipeline absent as well; a missing
local sync.py in a tree that has it, a failed listing, git missing, and an argument other than the two above refuse
(exit 2).
"""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNC = 'scripts/opensource/sync-public-snapshot'


def die(why):
    print(f'snapshot export pins: could not run — {why}')
    sys.exit(2)


def git(*a):
    return subprocess.run(['git', '-C', ROOT, *a], capture_output=True, text=True, check=True).stdout


def load(sync_dir):
    for m in ('sync', 'manifest'):
        sys.modules.pop(m, None)
    sys.path.insert(0, sync_dir)
    try:
        import sync  # noqa: E402 (a fresh module per pipeline directory)
        return sync
    finally:
        sys.path.remove(sync_dir)


def refuses(fn):
    try:
        fn()
    except SystemExit:
        return True
    return False


def arm(sync_dir, rev):
    os.chdir(ROOT)  # sync.PRIVATE is the git toplevel of the working directory at import
    S = load(sync_dir)
    M = S.M
    reds = {}
    tracked = git('ls-tree', '-r', '--name-only', rev).splitlines()
    S.SHIP_SET.clear()
    S.SHIP_SET.update(p for p in tracked if not S.excluded(p) and p not in M.PUBLIC_ONLY and p not in M.PUBLIC_PINNED)
    S.PUB_SET.clear()
    S.PUB_SET.update(list(M.PUBLIC_ONLY) + list(M.PUBLIC_PINNED))
    S.EXPORT_REV = rev
    # N1: the census as the export writes it, judged against each cited file's own export
    n1 = []
    text = git('show', f'{rev}:{S.EQUIPMENT_CENSUS}')
    try:
        out = json.loads(S.export_text(S.EQUIPMENT_CENSUS, text))
    except SystemExit as e:
        out = None
        n1.append(f'the census export refused: {str(e)[:160]}')
    if out is not None:
        cache = {}
        for row, orow in zip(json.loads(text)['rows'], out['rows']):
            for (path, a, b, tok), (_p, a2, b2, tok2) in zip(row['call_sites'], orow['call_sites']):
                if path not in cache:
                    src = git('show', f'{rev}:{path}')
                    exp = S.export_text(path, src, regen=False).split('\n')
                    srcl = S.rewrite(src, os.path.splitext(path)[1].lower(), path).split('\n')
                    k = len(exp) - len(srcl)
                    cache[path] = (exp, k if k >= 0 and exp[k:] == srcl else None)
                exp, k = cache[path]
                if k is None:
                    n1.append(f'{path}: its export is not its source below added lines')
                elif (a2, b2) != (a + k, b + k):
                    n1.append(f'{path}:{a}-{b} exported as {a2}-{b2}, its export offset is {k}')
                elif '\n'.join(exp[a2 - 1:b2]).count(tok2) != 1:
                    n1.append(f'{path}:{a2}-{b2} does not hold its anchor exactly once in the export')
    if n1:
        reds['N1'] = '; '.join(n1[:3]) + (f' (+{len(n1) - 3})' if len(n1) > 3 else '')
    # N2: the shift's own refusals, on synthetic spans
    n2 = []
    fx = lambda a, b, tok: {'rows': [{'call_sites': [['a.js', a, b, tok]]}]}  # noqa: E731
    src, exp = ['x', 'tok', 'y'], ['// header', '', 'x', 'tok', 'y']
    try:
        if S.census_shift(fx(2, 3, 'tok'), {'a.js': (src, exp)}) != {('a.js', 2, 3, 'tok'): (4, 5)}:
            n2.append('a clean span is not moved by the export offset')
    except SystemExit as e:
        n2.append(f'a clean span refused: {e}')
    if not refuses(lambda: S.census_shift(fx(2, 3, 'tok'), {'a.js': (['x', 'tok', 'tok'], ['// header', '', 'x', 'tok', 'tok'])})):
        n2.append('an anchor held twice in the source span passes')
    if not refuses(lambda: S.census_shift(fx(2, 3, 'tok'), {'a.js': (src, ['// header', '', 'x', 'tok', 'tok'])})):
        n2.append('an anchor held twice once moved passes')
    if not refuses(lambda: S.census_shift(fx(1, 1, 'tok'), {'a.js': (src, exp)})):
        n2.append('a missing anchor passes')
    if not refuses(lambda: S.census_shift(fx(2, 3, 'tok'), {'a.js': None})):
        n2.append('a cited file that does not ship passes')
    if not refuses(lambda: S.census_shift(fx(2, 2, 'tok'), {'a.js': (['x', 'tok', 'y', 'tok'], ['// header', '', 'x', 'tok', 'y', 'tok'])})):
        n2.append('an anchor that occurs twice in the file passes')
    # the boundary-shift case: the call repeats 20 lines apart (lines 2 and 22, different next lines) and the site
    # pins the second; 20 lines prepended to the source move the first occurrence to line 22, the pin stays stale
    call = 'ok = await rules.setGame(id);'
    body = ['f() {', call, 'pin();'] + [f'// {i}' for i in range(17)] + ['g() {', call, 'switch();']
    shifted = [f'// added {i}' for i in range(20)] + body
    hdr = ['// header', '']
    if not refuses(lambda: S.census_shift(fx(22, 22, call), {'a.js': (shifted, hdr + shifted)})):
        n2.append('the boundary-shift case: a repeated call moved into the stale pin passes')
    try:
        two = f'{call}\nswitch();'
        got = S.census_shift(fx(42, 43, two), {'a.js': (shifted, hdr + shifted)})
        if got != {('a.js', 42, 43, two): (44, 45)}:
            n2.append(f'the boundary-shift case: the call plus its next line moved to {got}, want lines 44-45')
    except SystemExit as e:
        n2.append(f'the boundary-shift case: the call plus its next line refused: {e}')
    if n2:
        reds['N2'] = '; '.join(n2)
    # N3: public_changed with a base..rev diff naming one cited source, then one uncited path
    n3, cited = [], []
    try:
        cited = sorted(S.census_cited(rev))
        if not cited:
            n3.append(f'the census at {rev[:9]} cites no source')
    except SystemExit as e:  # a refusal at rev is a red row here (and in N4), never an escape from arm()
        n3.append(f'the census at {rev[:9]} refused: {str(e)[:120]}')
    if cited:
        real_git, real_held = S.git, S.held_changes
        try:
            S.held_changes = lambda base, r: (set(), set())
            for diff, want in ((cited[0], True), ('docs/research/zz-uncited.md', False)):
                S.git = lambda *a, _d=diff, **k: (_d + '\n') if a and a[0] == 'diff' else real_git(*a, **k)
                got = S.EQUIPMENT_CENSUS in S.public_changed('HEAD', rev)
                if got != want:
                    n3.append(f'a diff of {diff} {"does not re-export" if want else "re-exports"} the census')
        finally:
            S.git, S.held_changes = real_git, real_held
    if n3:
        reds['N3'] = '; '.join(n3)
    # N4: census_cited reads the census through sync.git; the census path's listing and read are planted, every other
    # git call goes through
    n4 = []
    real_git = S.git

    def planted(listing, show):
        def fake(*a, **k):
            if a[:2] == ('ls-tree', '--name-only') and a[-1] == S.EQUIPMENT_CENSUS:
                if listing is SystemExit:
                    raise SystemExit('git ls-tree failed (planted)')
                return listing
            if a and a[0] == 'show' and len(a) > 1 and a[1].endswith(':' + S.EQUIPMENT_CENSUS):
                if show is SystemExit:
                    raise SystemExit('git show failed (planted)')
                return show
            return real_git(*a, **k)
        return fake
    present = S.EQUIPMENT_CENSUS + '\n'
    for label, listing, show, want in (
            ('a failed read', present, SystemExit, 'refuse'),
            ('invalid JSON', present, '{"rows": [', 'refuse'),
            ('a call site of three fields', present, json.dumps({'rows': [{'call_sites': [['a.js', 1, 2]]}]}), 'refuse'),
            ('a call site with a string line', present, json.dumps({'rows': [{'call_sites': [['a.js', '1', 2, 't']]}]}),
             'refuse'),
            ('a call site with a boolean line', present, json.dumps({'rows': [{'call_sites': [['a.js', True, 2, 't']]}]}),
             'refuse'),
            ('a call site with an empty path', present, json.dumps({'rows': [{'call_sites': [['', 1, 2, 't']]}]}),
             'refuse'),
            ('a row whose call_sites is null', present, json.dumps({'rows': [{'call_sites': None}]}), 'refuse'),
            ('rows that is not a list', present, json.dumps({'rows': {}}), 'refuse'),
            ('a failed tree listing', SystemExit, json.dumps({'rows': []}), 'refuse'),
            ('the census absent from the tree', '', SystemExit, 'empty')):
        S.git = planted(listing, show)
        try:
            got = S.census_cited(rev)
            got = 'empty' if got == set() else f'{len(got)} path(s)'
        except SystemExit:
            got = 'refuse'
        except Exception as e:  # a crash is not a refusal
            got = f'crash ({type(e).__name__})'
        finally:
            S.git = real_git
        if got != want:
            n4.append(f'{label}: {got}, want {want}')
    want_cited = {site[0] for row in json.loads(git('show', f'{rev}:{S.EQUIPMENT_CENSUS}'))['rows']
                  for site in row.get('call_sites', [])}
    try:
        got_cited = S.census_cited(rev)
        if not want_cited or got_cited != want_cited:
            n4.append(f'the census at {rev[:9]}: {len(got_cited)} cited path(s), want its {len(want_cited)}')
    except SystemExit as e:
        n4.append(f'the census at {rev[:9]} refused: {str(e)[:120]}')
    if n4:
        reds['N4'] = '; '.join(n4)
    # S1: the real slice at rev with one case's expect replaced by one carrying a rewritten word (and re-pinned),
    # exported through the pipeline's own rewrite; the cases the export already rewrites at rev (none while the slice
    # carries no rewritten word) stay in the answer
    word = next((a for a, _b in M.SED_PAIRS if a.isalpha() and a.islower()), None)
    if word is None:
        die('manifest SED_PAIRS has no lower-case word to plant')
    real_slice = json.loads(git('show', f'{rev}:{S.SNOOKER_SLICE}'))
    s1 = []
    try:
        base = S.slice_pin_mismatches(S.rewrite(json.dumps(real_slice), '.json', S.SNOOKER_SLICE))
        planted_slice = json.loads(json.dumps(real_slice))
        target = next((c for c in planted_slice['cases'] if c['id'] not in base), None)
        if target is None:
            s1.append('every case of the slice is already rewritten past its pin')
        else:
            dirty = f'an engine message from {word} r1'
            target['expect'], target['expectSha256'] = dirty, hashlib.sha256(dirty.encode()).hexdigest()
            got = S.slice_pin_mismatches(S.rewrite(json.dumps(planted_slice), '.json', S.SNOOKER_SLICE))
            want = [c['id'] for c in planted_slice['cases'] if c['id'] in base or c is target]
            if got != want:
                s1.append(f'slice_pin_mismatches named {got[:4]}, want {want[:4]} (the case carrying a rewritten word '
                          'and the cases the export already rewrites)')
    except SystemExit as e:
        s1.append(f'the real slice refused: {str(e)[:160]}')
    if s1:
        reds['S1'] = '; '.join(s1)
    # S3: the census check before any hash, on variants of the real slice (unexported: its hashes are the frozen oracle)
    s3 = []

    def variant(edit):
        d = json.loads(json.dumps(real_slice))
        edit(d)
        return json.dumps(d)
    for label, text, want in (
            ('the slice as it is', json.dumps(real_slice), 'pass'),
            ('one case removed', variant(lambda d: d['cases'].pop()), 'refuse'),
            ('one case too many', variant(lambda d: d['cases'].append(dict(d['cases'][-1]))), 'refuse'),
            ('no cases', variant(lambda d: d.pop('cases')), 'refuse'),
            ('a non-string expect', variant(lambda d: d['cases'][0].__setitem__('expect', 123)), 'refuse'),
            ('a case without id', variant(lambda d: d['cases'][0].pop('id')), 'refuse'),
            ('a case without kind', variant(lambda d: d['cases'][0].pop('kind')), 'refuse'),
            ('a case without its ruleset', variant(lambda d: d['cases'][0].pop('ruleset')), 'refuse'),
            ('another slice name', variant(lambda d: d.__setitem__('slice', d['slice'] + '-x')), 'refuse'),
            ('another ruleset', variant(lambda d: d.__setitem__('ruleset', d['ruleset'] + '-x')), 'refuse'),
            ('a short expectSha256', variant(lambda d: d['cases'][0].__setitem__('expectSha256', 'abc')), 'refuse')):
        try:
            got = 'pass' if S.slice_pin_mismatches(text) == [] else 'stale pins'
        except SystemExit:
            got = 'refuse'
        except Exception as e:  # a crash is not a refusal
            got = f'crash ({type(e).__name__})'
        if got != want:
            s3.append(f'{label}: {got}, want {want}')
    test_src = git('show', f'{rev}:{S.SNOOKER_SLICE_TEST}')
    asserted = (re.search(r'assert_eq!\(cases\.len\(\),\s*(\d+),\s*"the frozen slice census"\)', test_src),
                re.search(r'assert_eq!\(slice\["slice"\],\s*"([^"]+)"\)', test_src),
                re.search(r'assert_eq!\(slice\["ruleset"\],\s*"([^"]+)"\)', test_src))
    if not all(asserted):
        s3.append(f'{S.SNOOKER_SLICE_TEST} at {rev[:9]} lacks a census, slice or ruleset assertion')
    elif (int(asserted[0].group(1)), asserted[1].group(1), asserted[2].group(1)) != (
            S.SNOOKER_SLICE_CASES, S.SNOOKER_SLICE_ID, S.SNOOKER_SLICE_RULESET):
        s3.append(f'sync checks {S.SNOOKER_SLICE_CASES} / {S.SNOOKER_SLICE_ID} / {S.SNOOKER_SLICE_RULESET}, the slice test '
                  f'asserts {asserted[0].group(1)} / {asserted[1].group(1)} / {asserted[2].group(1)}')
    if s3:
        reds['S3'] = '; '.join(s3)
    # S2: main() refuses a stale slice pin before its in-progress marker, outside --dry-run
    src_py = open(os.path.join(sync_dir, 'sync.py'), encoding='utf-8').read()
    body = src_py[src_py.index('\ndef main():'):]
    i_check = body.find('slice_left = slice_pins_left(args.rev)')
    i_raise = body.find('raise SystemExit("refusing to sync: " + slice_why)', i_check)
    i_marker = body.find('open(IN_PROGRESS, "w")')
    if min(i_check, i_raise, i_marker) < 0 or not (i_check < i_raise < i_marker):
        reds['S2'] = 'main() does not refuse a stale slice pin before its in-progress marker'
    elif 'if not args.dry_run:\n            raise SystemExit("refusing to sync: " + slice_why)' not in body:
        reds['S2'] = 'main() does not raise on a stale slice pin outside --dry-run'
    # H1: each marker file's line 1, at rev (never the header line) and in its export (always the header line)
    line, h1 = f'// {M.HEADER}\n', []
    for p in MARKER_FILES:
        if p not in S.SHIP_SET:
            h1.append(f'{p} does not ship at {rev[:9]}')
            continue
        priv = MARKER_TEXT[p] if p in MARKER_TEXT else git('show', f'{rev}:{p}')
        if priv.startswith(line):
            h1.append(f'{p} starts with the header line at {rev[:9]} (the private tree reads as the public one)')
        try:
            out = S.export_blob(p, priv.encode('utf-8') if p in MARKER_TEXT else S.shipped_blob(p, rev),
                                os.path.splitext(p)[1].lower())
        except SystemExit as e:  # a refusal is a red row here, never an escape from arm()
            h1.append(f'the export of {p} refused: {str(e)[:120]}')
            continue
        if not (isinstance(out, str) and out.startswith(line)):
            h1.append(f'the export of {p} does not start with the header line (the public tree reads as the private '
                      'one)')
    if h1:
        reds['H1'] = '; '.join(h1)
    # H2: the shipped files at rev whose text holds manifest HEADER are the marker files and CENSUS_OTHER's
    h2, key = [], (rev, M.HEADER)
    if key not in _HOLDER_HITS:
        r = subprocess.run(['git', '-C', ROOT, 'grep', '-l', '-F', '-e', M.HEADER, rev, '--'],
                           capture_output=True, text=True)
        if r.returncode in (0, 1):
            _HOLDER_HITS[key] = {l.split(':', 1)[1] for l in r.stdout.splitlines() if ':' in l}
        else:
            h2.append(f'git grep for the holder at {rev[:9]} failed (exit {r.returncode})')
    if key in _HOLDER_HITS:
        holding = {p for p in _HOLDER_HITS[key] if p in S.SHIP_SET}
        unlisted = sorted(holding - set(MARKER_FILES) - set(CENSUS_OTHER))
        if unlisted:
            h2.append(f'{len(unlisted)} shipped file(s) hold the header text and are neither marker files nor in '
                      f'CENSUS_OTHER, first {unlisted[0]}')
        gone = [p for p in list(MARKER_FILES) + list(CENSUS_OTHER) if p not in holding]
        if gone:
            h2.append(f'{" and ".join(gone)} {"hold" if len(gone) > 1 else "holds"} no header text in a shipped '
                      f'file at {rev[:9]}')
    if h2:
        reds['H2'] = '; '.join(h2)
    # H3: the public mirror against the heal, byte for byte, on every pool-sdk file at rev and on the fixtures
    h3 = []
    try:
        priv = SYNC_WEB_TEXT if SYNC_WEB_TEXT is not None else git('show', f'{rev}:{SYNC_WEB}')
        exported = S.export_blob(SYNC_WEB, priv.encode('utf-8'), '.mjs')
        prefix = 'web/dist/pool-sdk/'
        cat = subprocess.run(['git', '-C', ROOT, 'ls-tree', '-r', '--name-only', rev, '--', prefix],
                             capture_output=True, text=True, check=True).stdout.split()
        dist = {f[len(prefix):]: subprocess.run(['git', '-C', ROOT, 'show', f'{rev}:{f}'], capture_output=True,
                                                check=True).stdout for f in cat if f.endswith(('.js', '.d.ts'))}
        if not dist:
            h3.append(f'no {prefix} file at {rev[:9]}')
        for label, files in (('the pool-sdk files', dist), ('the fixtures', h3_fixtures(M.HEADER))):
            got = mirror_vs_heal(S, exported, files)
            if got:
                h3.append(f'{label}: {len(got)} differ, first {got[0]}')
        bare = mirror_vs_heal(S, exported, {'bare.js': b'#!/usr/bin/env node'})
        if bare != ['bare.js: both refuse']:
            h3.append(f'a #! line with no newline: {bare}')
    except (SystemExit, subprocess.CalledProcessError, OSError) as e:
        h3.append(f'could not compare: {str(e)[:160]}')
    if h3:
        reds['H3'] = '; '.join(h3)
    # T1: a change to any cited source, to the census, the slice, the slice test, a marker file, this arm, the pipeline
    # (sync.py and the manifest it reads) or the workflow itself selects the workflow that runs this arm (S1 and S3 read
    # the slice and the test, so a re-frozen slice meets the census constants in its own pull request)
    t1 = []
    wf = WORKFLOW_TEXT if WORKFLOW_TEXT is not None else open(os.path.join(ROOT, WORKFLOW), encoding='utf-8').read()
    for trigger in ('push', 'pull_request'):
        pats = workflow_paths(wf, trigger)
        if not pats:
            t1.append(f'{WORKFLOW} has no {trigger} path filters')
            continue
        unmodelled = [g for g in pats if g.startswith('!') or '?' in g or '+' in g or '[' in g
                      or '*' in g.replace('**', '')]
        if unmodelled:
            t1.append(f'{trigger} filter(s) this check does not model (an exclusion, a "*" outside "**", "?", "+" or "["), '
                      f'first {unmodelled[0]!r}')
            continue
        missed = sorted(p for p in cited if not any(filter_matches(g, p) for g in pats))
        if missed:
            t1.append(f'{len(missed)} cited source(s) match no {trigger} filter, first {missed[0]}')
        missed = [p for p in (S.EQUIPMENT_CENSUS, S.SNOOKER_SLICE, S.SNOOKER_SLICE_TEST, *MARKER_FILES,
                              'tools/test-snapshot-export-pins.py', f'{SYNC}/sync.py', f'{SYNC}/manifest.py', WORKFLOW)
                  if not any(filter_matches(g, p) for g in pats)]
        if missed:
            t1.append(f'{" and ".join(missed)} {"match" if len(missed) > 1 else "matches"} no {trigger} filter')
    if t1:
        reds['T1'] = '; '.join(t1)
    return reds


def filter_matches(pattern, path):
    """a GitHub paths filter made of literal characters and '**' (which crosses '/'), matched against a whole path"""
    return re.fullmatch('.*'.join(re.escape(part) for part in pattern.split('**')), path) is not None


WORKFLOW = '.github/workflows/site-data.yml'
WORKFLOW_TEXT = None  # a plant's workflow copy; None reads the real file
# the shipped files that take their public-tree branch from the export's header on their own line 1 (H1), and the
# other shipped files whose text holds manifest HEADER, each with the reason it is not a reader (H2)
MARKER_FILES = ['web/tools/gen-sw-precache.mjs', 'sdk/ts/test/share.test.ts', 'sdk/ts/tools/sync-web.mjs']
CENSUS_OTHER = {
    'crates/pool-core/tests/support/catalog_twin_norm.rs': 'carries the header on its own line 1; the export keeps it',
    'examples/hillclimb/LICENSE': "the example's own licence text names the holder; it reads nothing",
    'examples/hillclimb/NOTICE': "the example's own notice names the holder; it reads nothing",
    'ios/ShellCore/Package.swift': 'carries the header on line 2, below the tools-version; the export keeps it',
    'macos/MacShellCore/Package.swift': 'carries the header on line 2, below the tools-version; the export keeps it',
    'tools/test-snapshot-public-files.py': 'plants a holder line into a copy of the reviewed LICENSE',
}
MARKER_TEXT = {}  # a plant's private text for a marker file; a file not named here is read at --rev
_HOLDER_HITS = {}  # (rev, HEADER) -> the paths whose text holds HEADER at rev: one git grep per rev
SYNC_WEB = 'sdk/ts/tools/sync-web.mjs'
SYNC_WEB_TEXT = None  # a plant's private sync-web.mjs; None reads it at --rev


def h3_fixtures(header):
    """the inputs on which a mirror that does not reproduce add_header exactly would differ from the heal"""
    line, emoji = f'// {header}\n', '\U0001F600' * 380
    return {
        'lf.d.ts': b'export declare const a: number;\n',
        'crlf.d.ts': b'export declare const b: number;\r\nexport declare const c: string;\r\n',
        'cr.d.ts': b'export declare const d: number;\rexport declare const e: string;\r',
        'shebang.js': b'#!/usr/bin/env node\r\nconsole.log(1);\r\n',
        'bom.d.ts': '\ufeffexport declare const f: number;\n'.encode(),
        'headed.js': (line + '\nexport const g = 1;\n').encode(),
        'headed-crlf.js': (line.replace('\n', '\r\n') + '\r\nexport const h = 1;\r\n').encode(),
        # the holder starts at code point 390 but at UTF-16 unit 770, so it ends past unit 800
        'nonbmp.js': (f'/* {emoji} */\n{line}\nexport const i = 1;\n').encode(),
        # the holder starts at code point 800, just past the window
        'late.js': ('/* ' + 'x' * 790 + ' */\n' + line).encode(),
    }


def mirror_vs_heal(S, exported, files):
    """run the exported sync-web.mjs (its line 1 is the header: the public mirror) over files as sdk/ts/dist/src,
    and S.heal_dist_headers over the same bytes as web/dist/pool-sdk -> ['<path>: why'] for every path whose bytes
    differ; ['<path>: both refuse'] when both refuse (one file only); a refusal by one side alone is a difference"""
    with tempfile.TemporaryDirectory(prefix='obw-snapshot-export-pins-h3-') as td:
        tools = os.path.join(td, 'm', 'sdk', 'ts', 'tools')
        os.makedirs(tools)
        open(os.path.join(tools, 'sync-web.mjs'), 'w', encoding='utf-8').write(exported)
        for side in (os.path.join(td, 'm', 'sdk', 'ts', 'dist', 'src'), os.path.join(td, 'h', 'web', 'dist', 'pool-sdk')):
            for rel, data in files.items():
                os.makedirs(os.path.dirname(os.path.join(side, rel)), exist_ok=True)
                open(os.path.join(side, rel), 'wb').write(data)
        r = subprocess.run(['node', os.path.join(tools, 'sync-web.mjs')], capture_output=True, text=True, cwd=td)
        try:
            S.heal_dist_headers(os.path.join(td, 'h'))
            heal_ok = True
        except ValueError:  # add_header on a #! line with no newline
            heal_ok = False
        if r.returncode != 0 or not heal_ok:
            if r.returncode != 0 and not heal_ok and len(files) == 1:
                return [f'{next(iter(files))}: both refuse']
            return [f'the mirror exit {r.returncode}, the heal {"ok" if heal_ok else "refused"}: '
                    f'{(r.stderr or r.stdout).strip()[:120]}']
        out = []
        for rel in sorted(files):
            m = open(os.path.join(td, 'm', 'web', 'dist', 'pool-sdk', rel), 'rb').read()
            h = open(os.path.join(td, 'h', 'web', 'dist', 'pool-sdk', rel), 'rb').read()
            if m != h:
                at = next((i for i in range(min(len(m), len(h))) if m[i] != h[i]), min(len(m), len(h)))
                out.append(f'{rel}: first byte difference at {at} ({len(m)} vs {len(h)} bytes)')
        return out


def workflow_paths(text, trigger):
    """the `paths:` list under on.<trigger> in a workflow file (two-space indented `on:` block, as site-data.yml)"""
    out, state = [], None
    for line in text.split('\n'):
        if line.startswith('  ') and not line.startswith('   ') and line.strip().endswith(':'):
            state = 'trigger' if line.strip()[:-1] == trigger else None
            continue
        if line and not line.startswith(' '):
            if state is not None and line.strip() != 'on:':
                state = None
            continue
        if state == 'trigger' and line.strip() == 'paths:':
            state = 'paths'
            continue
        if state == 'paths':
            m = line.strip()
            if not m or m.startswith('#'):
                continue
            if m.startswith('- '):
                out.append(m[2:].strip().strip('"').strip("'"))
            else:
                state = None
    return out


PLANTS = [
    ('P1', ['N1'], 'sync.py', '    shift = census_shift(fixture, sources)\n',
     '    shift = {k: (k[1], k[2]) for k in census_shift(fixture, sources)}\n'),
    ('P2', ['N2'], 'sync.py', '            if n0 != 1 or n1 != 1:\n', '            if False:\n'),
    ('P3', ['N3'], 'sync.py', '    if changed & census_cited(rev):\n        changed.add(EQUIPMENT_CENSUS)\n', ''),
    ('P4', ['S1'], 'sync.py', '    return [c["id"] for c in data["cases"]\n', '    return [] and [c["id"] for c in data["cases"]\n'),
    ('P5', ['S2'], 'sync.py', '            raise SystemExit("refusing to sync: " + slice_why)\n',
     '            print("refusing to sync: " + slice_why)\n'),
    ('P7', ['N2'], 'sync.py', '            if f0 != 1 or f1 != 1:\n', '            if f0 < 1 or f1 < 1:\n'),
    ('P11', ['N4'], 'sync.py',
     '    text = git("show", f"{rev}:{EQUIPMENT_CENSUS}")\n    try:\n        fixture = json.loads(text)\n'
     '    except ValueError as e:\n'
     '        raise SystemExit(f"census line pins: {EQUIPMENT_CENSUS} at {rev[:9]} is not valid JSON ({e})")\n',
     '    try:\n        fixture = json.loads(git("show", f"{rev}:{EQUIPMENT_CENSUS}"))\n'
     '    except (SystemExit, ValueError):\n        return set()\n'),
    ('P12', ['S3'], 'sync.py', '    slice_census_check(data)\n', ''),
    ('P14', ['N4'], 'sync.py', ' and type(site[1]) is int and type(site[2]) is int and isinstance(site[3], str)):\n',
     ' and isinstance(site[1], int) and type(site[2]) is int and isinstance(site[3], str)):\n'),
    ('P15', ['N4'], 'sync.py', ' and isinstance(site[0], str) and site[0]\n', ' and isinstance(site[0], str)\n'),
    ('P16', ['N4'], 'sync.py', '        sites = row.get("call_sites", []) if isinstance(row, dict) else None\n',
     '        sites = (row.get("call_sites") or []) if isinstance(row, dict) else None\n'),
    ('P17', ['S3'], 'sync.py', '    elif len(cases) != SNOOKER_SLICE_CASES:\n', '    elif len(cases) < SNOOKER_SLICE_CASES:\n'),
    ('P18', ['S3'], 'sync.py', 'for k in ("id", "kind", "ruleset", "expect")', 'for k in ("kind", "expect")'),
    ('P24', ['N3', 'N4'], 'sync.py',
     '    if not git("ls-tree", "--name-only", rev, "--", EQUIPMENT_CENSUS).strip():\n        return set()\n',
     '    raise SystemExit("census line pins: a planted refusal")\n'),
    ('P29', ['H1'], 'manifest.py', 'HEADER_SLASH = {".swift", ".xcconfig", ".js", ".mjs", ".ts", ".tsx", ".rs"}\n',
     'HEADER_SLASH = {".swift", ".xcconfig", ".js", ".ts", ".tsx", ".rs"}\n'),
    ('P36', ['H3'], 'sync.py',
     '            text = open(full, encoding="utf-8").read()\n            new_text = add_header(full, rel, text)\n',
     '            text = open(full, encoding="utf-8", newline="").read()\n            new_text = add_header(full, rel, text)\n'),
]

# script-copy plants for K1: (name, text in this script, planted text, the K1 cases that must leave their want). Each
# text is written escaped here, so it occurs once in this script: in main()
ARGS_HEAD = ("    args, selftest, rev_arg = sys.argv[1:], False, 'HEAD'\n"
             "    while args:\n"
             "        a = args.pop(0)\n"
             "        if a == '--selftest':\n"
             "            selftest = True\n"
             "        elif a == '--rev' and args and not args[0].startswith('--'):\n"
             "            rev_arg = args.pop(0)\n"
             "        else:\n"
             "            die('--rev needs a value' if a == '--rev' else f'unknown argument {a!r}')\n")
OLD_ARGS_HEAD = ("    args = sys.argv[1:]\n"
                 "    selftest = '--selftest' in args\n"
                 "    rev_arg = args[args.index('--rev') + 1] if '--rev' in args and args.index('--rev') + 1 < len(args) else 'HEAD'\n")
MAIN_HEAD = ("    try:\n"
             "        rev = git('rev-parse', '--verify', '--quiet', f'{rev_arg}^{{commit}}').strip()\n"
             "    except subprocess.CalledProcessError:\n"
             "        die(f'--rev {rev_arg} does not resolve to a commit (no such revision, or not a git checkout)')\n"
             "    except OSError as e:\n"
             "        die(f'git could not run ({e.strerror})')\n"
             "    sync_dir = os.path.join(ROOT, SYNC)\n"
             "    if not os.path.exists(os.path.join(sync_dir, 'sync.py')):\n")
OLD_MAIN_HEAD = ("    sync_dir = os.path.join(ROOT, SYNC)\n"
                 "    if not os.path.exists(os.path.join(sync_dir, 'sync.py')):\n"
                 "        print(f'snapshot export pins: SKIP — {SYNC}/sync.py is absent (the public snapshot excludes {SYNC})')\n"
                 "        return 0\n"
                 "    try:\n"
                 "        rev = git('rev-parse', '--verify', '--quiet', f'{rev_arg}^{{commit}}').strip()\n"
                 "    except subprocess.CalledProcessError:\n"
                 "        die(f'--rev {rev_arg} does not resolve to a commit')\n"
                 "    if not os.path.exists(os.path.join(sync_dir, 'sync.py')):\n")
COPY_PLANTS = [
    ('P13', MAIN_HEAD, OLD_MAIN_HEAD, ['bad-rev', 'no-git', 'incomplete', 'failed-listing', 'rev-has-pipeline']),
    ('P20', ("        except subprocess.CalledProcessError as e:\n"
             "            die(f'{SYNC}/sync.py is absent and listing the tree of {rev[:9]} failed (exit {e.returncode})')\n"),
     "        except subprocess.CalledProcessError:\n            listed = ''\n", ['failed-listing']),
    ('P21', "            listed = git('ls-tree', '--name-only', rev, '--', f'{SYNC}/sync.py').strip()\n",
     "            listed = git('ls-tree', '--name-only', 'HEAD', '--', f'{SYNC}/sync.py').strip()\n", ['rev-has-pipeline']),
    ('P22', ARGS_HEAD, OLD_ARGS_HEAD, ['rev-without-value', 'unknown-argument']),
    ('P25', "    except OSError as e:\n        die(f'git could not run ({e.strerror})')\n", '', ['no-git']),
]
# K1's cases and the exit each wants: the public tree SKIPs (0); every other case refuses (2) and never prints SKIP
K1_WANT = {'public': 0, 'bad-rev': 2, 'rev-without-value': 2, 'unknown-argument': 2, 'no-git': 2, 'incomplete': 2,
           'failed-listing': 2, 'rev-has-pipeline': 2}


def scratch_env(home):
    """the environment of K1's and K2's scratch git and child runs: none of the caller's GIT_* variables (a hook's or a
    rebase step's GIT_DIR, GIT_INDEX_FILE or GIT_WORK_TREE would point the scratch commands at the caller's
    repository), no system git config, and HOME / XDG_CONFIG_HOME at the empty directory home, so no user git config,
    ignore or attributes file applies on any git version (GIT_CONFIG_GLOBAL too, for git 2.32 and later)"""
    env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
    env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull, HOME=home, XDG_CONFIG_HOME=home)
    return env


class ScratchGitError(Exception):
    """a git step that failed in a K1 or K2 scratch repo (main() refuses on it; K2 counts it red)"""


def scratch_git(d, *cmd, env):
    """git in the scratch repo d (a fixed identity, no signing, no hooks); a failure raises ScratchGitError with git's
    message"""
    r = subprocess.run(['git', '-C', d, '-c', 'user.name=k1', '-c', 'user.email=k1@localhost', '-c', 'commit.gpgsign=false',
                        '-c', f'core.hooksPath={os.devnull}', *cmd], capture_output=True, text=True, env=env)
    if r.returncode != 0:
        raise ScratchGitError(f'scratch git {" ".join(cmd)} failed in {os.path.basename(d)}: '
                              f'{(r.stderr or r.stdout).strip()[:200]}')
    return r.stdout.strip()


def k1(script_text, passthrough=()):
    """K1: the script text run end to end in scratch git repos -> {case: (exit code, last line)}. passthrough names
    GIT_* variables that reach the scratch commands after all (P23, P26); only K2 passes any, after pointing them at
    its decoy"""
    out = {}
    with tempfile.TemporaryDirectory(prefix='obw-snapshot-export-pins-k1-') as td:
        os.makedirs(os.path.join(td, 'home'))
        env = scratch_env(os.path.join(td, 'home'))
        env.update({k: os.environ[k] for k in passthrough if k in os.environ})

        def repo(name, files):
            d = os.path.join(td, name)
            os.makedirs(os.path.join(d, 'tools'))
            open(os.path.join(d, 'tools', 'test-snapshot-export-pins.py'), 'w', encoding='utf-8').write(script_text)
            for rel, body in files.items():
                os.makedirs(os.path.dirname(os.path.join(d, rel)), exist_ok=True)
                open(os.path.join(d, rel), 'w', encoding='utf-8').write(body)
            for cmd in (['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'k1']):
                scratch_git(d, *cmd, env=env)
            return d

        def run(d, *argv, path=None):
            try:
                r = subprocess.run([sys.executable, os.path.join(d, 'tools', 'test-snapshot-export-pins.py'), *argv],
                                   capture_output=True, text=True, timeout=120,
                                   env=env if path is None else dict(env, PATH=path))
            except subprocess.TimeoutExpired:
                return None, 'timed out after 120 s'
            return r.returncode, (r.stdout.strip().splitlines() or [''])[-1]
        pipeline = {f'{SYNC}/sync.py': '# the pipeline\n'}
        public = repo('public', {})
        out['public'] = run(public)
        out['bad-rev'] = run(public, '--rev', 'no-such-rev')
        out['rev-without-value'] = run(public, '--rev')
        out['unknown-argument'] = run(public, '--rev=no-such-rev')
        os.makedirs(os.path.join(td, 'empty-bin'))
        out['no-git'] = run(public, path=os.path.join(td, 'empty-bin'))
        incomplete = repo('incomplete', pipeline)
        os.remove(os.path.join(incomplete, SYNC, 'sync.py'))
        out['incomplete'] = run(incomplete)
        # the pipeline's tree object deleted: the commit still resolves, the listing of the pipeline path fails
        broken = repo('failed-listing', pipeline)
        os.remove(os.path.join(broken, SYNC, 'sync.py'))
        tree = scratch_git(broken, 'rev-parse', f'HEAD:{SYNC}', env=env)
        os.remove(os.path.join(broken, '.git', 'objects', tree[:2], tree[2:]))
        out['failed-listing'] = run(broken)
        # HEAD dropped the pipeline, HEAD~1 has it: --rev HEAD~1 is judged by HEAD~1's tree
        history = repo('rev-has-pipeline', pipeline)
        os.remove(os.path.join(history, SYNC, 'sync.py'))
        scratch_git(history, 'add', '-A', env=env)
        scratch_git(history, 'commit', '-q', '-m', 'k1: the pipeline dropped', env=env)
        out['rev-has-pipeline'] = run(history, '--rev', 'HEAD~1')
    return out


def k1_off(got):
    """the K1 cases off their want -> {case: why}"""
    off = {}
    for case, want in K1_WANT.items():
        rc, line = got[case]
        if want == 0 and (rc != 0 or 'SKIP' not in line):
            off[case] = f'exit {rc} ({line[:80]}), want the SKIP'
        elif want == 2 and (rc != 2 or 'SKIP' in line):
            off[case] = f'exit {rc} ({line[:80]}), want exit 2 without a SKIP'
    return off


DECOY_CHANGED = 'the decoy repository changed (HEAD or index)'


def k2(script_text, passthrough=()):
    """K2: K1 run with GIT_DIR and GIT_INDEX_FILE pointing at a decoy repo -> problems ([] = green): K1 must stay
    green and the decoy's HEAD and index unchanged. passthrough (P23, P26) names decoy variables K1 then lets through
    to its scratch commands; a name K2 does not point at its decoy raises ValueError, so no caller value is ever
    passed through"""
    if not set(passthrough) <= {'GIT_DIR', 'GIT_INDEX_FILE'}:
        raise ValueError(f'K2 lets through only its decoy variables GIT_DIR and GIT_INDEX_FILE, not {sorted(passthrough)}')
    with tempfile.TemporaryDirectory(prefix='obw-snapshot-export-pins-k2-') as td:
        os.makedirs(os.path.join(td, '.home'))
        env = scratch_env(os.path.join(td, '.home'))
        open(os.path.join(td, 'decoy.txt'), 'w', encoding='utf-8').write('decoy\n')
        for cmd in (['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'decoy']):
            scratch_git(td, *cmd, env=env)

        def state():
            return scratch_git(td, 'rev-parse', 'HEAD', env=env), scratch_git(td, 'ls-files', '--stage', env=env)
        before = state()
        decoy = {'GIT_DIR': os.path.join(td, '.git'), 'GIT_INDEX_FILE': os.path.join(td, '.git', 'index')}
        saved = {k: os.environ.get(k) for k in decoy}
        os.environ.update(decoy)
        try:
            off = k1_off(k1(script_text, passthrough))
        except Exception as e:  # a K1 that lets a decoy variable through may fail outright: also red
            off = {'K1': f'raised {type(e).__name__}: {str(e)[:80]}'}
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
        problems = [f'under the decoy GIT_DIR and GIT_INDEX_FILE, {case}: {why}' for case, why in off.items()]
        if state() != before:
            problems.append(DECOY_CHANGED)
    return problems


def main():
    # one pass over the arguments: a --rev without a value, --rev=X or any other argument refuses (never HEAD)
    args, selftest, rev_arg = sys.argv[1:], False, 'HEAD'
    while args:
        a = args.pop(0)
        if a == '--selftest':
            selftest = True
        elif a == '--rev' and args and not args[0].startswith('--'):
            rev_arg = args.pop(0)
        else:
            die('--rev needs a value' if a == '--rev' else f'unknown argument {a!r}')
    try:
        rev = git('rev-parse', '--verify', '--quiet', f'{rev_arg}^{{commit}}').strip()
    except subprocess.CalledProcessError:
        die(f'--rev {rev_arg} does not resolve to a commit (no such revision, or not a git checkout)')
    except OSError as e:
        die(f'git could not run ({e.strerror})')
    sync_dir = os.path.join(ROOT, SYNC)
    if not os.path.exists(os.path.join(sync_dir, 'sync.py')):
        # SKIP only where rev's own tree lacks the pipeline too (the public snapshot); a tree that has it while the
        # working copy does not is an incomplete checkout, and a failed listing proves nothing: both refuse
        try:
            listed = git('ls-tree', '--name-only', rev, '--', f'{SYNC}/sync.py').strip()
        except subprocess.CalledProcessError as e:
            die(f'{SYNC}/sync.py is absent and listing the tree of {rev[:9]} failed (exit {e.returncode})')
        if listed:
            die(f'{SYNC}/sync.py is in the tree of {rev[:9]} but absent from the working tree (an incomplete checkout)')
        print(f'snapshot export pins: SKIP — {SYNC}/sync.py is absent here and from the tree of {rev[:9]} '
              f'(the public snapshot excludes {SYNC})')
        return 0
    reds = arm(sync_dir, rev)
    for name in sorted(reds):
        print(f'  RED  {name}: {reds[name]}')
    if reds:
        print(f'snapshot export pins: RED ({len(reds)})')
        return 1
    print(f'snapshot export pins @ {rev[:9]}: OK — the census spans move with the export headers (each anchor held once), '
          'a cited source re-exports the census, a stale slice pin refuses a real sync, the marker files carry the '
          'export header on line 1 only in their export, and the public mirror writes what the dist heal leaves')
    if not selftest:
        return 0
    parent = tempfile.mkdtemp(prefix='obw-snapshot-export-pins-')
    bad = 0
    try:
        for name, want, fname, old, new in PLANTS:
            copy = tempfile.mkdtemp(prefix=f'{name}-', dir=parent)
            for f in os.listdir(sync_dir):
                if f.endswith('.py'):
                    shutil.copyfile(os.path.join(sync_dir, f), os.path.join(copy, f))
            path = os.path.join(copy, fname)
            src = open(path, encoding='utf-8').read()
            if src.count(old) != 1:
                die(f'{name}: the plant target occurs {src.count(old)} times in {fname}')
            open(path, 'w', encoding='utf-8').write(src.replace(old, new))
            got = arm(copy, rev)
            missing = [c for c in want if c not in got]
            if missing:
                bad += 1
                print(f'  BAD  {name}: expected red on {", ".join(want)}, missing {", ".join(missing)} (red: {", ".join(sorted(got)) or "none"})')
            else:
                print(f'  ok   {name}: red on {", ".join(want)}')
        # P6, P8, P9, P10, P19: workflow copies whose filters stop covering a cited source or the slice test, or use a
        # pattern T1 does not model (the pipeline is unchanged)
        global WORKFLOW_TEXT
        real = open(os.path.join(ROOT, WORKFLOW), encoding='utf-8').read()
        on_pr = real.index('  pull_request:')
        copies = [
            ('P6', real[:on_pr] + real[on_pr:].replace('      - "web/app/**"\n', '', 1)),
            ('P8', real[:on_pr].replace('      - "sdk/ts/src/**"\n', '      - "sdk/ts/src/*"\n', 1) + real[on_pr:]),
            ('P9', real[:on_pr] + real[on_pr:].replace('      - "sdk/ts/src/**"\n',
                                                       '      - "sdk/ts/src/**"\n      - "!web/app/settings.js"\n', 1)),
            ('P10', real[:on_pr].replace('      - "sdk/ts/src/**"\n', '      - "sdk/ts/src/**"\n      - "sdk/ts/src+/**"\n', 1)
             + real[on_pr:]),
            ('P19', real[:on_pr] + real[on_pr:].replace('      - "crates/pool-rules/tests/snooker_v2_slice.rs"\n', '', 1)),
            ('P31', real[:on_pr].replace('      - "sdk/ts/tools/sync-web.mjs"\n', '', 1) + real[on_pr:]),
        ]
        for name, text in copies:
            WORKFLOW_TEXT = text
            try:
                got = arm(sync_dir, rev) if text != real else {}
            finally:
                WORKFLOW_TEXT = None
            if 'T1' in got:
                print(f'  ok   {name}: red on T1')
            else:
                bad += 1
                print(f'  BAD  {name}: expected red on T1 (red: {", ".join(sorted(got)) or "none"})')
        # P27, P28: a marker file's private text planted; P30: a marker file left out of MARKER_FILES (the pipeline and
        # the workflow unchanged)
        global MARKER_TEXT, MARKER_FILES
        gen, files = 'web/tools/gen-sw-precache.mjs', MARKER_FILES
        gen_text, header = git('show', f'{rev}:{gen}'), load(sync_dir).M.HEADER
        marker_plants = [
            ('P27', 'H1', {gen: f'// {header}\n\n' + gen_text}, files),
            ('P28', 'H1', {gen: f'// {header} (named early)\n' + gen_text}, files),
            ('P30', 'H2', {}, [p for p in files if p != 'sdk/ts/tools/sync-web.mjs']),
        ]
        for name, row, texts, planted_files in marker_plants:
            MARKER_TEXT, MARKER_FILES = texts, planted_files
            try:
                got = arm(sync_dir, rev)
            finally:
                MARKER_TEXT, MARKER_FILES = {}, files
            if row in got:
                print(f'  ok   {name}: red on {row}')
            else:
                bad += 1
                print(f'  BAD  {name}: expected red on {row} (red: {", ".join(sorted(got)) or "none"})')
        # P32-P35: sync-web.mjs copies (the pipeline and the workflow unchanged)
        global SYNC_WEB_TEXT
        sw = git('show', f'{rev}:{SYNC_WEB}')
        sw_plants = [
            ('P32', "  const lf = text.replace(/\\r\\n?/g, '\\n');\n", '  const lf = text;\n'),
            ('P33', "  if ([...lf.slice(0, 1600)].slice(0, 800).join('').includes(", '  if (lf.slice(0, 800).includes('),
            ('P34', "  if (!lf.startsWith('#!')) return ", '  if (true) return '),
            ('P35', '  if (nl === 0) throw new Error(', '  if (nl === 0) return text; throw new Error('),
        ]
        for name, old, new in sw_plants:
            if sw.count(old) != 1:
                die(f'{name}: the plant target occurs {sw.count(old)} times in {SYNC_WEB}')
            SYNC_WEB_TEXT = sw.replace(old, new)
            try:
                got = arm(sync_dir, rev)
            finally:
                SYNC_WEB_TEXT = None
            if 'H3' in got:
                print(f'  ok   {name}: red on H3')
            else:
                bad += 1
                print(f'  BAD  {name}: expected red on H3 (red: {", ".join(sorted(got)) or "none"})')
        # K1 and K2 on this script as it is; then the copies, each caught only when exactly its own K1 cases leave
        # their want; then P23 and P26, K2 with one decoy variable let through to the scratch commands
        me = open(os.path.abspath(__file__), encoding='utf-8').read()
        off = k1_off(k1(me))
        if off:
            bad += 1
            print(f'  RED  K1: {"; ".join(f"{c}: {w}" for c, w in off.items())}')
        else:
            print('  ok   K1: a tree without the pipeline SKIPs; a bad, missing or unknown --rev argument, no git, an '
                  'incomplete checkout, a failed listing and a --rev whose tree has the pipeline exit 2')
        k2_red = k2(me)
        if k2_red:
            bad += 1
            print(f'  RED  K2: {"; ".join(k2_red)}')
        else:
            print('  ok   K2: K1 under a decoy GIT_DIR and GIT_INDEX_FILE stays green and leaves the decoy as it was')
        for name, old, new, want in COPY_PLANTS:
            if me.count(old) != 1:
                die(f'{name}: the plant target occurs {me.count(old)} times in this script')
            off = k1_off(k1(me.replace(old, new)))
            if set(off) == set(want):
                print(f'  ok   {name}: K1 off on exactly {", ".join(want)}')
            else:
                bad += 1
                print(f'  BAD  {name}: K1 off on {", ".join(sorted(off)) or "none"}, want exactly {", ".join(want)}')
        for name, var in (('P23', 'GIT_DIR'), ('P26', 'GIT_INDEX_FILE')):
            if DECOY_CHANGED in k2(me, (var,)):
                print(f'  ok   {name}: red on K2 (the decoy changed)')
            else:
                bad += 1
                print(f'  BAD  {name}: expected K2 to find the decoy changed (K1 letting the decoy {var} through)')
    except ScratchGitError as e:
        die(f'a K1 or K2 scratch repo could not be set up: {e}')
    finally:
        shutil.rmtree(parent, ignore_errors=True)
    if bad:
        print(f'snapshot export pins --selftest: {bad} plant(s) not caught, or K1 / K2 red')
        return 1
    n = len(PLANTS) + len(copies) + len(marker_plants) + len(sw_plants) + len(COPY_PLANTS) + 2
    print(f'snapshot export pins --selftest: OK ({n} plants, K1 and K2 green)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
