# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Cloth-speed measurement matrix over the kernel cloth presets.

Implements the protocol suite from the cloth-calibration research
(docs/research/cloth-calibration.md) against the venv-built pool_py
(tools/banking README setup), with the CUSHION CONFIGURATION HELD FIXED
(kernel default) across cloth presets so every delta is cloth-only:

  lag_roll     -- E1/E2: free-roll stopwatch lag (u_r recovery, implied 9-ft
                  last-lap seconds, Waldron-stimpmeter diamonds, roll
                  distance at the 1.45 m/s WPA-lag reference speed);
  rail_to_rail -- E3/P1: real center-ball lag shots from the head spot over
                  the TP B.6 speed ladder, total path in table lengths,
                  plus v_4TL (secant: cue speed that travels exactly 4 TL);
  drag_timing  -- E5a: full-draw wear-off time/distance + residual speed;
  sidespin     -- E6: z-spin surviving at the far end of a ~8-diamond roll;
  swerve       -- low-speed elevated-cue swerve sag (lateral drift), the
                  cloth-dependent slow-shot curve.

REGRESSION GATE: the default-cloth row must reproduce the WPA lag anchor
(4-4.5 table lengths at the lag.json reference stroke) -- the harness exits
nonzero otherwise.

Usage: python tools/cloth/measure.py [--out FILE] [--quick]
"""

import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "banking"))

import pool_py as pp

from common import DIAMOND, LENGTH, R, moving_ball, parked_cue, post_of

G = 9.81
LAG_FIXTURE = os.path.join(os.path.dirname(__file__), "..", "..",
                           "crates/pool-core/tests/fixtures/anchors/lag.json")

# Preset id -> SystemState.with_cloth name (kernel ClothPreset::by_name).
CLOTHS = ("default", "simonis_760_fast", "worn_slow", "snooker_napped")


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def clothed(balls, cloth):
    """SystemState on the DEFAULT WPA 9-ft table under a cloth preset."""
    return pp.SystemState(balls).with_cloth(cloth)


def transitions(rec, bid, to=None):
    for e in rec.events():
        if e["kind"] == "transition" and e["ball"] == bid and \
                (to is None or e["to"] == to):
            yield e


def simulate_one(state, shot, opts=None):
    return pp.batch_simulate([(state, shot, opts or pp.SimOptions())])[0]


# --- E1/E2: free-roll stopwatch lag -----------------------------------------

def measure_lag_roll(cloth, v0=0.55):
    """Rolling launch, no cushion contact: stop distance/time -> u_r."""
    start = (-0.45, -1.15)
    ball = moving_ball(1, start, (0.0, v0), roll_frac=1.0)
    cue, shot = parked_cue((0.45, -1.15), math.pi / 2)
    rec = simulate_one(clothed([cue, ball], cloth), shot)
    stop = next(transitions(rec, 1, "stationary"))
    d = post_of(stop, 1)["pos"][1] - start[1]
    t = stop["t"]
    u_r = 2.0 * d / (G * t * t)
    return {
        "cloth": cloth, "launch_speed": v0,
        "roll_distance_m": d, "stop_time_s": t,
        "u_r_recovered": u_r,
        # Jewett last-lap seconds on a 9-ft: t = sqrt(2L/(u_r g)).
        "last_lap_s_9ft": math.sqrt(2.0 * LENGTH / (u_r * G)),
        # Waldron stimpmeter readout: 7 diamonds at u_r_ref = 0.01 (E2).
        "stimp_diamonds": 7.0 * (0.01 / u_r),
        # WPA-lag reference roll: d = v^2/(2 u_r g) at 1.45 m/s.
        "roll_at_1p45_table_lengths": 1.45 ** 2 / (2.0 * u_r * G) / LENGTH,
    }


# --- E3/P1: rail-to-rail lag shots ------------------------------------------

def rail_to_rail_lengths(cloth, cue_v0):
    """Total path (table lengths) of a center-ball lag from the head spot."""
    state = clothed([pp.Ball(0, (0.0, -LENGTH / 4.0))], cloth)
    rec = simulate_one(state, pp.Shot(cue_v0, math.pi / 2))
    path, prev = 0.0, (0.0, -LENGTH / 4.0)
    for e in rec.events():
        for p in e.get("post", []):
            if p["ball"] == 0:
                pos = p["pos"]
                path += math.hypot(pos[0] - prev[0], pos[1] - prev[1])
                prev = pos
    return path / LENGTH


def measure_rail_to_rail(cloth, ladder):
    rows = []
    for v in ladder:
        rows.append({"cloth": cloth, "cue_v0": v,
                     "table_lengths": rail_to_rail_lengths(cloth, v)})
    # v_4TL: secant iteration on cue speed for exactly 4.0 table lengths.
    v = 4.5
    tl = rail_to_rail_lengths(cloth, v)
    for _ in range(8):
        if abs(tl - 4.0) < 0.02:
            break
        v = min(max(v * math.sqrt(4.0 / tl), 0.3), 14.5)
        tl = rail_to_rail_lengths(cloth, v)
    return rows, {"cloth": cloth, "v_4tl": v, "table_lengths": tl}


# --- E5a: drag-shot (full draw) wear-off timing ------------------------------

def measure_drag(cloth, v0=1.5, k=1.0):
    """Sliding launch with backspin k*natural-roll: when does roll set in?"""
    start = (-0.45, -1.15)
    ball = moving_ball(1, start, (0.0, v0), roll_frac=-k)
    cue, shot = parked_cue((0.45, -1.15), math.pi / 2)
    rec = simulate_one(clothed([cue, ball], cloth), shot)
    roll = next(transitions(rec, 1, "rolling"))
    p = post_of(roll, 1)
    return {
        "cloth": cloth, "launch_speed": v0, "backspin_frac": k,
        "wearoff_time_s": roll["t"],
        "wearoff_distance_m": p["pos"][1] - start[1],
        "residual_roll_speed": math.hypot(p["vel"][0], p["vel"][1]),
    }


# --- E6: sidespin persistence over a long roll -------------------------------

def measure_sidespin(cloth, w0=60.0, diamonds=4.0):
    """Rolling launch sized to stop after ~`diamonds` on the DEFAULT cloth,
    with initial z-spin w0: how much side survives at the end of the roll?
    (w0 = 60 rad/s ~ a firm full-english tip; the worsted presets keep
    ~40% of it over this roll while napped snooker cloth loses it all --
    the research's 'worsted holds spin ~2x longer' discriminator.)"""
    v0 = math.sqrt(2.0 * 0.01 * G * diamonds * DIAMOND)
    start = (-0.45, -1.15)
    ball = moving_ball(1, start, (0.0, v0), roll_frac=1.0, side_spin=w0)
    cue, shot = parked_cue((0.45, -1.15), math.pi / 2)
    rec = simulate_one(clothed([cue, ball], cloth), shot)
    # End of translation: rolling -> spinning (side survives) or stationary.
    for e in transitions(rec, 1):
        if e["to"] in ("spinning", "stationary"):
            p = post_of(e, 1)
            return {
                "cloth": cloth, "launch_speed": v0, "side_spin0": w0,
                "roll_end_time_s": e["t"],
                "side_spin_at_roll_end": p["avel"][2],
                "side_retained_frac": p["avel"][2] / w0,
            }
    raise AssertionError("ball 1 never finished its roll")


# --- low-speed swerve sag -----------------------------------------------------

def measure_swerve(cloth, v0=1.2, theta_deg=20.0, a=0.35):
    """Elevated low-speed strike with side: lateral rest offset from the
    aim line (the cloth-dependent slow-shot swerve)."""
    state = clothed([pp.Ball(0, (0.0, -0.9))], cloth)
    shot = pp.Shot(v0, math.pi / 2, theta=math.radians(theta_deg), a=a)
    rec = simulate_one(state, shot)
    stop = None
    for e in transitions(rec, 0, "stationary"):
        stop = e
    assert stop is not None, "cue ball never stopped"
    p = post_of(stop, 0)
    return {
        "cloth": cloth, "cue_v0": v0, "theta_deg": theta_deg, "tip_a": a,
        "rest_lateral_offset_m": p["pos"][0],
        "rest_forward_travel_m": p["pos"][1] + 0.9,
    }


# --- driver -------------------------------------------------------------------

def run_all(quick=False):
    with open(LAG_FIXTURE) as f:
        lag_anchor = json.load(f)
    ladder = (1.34, 4.5) if quick else (0.67, 1.34, 3.13, 4.5, 5.36, 8.94)
    doc = {
        "generated_by": "tools/cloth/measure.py",
        "kernel_version": pp.kernel_version(),
        "quick": quick,
        "cushion": "kernel default (held fixed across cloths)",
        "cloths": list(CLOTHS),
        "lag_roll": [], "rail_to_rail": [], "v_4tl": [],
        "drag_timing": [], "sidespin": [], "swerve": [],
    }
    for cloth in CLOTHS:
        log(f"[cloth] {cloth}")
        doc["lag_roll"].append(measure_lag_roll(cloth))
        rows, v4 = measure_rail_to_rail(cloth, ladder)
        doc["rail_to_rail"] += rows
        doc["v_4tl"].append(v4)
        doc["drag_timing"].append(measure_drag(cloth))
        doc["sidespin"].append(measure_sidespin(cloth))
        doc["swerve"].append(measure_swerve(cloth))

    # REGRESSION GATE: default cloth reproduces the WPA lag anchor.
    tl = rail_to_rail_lengths("default", lag_anchor["cue_v0"])
    doc["wpa_lag_regression"] = {
        "cue_v0": lag_anchor["cue_v0"], "table_lengths": tl,
        "window": [lag_anchor["min_table_lengths"],
                   lag_anchor["max_table_lengths"]],
        "pass": lag_anchor["min_table_lengths"] <= tl
                <= lag_anchor["max_table_lengths"],
    }
    if not doc["wpa_lag_regression"]["pass"]:
        log(f"[cloth] WPA LAG REGRESSION FAILED: {tl:.2f} TL")
        return doc, 1
    log(f"[cloth] WPA lag regression OK: {tl:.2f} TL in "
        f"{doc['wpa_lag_regression']['window']}")
    return doc, 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__),
                                                  "out/measurements.json"))
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()
    doc, rc = run_all(quick=args.quick)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(doc, f, indent=1, sort_keys=True)
    log(f"[cloth] wrote {args.out}")
    for row in doc["lag_roll"]:
        log(f"  {row['cloth']:24s} u_r={row['u_r_recovered']:.4f} "
            f"last-lap={row['last_lap_s_9ft']:.2f}s "
            f"stimp={row['stimp_diamonds']:.1f} "
            f"roll@1.45={row['roll_at_1p45_table_lengths']:.2f}TL")
    sys.exit(rc)


if __name__ == "__main__":
    main()
