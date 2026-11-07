#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""blind_tally_621.py — tally the blind review draws written by blind_review_621.sh.

Reads the jsonl (one line per sheet x draw), prints a markdown table

  pose | vs model: YES/NO counts, majority, most frequent clause
       | vs photo: the same

and a tally line. Majority = at least ceil(draws/2) YES answers, where
`draws` is --draws if given, else the largest draw count seen for any sheet.
Unparsed answers ("?") count as neither YES nor NO and never make a majority.
The judge model / reasoning effort / review version recorded on the lines are
echoed so the table cannot be read without them.

With --compare <b.jsonl> two passes over the same sheets are set side by side
instead: per pose the vs-model / vs-photo majority of each pass (with its YES
count), a FLIP mark where the two majorities differ, and the POOLED verdict
over both passes' draws (YES iff YES answers > half of the pooled draws, e.g.
>= 4 of 6; exactly half = TIE, counted as not-YES). The passes are checked to
cover the same sheets with the same sheet_sha256 and prompt_sha256; a mismatch
is printed, not hidden. --labels names the two passes in the table.

Usage:  blind_tally_621.py <draws.jsonl> [--draws N]
        blind_tally_621.py <a.jsonl> --compare <b.jsonl> [--draws N] [--labels A,B]
"""
import argparse
import collections
import json
import math
import re
import sys


def norm_clause(c):
    c = (c or "").strip().strip(".;:,—–- ").lower()
    c = re.sub(r"\s+", " ", c)
    return c


def top_clause(clauses):
    counts = collections.Counter(norm_clause(c) for c in clauses if norm_clause(c))
    if not counts:
        return "-"
    best = max(counts.values())
    # ties -> the first one seen in draw order
    for c in clauses:
        if counts.get(norm_clause(c)) == best:
            return f"{norm_clause(c)} ({best}x)"
    return "-"


def load(path):
    rows = []
    with open(path) as f:
        for ln, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise SystemExit(f"{path}:{ln}: bad json: {e}")
    if not rows:
        raise SystemExit("no records")
    return rows


def group(rows):
    by_sheet = collections.OrderedDict()
    for r in rows:
        by_sheet.setdefault(r["sheet"], []).append(r)
    return by_sheet


def judge_line(rows):
    judges = sorted({(r.get("model", "unknown"), r.get("reasoning_effort", "unknown"),
                      r.get("review_version", "unknown")) for r in rows})
    return "; ".join(f"model={m} effort={e} review={v}" for m, e, v in judges)


def tally_single(path, draws_arg):
    rows = load(path)
    by_sheet = group(rows)
    draws = draws_arg or max(len(v) for v in by_sheet.values())
    need = math.ceil(draws / 2)

    print(f"judge: " + judge_line(rows))
    print(f"draws/sheet: {draws}  majority = >= {need} YES\n")
    print("| pose | vs model YES/NO/? | majority | top clause (model) | vs photo YES/NO/? | majority | top clause (photo) |")
    print("|---|---|---|---|---|---|---|")

    maj_model = maj_photo = 0
    unparsed = 0
    for sheet, recs in by_sheet.items():
        vm = collections.Counter(r.get("vs_model", "?") for r in recs)
        vp = collections.Counter(r.get("vs_photo", "?") for r in recs)
        unparsed += vm.get("?", 0) + vp.get("?", 0)
        m_maj = "YES" if vm.get("YES", 0) >= need else "NO"
        p_maj = "YES" if vp.get("YES", 0) >= need else "NO"
        maj_model += m_maj == "YES"
        maj_photo += p_maj == "YES"
        cm = top_clause([r.get("clause_model", "") for r in recs])
        cp = top_clause([r.get("clause_photo", "") for r in recs])
        n = len(recs)
        short = f" (only {n} draws)" if n < draws else ""
        print(f"| {sheet}{short} | {vm.get('YES',0)}/{vm.get('NO',0)}/{vm.get('?',0)} | {m_maj} | {cm} "
              f"| {vp.get('YES',0)}/{vp.get('NO',0)}/{vp.get('?',0)} | {p_maj} | {cp} |")

    n = len(by_sheet)
    print(f"\ntally: {n} poses x {draws} draws; vs model majority YES {maj_model}/{n}; "
          f"vs photo majority YES {maj_photo}/{n}; unparsed answers {unparsed}; records {len(rows)}")


def pass_summary(label, path, rows, by_sheet):
    ts = sorted(r.get("ts", "") for r in rows)
    pshas = sorted({r.get("prompt_sha256", "?") for r in rows})
    print(f"pass {label}: {path}  records {len(rows)}  sheets {len(by_sheet)}  "
          f"ts {ts[0]} .. {ts[-1]}  prompt sha256 {','.join(p[:12] for p in pshas)}")


def pooled_verdict(yes, total):
    if 2 * yes > total:
        return "YES"
    if 2 * yes == total:
        return "TIE"
    return "NO"


def compare(path_a, path_b, draws_arg, labels):
    la, lb = labels
    rows_a, rows_b = load(path_a), load(path_b)
    by_a, by_b = group(rows_a), group(rows_b)
    draws = draws_arg or max(len(v) for v in list(by_a.values()) + list(by_b.values()))
    need = math.ceil(draws / 2)
    pooled_n = 2 * draws

    print(f"judge {la}: " + judge_line(rows_a))
    print(f"judge {lb}: " + judge_line(rows_b))
    pass_summary(la, path_a, rows_a, by_a)
    pass_summary(lb, path_b, rows_b, by_b)

    problems = []
    sa, sb = set(by_a), set(by_b)
    if sa != sb:
        problems.append(f"sheet sets differ (only {la}: {sorted(sa - sb)}; only {lb}: {sorted(sb - sa)})")
    for s in sorted(sa & sb):
        if {r.get("sheet_sha256") for r in by_a[s]} != {r.get("sheet_sha256") for r in by_b[s]}:
            problems.append(f"{s}: sheet_sha256 differs between passes")
    if {r.get("prompt_sha256") for r in rows_a} != {r.get("prompt_sha256") for r in rows_b}:
        problems.append("prompt_sha256 differs between passes")
    if problems:
        print("MISMATCH: " + "; ".join(problems))
    else:
        print("passes agree on sheets, sheet_sha256 and prompt_sha256")
    print(f"draws/sheet: {draws}  majority = >= {need} YES; pooled {pooled_n} draws  majority = >= {draws + 1} YES "
          f"({draws}/{pooled_n} = TIE, not YES)\n")

    print(f"| pose | {la} vs model | {lb} vs model | {la} vs photo | {lb} vs photo | flip? "
          f"| pooled vs model (YES/{pooled_n}) | pooled vs photo (YES/{pooled_n}) |")
    print("|---|---|---|---|---|---|---|---|")

    order = list(by_a) + [s for s in by_b if s not in by_a]
    cnt = collections.Counter()
    flips = {"model": [], "photo": []}
    ties = []
    for sheet in order:
        ra, rb = by_a.get(sheet, []), by_b.get(sheet, [])
        cells = []
        pooled_cells = []
        for key, name in (("vs_model", "model"), ("vs_photo", "photo")):
            ya = sum(r.get(key) == "YES" for r in ra)
            yb = sum(r.get(key) == "YES" for r in rb)
            ma = "YES" if ya >= need else "NO"
            mb = "YES" if yb >= need else "NO"
            cnt[(la, name)] += ma == "YES"
            cnt[(lb, name)] += mb == "YES"
            if ma != mb:
                flips[name].append(sheet)
            cells.append((f"{ma} ({ya}/{len(ra)})", f"{mb} ({yb}/{len(rb)})"))
            total = len(ra) + len(rb)
            pv = pooled_verdict(ya + yb, total)
            cnt[("pooled", name)] += pv == "YES"
            if pv == "TIE":
                ties.append(f"{sheet} ({name} {ya + yb}/{total})")
            pooled_cells.append(f"{pv} ({ya + yb}/{total})")
        flip = " ".join(f"FLIP {name}" for name in ("model", "photo") if sheet in flips[name])
        (ma_c, mb_c), (pa_c, pb_c) = cells
        print(f"| {sheet} | {ma_c} | {mb_c} | {pa_c} | {pb_c} | {flip} | {pooled_cells[0]} | {pooled_cells[1]} |")

    n = len(order)
    print(f"\ntally {la}: vs model majority YES {cnt[(la, 'model')]}/{n}; vs photo majority YES {cnt[(la, 'photo')]}/{n}; records {len(rows_a)}")
    print(f"tally {lb}: vs model majority YES {cnt[(lb, 'model')]}/{n}; vs photo majority YES {cnt[(lb, 'photo')]}/{n}; records {len(rows_b)}")
    nflip = len(flips["model"]) + len(flips["photo"])
    print(f"flips: {nflip} (model: {', '.join(flips['model']) or 'none'}; photo: {', '.join(flips['photo']) or 'none'})")
    print(f"pooled (>= {draws + 1} of {pooled_n} YES): vs model {cnt[('pooled', 'model')]}/{n}; "
          f"vs photo {cnt[('pooled', 'photo')]}/{n}; ties: {', '.join(ties) or 'none'}")
    return 1 if problems else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("jsonl")
    ap.add_argument("--draws", type=int, default=None, help="draws per sheet (default: max seen)")
    ap.add_argument("--compare", metavar="B.jsonl", default=None,
                    help="second pass over the same sheets; print the per-pose comparison instead")
    ap.add_argument("--labels", default="A,B", help="names for the two passes in --compare mode (default A,B)")
    args = ap.parse_args()

    if args.compare:
        labels = args.labels.split(",")
        if len(labels) != 2 or not all(labels):
            raise SystemExit("--labels needs two comma-separated names")
        return compare(args.jsonl, args.compare, args.draws, labels)
    tally_single(args.jsonl, args.draws)


if __name__ == "__main__":
    sys.exit(main())
