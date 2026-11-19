# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Tests for hand_noise_law: standard library only, no kernel (a stub stands in), no files written.
Run here: python3 -B -m unittest -v. Inputs are exact binary fractions from a fixed-label SplitMix64 stream.
"""

import ast
import copy
import hashlib
import json
import math
import os
import struct
import sys
import types
import unittest
from fractions import Fraction

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import hand_noise_law as law  # noqa: E402
import noise_stream as ns  # noqa: E402

M64 = (1 << 64) - 1
S1X = law.SIGMA_1X
LEVELS = (0.0, 0.1, 0.3, 0.5, 0.8, 1.0, 2.0)
SHAPES = ("off", "tip", "tipspec", "speed", "physics", "tip+speed", "tipspec+speed", "speed+physics", "all")


def bits(xs):
    xs = [float(x) for x in xs]
    return struct.pack(f"<{len(xs)}d", *xs)


def u64s(label, n):
    state = int(hashlib.sha256(("hand-noise-law tests/" + label).encode()).hexdigest()[:16], 16)
    out = []
    for _ in range(n):
        state = (state + ns.GOLDEN_GAMMA) & M64
        out.append(ns.splitmix64(state))
    return out


def sym(u, p2):  # an integer in [-2**52, 2**52) times 2**-p2: exact
    return ((u >> 11) - (1 << 52)) * 2.0**-p2


def unit(u):  # an integer in [0, 2**53) times 2**-53: exact, in [0, 1)
    return (u >> 11) * 2.0**-53


EDGE_ACTIONS = [[0.0] * 7, [-0.0] * 7, [1.0, 0.0, -0.0, 0.0, -0.0, 0.0, -0.0], [-3.0, 1.0, 0.1, 0.2, -0.2, 0.3, -0.3],
                [20.0, 6.0, 1.5, 0.4, -0.4, 0.5, -0.5], [5e-324, 1e-300, 0.0, -5e-324, 5e-324, 0.0, 0.0]]
EDGE_EPS = [(0.0,) * 5, (-0.0,) * 5, (8.0, -8.0, 1e-300, -1e-300, 5e-324), (-4.0, 4.0, -0.5, 3.0, -3.0)]


def corpus(label, n=24):
    us = u64s(label, 12 * n)
    acts = [[unit(us[12 * j]) * 14.0 + 0.25, unit(us[12 * j + 1]) * 6.25, unit(us[12 * j + 2]) * 0.25]
            + [sym(us[12 * j + k], 54) for k in (3, 4)] + [sym(us[12 * j + k], 52) for k in (5, 6)] for j in range(n)]
    epss = [tuple(sym(us[12 * j + 7 + k], 50) for k in range(5)) for j in range(n)]  # entries in [-4, 4)
    return [(a, e) for a in acts + EDGE_ACTIONS for e in epss[:6] + EDGE_EPS]


def nominal_state():
    def ball(i, x):
        return {"id": i, "params": {"m": 0.17, "r": 0.028575, "u_s": 0.2, "u_r": 0.01, "u_sp": 0.0057},
                "state": {"pos": [x, 0.5, 0.028575], "vel": [0.0, 0.0, 0.0], "motion": "stationary"}}
    table = {"width": 1.27, "length": 2.54,
             "cushion_response": {"e0": 0.85, "k_v": 0.0, "v_ref": 1.0, "e_min": 0.6, "e_max": 0.98}}
    return {"balls": [ball(0, 0.1), ball(1, 0.4), ball(2, 0.7)], "table": table}


def nominal_options():
    return {"max_events": 500, "t_max": 30.0, "bb_friction": {"a": 0.009951, "b": 0.108, "c": 1.088},
            "cushion_model": "Han2005"}


def stub_kernel():
    """A stand-in kernel module: records what reaches it. Its options and states keep their JSON text
    (to_json), as the kernel's do; SystemState(text) and nine_ball_rack build nominal states."""
    calls = []

    class Text:
        def __init__(self, text):
            self.text = text

        def to_json(self):
            return self.text

    class Options(Text):
        pass

    class SystemState(Text):
        pass

    def options_from_json(s):
        calls.append(("options", s))
        return Options(s)

    def state_from_json(s):
        calls.append(("state", s))
        return SystemState(s)

    def nine_ball_rack(seed):
        st = nominal_state()
        st["balls"][1]["state"]["pos"][0] = 0.4 + seed * 2.0**-8
        return SystemState(json.dumps(st))

    def simulate(system, shot, options):
        calls.append(("simulate", system, shot, options.text))
        return "RECORD"

    Options.from_json = staticmethod(options_from_json)
    SystemState.from_json, SystemState.nine_ball_rack = staticmethod(state_from_json), staticmethod(nine_ball_rack)
    SystemState.label, SystemState.kind = staticmethod(lambda seed: ("RACK", seed)), "SystemState"
    SystemState._hidden = 1
    return types.SimpleNamespace(calls=calls, SystemState=SystemState, SimOptions=Options, simulate=simulate,
                                 batch_simulate=lambda *a, **k: "BATCH", _hidden=1)


class UnitsAndShapesTest(unittest.TestCase):
    def test_units_as_applied(self):
        self.assertEqual(bits(S1X), bits((0.075, math.radians(0.125), math.radians(0.1), 0.0005, 0.0005)))
        self.assertEqual((law.TIP_SIGMA_R, law.SPEED_CV), (0.6e-3 / 0.028575, 0.045))
        radius_mm = Fraction("28.575")
        applied_mm = Fraction("0.0005") * radius_mm  # the convention's 0.0005, read in R
        self.assertEqual(applied_mm, Fraction("0.0142875"))  # 14.2875 um
        self.assertEqual(applied_mm / Fraction("0.5"), Fraction("0.028575"))  # about 1/35 of the printed 0.5 mm
        self.assertEqual(Fraction("0.6") / radius_mm, Fraction(8, 381))  # the hand's tip in R, exactly
        self.assertLessEqual(abs(Fraction(law.TIP_SIGMA_R) - Fraction(8, 381)), Fraction(law.TIP_SIGMA_R) * 2**-52)
        for r in LEVELS:
            self.assertEqual(law.sigma_ab(r, "off"), (r * 0.0005, r * 0.0005))
            self.assertEqual(law.sigma_ab(r, "tipspec")[0], r * 0.5e-3 / 0.028575)
            self.assertEqual(law.sigma_ab(r, "tip"), (law.TIP_SIGMA_R, law.TIP_SIGMA_R))
        for shape, mm in (("tip", 0.6), ("tipspec", 0.5), ("off", 0.0142875)):
            self.assertAlmostEqual(law.describe(1.0, shape)["sigma_tip_mm"], mm, places=12)

    def test_shape_parsing_and_names(self):
        self.assertEqual(law.shape_of("off"), frozenset())
        self.assertEqual(law.shape_of(" ALL "), frozenset(("tip", "speed", "physics")))
        self.assertEqual(law.shape_of("speed+tip"), frozenset(("tip", "speed")))
        names = [law.shape_name(s) for s in ("speed+tip", ["tip", "speed", "physics"], ())]
        self.assertEqual(names, ["tip+speed", "all", "off"])
        for bad in ("aim", "tip+", "", "off+tip", ["tip", "x"], "tip+tipspec", ["tipspec", "tip"]):
            with self.assertRaises(ValueError):
                law.shape_of(bad)

    def test_level_and_input_checks(self):
        for bad, exc in ((True, TypeError), (None, TypeError), ("0.5", TypeError), (-0.1, ValueError),
                         (float("nan"), ValueError), (float("inf"), ValueError)):
            with self.assertRaises(exc):
                law.check_level(bad)
        self.assertIs(law.check_level(0), 0)
        z5 = (0.0,) * 5
        for fn in (lambda: law.noisy_action([1.0] * 7, z5, -1.0), lambda: law.sigmas(-1.0, 2.0),
                   lambda: law.noisy_stroke([1.0] * 5, z5, float("nan")), lambda: law.make_executor(-1.0, "off"),
                   lambda: law.noisy_action([1.0] * 6, z5, 0.5), lambda: law.noisy_stroke([1.0] * 7, z5, 0.5),
                   lambda: law.sigma_v(0.5, 3.0, "speed", speed_cv=-0.01),
                   lambda: law.make_executor(1.0, "off", speed_cv=-0.01)):
            with self.assertRaises(ValueError):
                fn()


class LawTest(unittest.TestCase):
    def test_no_action_channel_is_the_convention_operand_for_operand(self):
        for r in LEVELS:
            for a, e in corpus("off"):
                want = [a[i] + r * S1X[i] * e[i] for i in range(5)] + a[5:7]
                for shape in ("off", "physics"):
                    self.assertEqual(bits(law.noisy_action(a, e, r, shape)), bits(want))
                    if r > 0:
                        self.assertEqual(bits(law.noisy_stroke(a[:5], e, r, shape)), bits(want[:5]))

    def test_stroke_form_identity_at_zero_else_action_arithmetic(self):
        for a, e in corpus("zero", 8):
            for r in (0.0, -0.0, 0):
                for shape in SHAPES:
                    self.assertEqual(bits(law.noisy_stroke(a[:5], e, r, shape)), bits(a[:5]))
            for r, cv, shape in ((r, cv, s) for r in LEVELS[1:] for cv in (law.SPEED_CV, 0.08) for s in SHAPES):
                want = law.noisy_action(a, e, r, shape, speed_cv=cv)[:5]  # r > 0; 0.08 is a caller-set CV
                self.assertEqual(bits(law.noisy_stroke(a[:5], e, r, shape, speed_cv=cv)), bits(want))

    def test_aim_and_elevation_never_change_with_the_shape(self):
        for r in LEVELS:
            for a, e in corpus("aim", 8):
                ref, ref5 = law.noisy_action(a, e, r, "off"), law.noisy_stroke(a[:5], e, r, "off")
                for shape in SHAPES:
                    got = law.noisy_action(a, e, r, shape)
                    self.assertEqual(bits(got[1:3] + got[5:7]), bits(ref[1:3] + ref[5:7]))
                    self.assertEqual(bits(law.noisy_stroke(a[:5], e, r, shape)[1:3]), bits(ref5[1:3]))
            for shape in SHAPES:
                self.assertEqual(law.sigmas(r, 2.0, shape)[1:3], (r * S1X[1], r * S1X[2]))

    def test_tip_channels(self):
        for r in LEVELS:
            for v in (0.5, 3.0, 12.0):
                self.assertEqual(law.sigmas(r, v, "tip")[3:], (law.TIP_SIGMA_R, law.TIP_SIGMA_R))
                self.assertEqual(law.sigmas(r, v, "tipspec")[3:], (r * 0.0005 / 0.028575,) * 2)
            for a, e in corpus("tip", 8):
                got = law.noisy_action(a, e, r, "tip")
                self.assertEqual(bits(got[3:5]), bits([a[3] + law.TIP_SIGMA_R * e[3], a[4] + law.TIP_SIGMA_R * e[4]]))
                self.assertEqual(bits(got[:1]), bits(law.noisy_action(a, e, r, "off")[:1]))  # speed untouched
        names = [law.describe(1.0, s)["tip_law"] for s in ("tip+speed", "tipspec", "off")]
        self.assertEqual(names, ["fixed-0.6-mm", "scaled-0.5-mm", "scaled-0.0005-R"])

    def test_speed_channel(self):
        c = law.SPEED_CV
        for r in LEVELS:
            floor, prev = r * S1X[0], -1.0
            for k in range(161):
                sv, vc = law.sigma_v(r, k * 0.1, "speed"), law.commanded_speed(k * 0.1)
                self.assertEqual(sv, max(floor, c * vc))
                self.assertGreaterEqual(sv, prev)
                prev = sv
                if c * vc <= floor:
                    self.assertEqual(bits([sv]), bits([floor]))  # the convention below the crossover
            for (a, e), cv in ((ae, cv) for ae in corpus("speed", 8) for cv in (c, 0.08)):  # 0.08: a caller-set CV
                got = law.noisy_action(a, e, r, "speed", speed_cv=cv)
                self.assertEqual(bits(got[:1]), bits([a[0] + max(floor, cv * law.commanded_speed(a[0])) * e[0]]))
                self.assertEqual(bits(got[3:5]), bits(law.noisy_action(a, e, r, "off")[3:5]))  # tip untouched
        self.assertEqual([law.commanded_speed(v) for v in (-3.0, 0.0, -0.0, 20.0)], [3.0, 1e-3, 1e-3, 15.0])
        self.assertEqual(law.sigma_v(0.5, 9.0, "speed", speed_cv=0.08), 0.08 * 9.0)  # a caller-set CV
        self.assertEqual(law.sigma_v(0.5, 9.0, "speed", speed_cv=0.0), 0.5 * 0.075)
        self.assertEqual([law.describe(0.5, "speed", speed_cv=cv)["speed_cv"] for cv in (0.0, 0.08)], [0.0, 0.08])
        self.assertIsNone(law.describe(0.5, "speed", speed_cv=0.0)["speed_crossover_mps"])

    def test_executor_and_projection(self):
        acts = [a for a, _ in corpus("exec", 6)][::10]
        for r, cv in ((0.3, law.SPEED_CV), (1.0, 0.08)):  # 0.08: a caller-set CV
            for shape in ("off", "all", "tipspec+speed"):
                ident, proj = law.make_executor(r, shape, tuple, speed_cv=cv), law.make_executor(r, shape, speed_cv=cv)
                for d, a in enumerate(acts):
                    want = law.noisy_action(a, ns.standard_normals(d + 5, d), r, shape, speed_cv=cv)
                    self.assertEqual(bits(ident(d + 5, d, a)), bits(want))
                    self.assertEqual(bits(proj(d + 5, d, a)), bits(law.project_stroke(want)))
        fixed = law.make_executor(1.0, "off", project=tuple, normals=lambda s, d: (1.0, 0.0, 0.0, 0.0, 0.0))
        self.assertEqual(fixed(1, 0, [2.0] + [0.0] * 6)[0], 2.0 + 0.075)
        with self.assertRaises(TypeError):
            law.make_executor(1.0, "off", project=3)
        for a, e in corpus("proj", 8):
            for r in (1.0, 2.0e3):  # a large level pushes strokes far outside validity
                noisy = law.noisy_action(a, e, r, "all")
                p = law.project_stroke(noisy)
                self.assertTrue(law.V0_MIN <= p[0] <= law.V0_MAX and 0.0 <= p[1] <= 2 * math.pi)
                self.assertTrue(0.0 <= p[2] < math.pi / 2 and p[3] ** 2 + p[4] ** 2 <= 0.25)
                self.assertEqual((p[5:], p[:5]), (tuple(noisy[5:]), law.project_stroke(noisy[:5])))  # 5 entries alike
        for bad in ([1.0] * 6, [float("nan")] + [0.0] * 4, [1.0, float("inf"), 0.0, 0.0, 0.0]):
            with self.assertRaises(ValueError):
                law.project_stroke(bad)

    def test_projection_leaves_a_point_mass_at_a_bound(self):
        # the errors are zero-mean before project_stroke only: a draw beyond a bound lands on it (README)
        n, sd = 2000, S1X[2]  # theta's sigma at r = 1, rad
        eps = [ns.standard_normals(77, j) for j in range(n)]
        out = [law.project_stroke(law.noisy_stroke([law.V0_MAX, 1.0, 0.0, 0.0, 0.0], e, 1.0)) for e in eps]
        theta, v0 = [p[2] for p in out], [p[0] for p in out]
        zeros = sum(1 for t in theta if t == 0.0)
        self.assertEqual(zeros, sum(1 for e in eps if e[2] <= 0.0))  # every draw at or below 0 executes 0 exactly
        self.assertTrue(0.45 < zeros / n < 0.55)
        mean = math.fsum(theta) / n  # E max(0, sd eps) = sd / sqrt(2 pi) > 0
        self.assertAlmostEqual(mean / (sd / math.sqrt(2 * math.pi)), 1.0, delta=0.1)
        self.assertEqual(sum(1 for v in v0 if v == law.V0_MAX), sum(1 for e in eps if e[0] >= 0.0))  # the ceiling alike
        self.assertLess(math.fsum(v0) / n, law.V0_MAX)  # a negative bias below it

    def test_describe(self):
        d = law.describe(0.5, "all")
        self.assertEqual((d["law"], d["shape"], d["speed_cv"]), (law.LAW_ID, "all", law.SPEED_CV))
        self.assertEqual(d["sigma_v_mps_at"][-1], [12.0, law.SPEED_CV * 12.0])
        self.assertAlmostEqual(d["speed_crossover_mps"], 0.5 * 0.075 / law.SPEED_CV, places=15)
        self.assertEqual([round(d[k], 15) for k in ("sigma_phi_deg", "sigma_theta_deg")], [0.0625, 0.05])
        self.assertIsNone(law.describe(0.5, "off")["speed_cv"])
        json.dumps(d)

    def test_law_arithmetic_is_interpreter_independent(self):
        # +, -, *, /, abs, min and max only: no sum(), fsum, hypot, dist or prod in the law's functions
        forbidden = {("", "sum"), ("math", "fsum"), ("math", "hypot"), ("math", "dist"), ("math", "prod")}
        names = {"commanded_speed", "sigma_v", "sigma_ab", "sigmas", "noisy_action", "noisy_stroke", "physics_draw"}
        with open(os.path.join(HERE, "hand_noise_law.py"), encoding="utf-8") as f:
            tree = ast.parse(f.read())
        found = set()
        for fn in (n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names):
            found.add(fn.name)
            for node in (n for n in ast.walk(fn) if isinstance(n, ast.Call)):
                f = node.func
                owner = f.value.id if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) else ""
                key = (owner, f.attr) if isinstance(f, ast.Attribute) else ("", getattr(f, "id", "?"))
                self.assertNotIn(key, forbidden, f"{fn.name} calls {key}")
        self.assertEqual(found, names)


class PhysicsTest(unittest.TestCase):
    def test_ranges_follow_the_centred_rule_exactly(self):
        want = {"e0": (0.78, 0.92), "u_s": (0.178, 0.222), "u_r": (0.0095, 0.0105), "throw": (1.0, 1.0)}
        self.assertEqual(law.PHYSICS_RANGES, want)
        self.assertEqual(law.PHYSICS_SPREAD, {"e0": ("0.75", "0.92"), "u_s": ("0.178", "0.245"),
                                              "u_r": ("0.0090", "0.0105"), "throw": ("1", "2.5")})
        for name, (lo, hi) in law.PHYSICS_RANGES_EXACT.items():
            c = Fraction(law.PHYSICS_CENTRE[name])
            plo, phi = (Fraction(x) for x in law.PHYSICS_SPREAD[name])
            self.assertTrue(plo <= lo <= c <= hi <= phi and (lo + hi) / 2 == c)
            self.assertTrue(lo == plo or hi == phi)  # the widest: it touches the nearer edge
        self.assertEqual(law.PHYSICS_CENTRE["e0"], str(law.PHYSICS_NOMINAL["e0"]))
        with self.assertRaises(ValueError):
            law.centred_range("0.5", ("0.6", "0.9"))

    def test_draws(self):
        seen = set()
        for j in range(200):
            d = law.physics_draw(law.physics_key(f"game:{j}"))
            for name in law.PHYSICS_ORDER:
                lo, hi = law.PHYSICS_RANGES[name]
                self.assertTrue(lo <= d["values"][name] <= hi)
            self.assertEqual(d, law.physics_draw(law.physics_key(f"game:{j}")))
            self.assertEqual(d["values"]["throw"], 1.0)
            seen.add(d["key_sha16"])
        self.assertEqual(len(seen), 200)
        for key in [0, M64] + u64s("arith", 64):  # value = lo + (hi - lo) * u, bit for bit
            state, want = key, {}
            for name in law.PHYSICS_ORDER:
                state = (state + ns.GOLDEN_GAMMA) & M64
                lo, hi = law.PHYSICS_RANGES[name]
                want[name] = lo + (hi - lo) * (((ns.splitmix64(state) >> 11) + 1) * 2.0**-53)
            self.assertEqual({k: x.hex() for k, x in law.physics_draw(key)["values"].items()},
                             {k: x.hex() for k, x in want.items()})
        self.assertNotEqual(law.physics_key("x"), law.physics_key("x", tag="another tag@"))
        for bad in (True, -1, 1 << 64, 1.5, "x"):
            with self.assertRaises(ValueError):
                law.physics_draw(bad)

    def test_state_and_options_transforms(self):
        state, opts = nominal_state(), nominal_options()
        snap = copy.deepcopy((state, opts))
        d = law.physics_draw(law.physics_key("transforms"))
        v = d["values"]
        s2, o2 = law.physics_state(state, d), law.physics_options(opts, d)
        self.assertEqual((state, opts), snap)  # inputs never mutated
        for b0, b1 in zip(state["balls"], s2["balls"]):
            self.assertEqual((b1["params"]["u_s"], b1["params"]["u_r"]), (v["u_s"], v["u_r"]))
            rest = [{k: x for k, x in b["params"].items() if k not in ("u_s", "u_r")} for b in (b0, b1)]
            self.assertEqual((rest[0], b0["state"], b0["id"]), (rest[1], b1["state"], b1["id"]))
        cr0, cr1 = state["table"]["cushion_response"], s2["table"]["cushion_response"]
        self.assertEqual(cr1["e0"], v["e0"])
        self.assertEqual({k: x for k, x in cr0.items() if k != "e0"}, {k: x for k, x in cr1.items() if k != "e0"})
        self.assertEqual(bits(o2["bb_friction"].values()), bits(opts["bb_friction"].values()))  # throw held at 1.0
        del o2["bb_friction"]
        self.assertEqual(o2, {k: x for k, x in opts.items() if k != "bb_friction"})
        state_bad = (lambda s: s["table"]["cushion_response"].update(e0=0.9),
                     lambda s: s["table"]["cushion_response"].update(k_v=0.1),
                     lambda s: s["balls"][0]["params"].update(u_r=0.016),
                     lambda s: s["balls"][-1]["params"].update(u_s=0.25), lambda s: s.update(balls=[]))
        options_bad = (lambda o: o.update(cushion_model="Mathavan2010"), lambda o: o["bb_friction"].update(a=0.019902))  # twice the default a
        for fn, make, mutations in ((law.physics_state, nominal_state, state_bad),
                                    (law.physics_options, nominal_options, options_bad)):
            for mutate in mutations:  # any equipment but the nominal refuses, never a silent transform
                bad = make()
                mutate(bad)
                with self.assertRaises(RuntimeError):
                    fn(bad, d)
        for bad in ({"law": "x", "values": v}, dict(d, values=dict(v, e0=0.99)), dict(d, values={})):
            with self.assertRaises(ValueError):
                law.physics_state(state, bad)

    def test_view_applies_the_draw_to_the_executed_stroke_only(self):
        k = stub_kernel()
        before = dict(vars(k))
        d = law.physics_draw(law.physics_key("view"))
        view = law.PhysicsView(k, d)
        system = view.SystemState.from_json(json.dumps(nominal_state()))
        self.assertEqual(view.simulate(system, "SHOT", k.SimOptions(json.dumps(nominal_options()))), "RECORD")
        self.assertEqual(json.loads(k.calls[0][1]), law.physics_state(nominal_state(), d))
        self.assertEqual(json.loads(k.calls[1][1]), law.physics_options(nominal_options(), d))
        self.assertEqual((k.calls[2][0], k.calls[2][2], view.counts), ("simulate", "SHOT", {"state": 1, "simulate": 1}))
        others = (view.SystemState.label(3), view.SystemState.kind)  # no to_json, or not callable: as they are
        self.assertEqual(others, (("RACK", 3), "SystemState"))
        self.assertEqual(dict(vars(k)), before)  # the module object is never re-pointed
        self.assertEqual(k.simulate("S", "T", k.SimOptions("{}")), "RECORD")  # the planner's kernel stays nominal
        for call in (lambda: view.batch_simulate([]), lambda: view.simulate(system, "SHOT")):
            with self.assertRaises(RuntimeError):
                call()
        for private in (lambda: view._hidden, lambda: view.SystemState._hidden):  # private names never forward
            with self.assertRaises(AttributeError):
                private()
        with self.assertRaises(ValueError):
            law.PhysicsView(k, {"law": "x"})

    def test_view_constructors_carry_the_draw(self):
        k = stub_kernel()
        d = law.physics_draw(law.physics_key("constructors"))
        view, opts = law.PhysicsView(k, d), k.SimOptions(json.dumps(nominal_options()))
        racked = view.SystemState.nine_ball_rack(5)  # the kernel's constructor, then through the draw
        self.assertEqual(json.loads(racked.to_json()),
                         law.physics_state(json.loads(k.SystemState.nine_ball_rack(5).to_json()), d))
        built = view.SystemState(json.dumps(nominal_state()))  # the class call too
        loaded = view.SystemState.from_json(json.dumps(nominal_state()))  # and from_json, as before
        for system in (built, loaded):
            self.assertEqual(json.loads(system.to_json()), law.physics_state(nominal_state(), d))
        self.assertEqual(view.counts, {"state": 3, "simulate": 0})  # every route counts
        for system in (racked, built, loaded):
            self.assertEqual(view.simulate(system, "SHOT", opts), "RECORD")
        self.assertEqual(view.counts, {"state": 3, "simulate": 3})
        self.assertEqual([c[0] for c in k.calls], ["state"] * 3 + ["options", "simulate"] * 3)

    def test_view_refuses_a_state_without_its_draw(self):
        k = stub_kernel()
        d = law.physics_draw(law.physics_key("refuse"))
        view, opts = law.PhysicsView(k, d), k.SimOptions(json.dumps(nominal_options()))
        drawn = law.physics_state(nominal_state(), d)
        one_ball, table = copy.deepcopy(drawn), copy.deepcopy(drawn)
        one_ball["balls"][-1]["params"]["u_r"] = 0.01  # one ball left nominal
        table["table"]["cushion_response"]["e0"] = 0.85  # the table left nominal
        other = law.PhysicsView(k, law.physics_draw(law.physics_key("another game")))
        states = (k.SystemState.from_json(json.dumps(nominal_state())),  # the planner's kernel: no draw
                  k.SystemState.nine_ball_rack(5),  # the kernel's constructor, not the view's
                  other.SystemState.from_json(json.dumps(nominal_state())),  # another game's draw
                  k.SystemState(json.dumps(one_ball)), k.SystemState(json.dumps(table)),
                  ("STATE", json.dumps(drawn)), None)  # no to_json
        for system in states:
            with self.assertRaises(RuntimeError) as caught:
                view.simulate(system, "SHOT", opts)
            self.assertIn("view.SystemState", str(caught.exception))  # it names how to build the state
        self.assertEqual(view.counts["simulate"], 0)
        self.assertNotIn("simulate", [c[0] for c in k.calls])  # nothing reached the kernel's simulate
        self.assertEqual(view.simulate(k.SystemState(json.dumps(drawn)), "SHOT", opts), "RECORD")  # the drawn values

    def test_view_refuses_a_drawn_state_with_another_cushion_response(self):
        # a caller rebuilds a drawn state's JSON with one cushion field changed: the kernel would clamp
        # e(v) to it, so simulate refuses it as it refuses a state without the draw
        k = stub_kernel()
        d = law.physics_draw(law.physics_key("cushion"))
        view, opts = law.PhysicsView(k, d), k.SimOptions(json.dumps(nominal_options()))
        drawn = law.physics_state(nominal_state(), d)
        for field, value in (("e_max", 0.7), ("e_min", 0.8), ("v_ref", 2.0), ("k_v", 0.1), ("e_max", None)):
            with self.subTest(field=field, value=value):
                bad = copy.deepcopy(drawn)
                bad["table"]["cushion_response"][field] = value
                if value is None:
                    del bad["table"]["cushion_response"][field]
                with self.assertRaises(RuntimeError) as caught:
                    view.simulate(k.SystemState(json.dumps(bad)), "SHOT", opts)
                self.assertIn("view.SystemState", str(caught.exception))
        self.assertEqual(view.counts["simulate"], 0)
        self.assertEqual(view.simulate(k.SystemState(json.dumps(drawn)), "SHOT", opts), "RECORD")

    def test_state_refuses_a_non_nominal_restitution_clamp(self):
        # e(v) = clamp(e0 + k_v (v - v_ref), e_min, e_max): another e_min or e_max could cap or lift the drawn e0
        d = law.physics_draw(law.physics_key("clamp"))
        for field, value in (("e_max", 0.85), ("e_min", 0.8), ("v_ref", 2.0), ("e_max", 0.92), ("e_min", 0.78),
                             ("e_max", None)):
            with self.subTest(field=field, value=value):
                bad = nominal_state()
                bad["table"]["cushion_response"][field] = value
                if value is None:
                    del bad["table"]["cushion_response"][field]
                with self.assertRaises(RuntimeError):
                    law.physics_state(bad, d)
        cr = law.physics_state(nominal_state(), d)["table"]["cushion_response"]
        clamp = {"v_ref": 1.0, "e_min": 0.6, "e_max": 0.98}  # the kernel's CushionResponse defaults
        self.assertEqual({f: cr[f] for f in clamp}, clamp)
        self.assertEqual({f: law.PHYSICS_NOMINAL[f] for f in clamp}, clamp)


class ReadmeTest(unittest.TestCase):
    def test_the_zero_mean_claim_names_the_projection(self):
        with open(os.path.join(HERE, "README.md"), encoding="utf-8") as f:
            paragraphs = [" ".join(p.split()) for p in f.read().split("\n\n")]
        claims = [p for p in paragraphs if "zero-mean" in p]
        projection = [p for p in paragraphs if "a total projection" in p]
        self.assertTrue(claims and projection)
        for p in claims + projection:  # wherever the mean or the projection is described, the clamp's effect is named
            self.assertIn("project_stroke", p)
            self.assertIn("point mass", p)
            self.assertIn("biased mean", p)


if __name__ == "__main__":
    unittest.main()
