#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Archive-executed O22 diff/tag census; git supplies immutable history only.

Code uses the standing literal classifier and ten-line context rule unchanged.
JSON checks every added/changed numeric leaf, inheriting its nearest explicit
provenance tag. Measurement records also fence TurboSmooth control-cage reads
from the MODEL tier, including unchanged values. No untagged-number allowance
is admitted. The main base is derived from the audited branch. Its changes are
merged into the declared pre-O22 scope origin, so earlier Diamond work is not
misreported as new O22 work; no candidate bytes enter that comparison tree.
"""
import sys
sys.dont_write_bytecode = True
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess

sys.path.insert(0, str(Path(__file__).resolve().parent))
import literal_census_621 as literal

ROOT = Path(__file__).resolve().parents[4]
TAGS = {"MFR", "MODEL", "DERIVED", "EST", "CLEARANCE", "TESSELLATION"}
CASCADE = {"tools/render/gh488d/derive_size_variant_621.py", "tools/render/fullview-overlay-488d.mjs",
           "tools/render/gh488d/gen_drawing_488d.py",  # DERIVED: C7 retires the drawing's CP-15 literals in favour of RC-01.
           "tools/render/asmodeled-drawings-488d.mjs", "tools/render/cammatch/solve-488d.py", "tools/render/cammatch-488d.mjs"}
# DERIVED: explicit FIX1 item 3 fence extension, only the entry-profile callers.
FIX1_CHECKERS = {"tools/render/check-cushion-profile.mjs", "tools/render/check-cue-clearance.mjs"}
# DERIVED: the FIX3 ruling admits only these two additional profile callers.
FIX2_PROFILE_CALLERS = {"tools/render/c14-488d.mjs", "tools/render/section-compare.mjs"}
FIX2_PROFILE_CALLER_REASON = "4th-argument caller audit, review r1 P2-3"
# DERIVED: FIX12 explicitly separates shared HTTP readiness from tree identity.
FIX12_READINESS_TOOLS = {"web/tools/cdp.mjs"}
FIX12_READINESS_REASON = "FIX12 mandatory HTTP readiness, including identity opt-outs"
# DERIVED: C2 B4 explicitly requests the existing cdp ownership disclosure.
C2_READINESS_DOCS = {"the ownership ledger (internal)"}
# DERIVED: C4B serves exactly one generated canonical nose-radius leaf.
C4B_NOSE_LEAF = {"web/scene/diamondproam_nose.js"}
# DERIVED: C7's owner order requires a generated, receipt-bound corner PLAN leaf.
C7_CORNER_LEAF = {"web/scene/diamondproam_corner.js"}
# DERIVED: C6 addendum fixes query-bearing imports in the shared BOOT graph.
C6_SW_GRAPH = {"web/tools/gen-sw-precache.mjs", "web/tools/test-sw-precache-graph.mjs"}
# DERIVED: ADOPTION (2026-09-11) — the maintainer's §A2 names the shared identity instrument (NOTE-FENCE-NORMALS widening +
# NOTE-CENSUS-SETTLE) and §A4 the lane's append-only record; both are disclosed as admitted, not silently fenced in.
ADOPTION_ADMITTED = {"tools/render/meshident-488d.mjs": "ADOPTION §A2: identity capture /3 (attribute-bytes hash + settle wait) — the card's identity instrument",
                     "SPIKE-REPORT-D621.md": "ADOPTION §A4: the lane's append-only record (errata + adoption record)",
                     # DERIVED: the landing battery's one merge-result catch — main's e2e-i18n frpunct lint (GH-668 B-SH10, folded by
                     # C5) reds the two French descriptions the lane added on 2026-09-02; typography only (U+00A0 before the colon).
                     "web/app/locales/fr.json": "ADOPTION §A7: frpunct fix of the lane's two equipment.desc.diamond_proam_8ft/_7ft strings (0c5990cb)"}
# DERIVED: GULLY (maintainer ROUND 2 order 2026-09-18, maintainer ruling 2026-09-17 on #650): the Diamond gully export
# and its assembly declaration live under the ball-return module's schema, whose OWN provenance law (V1: MFR/MODEL/DERIVED/PHOTO
# per dimensioned field; DESIGN only at arrival.restitution) is enforced by `web/tools/test-ballreturn.mjs --track` (V0–V12) and
# `assembly.js validateAssembly` (V18). This census DELEGATES their numeric leaves to that validator (recorded, never silently
# skipped): a JSON under this prefix is listed as `delegated` with the validator named, not walked with the O22 tag vocabulary.
GULLY_DELEGATED_PREFIX = "web/scene/ballreturn/"
GULLY_DELEGATED_REASON = "GULLY g1: ball-return-track/1 + ball-return-assembly/1.0 files — provenance law = the module's V1/V18 (test-ballreturn.mjs --track, assembly.js), run read-only from the ball-return lane's tree; OK 9 runways / 6 pockets / capacity 15 and ASSEMBLY OK 56 meshes on 2026-09-18"


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, check=True).stdout


def comparison_base(repo, commit, scope_origin, main_ref):
    """Derive main and compose it with the declared, ancestral O22 scope origin.

    On conflicts the pre-O22 side wins: it contains no O22 candidate edits.
    Non-conflicting main edits remain. Outside-fence changes are still judged
    against this complete tree, never removed by a path or digest allowlist.
    """
    main = git(repo, "rev-parse", "--verify", main_ref + "^{commit}").decode().strip()
    bases = git(repo, "merge-base", "--all", commit, main).decode().splitlines()
    if len(bases) != 1:  # DERIVED: one unambiguous main merge base is required.
        raise ValueError("census base: expected one merge base with " + main_ref)
    origin = git(repo, "rev-parse", "--verify", scope_origin + "^{commit}").decode().strip()
    introductions = git(repo, "log", "--reverse", "--diff-filter=A", "--format=%H %P", commit,
                        "--", "tools/render/d621/law/cushion_fence_621.json").decode().splitlines()
    # DERIVED: the fence's first parent defines the pre-O22 scope; a caller
    # cannot move the declared origin onto the candidate and erase its edits.
    if len(introductions) != 1 or len(introductions[0].split()) < 2:
        raise ValueError("census base: cannot derive the fence introduction's parent")
    if origin != introductions[0].split()[1]:
        raise ValueError("census base: declared scope origin is not the fence introduction's parent")
    git(repo, "merge-base", "--is-ancestor", origin, commit)
    tree = git(repo, "merge-tree", "--write-tree", "-Xours", origin, bases[0]).decode().strip()
    # DERIVED: the merger must yield exactly one valid tree object.
    tree = git(repo, "rev-parse", "--verify", tree + "^{tree}").decode().strip()
    return dict(main_ref=main_ref, main_ref_commit=main, merge_base=bases[0],
                scope_origin_commit=origin, comparison_tree=tree,
                method="git merge-tree --write-tree -Xours <scope origin> <derived main merge base>")


D3_ADMISSIONS = "tools/render/d621/law/d3_merge_admissions_621.json"


def d3_merge_admissions(repo, commit, main_commit, outside, pin):
    """D-3 (the ceremony merge of main into #644): a path outside the fence is admitted ONLY when its diff against the
    main-ref commit (canonical: --full-index, no renames) hashes to the studied resolution form pinned for it
    (CEREMONY-CONFLICT-NOTES a9f9729a) — never by path alone. Returns (still_outside, admitted, rejected); a rejected path stays outside and fails the census."""
    admitted, rejected, still = [], [], []
    for name in outside:
        spec = (pin or {}).get("paths", {}).get(name)
        if not spec:
            still.append(name)
            continue
        # canonical diff text: --full-index (git's auto-abbreviated `index` line depends on the repo's object count — the lane repo
        # abbreviates to 8 hex, a fresh clone to 9 — and made the same bytes hash differently), no renames, no external diff
        got = hashlib.sha256(git(repo, "diff", "--no-color", "--no-ext-diff", "--no-renames", "--full-index", main_commit, commit, "--", name)).hexdigest()
        if got == spec["expected_diff_sha256"]:
            admitted.append(dict(path=name, reason=spec["reason"], diff_sha256=got))
        else:
            rejected.append(dict(path=name, expected_diff_sha256=spec["expected_diff_sha256"], got_diff_sha256=got))
            still.append(name)
    return still, admitted, rejected


def allowed(path):
    return (path.startswith("tools/render/d621/") or path in CASCADE or path in FIX1_CHECKERS
            or path in FIX2_PROFILE_CALLERS or path in FIX12_READINESS_TOOLS
            or path in C2_READINESS_DOCS or path in C4B_NOSE_LEAF or path in C7_CORNER_LEAF or path in C6_SW_GRAPH
            or path in {"web/scene/table.js", "web/sw.js", "REPORT-D621-O22.md"} or path in ADOPTION_ADMITTED
            or path.startswith(GULLY_DELEGATED_PREFIX)
            or path in {f"docs/geometry/diamond-proam-{size}-table-definition.json" for size in ("9ft", "8ft", "7ft")})


def code_census(diff):
    recent, removed, checked, offenders, line_number = [], set(), [], [], 0
    for line in diff.splitlines():
        header = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", line)
        if header:
            line_number, recent, removed = int(header[1]) - 1, [], set()
            continue
        if line.startswith(("+++", "---")):
            continue
        if line.startswith("-"):
            removed.update(literal.NUM.findall(line[1:].split("//")[0]))
        if not line.startswith("+"):
            continue
        line_number += 1
        source = line[1:]
        recent = (recent + [source])[-10:]  # DERIVED: unchanged standing census context window.
        if literal.SKIP_LINE.match(source) or source.lstrip().startswith("#"):
            continue
        code = re.sub(r"Math\.PI\s*[*/]\s*\d+(?:\.\d+)?", "Math.PI", source.split("//")[0])
        numbers = [number for number in literal.NUM.findall(code)
                   if abs(float(number)) > 1e-6 and number not in removed]  # CLEARANCE: unchanged standing epsilon exclusion.
        if not numbers:
            continue
        row = dict(line=line_number, numbers=numbers)
        checked.append(row)
        if not literal.TAG.search("\n".join(recent)):
            offenders.append(dict(row, text=source.strip()))
    return dict(checked=checked, untagged=offenders)


def numeric_changes(after, before=None, path=(), inherited=None):
    if isinstance(after, dict):
        provenance = after.get("provenance")
        own = after.get("tag") or (provenance.get("tag") if isinstance(provenance, dict) else None) or inherited
        return [row for key, value in after.items() for row in numeric_changes(
            value, before.get(key) if isinstance(before, dict) else None, path + (key,), own)]
    if isinstance(after, list):
        return [row for ordinal, value in enumerate(after) for row in numeric_changes(
            value, before[ordinal] if isinstance(before, list) and ordinal < len(before) else None,
            path + (ordinal,), inherited)]
    if isinstance(after, (int, float)) and not isinstance(after, bool) and after != before:
        return [dict(path=list(path), value=after, tag=inherited,
                     tagged=isinstance(inherited, str) and inherited in TAGS)]
    return []


def provenance_refusals(value, path=()):
    """Walk containers only; a scalar provenance cannot assert a numeric tier."""
    if isinstance(value, dict):
        rows = []
        provenance = value.get("provenance")
        if provenance is not None and not isinstance(provenance, dict):
            rows.append(dict(path=list(path + ("provenance",)),
                             reason="provenance must be an object carrying an explicit tag",
                             value_type=type(provenance).__name__))
        return rows + [row for key, child in value.items()
                       for row in provenance_refusals(child, path + (key,))]
    if isinstance(value, list):
        return [row for ordinal, child in enumerate(value)
                for row in provenance_refusals(child, path + (ordinal,))]
    return []


def cage_provenance_census(document):
    """Derive cage leaves from measurement records, never from feature IDs.

    A record carries the original measurement mode, unapplied modifier names,
    and source digest/path independently of the claimed tier. Both source.tier
    and provenance.tag are checked: one cannot conceal a stale MODEL claim in
    the other. Nested reads inherit the same surface until explicitly recited.
    """
    checked, offenders = [], []

    def walk(value, path=(), measurement=None, owner=None, unmeasured_round=False):
        if isinstance(value, dict):
            if "measurement_provenance" in value:
                unmeasured_round = False
            measurement = value.get("measurement_provenance", measurement)
            owner = value.get("id", owner)
            # C7's ruling permits straight PLAN dimensions from cage faces.
            # It does not promote a radius to MODEL when the same measurement
            # explicitly says the smooth radius was not measured. This rule
            # follows the measurement and dimension, not a feature-ID list.
            if (isinstance(measurement, dict)
                    and measurement.get("smooth_surface_radius_measured") is False
                    and "TurboSmooth" in measurement.get("unapplied_modifiers", [])
                    and any(key in value for key in ("radius_mm", "fillet_radius_mm"))):
                unmeasured_round = True
        cage = (isinstance(measurement, dict)
                and measurement.get("mode") == "TESSELLATION CAGE READ"
                and "TurboSmooth" in measurement.get("unapplied_modifiers", []))
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "measurement_provenance":
                    continue
                if (cage or unmeasured_round) and key in {"tag", "tier"} and child == "MODEL":
                    offenders.append(dict(path=list(path + (key,)), id=owner,
                                          reason="MODEL tier on an unmeasured smooth radius" if unmeasured_round else "MODEL tier on a TurboSmooth control-cage read",
                                          measurement_provenance=measurement))
                walk(child, path + (key,), measurement, owner, unmeasured_round)
        elif isinstance(value, list):
            for ordinal, child in enumerate(value):
                walk(child, path + (ordinal,), measurement, owner, unmeasured_round)
        elif (cage or unmeasured_round) and isinstance(value, (int, float)) and not isinstance(value, bool):
            checked.append(dict(path=list(path), id=owner,
                                measurement_path=measurement.get("measurement_path")))
        elif (cage and isinstance(value, str) and "value_provenance" in path
              and value.startswith("MODEL:")):
            offenders.append(dict(path=list(path), id=owner,
                                  reason="MODEL value provenance on a TurboSmooth control-cage read",
                                  measurement_provenance=measurement))

    walk(document)
    return dict(checked=checked, offenders=offenders,
                verdict="FAIL" if offenders else "PASS")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--main-ref", default="refs/remotes/origin/main",
                        help="main ref used to derive the audited branch's merge base")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    if (ROOT / ".git").exists():
        parser.error("run this verifier from a git archive, not the checkout")
    commit = git(args.repo, "rev-parse", args.commit + "^{commit}").decode().strip()
    pin = json.loads((ROOT / "tools/render/d621/law/cushion_fence_621.json").read_text())
    basis = comparison_base(args.repo, commit, pin["scope_origin_commit"], args.main_ref)
    base = basis["comparison_tree"]
    names = git(args.repo, "diff", "--name-only", base, commit).decode().splitlines()
    outside = [name for name in names if not allowed(name)]
    d3_pin_path = ROOT / D3_ADMISSIONS
    d3_pin = json.loads(d3_pin_path.read_text()) if d3_pin_path.exists() else None
    outside, d3_admitted, d3_rejected = d3_merge_admissions(args.repo, commit, basis["main_ref_commit"], outside, d3_pin)
    admitted = [dict(path=name, reason=FIX2_PROFILE_CALLER_REASON)
                for name in names if name in FIX2_PROFILE_CALLERS]
    readiness_tools = [dict(path=name, reason=FIX12_READINESS_REASON)
                       for name in names if name in FIX12_READINESS_TOOLS]
    adoption_admitted = [dict(path=name, reason=ADOPTION_ADMITTED[name]) for name in names if name in ADOPTION_ADMITTED]
    gully_delegated = [dict(path=name, reason=GULLY_DELEGATED_REASON) for name in names if name.startswith(GULLY_DELEGATED_PREFIX)]
    # GULLY-FIX1 C2: the receipt check runs whenever a delegated file is in the tree (not only when it changed) — the module's
    # validators are not in this tree, so the byte-bound receipt is what the census verifies; its red arm is
    # `gully_receipt_621.py --red-arm` (a malformed track JSON and a deleted receipt row both FAIL the check)
    gully_receipt_ok, gully_receipt_problems, gully_receipt_rows = (True, [], [])
    if gully_delegated or any(p.startswith(GULLY_DELEGATED_PREFIX) for p in git(args.repo, "ls-tree", "-r", "--name-only", commit).decode().splitlines()):
        sys.path.insert(0, str(ROOT / "tools/render/d621/plan"))
        import gully_receipt_621
        gully_receipt_ok, gully_receipt_problems, gully_receipt_rows = gully_receipt_621.check(ROOT, verbose=False)
        # GULLY-FIX2 C4 (review 644g2 P2-4): every delegated file of THIS diff must carry a RECEIPTED row — the checker enumerates
        # recursively now, and a delegated name it did not receipt is a census problem in its own right (never a silent UNRECEIPTED)
        receipted = {r["path"] for r in gully_receipt_rows if r.get("status") == "RECEIPTED"}
        for d in gully_delegated:
            if d["path"] not in receipted:
                gully_receipt_ok = False
                gully_receipt_problems.append(f"{d['path']}: delegated by prefix but not RECEIPTED")
    # D-3: admitted paths whose pin declares numeric_census delegate their numeric leaves to the named gate (only if ADMITTED, i.e. the diff matched)
    d3_numeric_delegated = {a["path"]: d3_pin["paths"][a["path"]]["numeric_census"] for a in d3_admitted if d3_pin and d3_pin["paths"].get(a["path"], {}).get("numeric_census")}
    records, tags = {}, Counter()
    for name in names:
        archived = ROOT / name
        committed = git(args.repo, "show", commit + ":" + name)
        if not archived.is_file() or archived.read_bytes() != committed:
            raise ValueError("archive/commit source mismatch: " + name)
        if name.endswith((".py", ".js", ".mjs")) and name != "web/sw.js":
            diff = git(args.repo, "diff", "-U0", base, commit, "--", name).decode()
            records[name] = dict(kind="code", **code_census(diff))
        elif name in d3_numeric_delegated:
            # D-3: an O15 fixture (GH-789) admitted by its pinned diff — its numeric leaves are cited line numbers and census
            # counts validated by tools/check-provenance-tags.mjs, not geometry: the numeric census is DELEGATED to that gate
            records[name] = dict(kind="delegated", validator=d3_numeric_delegated[name], checked=[], untagged=[], invalid_provenance=[], cage_provenance={},
                                 admission="D-3 pinned-diff admission (law/d3_merge_admissions_621.json)")
        elif name.endswith(".json") and name.startswith(GULLY_DELEGATED_PREFIX):
            # GULLY-FIX1 C2 (review 644g1 P2-2): a delegation is BOUND to the audited bytes through the receipt written by the
            # module's own validators (tools/render/d621/plan/gully_receipt_621.py --write): the row below carries the receipt's
            # verdict for THIS file's sha256; a missing row, a moved byte or a malformed file is a census problem (see below)
            records[name] = dict(kind="delegated", validator=GULLY_DELEGATED_REASON, checked=[], untagged=[], invalid_provenance=[], cage_provenance={},
                                 receipt=next((r for r in gully_receipt_rows if r["path"] == name), dict(status="UNRECEIPTED")))
        elif name.endswith(".json"):
            old = subprocess.run(["git", "-C", str(args.repo), "show", base + ":" + name], capture_output=True)
            before = json.loads(old.stdout) if old.returncode == 0 else None
            document = json.loads(committed)
            values = numeric_changes(document, before)
            tags.update(row["tag"] or "UNTAGGED" for row in values)
            records[name] = dict(kind="json", checked=values, untagged=[row for row in values if not row["tagged"]],
                                 invalid_provenance=provenance_refusals(document),
                                 cage_provenance=cage_provenance_census(document))
    untagged = sum(len(record["untagged"]) for record in records.values())
    cage_offenders = [dict(file=name, **row) for name, record in records.items()
                      for row in record.get("cage_provenance", {}).get("offenders", [])]
    invalid_provenance = [dict(file=name, **row) for name, record in records.items()
                          for row in record.get("invalid_provenance", [])]
    sys.path.insert(0, str(ROOT / "tools/render/d621/plan"))
    import corner_source_621
    try:
        corner_binding = corner_source_621.check_binding(ROOT)
    except (OSError, ValueError, KeyError, TypeError) as error:
        corner_binding = dict(status="UNBOUND", reason=str(error))
    import cushion_end_source_621
    try:
        end_binding = cushion_end_source_621.check_binding(ROOT)
    except (OSError, ValueError, KeyError, TypeError) as error:
        end_binding = dict(status="UNBOUND", reason=str(error))
    # GULLY-FIX1 (ballreturn B1-1 F6): the C4B nose leaf embeds the definition digests exactly as the corner leaf does — a
    # definition edit that regenerates one and not the other left cushion_gate_621's nose row red while this census read PASS
    import nose_source_621
    try:
        nose_binding = nose_source_621.check_binding(ROOT)
    except (OSError, ValueError, KeyError, TypeError) as error:
        nose_binding = dict(status="UNBOUND", reason=str(error))
    result = dict(tool="round_census_621", base=basis["merge_base"], comparison_base=basis,
                  commit=commit, archive=str(ROOT),
                  outside_fence=outside, admitted_d3_merge=d3_admitted, rejected_d3_merge=d3_rejected, admitted_profile_callers=admitted, admitted_readiness_tools=readiness_tools, admitted_adoption=adoption_admitted, delegated_gully=gully_delegated,
                  numeric_json_tags=dict(tags), records=records,
                  untagged=untagged, bare_model_cage_reads=cage_offenders, invalid_provenance=invalid_provenance,
                  corner_source_binding=corner_binding, cushion_end_source_binding=end_binding,
                  gully_receipt=dict(ok=gully_receipt_ok, problems=gully_receipt_problems, rows=gully_receipt_rows),
                  nose_source_binding=nose_binding,
                  verdict="PASS" if not outside and not untagged and not cage_offenders and not invalid_provenance and gully_receipt_ok
                  and corner_binding["status"] == "BOUND" and end_binding["status"] == "BOUND" and nose_binding["status"] == "BOUND" else "FAIL")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n")  # TESSELLATION: JSON layout.
    for name, record in records.items():
        print(f"{name}: {len(record['checked'])} numeric leaves/lines checked; {len(record['untagged'])} untagged")
        for row in record["untagged"]:
            print("UNTAGGED", row)
    for row in cage_offenders:
        print("BARE MODEL CAGE READ", json.dumps(row))
    for row in invalid_provenance:
        print("INVALID PROVENANCE", json.dumps(row))
    print(json.dumps(dict(verdict=result["verdict"], untagged=untagged, outside_fence=outside,
                         bare_model_cage_reads=len(cage_offenders),
                         invalid_provenance=len(invalid_provenance),
                         admitted_profile_callers=admitted, json_tags=dict(tags))))
    return 0 if result["verdict"] == "PASS" else 3  # DERIVED: standing gate exit convention.


if __name__ == "__main__":
    sys.exit(main())
