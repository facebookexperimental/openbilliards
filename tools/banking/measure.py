# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Banking measurement matrices over the four cushion presets.

Produces a JSON document (see README.md for the schema) with:
  (a) bank_response  -- rebound angle vs incidence/speed/contact-state,
      cross-table (right long rail) and lengthwise (foot short rail);
  (b) spin_effects   -- top/draw/running/reverse english on the banked ball;
      kick_lengthwise -- the SC-002 sidespin-kick geometry (kick.json);
  (c) multirail      -- 2/3-rail kick paths with diamond arrival points;
      tp_b28         -- TP B.28 sliding-bank through-diamond replication.

Usage: python measure.py [--out FILE] [--quick]
"""

import argparse
import json
import math
import sys

import pool_py as pp

from common import (DIAMOND, LENGTH, PARK, R, RAILS, WIDTH, calibrate,
                    first_contact, incidence_deg, moving_ball, parked_cue,
                    post_of, presets, rail_of, rebound_deg, settled_after,
                    state_before, table_with)

# Nose-line contact targets (ball-center coordinates), away from pockets.
CONTACT = {"right": (WIDTH / 2 - R, -0.55), "foot": (-0.3175, LENGTH / 2 - R)}
# Approach distance before cushion contact, as a function of launch speed.
# Rolling can use a long run-up (natural roll is the sliding equilibrium);
# labeled-slip states (stun/top/draw/...) must arrive with their slip
# intact, so the approach is speed-PROPORTIONAL (constant ~5 ms flight:
# 5 mm at 1 m/s, 20 mm at 4 m/s). A fixed distance conflates contact
# states: at the old 0.07 m a 1 m/s "stun" ball developed ~1/3 natural
# roll by contact while still labeled "sliding", corrupting every slow
# slip measurement (banking-report.md, contact-state conflation fix).
SLIP_APPROACH_TIME = 0.005  # [s]
APPROACH = {"rolling": lambda v: 0.25,
            "slip": lambda v: SLIP_APPROACH_TIME * v}


def roll_frac_at_contact(f_launch, v_launch, v_contact):
    """Transverse natural-roll fraction wR/v at cushion contact.

    Closed-form sliding kinematics under a flat mu_slide: the signed bed
    slip s = (1 - wR/v)*v obeys s_c = s0 - 3.5*sign(s0)*|v_c - v0| (the
    speed change measures mu*g*t directly, and slip decays 3.5x faster
    than speed), so f_c = 1 - s_c/v_c. Exact while the ball slides the
    whole approach; recovers the launch fraction at zero flight time and
    returns 1.0 once the slip has fully decayed (natural roll)."""
    s0 = (1.0 - f_launch) * v_launch
    if abs(s0) < 1e-12 or v_contact <= 0:
        return 1.0
    sc = s0 - 3.5 * math.copysign(abs(v_contact - v_launch), s0)
    if sc * s0 <= 0:  # slip crossed zero on the way in: rolled up
        return 1.0
    return 1.0 - sc / v_contact


# Contact-state gate: measured wR/v at contact must be within this of the
# labeled launch fraction (binary motion codes cannot see partial roll).
ROLL_FRAC_TOL = 0.05


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def bank_scenario(spec, v_launch):
    """(state, shot, opts) for one explicit-state bank measurement."""
    rail, th = spec["rail"], math.radians(spec["incidence_deg_target"])
    u = (math.cos(th), math.sin(th)) if rail == "right" else (math.sin(th),
                                                              math.cos(th))
    cx, cy = CONTACT[rail]
    a = spec["approach"](v_launch)
    ball = moving_ball(1, (cx - u[0] * a, cy - u[1] * a),
                       (u[0] * v_launch, u[1] * v_launch),
                       roll_frac=spec["roll_frac"],
                       side_spin=spec.get("side_spin_of", lambda v: 0.0)(v_launch))
    pos, phi = PARK[rail]
    cue, shot = parked_cue(pos, phi)
    state = pp.SystemState([cue, ball], table=table_with(spec["response"]))
    return (state, shot, spec["options"])


def arrival_speed(spec, rec):
    """Ball 1 speed just before its first cushion contact (None if dirty)."""
    fc = first_contact(rec, 1)
    if fc is None or fc[1]["kind"] != "ball_linear_cushion":
        return None
    v, _ = state_before(rec, fc[1]["t"], 1)
    return math.hypot(*v)


def bank_row(spec, rec, v_launch):
    """Measure one bank: incidence/rebound angles, speeds, spin, settling."""
    row = {k: spec[k] for k in ("preset", "rail", "geometry", "state",
                                "speed_target", "incidence_deg_target")}
    if "spin" in spec:
        row["spin"] = spec["spin"]
    row["launch_speed"] = v_launch
    fc = first_contact(rec, 1)
    if fc is None or fc[1]["kind"] != "ball_linear_cushion":
        row["clean"] = False
        return row
    idx, e = fc
    v_in, motion_in = state_before(rec, e["t"], 1)
    n_ax, sign, t_ax = RAILS[spec["rail"]]
    tsign = 1.0 if v_in[t_ax] >= 0 else -1.0
    post = post_of(e, 1)
    th_in = incidence_deg(spec["rail"], v_in)
    th_out = rebound_deg(spec["rail"], post["vel"], tsign)
    speed_in = math.hypot(*v_in)
    f_c = roll_frac_at_contact(spec["roll_frac"], v_launch, speed_in)
    row.update({
        # clean gates on the QUANTITATIVE contact state, not the binary
        # motion label (which cannot see partial natural roll).
        "clean": abs(f_c - spec["roll_frac"]) <= ROLL_FRAC_TOL,
        "speed_at_contact": speed_in,
        "roll_frac_at_contact": f_c,
        "motion_at_contact": motion_in,
        "incidence_deg": th_in,
        "theta_out_impact_deg": th_out,
        "rebound_speed": math.hypot(post["vel"][0], post["vel"][1]),
        "rebound_avel": list(post["avel"]),
        "rebound_motion": post["motion"],
    })
    tan_in = math.tan(math.radians(th_in))
    if tan_in > 1e-9:
        row["tan_ratio_impact"] = math.tan(math.radians(th_out)) / tan_in
    settled = settled_after(rec, idx, 1)
    if settled is not None:
        _, v_s, how = settled
        th_s = rebound_deg(spec["rail"], v_s, tsign)
        row["theta_out_settled_deg"] = th_s
        row["settled_how"] = how
        if tan_in > 1e-9:
            row["tan_ratio_settled"] = math.tan(math.radians(th_s)) / tan_in
    return row


def measure_bank_response(preset_map, rails, angles, speeds, states):
    """(a) bank-angle response matrix, speed calibrated at the cushion."""
    specs = []
    for pname, (opts, resp) in preset_map.items():
        for rail in rails:
            for state in states:
                for th in angles:
                    for v in speeds:
                        specs.append({
                            "preset": pname, "options": opts, "response": resp,
                            "rail": rail,
                            "geometry": "cross" if rail == "right" else "lengthwise",
                            "state": state,
                            "roll_frac": 1.0 if state == "rolling" else 0.0,
                            "approach": APPROACH["rolling" if state == "rolling"
                                                 else "slip"],
                            "incidence_deg_target": th, "speed_target": v,
                        })
    recs, v_final = calibrate(specs, bank_scenario, arrival_speed,
                              lambda s: s["speed_target"])
    return [bank_row(s, r, v) for s, r, v in zip(specs, recs, v_final)]


# (b) spin variants on the banked OBJECT ball (explicit initial spin state
# is legal SDK input). side_frac is wz relative to the natural-roll rate
# v/R. Geometry: cross-table 45 deg into the right rail, tangential +y;
# the contact point's tangential slip is v_t + wz*R, so wz < 0 reduces the
# slip (running english: faster, longer rebound) and wz > 0 adds slip
# (reverse english) -- consistent with kick.json's "right english (wz > 0
# on a +y kick) drifts +x".
SPINS = {
    "none_rolling": {"roll_frac": 1.0, "side_frac": 0.0},
    "top": {"roll_frac": 1.6, "side_frac": 0.0},
    "draw": {"roll_frac": -0.8, "side_frac": 0.0},
    "running": {"roll_frac": 1.0, "side_frac": -0.6},
    "reverse": {"roll_frac": 1.0, "side_frac": +0.6},
}


def measure_spin_effects(preset_map, speed=2.5, angle=45.0):
    specs = []
    for pname, (opts, resp) in preset_map.items():
        for spin, cfg in SPINS.items():
            frac = cfg["side_frac"]
            specs.append({
                "preset": pname, "options": opts, "response": resp,
                "rail": "right", "geometry": "cross", "state": "spin",
                "spin": spin, "roll_frac": cfg["roll_frac"],
                "side_frac": frac,
                "side_spin_of": (lambda f: lambda v: f * v / R)(frac),
                "approach": APPROACH["slip"],
                "incidence_deg_target": angle, "speed_target": speed,
            })
    recs, v_final = calibrate(specs, bank_scenario, arrival_speed,
                              lambda s: s["speed_target"])
    rows = [bank_row(s, r, v) for s, r, v in zip(specs, recs, v_final)]
    for row, spec in zip(rows, specs):
        row["side_frac"] = spec["side_frac"]
        row["roll_frac"] = spec["roll_frac"]
    # Rebound-angle shift vs the same preset's no-spin rolling baseline.
    base = {r["preset"]: r for r in rows if r["spin"] == "none_rolling"}
    for row in rows:
        b = base.get(row["preset"])
        if row["clean"] and b and b["clean"] and row["spin"] != "none_rolling":
            row["delta_theta_impact_deg"] = (row["theta_out_impact_deg"]
                                             - b["theta_out_impact_deg"])
            row["delta_rebound_speed"] = (row["rebound_speed"]
                                          - b["rebound_speed"])
    return rows


def measure_kick_lengthwise(preset_map):
    """SC-002 sidespin-kick geometry (tests/fixtures/anchors/kick.json):
    cue shot v0 = 2 m/s straight into the foot rail from y = -1.2, tip
    offsets 1/3, 2/3, 3/3 of full english (0.5); the signed lateral change
    in diamonds is read at the second cushion contact (head-rail arrival).
    Both spin signs run with mirrored starts (right english drifts +x)."""
    scenarios, meta = [], []
    for pname, (opts, resp) in preset_map.items():
        for frac in (1 / 3, 2 / 3, 1.0):
            for side in ("right", "left"):
                tip = 0.5 * frac * (1 if side == "right" else -1)
                x0 = -0.45 if side == "right" else 0.45
                state = pp.SystemState([pp.Ball(0, (x0, -1.2))],
                                       table=table_with(resp))
                shot = pp.Shot(2.0, math.pi / 2, a=tip)
                scenarios.append((state, shot, opts))
                meta.append({"preset": pname, "english_fraction": frac,
                             "side": side, "x0": x0})
    rows = []
    for m, rec in zip(meta, pp.batch_simulate(scenarios)):
        row = dict(m)
        cushions = [e for e in rec.events()
                    if e["kind"] == "ball_linear_cushion" and e["ball"] == 0]
        if len(cushions) >= 2:
            arrival = post_of(cushions[1], 0)
            rail, _ = rail_of(arrival["pos"])
            row["arrival_rail"] = rail
            row["offset_diamonds"] = (arrival["pos"][0] - m["x0"]) / DIAMOND
            row["clean"] = rail == "head"
        else:
            row["clean"] = False
        del row["x0"]
        rows.append(row)
    return rows


# TP B.28 (Alciatore 2023, drdavepoolinfo.com/technical_proofs/new/TP_B-28.pdf,
# also docs/research/gap-k66-cushion-params.md sec 3): sliding banks into a
# long rail; "aim" is the through-diamond point on the banking rail, "meas"
# the through-diamond point where the rebound crosses the opposite rail.
# Center-line simplification (documented, anchors carry the same reading):
# through-diamond lines run between the ball-center nose planes, so
# tan(theta_in) = aim * DIAMOND / (WIDTH - 2R) and meas is read where the
# settled rebound line re-crosses the launch-side center plane.
TP_Y_ORG = -1.15  # aim-line origin on the opposite (left) center plane
# Launch distance before contact. Short so the ball arrives at TRUE stun
# (~1% natural roll at 3 m/s), not merely "still sliding" by motion label:
# the old 0.30 m run-up let the ball develop ~16% natural roll by contact,
# reading the whole ladder long by +0.04..+0.12 diamond (aim 1..3). The
# clean gate below is quantitative (roll_frac_at_contact <= ROLL_FRAC_TOL).
TP_APPROACH = 0.02


def tp_b28_scenario(spec, v_launch):
    wc = WIDTH - 2 * R
    x1c = WIDTH / 2 - R
    th = math.atan(spec["aim"] * DIAMOND / wc)
    yc = TP_Y_ORG + spec["aim"] * DIAMOND
    u = (math.cos(th), math.sin(th))
    ball = moving_ball(1, (x1c - u[0] * TP_APPROACH, yc - u[1] * TP_APPROACH),
                       (u[0] * v_launch, u[1] * v_launch), roll_frac=0.0)
    cue, shot = parked_cue(*PARK["sw"])
    state = pp.SystemState([cue, ball], table=table_with(spec["response"]))
    return (state, shot, spec["options"])


def measure_tp_b28(preset_map, aims=(0.5, 1.0, 1.5, 2.0, 2.5, 3.0),
                   speed=3.0):
    specs = [{"preset": p, "options": o, "response": r, "rail": "right",
              "aim": a, "speed_target": speed}
             for p, (o, r) in preset_map.items() for a in aims]
    recs, v_final = calibrate(specs, tp_b28_scenario, arrival_speed,
                              lambda s: s["speed_target"])
    rows = []
    x0c = -(WIDTH / 2 - R)
    for spec, rec, v in zip(specs, recs, v_final):
        row = {"preset": spec["preset"], "aim": spec["aim"],
               "speed_target": speed, "launch_speed": v}
        fc = first_contact(rec, 1)
        if fc is None or fc[1]["kind"] != "ball_linear_cushion":
            row["clean"] = False
            rows.append(row)
            continue
        idx, e = fc
        v_in, motion_in = state_before(rec, e["t"], 1)
        speed_in = math.hypot(*v_in)
        f_c = roll_frac_at_contact(0.0, v, speed_in)
        row["speed_at_contact"] = speed_in
        row["roll_frac_at_contact"] = f_c
        row["motion_at_contact"] = motion_in
        row["incidence_deg"] = incidence_deg("right", v_in)
        settled = settled_after(rec, idx, 1)
        row["clean"] = settled is not None and abs(f_c) <= ROLL_FRAC_TOL
        if settled is not None:
            pos, vel, how = settled
            row["settled_how"] = how
            if vel[0] < -1e-9:
                y_cross = pos[1] + vel[1] * (x0c - pos[0]) / vel[0]
                row["meas_diamonds"] = (y_cross - TP_Y_ORG) / DIAMOND
            else:
                row["clean"] = False
        rows.append(row)
    return rows


# (c) multi-rail kick paths from corner-origin diagonals: real cue shots
# with follow (natural roll by first contact) and optional running english.
# Both paths run counterclockwise (SW area -> east rail -> ...), where the
# running side is left english (a < 0; tip a > 0 always spins wz > 0).
MULTIRAIL = {
    "three_rail": {"cue": (-0.45, -1.05), "target_y": 0.20, "v0": 4.0},
    "two_rail": {"cue": (-0.45, -1.05), "target_y": 0.70, "v0": 3.0},
}
ENGLISH = {"none": 0.0, "running": -0.25}


def measure_multirail(preset_map, n_contacts=4):
    scenarios, meta = [], []
    for pname, (opts, resp) in preset_map.items():
        for path, cfg in MULTIRAIL.items():
            for english, a in ENGLISH.items():
                cx, cy = cfg["cue"]
                phi = math.atan2(cfg["target_y"] - cy, (WIDTH / 2 - R) - cx)
                state = pp.SystemState([pp.Ball(0, (cx, cy))],
                                       table=table_with(resp))
                shot = pp.Shot(cfg["v0"], phi, a=a, b=0.25)
                scenarios.append((state, shot, opts))
                meta.append({"preset": pname, "path": path,
                             "english": english, "v0": cfg["v0"],
                             "phi_deg": math.degrees(phi)})
    rows = []
    for m, rec in zip(meta, pp.batch_simulate(scenarios)):
        row = dict(m)
        contacts = []
        for e in rec.events():
            if e["kind"] in ("ball_linear_cushion", "ball_circular_cushion") \
                    and e["ball"] == 0:
                p = post_of(e, 0)
                rail, d = rail_of(p["pos"])
                contacts.append({
                    "t": e["t"], "rail": rail, "diamond": d,
                    "jaw": e["kind"] == "ball_circular_cushion",
                    "speed_after": math.hypot(p["vel"][0], p["vel"][1]),
                })
                if len(contacts) >= n_contacts:
                    break
        row["contacts"] = contacts
        row["pocketed"] = any(e["kind"] == "ball_pocket"
                              for e in rec.events())
        rows.append(row)
    return rows


FULL_GRID = {"rails": ("right", "foot"),
             "angles": (15.0, 30.0, 45.0, 60.0, 75.0),
             "speeds": (1.0, 2.5, 4.0),
             "states": ("rolling", "stun")}
QUICK_GRID = {"rails": ("right",), "angles": (45.0,), "speeds": (1.0, 4.0),
              "states": ("rolling", "stun")}


def run_all(quick=False, preset_map=None):
    pm = preset_map or presets()
    grid = QUICK_GRID if quick else FULL_GRID
    doc = {
        "generated_by": "tools/banking/measure.py",
        "kernel_version": pp.kernel_version(),
        "quick": quick,
        "grid": {k: list(v) for k, v in grid.items()},
        "presets": {name: {"options": json.loads(opts.to_json()),
                           "cushion_response": resp}
                    for name, (opts, resp) in pm.items()},
    }
    log(f"[measure] bank_response grid {grid} x {len(pm)} presets")
    doc["bank_response"] = measure_bank_response(pm, grid["rails"],
                                                 grid["angles"],
                                                 grid["speeds"],
                                                 grid["states"])
    log(f"[measure] bank_response: {len(doc['bank_response'])} rows")
    log("[measure] spin_effects")
    doc["spin_effects"] = measure_spin_effects(pm)
    log("[measure] kick_lengthwise (SC-002 geometry)")
    doc["kick_lengthwise"] = measure_kick_lengthwise(pm)
    if quick:
        log("[measure] tp_b28 (quick: aims 1 and 2)")
        doc["tp_b28"] = measure_tp_b28(pm, aims=(1.0, 2.0))
    else:
        log("[measure] tp_b28 (full aim ladder)")
        doc["tp_b28"] = measure_tp_b28(pm)
    log("[measure] multirail")
    doc["multirail"] = measure_multirail(pm)
    return doc


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="out/measurements.json")
    ap.add_argument("--quick", action="store_true",
                    help="tiny grid (smoke-test subset)")
    args = ap.parse_args()
    doc = run_all(quick=args.quick)
    import os
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(doc, f, indent=1, sort_keys=True)
    log(f"[measure] wrote {args.out}")


if __name__ == "__main__":
    main()
