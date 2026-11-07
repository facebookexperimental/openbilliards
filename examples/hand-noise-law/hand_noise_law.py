# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The hand noise law: seeded Gaussian stroke errors at a level r of the ICGA convention.

A stroke is (v0 m/s, phi rad, theta rad, a R, b R) in the units of the kernel's stroke API;
a and b command the cue-tip centre offset in ball radii R. The convention at level r adds
r * SIGMA_1X * eps, eps = noise_stream.standard_normals(episode_seed, decision_index). Its
tip entry is applied as 0.0005 R (14.2875 um on the 28.575 mm ball), not the printed 0.5 mm,
which the 'tipspec' channel applies. The hand shape ('all' = tip + speed + physics): 'tip' is
a fixed 0.6 mm on a and b; 'speed' is sigma_v = max(r * 0.075, speed_cv * commanded |v0|);
'physics' is one hidden table draw per game, for the executed stroke's simulation only
(PhysicsView). Aim and elevation stay the convention's in every shape; with no action channel
the result is the convention at r, operand for operand. README.md states units and sources.

Standard library only; no kernel module is imported. The noise arithmetic uses only +, -, *, /,
abs, min and max (project_stroke adds math.hypot); the centred physics intervals are exact (Fraction).
"""

import copy
import hashlib
import json
import math
from fractions import Fraction

import noise_stream

LAW_ID = "hand-noise-v1"
_MASK = noise_stream.MASK64

# ---- constants (sources and units in README.md) ----
#: The convention at level 1 as applied, in the stroke's units (m/s, rad, rad, R, R).
SIGMA_1X = (0.075, math.radians(0.125), math.radians(0.1), 0.0005, 0.0005)
BALL_RADIUS_M = 0.028575  # m, the kernel's default ball radius (a 57.15 mm ball)
TIP_SPEC_M = 0.5e-3  # m, the convention's printed tip sigma
TIP_SIGMA_M = 0.6e-3  # m, the hand's tip sigma on a and on b, at every r
TIP_SIGMA_R = TIP_SIGMA_M / BALL_RADIUS_M
SPEED_CV = 0.045  # the default speed coefficient of variation: a prior from public figures (README), not a measurement
V0_MIN, V0_MAX = 1e-3, 15.0  # m/s: the commanded-speed clip (and the kernel's v0 domain (0, 15])
THETA_MAX = math.pi / 2 - 1e-9  # rad: just inside the kernel's theta < pi/2
TIP_LIMIT = 0.5 - 1e-9  # R: a commanded offset this small passes the kernel's default miscue limit
REF_SPEEDS = (0.5, 1.0, 2.0, 4.0, 6.0, 9.0, 12.0)  # m/s, the speeds describe() reports

# ---- the shape ----
CHANNELS = ("tip", "tipspec", "speed", "physics")
ACTION_CHANNELS = frozenset(("tip", "tipspec", "speed"))
NAMED_SHAPES = {"off": (), "all": ("tip", "speed", "physics")}


def shape_of(spec):
    """'off' | 'all' | channel names joined by '+' (e.g. 'tip+speed') | an iterable of names."""
    if isinstance(spec, str):
        s = spec.strip().lower()
        items = NAMED_SHAPES[s] if s in NAMED_SHAPES else tuple(t.strip() for t in s.split("+"))
    else:
        items = tuple(spec)
    out = frozenset(items)
    bad = sorted(str(x) for x in out if x not in CHANNELS)
    if bad:
        raise ValueError(f"unknown shape channel(s) {bad}; the channels are {CHANNELS}")
    if "tip" in out and "tipspec" in out:
        raise ValueError("one tip law per hand: 'tip' or 'tipspec'")
    return out


SHAPE_OFF = shape_of("off")
SHAPE_ALL = shape_of("all")


def shape_name(spec):
    """The canonical name of a shape: 'off', 'all' or its channels in CHANNELS order."""
    s = shape_of(spec)
    if not s:
        return "off"
    if s == SHAPE_ALL:
        return "all"
    return "+".join(c for c in CHANNELS if c in s)


def _check_nonnegative(x, what):
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        raise TypeError(f"{what} must be a number, got {type(x).__name__}")
    if not math.isfinite(x) or x < 0:
        raise ValueError(f"{what} must be finite and >= 0")
    return x


def check_level(r):
    """r: a finite number >= 0 (a bool refuses); returned unchanged."""
    return _check_nonnegative(r, "the level r")


# ---- the sigma maps (units: m/s, rad, rad, R, R) ----
def commanded_speed(v0):
    """|v0| clipped to [V0_MIN, V0_MAX]: the commanded speed that sets the speed sigma."""
    return min(max(abs(float(v0)), V0_MIN), V0_MAX)


def sigma_v(r, v0, shape=SHAPE_OFF, speed_cv=SPEED_CV):
    """The v0 sigma: r * 0.075 m/s, or with 'speed' the larger of that and speed_cv * |v0|."""
    shape = shape_of(shape)
    floor = r * SIGMA_1X[0]
    if "speed" in shape:
        _check_nonnegative(speed_cv, "speed_cv")
        return max(floor, speed_cv * commanded_speed(v0))
    return floor


def sigma_ab(r, shape=SHAPE_OFF):
    """The (a, b) sigmas in R: 0.6 mm with 'tip', r * 0.5 mm with 'tipspec', else r * 0.0005."""
    shape = shape_of(shape)
    if "tip" in shape:
        return (TIP_SIGMA_R, TIP_SIGMA_R)
    if "tipspec" in shape:
        s = r * TIP_SPEC_M / BALL_RADIUS_M
        return (s, s)
    return (r * SIGMA_1X[3], r * SIGMA_1X[4])


def sigmas(r, v0, shape=SHAPE_OFF, speed_cv=SPEED_CV):
    """The five sigmas at level r for a commanded v0, in the stroke's units."""
    shape = shape_of(shape)
    check_level(r)
    sa, sb = sigma_ab(r, shape)
    return (sigma_v(r, v0, shape, speed_cv), r * SIGMA_1X[1], r * SIGMA_1X[2], sa, sb)


# ---- the two forms ----
def noisy_action(action, eps, r, shape=SHAPE_OFF, speed_cv=SPEED_CV):
    """The noisy 7-entry action (v0, phi, theta, a, b, place_x, place_y) at level r; placement is
    copied. No zero shortcut: at r == 0, x + 0.0 * sigma * eps is still evaluated (-0.0 may become 0.0)."""
    shape = shape_of(shape)
    check_level(r)
    arr = [float(x) for x in action]
    if len(arr) != 7:
        raise ValueError(f"an action has 7 entries, got {len(arr)}")
    if not (shape & ACTION_CHANNELS):  # the convention at r, operand for operand
        return [arr[i] + r * SIGMA_1X[i] * eps[i] for i in range(5)] + arr[5:7]
    s = sigmas(r, arr[0], shape, speed_cv)
    return [arr[0] + s[0] * eps[0],
            arr[1] + r * SIGMA_1X[1] * eps[1],
            arr[2] + r * SIGMA_1X[2] * eps[2],
            arr[3] + s[3] * eps[3],
            arr[4] + s[4] * eps[4]] + arr[5:7]


def noisy_stroke(stroke, eps, r, shape=SHAPE_OFF, speed_cv=SPEED_CV):
    """The noisy 5-entry stroke (v0, phi, theta, a, b) at level r. r == 0 returns the stroke unchanged
    in every shape (noise-free previews stay noise-free); otherwise noisy_action's arithmetic."""
    shape = shape_of(shape)
    check_level(r)
    if len(stroke) != 5:
        raise ValueError(f"a stroke has 5 entries, got {len(stroke)}")
    if r == 0.0:
        return [float(p) for p in stroke]
    if not (shape & ACTION_CHANNELS):
        return [float(stroke[k]) + r * SIGMA_1X[k] * eps[k] for k in range(5)]
    g = sigmas(r, stroke[0], shape, speed_cv)
    return [float(stroke[0]) + g[0] * eps[0],
            float(stroke[1]) + r * SIGMA_1X[1] * eps[1],
            float(stroke[2]) + r * SIGMA_1X[2] * eps[2],
            float(stroke[3]) + g[3] * eps[3],
            float(stroke[4]) + g[4] * eps[4]]


def project_stroke(stroke):
    """A total projection of a 5- or 7-entry stroke into the kernel's stroke validity: v0 into
    [V0_MIN, V0_MAX], phi mod 2 pi, theta into [0, THETA_MAX], (a, b) radially inside TIP_LIMIT;
    placement passes through. Only a non-finite entry or a wrong length raises. The clamps do not keep
    the mean: an entry beyond a bound lands on it, a point mass at the bound and a biased mean near it
    (a commanded theta 0 executes 0 on every draw at or below 0, so its mean is positive)."""
    arr = [float(x) for x in stroke]
    if len(arr) not in (5, 7):
        raise ValueError(f"a stroke has 5 entries (7 with placement), got {len(arr)}")
    if not all(math.isfinite(x) for x in arr):
        raise ValueError("a stroke entry is not finite")
    v0 = min(max(arr[0], V0_MIN), V0_MAX)
    phi = arr[1] % (2 * math.pi)
    theta = min(max(arr[2], 0.0), THETA_MAX)
    a, b = arr[3], arr[4]
    tip = math.hypot(a, b)
    if tip > TIP_LIMIT:
        scale = TIP_LIMIT / tip
        a *= scale
        b *= scale
    return (v0, phi, theta, a, b) + tuple(arr[5:])


def make_executor(r, shape, project=None, normals=None, speed_cv=SPEED_CV):
    """execute(episode_seed, decision_index, action) = project(noisy_action(action, eps, r, shape)), with
    eps = normals(episode_seed, decision_index) (default standard_normals; project defaults to project_stroke)."""
    shape = shape_of(shape)
    check_level(r)
    _check_nonnegative(speed_cv, "speed_cv")
    project = project_stroke if project is None else project
    if not callable(project):
        raise TypeError("project must be callable")
    draw = noise_stream.standard_normals if normals is None else normals

    def execute(episode_seed, decision_index, action):
        eps = draw(episode_seed, int(decision_index))
        return project(noisy_action(action, eps, r, shape, speed_cv))

    return execute


def describe(r, shape, speed_cv=SPEED_CV):
    """The law at level r and shape as a JSON-ready dict (sigmas also in deg and mm)."""
    shape = shape_of(shape)
    check_level(r)
    sa = sigma_ab(r, shape)[0]
    speed = "speed" in shape
    tip_law = "fixed-0.6-mm" if "tip" in shape else ("scaled-0.5-mm" if "tipspec" in shape else "scaled-0.0005-R")
    return {"law": LAW_ID, "shape": shape_name(shape), "r": float(r),
            "sigma_v_mps_at": [[v, sigma_v(r, v, shape, speed_cv)] for v in REF_SPEEDS],
            "speed_cv": speed_cv if speed else None,
            "speed_crossover_mps": (r * SIGMA_1X[0] / speed_cv) if speed and speed_cv else None,
            "sigma_phi_deg": math.degrees(r * SIGMA_1X[1]), "sigma_theta_deg": math.degrees(r * SIGMA_1X[2]),
            "tip_law": tip_law, "sigma_tip_R": sa, "sigma_tip_mm": sa * BALL_RADIUS_M * 1e3,
            "physics": ("one hidden draw per game (e0, u_s, u_r; throw held at 1.0)" if "physics" in shape
                        else "off (the nominal kernel physics)")}


# ---- the physics channel: one hidden draw per game ----
PHYSICS_ORDER = ("e0", "u_s", "u_r", "throw")
#: The kernel defaults the draws are centred on, with the rest of the default cushion response they
#: assume (v_ref, e_min, e_max); any other equipment refuses.
PHYSICS_NOMINAL = {"e0": 0.85, "k_v": 0.0, "v_ref": 1.0, "e_min": 0.6, "e_max": 0.98, "u_s": 0.2, "u_r": 0.01,
                   "bb_friction": {"a": 0.009951, "b": 0.108, "c": 1.088}, "cushion_model": "Han2005"}
#: Exact decimal centres and the spreads the draws stay inside (README.md gives the sources).
PHYSICS_CENTRE = {"e0": "0.85", "u_s": "0.2", "u_r": "0.01", "throw": "1"}
PHYSICS_SPREAD = {"e0": ("0.75", "0.92"), "u_s": ("0.178", "0.245"), "u_r": ("0.0090", "0.0105"),
                  "throw": ("1", "2.5")}
PHYSICS_KEY_TAG = LAW_ID + "/physics@"


def centred_range(centre, spread):
    """The widest interval centred on `centre` inside spread = (lo, hi), exactly (Fractions)."""
    c, lo, hi = Fraction(centre), Fraction(spread[0]), Fraction(spread[1])
    if not lo <= c <= hi:
        raise ValueError("the centre is outside the spread")
    half = min(c - lo, hi - c)
    return (c - half, c + half)


PHYSICS_RANGES_EXACT = {n: centred_range(PHYSICS_CENTRE[n], PHYSICS_SPREAD[n]) for n in PHYSICS_ORDER}
PHYSICS_RANGES = {n: (float(lo), float(hi)) for n, (lo, hi) in PHYSICS_RANGES_EXACT.items()}


def physics_key(text, tag=PHYSICS_KEY_TAG):
    """A game's physics key (u64): the first 8 bytes of sha256(tag + text), e.g. text 'game:<id>'."""
    return int(hashlib.sha256((tag + str(text)).encode()).hexdigest()[:16], 16)


def physics_draw(key):
    """Four uniforms in PHYSICS_ORDER from the SplitMix64 generator started at `key` (a u64): each
    u = u64_to_unit(mix(state)) gives lo + (hi - lo) * u in its range. Records can keep key_sha16."""
    if isinstance(key, bool) or not isinstance(key, int) or not (0 <= key <= _MASK):
        raise ValueError("a physics key is a u64 (see physics_key)")
    state, values = key, {}
    for name in PHYSICS_ORDER:
        state = (state + noise_stream.GOLDEN_GAMMA) & _MASK
        u = noise_stream.u64_to_unit(noise_stream.splitmix64(state))
        lo, hi = PHYSICS_RANGES[name]
        values[name] = lo + (hi - lo) * u
    key_sha16 = hashlib.sha256(f"{key:016x}".encode()).hexdigest()[:16]
    return {"law": LAW_ID + "/physics", "key_sha16": key_sha16, "values": values}


def _draw_values(draw):
    if not isinstance(draw, dict) or draw.get("law") != LAW_ID + "/physics" or not isinstance(draw.get("values"), dict):
        raise ValueError("not a physics draw of this law")
    v = draw["values"]
    for name in PHYSICS_ORDER:
        lo, hi = PHYSICS_RANGES[name]
        x = v.get(name)
        if isinstance(x, bool) or not isinstance(x, float) or not (lo <= x <= hi):
            raise ValueError(f"physics draw {name} missing or outside {PHYSICS_RANGES[name]}")
    return v


def physics_state(state_json, draw):
    """A new kernel-state JSON object with the drawn cloth u_s, u_r on every ball and the drawn
    cushion restitution e0 on the table; the input is never mutated. Refuses unless the input
    carries the nominal equipment: u_s 0.2, u_r 0.01 on every ball, and the kernel's default cushion
    response e(v) = clamp(e0 + k_v (v - v_ref), e_min, e_max) with e0 0.85, k_v 0.0, v_ref 1.0,
    e_min 0.6 and e_max 0.98 (another e_min or e_max could cap or lift the drawn e0, and the executed
    draw would no longer be the centred uniform)."""
    v = _draw_values(draw)
    out = copy.deepcopy(state_json)
    balls = out.get("balls") if isinstance(out, dict) else None
    table = out.get("table") if isinstance(out, dict) else None
    if not isinstance(balls, list) or not balls or not isinstance(table, dict):
        raise RuntimeError("physics_state needs a kernel state JSON with balls and a table")
    cr, fields = table.get("cushion_response"), ("e0", "k_v", "v_ref", "e_min", "e_max")
    if not isinstance(cr, dict) or any(cr.get(f) != PHYSICS_NOMINAL[f] for f in fields):
        raise RuntimeError("the table's cushion response is not the nominal (e0 0.85, k_v 0.0, v_ref 1.0, e_min 0.6, "
                           "e_max 0.98)")
    for ball in balls:
        p = ball.get("params") if isinstance(ball, dict) else None
        if not isinstance(p, dict) or p.get("u_s") != PHYSICS_NOMINAL["u_s"] or p.get("u_r") != PHYSICS_NOMINAL["u_r"]:
            raise RuntimeError("a ball's cloth parameters are not the nominal (u_s 0.2, u_r 0.01)")
        p["u_s"] = v["u_s"]
        p["u_r"] = v["u_r"]
    cr["e0"] = v["e0"]
    return out


def physics_options(options_json, draw):
    """A new simulation-options JSON object with the ball-ball friction curve
    mu(v) = a + b exp(-c v) scaled by the drawn throw multiplier (a and b scaled, c kept;
    held at 1.0 in this version). Refuses unless the cushion model is Han2005 and the curve
    is the kernel default; the input is never mutated."""
    v = _draw_values(draw)
    out = copy.deepcopy(options_json)
    if not isinstance(out, dict) or out.get("cushion_model") != PHYSICS_NOMINAL["cushion_model"]:
        raise RuntimeError("physics_options needs the Han2005 cushion model")
    bb = out.get("bb_friction")
    if bb != PHYSICS_NOMINAL["bb_friction"]:
        raise RuntimeError("the ball-ball friction curve is not the kernel default")
    bb["a"] = PHYSICS_NOMINAL["bb_friction"]["a"] * v["throw"]
    bb["b"] = PHYSICS_NOMINAL["bb_friction"]["b"] * v["throw"]
    return out


def _compact(obj):
    return json.dumps(obj, separators=(",", ":"))


def _carries_draw(state_json, values):
    """True when every ball has the drawn u_s and u_r and the table the drawn e0 with the default rest of
    the cushion response (k_v, v_ref, e_min, e_max), as physics_state sets them."""
    balls = state_json.get("balls") if isinstance(state_json, dict) else None
    table = state_json.get("table") if isinstance(state_json, dict) else None
    cr = table.get("cushion_response") if isinstance(table, dict) else None
    if not isinstance(balls, list) or not balls or not isinstance(cr, dict) or cr.get("e0") != values["e0"]:
        return False
    if any(cr.get(f) != PHYSICS_NOMINAL[f] for f in ("k_v", "v_ref", "e_min", "e_max")):
        return False
    params = [b.get("params") if isinstance(b, dict) else None for b in balls]
    return all(isinstance(p, dict) and (p.get("u_s"), p.get("u_r")) == (values["u_s"], values["u_r"]) for p in params)


class _PhysicsStateClass:
    """Stands in for kernel.SystemState inside the view: from_json applies physics_state, and so does every
    other way to a state: the class call and any public callable whose result has to_json (a constructor
    such as nine_ball_rack) return that state rebuilt through from_json. Other results pass unchanged."""

    def __init__(self, real, draw, counts):
        self._real = real
        self._draw = draw
        self._counts = counts

    def from_json(self, s):
        self._counts["state"] += 1
        return self._real.from_json(_compact(physics_state(json.loads(s), self._draw)))

    def _drawn(self, result):
        return self.from_json(result.to_json()) if hasattr(result, "to_json") else result

    def __call__(self, *args, **kw):
        return self._drawn(self._real(*args, **kw))

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        attr = getattr(self.__dict__["_real"], name)

        def drawn(*args, **kw):
            return self._drawn(attr(*args, **kw))

        return drawn if callable(attr) else attr


class PhysicsView:
    """The kernel module as the executed stroke sees it under one game's physics draw. Give it only to
    the code that simulates executed strokes; the planner keeps the real module and never sees the
    draw. The module object is never changed; batch_simulate refuses and every other public name
    forwards. simulate refuses a state that does not carry this draw: build the state through the
    view's SystemState."""

    def __init__(self, kernel, draw):
        _draw_values(draw)
        self._kernel = kernel
        self.draw = draw
        self.counts = {"state": 0, "simulate": 0}
        self.SystemState = _PhysicsStateClass(kernel.SystemState, draw, self.counts)

    def simulate(self, system, shot, options=None, **kw):
        if options is None:
            raise RuntimeError("the physics view needs the stroke's explicit options")
        to_json = getattr(system, "to_json", None)
        if not callable(to_json) or not _carries_draw(json.loads(to_json()), self.draw["values"]):
            raise RuntimeError("the state does not carry this view's physics draw: build it with view.SystemState "
                               "(from_json, the class call or a constructor such as nine_ball_rack)")
        self.counts["simulate"] += 1
        opts = self._kernel.SimOptions.from_json(_compact(physics_options(json.loads(options.to_json()), self.draw)))
        return self._kernel.simulate(system, shot, opts, **kw)

    def batch_simulate(self, *args, **kw):
        raise RuntimeError("the physics view serves single executed strokes (simulate) only")

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return getattr(self.__dict__["_kernel"], name)
