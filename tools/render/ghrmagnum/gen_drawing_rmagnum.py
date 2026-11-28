#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Rasson Magnum II 12 ft snooker — GB/T-style drawing set generator (Rasson lane, wave A1).

Single-source pipeline per ADR-0015: the ONLY geometry input is the canonical definition
`docs/geometry/rasson-magnum2-12ft-table-definition.json`; this script re-derives every
drawn curve and dimension from that JSON, asserts the declared identities before any sheet
is emitted, and writes:

  - sheet S1: corner-pocket assembly, plan (CEBP two-arc jaws + fall circle, kernel local
              jaw frame u/v about the nose-line intersection N)
  - sheet S2: middle-pocket assembly, plan (lower/upper jaws mirrored about the pocket
              centre line, fall circle poking past the nose)
  - sheet S3: steel-block rail stack section (SCHEMATIC ordering) + the Northern L-profile
              detail (dimensioned, MFR) + the reference-model face (EST)
  - sheet S4: envelope plan + elevation (official 3838 × 2047 × 850 over the kernel
              3569 × 1778 playfield) + conflict ledger + open items
  - a solved JSON twin (constructed points, check results, source SHA-256)

Kernel discipline (the Magnum II rides CurvedPocketTableSpec::wpbsa_snooker_12ft as a
documented alias; it adds NO kernel geometry):
  * the CEBP construction is RECOMPUTED from the template inch labels stored in the JSON
    and asserted against CODE-LITERAL pins (KERNEL_PINS below — a transcript of the
    table.rs test `curved_pocket_canonical_values_pinned`, tolerances 5e-7 m / 5e-6 rad
    hard-coded here, NOT read from the JSON), and
  * the same inch labels and the wpbsa_snooker_12ft literals are cross-checked against
    the constants parsed LIVE from crates/pool-core/src/table.rs (mod cebp), and the
    pinned commit's table.rs must be byte-identical to HEAD's (git, when available).
  A JSON edit therefore cannot move the pin: the JSON's canonical_values_m must equal the
  code pins, every kernel-collision row must be one the checks consume, and every number
  printed on a sheet is formatted from the JSON or the solved construction (one half-up
  formatter honouring drafting.displayed_decimals; inch labels printed alongside).

  KNOWN LIMIT (honest-disclosure ledger, SPIKE-REPORT-RASSON.md §6.4 item 3): KERNEL_PINS is a
  transcript of the table.rs TEST expectations. The generator parses the CEBP constants, the
  wpbsa_snooker_12ft literals and the pinned commit's table.rs identity, so a change to the
  CONSTRUCTION is caught here — but an edit to the table.rs TEST alone (constants untouched,
  expectations rewritten) is NOT detected by this generator; only `cargo test -p pool-core`
  catches that. The pin is therefore code-literal here AND test-enforced in the kernel.

Run:
  python3 tools/render/ghrmagnum/gen_drawing_rmagnum.py --output-dir /tmp/rmag-sheets
  python3 tools/render/ghrmagnum/gen_drawing_rmagnum.py --output-dir /tmp/rmag-sheets --check
  (an --output-dir inside the repository tree is refused; the KERNEL-SOURCE pinned-commit check needs
   full git history — `git show ad5d422c:crates/pool-core/src/table.rs` must resolve)

Deterministic: byte-identical output for identical input JSON (no clocks; the git/table.rs
reads are assertions only and never reach the output).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import struct
import subprocess
import sys
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from pathlib import Path

GENERATOR_ID = "ghrmagnum-drawing/1.2.0"
IN = 25.4  # mm per inch
DEFAULT_SOURCE = "docs/geometry/rasson-magnum2-12ft-table-definition.json"
TABLE_RS = "crates/pool-core/src/table.rs"

# Code-literal transcript of crates/pool-core/src/table.rs `curved_pocket_canonical_values_pinned`
# (wpbsa_snooker_12ft block) — metres / degrees. The JSON's kernel_pinning.canonical_values_m
# must EQUAL these; the construction recomputed from the JSON's inch labels must MATCH these.
KERNEL_PINS = {
    "corner_c1": (0.0902970, -0.0762000), "corner_r1": 0.0762000,
    "corner_c2": (0.1085413, -0.1096478), "corner_r2": 0.1143000,
    "corner_arc1_start_deg": 90.0, "corner_arc1_sweep_deg": 28.6105,
    "corner_arc2_start_deg": 118.6105, "corner_arc2_end_deg": 128.7297,
    "middle_c1": (-0.1103376, -0.0793750), "middle_r1": 0.0793750,
    "middle_c2": (-0.0949450, -0.0581889), "middle_r2": 0.0531876,
    "middle_arc1_start_deg": 90.0, "middle_arc1_sweep_deg": 36.0, "middle_arc2_end_local_deg": 30.5070,
    "corner_fall_off": 0.0476250, "corner_fall_r": 0.0889000,
    "middle_fall_depth": 0.0515874, "middle_fall_r": 0.0531876, "middle_fall_poke": 0.0016,
}
TOL_M = 5e-7      # table.rs test: const P: f64 = 5e-7
TOL_RAD = 5e-6    # table.rs test: 5e-6 on span angles
KERNEL_RUNTIME = {"length_m": 3.569, "width_m": 1.778, "nose_height_frac": 0.70, "corner_scale": 1.0, "middle_scale": 1.0}
# JSON row → (table.rs constant name, expression in inches) for the live source cross-check.
CEBP_INCH = {
    "CP-01": ("CORNER_TANGENCY", "(5.43 - 1.875)"), "CP-02": ("CORNER_R1", "3.00"), "CP-03": ("CORNER_R2", "4.50"),
    "CP-06": ("CORNER_FALL_R", "3.50"), "CP-07": ("CORNER_FALL_OFF", "1.875"), "CP-08": ("CORNER_FALL_OPENING", "3.313"),
    "MP-01": ("MIDDLE_TANGENCY", "4.344"), "MP-02": ("MIDDLE_R1", "3.125"), "MP-03": ("MIDDLE_R2", "2.094"),
    "MP-06": ("MIDDLE_FALL_R", "2.094"), "MP-07": ("MIDDLE_FALL_DEPTH", "(1.875 + 0.156)"), "MP-08": ("MIDDLE_FALL_OPENING", "3.906"),
}
# Rows the kernel checks consume — must equal the set of kernel-collision rows exactly.
KERNEL_ROWS = {"PF-01", "PF-02", "CU-02", "CU-03", "CU-09",
               "CP-01", "CP-02", "CP-03", "CP-04", "CP-05", "CP-06", "CP-07", "CP-09", "CP-10", "CP-11", "CP-12",
               "MP-01", "MP-02", "MP-03", "MP-04", "MP-05", "MP-06", "MP-07", "MP-09", "MP-10", "MP-11"}
IDENTITY_FAMILIES = ("KERNEL-BITS", "KERNEL-SOURCE", "KERNEL-PINS", "CU-02", "CONSTRUCT-CORNER", "CONSTRUCT-MIDDLE",
                     "DERIVED", "CP-07", "TANGENCY", "IMPERIAL-EXACT", "LABEL-EXACT", "ENVELOPE", "ORDER", "COVERAGE",
                     "PROVENANCE-TAG")


def check_family(name: str) -> str:
    """The identity family a recorded check name belongs to: its first token, with the
    `KERNEL-BITS-<field>` spelling folded onto KERNEL-BITS."""
    head = name.split(" ", 1)[0]
    return "KERNEL-BITS" if head.startswith("KERNEL-BITS") else head

# ---------------------------------------------------------------- input


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def load_source(path: Path) -> tuple[dict, str, bytes]:
    raw = path.read_bytes()
    doc = json.loads(raw.decode("utf-8"))
    return doc, hashlib.sha256(raw).hexdigest(), raw


def feature_map(doc: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for feat in doc["features"]:
        if feat["id"] in out:
            raise AssertionError(f"identity check FAILED: STRUCTURE duplicate feature id — {feat['id']} appears twice")
        keys = [k for k in ("value_mm", "value_deg", "value") if k in feat]
        if len(keys) != 1:
            raise AssertionError(f"identity check FAILED: STRUCTURE {feat['id']} value key — exactly one of "
                                 f"value_mm/value_deg/value, has {keys}")
        out[feat["id"]] = feat
    return out


def val(features: dict[str, dict], fid: str):
    feat = features[fid]
    for key in ("value_mm", "value_deg", "value"):
        if key in feat:
            return feat[key]
    raise KeyError(f"feature {fid} carries no value")


def f64_bits(value: float) -> str:
    return "0x" + struct.pack(">d", value).hex()


# ---------------------------------------------------------------- geometry


def dist(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def circle_intersections(c1, r1, c2, r2):
    """Both intersections of two circles (identical construction to table.rs)."""
    dx, dy = c2[0] - c1[0], c2[1] - c1[1]
    d = math.hypot(dx, dy)
    a = (d * d + r1 * r1 - r2 * r2) / (2.0 * d)
    h = math.sqrt(max(r1 * r1 - a * a, 0.0))
    ux, uy = dx / d, dy / d
    fx, fy = c1[0] + a * ux, c1[1] + a * uy
    return [(fx - h * uy, fy + h * ux), (fx + h * uy, fy - h * ux)]


def corner_construction(f: dict[str, dict]) -> dict:
    """CEBP corner jaw in the kernel local frame (metres): mirrors table.rs corner_canonical."""
    ut = val(f, "CP-01") / 1000.0
    r1 = val(f, "CP-02") / 1000.0
    r2 = val(f, "CP-03") / 1000.0
    rf = val(f, "CP-06") / 1000.0
    cw = val(f, "CP-07") / 1000.0
    off = f["CP-04"]["construction_offsets_in"]
    c1 = (ut, -r1)
    thj = math.pi / 2.0 + math.atan2(off["rise"], off["run"])
    cj, sj = math.cos(thj), math.sin(thj)
    c2 = (c1[0] - (r2 - r1) * cj, c1[1] - (r2 - r1) * sj)
    fall = (-cw, -cw)
    cands = circle_intersections(c2, r2, fall, rf)
    x = cands[0] if cands[0][0] + cands[0][1] >= cands[1][0] + cands[1][1] else cands[1]
    th_end = math.atan2(x[1] - c2[1], x[0] - c2[0])
    return {"ut": ut, "r1": r1, "r2": r2, "rf": rf, "cw": cw, "c1": c1, "c2": c2,
            "thj": thj, "th_end": th_end, "end": x, "fall": fall}


def middle_construction(f: dict[str, dict]) -> dict:
    """CEBP middle (lower) jaw in the kernel local frame: mirrors table.rs middle_canonical."""
    ut = val(f, "MP-01") / 1000.0
    r1 = val(f, "MP-02") / 1000.0
    r2 = val(f, "MP-03") / 1000.0
    rf = val(f, "MP-06") / 1000.0
    fd = val(f, "MP-07") / 1000.0
    c1 = (-ut, -r1)
    thj = math.radians(val(f, "MP-04"))
    cj, sj = math.cos(thj), math.sin(thj)
    c2 = (c1[0] - (r2 - r1) * cj, c1[1] - (r2 - r1) * sj)
    fall = (0.0, -fd)
    cands = circle_intersections(c2, r2, fall, rf)
    x = cands[0] if cands[0][1] >= cands[1][1] else cands[1]
    th_end = math.atan2(x[1] - c2[1], x[0] - c2[0])
    return {"ut": ut, "r1": r1, "r2": r2, "rf": rf, "fd": fd, "c1": c1, "c2": c2,
            "thj": thj, "th_end": th_end, "end": x, "fall": fall}


def exact_binary_inch(value_mm: float, max_den: int = 64) -> bool:
    """True when value_mm is an exact BINARY fraction of an inch (denominator a power of two <= max_den).
    review review round 4: `limit_denominator(max_den)` already guarantees denominator <= max_den, so the
    old predicate accepted any small-denominator fraction — 25.4/3 mm labelled '1/3 in' passed IMPERIAL-EXACT."""
    fr = Fraction(value_mm / IN).limit_denominator(max_den)
    den = fr.denominator
    return abs(float(fr) * IN - value_mm) < 1e-9 and den <= max_den and (den & (den - 1)) == 0


def inch_label(value_mm: float) -> str:
    """'7/8 in' for binary fractions, else the decimal label to 3 dp."""
    fr = Fraction(value_mm / IN).limit_denominator(64)
    if abs(float(fr) * IN - value_mm) < 1e-9:
        whole, rem = divmod(fr.numerator, fr.denominator)
        if rem == 0:
            return f"{whole} in"
        return (f"{whole} " if whole else "") + f"{rem}/{fr.denominator} in"
    return f"{value_mm / IN:.3f} in"


_LABEL_IN = re.compile(r"(?:(?P<whole>\d+)\s+)?(?P<num>\d+)/(?P<den>\d+)\s*in\b|(?P<dec>\d+(?:\.\d+)?)\s*in\b")


def published_inches(feat: dict):
    """Last inch label of the published string ('7/8 in', '1 7/8 in', '3.313 in'), or None."""
    pub = feat.get("published")
    if not isinstance(pub, str):
        return None
    last = None
    for m in _LABEL_IN.finditer(pub):
        if m.group("dec") is not None:
            last = float(m.group("dec"))
        else:
            last = int(m.group("whole") or 0) + int(m.group("num")) / int(m.group("den"))
    return last


# ---------------------------------------------------------------- kernel source read


CEBP_CONST_NAMES = ("CORNER_TANGENCY", "CORNER_R1", "CORNER_R2", "CORNER_FALL_R", "CORNER_FALL_OFF", "CORNER_FALL_OPENING",
                    "MIDDLE_TANGENCY", "MIDDLE_R1", "MIDDLE_R2", "MIDDLE_FALL_R", "MIDDLE_FALL_DEPTH", "MIDDLE_FALL_OPENING",
                    "CORNER_JUNCTION_RISE_IN", "CORNER_JUNCTION_RUN_IN", "MIDDLE_JUNCTION_DEG")
WPBSA_CTOR_RE = re.compile(r"pub fn wpbsa_snooker_12ft\(\) -> CurvedPocketTableSpec \{\s*CurvedPocketTableSpec \{(.+?)\}\s*\}", re.S)


# Every table.rs block that DETERMINES the Magnum's collision geometry (review review round 5): the
# constants and the constructor are the inputs, but `cebp::IN`, `corner_canonical`, `middle_canonical`,
# `Table::from_curved_pocket_spec` and `PocketFrame::place` are the construction — a change to any of
# them moves the WPBSA/Magnum geometry while the constants stay put.
MAGNUM_FN_BLOCKS = (
    ("corner_canonical", r"fn corner_canonical\("),
    ("middle_canonical", r"fn middle_canonical\("),
    ("circle_intersections", r"fn circle_intersections\("),          # review round 6: transitive helper
    ("from_curved_pocket_spec", r"pub fn from_curved_pocket_spec\("),
    ("impl PocketFrame", r"impl PocketFrame \{"),                     # review round 6: point / angle / place
)


def brace_block(src: str, start_re: str) -> str:
    """The text from the match of start_re through its balanced closing brace, or '<missing>'."""
    m = re.search(start_re, src)
    if not m:
        return "<missing>"
    i = src.find("{", m.end())
    if i < 0:
        return "<missing>"
    depth = 0
    for j in range(i, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[m.start():j + 1]
    return "<unbalanced>"


def magnum_blocks(src: str) -> dict[str, str]:
    """The table.rs TEXT this generator depends on: the 15 CEBP constant lines, `cebp::IN`, the
    `wpbsa_snooker_12ft` constructor and the four construction functions in MAGNUM_FN_BLOCKS — so the
    pinned-commit comparison is scoped to what determines the Magnum geometry and not to the whole
    file (which other lanes may legitimately append to)."""
    out: dict[str, str] = {}
    for name in CEBP_CONST_NAMES:
        m = re.search(rf"^.*pub const {name}: f64 = .*$", src, re.M)
        out[name] = m.group(0).strip() if m else "<missing>"
    m = re.search(r"^.*pub const IN: f64 = .*$", src, re.M)
    out["cebp::IN"] = m.group(0).strip() if m else "<missing>"
    m = WPBSA_CTOR_RE.search(src)
    out["wpbsa_snooker_12ft"] = m.group(0) if m else "<missing>"
    for name, start in MAGNUM_FN_BLOCKS:
        out[name] = brace_block(src, start)
    return out


def read_table_rs() -> dict:
    """Parse the constants this sheet depends on from crates/pool-core/src/table.rs (live read)."""
    path = repo_root() / TABLE_RS
    if not path.exists():
        raise AssertionError(f"KERNEL-SOURCE: {TABLE_RS} not found under {repo_root()} — the generator must run inside the repo")
    return parse_table_rs(path.read_text(encoding="utf-8"))


def parse_table_rs(src: str) -> dict:
    out: dict = {}
    for name in ("CORNER_TANGENCY", "CORNER_R1", "CORNER_R2", "CORNER_FALL_R", "CORNER_FALL_OFF", "CORNER_FALL_OPENING",
                 "MIDDLE_TANGENCY", "MIDDLE_R1", "MIDDLE_R2", "MIDDLE_FALL_R", "MIDDLE_FALL_DEPTH", "MIDDLE_FALL_OPENING"):
        m = re.search(rf"pub const {name}: f64 = (.+?) \* IN;", src)
        if not m:
            raise AssertionError(f"KERNEL-SOURCE: constant {name} not found in {TABLE_RS}")
        out[name] = m.group(1).strip()
    for name in ("CORNER_JUNCTION_RISE_IN", "CORNER_JUNCTION_RUN_IN", "MIDDLE_JUNCTION_DEG"):
        m = re.search(rf"pub const {name}: f64 = (.+?);", src)
        if not m:
            raise AssertionError(f"KERNEL-SOURCE: constant {name} not found in {TABLE_RS}")
        out[name] = m.group(1).strip()
    m = re.search(r"pub fn wpbsa_snooker_12ft\(\) -> CurvedPocketTableSpec \{\s*CurvedPocketTableSpec \{(.+?)\}\s*\}", src, re.S)
    if not m:
        raise AssertionError("KERNEL-SOURCE: wpbsa_snooker_12ft constructor not found")
    body = m.group(1)
    for key in ("length", "width", "nose_height_frac", "corner_scale", "middle_scale"):
        mm = re.search(rf"{key}: ([0-9.]+)", body)
        if not mm:
            raise AssertionError(f"KERNEL-SOURCE: {key} not found in wpbsa_snooker_12ft")
        out[f"spec.{key}"] = float(mm.group(1))
    out["spec.corner_family"] = "CebpTemplate" if "CornerPocketFamily::CebpTemplate" in body else "?"
    return out


def git_table_rs_unchanged(pinned: str):
    """'identical' / 'differs: <blocks>' / 'unknown-commit' / 'git-error', or None when git itself is
    unavailable.  SCOPE (review review round 1, P2): compares the Magnum's OWN table.rs blocks — the 15
    CEBP constant lines and the `wpbsa_snooker_12ft` constructor — between `git show <pinned>:table.rs`
    and the live file, not the whole file: the same branch appends `rasson_ox_9ft()` to table.rs (OX-A1),
    so a whole-file `git diff --quiet` aborted this generator on its own branch and made its red-arm
    19/20 for the wrong reason.  Needs full history (`git show <pinned>:` must resolve; a shallow clone
    or an archive export reports 'unknown-commit' and the check refuses)."""
    git = ["git", "-C", str(repo_root())]
    try:
        ver = subprocess.run(git + ["rev-parse", "--verify", "--quiet", f"{pinned}^{{commit}}"], capture_output=True, text=True, timeout=30)
        if ver.returncode != 0:
            return "unknown-commit"
        base = subprocess.run(git + ["show", f"{pinned}:{TABLE_RS}"], capture_output=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    if base.returncode != 0:
        return "git-error"
    base_src = base.stdout.decode("utf-8")
    live_src = (repo_root() / TABLE_RS).read_text(encoding="utf-8")
    bb, lb = magnum_blocks(base_src), magnum_blocks(live_src)
    moved = sorted(k for k in bb if bb[k] != lb[k])
    if parse_table_rs(base_src) != parse_table_rs(live_src):
        moved = sorted(set(moved) | {"parsed-constants"})
    return "identical" if not moved else "differs: " + ", ".join(moved)


# ---------------------------------------------------------------- checks


def make_checker(checks: list[tuple[str, bool, str]]):
    def check(name: str, cond: bool, detail: str) -> None:
        checks.append((name, bool(cond), detail))
        if not cond:
            raise AssertionError(f"identity check FAILED: {name} — {detail}")
    return check


def run_checks(doc: dict, f: dict[str, dict], checks: list[tuple[str, bool, str]]) -> dict:
    check = make_checker(checks)
    # STRUCTURE first — a malformed or gutted JSON must fail with a NAMED identity, never a traceback.
    check("COVERAGE required rows present", KERNEL_ROWS <= set(f), f"kernel rows missing from features: {sorted(KERNEL_ROWS - set(f))}")
    for fid, feat in f.items():
        check(f"COVERAGE vocab {fid} structure", isinstance(feat.get("scope"), str) and isinstance(feat.get("source"), dict) and isinstance(feat["source"].get("tier"), str),
              f"row must carry scope (str) and source.tier (str): scope={feat.get('scope')!r} source={feat.get('source')!r}"[:200])
    for key in ("kernel_pinning", "drafting", "scope_legend", "checks", "conflicts", "open_items", "doc"):
        check(f"COVERAGE top-level {key}", key in doc, f"top-level key {key} present")
    pin = doc["kernel_pinning"]
    for key in ("runtime_f64_bits", "canonical_values_m", "pinned_commit", "corner_family"):
        check(f"COVERAGE kernel_pinning.{key}", key in pin, "present")
    length, width = val(f, "PF-01")
    ball = val(f, "PF-02")

    # KERNEL-BITS — the alias rides wpbsa_snooker_12ft bit-for-bit (code literals, not JSON).
    runtime = {"length_m": length / 1000.0, "width_m": width / 1000.0, "nose_height_frac": val(f, "CU-03"),
               "corner_scale": 1.0, "middle_scale": 1.0}
    stored = pin["runtime_f64_bits"]
    check("KERNEL-BITS-COVERAGE", set(stored) == set(KERNEL_RUNTIME), "runtime_f64_bits covers exactly the kernel runtime tuple")
    for name, value in KERNEL_RUNTIME.items():
        check(f"KERNEL-BITS-{name}", stored[name] == f64_bits(value) and f64_bits(runtime[name]) == f64_bits(value),
              f"{name}: JSON bits {stored[name]} == code f64({value!r}) {f64_bits(value)} == row-derived {f64_bits(runtime[name])}")
    check("KERNEL-BITS CU-03", f["CU-03"]["runtime_f64_bits"] == f64_bits(KERNEL_RUNTIME["nose_height_frac"]),
          "CU-03.runtime_f64_bits == f64(0.70)")
    check("CU-02 nose", abs(val(f, "CU-03") * ball - val(f, "CU-02")) < 1e-9, f"{val(f, 'CU-03')} × {ball} = {val(f, 'CU-02')}")

    # KERNEL-PINS — JSON canonical values must EQUAL the code transcript of the table.rs test.
    cv = pin["canonical_values_m"]
    for key, exp in KERNEL_PINS.items():
        got = cv.get(key)
        if isinstance(exp, tuple):
            ok = isinstance(got, list) and len(got) == 2 and all(abs(a - b) < 1e-12 for a, b in zip(got, exp))
        else:
            ok = isinstance(got, (int, float)) and abs(got - exp) < 1e-12
        check(f"KERNEL-PINS {key}", ok, f"JSON {got} == code {exp}")

    check("KERNEL-PINS tolerances", abs(cv["tolerance_m"] - TOL_M) < 1e-15 and abs(cv["tolerance_rad"] - TOL_RAD) < 1e-15,
          f"JSON tolerance_m {cv['tolerance_m']} / tolerance_rad {cv['tolerance_rad']} == code TOL_M {TOL_M} / TOL_RAD {TOL_RAD} (the checks use the code values)")

    # KERNEL-SOURCE — live read of table.rs: inch labels + spec literals + pinned commit.
    rs = read_table_rs()
    for fid, (cname, expr) in CEBP_INCH.items():
        check(f"KERNEL-SOURCE {fid}", rs[cname] == expr and abs(eval(expr) * IN - val(f, fid)) < 5e-5,
              f"table.rs {cname} = {rs[cname]} in ↔ JSON {fid} {val(f, fid)} mm")
    off = f["CP-04"]["construction_offsets_in"]
    check("KERNEL-SOURCE CP-04 offsets", rs["CORNER_JUNCTION_RISE_IN"] == "6.15 - 5.43" and rs["CORNER_JUNCTION_RUN_IN"] == "4.32 - 3.00"
          and abs(eval(rs["CORNER_JUNCTION_RISE_IN"]) - off["rise"]) < 1e-9 and abs(eval(rs["CORNER_JUNCTION_RUN_IN"]) - off["run"]) < 1e-9,
          f"table.rs rise/run {rs['CORNER_JUNCTION_RISE_IN']} / {rs['CORNER_JUNCTION_RUN_IN']} ↔ JSON {off['rise']} / {off['run']}")
    check("KERNEL-SOURCE MP-04", abs(float(rs["MIDDLE_JUNCTION_DEG"]) - val(f, "MP-04")) < 1e-9, f"table.rs MIDDLE_JUNCTION_DEG {rs['MIDDLE_JUNCTION_DEG']}")
    for key, jkey in (("spec.length", "length_m"), ("spec.width", "width_m"), ("spec.nose_height_frac", "nose_height_frac"),
                      ("spec.corner_scale", "corner_scale"), ("spec.middle_scale", "middle_scale")):
        check(f"KERNEL-SOURCE {key}", f64_bits(rs[key]) == f64_bits(KERNEL_RUNTIME[jkey]), f"table.rs {key} = {rs[key]}")
    check("KERNEL-SOURCE family", rs["spec.corner_family"] == pin["corner_family"] == "CebpTemplate", f"table.rs family {rs['spec.corner_family']}")
    unchanged = git_table_rs_unchanged(pin["pinned_commit"])
    # review review round 2 (P2): `None` (git unavailable / timed out) used to be accepted as success, so
    # the generator could report every check green without ever replaying the pinned-commit
    # comparison. It is a refusal now — full git history is a stated requirement of this tool.
    check("KERNEL-SOURCE pinned commit", unchanged == "identical",
          f"Magnum blocks of {TABLE_RS} (15 CEBP constants, cebp::IN, wpbsa_snooker_12ft, corner/middle_canonical, "
          f"from_curved_pocket_spec, PocketFrame::place) vs `git show {pin['pinned_commit']}:`: "
          f"{unchanged or 'git unavailable or timed out — the pinned-commit comparison did not run, and an unverified pin is a refusal'}"
          f"{'' if unchanged != 'identical' else ' (the file as a whole may differ: other lanes append constructors)'}")

    # CONSTRUCT-CORNER — recompute from the inch labels; match the CODE pins.
    c = corner_construction(f)
    check("CONSTRUCT-CORNER C1", dist(c["c1"], KERNEL_PINS["corner_c1"]) < TOL_M and abs(c["r1"] - KERNEL_PINS["corner_r1"]) < TOL_M,
          f"C1 {c['c1']} r {c['r1']} vs pin {KERNEL_PINS['corner_c1']} r {KERNEL_PINS['corner_r1']}")
    check("CONSTRUCT-CORNER C2", dist(c["c2"], KERNEL_PINS["corner_c2"]) < TOL_M and abs(c["r2"] - KERNEL_PINS["corner_r2"]) < TOL_M,
          f"C2 {c['c2']} r {c['r2']} vs pin {KERNEL_PINS['corner_c2']} r {KERNEL_PINS['corner_r2']}")
    check("CONSTRUCT-CORNER arc1", abs(c["thj"] - math.radians(KERNEL_PINS["corner_arc1_start_deg"] + KERNEL_PINS["corner_arc1_sweep_deg"])) < TOL_RAD,
          f"junction {math.degrees(c['thj']):.4f}° vs 90 + {KERNEL_PINS['corner_arc1_sweep_deg']}")
    check("CONSTRUCT-CORNER arc2", abs(c["thj"] - math.radians(KERNEL_PINS["corner_arc2_start_deg"])) < TOL_RAD
          and abs(c["th_end"] - math.radians(KERNEL_PINS["corner_arc2_end_deg"])) < TOL_RAD,
          f"arc2 {math.degrees(c['thj']):.4f}° → {math.degrees(c['th_end']):.4f}° vs pin {KERNEL_PINS['corner_arc2_start_deg']} → {KERNEL_PINS['corner_arc2_end_deg']}")
    check("CONSTRUCT-CORNER fall pin", abs(c["cw"] - KERNEL_PINS["corner_fall_off"]) < TOL_M and abs(c["rf"] - KERNEL_PINS["corner_fall_r"]) < TOL_M,
          f"fall off {c['cw']} r {c['rf']} vs pin {KERNEL_PINS['corner_fall_off']} / {KERNEL_PINS['corner_fall_r']}")

    def last_digit(fid: str, value, digits: int = 4) -> None:
        stored = val(f, fid)
        if isinstance(stored, list) and isinstance(stored[0], list):
            ok = all(abs(s - round(v, digits)) < 5e-5 for sp, vp in zip(stored, value) for s, v in zip(sp, vp))
        elif isinstance(stored, list):
            ok = all(abs(s - round(v, digits)) < 5e-5 for s, v in zip(stored, value))
        else:
            ok = abs(stored - round(value, digits)) < 5e-5
        check(f"DERIVED {fid}", ok, f"JSON {stored} == round(recomputed {value}, {digits})")
    last_digit("CP-04", math.degrees(c["thj"]))
    last_digit("CP-05", math.degrees(c["th_end"]))
    last_digit("CP-10", [c["c1"][0] * 1000, c["c1"][1] * 1000])
    last_digit("CP-11", [c["c2"][0] * 1000, c["c2"][1] * 1000])
    last_digit("CP-12", [c["end"][0] * 1000, c["end"][1] * 1000])
    closure_c = math.sqrt(2.0) * abs(c["end"][0] - c["end"][1]) * 1000
    last_digit("CP-09", closure_c)
    check("DERIVED CP-09 below label", closure_c < val(f, "CP-08"), f"drawn closure {closure_c:.4f} < label CP-08 {val(f, 'CP-08')} (documented label rounding)")
    check("CP-07 = CU-09", abs(val(f, "CP-07") - val(f, "CU-09")) < 1e-9, "fall centre = slate-edge intersection = cushion width behind both nose lines")
    check("TANGENCY corner arc1", abs(c["c1"][1] + c["r1"]) < 1e-12, "C1.v = −R1 (tangent to the nose line at (CP-01, 0))")
    check("TANGENCY corner arc1/arc2", abs(dist(c["c1"], c["c2"]) - (c["r2"] - c["r1"])) < 1e-12, "|C1 − C2| = R2 − R1 (internal tangency at the junction)")
    check("TANGENCY corner end on fall", abs(dist(c["end"], c["fall"]) - c["rf"]) < 1e-9, "|X − F| = RF (arc2 ends ON the capture disc)")

    # CONSTRUCT-MIDDLE
    m = middle_construction(f)
    check("CONSTRUCT-MIDDLE C1", dist(m["c1"], KERNEL_PINS["middle_c1"]) < TOL_M and abs(m["r1"] - KERNEL_PINS["middle_r1"]) < TOL_M,
          f"C1 {m['c1']} r {m['r1']} vs pin {KERNEL_PINS['middle_c1']} r {KERNEL_PINS['middle_r1']}")
    check("CONSTRUCT-MIDDLE C2", dist(m["c2"], KERNEL_PINS["middle_c2"]) < TOL_M and abs(m["r2"] - KERNEL_PINS["middle_r2"]) < TOL_M,
          f"C2 {m['c2']} r {m['r2']} vs pin {KERNEL_PINS['middle_c2']} r {KERNEL_PINS['middle_r2']}")
    check("CONSTRUCT-MIDDLE arc1", abs(math.degrees(math.pi / 2.0 - m["thj"]) - KERNEL_PINS["middle_arc1_sweep_deg"]) < 1e-9
          and abs(math.radians(KERNEL_PINS["middle_arc1_start_deg"]) - math.pi / 2.0) < 1e-12,
          f"arc1 90° → {val(f, 'MP-04')}° = sweep {KERNEL_PINS['middle_arc1_sweep_deg']}")
    check("CONSTRUCT-MIDDLE arc2 end", abs(m["th_end"] - math.radians(KERNEL_PINS["middle_arc2_end_local_deg"])) < TOL_RAD,
          f"arc2 end {math.degrees(m['th_end']):.4f}° vs pin {KERNEL_PINS['middle_arc2_end_local_deg']}")
    check("CONSTRUCT-MIDDLE fall pin", abs(m["fd"] - KERNEL_PINS["middle_fall_depth"]) < TOL_M and abs(m["rf"] - KERNEL_PINS["middle_fall_r"]) < TOL_M,
          f"fall depth {m['fd']} r {m['rf']} vs pin {KERNEL_PINS['middle_fall_depth']} / {KERNEL_PINS['middle_fall_r']}")
    last_digit("MP-05", math.degrees(m["th_end"]))
    last_digit("MP-11", [[m["c1"][0] * 1000, m["c1"][1] * 1000], [m["c2"][0] * 1000, m["c2"][1] * 1000]])
    closure_m = 2.0 * abs(m["end"][0]) * 1000
    last_digit("MP-09", closure_m)
    check("DERIVED MP-09 below label", closure_m < val(f, "MP-08"), f"drawn closure {closure_m:.4f} < label MP-08 {val(f, 'MP-08')}")
    poke = (m["rf"] - m["fd"]) * 1000
    last_digit("MP-10", poke)
    check("KERNEL-PINS MP-10 kernel poke", abs(poke - KERNEL_PINS["middle_fall_poke"] * 1000) < 2e-2, f"poke {poke:.4f} mm vs kernel pin 1.60 (tolerance 2e-5 m as in the test)")
    check("TANGENCY middle arc1", abs(m["c1"][1] + m["r1"]) < 1e-12, "C1.v = −R1 (tangent to the nose line at (−MP-01, 0))")
    check("TANGENCY middle arc1/arc2", abs(dist(m["c1"], m["c2"]) - abs(m["r2"] - m["r1"])) < 1e-12, "|C1 − C2| = |R2 − R1| (internal tangency at the drawn 54° junction)")
    check("TANGENCY middle end on fall", abs(dist(m["end"], m["fall"]) - m["rf"]) < 1e-9, "|X − F| = RF")

    # IMPERIAL-EXACT + LABEL-EXACT
    for fid in ("CU-04", "CU-05", "CU-06", "CU-07", "CU-08", "CU-09", "CP-02", "CP-03", "CP-06", "MP-02"):
        v = val(f, fid)
        check(f"IMPERIAL-EXACT {fid}", exact_binary_inch(v), f"{v} mm = {inch_label(v)}")
    n_labels = 0
    for fid, feat in f.items():
        lab = published_inches(feat)
        if lab is None or not isinstance(feat.get("value_mm"), (int, float)):
            continue
        n_labels += 1
        check(f"LABEL-EXACT {fid}", abs(round(lab * IN, 4) - feat["value_mm"]) < 5e-5, f"{lab} in × 25.4 = {round(lab * IN, 4)} ↔ value_mm {feat['value_mm']}")
    check("LABEL-EXACT coverage", n_labels >= 16, f"{n_labels} rows carry an inch label")
    check("ORDER L-profile", val(f, "CU-06") < val(f, "CU-05") < val(f, "CU-04"), "step < height < width (a real L)")

    # ENVELOPE
    env_l, env_w = val(f, "EN-01")
    check("ENVELOPE RB-01", abs((env_l - 3570.0) / 2.0 - val(f, "RB-01")) < 1e-9, f"({env_l} − 3570)/2 = {val(f, 'RB-01')}")
    check("ENVELOPE RB-02", abs((env_w - 1778.0) / 2.0 - val(f, "RB-02")) < 1e-9, f"({env_w} − 1778)/2 = {val(f, 'RB-02')}")
    check("ENVELOPE contains playfield + cushions", env_l >= length + 2 * val(f, "CU-09") and env_w >= width + 2 * val(f, "CU-09"),
          "EN-01 ≥ PF-01 + 2 × CU-09 on both axes")

    # ORDER
    check("ORDER nose datums", val(f, "CU-14") < val(f, "CU-02") < val(f, "CU-15") < val(f, "CU-16"),
          f"{val(f, 'CU-14')} < {val(f, 'CU-02')} < {val(f, 'CU-15')} < {val(f, 'CU-16')}")
    check("ORDER EN-03 < EN-02", val(f, "EN-03") < val(f, "EN-02"), f"bed {val(f, 'EN-03')} below the rail top {val(f, 'EN-02')}")
    stack_residual = (val(f, "EN-02") - val(f, "EN-03")) - val(f, "CU-16")
    check("DERIVED EN-08 stack residual", abs(val(f, "EN-08") - round(stack_residual, 2)) < 5e-3,
          f"EN-08 {val(f, 'EN-08')} == (EN-02 − EN-03) − CU-16 = {stack_residual:.2f} (catalog height rounding vs the model rail stack)")

    # COVERAGE — scopes, identities list, vocabularies
    kernel_rows = {fid for fid, feat in f.items() if feat["scope"] == "kernel-collision"}
    check("COVERAGE kernel rows", kernel_rows == KERNEL_ROWS,
          f"kernel-collision rows == rows consumed by the kernel checks (extra {sorted(kernel_rows - KERNEL_ROWS)}, missing {sorted(KERNEL_ROWS - kernel_rows)})")
    # PROVENANCE-TAG (LAW-PURCHASED-BASELINE §4, tags only for the Magnum at r5): every row tagged.
    for fid, feat in f.items():
        tag = feat.get("provenance_tag"); head = str(tag).split("(", 1)[0] if isinstance(tag, str) else ""
        # r6 (maintainer ruling C6): REF = reference-only evidence no kernel or render number consumes; it
        # replaced the r5 MFR-ADJACENT head and is never allowed on a kernel row.
        allowed = ("MFR", "MODEL", "DERIVED") + (("REF",) if feat.get("scope") != "kernel-collision" else ())
        check(f"PROVENANCE-TAG {fid} tagged", isinstance(tag, str) and head in allowed and "(" in tag,
              f"{fid} carries {tag!r}; needs one of {allowed} with its source in brackets")
        check(f"PROVENANCE-TAG {fid} no retired head", not str(tag).startswith("MFR-ADJACENT"),
              f"{fid} carries the retired r5 head MFR-ADJACENT; r6 C6 replaced it with REF on non-kernel rows")
    ids = doc["checks"]["identities"]
    heads = {i.split(":")[0].split(" ")[0].strip() for i in ids}  # first token of each declared line
    # review review round 5: this used to be a hand-listed prefix subset plus a length floor, so a
    # stale or padded identities list could pass. Now BOTH directions: every family that actually ran
    # (recorded check names) must be declared, and every declared head must have run.
    executed = {check_family(n) for n, _, _ in checks}
    check("COVERAGE identities declared for every executed family", executed <= heads,
          f"executed but undeclared: {sorted(executed - heads)}; declared heads {sorted(heads)}")
    check("COVERAGE every declared identity family executed", heads <= executed | {"COVERAGE"},
          f"declared but never executed: {sorted(heads - executed - {'COVERAGE'})}")
    check("COVERAGE identities hand list matches execution", set(IDENTITY_FAMILIES) == executed | {"COVERAGE"},
          f"IDENTITY_FAMILIES {sorted(set(IDENTITY_FAMILIES) ^ (executed | {'COVERAGE'}))} out of step with what ran")
    legal_scopes = set(doc["scope_legend"])
    legal_status = {"ESTIMATED", "ASSUMPTION", "TO-BE-MEASURED"}
    legal_tiers = {"MFR", "WPBSA", "MFR+WPBSA", "LIT", "COM", "PHOTO", "DLR", "DERIVED", "EST"}
    for fid, feat in f.items():
        check(f"COVERAGE vocab {fid}", feat["scope"] in legal_scopes and feat["source"]["tier"] in legal_tiers and feat.get("status", "ESTIMATED") in legal_status,
              f"scope {feat['scope']} / tier {feat['source']['tier']} / status {feat.get('status')}")
    return {"corner": c, "middle": m, "closure_corner_mm": closure_c, "closure_middle_mm": closure_m, "poke_middle_mm": poke}


# ---------------------------------------------------------------- SVG sheet


class Sheet:
    """One GB/T-styled SVG sheet with a shared title block (pattern: gh488d)."""

    W = 1680
    H = 1180
    FRAME = (18.0, 80.0, 1662.0, 1040.0)  # drawing area: below the header, above the title block

    def __init__(self, sheet_no: str, title: str, doc: dict, sha: str, scale_note: str, source_label: str = DEFAULT_SOURCE):
        self.source_label = source_label
        self.buf: list[str] = []
        self.doc = doc
        self.sheet_no = sheet_no
        self.title = title
        self.sha = sha
        self.scale_note = scale_note
        self.dp = int(doc["drafting"]["displayed_decimals"])
        self.guard = False  # True only while a view is clipped (FRAME bounds); the SHEET bound is always on
        d = doc["doc"]
        self.buf.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.W} {self.H}" font-family="Helvetica, Arial, sans-serif">')
        x0, y0, x1, y1 = self.FRAME
        self.buf.append(f'<defs><clipPath id="frame"><rect x="{self.c(x0)}" y="{self.c(y0)}" width="{self.c(x1 - x0)}" height="{self.c(y1 - y0)}"/></clipPath></defs>')
        self.rect(0, 0, self.W, self.H, fill="#f7f4ec", stroke="none")
        self.rect(18, 18, self.W - 36, self.H - 36, fill="#fffdf8", stroke="#222", sw=1.6)
        self.text(34, 46, f"{d['number']} · {sheet_no} — {title}", 19, weight="700")
        self.text(34, 68, f"table {d['table_id']} · rev {d['revision']} · {d['status']} · {d['date']} · source sha256 {sha[:16]}…", 11, fill="#555")

    @staticmethod
    def c(v: float) -> str:
        s = f"{v:.2f}"
        return s.rstrip("0").rstrip(".") if "." in s else s

    def disp(self, v: float) -> str:
        """The ONE displayed-value formatter: drafting.displayed_decimals, ROUND_HALF_UP."""
        q = Decimal(1).scaleb(-self.dp)
        return str(Decimal(repr(float(v))).quantize(q, rounding=ROUND_HALF_UP))

    def mm(self, v) -> str:
        if isinstance(v, list):
            return " × ".join(self.mm(x) for x in v)
        return self.disp(v)

    def begin_clip(self) -> None:
        self.buf.append('<g clip-path="url(#frame)">')
        self.guard = True

    def end_clip(self) -> None:
        self.buf.append("</g>")
        self.guard = False

    def line(self, x1, y1, x2, y2, stroke="#111", w=1.1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<line x1="{self.c(x1)}" y1="{self.c(y1)}" x2="{self.c(x2)}" y2="{self.c(y2)}" stroke="{stroke}" stroke-width="{w}"{d}/>')

    def path(self, d, stroke="#111", w=1.1, fill="none", dash=None):
        dd = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<path d="{d}" stroke="{stroke}" stroke-width="{w}" fill="{fill}"{dd}/>')

    def circle(self, cx, cy, r, stroke="#111", w=1.1, fill="none", dash=None):
        dd = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<circle cx="{self.c(cx)}" cy="{self.c(cy)}" r="{self.c(r)}" stroke="{stroke}" stroke-width="{w}" fill="{fill}"{dd}/>')

    def rect(self, x, y, w, h, fill="none", stroke="#333", sw=1.0, dash=None):
        dd = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<rect x="{self.c(x)}" y="{self.c(y)}" width="{self.c(w)}" height="{self.c(h)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{dd}/>')

    def text(self, x, y, s, size=11.0, fill="#111", anchor="start", weight=None, rot=None):
        # review review round 5: the bounds check used to run only between begin_clip()/end_clip(), so
        # headers, letters tables and title blocks were unguarded. Inside a clipped view the tighter
        # FRAME applies; everywhere else the sheet border does — a named refusal either way.
        x0, y0, x1, y1 = self.FRAME if self.guard else (0.0, 0.0, float(self.W), float(self.H))
        if not (x0 < x < x1 and y0 < y < y1):
            raise AssertionError(f"identity check FAILED: COVERAGE sheet {self.sheet_no} text anchor — ({x:.1f}, {y:.1f}) "
                                 f"lies outside {'the drawing frame' if self.guard else 'the sheet'} {(x0, y0, x1, y1)}: {s!r}")
        wa = f' font-weight="{weight}"' if weight else ""
        ra = f' transform="rotate({rot} {self.c(x)} {self.c(y)})"' if rot is not None else ""
        s = str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        self.buf.append(f'<text x="{self.c(x)}" y="{self.c(y)}" font-size="{size}" fill="{fill}" text-anchor="{anchor}"{wa}{ra}>{s}</text>')

    def dim(self, x1, y1, x2, y2, label, off=0.0, size=9.5, fill="#333"):
        nx, ny = y2 - y1, x1 - x2
        norm = math.hypot(nx, ny) or 1.0
        nx, ny = nx / norm, ny / norm
        ax, ay = x1 + nx * off, y1 + ny * off
        bx, by = x2 + nx * off, y2 + ny * off
        self.line(ax, ay, bx, by, "#333", 0.7)
        for px, py in ((ax, ay), (bx, by)):
            self.line(px - 3 * nx, py - 3 * ny, px + 3 * nx, py + 3 * ny, "#333", 0.7)
        self.text((ax + bx) / 2 + nx * 6, (ay + by) / 2 + ny * 6, label, size, fill=fill, anchor="middle", weight="600")

    def vdim(self, x, y_bottom, y_top, label, size=9.5, horizontal=False):
        """Vertical dimension; label rotated along the line, or horizontal to its left when it would overrun the line."""
        self.line(x, y_bottom, x, y_top, "#333", 0.7)
        for yy in (y_bottom, y_top):
            self.line(x - 3, yy, x + 3, yy, "#333", 0.7)
        if horizontal:
            self.text(x - 8, (y_bottom + y_top) / 2 + 3, label, size, anchor="end", weight="600", fill="#333")
        else:
            self.text(x - 5, (y_bottom + y_top) / 2, label, size, anchor="middle", weight="600", rot=-90, fill="#333")

    def notes(self, x, y, paragraphs, size=10.0, budget=168, lead=16, fill="#333"):
        """Header notes wrapped to the drawing area left of the letters table; returns the next free y."""
        for para in paragraphs:
            for ln in wrap(para, budget):
                self.text(x, y, ln, size, fill=fill)
                y += lead
        return y

    def letters_table(self, x, y, w, title, rows):
        rh = 16
        self.rect(x, y, w, 24 + rh * len(rows) + 8, fill="#fbf9f2", stroke="#4a6a8a", sw=0.9)
        self.text(x + 10, y + 17, title, 11, weight="700", fill="#0a2a6a")
        yy = y + 24 + 11
        for letter, value, tier, scope, source in rows:
            self.text(x + 10, yy, letter, 9.2, weight="700")
            self.text(x + 64, yy, value, 9.2, fill="#222")
            self.text(x + 300, yy, tier, 8.4, fill="#7a3a10")
            self.text(x + 366, yy, scope, 8.4, fill="#8a1010" if scope == "kernel" else ("#1d7a38" if scope == "render" else "#555"))
            self.text(x + 430, yy, source, 8.4, fill="#555")
            yy += rh

    def title_block(self, extra=""):
        d = self.doc["doc"]
        y0 = self.H - 130
        self.rect(18, y0, self.W - 36, 112, fill="#f2efe6", stroke="#222", sw=1.4)
        self.text(34, y0 + 22, f"{d['number']} — {d['title']}", 12, weight="700")
        std = self.doc["drafting"]
        self.text(34, y0 + 40, "normative: " + "; ".join(std["normative"]) + "  ·  supplementary: " + "; ".join(std["supplementary_iso"]), 8.6, fill="#444")
        self.text(34, y0 + 56, f"projection: {std['projection']} · units mm/deg · displayed to {self.dp} dp (half-up; inch labels alongside) · {self.scale_note} · DO NOT SCALE DRAWING", 9.2, weight="600")
        self.text(34, y0 + 72, f"single source: {self.source_label} · sha256 {self.sha}", 8.6, fill="#444")
        self.text(34, y0 + 88, f"generator {GENERATOR_ID} · {d['generator_banner']}", 8.6, fill="#8a1010")
        if extra:
            self.text(34, y0 + 104, extra, 8.6, fill="#1d7a38")
        sx = self.W - 190
        self.circle(sx + 24, y0 + 34, 11, "#222", 1.0)
        self.circle(sx + 24, y0 + 34, 4.5, "#222", 1.0)
        self.path(f"M {sx + 52} {y0 + 22} L {sx + 88} {y0 + 26} L {sx + 88} {y0 + 42} L {sx + 52} {y0 + 46} Z", "#222", 1.0)
        self.text(sx + 24, y0 + 62, "first angle", 8.2, anchor="middle", fill="#444")
        self.text(sx + 24, y0 + 90, f"sheet {self.sheet_no}", 10, anchor="middle", weight="700")

    def finish(self) -> str:
        self.buf.append("</svg>")
        return "\n".join(self.buf) + "\n"


def tier_of(feat: dict) -> str:
    return feat["source"]["tier"]


def scope_short(feat: dict) -> str:
    return {"kernel-collision": "kernel", "render-only": "render", "envelope": "envelope", "reference-only": "reference"}[feat["scope"]]


def flag(feat: dict) -> str:
    return f" [{feat['status']}]" if feat.get("status") else ""


def row_of(sh: Sheet, f: dict[str, dict], fid: str) -> tuple:
    feat = f[fid]
    v = val(f, fid)
    if isinstance(v, str):
        value = v if len(v) <= 34 else v[:31] + "…"
    elif "value_deg" in feat:
        value = f"{sh.disp(v)}°"
    else:
        value = sh.mm(v)
        lab = published_inches(feat)
        if lab is not None and not isinstance(v, list):
            value += f" ({inch_label(v)})"
    src = feat["source"].get("dossier_file") or feat["source"]["doc"]
    src = src if len(src) <= 58 else src[:55] + "…"
    return (fid, value + flag(feat), tier_of(feat), scope_short(feat), src)


class Frame:
    """Model → sheet transform for a plan view: metres in, sheet px out, y flipped."""

    def __init__(self, ox: float, oy: float, px_per_mm: float):
        self.ox, self.oy, self.k = ox, oy, px_per_mm * 1000.0

    def p(self, u: float, v: float) -> tuple[float, float]:
        return self.ox + u * self.k, self.oy - v * self.k

    def r(self, metres: float) -> float:
        return metres * self.k


def arc_path(fr: Frame, c, r, a_from, a_to) -> str:
    p0 = fr.p(c[0] + r * math.cos(a_from), c[1] + r * math.sin(a_from))
    p1 = fr.p(c[0] + r * math.cos(a_to), c[1] + r * math.sin(a_to))
    sweep_ccw = a_to - a_from
    large = 1 if abs(sweep_ccw) > math.pi else 0
    sweep_flag = 0 if sweep_ccw > 0 else 1
    rr = fr.r(r)
    return f"M {Sheet.c(p0[0])} {Sheet.c(p0[1])} A {Sheet.c(rr)} {Sheet.c(rr)} 0 {large} {sweep_flag} {Sheet.c(p1[0])} {Sheet.c(p1[1])}"


def mirrored(pt):
    return (pt[1], pt[0])


# ---------------------------------------------------------------- sheets


def sheet_corner(doc, f, sha, solved, src, derived) -> str:
    sh = Sheet("S1", "corner pocket assembly — plan, kernel local jaw frame (CEBP 2005/6 template, scale 1.0)",
               doc, sha, "scale 1 mm = 3.0 px (nominal; do not scale)", src)
    c = derived["corner"]
    D = lambda v: sh.disp(v * 1000)
    fr = Frame(560, 700, 3.0)
    sh.begin_clip()
    pa0 = fr.p(0.0, 0.165)
    pa1 = fr.p(0.145, 0.0)
    sh.rect(pa0[0], pa0[1], pa1[0] - pa0[0], pa1[1] - pa0[1], fill="#e4efe4", stroke="none")
    sh.text(*fr.p(0.072, 0.15), "playing area (u > 0, v > 0)", 9.5, fill="#1d7a38", anchor="middle")
    sh.line(*fr.p(0.0, 0.0), *fr.p(0.21, 0.0), "#111", 1.3)
    sh.line(*fr.p(0.0, 0.0), *fr.p(0.0, 0.19), "#111", 1.3)
    N = fr.p(0, 0)
    sh.text(N[0] - 6, N[1] - 6, "N (nose-line intersection)", 9.5, fill="#0a2a6a", anchor="end")
    sh.text(*fr.p(0.16, -0.006), "u (nose line, drawn jaw's rail)", 9, fill="#444")
    sh.text(*fr.p(0.004, 0.155), "v (other rail's nose line)", 9, fill="#444")
    cw = c["cw"]
    sh.line(*fr.p(-cw, -0.13), *fr.p(-cw, 0.19), "#7a3a10", 0.8, dash="6 4")
    sh.line(*fr.p(-0.13, -cw), *fr.p(0.21, -cw), "#7a3a10", 0.8, dash="6 4")
    sh.text(*fr.p(-cw - 0.003, 0.12), "slate edge", 8.5, fill="#7a3a10", rot=-90)
    Fc = c["fall"]
    fp = fr.p(*Fc)
    sh.circle(fp[0], fp[1], fr.r(c["rf"]), "#8a1010", 1.4, dash="10 5")
    sh.circle(fp[0], fp[1], 3, "#8a1010", 1.0, fill="#8a1010")
    sh.text(fp[0] + 8, fp[1] + 14, f"F fall centre (−{D(cw)}, −{D(cw)})  R {D(c['rf'])}  [CP-06 / CP-07]", 9, fill="#8a1010")
    for name, mp, colour in (("A", lambda p: p, "#111"), ("B", mirrored, "#1d3a8a")):
        c1, c2 = mp(c["c1"]), mp(c["c2"])
        if name == "A":
            sh.path(arc_path(fr, c1, c["r1"], math.pi / 2, c["thj"]), colour, 2.2)
            sh.path(arc_path(fr, c2, c["r2"], c["thj"], c["th_end"]), colour, 2.2)
        else:
            sh.path(arc_path(fr, c1, c["r1"], 0.0, math.pi / 2 - c["thj"]), colour, 2.2)
            sh.path(arc_path(fr, c2, c["r2"], math.pi / 2 - c["thj"], math.pi / 2 - c["th_end"]), colour, 2.2)
        for cc, rr, lab in ((c1, c["r1"], "C1"), (c2, c["r2"], "C2")):
            pp = fr.p(*cc)
            sh.circle(pp[0], pp[1], 2.4, colour, 0.9, fill=colour)
            sh.text(pp[0] + 6, pp[1] - 4, f"{lab}{name}", 8.5, fill=colour)
            sh.circle(pp[0], pp[1], fr.r(rr), colour, 0.5, dash="2 4")
    T = fr.p(c["ut"], 0.0)
    sh.circle(T[0], T[1], 3, "#111", 1.0, fill="#fff")
    sh.text(T[0] + 6, T[1] + 16, f"T tangency (u = {D(c['ut'])}) [CP-01]", 9)
    X = fr.p(*c["end"])
    sh.circle(X[0], X[1], 3, "#8a1010", 1.0, fill="#fff")
    sh.text(X[0] + 8, X[1] + 16, f"X arc2 ∩ fall ({D(c['end'][0])}, {D(c['end'][1])}) [CP-12]", 9, fill="#8a1010")
    Xm = fr.p(*mirrored(c["end"]))
    sh.line(X[0], X[1], Xm[0], Xm[1], "#8a1010", 0.8)
    sh.text((X[0] + Xm[0]) / 2 + 10, (X[1] + Xm[1]) / 2 + 4, f"drawn closure {sh.disp(derived['closure_corner_mm'])} [CP-09] (label CP-08 {sh.disp(val(f, 'CP-08'))})", 9, fill="#8a1010")
    sh.dim(*fr.p(0, 0), *fr.p(c["ut"], 0), f"CP-01  {D(c['ut'])} ({inch_label(val(f, 'CP-01'))})", off=40)
    sh.dim(*fr.p(-cw, 0.10), *fr.p(0, 0.10), f"CU-09 / CP-07  {D(cw)} ({inch_label(val(f, 'CU-09'))})", off=-28)
    Jp = fr.p(c["c1"][0] + c["r1"] * math.cos(c["thj"]), c["c1"][1] + c["r1"] * math.sin(c["thj"]))
    sh.circle(Jp[0], Jp[1], 2.5, "#111", 0.9, fill="#fff")
    sh.text(Jp[0] + 10, Jp[1] + 12, f"J junction {sh.disp(math.degrees(c['thj']))}° [CP-04] (C1, C2 collinear)", 9)
    sh.notes(60, 112, [
        f"CEBP jaw = arc1 R{D(c['r1'])} [CP-02] tangent to the nose line at T, sweeping CCW {sh.disp(90.0)}° → {sh.disp(math.degrees(c['thj']))}°, "
        f"then the tangent arc2 R{D(c['r2'])} [CP-03] sweeping on to the fall circle (end {sh.disp(math.degrees(c['th_end']))}° [CP-05], exact circle ∩ circle).",
        "Kernel collision objects = the two SPANNED arcs per jaw + the fall disc (capture = ball centre past the disc rim). No facings, no shelf, no throat scalar exist in this family.",
        "Jaw B (blue) = jaw A mirrored across u = v. Six pocket instances by the kernel placement table (never entered separately). Construction circles dashed thin."])
    sh.end_clip()
    rows = [row_of(sh, f, fid) for fid in ("CP-01", "CP-02", "CP-03", "CP-04", "CP-05", "CP-06", "CP-07", "CP-08", "CP-09", "CP-10", "CP-11", "CP-12", "CP-13", "CU-09", "CU-02", "PF-02")]
    sh.letters_table(1010, 100, 640, "letters — corner pocket (mm / deg; inch labels as published)", rows)
    solved["corner"] = {"C1_mm": [c["c1"][0] * 1000, c["c1"][1] * 1000], "C2_mm": [c["c2"][0] * 1000, c["c2"][1] * 1000],
                        "T_mm": [c["ut"] * 1000, 0.0], "X_mm": [c["end"][0] * 1000, c["end"][1] * 1000],
                        "F_mm": [c["fall"][0] * 1000, c["fall"][1] * 1000], "junction_deg": math.degrees(c["thj"]),
                        "end_deg": math.degrees(c["th_end"]), "closure_mm": derived["closure_corner_mm"]}
    sh.title_block("S1 draws the KERNEL construction verbatim (alias of wpbsa_snooker_12ft); render furniture (brass corner, leather bucket, net) is A2 and carries no kernel bytes")
    return sh.finish()


def sheet_middle(doc, f, sha, solved, src, derived) -> str:
    sh = Sheet("S2", "middle pocket assembly — plan, kernel local frame (CEBP 2005/6 template, scale 1.0)",
               doc, sha, "scale 1 mm = 3.0 px (nominal; do not scale)", src)
    m = derived["middle"]
    D = lambda v: sh.disp(v * 1000)
    fr = Frame(560, 560, 3.0)
    sh.begin_clip()
    sh.line(*fr.p(-0.22, 0.0), *fr.p(0.22, 0.0), "#111", 1.3)
    sh.line(*fr.p(0.0, -0.14), *fr.p(0.0, 0.14), "#444", 0.7, dash="8 4")
    sh.text(*fr.p(0.16, 0.006), "nose line (v = 0); playing area above", 9, fill="#444")
    sh.text(*fr.p(0.004, 0.10), "pocket centre line (u = 0)", 9, fill="#444")
    Fc = m["fall"]
    fp = fr.p(*Fc)
    sh.circle(fp[0], fp[1], fr.r(m["rf"]), "#8a1010", 1.4, dash="10 5")
    sh.circle(fp[0], fp[1], 3, "#8a1010", 1.0, fill="#8a1010")
    sh.text(fp[0], fp[1] + 40, f"F (0, −{D(m['fd'])}) [MP-07]  R {D(m['rf'])} [MP-06]", 9, fill="#8a1010", anchor="middle")
    sh.text(fp[0], fp[1] + 54, f"rim pokes {sh.disp(derived['poke_middle_mm'])} past the nose [MP-10]", 9, fill="#8a1010", anchor="middle")
    for name, sgn, colour in (("lower", 1.0, "#111"), ("upper", -1.0, "#1d3a8a")):
        c1 = (sgn * m["c1"][0], m["c1"][1])
        c2 = (sgn * m["c2"][0], m["c2"][1])
        if sgn > 0:
            sh.path(arc_path(fr, c1, m["r1"], math.pi / 2, m["thj"]), colour, 2.2)
            sh.path(arc_path(fr, c2, m["r2"], m["thj"], m["th_end"]), colour, 2.2)
        else:
            sh.path(arc_path(fr, c1, m["r1"], math.pi / 2, math.pi - m["thj"]), colour, 2.2)
            sh.path(arc_path(fr, c2, m["r2"], math.pi - m["thj"], math.pi - m["th_end"]), colour, 2.2)
        for cc, rr, lab in ((c1, m["r1"], "C1"), (c2, m["r2"], "C2")):
            pp = fr.p(*cc)
            sh.circle(pp[0], pp[1], 2.4, colour, 0.9, fill=colour)
            sh.text(pp[0] + 6, pp[1] - 4, f"{lab} {name}", 8.5, fill=colour)
            sh.circle(pp[0], pp[1], fr.r(rr), colour, 0.5, dash="2 4")
    T = fr.p(-m["ut"], 0.0)
    sh.circle(T[0], T[1], 3, "#111", 1.0, fill="#fff")
    sh.text(T[0] - 8, T[1] + 18, f"T tangency (u = −{D(m['ut'])}) [MP-01]", 9, anchor="end")
    X = fr.p(*m["end"])
    Xu = fr.p(-m["end"][0], m["end"][1])
    for pt in (X, Xu):
        sh.circle(pt[0], pt[1], 3, "#8a1010", 1.0, fill="#fff")
    sh.line(X[0], X[1], Xu[0], Xu[1], "#8a1010", 0.8)
    sh.text((X[0] + Xu[0]) / 2, X[1] + 16, f"drawn closure {sh.disp(derived['closure_middle_mm'])} [MP-09] (label MP-08 {sh.disp(val(f, 'MP-08'))})", 9, fill="#8a1010", anchor="middle")
    sh.dim(*fr.p(-m["ut"], 0.0), *fr.p(0.0, 0.0), f"MP-01  {D(m['ut'])} ({inch_label(val(f, 'MP-01'))})", off=40)
    sh.dim(*fr.p(0.12, 0.0), *fr.p(0.12, -m["fd"]), f"MP-07  {D(m['fd'])} ({inch_label(val(f, 'MP-07'))})", off=-30)
    sh.notes(60, 112, [
        f"CEBP middle jaw = arc1 R{D(m['r1'])} [MP-02] tangent to the nose line at T, sweeping CW {sh.disp(90.0)}° → {sh.disp(val(f, 'MP-04'))}° [MP-04, drawn label], "
        f"then the tangent arc2 R{D(m['r2'])} [MP-03] on to the fall circle (end {sh.disp(math.degrees(m['th_end']))}° [MP-05], exact circle ∩ circle).",
        f"Fall circle R{D(m['rf'])} centred {D(m['fd'])} behind the nose on the centre line — its rim pokes {sh.disp(derived['poke_middle_mm'])} mm past the nose line (the slate is cut there; kernel pin).",
        "Exactness knob (a junction angle that would reproduce the published label exactly) documented NOT taken in table.rs; the label-exact drawn construction is the kernel."])
    sh.end_clip()
    rows = [row_of(sh, f, fid) for fid in ("MP-01", "MP-02", "MP-03", "MP-04", "MP-05", "MP-06", "MP-07", "MP-08", "MP-09", "MP-10", "MP-12")]
    sh.letters_table(1010, 100, 640, "letters — middle pocket (mm / deg; inch labels as published)", rows)
    solved["middle"] = {"C1_mm": [m["c1"][0] * 1000, m["c1"][1] * 1000], "C2_mm": [m["c2"][0] * 1000, m["c2"][1] * 1000],
                        "T_mm": [-m["ut"] * 1000, 0.0], "X_mm": [m["end"][0] * 1000, m["end"][1] * 1000],
                        "F_mm": [0.0, -m["fd"] * 1000], "end_deg": math.degrees(m["th_end"]),
                        "closure_mm": derived["closure_middle_mm"], "poke_mm": derived["poke_middle_mm"]}
    mp12 = val(f, "MP-12")
    sh.title_block(f"C4: the reference model reads a {sh.disp(mp12[0])} mm fall width here [MP-12] vs the template fall Ø{sh.disp(2 * m['rf'] * 1000)} — an A4 cammatch measurement, not a kernel edit")
    return sh.finish()


def sheet_section(doc, f, sha, solved, src, derived) -> str:
    sh = Sheet("S3", "steel-block rail stack — transverse section (SCHEMATIC order) + Northern L-profile detail (dimensioned, MFR)",
               doc, sha, "L-profile detail 1 mm = 12 px; stack section 1 mm = 3 px (nominal; do not scale)", src)
    w, h, step, base, fil = val(f, "CU-04"), val(f, "CU-05"), val(f, "CU-06"), val(f, "CU-08"), val(f, "CU-07")
    sh.begin_clip()
    k = 12.0
    x0, y0 = 150, 420
    pts = [(0, 0), (base, 0), (base, h - step), (w, h - step), (w, h), (0, h)]
    d = " ".join(f"{'M' if i == 0 else 'L'} {sh.c(x0 + px * k)} {sh.c(y0 - py * k)}" for i, (px, py) in enumerate(pts)) + " Z"
    sh.path(d, "#111", 2.0, fill="#e9dccb")
    sh.dim(x0, y0 - h * k - 22, x0 + w * k, y0 - h * k - 22, f"CU-04  {sh.disp(w)} ({inch_label(w)})")
    sh.vdim(x0 - 30, y0, y0 - h * k, f"CU-05  {sh.disp(h)} ({inch_label(h)})")
    sh.vdim(x0 + w * k + 30, y0 - (h - step) * k, y0 - h * k, f"CU-06  {sh.disp(step)} ({inch_label(step)})")
    sh.dim(x0, y0 + 24, x0 + base * k, y0 + 24, f"CU-08  {sh.disp(base)} ({inch_label(base)})")
    sh.text(x0 + w * k + 130, y0 - 12, f"CU-07  fillets R {sh.disp(fil)} ({inch_label(fil)} TYP) — applied at every corner, not drawn", 9.5, fill="#333")
    sh.text(x0, 104, "Northern Rubber L-profile — Rasson Magnum II technology sheet, dimensioned drawing (MFR). Orientation as published;", 10.5, weight="600")
    sh.text(x0, 120, "mounting face / nose face follow the block in A2 (the sheet draws the section, not its placement).", 10.5, weight="600")
    sh.text(x0, y0 + 52, f"Datasheet (reference-only, calibration prior, NO kernel field): {val(f, 'CU-11')} [CU-11]; rebound {val(f, 'CU-12')} [CU-12].", 9.5, fill="#7a3a10")
    sh.text(x0, y0 + 66, "Conflict C5: the Rasson Chinese-pool (Englon) sheet prints a different hardness figure for the same drawing (see JSON conflicts).", 9.5, fill="#7a3a10")
    sx, sy, ks = 640, 800, 3.0
    nose_h, cw, slate, plate = val(f, "CU-02"), val(f, "CU-09"), val(f, "RB-06"), val(f, "CU-10")
    rail_top, band = val(f, "CU-16"), val(f, "RB-01")
    def P(u_mm, y_mm):
        return sx + u_mm * ks, sy - y_mm * ks
    sh.text(*P(-150, rail_top + 46), "STEEL-BLOCK RAIL STACK — SCHEMATIC, NOT TO SCALE for dashed elements: ORDER per MFR + fitters; block/cap heights and footprints are NOT registered (O6)", 10.5, weight="600")
    sh.line(*P(-150, 0), *P(band + 20, 0), "#111", 1.2)
    sh.text(*P(-148, -9), "playing surface (cloth top), Y = 0 — playing area to the LEFT", 9, fill="#444")
    sh.rect(*P(-150, 0), (cw + 150) * ks, slate * ks, fill="#d8d8de", stroke="#333", sw=1.0)
    sh.text(*P(-146, -slate + 14), f"slate  RB-06  {sh.disp(slate)} thick ({f['RB-06']['published'][:34]}) — MFR", 9.5)
    sh.line(*P(cw, 0), *P(cw, -slate - 22), "#7a3a10", 0.8, dash="6 4")
    sh.text(*P(cw + 3, -slate - 14), f"slate edge u = CU-09 {sh.disp(cw)}", 8.5, fill="#7a3a10")
    sh.rect(*P(0, nose_h), w * ks, h * ks, fill="none", stroke="#555", sw=1.0, dash="4 3")
    sh.text(*P(0, nose_h + 14), "schematic: L-profile envelope w × h (CU-04 × CU-05), nose face at u = 0, top at the kernel nose — placement NOT registered", 8.5, fill="#555")
    px0, px1 = w, band
    sh.rect(*P(px0, plate), (cw - px0) * ks, plate * ks, fill="none", stroke="#555", sw=1.0, dash="4 3")
    sh.text(*P(px0 + 3, plate + 5), f"schematic: {sh.disp(plate)} mm steel plate [CU-10, MFR thickness] bolted to the slate — footprint NOT registered", 8.5, fill="#555")
    sh.rect(*P(px0, rail_top), (px1 - px0) * ks, (rail_top - plate) * ks, fill="none", stroke="#555", sw=1.0, dash="4 3")
    sh.text(*P(px0 + 3, rail_top - 10), "schematic: softwood block + Adamath cap (RB-04 / RB-05) — heights TO-BE-MEASURED (O6)", 8.5, fill="#555")
    sh.line(*P(px0, rail_top), *P(band, rail_top), "#1d7a38", 1.0, dash="6 3")
    sh.text(*P(band + 4, rail_top + 2), f"rail top CU-16 {sh.disp(rail_top)} (model ESTIMATOR placeholder, TO-BE-MEASURED)", 8.5, fill="#1d7a38")
    sh.line(*P(-150, nose_h), *P(0, nose_h), "#8a1010", 1.2, dash="10 4")
    sh.vdim(P(-130, 0)[0], P(0, 0)[1], P(0, nose_h)[1], f"CU-02  nose {sh.disp(nose_h)} ({sh.disp(val(f, 'CU-03'))} × ball, KERNEL)", horizontal=True)
    for fid, dy in (("CU-14", -4.5), ("CU-15", 3.0)):
        yv = val(f, fid)
        sh.line(*P(-60, yv), *P(0, yv), "#1d7a38", 0.7, dash="3 3")
        sh.text(*P(-62, yv + dy), f"{fid} {sh.disp(yv)} (model, EST)", 8, fill="#1d7a38", anchor="end")
    foot = val(f, "CU-17")
    land_lo = val(f, "CU-14")
    sh.line(*P(foot, 0), *P(0, land_lo), "#1d7a38", 1.0, dash="6 3")
    sh.line(*P(0, land_lo), *P(0, val(f, "CU-15")), "#1d7a38", 1.0, dash="6 3")
    chord_deg = math.degrees(math.atan2(foot, land_lo))
    sh.text(*P(-148, rail_top + 30), f"reference-model face (EST, drawn through the two measured points): foot {sh.disp(foot)} outboard at bed level [CU-17] → land bottom {sh.disp(land_lo)} at u = 0 [CU-14]; "
                                     f"chord {sh.disp(chord_deg)}° vs mid-face fit {sh.disp(val(f, 'CU-13'))}° [CU-13] — residual disclosed; no undercut modelled (C3)", 8.5, fill="#1d7a38")
    sh.dim(*P(0, rail_top + 16), *P(band, rail_top + 16), f"RB-01  rail band nose → outer edge {sh.disp(band)} (from the MFR envelope)")
    sh.end_clip()
    rows = [row_of(sh, f, fid) for fid in ("CU-01", "CU-02", "CU-03", "CU-04", "CU-05", "CU-06", "CU-07", "CU-08", "CU-09", "CU-10", "CU-11", "CU-12", "CU-13", "CU-14", "CU-15", "CU-16", "CU-17", "RB-04", "RB-06")]
    sh.letters_table(1010, 100, 640, "letters — cushion / rail stack", rows)
    solved["section"] = {"nose_mm": nose_h, "slate_mm": slate, "plate_mm": plate, "rail_top_est_mm": rail_top, "band_mm": band,
                         "model_face_foot_mm": foot, "model_face_chord_deg": chord_deg, "l_profile_mm": {"w": w, "h": h, "step": step, "base": base, "fillet": fil}}
    sh.title_block("PARAMETER, NOT MECHANISM: the steel block appears as construction order and per-table calibration priors only — no runtime structural model (PLAN kernel decision 2)")
    return sh.finish()


def wrap(text: str, budget: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for wd in words:
        if len(cur) + len(wd) + 1 > budget and cur:
            lines.append(cur)
            cur = wd
        else:
            cur = (cur + " " + wd).strip()
    if cur:
        lines.append(cur)
    return lines


def sheet_envelope(doc, f, sha, solved, src, derived) -> str:
    sh = Sheet("S4", "envelope — plan and elevation (SCHEMATIC placeholders dashed), conflict ledger, open items", doc, sha,
               "plan and elevation 1 mm = 0.20 px (nominal; do not scale)", src)
    L, W = val(f, "EN-01")
    pl, pw = val(f, "PF-01")
    kp = 0.20
    ox, oy = 150, 200
    def Q(x_mm, z_mm):
        return ox + (x_mm + L / 2) * kp, oy + (z_mm + W / 2) * kp
    sh.begin_clip()
    sh.rect(*Q(-L / 2, -W / 2), L * kp, W * kp, fill="#f2efe6", stroke="#111", sw=1.4)
    sh.rect(*Q(-3570 / 2, -1778 / 2), 3570 * kp, 1778 * kp, fill="#cfe3cf", stroke="#1d7a38", sw=1.0)
    sh.rect(*Q(-pl / 2, -pw / 2), pl * kp, pw * kp, fill="none", stroke="#8a1010", sw=1.0, dash="6 3")
    sh.text(*Q(-pl / 2 + 90, -pw / 2 + 95), f"PF-01 kernel {sh.disp(pl)} × {sh.disp(pw)} (dashed) — MFR print 3570 × 1778 (green): C1", 9.5, fill="#8a1010")
    sh.dim(*Q(-L / 2, W / 2 + 60), *Q(L / 2, W / 2 + 60), f"EN-01  {sh.disp(L)}", off=0)
    sh.vdim(Q(L / 2 + 50, 0)[0], Q(0, W / 2)[1], Q(0, -W / 2)[1], f"EN-01  {sh.disp(W)}")
    sh.dim(*Q(-L / 2, -W / 2 - 40), *Q(-3570 / 2, -W / 2 - 40), f"RB-01 {sh.disp(val(f, 'RB-01'))}", off=0, size=8.5)
    sh.vdim(Q(-L / 2 - 40, 0)[0], Q(0, -1778 / 2)[1], Q(0, -W / 2)[1], f"RB-02 {sh.disp(val(f, 'RB-02'))}", size=8.5)
    c = derived["corner"]
    m = derived["middle"]
    cw = c["cw"] * 1000
    for sx_ in (-1, 1):
        for sz_ in (-1, 1):
            p = Q(sx_ * (pl / 2 + cw), sz_ * (pw / 2 + cw))
            sh.circle(p[0], p[1], c["rf"] * 1000 * kp, "#8a1010", 0.9)
        p = Q(0, sx_ * (pw / 2 + m["fd"] * 1000))
        sh.circle(p[0], p[1], m["rf"] * 1000 * kp, "#8a1010", 0.9)
    sh.text(*Q(-L / 2, W / 2 + 130), f"plan — official envelope over the kernel playfield; kernel fall discs drawn (corner R{sh.disp(c['rf'] * 1000)} on the slate-edge intersection, middle R{sh.disp(m['rf'] * 1000)}); 5-pc slate split and leg positions: O6 (TO-BE-MEASURED)", 9.5, fill="#333")
    ke = 0.20
    ex, ey = 150, 1010
    H = val(f, "EN-02")
    bed = val(f, "EN-03")
    def E(x_mm, y_mm):
        return ex + (x_mm + L / 2) * ke, ey - y_mm * ke
    sh.line(*E(-L / 2 - 80, 0), *E(L / 2 + 80, 0), "#111", 1.2)
    sh.text(E(L / 2 + 80, 0)[0] + 6, E(0, 0)[1] + 3, "floor", 9, fill="#444")
    sh.rect(*E(-L / 2, H), L * ke, (H - bed) * ke, fill="none", stroke="#555", sw=1.0, dash="4 3")
    sh.line(*E(-L / 2, bed), *E(L / 2, bed), "#1d7a38", 1.0, dash="6 3")
    sh.text(E(L / 2, bed)[0] + 8, E(L / 2, bed)[1] + 14, f"bed EN-03 {sh.disp(bed)} above floor (model ESTIMATOR placeholder)", 8.5, fill="#1d7a38")
    sh.text(E(L / 2, H)[0] + 8, E(L / 2, H)[1] - 4, f"rail top EN-02 {sh.disp(H)} (MFR; C2 vs WPBSA 851–876) — stack residual EN-08 {sh.disp(val(f, 'EN-08'))}: ({sh.disp(H)} − bed) vs model rail-top CU-16, catalog rounding", 8.5, fill="#333")
    for i in range(3):
        xx = -L / 2 + 220 + i * (L - 440) / 2
        sh.rect(*E(xx - 60, bed), 120 * ke, bed * ke, fill="none", stroke="#555", sw=0.9, dash="4 3")
    sh.text(*E(-L / 2, -80), "schematic placeholders (dashed): 6 tapered aluminium-alloy legs (EN-04) and the cabinet band — positions, widths, skirt depth NOT registered (O6)", 8.5, fill="#555")
    sh.vdim(E(-L / 2 - 30, 0)[0], E(0, 0)[1], E(0, H)[1], f"EN-02  {sh.disp(H)}")
    sh.end_clip()
    yb = 100
    lines: list[tuple[str, float, str | None, str, float]] = []  # (text, size, weight, fill, advance)
    lines.append(("conflict ledger (MEASUREMENTS §7 ↔ this sheet) — complete, never truncated", 11, "700", "#0a2a6a", 19))
    for cf in doc["conflicts"]:
        for j, ln in enumerate(wrap(f"{cf['id']}: {cf['name']} → {cf['adjudication']}", 118)):
            lines.append((ln, 8.2, "600" if j == 0 else None, "#111", 11))
        lines.append(("", 1, None, "#111", 3))
    lines.append(("open items (JSON open_items; owner wave in brackets)", 11, "700", "#0a2a6a", 19))
    for oi in doc["open_items"]:
        tag = f" — {oi['status']}" if oi.get("status") else ""
        for ln in wrap(f"{oi['id']} ({oi['owner_wave']}): {oi['item']}{tag}", 118):
            lines.append((ln, 8.0, None, "#1d7a38" if oi.get("status", "").startswith("CLOSED") else "#111", 10.5))
    box_h = 17 + sum(adv for _t, _s, _w, _f, adv in lines) + 6
    sh.rect(1010, yb, 640, box_h, fill="#fbf9f2", stroke="#4a6a8a", sw=0.9)
    yy = yb + 17
    for txt, size, weight, fill, adv in lines:
        if txt:
            sh.text(1020, yy, txt, size, weight=weight, fill=fill)
        yy += adv
    rows = [row_of(sh, f, fid) for fid in ("PF-01", "EN-01", "EN-02", "EN-03", "EN-08", "RB-01", "RB-02", "RB-03", "EN-04", "EN-05", "EN-06", "PK-01", "PK-02")]
    table_y = yb + box_h + 16
    if table_y + 24 + 16 * len(rows) + 8 > sh.H - 140:
        raise AssertionError("S4: ledger + letters table overrun the title block — shorten the JSON ledger text or split the sheet")
    sh.letters_table(1010, table_y, 640, "letters — envelope / furniture", rows)
    solved["envelope"] = {"overall_mm": [L, W], "height_mm": H, "bed_est_mm": bed, "bands_mm": [val(f, "RB-01"), val(f, "RB-02")]}
    sh.title_block("kernel playfield is the wpbsa_snooker_12ft literal 3569 × 1778 (discipline kind-lock) — the alias never 'corrects' it to the manufacturer's 3570")
    return sh.finish()


def stroke_suite_stub(doc: dict) -> dict:
    return {"status": "SKIPPED (STUB)", "reason": doc["stroke_suite"]["note"]}


# ---------------------------------------------------------------- main


def generate(source_path: Path) -> tuple[dict[str, str], dict]:
    doc, sha, _raw = load_source(source_path)
    resolved = source_path.resolve()
    try:
        src = resolved.relative_to(repo_root()).as_posix()
    except ValueError:
        src = str(resolved)
    # review review round 3: feature_map() dereferenced doc["features"] before any named check could
    # run, so a gutted --input died with a KeyError/TypeError instead of a named STRUCTURE refusal.
    if not isinstance(doc, dict) or not isinstance(doc.get("features"), list):
        raise AssertionError("identity check FAILED: STRUCTURE top-level `features` — the canonical JSON must be an "
                             f"object carrying a `features` list, got {type(doc.get('features') if isinstance(doc, dict) else doc).__name__}")
    bad = [i for i, ft in enumerate(doc["features"]) if not (isinstance(ft, dict) and isinstance(ft.get("id"), str))]
    if bad:
        raise AssertionError(f"identity check FAILED: STRUCTURE features — entries {bad[:6]} are not objects with a string `id`")
    features = feature_map(doc)
    solved: dict = {}
    checks: list[tuple[str, bool, str]] = []
    derived = run_checks(doc, features, checks)
    sheets = {
        "s1-corner": sheet_corner(doc, features, sha, solved, src, derived),
        "s2-middle": sheet_middle(doc, features, sha, solved, src, derived),
        "s3-rail-stack-section": sheet_section(doc, features, sha, solved, src, derived),
        "s4-envelope-elevation": sheet_envelope(doc, features, sha, solved, src, derived),
    }
    rev = doc["doc"]["revision"]
    slug = doc["doc"].get("drawing_slug", "rmagnum")
    files = {f"pocket-drawing-{slug}-{rev}-{name}.svg": svg for name, svg in sheets.items()}
    twin = {
        "id": f"gh{slug}-solved-{rev}",
        "generator": GENERATOR_ID,
        "source": src,
        "source_sha256": sha,
        "doc": doc["doc"],
        "kernel_pinning": doc["kernel_pinning"],
        "kernel_pins_code": {k: (list(v) if isinstance(v, tuple) else v) for k, v in KERNEL_PINS.items()},
        "tolerances_code": {"tol_m": TOL_M, "tol_rad": TOL_RAD},
        "derived": {"closure_corner_mm": derived["closure_corner_mm"], "closure_middle_mm": derived["closure_middle_mm"], "poke_middle_mm": derived["poke_middle_mm"]},
        "solved": solved,
        "checks": [{"name": n, "pass": ok, "detail": d} for n, ok, d in checks],
        "stroke_suite": stroke_suite_stub(doc),
        "sheets": sorted(files),
    }
    files[f"gh{slug}-solved-{rev}.json"] = json.dumps(twin, ensure_ascii=False, indent=1) + "\n"
    return files, twin


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--input", type=Path, default=repo_root() / DEFAULT_SOURCE)
    parser.add_argument("--output-dir", type=Path, help="required unless --stroke-suite")
    parser.add_argument("--check", action="store_true", help="regenerate and byte-compare against --output-dir")
    parser.add_argument("--stroke-suite", action="store_true", help="report the stroke-suite hook status (declared stub)")
    args = parser.parse_args()
    if args.stroke_suite:
        doc, _sha, _raw = load_source(args.input)
        report = stroke_suite_stub(doc)
        print(f"[stroke-suite] {report['status']} — {report['reason']}")
        return 0
    if args.output_dir is None:
        parser.error("--output-dir is required unless --stroke-suite")
    # OX-A1 r3/r4 hygiene, applied to this generator too: the sheet set is a Drive artifact — an
    # --output-dir inside the repository tree is refused outright.
    if args.output_dir.resolve().is_relative_to(repo_root().resolve()):
        parser.error(f"--output-dir {args.output_dir} lies inside the repository tree ({repo_root()}); "
                     f"use an absolute path outside the repo, e.g. /tmp/rmag-sheets")
    files, twin = generate(args.input)
    for entry in twin["checks"]:
        print(f"[check] {entry['name']}: {'PASS' if entry['pass'] else 'FAIL'} — {entry['detail']}")
    print(f"[stroke-suite] {twin['stroke_suite']['status']}")
    if args.check:
        stale = [name for name, content in files.items()
                 if not (args.output_dir / name).exists() or (args.output_dir / name).read_bytes() != content.encode("utf-8")]
        if stale:
            print(f"[check] STALE outputs: {', '.join(sorted(stale))}", file=sys.stderr)
            return 1
        print(f"[check] {len(files)} outputs byte-identical")
        return 0
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, content in sorted(files.items()):
        data = content.encode("utf-8")
        (args.output_dir / name).write_bytes(data)
        print(f"[write] {args.output_dir / name} ({len(data)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
