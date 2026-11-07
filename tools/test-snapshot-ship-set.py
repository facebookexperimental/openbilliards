#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""test-snapshot-ship-set.py — two guards on what the public snapshot ships (sync.excluded()).

The fail-closed repository root: lane reports, orders and audits land at the root, and the root used to ship by
default (54 of 59 root files did on 2026-10-18). A root-level file now ships only when manifest ROOT_SHIP lists it;
deeper paths keep their own rules. The never-ship harness: tools/rewrite-verify/ (the kernel rewrite's dirty-side
differential harness, with a materialized legacy kernel) is excluded before it lands. This arm asserts, at HEAD:
  R0  every root file ships exactly when ROOT_SHIP lists it, and every ROOT_SHIP entry is a root file at HEAD
  R1  new unlisted root files (a report, a dotfile, a data file) do not ship
  R2  the root rule changes no deeper path: every tracked non-root path, the legal files among them included, has
      the fate it has without the rule
  R3  ROOT_SHIP is pinned below by digest; this file carries no BATTERY marker
  R4  no path under tools/rewrite-verify/ ships (preventive: the harness is not on main yet)
--selftest then plants copies of the pipeline and requires the named case red:
  P1  the root rule removed -> R0, R1
  P2  ROOT_SHIP gains one of R1's new names -> R1, R3
  P3  the root rule applied to every path -> R2
  P4  the tools/rewrite-verify/ exclusion removed -> R4
Usage: python3 tools/test-snapshot-ship-set.py [--sync-dir <dir>] [--selftest]
Exit 0 green, 1 red, 2 could not run. The public snapshot excludes scripts/opensource: there the arm prints a
named SKIP and exits 0.
"""
import hashlib, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNC = 'scripts/opensource/sync-public-snapshot'
# sha256 of '\n'.join(sorted(ROOT_SHIP)): adding a root file to the public snapshot needs a deliberate edit here
EXPECTED_ROOT_DIGEST = '41c6babc159ed3da2bb93e90fa5a5c804e2b9f3c856c7388e35fbaf0eb77d6bf'
NEW_ROOT = ['ZZ-NEW-REPORT.md', '.zz-new-dotfile', 'zz_new_data.json']
HARNESS = ['tools/rewrite-verify/Cargo.toml', 'tools/rewrite-verify/legacy/pool-core-legacy/src/lib.rs',
           'tools/rewrite-verify/g2/src/main.rs', 'tools/rewrite-verify/scripts/materialize-legacy.zsh']
LEGAL = re.compile(r'(^|/)(licen[cs]es?|notice|copying|third[_-]?party)[^/]*$', re.I)
RULE = '    if "/" not in p and p not in M.ROOT_SHIP:\n        return True\n'


def die(why):
    print(f'snapshot ship-set: could not run — {why}')
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


def copy_pipeline(sync_dir, parent, tag, fname=None, old=None, new=None):
    d = tempfile.mkdtemp(prefix=f'{tag}-', dir=parent)
    for f in os.listdir(sync_dir):
        if f.endswith('.py'):
            shutil.copyfile(os.path.join(sync_dir, f), os.path.join(d, f))
    if fname:
        path = os.path.join(d, fname)
        src = open(path, encoding='utf-8').read()
        if src.count(old) != 1:
            die(f'{tag}: the edit target occurs {src.count(old)} times in {fname}')
        open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    return d


def arm(sync_dir, tracked, ref):
    sync = load(sync_dir)
    M = sync.M
    reds = {}
    root = [p for p in tracked if '/' not in p]
    bad = [p for p in root if sync.excluded(p) == (p in M.ROOT_SHIP)]
    stale = sorted(set(M.ROOT_SHIP) - set(root))
    if bad or stale:
        reds['R0'] = f'{len(bad)} root file(s) whose fate disagrees with ROOT_SHIP ({", ".join(bad[:4])}); stale entries {stale}'
    ships = [p for p in NEW_ROOT if not sync.excluded(p)]
    if ships:
        reds['R1'] = f'new unlisted root file(s) ship: {ships}'
    # the reference for every deeper path: the pipeline under test's ORIGIN without the root rule (built once in
    # main from the real pipeline, never from a planted copy)
    deep = [p for p in tracked if '/' in p]
    moved = [p for p in deep if ref.excluded(p) != sync.excluded(p)]
    legal = [p for p in deep if LEGAL.search(p)]
    if moved:
        reds['R2'] = f'{len(moved)} non-root path(s) change fate under the root rule ({", ".join(moved[:4])})'
    r3 = []
    digest = hashlib.sha256('\n'.join(sorted(M.ROOT_SHIP)).encode()).hexdigest()
    if digest != EXPECTED_ROOT_DIGEST:
        r3.append(f'ROOT_SHIP digest {digest[:12]} != the pinned {EXPECTED_ROOT_DIGEST[:12]}')
    own = open(os.path.abspath(__file__), encoding='utf-8').read().lower()
    if any(sync.marker_hit(m, own) for m in M.BATTERY):
        r3.append('this file carries a BATTERY marker')
    if r3:
        reds['R3'] = '; '.join(r3)
    harness = [p for p in HARNESS + [p for p in tracked if p.startswith('tools/rewrite-verify/')] if not sync.excluded(p)]
    if harness:
        reds['R4'] = f'{len(harness)} path(s) under tools/rewrite-verify/ ship ({", ".join(harness[:3])})'
    return reds, len(root), len(deep), len(legal)


PLANTS = [
    ('P1', ['R0', 'R1'], 'sync.py', RULE, ''),
    ('P2', ['R1', 'R3'], 'manifest.py', 'ROOT_SHIP = {', f'ROOT_SHIP = {{"{NEW_ROOT[0]}", '),
    ('P3', ['R2'], 'sync.py', '    if "/" not in p and p not in M.ROOT_SHIP:\n', '    if p not in M.ROOT_SHIP:\n'),
    ('P4', ['R4'], 'manifest.py', '    "tools/rewrite-verify/",', '   '),
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
        print(f'snapshot ship-set: SKIP — {SYNC}/sync.py is absent (the public snapshot excludes {SYNC})')
        return 0
    try:
        tracked = subprocess.run(['git', '-C', ROOT, 'ls-tree', '-r', '--name-only', 'HEAD'], capture_output=True,
                                 text=True, check=True).stdout.splitlines()
    except (OSError, subprocess.CalledProcessError) as e:
        die(f'git ls-tree HEAD failed ({e})')
    parent = tempfile.mkdtemp(prefix='obw-snapshot-ship-set-')
    try:
        if open(os.path.join(sync_dir, 'sync.py'), encoding='utf-8').read().count(RULE) != 1:
            print('  RED  R0: sync.excluded() carries no root rule')
            print('snapshot ship-set: RED (1)')
            return 1
        ref = load(copy_pipeline(sync_dir, parent, 'ref', 'sync.py', RULE, ''))
        reds, n_root, n_deep, n_legal = arm(sync_dir, tracked, ref)
        for name in sorted(reds):
            print(f'  RED  {name}: {reds[name]}')
        if reds:
            print(f'snapshot ship-set: RED ({len(reds)})')
            return 1
        print(f'snapshot ship-set: OK — {n_root} root files ({len(load(sync_dir).M.ROOT_SHIP)} listed ship), '
              f'{len(NEW_ROOT)} new names held back, {n_deep} deeper paths ({n_legal} legal) keep their fate, ROOT_SHIP pinned, '
              f'tools/rewrite-verify/ held back')
        if not selftest:
            return 0
        bad = 0
        for name, want, fname, old, new in PLANTS:
            got, *_ = arm(copy_pipeline(sync_dir, parent, name, fname, old, new), tracked, ref)
            missing = [c for c in want if c not in got]
            if missing:
                bad += 1
                print(f'  BAD  {name}: expected red on {", ".join(want)}, missing {", ".join(missing)} (red: {", ".join(sorted(got)) or "none"})')
            else:
                print(f'  ok   {name}: red on {", ".join(want)}')
        if bad:
            print(f'snapshot ship-set --selftest: {bad} plant(s) not caught')
            return 1
        print(f'snapshot ship-set --selftest: OK ({len(PLANTS)} plants)')
        return 0
    finally:
        shutil.rmtree(parent, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
