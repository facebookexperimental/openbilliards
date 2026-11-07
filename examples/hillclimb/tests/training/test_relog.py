# Copyright (c) Meta Platforms, Inc. and affiliates.

"""hillclimb_examples.training.relog: the break-ball and 14th-ball laws, the label, and the
committed fixture.

Kernel-free except the last class, which re-logs tiny fresh games and prepares the leaves of a
fresh 14th-ball position (skipped without the kernel).
"""

import copy
import math
import pathlib
import unittest

from hillclimb import adapter, crn
from hillclimb_examples.models import v
from hillclimb_examples.training import datagen, relog
from straightpool import game as rules
from tests.training import fresh

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "hillclimb_examples/training/fixtures"


class LawTest(unittest.TestCase):
    def test_the_break_ball_is_the_one_ball_the_stroke_left(self):
        before = {0: (0.0, -0.5), 4: (0.1, 0.2), 9: (-0.3, 0.9)}
        self.assertEqual(relog.break_ball(before, [4]), 9)
        self.assertEqual(relog.break_ball(before, [9, 0]), 4)
        self.assertIsNone(relog.break_ball(before, []))
        self.assertIsNone(relog.break_ball(before, [4, 9]))
        three = {0: (0.0, 0.0), 1: (0.1, 0.1), 2: (0.2, 0.2), 3: (0.3, 0.3)}
        self.assertEqual(relog.break_ball(three, [1, 3]), 2)

    def test_a_fourteenth_ball_decision_has_the_cue_and_two_balls(self):
        self.assertTrue(relog.is_fourteenth({0: (0, 0), 5: (1, 1), 6: (2, 2)}))
        self.assertFalse(relog.is_fourteenth({5: (1, 1), 6: (2, 2)}))
        self.assertFalse(relog.is_fourteenth({0: (0, 0), 5: (1, 1)}))
        self.assertFalse(relog.is_fourteenth({0: (0, 0), 5: (1, 1), 6: (2, 2), 7: (3, 3)}))
        self.assertEqual(relog.object_balls({0: (0, 0), 7: (1, 1), 2: (2, 2)}), [2, 7])

    def test_the_label_is_the_missed_share(self):
        self.assertEqual(relog.label(32, 32), 0.0)
        self.assertEqual(relog.label(0, 32), 1.0)
        self.assertEqual(relog.label(24, 32), 0.25)


@unittest.skipUnless((FIXTURES / "break-rows.jsonl").is_file(), "no committed fixture")
class FixtureTest(unittest.TestCase):
    """The committed re-log fixture: V's rows and the bench leaves."""

    @classmethod
    def setUpClass(cls):
        cls.rows = datagen.read_jsonl(FIXTURES / "break-rows.jsonl")
        cls.entries = datagen.read_jsonl(FIXTURES / "leaves.jsonl")

    def test_break_rows_have_their_schema(self):
        self.assertTrue(self.rows)
        for row in self.rows:
            self.assertEqual(set(row), set(relog.BREAK_KEYS))
            self.assertTrue(0 <= row["make"] <= row["m"])
            self.assertNotEqual(row["break_ball"], relog.CUE)
            self.assertEqual(len(v.features(row["cue"], row["bb"])), v.N_FEATURES)

    def test_leaves_follow_their_fail_bits(self):
        self.assertTrue(self.entries)
        kinds = set()
        for entry in self.entries:
            self.assertTrue(relog.is_fourteenth(datagen.positions_of(entry["position"])))
            for stroke in entry["menu"]:
                self.assertEqual(set(stroke["fails"]) - {"0", "1"}, set())
                for leaf, bit in zip(stroke["leaves"], stroke["fails"]):
                    self.assertEqual(leaf is None, bit == "1")
                    if leaf is not None:
                        kinds.add(leaf["kind"])
                        self.assertIn(leaf["kind"], relog.LEAF_KINDS)
                        self.assertEqual(leaf["cue"] is None, leaf["kind"] != "break")
        self.assertIn("break", kinds)

    def test_the_break_ball_agrees_with_the_rack_template(self):
        """The ball the stroke left is the ball off V's fourteen re-rack sites
        (hillclimb_examples.models.v)."""
        for entry in self.entries:
            for stroke in entry["menu"]:
                for leaf in stroke["leaves"]:
                    if leaf is not None and leaf["kind"] == "break":
                        found = v.break_ball(datagen.positions_of(leaf["position"]))
                        self.assertIsNotNone(found)
                        self.assertEqual(found[0], leaf["break_ball"])
                        self.assertEqual(list(found[1]), leaf["bb"])


@unittest.skipUnless(adapter.available(), "needs pool_py")
class FreshRelogTest(unittest.TestCase):
    """Re-logs of tiny fresh games, and the leaves and break row of a fresh 14th-ball position. No
    kernel output is asserted: the break row needs the position's straight pot to drop, and a
    kernel on which it does not skips that part instead of failing it."""

    @classmethod
    def setUpClass(cls):
        target = datagen.SelfPlay(noise=0.1, cap=4, search=datagen.SMALL,
                                  namespace=fresh.NAMESPACE + "/relog-games")
        cls.records = datagen.generate(fresh.spec(), 3, target=target)

    def test_a_relog_reproduces_its_record_and_repeats(self):
        for record in self.records:
            self.assertEqual(len(list(relog.replay(record))), len(record["strokes"]))
            first = relog.relog(record, m=4, draws=4, keep=2, namespace=fresh.NAMESPACE)
            second = relog.relog(record, m=4, draws=4, keep=2, namespace=fresh.NAMESPACE)
            self.assertEqual(datagen.dumps(first), datagen.dumps(second))

    def test_an_altered_record_is_refused(self):
        record = copy.deepcopy(self.records[0])
        record["strokes"][0]["scored"] = not record["strokes"][0]["scored"]
        with self.assertRaises(relog.ReplayMismatch):
            list(relog.replay(record))

    def test_leaves_and_the_break_row_after_a_fourteenth_ball(self):
        key = crn.game_keys(fresh.NAMESPACE + "/fourteenth", 1)[0]
        game, action = fresh.fourteenth_game(key)
        stream = crn.stream(fresh.NAMESPACE + "/leaf", key)
        menu = relog.leaves_at(game, [action], draws=8, keep=4, noise=0.1, stream_seed=stream)
        self.assertEqual(menu, relog.leaves_at(game, [action], draws=8, keep=4, noise=0.1,
                                               stream_seed=stream))
        self.assertEqual(len(menu[0]["fails"]), 8)
        for leaf, bit in zip(menu[0]["leaves"], menu[0]["fails"]):
            self.assertEqual(leaf is None, bit == "1")
            if leaf is not None and leaf["kind"] == "break":
                found = v.break_ball(datagen.positions_of(leaf["position"]))
                self.assertEqual((found[0], list(found[1])), (leaf["break_ball"], leaf["bb"]))
        before = game.state.positions()
        nxt, judgment, outcome = rules.step(game, action, noise=0.0)
        if not (judgment.scored and nxt.rack_untouched):
            self.skipTest("this kernel does not drop the 14th ball's straight pot, so there is "
                          "no re-rack to take a break row from")
        pocketed = [b for b, _ in outcome.pocketed]
        bb = relog.break_ball(before, pocketed)
        positions = nxt.state.positions()
        aim = math.atan2(positions[bb][1] - positions[relog.CUE][1],
                         positions[bb][0] - positions[relog.CUE][0])
        shot = rules.Action(adapter.Stroke(3.0, aim), rules.Call(bb, 2))
        row = relog.break_row(nxt, shot, before, pocketed, m=4, noise=0.1,
                              stream_seed=crn.stream(fresh.NAMESPACE + "/label", key))
        self.assertEqual(set(row), set(relog.BREAK_KEYS))
        self.assertEqual((row["break_ball"], row["bb"]), (bb, list(positions[bb])))
        self.assertTrue(0 <= row["make"] <= row["m"] == 4)
