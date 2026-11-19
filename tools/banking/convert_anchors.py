# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Convert the banking-anchors catalog (banking_systems.json, format
"openbilliards.anchors.banking_systems.v1") into the flat harness schema
consumed by report.py ("openbilliards.banking-anchors.v1", README.md).

Frame conversion (the integration-critical part). TP B.27 p.2-3 pins the
through-diamond geometry: each (aim, meas) pair is a BANK REFERENCE LINE
TO THE CORNER -- the sliding ball travels from opposite-rail crossing
`meas` through banking-rail aim point `aim` (both through-diamond numbers,
diamond lines sitting d = 4.25/12.5 diamonds outside the rail grooves,
grooves w = 48.25/12.5 diamonds apart), banks, and returns to the corner
(groove origin). Hence, converting a pair to groove coordinates
    a = aim + (meas - aim) * d / (w + 2d)   (banking-rail groove crossing)
    b = meas - (meas - aim) * d / (w + 2d)  (opposite-rail groove crossing)
gives incidence tan_in = (b - a)/w and rebound tan_out = a/w, i.e.
tan_ratio = a/(b - a) ~= 1/1.2 = 0.833 for Dr. Dave's 2.2x groove fit:
real sliding banks rebound SHORT of mirror, and "larger meas = shorter"
holds. Comparing raw through-diamond meas numbers against measure.py's
center-line crossing (where mirror = 2*aim by construction) is a frame
error that grows with aim; this converter emits
  - bank_response anchors: (incidence, tan_ratio) interpolated onto the
    measured grid angles (state stun, fast speed, right rail);
  - tp_b28_through_diamond anchors re-expressed in measure.py's own
    center-line frame: expected = aim*(1 + tan_ratio(incidence(aim))).
Tolerances propagate the +-0.25-diamond brand-agnostic window from the
tp_b28 anchor through the same conversion.

Also mapped: drdave_kick_sidespin_diamond_offsets_xref -> kick_lengthwise.
All other anchors pass through with their original kind so report.py lists
them as skipped (ordinal/model anchors are evaluated narratively in
the internal banking report).

Usage: python convert_anchors.py --anchors banking_systems.json --out FILE
"""

import argparse
import json
import math

FMT_IN = "openbilliards.anchors.banking_systems.v1"
FMT_OUT = "openbilliards.banking-anchors.v1"
D_GROOVE = 4.25 / 12.5  # diamond line to rail groove [diamonds] (TP B.27)
W_GROOVE = 48.25 / 12.5  # groove-to-groove width [diamonds] (TP B.27)
MEAS_TOL = 0.25  # brand-agnostic window on meas [diamonds] (tp_b28 anchor)
GRID_ANGLES = (15.0, 30.0, 45.0)  # measured grid angles inside TP coverage
SPEED = 4.0  # TP conditions: "fast" sliding
BALL_R = 0.028575
DIAMOND = 0.3175
WC = 1.27 - 2 * BALL_R  # measure.py center-line width


def line_point(aim, meas):
    """(incidence_deg, tan_ratio) of one through-diamond reference line."""
    frac = (meas - aim) * D_GROOVE / (W_GROOVE + 2 * D_GROOVE)
    a, b = aim + frac, meas - frac
    tan_in = (b - a) / W_GROOVE
    return math.degrees(math.atan(tan_in)), a / (b - a)


def interp(pts, x):
    """Piecewise-linear y(x) over sorted (x, y) pts, clamped at the ends."""
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


def curves(aims, meas):
    """(incidence -> tan_ratio) curve plus its +-MEAS_TOL envelope."""
    mid = sorted(line_point(x, y) for x, y in zip(aims, meas))
    lo = sorted(line_point(x, y - MEAS_TOL) for x, y in zip(aims, meas))
    hi = sorted(line_point(x, y + MEAS_TOL) for x, y in zip(aims, meas))
    return mid, lo, hi


def prov(anchor, extra=""):
    src = anchor.get("source", {})
    return (f"{anchor['id']} [{anchor.get('confidence', '?')}] "
            f"{src.get('title', '')} ({src.get('url', '')}). "
            f"{anchor.get('rule', '')}{extra}")


def conv_bank(anchor, aims, meas, suffix=""):
    mid, lo, hi = curves(aims, meas)
    pts = []
    for th in GRID_ANGLES:
        r = interp(mid, th)
        tol = max(abs(interp(lo, th) - r), abs(interp(hi, th) - r))
        pts.append({"rail": "right", "state": "stun", "speed": SPEED,
                    "incidence_deg": th, "tan_ratio": round(r, 4),
                    "tol": round(tol, 4)})
    return {"id": anchor["id"] + suffix + "__tan_ratio",
            "kind": "bank_response",
            "provenance": prov(anchor, " [converted to groove-frame "
                                        "(incidence, tan_ratio) per TP B.27 "
                                        "p.2-3 corner-reference-line "
                                        "geometry; see convert_anchors.py]"),
            "points": pts}


def conv_ladder(anchor, aims, meas, suffix=""):
    mid, lo, hi = curves(aims, meas)
    pts = []
    for aim in aims:
        th = math.degrees(math.atan(aim * DIAMOND / WC))
        r = interp(mid, th)
        tol = max(aim * abs(interp(lo, th) - r),
                  aim * abs(interp(hi, th) - r), 0.3)
        pts.append({"aim": aim, "meas": round(aim * (1.0 + r), 3),
                    "tol": round(tol, 3)})
    return {"id": anchor["id"] + suffix + "__centerline",
            "kind": "tp_b28_through_diamond",
            "provenance": prov(anchor, " [expected values re-expressed in "
                                        "measure.py's center-line frame: "
                                        "meas = aim*(1 + tan_ratio); see "
                                        "convert_anchors.py]"),
            "points": pts}


def convert(cat):
    if cat.get("format") != FMT_IN:
        raise ValueError(f"expected {FMT_IN!r}, got {cat.get('format')!r}")
    out = []
    for a in cat["anchors"]:
        t = a.get("table", {})
        if a["id"] == "tp_b27_sliding_bank_reference_line":
            aims = t["aim_through_diamond_on_banking_rail"]
            meas = t["cue_crosses_opposite_rail_diamond"]
            out.append(conv_bank(a, aims, meas))
            out.append(conv_ladder(a, aims, meas))
        elif a["id"] == "tp_b28_five_table_sliding_bank_comparison":
            aims = t["aim_through_diamond_on_banking_rail"]
            for name, meas in t["measured_opposite_rail_crossing"].items():
                out.append(conv_bank(a, aims, meas, suffix="__" + name))
                out.append(conv_ladder(a, aims, meas, suffix="__" + name))
        elif a["id"] == "drdave_kick_sidespin_diamond_offsets_xref":
            out.append({
                "id": a["id"], "kind": "kick_lengthwise",
                "provenance": prov(a),
                "points": [{"english_fraction": f, "diamonds": d, "tol": 0.3}
                           for f, d in zip(t["english_fraction"],
                                           t["cross_table_change_diamonds"])],
            })
        else:
            out.append({"id": a["id"], "kind": a["kind"],
                        "provenance": prov(a), "points": []})
    return {"format": FMT_OUT,
            "note": f"generated by convert_anchors.py from {FMT_IN}",
            "anchors": out}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--anchors", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    with open(args.anchors) as f:
        cat = json.load(f)
    with open(args.out, "w") as f:
        json.dump(convert(cat), f, indent=1, sort_keys=True)
    print(f"[convert] wrote {args.out}")


if __name__ == "__main__":
    main()
