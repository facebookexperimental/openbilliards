# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Recorded strokes through the rules' transition (straightpool.game.advance), without the kernel.

Each recorded step holds a game's position and bookkeeping before a stroke, the position it was
played from (the cue ball placed), the call, the kernel's events and rest positions of the
simulated stroke, and the slots of the re-rack it caused, if any. The expected digest is that of
the position and bookkeeping the research implementation of the rules reached on the same stroke;
every stroke was recorded on fresh games made for these tests.
"""

import unittest
from unittest import mock

from hillclimb.adapter import Event, Outcome, Stroke
from straightpool import game as rules
from tests.straightpool import support


def positions(rows):
    return {int(b): (float(x), float(y)) for b, x, y in rows}


def game_before(step):
    return rules.Game(key=0, state=support.TEMPLATE.with_positions(positions(step["position"])),
                      templates=support.TEMPLATE, decision=step["decision"], run=step["run"],
                      in_hand=step["in_hand"], rack_untouched=step["rack_untouched"],
                      reracks=step["reracks"],
                      apex=None if step["apex"] is None else tuple(step["apex"]),
                      racked=tuple(tuple(r) for r in step["racked"]))


def outcome_of(step):
    events = tuple(Event(kind, t, tuple(balls), pocket)
                   for kind, t, balls, pocket in step["events"])
    rest = tuple((int(b), float(x), float(y)) for b, x, y in step["rest"])
    return Outcome(events=events, rest=rest, pocketed=(), off_table=(), first_contact=None)


def view(game):
    return [sorted([b, x, y] for b, (x, y) in game.state.positions().items()), game.in_hand,
            game.run, bool(game.rack_untouched), None if game.apex is None else list(game.apex),
            game.reracks, game.over]


class RecordedTransitionTest(unittest.TestCase):
    def test_every_recorded_stroke_reaches_the_recorded_position(self):
        steps = support.DATA["steps"]
        self.assertGreaterEqual(len(steps), 10)
        for step in steps:
            with self.subTest(game=step["game"], decision=step["decision"]):
                game = game_before(step)
                start = support.TEMPLATE.with_positions(positions(step["start"]))
                slots = [tuple(p) for p in step["slots"]] if step["slots"] else None

                def recorded_slots(key, j):
                    if slots is None:
                        raise AssertionError("this stroke caused no re-rack")
                    return slots

                with mock.patch.object(rules, "rerack_slots", recorded_slots):
                    nxt, judgment = rules.advance(game, start, rules.Call(*step["call"]),
                                                  outcome_of(step))
                got = [list(judgment.fouls), judgment.legal, judgment.scored,
                       judgment.first_contact, judgment.rail_after_contact,
                       [list(p) for p in judgment.object_pots], list(judgment.incidental)]
                self.assertEqual(got, step["judgment"])
                self.assertEqual(support.sha16(view(nxt)), step["expected"])

    def test_the_recorded_strokes_cover_reracks_spot_backs_and_endings(self):
        steps = support.DATA["steps"]
        self.assertGreaterEqual(sum(1 for s in steps if s["slots"]), 2)
        self.assertGreaterEqual(sum(1 for s in steps if s["judgment"][6]), 1)
        self.assertGreaterEqual(sum(1 for s in steps if not s["judgment"][2]), 1)

    def test_an_ended_game_keeps_its_position_and_a_cap_ends_it(self):
        step = next(s for s in support.DATA["steps"] if s["judgment"][2] and not s["slots"])
        game = game_before(step)
        start = support.TEMPLATE.with_positions(positions(step["start"]))
        nxt, _ = rules.advance(game, start, rules.Call(*step["call"]), outcome_of(step),
                               cap=game.run + 1)
        self.assertEqual((nxt.over, nxt.run, nxt.decision), ("CAP", game.run + 1, game.decision))
        miss = Outcome(events=(Event("strike", 0.0, (0,)),), rest=tuple(
            (b, x, y) for b, (x, y) in start.positions().items()), pocketed=(), off_table=(),
            first_contact=None)
        ended, judgment = rules.advance(game, start, rules.Call(*step["call"]), miss)
        self.assertEqual(ended.over, "FOUL")
        self.assertEqual(judgment.fouls, ("NO_CONTACT",))
        self.assertEqual(ended.state, game.state)
        self.assertEqual(ended.in_hand, "none")

    def test_step_refuses_an_ended_game_and_a_give_up_ends_it(self):
        step = support.DATA["steps"][0]
        game = game_before(step)
        over, judgment, out = rules.step(game, rules.Action(Stroke(1.0, 0.0), None), noise=0.1)
        self.assertEqual((over.over, judgment, out), ("NO_DECLARABLE_POT", rules.NO_STROKE, None))
        with self.assertRaises(ValueError):
            rules.step(over, rules.Action(Stroke(1.0, 0.0), None), noise=0.1)


if __name__ == "__main__":
    unittest.main()
