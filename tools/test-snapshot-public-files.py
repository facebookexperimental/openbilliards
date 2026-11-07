#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""test-snapshot-public-files.py — the reviewed public NOTICE, README and LICENSE (manifest PUBLIC_REVIEWED).

The public NOTICE, README and LICENSE are PUBLIC_ONLY (the sync never exports them), yet they carry the
third-party attribution and the licence terms, so their text is reviewed in the private repo:
scripts/opensource/sync-public-snapshot/public-files/ holds the reviewed copies, and sync.py refuses while a public
copy differs, until --adopt-public-files writes the reviewed copy in a signed-off ceremony. This arm asserts:
  F1  PUBLIC_REVIEWED names NOTICE, README.md and LICENSE, each with a reviewed copy in public-files/
  F2  sync.reviewed_public_drift: equal copies -> nothing; a differing copy -> named; an absent public copy ->
      nothing (it is seeded like any template); a missing reviewed copy or a symlinked public copy -> refused; and
      sync.reviewed_copies reads public-files/ at the gated commit (checked at HEAD for the real pipeline)
  F3  sync.py main() takes the reviewed copies from --rev, checks the drift and raises before it writes its
      in-progress marker unless the --adopt-public-files option it defines is given, writes the reviewed copy only
      outside --dry-run, and seeds a missing NOTICE/README from the copies at --rev, never from the working tree
  F4  the reviewed NOTICE names pooltool under the Apache License 2.0 and points at the licence text, the pooltool
      notice and THIRD_PARTY_NOTICES.md; the reviewed README names no upstream project (the attribution lives in
      the licence and notice files) and points at NOTICE; the reviewed LICENSE is the MIT License with a copyright
      line, keeps the files THIRD_PARTY_NOTICES.md lists under the Apache License 2.0, says that ACM's software terms
      may also apply to crates/pool-core/src/math/quartic.rs and math/cubic.rs (the old engine's ACM Algorithm 1010
      code, which scripts/opensource/third-party-gate.txt attributes), points at the licence text and NOTICE, and
      names no upstream project
  F5  no reviewed copy carries a retired claim (a clean-room or independent implementation, no third-party
      code copied, pooltool as MIT or as an oracle only), names a forbidden upstream of
      scripts/opensource/third-party-gate.txt, or carries a snapshot BATTERY marker or a content-marker line
      (sync.line_hits, the sync battery's BATTERY_LINE check, under the copy's public path)
  F6  the copyright holder line fails closed: manifest HOLDER_PLACEHOLDER is set,
      sync.holder_placeholder_left names exactly the reviewed copies that carry it, and sync.py main() checks the
      copies at --rev before its in-progress marker and raises outside --dry-run while one still does; once the
      placeholder is replaced, the copyright lines of the reviewed LICENSE and NOTICE equal manifest HEADER, the
      holder line the sync stamps on every exported source file
  F7  scripts/opensource/export-sdk.mjs refuses the SDK export while a template carries the placeholder: it defines
      the manifest's placeholder and checks every template before its target hygiene (the first touch of --out); while
      a template still carries it, a live run exits 1 naming the placeholder and leaves --out uncreated, and so does a
      live run of a scratch replica (the script and its templates in a fresh git checkout, one template carrying the
      placeholder), so the refusal is proven live after the holder is filled too; once no real template carries it,
      the same replica without the planted placeholder must not be refused for it (the control). A row
      CHANNEL_RETIRED names is retired whatever its script says: the script must carry that refusal, a live run must
      exit 1 with it and leave --out uncreated, and its placeholder live checks print a named SKIP
  F8  scripts/opensource/flip-npm.mjs, the npm publish-flip dry run that copies LICENSE-MIT.txt and the binary licence
      template into its package layout, refuses the same way, before its scratch-copy guard (its first look at
      --scratch): a live run exits 1 naming the placeholder and leaves --scratch uncreated
  F9  scripts/opensource/flip-pypi.mjs, the PyPI flip that copies LICENSE-MIT.txt into its workspace, likewise
      (F8 and F9 run their scratch replicas too)
  F10 the identity law of sync.py --finalize (sync.publish_identity_ok): an author and committer that both end in
      the work e-mail domain pass, and so do both equal to manifest PUBLISH_NOREPLY, the maintainer's ruled
      noreply address (pinned here by its sha256, so this shipped file never carries it); a third address, another
      noreply address and a mixed pair (either order) refuse; and main()'s --finalize refuses through it, naming
      the ruled address, before it writes last-sync-base
--selftest plants each defect in a scratch copy of the pipeline and requires its row red. The F10 plants are each a
reverting mutant of one case: P10 drops the noreply clause, P10b the work-domain clause, P10c accepts any noreply
address, P10d accepts a mixed pair, P10e bypasses the check in --finalize, P10f drops the ruled address from its
message, and P10g moves PUBLISH_NOREPLY to another address. P9r deletes the retirement block from a replica of
export-sdk.mjs and requires F7 red through the arm's own row check, so CHANNEL_RETIRED alone selects the retired checks.
P5b, P5c and P5d append one content-marker line (its marker taken from the copy's manifest, so this file names none)
to the reviewed NOTICE, README.md and LICENSE in turn, and each requires F5 red.
Usage: python3 tools/test-snapshot-public-files.py [--selftest]
Exit 0 green, 1 red, 2 could not run. The public snapshot excludes scripts/opensource: there the arm prints a named
SKIP and exits 0.
"""
import hashlib, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNC = 'scripts/opensource/sync-public-snapshot'
GATE = 'scripts/opensource/third-party-gate.txt'
RETIRED = [r'clean[- ]?room', r'independent(?:ly)?\s+(?:test\s+oracle|implement)', r'implemented from published',
           r'no (?:third-party|pooltool) (?:physics )?(?:source )?code', r'pooltool\s*\(MIT', r'external test oracle',
           r're-?implemented from']


def die(why):
    print(f'snapshot public-files: could not run — {why}')
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


def copy_pipeline(sync_dir, parent, tag, edits=()):
    d = tempfile.mkdtemp(prefix=f'{tag}-', dir=parent)
    for f in os.listdir(sync_dir):
        if f.endswith('.py'):
            shutil.copyfile(os.path.join(sync_dir, f), os.path.join(d, f))
    shutil.copytree(os.path.join(sync_dir, 'public-files'), os.path.join(d, 'public-files'))
    for fname, old, new in edits:
        path = os.path.join(d, fname)
        src = open(path, encoding='utf-8').read()
        if src.count(old) != 1:
            die(f'{tag}: the edit target occurs {src.count(old)} times in {fname}')
        open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    return d


def forbidden_names():
    text = open(os.path.join(ROOT, GATE), encoding='utf-8').read()
    m = re.search(r'<!-- forbidden-upstreams:([^>]*)-->', text)
    names = [s.strip() for s in m.group(1).split('|') if s.strip()] if m else []
    if not names:
        die(f'{GATE} names no forbidden upstreams')
    return names


# the entry points that copy a template into an output tree (F7-F9): the row, the script, the section marker of its
# first touch of that tree, and the option that names the tree
TEMPLATE_WRITERS = [
    ('F7', 'scripts/opensource/export-sdk.mjs', '// ---- target hygiene', '--out'),
    ('F8', 'scripts/opensource/flip-npm.mjs', '// ---- scratch-copy guard', '--scratch'),
    ('F9', 'scripts/opensource/flip-pypi.mjs', '// ---- scratch-copy guard', '--scratch'),
]
# a template writer retired as a channel: the first words of the refusal its script prints on every run, before any
# read or write of the tree; such a row checks that refusal live and reports its placeholder live checks as a SKIP. This
# table alone retires a row: a script that lost its refusal reads red, never unretired
CHANNEL_RETIRED = {'F7': 'export-sdk: this channel is retired'}
SKIPS = []
# F10: sha256 of the maintainer's ruled noreply address (manifest PUBLISH_NOREPLY), so this shipped file never carries it
PUBLISH_NOREPLY_SHA256 = 'e2b0b9539116ff1649223c43b166f08016da572d5a9f501b9da5e0385f8f48f5'


def replica(scratch, row, script, mark, plant=True, root=ROOT):
    """F7-F9's live half after the holder is filled: a fresh git checkout holding only <script> and the templates
    beside it (copied from <root>), with LICENSE-MIT.txt carrying the placeholder (the scripts resolve their root
    through git and read the templates beside themselves)"""
    rep = tempfile.mkdtemp(prefix=f'{row.lower()}-replica-', dir=scratch)
    subprocess.run(['git', 'init', '-q', rep], check=True, capture_output=True)
    dst = os.path.join(rep, os.path.dirname(script))
    os.makedirs(dst)
    shutil.copyfile(os.path.join(root, script), os.path.join(rep, script))
    shutil.copytree(os.path.join(root, os.path.dirname(script), 'templates'), os.path.join(dst, 'templates'))
    lic = os.path.join(dst, 'templates', 'LICENSE-MIT.txt')
    text = open(lic, encoding='utf-8').read()
    if plant and mark not in text:
        open(lic, 'w', encoding='utf-8').write(f'{text}\nCopyright (c) {mark}\n')
    return rep


def template_refusal_order(src, mark, script, touch):
    """F7-F9's static half over one script's source: the placeholder constant, and the template check before the
    section that first touches its output tree. Returns the problems (empty = ok)."""
    name = os.path.basename(script)
    bad = []
    if f"const HOLDER_PLACEHOLDER = '{mark}';" not in src:
        bad.append(f'{name} does not define the manifest placeholder')
    i_check = src.find('if (unresolved.length > 0) {')
    i_fail = src.find('fail(`the templates ', i_check)
    i_touch = src.find(touch)
    if min(i_check, i_fail, i_touch) < 0 or not (i_check < i_fail < i_touch):
        bad.append(f'{name} does not refuse a placeholder-carrying template before "{touch[8:]}"')
    return bad


def writer_problems(row, script, touch, opt, mark, scratch, root=ROOT):
    """one F7-F9 row over <root>/<script> (the real tree, or a selftest replica): the static half, then the live half.
    CHANNEL_RETIRED alone marks a row retired, whatever the script says: then the script must carry the refusal, and a
    live run must exit 1 with it first and leave <opt> uncreated. Returns (the problems, the row's SKIP line or None)."""
    name = os.path.basename(script)
    src = open(os.path.join(root, script), encoding='utf-8').read()
    bad = template_refusal_order(src, mark, script, touch)
    work = tempfile.mkdtemp(prefix=f'{row.lower()}-', dir=scratch)
    retired = CHANNEL_RETIRED.get(row)
    if retired:
        if retired not in src:
            bad.append(f'{name} does not carry its retirement refusal ("{retired}")')
        out = os.path.join(work, 'retired-out')
        r = subprocess.run(['node', os.path.join(root, script), opt, out], cwd=root, capture_output=True, text=True)
        said = (r.stderr + r.stdout).strip().split('\n')[0]
        if r.returncode != 1 or not said.startswith(retired):
            bad.append(f'a live {name} run exited {r.returncode} without its retirement refusal')
        if os.path.lexists(out):
            bad.append(f'a refused {name} run created its {opt}')
        return bad, f'{row}: {said} -- its placeholder live checks do not run'
    tdir = os.path.join(root, os.path.dirname(script), 'templates')
    carrying = sorted(n for n in os.listdir(tdir)
                      if os.path.isfile(os.path.join(tdir, n)) and mark in open(os.path.join(tdir, n), encoding='utf-8').read())
    if carrying:
        out = os.path.join(work, 'probe')
        r = subprocess.run(['node', os.path.join(root, script), opt, out], cwd=root, capture_output=True, text=True)
        if r.returncode != 1 or mark not in (r.stderr + r.stdout):
            bad.append(f'a live {name} run with {len(carrying)} placeholder template(s) exited {r.returncode} without naming the placeholder')
        if os.path.lexists(out):
            bad.append(f'a refused {name} run created its {opt}')
    rep = replica(work, row, script, mark, root=root)
    out = os.path.join(work, 'replica-out')
    r = subprocess.run(['node', os.path.join(rep, script), opt, out], cwd=rep, capture_output=True, text=True)
    if r.returncode != 1 or mark not in (r.stderr + r.stdout):
        bad.append(f'a live {name} replica run with a placeholder template exited {r.returncode} without naming the placeholder')
    if os.path.lexists(out):
        bad.append(f'a refused {name} replica run created its {opt}')
    # the control: the same replica without a placeholder template must not be refused for one (when the real
    # templates still carry it, every replica does: no control then)
    if not carrying:
        ctl = replica(work, f'{row}c', script, mark, plant=False, root=root)
        r = subprocess.run(['node', os.path.join(ctl, script), opt, os.path.join(work, 'control-out')],
                           cwd=ctl, capture_output=True, text=True)
        if mark in (r.stderr + r.stdout):
            bad.append(f'a {name} replica with no placeholder template is still refused for the placeholder')
    return bad, None


def arm(sync_dir, scratch, real=False):
    sync = load(sync_dir)
    M = sync.M
    tdir = os.path.join(sync_dir, M.PUBLIC_TEMPLATE_DIR)
    reds = {}
    rev = list(getattr(M, 'PUBLIC_REVIEWED', []))
    missing = [r for r in ('NOTICE', 'README.md', 'LICENSE') if r not in rev or not os.path.isfile(os.path.join(tdir, r))]
    if missing:
        reds['F1'] = f'PUBLIC_REVIEWED or public-files/ lacks {missing}'
        return reds
    # F2: the drift function on scratch "public checkouts" (reviewed: name -> bytes)
    reviewed = {r: open(os.path.join(tdir, r), 'rb').read() for r in rev}
    pub = tempfile.mkdtemp(prefix='pub-', dir=scratch)
    f2 = []
    try:
        if sync.reviewed_public_drift(pub, reviewed) != []:
            f2.append('an absent public copy counts as drift')
        for r in rev:
            shutil.copyfile(os.path.join(tdir, r), os.path.join(pub, r))
        if sync.reviewed_public_drift(pub, reviewed) != []:
            f2.append('equal copies count as drift')
        fresh = tempfile.mkdtemp(prefix='pub-', dir=scratch)
        for r in rev:
            shutil.copyfile(os.path.join(tdir, r), os.path.join(fresh, r))
        try:
            sync.reviewed_public_drift(fresh, {})
            f2.append('a missing reviewed copy is accepted')
        except SystemExit:
            pass
        with open(os.path.join(pub, 'NOTICE'), 'a', encoding='utf-8') as f:
            f.write('\nno pooltool source code is included.\n')
        if sync.reviewed_public_drift(pub, reviewed) != ['NOTICE']:
            f2.append('a differing public NOTICE is not named')
        os.remove(os.path.join(pub, 'NOTICE'))
        os.symlink(os.path.join(tdir, 'NOTICE'), os.path.join(pub, 'NOTICE'))
        try:
            sync.reviewed_public_drift(pub, reviewed)
            f2.append('a symlinked public copy is accepted')
        except SystemExit:
            pass
        if real and sync.reviewed_copies('HEAD') != {r: subprocess.run(['git', '-C', ROOT, 'show', f'HEAD:{SYNC}/{M.PUBLIC_TEMPLATE_DIR}/{r}'],
                                                                       capture_output=True).stdout for r in rev}:
            f2.append('reviewed_copies(HEAD) does not read public-files/ at HEAD')
    except SystemExit as e:
        f2.append(f'refused unexpectedly: {e}')
    if f2:
        reds['F2'] = '; '.join(f2)
    # F3: main() takes the reviewed copies from --rev, raises on drift before the in-progress marker unless the flag
    # it defines is given, and writes the reviewed copy only outside --dry-run
    src = open(os.path.join(sync_dir, 'sync.py'), encoding='utf-8').read()
    body = src[src.find('def main():'):]
    i_copies = body.find('reviewed = reviewed_copies(args.rev)')
    i_check = body.find('reviewed_drift = reviewed_public_drift(public, reviewed)')
    i_refuse = body.find('if reviewed_drift and not args.adopt_public_files:')
    i_marker = body.find('open(IN_PROGRESS, "w")')
    adopt = re.search(r'\n    for rel in reviewed_drift:\n        if not args\.dry_run:\n'
                      r'            with open\(os\.path\.join\(public, rel\), "wb"\) as f:\n                f\.write\(reviewed\[rel\]\)\n', body)
    f3 = []
    if not re.search(r'ap\.add_argument\("--adopt-public-files", action="store_true"', body):
        f3.append('main() defines no --adopt-public-files option')
    if min(i_copies, i_check, i_refuse, i_marker) < 0 or not (i_copies < i_check < i_refuse < i_marker):
        f3.append('main() does not read the reviewed copies at --rev and check the drift before its in-progress marker')
    elif 'raise SystemExit("refusing to sync: the public "' not in body[i_refuse:i_marker]:
        f3.append('the drift branch does not raise')
    if not adopt or adopt.start() < i_marker:
        f3.append('the reviewed copy is not written (after the marker, outside --dry-run) from the copies at --rev')
    seed = re.search(r'\n    for rel in M\.PUBLIC_REVIEWED:\n        dst = os\.path\.join\(public, rel\)\n        if os\.path\.lexists\(dst\):\n'
                     r'            continue\n        seeded\.append\(rel\)\n        if not args\.dry_run:\n'
                     r'            with open\(dst, "wb"\) as f:\n                f\.write\(reviewed\[rel\]\)\n', body)
    if not seed or seed.start() < i_marker or '            if rel in M.PUBLIC_REVIEWED:\n                continue\n' not in body[seed.end():]:
        f3.append('a missing NOTICE/README is not seeded from the copies at --rev (or the template walk seeds it too)')
    if f3:
        reds['F3'] = '; '.join(f3)
    notice = open(os.path.join(tdir, 'NOTICE'), encoding='utf-8').read()
    readme = open(os.path.join(tdir, 'README.md'), encoding='utf-8').read()
    licence = open(os.path.join(tdir, 'LICENSE'), encoding='utf-8').read()
    f4 = []
    for need in ('pooltool', 'Apache License 2.0', 'web/vendor/LICENSE-Apache-2.0.txt', 'web/vendor/NOTICE-pooltool.txt',
                 'THIRD_PARTY_NOTICES.md'):
        if need not in notice:
            f4.append(f'the NOTICE lacks "{need}"')
    if re.search(r'pooltool|ekiefl', readme, re.I):
        f4.append('the README names the upstream project')
    if '(NOTICE)' not in readme:
        f4.append('the README does not point at NOTICE')
    if not licence.startswith('MIT License\n') or not re.search(r'^Copyright \(c\) \S', licence, re.M):
        f4.append('the LICENSE is not the MIT License with a copyright line')
    if not re.search(r'THIRD_PARTY_NOTICES\.md\s+lists\b[^.]*\.\s+The derived portions remain under the Apache\s+License 2\.0\.',
                     licence):
        f4.append('the LICENSE does not keep the files THIRD_PARTY_NOTICES.md lists under the Apache License 2.0')
    for need in ('web/vendor/LICENSE-Apache-2.0.txt', 'NOTICE and THIRD_PARTY_NOTICES.md'):
        if need not in re.sub(r'\s+', ' ', licence):
            f4.append(f'the LICENSE lacks "{need}"')
    if not re.search(r"ACM's software terms may also apply to\s+crates/pool-core/src/math/quartic\.rs\s+and\s+"
                     r'crates/pool-core/src/math/cubic\.rs\b', licence):
        f4.append("the LICENSE does not say that ACM's software terms may also apply to math/quartic.rs and math/cubic.rs")
    if re.search(r'pooltool|ekiefl', licence, re.I):
        f4.append('the LICENSE names the upstream project')
    if f4:
        reds['F4'] = '; '.join(f4)
    f5 = []
    for name, text in (('NOTICE', notice), ('README.md', readme), ('LICENSE', licence)):
        for pat in RETIRED:
            m = re.search(pat, text, re.I)
            if m:
                f5.append(f'{name} carries a retired claim: "{m.group(0)}"')
        for n in forbidden_names():
            if re.search(r'(?<![A-Za-z0-9_])' + re.escape(n).replace(r'\ ', r'\s+') + r'(?![A-Za-z0-9_])', text, re.I):
                f5.append(f'{name} names the forbidden upstream "{n}"')
        hits = [mk for mk in M.BATTERY if sync.marker_hit(mk, text.lower())]
        if hits:
            f5.append(f'{name} carries BATTERY marker(s) {hits}')
        line_hits = getattr(sync, 'line_hits', None)
        rows = line_hits(name, text) if line_hits else None
        if rows is None:
            f5.append('sync.line_hits is missing')
        elif rows:
            f5.append(f'{name} carries content-marker line(s) {rows}')
    if f5:
        reds['F5'] = '; '.join(f5)
    # F6: the copyright-holder placeholder refuses a real sync (a reviewed copy that carries it is never
    # published), and the reviewed LICENSE and NOTICE holder lines equal manifest HEADER
    f6 = []
    mark = getattr(M, 'HOLDER_PLACEHOLDER', '')
    if not mark or not hasattr(sync, 'holder_placeholder_left'):
        f6.append('manifest HOLDER_PLACEHOLDER or sync.holder_placeholder_left is missing')
    else:
        clean = {r: reviewed[r].replace(mark.encode(), b'A Holder') for r in rev}
        if sync.holder_placeholder_left(clean) != []:
            f6.append('copies without the placeholder are named')
        for r in rev:
            if sync.holder_placeholder_left(dict(clean, **{r: clean[r] + b'\n' + mark.encode() + b'\n'})) != [r]:
                f6.append(f'a {r} that carries the placeholder is not named')
        i_hold = body.find('placeholder_left = holder_placeholder_left(reviewed)')
        if i_hold < 0 or min(i_copies, i_marker) < 0 or not (i_copies < i_hold < i_marker):
            f6.append('main() does not check the copies at --rev for the placeholder before its in-progress marker')
        elif not re.search(r'\n    if placeholder_left:\n(?:        .*\n)*?        if not args\.dry_run:\n'
                           r'            raise SystemExit\("refusing to sync: " \+ why\)\n', body[i_hold:i_marker]):
            f6.append('main() does not raise outside --dry-run while the placeholder remains')
        for name, text in (('LICENSE', licence), ('NOTICE', notice)):
            line = next((l for l in text.splitlines() if l.startswith('Copyright (c) ')), None)
            if line is None:
                f6.append(f'the {name} has no "Copyright (c) " line')
            elif mark not in line and line != M.HEADER:
                f6.append(f'the {name} holder line "{line}" differs from manifest HEADER "{M.HEADER}"')
    if f6:
        reds['F6'] = '; '.join(f6)
    # F10: the identity law of --finalize
    f10 = []
    nr, ok = getattr(M, 'PUBLISH_NOREPLY', None), getattr(sync, 'publish_identity_ok', None)
    if not nr or ok is None:
        f10.append('manifest PUBLISH_NOREPLY or sync.publish_identity_ok is missing')
    else:
        if hashlib.sha256(nr.encode()).hexdigest() != PUBLISH_NOREPLY_SHA256:
            f10.append('manifest PUBLISH_NOREPLY is not the ruled address (its sha256 differs from the pin)')
        # synthetic addresses only: example.com (RFC 2606), an obvious example local part at the work domain, and a
        # noreply address for user id 0, which no GitHub account has
        other_nr = '0+example@users.noreply.github.com'
        wa, wc = 'example-author@meta.com', 'example-committer@meta.com'
        for label, ae, ce, want in (('the ruled noreply pair', nr, nr, True),
                                    ('a work-domain pair', wa, wc, True),
                                    ('a third address', 'someone@example.com', 'someone@example.com', False),
                                    ('another noreply address', other_nr, other_nr, False),
                                    ('a mixed pair', wa, nr, False),
                                    ('a mixed pair, reversed', nr, wc, False)):
            if bool(ok(ae, ce)) != want:
                f10.append(f'{label} {"refuses" if want else "passes"}')
        i_fin = body.find('    if args.finalize:\n')
        i_chk = body.find('        if not publish_identity_ok(ae, ce):\n', i_fin)
        i_raise = body.find('raise SystemExit(', i_chk)
        i_base = body.find('open(BASE_FILE, "w")', i_fin)
        if min(i_fin, i_chk, i_raise, i_base) < 0 or not (i_fin < i_chk < i_raise < i_base):
            f10.append('--finalize does not refuse through publish_identity_ok before it writes last-sync-base')
        elif 'M.PUBLISH_NOREPLY' not in body[i_raise:i_base]:
            f10.append('the --finalize refusal does not name the ruled address')
    if f10:
        reds['F10'] = '; '.join(f10)
    # F7-F9: the SDK export and both publish flips refuse the placeholder too (checked on the real tree only: the
    # scripts live beside the pipeline, not in it)
    if real and mark:
        for row, script, touch, opt in TEMPLATE_WRITERS:
            bad, skip = writer_problems(row, script, touch, opt, mark, scratch)
            if skip:
                SKIPS.append(skip)
            if bad:
                reds[row] = '; '.join(bad)
    return reds


# F5's content-marker plants: one line carrying a manifest marker appended to one reviewed copy each (main())
MARKER_PLANTS = (('P5b', 'NOTICE'), ('P5c', 'README.md'), ('P5d', 'LICENSE'))
PLANTS = [
    ('P1', ['F1'], [('manifest.py', 'PUBLIC_REVIEWED = ["NOTICE", "README.md", "LICENSE"]', 'PUBLIC_REVIEWED = ["NOTICE", "README.md"]')]),
    ('P2', ['F2'], [('sync.py', '                drift.append(rel)\n', '                pass\n')]),
    ('P3', ['F3'], [('sync.py', '    if reviewed_drift and not args.adopt_public_files:\n', '    if reviewed_drift and False:\n')]),
    ('P3b', ['F3'], [('sync.py', 'ap.add_argument("--adopt-public-files", action="store_true",', 'ap.add_argument("--adopt-public-filez", action="store_true",')]),
    ('P3c', ['F3'], [('sync.py', 'raise SystemExit("refusing to sync: the public "', 'print("refusing to sync: the public "')]),
    ('P3d', ['F3'], [('sync.py', '        if not args.dry_run:\n            with open(os.path.join(public, rel), "wb") as f:',
                      '        if True:\n            with open(os.path.join(public, rel), "wb") as f:')]),
    ('P3e', ['F3'], [('sync.py', '    reviewed = reviewed_copies(args.rev)\n',
                      '    reviewed = {r: open(os.path.join(TEMPLATES, r), "rb").read() for r in M.PUBLIC_REVIEWED}\n')]),
    ('P3f', ['F3'], [('sync.py', '            if rel in M.PUBLIC_REVIEWED:\n                continue\n', '')]),
    ('P3g', ['F3'], [('sync.py', '        seeded.append(rel)\n        if not args.dry_run:\n            with open(dst, "wb") as f:\n                f.write(reviewed[rel])\n',
                      '        seeded.append(rel)\n        if not args.dry_run:\n            with open(dst, "wb") as f:\n                f.write(open(os.path.join(tdir, rel), "rb").read())\n')]),
    ('P4', ['F4'], [('public-files/README.md', 'Parts of the physics\nkernel are derived from third-party open-source code',
                     'Parts of the physics\nkernel are derived from pooltool open-source code')]),
    ('P5', ['F5'], [('public-files/NOTICE', '  modified. The derived portions remain under the Apache License 2.0.\n',
                     '  modified. No pooltool source code is included.\n')]),
    ('P6', ['F5'], [('public-files/README.md', 'Leckie–Greenspan event simulation)', 'Leckie–Greenspan event simulation, the ACM\nCALGO code)')]),
    ('P7', ['F4'], [('public-files/LICENSE', 'The derived portions remain under the Apache License 2.0.\n',
                     'The derived portions are relicensed under the MIT license.\n')]),
    ('P7b', ['F4'], [('public-files/LICENSE', 'third-party code licensed\n', 'pooltool code licensed\n')]),
    ('P7c', ['F4'], [('public-files/LICENSE', "ACM's software terms may also apply to crates/pool-core/src/math/quartic.rs\n"
                      'and crates/pool-core/src/math/cubic.rs, which implement ACM Algorithm 1010,\n'
                      'and to the physics kernel binary built from them.\n', '')]),
    ('P8', ['F6'], [('sync.py', '        if not args.dry_run:\n            raise SystemExit("refusing to sync: " + why)\n',
                     '        if False:\n            raise SystemExit("refusing to sync: " + why)\n')]),
    ('P8b', ['F6'], [('sync.py', '    return [rel for rel in M.PUBLIC_REVIEWED if M.HOLDER_PLACEHOLDER.encode() in reviewed[rel]]\n',
                      '    return []\n')]),
    ('P8c', ['F6'], [('public-files/LICENSE', 'Copyright (c) Meta Platforms, Inc. and affiliates.\n', 'Copyright (c) A Different Holder\n')]),
    ('P10', ['F10'], [('sync.py', '            or all(e == M.PUBLISH_NOREPLY for e in (ae, ce)))\n', '            or False)\n')]),
    ('P10b', ['F10'], [('sync.py', '    return (all(e.endswith("@meta.com") for e in (ae, ce))\n', '    return (False\n')]),
    ('P10c', ['F10'], [('sync.py', '            or all(e == M.PUBLISH_NOREPLY for e in (ae, ce)))\n',
                        '            or all(e.endswith("@users.noreply.github.com") for e in (ae, ce)))\n')]),
    ('P10d', ['F10'], [('sync.py', '    return (all(e.endswith("@meta.com") for e in (ae, ce))\n',
                        '    return (any(e.endswith("@meta.com") for e in (ae, ce))\n')]),
    ('P10e', ['F10'], [('sync.py', '        if not publish_identity_ok(ae, ce):\n', '        if False:\n')]),
    ('P10f', ['F10'], [('sync.py', '                             f"{M.PUBLISH_NOREPLY} as both author and "\n',
                        '                             "the noreply address as both author and "\n')]),
    ('P10g', ['F10'], [('manifest.py', 'PUBLISH_NOREPLY = "', 'PUBLISH_NOREPLY = "9+')]),
]


def main():
    selftest = '--selftest' in sys.argv[1:]
    sync_dir = os.path.join(ROOT, SYNC)
    if not os.path.exists(os.path.join(sync_dir, 'sync.py')):
        print(f'snapshot public-files: SKIP — {SYNC}/sync.py is absent (the public snapshot excludes {SYNC})')
        return 0
    parent = tempfile.mkdtemp(prefix='obw-snapshot-public-files-')
    try:
        reds = arm(sync_dir, parent, real=True)
        for skip in SKIPS:
            print(f'  SKIP {skip}')
        for name in sorted(reds):
            print(f'  RED  {name}: {reds[name]}')
        if reds:
            print(f'snapshot public-files: RED ({len(reds)})')
            return 1
        print('snapshot public-files: OK — NOTICE, README.md and LICENSE reviewed in public-files/, drift refused before '
              'the ceremony marker, the attribution in the NOTICE only, the derived files kept under Apache-2.0 by the '
              'LICENSE, no retired claim, forbidden name, BATTERY marker or content-marker line, a real sync and '
              'both publish flips refused while the copyright-holder placeholder remains, the retired SDK export '
              'refused on every run; and '
              '--finalize takes a work identity or exactly the ruled noreply one')
        if not selftest:
            return 0
        bad = 0
        for name, want, edits in PLANTS:
            # the selftest copies' public-files/ edits: copy_pipeline applies them relative to the copy
            got = arm(copy_pipeline(sync_dir, parent, name, edits), parent)
            missing = [c for c in want if c not in got]
            if missing:
                bad += 1
                print(f'  BAD  {name}: expected red on {", ".join(want)}, missing {", ".join(missing)} (red: {", ".join(sorted(got)) or "none"})')
            else:
                print(f'  ok   {name}: red on {", ".join(want)}')
        # F5's content-marker scan, planted per reviewed copy: one marker line appended to it in a pipeline copy must
        # read red. The marker is the first of the copy's first BATTERY_LINE class, so this file names none
        mk = next(iter(load(sync_dir).M.BATTERY_LINE.values()))[0]
        for name, rel in MARKER_PLANTS:
            d = copy_pipeline(sync_dir, parent, name)
            with open(os.path.join(d, 'public-files', rel), 'a', encoding='utf-8') as f:
                f.write(f'\nContact: {mk}\n')
            what = f'a content-marker line appended to the reviewed {rel}'
            if 'F5' in arm(d, parent):
                print(f'  ok   {name}: red on F5 ({what})')
            else:
                bad += 1
                print(f'  BAD  {name}: expected red on F5 ({what}), got none')
        # F7-F9's static half planted in process: each script's refusal moved after its first touch of the output tree
        # must read red
        mark = load(sync_dir).M.HOLDER_PLACEHOLDER
        for (row, script, touch, _opt), plant in zip(TEMPLATE_WRITERS, ('P9', 'P9b', 'P9c')):
            src = open(os.path.join(ROOT, script), encoding='utf-8').read()
            head = src.find('// ---- copyright holder')
            moved = src.replace(touch, '// ---- (first touch moved)', 1)
            moved = moved[:head] + touch + '\n' + moved[head:] if head >= 0 else moved
            what = f'the refusal after "{touch[8:]}"'
            if template_refusal_order(moved, mark, script, touch):
                print(f'  ok   {plant}: red on {row} ({what})')
            else:
                bad += 1
                print(f'  BAD  {plant}: expected red on {row} ({what}), got none')
        # a retired row's refusal deleted, in a replica (one template carrying the placeholder, so the mutant refuses
        # before its first touch of the output tree): the arm's own row check must read red. Each retired row needs its
        # own named plant; one without is a BAD, never a silent skip
        for row, retired in sorted(CHANNEL_RETIRED.items()):
            plant = {'F7': 'P9r'}.get(row)
            if plant is None:
                bad += 1
                print(f'  BAD  {row}: CHANNEL_RETIRED retires it, but no retirement plant names it')
                continue
            _row, script, touch, opt = next(w for w in TEMPLATE_WRITERS if w[0] == row)
            rep = replica(parent, f'{plant}', script, mark)
            path = os.path.join(rep, script)
            src = open(path, encoding='utf-8').read()
            k = src.find(retired)
            i, j = src.rfind('\n\n', 0, k) + 2, src.find('process.exit(1);\n', k) + len('process.exit(1);\n')
            what = 'the retirement block deleted'
            if k < 0 or i < 2 or j < k:
                bad += 1
                print(f'  BAD  {plant}: could not plant on {row} ({what}): the block is not where the plant looks')
                continue
            open(path, 'w', encoding='utf-8').write(src[:i] + src[j:])
            got, _skip = writer_problems(row, script, touch, opt, mark, parent, root=rep)
            if got:
                print(f'  ok   {plant}: red on {row} ({what})')
            else:
                bad += 1
                print(f'  BAD  {plant}: expected red on {row} ({what}), got none')
        if bad:
            print(f'snapshot public-files --selftest: {bad} plant(s) not caught')
            return 1
        n = len(PLANTS) + len(MARKER_PLANTS) + len(TEMPLATE_WRITERS) + len(CHANNEL_RETIRED)
        print(f'snapshot public-files --selftest: OK ({n} plants)')
        return 0
    finally:
        shutil.rmtree(parent, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
