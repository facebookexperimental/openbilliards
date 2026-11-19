# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Matched-pair reverse-vs-running observable ratios (issue #18 Phase 1a).

Consumes out/measurements/<clip>.json from measure_pairs.py and emits
out/pair_ratios.json + out/pair_ratios.md with:

  * per-clip conditions, incident/rebound angle, speed ratio, e_n,
    tangential ratio, mu_eff (translational impulse ratio
    |J_t|/|J_n| = (vt_in - vt_out) / (vn_in + vn_out) -- a LOWER bound on
    contact mu when slip is not gross throughout), all with 1-sigma
    track-jitter errors;
  * per-pair reverse/running ratios of speed ratio, e_n, rebound angle;
  * the along-rail A.68-71 quartet as tangential-only rows with a
    blob-radius depth-drift systematic (raw + radius-corrected ratio).

Usage: python3 pair_tables.py out
"""

import csv
import json
import math
import os
import sys

import numpy as np

PAIRS = [
    ("P-fast-angled", "HSV6-6", "HSV6-7", "bank ~28deg from normal, fast"),
    ("P-slow-angled", "HSV6-8", "HSV6-9", "bank ~24deg from normal, slow"),
    ("P-med-angled", "HSV6-11", "HSV6-12", "kick ~28deg from normal, medium"),
    ("P-small-angle", "HSVA-27", "HSVA-28", "small-angle kick, medium (theta_in mismatch 19.5 vs 11.9 deg)"),
    ("P-largeangle-slow", "HSVA-70", "HSVA-68", "large-angle kick, slow -- ALONG-RAIL VIEW, tangential channel only"),
    ("P-largeangle-fast", "HSVA-71", "HSVA-69", "large-angle kick, fast -- ALONG-RAIL VIEW, FAILED VALIDATION (mutually inconsistent depth drift; excluded from verdict)"),
]

FAILED_PAIRS = {"P-largeangle-fast"}

STRAIGHT_IN = ["HSV6-10", "HSVA-26"]
ALONG_RAIL = {"HSVA-68", "HSVA-69", "HSVA-70", "HSVA-71"}


def load(out_dir, cid):
    return json.load(open(os.path.join(out_dir, "measurements", cid + ".json")))


def mu_eff(m):
    """|J_t|/|J_n| from translational velocity jumps, with 1-sigma."""
    dvt = m["vt_in_pxcf"] - m["vt_out_pxcf"]
    s_dvt = math.hypot(m["vt_in_sigma_pxcf"], m["vt_out_sigma_pxcf"])
    dvn = m["vn_in_pxcf"] + m["vn_out_pxcf"]
    s_dvn = math.hypot(m["vn_in_sigma_pxcf"], m["vn_out_sigma_pxcf"])
    mu = abs(dvt) / dvn
    s = mu * math.hypot(s_dvt / max(abs(dvt), 1e-9), s_dvn / dvn)
    return mu, s


def ratio(a, sa, b, sb):
    r = a / b
    return r, abs(r) * math.hypot(sa / abs(a), sb / abs(b))


def window_radius(out_dir, cid, meas, pre, post):
    """Mean blob radius over the pre/post fit windows (depth-scale proxy for
    the along-rail clips; stripe modulation averages out over the window)."""
    rows = list(csv.DictReader(open(os.path.join(out_dir, "tracks", cid + ".csv"))))
    area = np.array([float(r["blob_area_px"]) if r["blob_area_px"] else np.nan for r in rows])
    xok = np.array([bool(r["x_px"]) for r in rows])
    area[~xok] = np.nan
    apex = meas["apex_frame"]
    w_in = area[max(0, apex - pre[0] - pre[1]): apex - pre[0]]
    w_out = area[apex + post[0]: apex + post[0] + post[1]]
    out = []
    for w in (w_in, w_out):
        w = w[~np.isnan(w)]
        r = np.sqrt(w / math.pi)
        out.append((float(r.mean()), float(r.std() / max(len(r), 1) ** 0.5)))
    return out  # [(r_in, se), (r_out, se)]


# fit windows (must match measure_pairs.py CONFIG)
WINDOWS = {
    "HSVA-68": ((10, 90), (10, 90)),
    "HSVA-69": ((8, 35), (8, 60)),
    "HSVA-70": ((10, 90), (10, 90)),
    "HSVA-71": ((8, 35), (8, 60)),
}


def clip_row(out_dir, cid):
    rec = load(out_dir, cid)
    m = rec["measured"]
    mm = rec["mm_per_px"]
    row = {
        "clip": cid,
        "spin": rec["conditions"]["spin"],
        "speed": rec["conditions"]["speed"],
        # nominal m/s: exact for A-series (OSD time base); for 6.x assumes
        # 1000 fps capture (duplicated encodes may be 500 fps captures) and
        # ball-blob scale is +/-15% -- ratios are immune, absolutes are not.
        "vn_in_mps_nominal": None if mm is None else round(m["vn_in_pxcf"] * mm, 2),
        "theta_in_deg": [m["theta_in_deg"], m["theta_in_sigma_deg"]],
        "theta_out_deg": [m["theta_out_deg"], m["theta_out_sigma_deg"]],
        "speed_ratio": [m["speed_ratio"], m["speed_ratio_sigma"]],
        "e_n": [m["e_n"], m["e_n_sigma"]],
        "tangential_ratio": [m["tangential_ratio"], m["tangential_ratio_sigma"]],
        "v_in_mps": m.get("v_in_mps"),
        "time_base": rec["time_base"],
        "qc": rec["qc"],
    }
    mu, s = mu_eff(m)
    row["mu_eff"] = [round(mu, 4), round(s, 4)]
    if cid in ALONG_RAIL:
        (ri, sri), (ro, sro) = window_radius(out_dir, cid, m, *WINDOWS[cid])
        row["blob_radius_in_px"] = [round(ri, 2), round(sri, 2)]
        row["blob_radius_out_px"] = [round(ro, 2), round(sro, 2)]
        # transverse velocity scales as 1/r (pinhole): corrected out/in ratio
        tr, str_ = m["tangential_ratio"], m["tangential_ratio_sigma"]
        corr = ri / ro
        s_corr = corr * math.hypot(sri / ri, sro / ro)
        row["tangential_ratio_radius_corrected"] = [
            round(tr * corr, 4),
            round(abs(tr * corr) * math.hypot(str_ / abs(tr), s_corr / corr), 4),
        ]
        row["depth_drift_note"] = (
            "blob radius drift in->out %.1f%% (transverse-scale systematic)"
            % ((corr - 1) * 100)
        )
    return row


def fmt(v, s, nd=3):
    return "%.*f +/- %.*f" % (nd, v, nd, s)


def main(out_dir):
    result = {"pairs": [], "straight_in": []}
    lines = ["# Matched-pair reverse/running observable ratios", ""]
    lines += ["Per-clip 1-sigma errors from linear-fit residuals (track jitter).",
              "mu_eff = (vt_in - vt_out)/(vn_in + vn_out): translational impulse",
              "ratio, lower bound on slipping-contact mu.", ""]
    for pid, rev_id, run_id, desc in PAIRS:
        rev, run = clip_row(out_dir, rev_id), clip_row(out_dir, run_id)
        along = rev_id in ALONG_RAIL
        pair = {"pair": pid, "description": desc, "reverse": rev, "running": run}
        key = "tangential_ratio" if along else "speed_ratio"
        r, s = ratio(rev[key][0], rev[key][1], run[key][0], run[key][1])
        pair["rev_over_run_" + key] = [round(r, 4), round(s, 4)]
        if not along:
            re_, se_ = ratio(rev["e_n"][0], rev["e_n"][1], run["e_n"][0], run["e_n"][1])
            pair["rev_over_run_e_n"] = [round(re_, 4), round(se_, 4)]
            pair["rebound_angle_shift_deg"] = [
                round(rev["theta_out_deg"][0] - run["theta_out_deg"][0], 2),
                round(math.hypot(rev["theta_out_deg"][1], run["theta_out_deg"][1]), 2),
            ]
        else:
            rc, sc = ratio(
                rev["tangential_ratio_radius_corrected"][0],
                rev["tangential_ratio_radius_corrected"][1],
                run["tangential_ratio_radius_corrected"][0],
                run["tangential_ratio_radius_corrected"][1],
            )
            pair["rev_over_run_tangential_ratio_radius_corrected"] = [round(rc, 4), round(sc, 4)]
        result["pairs"].append(pair)
        if pid in FAILED_PAIRS:
            pair["failed_validation"] = True
        lines.append("## %s -- %s" % (pid, desc))
        lines.append("")
        lines.append("| clip | spin | theta_in | theta_out | vn_in m/s (nominal) | speed ratio | e_n | tangential ratio | mu_eff |")
        lines.append("|---|---|---|---|---|---|---|---|---|")
        for c in (rev, run):
            lines.append("| %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
                c["clip"], c["spin"],
                fmt(*c["theta_in_deg"], nd=1), fmt(*c["theta_out_deg"], nd=1),
                c["vn_in_mps_nominal"],
                fmt(*c["speed_ratio"]), fmt(*c["e_n"]),
                fmt(*c["tangential_ratio"]), fmt(*c["mu_eff"]),
            ))
        lines.append("")
        for k, v in pair.items():
            if k.startswith("rev_over_run") or k == "rebound_angle_shift_deg":
                lines.append("- **%s** = %s" % (k, fmt(*v)))
        if along:
            for c in (rev, run):
                lines.append("- %s radius in->out: %s -> %s px (%s)" % (
                    c["clip"], fmt(*c["blob_radius_in_px"], nd=1),
                    fmt(*c["blob_radius_out_px"], nd=1), c["depth_drift_note"]))
            lines.append("- ALONG-RAIL CAVEAT: angles/e_n non-physical; tangential ratio only, depth-drift systematic of the same order as the contrast.")
        lines.append("")
    lines.append("## Straight-in (near-normal incidence) sidespin probes")
    lines.append("")
    lines.append("| clip | theta_in | theta_out | speed ratio | e_n | mu_eff | v_in m/s (nominal; A-series exact, 6.x if-1000fps) |")
    lines.append("|---|---|---|---|---|---|---|")
    for cid in STRAIGHT_IN:
        c = clip_row(out_dir, cid)
        result["straight_in"].append(c)
        lines.append("| %s | %s | %s | %s | %s | %s | %s |" % (
            c["clip"], fmt(*c["theta_in_deg"], nd=1), fmt(*c["theta_out_deg"], nd=1),
            fmt(*c["speed_ratio"]), fmt(*c["e_n"]), fmt(*c["mu_eff"]),
            c["v_in_mps"]))
    lines.append("")
    json.dump(result, open(os.path.join(out_dir, "pair_ratios.json"), "w"), indent=1)
    open(os.path.join(out_dir, "pair_ratios.md"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main(sys.argv[1])
