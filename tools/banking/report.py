# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Markdown deviation report: model x measurement vs banking anchors.

Anchors are a PARAMETER (--anchors): integration will supply
banking_systems.json from the banking-anchors branch; anchors_selftest.json
(kick.json SC-002 points + Dr. Dave TP B.28) ships here for self-testing.
Schema ("openbilliards.banking-anchors.v1", see README.md):

  {"format": "openbilliards.banking-anchors.v1",
   "anchors": [{"id", "kind", "provenance", "points": [...]}]}

Supported kinds (unknown kinds are listed and skipped, never fatal):
  kick_lengthwise         points: {english_fraction, diamonds, tol}
  tp_b28_through_diamond  points: {aim, meas, tol}
  bank_response           points: {rail, state, speed, incidence_deg,
                                   theta_out_deg | tan_ratio, tol}

Usage: python report.py --measurements out/measurements.json \
                        --anchors anchors_selftest.json [--out out/report.md]
"""

import argparse
import json
import sys

FMT = "openbilliards.banking-anchors.v1"


def fnum(v, nd=3):
    return "-" if v is None else f"{v:.{nd}f}"


def nearest(rows, keys):
    """Row minimizing the summed relative distance over numeric keys and
    mismatch count over string keys; None if rows is empty."""
    best, best_d = None, None
    for r in rows:
        d = 0.0
        for k, want in keys.items():
            got = r.get(k)
            if got is None:
                d += 1e6
            elif isinstance(want, str):
                d += 0.0 if got == want else 1e6
            else:
                d += abs(got - want) / (abs(want) + 1e-9)
        if best_d is None or d < best_d:
            best, best_d = r, d
    return best


def dev_line(preset, label, expected, measured, tol):
    dev = None if measured is None else measured - expected
    verdict = "-"
    if dev is not None and tol is not None:
        verdict = "IN" if abs(dev) <= tol else "OUT"
    return (f"| {preset} | {label} | {fnum(expected)} | {fnum(measured)} "
            f"| {fnum(dev)} | {fnum(tol, 2)} | {verdict} |")


DEV_HEADER = ("| preset | point | expected | measured | deviation | tol | ok |\n"
              "|---|---|---|---|---|---|---|")


def anchor_kick(anchor, meas, out):
    rows = meas.get("kick_lengthwise", [])
    for preset in meas["presets"]:
        prows = [r for r in rows if r["preset"] == preset
                 and r.get("clean") and r["side"] == "right"]
        for p in anchor["points"]:
            r = nearest(prows, {"english_fraction": p["english_fraction"]})
            got = None if r is None else r.get("offset_diamonds")
            out.append(dev_line(preset, f"english {p['english_fraction']:.2f}",
                                p["diamonds"], got, p.get("tol")))


def anchor_tp_b28(anchor, meas, out):
    rows = meas.get("tp_b28", [])
    for preset in meas["presets"]:
        prows = [r for r in rows if r["preset"] == preset and r.get("clean")]
        for p in anchor["points"]:
            r = nearest(prows, {"aim": p["aim"]})
            got = None
            if r is not None and abs(r["aim"] - p["aim"]) < 0.26:
                got = r.get("meas_diamonds")
            out.append(dev_line(preset, f"aim {p['aim']:.1f}",
                                p["meas"], got, p.get("tol")))


def anchor_bank(anchor, meas, out):
    rows = meas.get("bank_response", [])
    for preset in meas["presets"]:
        prows = [r for r in rows if r["preset"] == preset and r.get("clean")]
        for p in anchor["points"]:
            r = nearest(prows, {"rail": p.get("rail", "right"),
                                "state": p["state"],
                                "speed_target": p["speed"],
                                "incidence_deg_target": p["incidence_deg"]})
            key = "tan_ratio" if "tan_ratio" in p else "theta_out_deg"
            mkey = ("tan_ratio_settled" if key == "tan_ratio"
                    else "theta_out_settled_deg")
            got = None
            if r is not None:
                got = r.get(mkey, r.get(mkey.replace("settled", "impact")))
            label = (f"{p['state']} {p['speed']}m/s "
                     f"{p['incidence_deg']:.0f}deg {key}")
            out.append(dev_line(preset, label, p[key], got, p.get("tol")))


ANCHOR_KINDS = {
    "kick_lengthwise": anchor_kick,
    "tp_b28_through_diamond": anchor_tp_b28,
    "bank_response": anchor_bank,
}


def shortening_section(meas, out):
    """Headline: bank shortening vs speed per preset (rolling & stun),
    at the 45-degree incidence grid point: theta_out settled, tan ratio,
    and the delta against the same preset's slowest speed."""
    rows = [r for r in meas.get("bank_response", []) if r.get("clean")
            and abs(r["incidence_deg_target"] - 45.0) < 1e-9]
    out.append("\n## Bank shortening vs speed (45deg incidence)\n")
    out.append("`tan_ratio` = tan(rebound)/tan(incidence) of the settled "
               "roll (1 = mirror; smaller = banks shorter). `d_slow` = "
               "theta_out minus the same preset/state's slowest-speed "
               "value (negative = faster banks shorter). Rows marked "
               "`impact` never settled to a straight roll before the next "
               "contact (fast lengthwise rebounds run out of table); their "
               "angle is the immediate post-impact one and is only "
               "comparable to other `impact` rows.\n")
    out.append("| preset | rail | state | speed m/s | theta_out deg | read "
               "| tan_ratio | d_slow deg |")
    out.append("|---|---|---|---|---|---|---|---|")
    for preset in meas["presets"]:
        for rail in ("right", "foot"):
            for state in ("rolling", "stun"):
                sel = sorted((r for r in rows if r["preset"] == preset
                              and r["rail"] == rail and r["state"] == state),
                             key=lambda r: r["speed_target"])

                def read(r):
                    if "theta_out_settled_deg" in r:
                        return (r["theta_out_settled_deg"],
                                r.get("tan_ratio_settled"), "settled")
                    return (r.get("theta_out_impact_deg"),
                            r.get("tan_ratio_impact"), "impact")

                for r in sel:
                    th, tr, how = read(r)
                    base = [read(b) for b in sel
                            if read(b)[2] == how][0]
                    out.append(f"| {preset} | {rail} | {state} "
                               f"| {r['speed_target']} | {fnum(th, 2)} "
                               f"| {how} | {fnum(tr)} "
                               f"| {fnum(th - base[0], 2)} |")


def spin_section(meas, out):
    out.append("\n## Spin effects on the banked ball "
               "(cross-table 45deg, 2.5 m/s)\n")
    out.append("| preset | spin | theta_out deg | d_theta vs rolling | "
               "rebound speed | d_speed | rebound wz |")
    out.append("|---|---|---|---|---|---|---|")
    for r in meas.get("spin_effects", []):
        if not r.get("clean"):
            continue
        wz = r.get("rebound_avel", [None, None, None])[2]
        out.append(f"| {r['preset']} | {r['spin']} "
                   f"| {fnum(r.get('theta_out_impact_deg'), 2)} "
                   f"| {fnum(r.get('delta_theta_impact_deg'), 2)} "
                   f"| {fnum(r.get('rebound_speed'))} "
                   f"| {fnum(r.get('delta_rebound_speed'))} "
                   f"| {fnum(wz, 1)} |")


def multirail_section(meas, out):
    out.append("\n## Multi-rail kick paths (diamond arrivals per contact)\n")
    out.append("| preset | path | english | contacts (rail@diamond) | "
               "pocketed |")
    out.append("|---|---|---|---|---|")
    for r in meas.get("multirail", []):
        cs = ", ".join(f"{c['rail']}@{c['diamond']:.2f}"
                       + ("(jaw)" if c["jaw"] else "")
                       for c in r["contacts"])
        out.append(f"| {r['preset']} | {r['path']} | {r['english']} "
                   f"| {cs} | {r['pocketed']} |")


def build_report(meas, anchors):
    if anchors.get("format") != FMT:
        raise ValueError(f"anchors format must be {FMT!r}, "
                         f"got {anchors.get('format')!r}")
    out = ["# Banking validation report", ""]
    out.append(f"- kernel: `{meas['kernel_version']}`")
    out.append(f"- grid: `{meas['grid']}`" + (" (quick)" if meas.get("quick")
                                              else ""))
    out.append(f"- presets: {', '.join(meas['presets'])}")
    shortening_section(meas, out)
    spin_section(meas, out)
    multirail_section(meas, out)
    out.append("\n## Anchor deviations\n")
    for anchor in anchors.get("anchors", []):
        out.append(f"### {anchor['id']} ({anchor['kind']})\n")
        prov = anchor.get("provenance", "")
        out.append(f"provenance: {prov}\n")
        fn = ANCHOR_KINDS.get(anchor["kind"])
        if fn is None:
            out.append(f"(kind {anchor['kind']!r} not supported by this "
                       "harness version -- skipped)\n")
            continue
        out.append(DEV_HEADER)
        fn(anchor, meas, out)
        out.append("")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--measurements", default="out/measurements.json")
    ap.add_argument("--anchors", default="anchors_selftest.json")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    with open(args.measurements) as f:
        meas = json.load(f)
    with open(args.anchors) as f:
        anchors = json.load(f)
    text = build_report(meas, anchors)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text)
        print(f"[report] wrote {args.out}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
