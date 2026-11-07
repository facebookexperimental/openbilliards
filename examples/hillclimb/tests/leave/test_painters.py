# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Painted declarations on fresh decision states (the recorded games stay private): bit-equal to
the reference painters where the exact pins are on, within a tolerance elsewhere
(tests/platforms.py)."""

import json
import unittest

from straightpool.game import Call
from straightpool.leave import brush, laws, painters
from tests import platforms
from tests.leave import support

T = support.TABLE


def declare(name, painter):
    d = support.decision(name)
    return painters.declare(support.positions(d["positions"]), T,
                            support.candidates(d["candidates"]), painter=painter)


class FixtureTest(unittest.TestCase):
    def test_declarations_and_meta_equal_the_reference(self):
        for d in support.DATA["decisions"]:
            positions = support.positions(d["positions"])
            cands = support.candidates(d["candidates"])
            for painter, expected in d["expected"].items():
                with self.subTest(decision=d["name"], painter=painter):
                    declaration, meta = painters.declare(positions, T, cands, painter=painter)
                    # cut, makeability and grid pass through libm, which rounds by platform
                    support.assert_summary(self, support.summary(declaration),
                                           expected["declaration"])
                    platforms.assert_close(self, meta, expected["meta"])


class BehaviourTest(unittest.TestCase):
    def test_v01_calls_the_pot_whose_object_ball_is_blocked_and_v02_does_not(self):
        positions = support.positions(support.decision("blocked-leg")["positions"])
        bed = brush.cloth(T)
        blockers = laws.scene_blockers(positions, T)

        def leg_blocked(call):
            return brush.object_leg_blocked(brush.scene_from_kernel(positions[call.ball], T),
                                            bed.pockets[call.pocket], blockers, call.ball, bed)

        v01, _ = declare("blocked-leg", "v0.1")
        v02, _ = declare("blocked-leg", "v0.2")
        self.assertEqual(v01.call, Call(1, 2))
        self.assertTrue(leg_blocked(v01.call))
        self.assertNotEqual(v02.call, v01.call)
        self.assertFalse(leg_blocked(v02.call))

    def test_painting_is_deterministic(self):
        first, meta1 = declare("in-hand", "v0.2")
        second, meta2 = declare("in-hand", "v0.2")
        self.assertEqual(first, second)
        self.assertEqual(meta1, meta2)
        self.assertEqual(first.digest(), second.digest())

    def test_no_live_pot_is_no_call(self):
        declaration, meta = declare("no-direct-pot", "v0.2")
        self.assertIs(declaration, painters.NO_CALL)
        self.assertEqual(declaration.as_json(), {"call": None, "candidate": None,
                                                 "family": None, "surface": None, "brush": {},
                                                 "grid": None})
        self.assertTrue(meta["no_call"])

    def test_last_ball_paints_the_neutral_base(self):
        declaration, meta = declare("last-ball", "v0.2")
        self.assertIsNone(declaration.surface)
        self.assertNotIn("angle_band", declaration.brush)
        self.assertEqual(meta["grid_max"], brush.NEUTRAL_BASE)
        self.assertNotIn("surface_ball", meta)

    def test_a_ball_after_next_sets_the_band(self):
        declaration, meta = declare("in-hand", "v0.2")
        band = declaration.brush["angle_band"]
        self.assertEqual({k: band[k] for k in laws.BAND}, dict(laws.BAND))
        self.assertTrue(band["enabled"])
        self.assertEqual(band["prefer_side"], meta["prefer_side"])
        self.assertIsNotNone(meta["ball_after_next"])

    def test_the_declaration_carries_its_family_and_table(self):
        d = support.decision("in-hand")
        cands = support.candidates(d["candidates"])
        declaration, meta = declare("in-hand", "v0.2")
        self.assertEqual(declaration.family, cands[meta["candidate"]].intent)
        self.assertEqual(declaration.candidate, meta["candidate"])
        self.assertIs(declaration.table, T)

    def test_paint_reads_the_game(self):
        d = support.decision("two-balls")
        positions = support.positions(d["positions"])
        cands = support.candidates(d["candidates"])
        game = support.FakeGame(positions)
        expected = painters.declare(positions, T, cands)
        self.assertEqual(painters.paint_with_meta(game, cands), expected)
        self.assertEqual(painters.paint(game, cands), expected[0])
        self.assertEqual(painters.paint(game, cands, painter="v0.1"),
                         painters.declare(positions, T, cands, painter="v0.1")[0])

    def test_unknown_painter_is_refused(self):
        with self.assertRaises(ValueError):
            declare("two-balls", "v0.3")

    def test_json_form(self):
        declaration, _ = declare("two-balls", "v0.2")
        form = declaration.as_json()
        self.assertEqual(json.loads(json.dumps(form)), form)
        self.assertEqual(sorted(form), ["brush", "call", "candidate", "family", "grid",
                                        "surface"])
        self.assertEqual(form["grid"]["nx"] * form["grid"]["ny"], len(form["grid"]["vals"]))


if __name__ == "__main__":
    unittest.main()
