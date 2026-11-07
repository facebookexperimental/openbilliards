# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Shared helpers for the banking validation harness (tools/banking).

Runs against the venv-built pool_py (crates/pool-py; build with
`maturin develop --release` into a venv, scripts/cross-surface.sh pattern).

Geometry conventions follow crates/pool-core/tests/anchors.rs and
tests/fixtures/anchors/kick.json: x across the table (width 1.27 m),
y along it (length 2.54 m), phi = pi/2 points +y into the foot rail,
1 diamond = 0.3175 m, all positions are ball-center coordinates.
"""

import math

import pool_py as pp

R = 0.028575  # default ball radius [m] (BallParams::default)
DIAMOND = 0.3175  # diamond spacing [m] on a 9-ft table (length/8 = width/4)
WIDTH = 1.27  # playing-surface width [m] (nose to nose, short dimension, x)
LENGTH = 2.54  # playing-surface length [m] (long dimension, y)


def presets():
    """The four cushion configurations under test.

    Each entry pairs SimOptions with the table cushion-response preset the
    kernel pairing rules require (crates/pool-py/src/options.rs docs):
      - han2005:           kernel default (frozen v1 physics)
      - stronge_realistic: SimOptions.realistic() -- the current app default
      - mathavan_fitted:   HSV joint fit (table response "hsv_fitted")
      - grip_fitted:       cushion v5 grip mode (table response "grip_fitted")
    """
    return {
        "han2005": (pp.SimOptions(), "default"),
        "stronge_realistic": (pp.SimOptions.realistic(), "default"),
        "mathavan_fitted": (pp.SimOptions.mathavan_fitted(), "hsv_fitted"),
        "grip_fitted": (pp.SimOptions.grip_fitted(), "grip_fitted"),
    }


# rail -> (normal axis index, nose-plane sign, tangent axis index)
RAILS = {
    "right": (0, +1, 1),  # long rail at x = +WIDTH/2  (cross-table banks)
    "foot": (1, +1, 0),  # short rail at y = +LENGTH/2 (lengthwise banks)
}


def table_with(response):
    return pp.Table.wpa_9ft().with_cushion_response(response)


def rolling_avel(vx, vy):
    """Natural-roll angular velocity for planar velocity (vx, vy)."""
    return (-vy / R, vx / R, 0.0)


def moving_ball(bid, pos, vel, roll_frac=1.0, side_spin=0.0):
    """Ball with an explicit planar velocity and spin state.

    roll_frac: transverse spin as a fraction of natural roll
      (1 = rolling, 0 = stun/sliding, >1 = topspin, <0 = draw).
    side_spin: wz [rad/s]; positive = the spin right english (tip offset
      a > 0) produces (counterclockwise seen from above, +z up).

    A ball at exact natural roll has zero bed slip regardless of side_spin,
    so it is labeled "rolling"; anything else is "sliding".
    """
    vx, vy = vel
    rw = rolling_avel(vx, vy)
    avel = (rw[0] * roll_frac, rw[1] * roll_frac, side_spin)
    motion = "rolling" if abs(roll_frac - 1.0) < 1e-12 else "sliding"
    return pp.Ball(bid, pos, vel=(vx, vy, 0.0), avel=avel, motion=motion)


def parked_cue(pos, phi):
    """Stationary cue ball (id 0, required by the kernel) plus the minimal
    strike that sends it drifting through a quiet region of the table.

    The kernel requires a strike on a stationary ball 0; measurements read
    only ball 1's first cushion contact and its immediate settling, so the
    parked cue only needs to stay clear of ball 1's approach and early
    rebound (positions are chosen per scenario for that).
    """
    return pp.Ball(0, pos), pp.Shot(0.3, phi, seed=0)


# Park spots per target rail: the cue drifts inside the opposite half.
PARK = {
    "right": ((-0.45, 0.85), -math.pi / 2),
    "foot": ((0.45, -0.85), math.pi),
    "sw": ((-0.50, -0.95), math.pi),  # for TP B.28 east-rail geometry
}


def involves(e, bid):
    k = e["kind"]
    if k in ("ball_linear_cushion", "ball_circular_cushion", "ball_pocket",
             "ball_table", "ball_off_table", "strike", "transition"):
        return e.get("ball") == bid
    if k == "ball_ball":
        return bid in (e["b1"], e["b2"])
    return False


def post_of(e, bid):
    for p in e["post"]:
        if p["ball"] == bid:
            return p
    raise KeyError(f"ball {bid} not in post of {e['kind']}")


def first_contact(rec, bid):
    """(index, event) of ball `bid`'s first geometric contact, or None."""
    for i, e in enumerate(rec.events()):
        if e["kind"] in ("ball_linear_cushion", "ball_circular_cushion",
                         "ball_pocket", "ball_ball") and involves(e, bid):
            return i, e
    return None


def state_before(rec, t, bid, dt=1e-4):
    """(velocity (vx, vy), motion name) just before time t, from samples.

    ShotRecord.sample carries positions + motion code but not velocities,
    so velocity comes from a finite difference of two pre-contact samples
    (analytic positions; FD error ~ a*dt/2 < 1e-3 m/s at cloth decel).
    """
    row = rec.ball_ids().index(bid)
    t1 = max(t - dt, 0.0)
    t0 = max(t - 2.0 * dt, 0.0)
    f0, f1 = rec.sample(t0), rec.sample(t1)
    span = t1 - t0 if t1 > t0 else dt
    v = ((f1[row, 0] - f0[row, 0]) / span, (f1[row, 1] - f0[row, 1]) / span)
    return v, MOTION_NAMES[int(f1[row, 7])]


MOTION_NAMES = {0: "stationary", 1: "spinning", 2: "sliding", 3: "rolling",
                4: "pocketed", 5: "airborne"}


def incidence_deg(rail, v_in):
    """Angle from the rail normal [deg] of an incoming velocity (>= 0)."""
    n_ax, sign, t_ax = RAILS[rail]
    return math.degrees(math.atan2(abs(v_in[t_ax]), v_in[n_ax] * sign))


def rebound_deg(rail, v_out, tangent_sign):
    """Signed rebound angle from the normal [deg]; positive keeps the
    incoming tangential direction (mirror-like), negative reverses it."""
    n_ax, sign, t_ax = RAILS[rail]
    vn_away = -v_out[n_ax] * sign
    return math.degrees(math.atan2(v_out[t_ax] * tangent_sign, vn_away))


def settled_after(rec, idx, bid):
    """Ball `bid`'s straight-rolling state after event `idx`.

    Returns (pos, vel, how): the post state of the first transition to
    rolling ("transition"), the cushion post state itself when the ball
    already leaves the rail rolling ("immediate"), or None when another
    geometric contact intervenes before the ball settles.
    """
    events = rec.events()
    cushion_post = post_of(events[idx], bid)
    if cushion_post["motion"] == "rolling":
        return cushion_post["pos"], cushion_post["vel"], "immediate"
    for e in events[idx + 1:]:
        k = e["kind"]
        if k == "transition" and e["ball"] == bid and e["to"] == "rolling":
            p = post_of(e, bid)
            return p["pos"], p["vel"], "transition"
        if k in ("ball_linear_cushion", "ball_circular_cushion",
                 "ball_pocket", "ball_ball") and involves(e, bid):
            return None
    return None


def rail_of(pos):
    """Nearest nose plane for a contact position, plus its diamond coord.

    Diamond coordinates: long rails count 0..8 from the head rail
    (y = -LENGTH/2); short rails count 0..4 from the left rail
    (x = -WIDTH/2).
    """
    x, y = pos[0], pos[1]
    planes = {
        "right": WIDTH / 2 - abs(x) if x > 0 else 1e9,
        "left": WIDTH / 2 - abs(x) if x < 0 else 1e9,
        "foot": LENGTH / 2 - abs(y) if y > 0 else 1e9,
        "head": LENGTH / 2 - abs(y) if y < 0 else 1e9,
    }
    rail = min(planes, key=planes.get)
    if rail in ("right", "left"):
        d = (y + LENGTH / 2) / DIAMOND
    else:
        d = (x + WIDTH / 2) / DIAMOND
    return rail, d


def calibrate(specs, make, measure, target_of, rounds=3, tol=0.02):
    """Batched secant-style speed calibration.

    specs: list of opaque spec dicts; make(spec, v) -> (state, shot, opts);
    measure(spec, rec) -> observed speed (or None on a dirty scenario);
    target_of(spec) -> wanted speed at the cushion. Returns the final
    records list plus the launch speeds used (records[i] matches specs[i]).
    """
    v = [target_of(s) for s in specs]
    recs = None
    for _ in range(rounds):
        recs = pp.batch_simulate([make(s, vi) for s, vi in zip(specs, v)])
        done = True
        for i, (s, rec) in enumerate(zip(specs, recs)):
            got = measure(s, rec)
            want = target_of(s)
            if got is None or got <= 0:
                continue
            if abs(got - want) / want > tol:
                done = False
                v[i] = min(max(v[i] * want / got, 0.05), 12.0)
        if done:
            break
    return recs, v

