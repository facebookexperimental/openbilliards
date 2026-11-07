# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The closed-form laws behind a declaration: cut, makeability, leave target and band."""

import math
import unittest

from straightpool.candidates import Candidate, Intent
from straightpool.leave import brush, laws
from tests import platforms
from tests.leave import support

T = support.TABLE
R = T.ball_radius


def cand(ball, pocket, shot_class="pot", index=0, place=None):
    return Candidate(index, Intent(ball, pocket, shot_class), support.STROKE, "ghost-ball", place)


class CutTest(unittest.TestCase):
    def test_straight_in_is_a_zero_cut(self):
        positions = {0: (-0.3, 0.0), 1: (0.3, 0.0)}
        self.assertEqual(laws.cut_deg(positions[0], positions, cand(1, 4), T), 0.0)

    def test_a_thirty_degree_cut(self):
        ball = (0.2, 0.0)
        pocket = T.pockets[4]
        axis = ((pocket[0] - ball[0]) / math.hypot(pocket[0] - ball[0], pocket[1] - ball[1]), 0.0)
        ghost = (ball[0] - 2 * R * axis[0], 0.0)
        a = math.radians(30.0)
        cue = (ghost[0] - 0.4 * math.cos(a), ghost[1] - 0.4 * math.sin(a))
        positions = {0: cue, 1: ball}
        self.assertAlmostEqual(laws.cut_deg(cue, positions, cand(1, 4), T), 30.0, places=9)

    def test_in_hand_aims_from_the_placement(self):
        positions = {1: (0.3, 0.0)}
        self.assertEqual(laws.cut_deg(None, positions, cand(1, 4, place=(-0.3, 0.0)), T), 0.0)
        self.assertEqual(laws.aim_point(positions, cand(1, 4, place=(-0.3, 0.1))), (-0.3, 0.1))
        self.assertEqual(laws.aim_point(positions, cand(1, 4)), (0.0, 0.0))

    def test_undefined_cuts_are_none(self):
        positions = {0: (-0.3, 0.0), 1: (0.3, 0.0)}
        self.assertIsNone(laws.cut_deg(positions[0], positions, cand(1, None, "safety"), T))
        self.assertIsNone(laws.cut_deg(positions[0], positions, cand(2, 4), T))
        ghost = (0.3 - 2 * R, 0.0)
        self.assertIsNone(laws.cut_deg(ghost, {0: ghost, 1: (0.3, 0.0)}, cand(1, 4), T))


class SideTest(unittest.TestCase):
    def test_prefer_side(self):
        self.assertEqual(laws.prefer_side((0.0, 0.0), (1.0, 0.0), (0.5, 0.2)), 1)
        self.assertEqual(laws.prefer_side((0.0, 0.0), (1.0, 0.0), (0.5, -0.2)), -1)
        self.assertEqual(laws.prefer_side((0.0, 0.0), (1.0, 0.0), (2.0, 0.0)), 1)


class DirectPotTest(unittest.TestCase):
    def test_only_callable_direct_pots_in_order(self):
        positions = {0: (-0.3, 0.0), 1: (0.3, 0.0), 2: (0.0, 0.8)}
        cands = [cand(1, 4, "safety", 0), cand(1, None, "pot", 1), cand(3, 4, "pot", 2),
                 cand(1, 4, "bank-pot", 3), cand(1, 4, "position-pot", 4), cand(2, 5, "pot", 5),
                 cand(1, 4, "pot", 6)]
        rows = laws.direct_pots(positions, cands, T)
        self.assertEqual([r.candidate.index for r in rows], [4, 5, 6])
        self.assertEqual(rows[0].cut_deg, 0.0)
        self.assertEqual(rows[0].make, rows[2].make)

    def test_counts_equal_the_reference(self):
        for name in ("mid-rack", "in-hand", "blocked-leg"):
            d = support.decision(name)
            positions = support.positions(d["positions"])
            cands = support.candidates(d["candidates"])
            for painter, expected in d["expected"].items():
                with self.subTest(decision=name, painter=painter):
                    rows = laws.direct_pots(positions, cands, T, both_legs=painter == "v0.2")
                    self.assertEqual(len(rows), expected["meta"]["n_direct_pot"])
                    self.assertEqual(sum(r.make > 0.0 for r in rows), expected["meta"]["n_live"])

    def test_brush_v02_refuses_the_blocked_object_leg(self):
        positions = support.positions(support.decision("blocked-leg")["positions"])
        v01 = laws.make(positions[0], 1, 2, positions, T, both_legs=False)
        v02 = laws.make(positions[0], 1, 2, positions, T, both_legs=True)
        self.assertGreater(v01, 0.9)
        self.assertEqual(v02, 0.0)
        bed = brush.cloth(T)
        self.assertTrue(brush.object_leg_blocked(
            brush.scene_from_kernel(positions[1], T), bed.pockets[2],
            laws.scene_blockers(positions, T), 1, bed))


class LeaveTest(unittest.TestCase):
    def test_surface_argmax_equals_the_reference(self):
        d = support.decision("two-balls")
        positions = support.positions(d["positions"])
        m = d["expected"]["v0.2"]["meta"]
        # the surface sum adds grid values that pass through libm, which rounds by platform
        platforms.assert_close(self, laws.surface_argmax(positions, m["ball"], T),
                               (m["surface_ball"], m["surface_pocket"], m["surface_sum"]))

    def test_two_balls_leave_without_a_band(self):
        d = support.decision("two-balls")
        positions = support.positions(d["positions"])
        m = d["expected"]["v0.2"]["meta"]
        surface, program, info = laws.leave_program(positions, m["ball"], T)
        self.assertEqual(surface, (m["surface_ball"], m["surface_pocket"]))
        self.assertEqual(program, {"rail_policy": {"mode": "penalize", "severity": 1.0}})
        platforms.assert_close(self, info, {"surface_sum": m["surface_sum"],  # libm, as above
                                            "ball_after_next": None, "prefer_side": None})

    def test_last_ball_leaves_nothing_to_paint_for(self):
        d = support.decision("last-ball")
        positions = support.positions(d["positions"])
        surface, program, info = laws.leave_program(positions, 1, T)
        self.assertIsNone(surface)
        self.assertEqual(program, {"rail_policy": {"mode": "penalize", "severity": 1.0}})
        self.assertEqual(info, {"surface_sum": None, "ball_after_next": None, "prefer_side": None})

    def test_constants_are_read_only(self):
        with self.assertRaises(TypeError):
            laws.RAIL_POLICY["severity"] = 0.5
        with self.assertRaises(TypeError):
            laws.BAND["center_deg"] = 10.0


if __name__ == "__main__":
    unittest.main()
