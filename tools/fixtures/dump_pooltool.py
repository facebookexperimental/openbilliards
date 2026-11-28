#!/usr/bin/env python

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Dump pooltool oracle fixtures for the openbilliards pool-core kernel (M9).

Configures pooltool (ekiefl/pooltool, Apache-2.0 — used here as the test
oracle per constitution P-IV) with EXACTLY the models and geometry frozen for
pool-core v1:

  * Resolver: ball_ball = FrictionalInelastic(AlciatoreBallBallFriction(
    a=9.951e-3, b=0.108, c=1.088)); ball_linear_cushion / ball_circular_cushion
    = Han2005Linear / Han2005Circular; stick_ball = InstantaneousPoint2D;
    ball_pocket = CanonicalBallPocket; transition = CanonicalTransition.
  * BallParams matching pool-core defaults: m=0.170097, R=0.028575, u_s=0.2,
    u_r=0.01, u_sp=(10*2/5/9)*R, e_b=0.95, e_c=0.85, f_c=0.2, g=9.81.
  * Table: PocketTableSpecs with the trunk `table.rs` numbers — l=2.54,
    w=1.27, pooltool 7-ft pocket/jaw specs verbatim, cushion (nose) height
    0.635 * 2R (WPA; deliberately NOT pooltool's default 0.64 factor).

Coordinate/unit conventions bridged here (pool-core is authoritative):

  * Frame: pool-core uses a center-origin frame (+y toward the foot rail);
    pooltool uses a corner-origin frame. Shift = (w/2, l/2).
  * phi/theta: pool-core radians -> pooltool degrees (same zero directions).
  * Tip offsets: pool-core ShotParams.a/b are CUE-TIP offsets in units of R
    with a > 0 = right english. pooltool's InstantaneousPoint solve() consumes
    CONTACT-POINT offsets with a > 0 = leftmost contact
    (pooltool physics/utils.py: contact = tip / (1 + tip_radius/R)).
    Mapping: pt_a = -a / (1 + tip_radius/R), pt_b = b / (1 + tip_radius/R).

Outputs (all under crates/pool-core/tests/fixtures/):

  * oracle/<name>.json     — provenance + scenario + oracle event stream
  * scenarios/<name>.json  — pool-cli `simulate --scenario` input half
  * oracle/table_geometry.json — pooltool-built table geometry in the
    pool-core frame/index order, for a Rust identity check vs Table::wpa_9ft

Usage:
  /tmp/ptbench/bin/python tools/fixtures/dump_pooltool.py
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

import pooltool as pt
import pooltool.constants as const
from pooltool.events.datatypes import AgentType, EventType
from pooltool.evolution.engine import SimulationEngine
from pooltool.objects.ball.datatypes import Ball
from pooltool.objects.ball.params import BallParams
from pooltool.objects.cue.datatypes import Cue, CueSpecs
from pooltool.objects.table.datatypes import Table
from pooltool.objects.table.specs import PocketTableSpecs
from pooltool.physics.resolve.ball_ball.friction import AlciatoreBallBallFriction
from pooltool.physics.resolve.ball_ball.frictional_inelastic import FrictionalInelastic
from pooltool.physics.resolve.ball_cushion.han_2005.model import (
    Han2005Circular,
    Han2005Linear,
)
from pooltool.physics.resolve.ball_pocket import CanonicalBallPocket
from pooltool.physics.resolve.ball_table import FrictionalInelasticTable
from pooltool.physics.resolve.resolver import Resolver
from pooltool.physics.resolve.resolver import VERSION as RESOLVER_VERSION
from pooltool.physics.resolve.stick_ball.instantaneous_point import InstantaneousPoint2D
from pooltool.physics.resolve.transition import CanonicalTransition

# --- pool-core reference parameters (contract kernel-api.md / params.rs) ----

R = 0.028575
M_BALL = 0.170097
U_S = 0.2
U_R = 0.01
U_SP_PROP = 10 * 2 / 5 / 9  # u_sp = U_SP_PROP * R (pooltool params.py)
E_B = 0.95
E_C = 0.85
F_C = 0.2
GRAV = 9.81

CUE_M = 0.567
TIP_RADIUS = 0.0106  # pool-core CueParams default (pooltool's is 0.0106045)
END_MASS = M_BALL / 30.0
TIP_FACTOR = 1.0 / (1.0 + TIP_RADIUS / R)  # tip offset -> contact-point offset

TABLE_L = 2.54
TABLE_W = 2.54 / 2.0
CUSHION_H = 0.635 * 2.0 * R  # WPA nose height (trunk table.rs)
SHIFT = (TABLE_W / 2.0, TABLE_L / 2.0)  # pooltool corner frame -> center frame

BB_FRICTION = {"a": 9.951e-3, "b": 0.108, "c": 1.088}

# pooltool cushion/pocket ids -> pool-core Table vector indices
# (trunk table.rs constructs vectors in exactly this order).
LINEAR_IDS = [str(i) for i in range(1, 19)]
CIRCULAR_IDS = ["1t", "2t", "4t", "5t", "7t", "8t", "10t", "11t", "13t", "14t", "16t", "17t"]
POCKET_IDS = ["lb", "lc", "lt", "rb", "rc", "rt"]
LINEAR_INDEX = {k: i for i, k in enumerate(LINEAR_IDS)}
CIRCULAR_INDEX = {k: i for i, k in enumerate(CIRCULAR_IDS)}
POCKET_INDEX = {k: i for i, k in enumerate(POCKET_IDS)}

MOTION = {
    const.stationary: "Stationary",
    const.spinning: "Spinning",
    const.sliding: "Sliding",
    const.rolling: "Rolling",
    const.pocketed: "Pocketed",
}

TRANSITION_MAP = {
    EventType.SLIDING_ROLLING: ("Sliding", "Rolling"),
    EventType.ROLLING_SPINNING: ("Rolling", "Spinning"),
    EventType.ROLLING_STATIONARY: ("Rolling", "Stationary"),
    EventType.SPINNING_STATIONARY: ("Spinning", "Stationary"),
}

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = REPO_ROOT / "crates" / "pool-core" / "tests" / "fixtures"
ORACLE_DIR = FIXTURE_DIR / "oracle"
SCENARIO_DIR = FIXTURE_DIR / "scenarios"

# --- scenarios (EXPLICIT ball positions in the pool-core center frame) ------
# All balls start Stationary at z = R; ball 0 is always the cue ball.
#
# NOTE on near-straight (instead of perfectly straight) hits: pooltool's
# current quartic solver (`ptmath/roots/_quartic_numba.py`) raises on an
# exactly-degenerate leading coefficient, which EXACTLY collinear collisions
# produce afterwards (two balls sliding/rolling with bitwise-identical
# deceleration vectors -> relative acceleration == 0). Every "straight" hit
# below therefore carries a few-mm lateral offset (a 2-6 deg cut) so the
# post-collision accelerations differ. Physically equivalent, numerically
# generic — and also avoids event tie-break degeneracies in both engines.


def _norm2(v):
    n = math.hypot(v[0], v[1])
    return (v[0] / n, v[1] / n)


def _aim_at_ghost(cue, obj, target):
    """phi aiming the cue ball's center at the ghost-ball position for `obj`
    to depart toward `target` (ignoring throw)."""
    n = _norm2((target[0] - obj[0], target[1] - obj[1]))
    ghost = (obj[0] - 2.0 * R * n[0], obj[1] - 2.0 * R * n[1])
    return math.atan2(ghost[1] - cue[1], ghost[0] - cue[0])


_LC_POCKET = (-(TABLE_W / 2.0 + 0.0685), 0.0)  # left side pocket center ("lc")

_SP_CUE = (0.18, -0.008)
_SP_OBJ = (-0.25, 0.012)

# three_ball_chain geometry: cue full-hits ball 1 (6 mm offset), ball 1 then
# cuts ball 2 placed 0.45 m down ball 1's nominal departure line with a
# 12 mm lateral offset.
_TC_CUE = (0.0, -0.8)
_TC_B1 = (0.006, -0.3)
_TC_CONTACT_Y = _TC_B1[1] - math.sqrt((2.0 * R) ** 2 - _TC_B1[0] ** 2)
_TC_N1 = _norm2((_TC_B1[0], _TC_B1[1] - _TC_CONTACT_Y))
_TC_T1 = (_TC_N1[1], -_TC_N1[0])
_TC_B2 = (
    _TC_B1[0] + 0.45 * _TC_N1[0] + 0.012 * _TC_T1[0],
    _TC_B1[1] + 0.45 * _TC_N1[1] + 0.012 * _TC_T1[1],
)

SCENARIOS = [
    dict(
        name="straight_pot",
        description=(
            "Near-straight pot (~3 deg cut) into the left side pocket "
            "('lc' -> pocket index 1). Cue ball stops well short of the "
            "pocket."
        ),
        balls=[(0, *_SP_CUE), (1, *_SP_OBJ)],
        shot=dict(
            v0=1.6,
            phi=_aim_at_ghost(_SP_CUE, _SP_OBJ, _LC_POCKET),
            theta=0.0,
            a=0.0,
            b=0.0,
            seed=1,
        ),
    ),
    dict(
        name="cut_30_side",
        description=(
            "~30 deg cut (impact parameter = R, half-ball) with right english "
            "a = 0.3; object ball banks off the right rail."
        ),
        balls=[(0, 0.15 - R, -0.75), (1, 0.15, -0.35)],
        shot=dict(v0=2.0, phi=math.pi / 2.0, theta=0.0, a=0.3, b=0.0, seed=2),
    ),
    dict(
        name="draw_shot",
        description=(
            "Near-full hit (4 mm offset) with draw b = -0.4: cue ball draws "
            "back toward the head rail while the object ball banks off the "
            "foot rail."
        ),
        balls=[(0, 0.0, -0.6), (1, 0.004, -0.1)],
        shot=dict(v0=2.5, phi=math.pi / 2.0, theta=0.0, a=0.0, b=-0.4, seed=3),
    ),
    dict(
        name="bank_two_cushion",
        description=(
            "Single cue ball driven at 55 deg: right rail then foot rail "
            "(two-cushion bank), rolling out to rest."
        ),
        balls=[(0, -0.3, -0.9)],
        shot=dict(v0=3.0, phi=math.radians(55.0), theta=0.0, a=0.0, b=0.0, seed=4),
    ),
    dict(
        name="three_ball_chain",
        description=(
            "Three-ball chain: cue near-full-hits ball 1 (6 mm offset), "
            "ball 1 cuts ball 2 toward the foot rail."
        ),
        balls=[(0, *_TC_CUE), (1, *_TC_B1), (2, *_TC_B2)],
        shot=dict(v0=2.2, phi=math.pi / 2.0, theta=0.0, a=0.0, b=0.0, seed=5),
    ),
]

# --- pooltool configuration --------------------------------------------------


def make_ball_params() -> BallParams:
    return BallParams(
        m=M_BALL,
        R=R,
        u_s=U_S,
        u_r=U_R,
        u_sp_proportionality=U_SP_PROP,
        u_b=0.05,  # unused by FrictionalInelastic (AlciatoreBallBallFriction wins)
        e_b=E_B,
        e_t=0.5,  # unused: is_3d=False -> no ball-table events
        e_c=E_C,
        f_c=F_C,
        g=GRAV,
    )


def make_table() -> Table:
    specs = PocketTableSpecs(
        l=TABLE_L,
        w=TABLE_W,
        cushion_width=2 * 2.54 / 100,
        cushion_height=CUSHION_H,
        corner_pocket_width=0.118,
        corner_pocket_angle=5.3,
        corner_pocket_depth=0.0417,
        corner_pocket_radius=0.062,
        corner_jaw_radius=0.02095,
        side_pocket_width=0.137,
        side_pocket_angle=7.14,
        side_pocket_depth=0.0685,
        side_pocket_radius=0.0645,
        side_jaw_radius=0.00795,
    )
    table = Table.from_table_specs(specs)
    assert set(table.cushion_segments.linear) == set(LINEAR_IDS)
    assert set(table.cushion_segments.circular) == set(CIRCULAR_IDS)
    assert set(table.pockets) == set(POCKET_IDS)
    for seg in table.cushion_segments.linear.values():
        assert abs(seg.height - CUSHION_H) < 1e-12
    return table


def make_resolver() -> Resolver:
    return Resolver(
        ball_ball=FrictionalInelastic(
            friction=AlciatoreBallBallFriction(**BB_FRICTION)
        ),
        ball_linear_cushion=Han2005Linear(),
        ball_circular_cushion=Han2005Circular(),
        ball_pocket=CanonicalBallPocket(),
        stick_ball=InstantaneousPoint2D(english_throttle=1.0, squirt_throttle=1.0),
        ball_table=FrictionalInelasticTable(min_bounce_height=0.005),
        transition=CanonicalTransition(),
        version=RESOLVER_VERSION,
    )


def make_cue() -> Cue:
    return Cue(
        cue_ball_id="0",
        specs=CueSpecs(
            brand="openbilliards-reference",
            M=CUE_M,
            length=1.4732,
            tip_radius=TIP_RADIUS,
            shaft_radius_at_tip=0.0065,
            shaft_radius_at_butt=0.02,
            end_mass=END_MASS,
        ),
    )


def make_system(scn: dict, table: Table) -> pt.System:
    balls = {}
    for bid, x, y in scn["balls"]:
        ball = Ball.create(str(bid), xy=(x + SHIFT[0], y + SHIFT[1]))
        ball.params = make_ball_params()
        balls[str(bid)] = ball
    system = pt.System(cue=make_cue(), table=table, balls=balls)
    shot = scn["shot"]
    system.strike(
        V0=shot["v0"],
        phi=math.degrees(shot["phi"]),
        theta=math.degrees(shot["theta"]),
        a=-shot["a"] * TIP_FACTOR,
        b=shot["b"] * TIP_FACTOR,
    )
    return system


# --- dumping -----------------------------------------------------------------


def vec(xs, shift=(0.0, 0.0)) -> list[float]:
    return [float(xs[0]) - shift[0], float(xs[1]) - shift[1], float(xs[2])]


def ball_state_json(ball: Ball) -> dict:
    rvw = ball.state.rvw
    return {
        "id": int(ball.id),
        "pos": vec(rvw[0], SHIFT),
        "vel": vec(rvw[1]),
        "avel": vec(rvw[2]),
        "motion": MOTION[ball.state.s],
    }


def event_json(ev) -> dict | None:
    et = ev.event_type
    if et == EventType.NONE:
        return None
    assert et != EventType.BALL_TABLE, "ball-table events impossible with is_3d=False"

    ball_agents = sorted(
        (ag for ag in ev.agents if ag.agent_type == AgentType.BALL),
        key=lambda ag: int(ag.id),
    )
    out = {
        "t": float(ev.time),
        "ids": [int(ag.id) for ag in ball_agents],
    }
    if et == EventType.STICK_BALL:
        out["type"] = "Strike"
    elif et == EventType.BALL_BALL:
        out["type"] = "BallBall"
    elif et == EventType.BALL_LINEAR_CUSHION:
        out["type"] = "BallLinearCushion"
        (cushion,) = [a for a in ev.agents if a.agent_type == AgentType.LINEAR_CUSHION_SEGMENT]
        out["index"] = LINEAR_INDEX[cushion.id]
    elif et == EventType.BALL_CIRCULAR_CUSHION:
        out["type"] = "BallCircularCushion"
        (arc,) = [a for a in ev.agents if a.agent_type == AgentType.CIRCULAR_CUSHION_SEGMENT]
        out["index"] = CIRCULAR_INDEX[arc.id]
    elif et == EventType.BALL_POCKET:
        out["type"] = "BallPocket"
        (pocket,) = [a for a in ev.agents if a.agent_type == AgentType.POCKET]
        out["index"] = POCKET_INDEX[pocket.id]
    elif et in TRANSITION_MAP:
        out["type"] = "Transition"
        out["from"], out["to"] = TRANSITION_MAP[et]
    else:
        raise AssertionError(f"unmapped pooltool event type: {et}")

    out["post"] = [ball_state_json(ag.final) for ag in ball_agents]
    return out


def pooltool_commit() -> str:
    repo = Path(pt.__file__).resolve().parents[1]
    return (
        subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    )


def provenance(commit: str) -> dict:
    return {
        "generator": "tools/fixtures/dump_pooltool.py",
        "pooltool_version": pt.__version__,
        "pooltool_commit": commit,
        "resolver_config": {
            "ball_ball": {"model": "frictional_inelastic", "friction": dict(BB_FRICTION, model="alciatore")},
            "ball_linear_cushion": {"model": "han_2005"},
            "ball_circular_cushion": {"model": "han_2005"},
            "ball_pocket": {"model": "canonical"},
            "stick_ball": {
                "model": "instantaneous_point_2d",
                "english_throttle": 1.0,
                "squirt_throttle": 1.0,
            },
            "ball_table": {"model": "frictional_inelastic", "min_bounce_height": 0.005},
            "transition": {"model": "canonical"},
            "is_3d": False,
            "resolver_version": RESOLVER_VERSION,
        },
        "ball_params": {
            "m": M_BALL,
            "r": R,
            "u_s": U_S,
            "u_r": U_R,
            "u_sp": U_SP_PROP * R,
            "e_b": E_B,
            "e_c": E_C,
            "f_c": F_C,
            "g": GRAV,
        },
        "cue_params": {"m": CUE_M, "tip_radius": TIP_RADIUS, "end_mass": END_MASS},
        "table": {
            "preset": "wpa_9ft",
            "l": TABLE_L,
            "w": TABLE_W,
            "cushion_height": CUSHION_H,
        },
        "conventions": {
            "frame": "center-origin, +y toward foot rail; pooltool coords shifted by (-w/2, -l/2)",
            "phi": "radians in fixtures (pooltool given degrees), 0 = +x",
            "a": (
                "ShotParams.a/b are cue-tip offsets in units of R, a>0 = right "
                "english; pooltool was given contact-point offsets "
                "pt_a = -a/(1+tip_radius/R), pt_b = b/(1+tip_radius/R)"
            ),
            "pocketed": "pooltool parks pocketed balls at (pocket.center, -pocket.depth)",
        },
    }


def oracle_fixture(scn: dict, system: pt.System, prov: dict) -> dict:
    events = [e for e in (event_json(ev) for ev in system.events) if e is not None]
    assert events, "no events dumped"
    assert events[0]["type"] == "Strike" and events[0]["t"] == 0.0
    ts = [e["t"] for e in events]
    assert all(t0 <= t1 for t0, t1 in zip(ts, ts[1:])), "event times must be non-decreasing"
    finals = [
        ball_state_json(system.balls[str(bid)]) for bid, _, _ in scn["balls"]
    ]
    for f in finals:
        assert f["motion"] in ("Stationary", "Pocketed"), f"ball {f['id']} not at rest"
    return {
        "format": "openbilliards.oracle.v1",
        "name": scn["name"],
        "description": scn["description"],
        "provenance": prov,
        "scenario": {
            "balls": [{"id": bid, "x": x, "y": y} for bid, x, y in scn["balls"]],
            "shot": scn["shot"],
        },
        "oracle": {"events": events, "final": finals},
    }


def scenario_file(scn: dict, prov: dict) -> dict:
    p = prov["ball_params"]
    balls = [
        {
            "id": bid,
            "params": {
                "m": p["m"],
                "r": p["r"],
                "u_s": p["u_s"],
                "u_r": p["u_r"],
                "u_sp": p["u_sp"],
                "e_b": p["e_b"],
                "e_c": p["e_c"],
                "f_c": p["f_c"],
            },
            "state": {
                "pos": {"x": x, "y": y, "z": p["r"]},
                "vel": {"x": 0.0, "y": 0.0, "z": 0.0},
                "avel": {"x": 0.0, "y": 0.0, "z": 0.0},
                "motion": "Stationary",
            },
        }
        for bid, x, y in scn["balls"]
    ]
    return {
        "name": scn["name"],
        "description": scn["description"],
        "system": {"balls": balls, "table": "wpa_9ft"},
        "shot": scn["shot"],
    }


def table_geometry(table: Table, prov: dict) -> dict:
    linear = []
    for i, key in enumerate(LINEAR_IDS):
        seg = table.cushion_segments.linear[key]
        linear.append(
            {
                "index": i,
                "id": key,
                "p1": [float(seg.p1[0]) - SHIFT[0], float(seg.p1[1]) - SHIFT[1]],
                "p2": [float(seg.p2[0]) - SHIFT[0], float(seg.p2[1]) - SHIFT[1]],
                "height": float(seg.height),
            }
        )
    circular = []
    for i, key in enumerate(CIRCULAR_IDS):
        arc = table.cushion_segments.circular[key]
        circular.append(
            {
                "index": i,
                "id": key,
                "center": [float(arc.center[0]) - SHIFT[0], float(arc.center[1]) - SHIFT[1]],
                "radius": float(arc.radius),
                "height": float(arc.height),
            }
        )
    pockets = []
    for i, key in enumerate(POCKET_IDS):
        p = table.pockets[key]
        pockets.append(
            {
                "index": i,
                "id": key,
                "center": [float(p.center[0]) - SHIFT[0], float(p.center[1]) - SHIFT[1]],
                "radius": float(p.radius),
                "depth": float(p.depth),
            }
        )
    return {
        "format": "openbilliards.table.v1",
        "provenance": prov,
        "linear": linear,
        "circular": circular,
        "pockets": pockets,
    }


def main() -> int:
    ORACLE_DIR.mkdir(parents=True, exist_ok=True)
    SCENARIO_DIR.mkdir(parents=True, exist_ok=True)

    commit = pooltool_commit()
    prov = provenance(commit)
    table = make_table()
    engine = SimulationEngine(resolver=make_resolver())

    geom_path = ORACLE_DIR / "table_geometry.json"
    geom_path.write_text(json.dumps(table_geometry(table, prov), indent=1) + "\n")
    print(f"wrote {geom_path.relative_to(REPO_ROOT)}")

    for scn in SCENARIOS:
        system = make_system(scn, table.copy())
        simulated = pt.simulate(system, engine=engine, inplace=False)
        fixture = oracle_fixture(scn, simulated, prov)

        n_ev = len(fixture["oracle"]["events"])
        t_end = fixture["oracle"]["events"][-1]["t"]
        opath = ORACLE_DIR / f"{scn['name']}.json"
        opath.write_text(json.dumps(fixture, indent=1) + "\n")
        print(f"wrote {opath.relative_to(REPO_ROOT)}: {n_ev} events, {t_end:.4f} s")

        spath = SCENARIO_DIR / f"{scn['name']}.json"
        spath.write_text(json.dumps(scenario_file(scn, prov), indent=2) + "\n")
        print(f"wrote {spath.relative_to(REPO_ROOT)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
