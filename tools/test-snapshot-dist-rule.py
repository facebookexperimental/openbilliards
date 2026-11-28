#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""test-snapshot-dist-rule.py — when the public snapshot's dist must be rebuilt (sync.dist_rebuild_paths).

A sync stops at PENDING when the private change set touches the public dist's sources (web/dist/, crates/, sdk/ts/):
the dist is then rebuilt in the public checkout before the sync goes on. A path that no non-test build reads (neither
wasm compiles or reads it) needs no rebuild. The committed dist's own freshness step in .github/workflows/ci.yml
("dist wasm freshness (committed canonical physics)") excludes such paths from its gate, and the sync takes exactly
those exclusions (sync.DIST_NEUTRAL). The rule reads the private diff with git's rename detection off
(sync.dist_names), so a file moved into a neutral folder still counts by its old name, as the freshness step's
pathspec diff sees the deletion. This arm asserts, at HEAD:
  D0  DIST_NEUTRAL is the set of the freshness step's ':(exclude)' pathspecs
  D1  dist_rebuild_paths over a fixed table: a neutral path, a bare neutral directory entry, a file under a neutral
      directory and a path outside the three sources need no rebuild; every other path under them does, near names
      included (INTAKE.sha256.bak, a testsuite/ or tests2/ beside tests/, a nested src/tests/, a sibling crate's
      tests/); the result is sorted
  D2  sync.main() takes its dist set from dist_rebuild_paths(dist_names(base, rev)), and no longer carries the coarse
      rule inline (a static check of main's body)
  D3  this file carries no BATTERY marker
  D4  in a scratch repository, a commit that moves crates/pool-core/src/moved.rs to crates/pool-core/tests/moved.rs:
      dist_names lists both names, and dist_rebuild_paths of that list is the old name alone
--selftest then plants copies of the pipeline, and of ci.yml, and requires the named case red:
  P1  DIST_NEUTRAL gains an entry the freshness step does not exclude (crates/pool-cli) -> D0, D1
  P2  dist_rebuild_paths without the exclusions (the coarse rule) -> D1
  P3  main() takes the coarse rule inline again -> D2
  P4  a ci.yml whose freshness step excludes one more path -> D0
  P5  dist_names with git's rename detection on (the move folds into its new, neutral name) -> D4
Usage: python3 tools/test-snapshot-dist-rule.py [--sync-dir <dir>] [--selftest]
Exit 0 green, 1 red, 2 could not run. The public snapshot excludes scripts/opensource: there the arm prints a
named SKIP and exits 0.
"""
import os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNC = 'scripts/opensource/sync-public-snapshot'
CI = '.github/workflows/ci.yml'
STEP = '- name: dist wasm freshness (committed canonical physics)'
# (path, needs the public dist rebuilt)
TABLE = [
    ('web/dist/pool-wasm/pool_wasm_bg.wasm', True),
    ('web/dist/pool-sdk/index.js', True),
    ('sdk/ts/src/index.ts', True),
    ('crates/pool-core/src/lib.rs', True),
    ('crates/pool-core/src/tests/a.rs', True),
    ('crates/pool-wasm/tests/fixtures.rs', True),
    ('crates/pool-rules/tests/slice.rs', True),
    ('crates/pool-cli/src/main.rs', True),
    ('crates/kroots/src/lib.rs', True),
    ('crates/kroots/INTAKE.sha256.bak', True),
    ('crates/kroots/testsuite/a.rs', True),
    ('crates/pool-core/testsuite/a.rs', True),
    ('crates/pool-core/tests2/a.rs', True),
    ('crates/pool-core/tests', False),
    ('crates/pool-core/tests/fixtures/break.json', False),
    ('crates/kroots/tests/README.md', False),
    ('crates/kroots/tests/data/roots-dev-v2.json', False),
    ('crates/kroots/INTAKE.sha256', False),
    ('web/app/main.js', False),
]
INLINE = 'if p.startswith(("web/dist/", "crates/", "sdk/ts/"))'
CALL = '    real_dist_changed = dist_rebuild_paths(dist_names(base, rev))\n'
ANCHOR = "':(exclude)crates/kroots/INTAKE.sha256'"
MOVED = ('crates/pool-core/src/moved.rs', 'crates/pool-core/tests/moved.rs')


def die(why):
    print(f'snapshot dist-rule: could not run — {why}')
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


def copy_pipeline(sync_dir, parent, tag, fname, old, new):
    d = tempfile.mkdtemp(prefix=f'{tag}-', dir=parent)
    for f in os.listdir(sync_dir):
        if f.endswith('.py'):
            shutil.copyfile(os.path.join(sync_dir, f), os.path.join(d, f))
    path = os.path.join(d, fname)
    src = open(path, encoding='utf-8').read()
    if src.count(old) != 1:
        die(f'{tag}: the edit target occurs {src.count(old)} times in {fname}')
    open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    return d


def freshness_exclusions(ci_text):
    """The ':(exclude)' pathspecs of ci.yml's dist wasm freshness step, in order."""
    at = ci_text.find(STEP)
    if at < 0:
        die(f'{CI} has no step "{STEP[8:]}"')
    end = ci_text.find('\n      - name: ', at + len(STEP))
    return re.findall(r"':\(exclude\)([^']+)'", ci_text[at:end if end > 0 else len(ci_text)])


# git without the user's or the system's configuration, so its defaults (rename detection on) hold everywhere
GIT_ENV = {'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1'}


def moved_repo(parent):
    """A scratch repository with two commits, the second moving MOVED[0] to MOVED[1]; returns (repo, base, rev)."""
    repo = tempfile.mkdtemp(prefix='moved-', dir=parent)
    env = dict(os.environ, **GIT_ENV)

    def g(*a):
        r = subprocess.run(['git', '-C', repo, '-c', 'user.name=arm', '-c', 'user.email=arm@example.com',
                            '-c', 'commit.gpgsign=false', '-c', f'core.hooksPath={os.devnull}', *a],
                           capture_output=True, text=True, env=env)
        if r.returncode != 0:
            die(f'git {" ".join(a)} in the scratch repository failed: {r.stderr.strip()[:200]}')
        return r.stdout.strip()
    g('init', '-q')
    for p in MOVED:
        os.makedirs(os.path.join(repo, os.path.dirname(p)), exist_ok=True)
    with open(os.path.join(repo, MOVED[0]), 'w', encoding='utf-8') as f:
        f.write('pub fn moved() -> u32 {\n    7\n}\n')
    g('add', '-A')
    g('commit', '-q', '-m', 'a source file')
    base = g('rev-parse', 'HEAD')
    g('mv', MOVED[0], MOVED[1])
    g('commit', '-q', '-m', 'the file moved into the neutral folder')
    return repo, base, g('rev-parse', 'HEAD')


def moved_case(sync, moved):
    """D4's reason, or None: dist_names over the move, run in the scratch repository."""
    if not hasattr(sync, 'dist_names'):
        return 'sync has no dist_names'
    repo, base, rev = moved
    saved = sync.PRIVATE, {k: os.environ.get(k) for k in GIT_ENV}
    sync.PRIVATE = repo
    os.environ.update(GIT_ENV)
    try:
        names = sync.dist_names(base, rev)
    except SystemExit as e:
        return f'dist_names failed: {e}'
    finally:
        sync.PRIVATE = saved[0]
        for k, v in saved[1].items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
    got = sync.dist_rebuild_paths(names)
    if sorted(names) != sorted(MOVED) or got != [MOVED[0]]:
        return f'the move reads as {sorted(names)}, its rebuild set {got}, not both names and {MOVED[0]} alone'
    return None


def arm(sync_dir, ci_text, moved):
    sync = load(sync_dir)
    M = sync.M
    reds = {}
    excl = freshness_exclusions(ci_text)
    if not excl:
        reds['D0'] = f'the freshness step in {CI} excludes no path'
    elif sorted(sync.DIST_NEUTRAL) != sorted(excl):
        reds['D0'] = f"DIST_NEUTRAL {sorted(sync.DIST_NEUTRAL)} is not the freshness step's exclusions {sorted(excl)}"
    got = sync.dist_rebuild_paths([p for p, _ in TABLE])
    wrong = [p for p, want in TABLE if (p in got) != want]
    if wrong or got != sorted(got):
        reds['D1'] = (f'{len(wrong)} table path(s) misjudged ({", ".join(wrong[:4])})'
                      + ('' if got == sorted(got) else '; the result is not sorted'))
    src = open(os.path.join(sync_dir, 'sync.py'), encoding='utf-8').read()
    body = src[src.find('\ndef main('):src.find('\nif __name__ ==')]
    if CALL not in body or INLINE in body:
        reds['D2'] = ('sync.main() does not take its dist set from dist_rebuild_paths(dist_names(base, rev))'
                      + (' (the coarse rule is inline)' if INLINE in body else ''))
    own = open(os.path.abspath(__file__), encoding='utf-8').read().lower()
    if any(sync.marker_hit(m, own) for m in M.BATTERY):
        reds['D3'] = 'this file carries a BATTERY marker'
    why = moved_case(sync, moved)
    if why:
        reds['D4'] = why
    return reds, excl


PLANTS = [
    ('P1', ['D0', 'D1'], 'sync.py', 'DIST_NEUTRAL = (', 'DIST_NEUTRAL = ("crates/pool-cli", '),
    ('P2', ['D1'], 'sync.py', ' and not dist_neutral(p))', ')'),
    ('P3', ['D2'], 'sync.py', CALL, '    real_dist_changed = sorted(\n        p for p in changed\n        ' + INLINE + ')\n'),
    ('P5', ['D4'], 'sync.py', '"--no-renames", ', ''),
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
        print(f'snapshot dist-rule: SKIP — {SYNC}/sync.py is absent (the public snapshot excludes {SYNC})')
        return 0
    try:
        ci_text = open(os.path.join(ROOT, CI), encoding='utf-8').read()
    except OSError as e:
        die(f'{CI} cannot be read ({e})')
    parent = tempfile.mkdtemp(prefix='obw-snapshot-dist-rule-')
    try:
        moved = moved_repo(parent)
        reds, excl = arm(sync_dir, ci_text, moved)
        for name in sorted(reds):
            print(f'  RED  {name}: {reds[name]}')
        if reds:
            print(f'snapshot dist-rule: RED ({len(reds)})')
            return 1
        print(f"snapshot dist-rule: OK — DIST_NEUTRAL is the freshness step's {len(excl)} exclusions, {len(TABLE)} "
              'table paths judged as wanted, main() takes dist_rebuild_paths(dist_names(base, rev)), a move into a '
              'neutral folder counts by its old name')
        if not selftest:
            return 0
        if ci_text.count(ANCHOR) != 1:
            die(f'P4: its anchor occurs {ci_text.count(ANCHOR)} times in {CI}')
        runs = [(name, want, arm(copy_pipeline(sync_dir, parent, name, fname, old, new), ci_text, moved)[0])
                for name, want, fname, old, new in PLANTS]
        runs.append(('P4', ['D0'], arm(sync_dir, ci_text.replace(ANCHOR, ANCHOR + " ':(exclude)crates/pool-cli'"),
                                       moved)[0]))
        runs.sort(key=lambda r: r[0])
        bad = 0
        for name, want, got in runs:
            missing = [c for c in want if c not in got]
            if missing:
                bad += 1
                print(f'  BAD  {name}: expected red on {", ".join(want)}, missing {", ".join(missing)} '
                      f'(red: {", ".join(sorted(got)) or "none"})')
            else:
                print(f'  ok   {name}: red on {", ".join(want)}')
        if bad:
            print(f'snapshot dist-rule --selftest: {bad} plant(s) not caught')
            return 1
        print(f'snapshot dist-rule --selftest: OK ({len(runs)} plants)')
        return 0
    finally:
        shutil.rmtree(parent, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
