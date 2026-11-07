#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""GULLY receipt — bind the ball-return module's OWN validators to the exact bytes of the Diamond gully files.

The three files under web/scene/ballreturn/ (the track export, the V18 assembly declaration, the V17 hardware companion)
follow the ball-return module's schema and provenance law (V0–V12 / V17 / V18), whose validators live in the module's tree
(#707), not in this one. The O22 census therefore DELEGATES their numeric leaves — but a delegation without a byte-bound
proof is a hole (review 644g1 P2-2: a malformed track JSON passed). This tool closes it:

  --write   run the module's validators (from OB_BALLRETURN_TREE, read-only: node <tree>/web/tools/test-ballreturn.mjs
            --track <file>; assembly.js validateAssembly; hardware.js validateHardware) on the files IN THIS TREE and write
            tools/render/d621/law/gully_receipt_621.json = per file {path, sha256, validator, ok, ok_line}, plus the validator
            tree, its HEAD and the node version; the receipt records no home path: the tree under check is written
            <worktree>, the validator tree <ballreturn-tree>, any other path under the home directory ~
  --check   verify that every delegated file present in the tree has a receipt row whose sha256 equals the file's bytes
            (a missing row, a stale sha or a malformed receipt = FAIL); this is what round_census_621.py calls. A receipt
            row whose file was renamed by a table rename of the id map (idmap_621.py over web/scene/equipmentalias.js) is
            followed to the renamed file, accepted only when that file carries the row's sha256; an unreadable id map = FAIL
  --red-arm on a scratch COPY of the tree: (a) a malformed track JSON must FAIL --check, (b) a receipt row deleted must FAIL,
            (c) the untouched copy must PASS, (d) an unreceipted NESTED JSON under the prefix must FAIL (GULLY-FIX2 C4), (e) with
            OB_BALLRETURN_TREE set: a DECOY validator tree holding a same-named VALID file must NOT yield a receipt for a malformed
            candidate given a relative --root (GULLY-FIX2 C3) — proves the receipt is load-bearing and byte-bound

Exit 0 = OK, 3 = FAIL, 2 = usage.
"""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
RECEIPT = "tools/render/d621/law/gully_receipt_621.json"
PREFIX = "web/scene/ballreturn/"
KINDS = {"tracks": "test-ballreturn.mjs --track (V0–V12 + the drain rule against the kernel cups)",
         "assemblies": "assembly.js validateAssembly (V18)",
         "hardware": "hardware.js validateHardware (V17)"}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def table_renames(root):
    """The table renames of the tree under check: the TABLE_RENAMES block of its web/scene/equipmentalias.js, read through
    idmap_621.py (this directory). A read or parse failure raises; it is never an empty map, which would silently turn the
    follow of the git mv off."""
    import idmap_621
    return idmap_621.load(Path(root) / "web/scene/equipmentalias.js")[0]


def delegated_files(root):
    """EVERY JSON beneath web/scene/ballreturn/ (recursive — GULLY-FIX2 C4, review 644g2 P2-4: a nested tracks/x/y.json is
    delegated by the census's prefix rule and must therefore be receipted like the top-level files; a kind outside the three
    validator-backed directories is listed and refused by --write, never silently skipped)."""
    root = Path(root); base = root / PREFIX
    if not base.is_dir(): return []
    return sorted(str(p.relative_to(root)) for p in base.rglob("*.json") if p.is_file() and not module_owned(root, str(p.relative_to(root))))


def module_owned(root, rel):
    """D-3 (the ball-return module landed on main, #707): a JSON under the prefix that exists at the same path in the module's
    OWN tree (OB_BALLRETURN_TREE — at D-3 an export of main) with IDENTICAL bytes is the module's file, not a lane file: it is
    not delegated by this census (its provenance is main's) and is never receipted. Absent the tree, nothing is owned."""
    tree = os.environ.get("OB_BALLRETURN_TREE")
    if not tree: return False
    other = Path(tree) / rel
    try:
        mine = (Path(root) / rel).read_bytes()
        if other.is_file() and other.read_bytes() == mine: return True
    except OSError: return False
    # across the git mv (#789): identical bytes at the pre-move path <dir>/<old>.json, where the id map renames old to this stem
    # (an id map failure raises here; only the file reads of the two trees are caught)
    p = Path(rel)
    for old in (o for o, n in table_renames(root).items() if n == p.stem):
        pre = Path(tree) / p.with_name(old + ".json")
        try:
            if pre.is_file() and pre.read_bytes() == mine: return True
        except OSError: pass
    return False


def kind_of(rel):
    parts = rel.split("/")
    return parts[3] if len(parts) > 4 and parts[3] in KINDS else None


def run_validator(tree, root, rel):
    kind = kind_of(rel)
    if kind is None:
        return False, f"no validator for {rel} (only {'/'.join(KINDS)} directly under {PREFIX} are receipted)"
    # GULLY-FIX2 C3 (review 644g2 P2-3): the validators run with cwd = the module's tree; a RELATIVE candidate path would then
    # name a same-named file in THAT tree while the receipt hashes the candidate's bytes — the path is resolved to the candidate's
    # absolute location first and must exist there
    path = str((Path(root) / rel).resolve())
    if not Path(path).is_file():
        return False, f"candidate missing: {path}"
    if kind == "tracks":
        r = subprocess.run(["node", str(Path(tree) / "web/tools/test-ballreturn.mjs"), "--track", path],
                           capture_output=True, text=True, cwd=tree)
        line = (r.stdout.strip().splitlines() or [""])[0]
        return r.returncode == 0 and line.startswith("OK "), line or portable(r.stderr.strip(), root, tree)[-300:]
    mod = "assembly" if kind == "assemblies" else "hardware"
    fn = "validateAssembly" if kind == "assemblies" else "validateHardware"
    js = (f"import fs from 'node:fs'; const m = await import('./web/scene/ballreturn/{mod}.js');"
          f"const d = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));"
          f"try {{ const r = m.{fn}(d, {{}}); console.log('OK {fn}', r.meshes ? r.meshes.length + ' meshes' : (r.meshNames ? r.meshNames.length + ' own / ' + r.environmentMeshNames.length + ' environment' : '')); }}"
          f"catch (e) {{ console.log('REFUSED ' + e.message); process.exit(3); }}")
    r = subprocess.run(["node", "--input-type=module", "-e", js, path], capture_output=True, text=True, cwd=tree)
    line = (r.stdout.strip().splitlines() or [""])[0]
    return r.returncode == 0 and line.startswith("OK "), line or portable(r.stderr.strip(), root, tree)[-300:]


def portable(text, root, tree):
    """text with the machine paths replaced, longest first and only as whole paths (never the head of a longer name): the
    tree under check, the validator tree, the home directory."""
    for path, token in sorted(((Path(root).resolve(), "<worktree>"), (Path(tree).resolve(), "<ballreturn-tree>"),
                               (Path.home().resolve(), "~")), key=lambda pair: -len(str(pair[0]))):
        text = re.sub(re.escape(str(path)) + r"(?![\w.-])", token, text)
    return text


def write(root, tree):
    tree = Path(tree).resolve()
    head = subprocess.run(["git", "-C", str(tree), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    rows, ok_all = [], True
    for rel in delegated_files(root):
        ok, line = run_validator(tree, root, rel)
        ok_all &= ok
        rows.append(dict(path=rel, sha256=sha(Path(root) / rel), validator=KINDS.get(kind_of(rel), "none"), ok=ok, ok_line=portable(line, root, tree)))
        print(("OK  " if ok else "FAIL"), rel, "—", line[:160])
    receipt = dict(schema="d621-gully-receipt/1", tool="tools/render/d621/plan/gully_receipt_621.py --write",
                   validator_tree=portable(str(tree), root, tree), validator_tree_head=head, node=subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip(),
                   rule="every delegated JSON under web/scene/ballreturn/ is listed with the sha256 of the exact bytes the module's validator accepted; --check refuses a missing row or a byte that moved; the census inherits that refusal",
                   files=rows)
    (Path(root) / RECEIPT).write_text(json.dumps(receipt, indent=2) + "\n")
    print("wrote", RECEIPT, "rows", len(rows), "all ok" if ok_all else "WITH FAILURES")
    return 0 if ok_all else 3


def check(root, verbose=True):
    """Return (ok, problems, rows). Pure: reads the tree only."""
    root = Path(root)
    problems, rows = [], []
    rp = root / RECEIPT
    if not rp.is_file():
        return False, ["receipt missing: " + RECEIPT], rows
    try:
        receipt = json.loads(rp.read_text())
        by = {r["path"]: r for r in receipt["files"]}
    except (ValueError, KeyError, TypeError) as e:
        return False, [f"receipt malformed: {e}"], rows
    try:
        renames = table_renames(root)
    except (ImportError, OSError, ValueError) as e:
        if verbose: print("PROBLEM id map unreadable:", e)
        return False, [f"id map unreadable: {e}"], rows
    # follow the git mv (#789): a row whose path is not a file in the tree and whose file stem is a table rename of the id map
    # names <dir>/<neutral>.json; the follow is accepted only when that file exists AND carries the row's sha256 (byte-bound)
    followed, refused = {}, {}
    for rel, row in list(by.items()):
        stem = Path(rel).stem
        if (root / rel).is_file() or stem not in renames: continue
        new = str(Path(rel).with_name(renames[stem] + ".json"))
        if not (root / new).is_file(): refused[rel] = f"the renamed path {new} is not in the tree"; continue
        if sha(root / new) != row.get("sha256"): refused[rel] = f"the renamed path {new} has other bytes than the row"; continue
        if new in by: problems.append(f"{new}: two receipt rows name one file ({rel} follows the rename to it)"); continue
        by[new] = dict(row, path=new, moved_from=rel); followed[rel] = new
    for rel in delegated_files(root):
        row = by.get(rel)
        digest = sha(root / rel)
        if row is None:
            problems.append(f"{rel}: no receipt row"); rows.append(dict(path=rel, status="UNRECEIPTED", sha256=digest)); continue
        if row.get("sha256") != digest:
            problems.append(f"{rel}: bytes moved since the receipt ({digest[:12]} != {str(row.get('sha256'))[:12]})"); rows.append(dict(path=rel, status="STALE", sha256=digest)); continue
        if row.get("ok") is not True:
            problems.append(f"{rel}: the receipt records a refusal: {row.get('ok_line')}"); rows.append(dict(path=rel, status="REFUSED", sha256=digest)); continue
        try:
            json.loads((root / rel).read_text())
        except ValueError as e:
            problems.append(f"{rel}: not JSON ({e})"); rows.append(dict(path=rel, status="MALFORMED", sha256=digest)); continue
        rows.append(dict(path=rel, status="RECEIPTED", sha256=digest, validator=row.get("validator"), ok_line=row.get("ok_line"), **({"moved_from": row["moved_from"]} if "moved_from" in row else {})))
    for rel in by:
        if not (root / rel).is_file() and rel not in followed:
            problems.append(f"{rel}: receipt row for a file that is not in the tree" + (f" ({refused[rel]})" if rel in refused else ""))
    if verbose:
        for old, new in followed.items(): print("FOLLOWED".ljust(11), old, "->", new, "(same sha256)")
        for r in rows: print(r["status"].ljust(11), r["path"], r["sha256"][:12])
        for p in problems: print("PROBLEM", p)
    return not problems, problems, rows


def red_arm(root):
    root = Path(root)
    with tempfile.TemporaryDirectory(prefix="d621-gully-receipt-arm-") as td:
        scratch = Path(td) / "tree"
        shutil.copytree(root, scratch, ignore=shutil.ignore_patterns(".git", "node_modules", "target"))
        ok0, prob0, _ = check(scratch, verbose=False)
        if not (scratch / RECEIPT).is_file():
            print("[gully-receipt red arm] NOT ARMED — no receipt in the tree (run --write first):", prob0[:1]); return 3
        track = next((f for f in delegated_files(scratch) if f.startswith(PREFIX + "tracks/")), None)
        if track is None:
            print("red arm: no track file in the tree"); return 3
        original = (scratch / track).read_bytes()
        (scratch / track).write_bytes(b'{"schema": "openbilliards/ball-return-track/1", "runways": [')  # syntactically invalid
        okA, probA, _ = check(scratch, verbose=False)
        (scratch / track).write_bytes(original)
        receipt = json.loads((scratch / RECEIPT).read_text())
        receipt["files"] = [r for r in receipt["files"] if r["path"] != track]
        (scratch / RECEIPT).write_text(json.dumps(receipt))
        okB, probB, _ = check(scratch, verbose=False)
        print(f"[gully-receipt red arm] untouched copy: {'PASS' if ok0 else 'FAIL'}; malformed track: {'FAIL (correct)' if not okA else 'PASS <<< OPEN'} — {probA[:1]}; receipt row removed: {'FAIL (correct)' if not okB else 'PASS <<< OPEN'} — {probB[:1]}")
        # (d) GULLY-FIX2 C4: a NESTED JSON under the prefix with no receipt row must FAIL (recursive enumeration)
        (scratch / RECEIPT).write_text(json.dumps(json.loads((root / RECEIPT).read_text())))
        nested = scratch / PREFIX / "tracks" / "nested"; nested.mkdir(parents=True, exist_ok=True)
        (nested / "new.json").write_text('{"schema": "openbilliards/ball-return-track/1"}')
        okD, probD, _ = check(scratch, verbose=False)
        print(f"[gully-receipt red arm] unreceipted nested tracks/nested/new.json: {'FAIL (correct)' if not okD else 'PASS <<< OPEN'} — {probD[:1]}")
        armed = ok0 and not okA and not okB and not okD
        # (e) GULLY-FIX2 C3: a DECOY validator tree holding a same-named VALID file must not yield a receipt for a malformed candidate
        tree = os.environ.get("OB_BALLRETURN_TREE")
        if tree and (Path(tree) / "web/scene/ballreturn/schema.js").is_file():
            decoy = Path(td) / "decoy"; (decoy / "web/scene/ballreturn/tracks").mkdir(parents=True)
            (decoy / "web/tools").mkdir(parents=True)
            for rel in ("web/tools/test-ballreturn.mjs", "web/scene/ballreturn/assembly.js", "web/scene/ballreturn/hardware.js", "web/scene/ballreturn/schema.js"):
                os.symlink(str(Path(tree) / rel), str(decoy / rel))  # node resolves a symlinked module by its real path: the module runs from the real tree
            # the decoy holds a VALID file at the candidate's relative path; the candidate itself (scratch) is malformed
            shutil.copy2(root / track, decoy / track)
            cand = Path(td) / "cand"; shutil.copytree(scratch, cand, ignore=shutil.ignore_patterns(".git"))
            (cand / track).write_bytes(b'{"schema": "openbilliards/ball-return-track/1", "runways": [')
            cwd0 = os.getcwd()
            try:
                os.chdir(cand); rcE = write(".", decoy)   # a RELATIVE root, exactly the shape the finding used
            finally:
                os.chdir(cwd0)
            okE, probE, _ = check(cand, verbose=False)
            row = next((r for r in json.loads((cand / RECEIPT).read_text())["files"] if r["path"] == track), None)
            decoy_ok = rcE != 0 and not okE and row is not None and row.get("ok") is False
            print(f"[gully-receipt red arm] decoy tree with a same-named VALID file, malformed candidate, relative --root: write rc {rcE}, receipt row ok={row and row.get('ok')}, --check {'FAIL (correct)' if not okE else 'PASS <<< OPEN'}")
            armed = armed and decoy_ok
        else:
            print("[gully-receipt red arm] decoy-tree arm SKIPPED (OB_BALLRETURN_TREE not set) — the arm is UNJUDGED, not passed")
            armed = False
        print("[gully-receipt red arm]", "ARMED" if armed else "NOT ARMED")
        return 0 if armed else 3


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--write", action="store_true"); g.add_argument("--check", action="store_true"); g.add_argument("--red-arm", action="store_true")
    ap.add_argument("--root", default=str(ROOT), help="the tree to read (default: this file's repo root)")
    ap.add_argument("--tree", default=os.environ.get("OB_BALLRETURN_TREE"), help="the ball-return module's tree (validators run there, read-only); --write only")
    a = ap.parse_args(argv)
    if a.write:
        if not a.tree or not (Path(a.tree) / "web/scene/ballreturn/schema.js").is_file():
            ap.error("--write needs --tree / OB_BALLRETURN_TREE pointing at a tree that carries web/scene/ballreturn/schema.js")
        return write(a.root, a.tree)
    if a.red_arm:
        return red_arm(a.root)
    ok, problems, _ = check(a.root)
    print("GULLY-RECEIPT", "OK" if ok else f"FAIL ({len(problems)} problem(s))")
    return 0 if ok else 3


if __name__ == "__main__":
    sys.exit(main())
