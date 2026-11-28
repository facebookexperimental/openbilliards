#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Quarantine grep gate for the D621 alignment tooling: nothing derived from the purchased model may enter the repo.

Default scope (or --paths / --file):
  * tools/render/d621/align/ (recursive)
  * docs/geometry/diamond-proam-8ft-purchased-model-measurements.json
  * tools/render/*.json (our render gate outputs — red-basis, cammatch, fullview, letters, registers, midjaw)

Findings:
  * binary files and forbidden extensions (.obj .npy .npz .png .jpg ... .pyc) inside the repo path
  * numeric arrays longer than 64 numbers (JSON parsed structurally; text files by bracketed runs / long numeric lines),
    except the exact JSON paths in PATH_WHITELIST (our own gate data, never model-derived)
  * ZERO-VERTICES LAW: any JSON list of more than 4 xyz triples (a list of 3-number lists) is a raw vertex list and a
    finding, unless a key on its path ends with _profile / _interp / _by_y / _aabb or contains "profile" (derived
    section / profile rows and AABB records are numbers-only summaries and stay), or the exact path is in PATH_WHITELIST
  * base64 blobs (>= 200 chars of base64 alphabet, or data-URI payloads)
Exit 0 when clean, 1 with a listing otherwise. __pycache__ directories are skipped (git-ignored)."""
import argparse
import glob
import json
import os
import re
import sys

PKG_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(PKG_DIR, "..", "..", "..", ".."))
MEASUREMENTS_JSON = os.path.join(REPO_ROOT, "docs", "geometry", "diamond-proam-8ft-purchased-model-measurements.json")
RENDER_JSON_GLOB = os.path.join(REPO_ROOT, "tools", "render", "*.json")
FORBIDDEN_EXT = {".obj", ".npy", ".npz", ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff", ".webp", ".max", ".fbx", ".glb", ".gltf", ".ply", ".stl", ".bin", ".dae", ".3ds", ".exr", ".hdr", ".psd", ".pyc", ".pkl", ".npy.gz", ".zip", ".tar", ".gz"}
MAX_NUMS = 64
MAX_TRIPLES = 4  # a JSON list of more than this many xyz triples is treated as a raw vertex list
TRIPLE_EXEMPT_SUFFIXES = ("_profile", "_interp", "_by_y", "_aabb")
# Exact JSON paths of long numeric arrays / triple lists that are OUR OWN gate data or derived profiles stored as triples
# (never raw model vertices). Keep this list short and dated; every entry names its producer and its provenance.
PATH_WHITELIST = (
    (re.compile(r"^\.sliceLadder$"),
     "c14 red-basis slice ladder — our own slice schedule (tools/render/c14-red-basis-*.json)"),
    (re.compile(r"^\.ablatedRun\.row\.flanks\.[^.\[\]]+\.gaps$"),
     "midjaw red-basis half-mm bin ladder — check-pocket-construction.mjs --midjaw-red, GH-568 (2026-08-27, predates the purchased model)"),
    (re.compile(r"^\.pins\.render\.bootSection\.section$"),
     "c14 r6 boot section — 14-row 2D section profile stored as [x, z, 0] triples (42 numbers), tools/render/c14-red-basis-488d-r6.json (78238d44, 2026-09-02): a derived profile row table under a key without a profile suffix, not a vertex list"),
)
NUM = r"[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?"
BASE64 = re.compile(r"[A-Za-z0-9+/]{200,}={0,2}")
DATAURI = re.compile(r"data:[\w/+.-]+;base64,", re.I)


def default_paths():
    return [PKG_DIR, MEASUREMENTS_JSON] + sorted(glob.glob(RENDER_JSON_GLOB))


def _is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _is_triple(x):
    return isinstance(x, list) and len(x) == 3 and all(_is_num(v) for v in x)


def _whitelisted(path):
    for rx, why in PATH_WHITELIST:
        if rx.match(path): return why
    return None


def _triple_exempt(keys):
    return any("profile" in k for k in keys) or any(k.endswith(TRIPLE_EXEMPT_SUFFIXES) for k in keys)


def json_findings(obj, path="", keys=()):
    """Yield (kind, path, text): kind is 'fail' or 'whitelisted'. keys = the chain of dict keys down to obj (indices dropped)."""
    if isinstance(obj, dict):
        for k, v in obj.items(): yield from json_findings(v, f"{path}.{k}", keys + (k,))
    elif isinstance(obj, list):
        n = len(obj)
        if n > MAX_NUMS and all(_is_num(x) for x in obj):
            why = _whitelisted(path)
            if why: yield ("whitelisted", path, f"numeric array of {n} > {MAX_NUMS} at {path} allowed: {why}")
            else: yield ("fail", path, f"numeric array of {n} > {MAX_NUMS} at {path}")
        if n > MAX_TRIPLES and all(_is_triple(x) for x in obj) and not _triple_exempt(keys):
            why = _whitelisted(path)
            if why: yield ("whitelisted", path, f"list of {n} xyz triples (> {MAX_TRIPLES}) at {path} allowed: {why}")
            else: yield ("fail", path, f"list of {n} xyz triples (> {MAX_TRIPLES}) at {path} — raw vertex list (zero-vertices law)")
        for i, v in enumerate(obj): yield from json_findings(v, f"{path}[{i}]", keys)


def text_long_arrays(text):
    # bracketed runs (may span lines): count numeric tokens between a '[' or '(' and the matching close
    for m in re.finditer(r"[\[(]([^\[\]()]*)[\])]", text, re.S):
        n = len(re.findall(NUM, m.group(1)))
        if n > MAX_NUMS: yield (text.count("\n", 0, m.start()) + 1, n)
    for i, line in enumerate(text.splitlines(), 1):
        n = len(re.findall(NUM, line))
        if n > MAX_NUMS and len(re.findall(r"[A-Za-z_]{3,}", line)) < n / 4:  # numeric-dominated line
            yield (i, n)


def scan_file(path):
    """Return (issues, allowed): issues fail the gate, allowed are whitelisted long arrays (reported for audit)."""
    issues, allowed = [], []
    ext = os.path.splitext(path)[1].lower()
    if ext in FORBIDDEN_EXT: issues.append(f"forbidden extension {ext}")
    with open(path, "rb") as fh: raw = fh.read()
    if b"\x00" in raw[:65536]: issues.append("binary content (NUL bytes)")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        issues.append("not UTF-8 text"); return issues, allowed
    if BASE64.search(text): issues.append("base64-like blob (>= 200 chars)")
    if DATAURI.search(text): issues.append("data: URI with base64")
    if ext == ".json":
        try:
            for kind, _p, msg in json_findings(json.loads(text)):
                (issues if kind == "fail" else allowed).append(msg)
        except json.JSONDecodeError as e:
            issues.append(f"invalid JSON ({e})")
    else:
        for line, n in text_long_arrays(text): issues.append(f"{n} numbers in one bracket/line near line {line} (> {MAX_NUMS})")
    return issues, allowed


def _label(path):
    rel = os.path.relpath(path, REPO_ROOT)
    return path if rel.startswith("..") else rel


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--paths", nargs="*", default=None, help="files/directories to scan (default: the D621 scope above)")
    ap.add_argument("--file", action="append", default=[], help="scan only this file (repeatable; e.g. a red-arm copy outside the repo)")
    a = ap.parse_args(argv)
    roots = list(a.file) if a.file else (a.paths if a.paths is not None else default_paths())
    files = []
    for root in roots:
        if os.path.isdir(root):
            for dp, dns, fns in os.walk(root):
                dns[:] = [d for d in dns if d != "__pycache__"]
                files += [os.path.join(dp, f) for f in sorted(fns)]
        elif os.path.exists(root):
            files.append(root)
        else:
            print(f"MISSING {root}")
    bad = 0
    for f in files:
        issues, allowed = scan_file(f)
        rel = _label(f)
        if issues:
            bad += 1
            for i in issues: print(f"FAIL {rel}: {i}")
        else:
            print(f"ok   {rel} ({os.path.getsize(f)} bytes)")
        for w in allowed: print(f"     {rel}: whitelisted {w}")
    print(f"\nquarantine check: {len(files)} files scanned, {bad} with findings -> {'FAIL' if bad else 'PASS'}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
