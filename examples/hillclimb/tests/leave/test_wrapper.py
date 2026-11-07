# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Open declarations and the frame-true called-pocket objective, against the reference."""

import types
import unittest
from unittest import mock

from hillclimb.adapter import Outcome
from straightpool.candidates import Candidate, Intent
from straightpool.game import Call
from straightpool.leave import brush, painters, wrapper
from tests import platforms
from tests.leave import support

T = support.TABLE


class OpenTest(unittest.TestCase):
    def test_open_declarations_equal_the_reference(self):
        for d in support.DATA["decisions"]:
            positions = support.positions(d["positions"])
            cands = support.candidates(d["candidates"])
            for expected in d.get("open", []):
                with self.subTest(decision=d["name"], candidate=expected["candidate"]):
                    got = wrapper.open_at(positions, T, cands[expected["candidate"]])
                    # the digests cover grid values that pass through libm, which rounds by platform
                    support.assert_summary(self, support.summary(got), expected)

    def test_a_bank_or_kick_pot_keeps_its_class(self):
        d = support.decision("mid-rack")
        positions = support.positions(d["positions"])
        base = support.candidates(d["candidates"])[d["fill_candidate"]]
        fill = Candidate(base.index, Intent(base.intent.ball, base.intent.pocket,
                                            d["fill_shot_class"]), support.STROKE, "bank-mirror")
        got = wrapper.open_at(positions, T, fill)
        support.assert_summary(self, support.summary(got), d["fill"])  # libm, as above
        self.assertEqual(got.family.shot_class, d["fill_shot_class"])

    def test_opening_the_painters_call_repaints_its_leave(self):
        d = support.decision("in-hand")
        positions = support.positions(d["positions"])
        cands = support.candidates(d["candidates"])
        painted, meta = painters.declare(positions, T, cands)
        opened = wrapper.open_at(positions, T, cands[meta["candidate"]])
        self.assertEqual((opened.call, opened.surface, opened.brush, opened.grid),
                         (painted.call, painted.surface, painted.brush, painted.grid))
        self.assertEqual(opened.family, Intent(painted.call.ball, painted.call.pocket, "pot"))

    def test_open_declaration_reads_the_game(self):
        d = support.decision("two-balls")
        positions = support.positions(d["positions"])
        c = support.candidates(d["candidates"])[0]
        self.assertEqual(wrapper.open_declaration(support.FakeGame(positions), c),
                         wrapper.open_at(positions, T, c))

    def test_a_candidate_without_a_pocket_is_refused(self):
        positions = support.positions(support.decision("two-balls")["positions"])
        safety = Candidate(0, Intent(1, None, "safety"), support.STROKE, "safety")
        with self.assertRaises(ValueError):
            wrapper.open_at(positions, T, safety)


class SeedTest(unittest.TestCase):
    def test_the_painted_family_seeds_its_own_candidates(self):
        d = support.decision("in-hand")
        cands = support.candidates(d["candidates"])
        declaration, meta = painters.declare(support.positions(d["positions"]), T, cands)
        seeds = wrapper.declared_seeds(cands, declaration.family)
        self.assertIn(cands[meta["candidate"]], seeds)
        self.assertEqual(seeds, [c for c in cands if c.intent == declaration.family])
        self.assertEqual(len({c.place for c in seeds}), 1)

    def test_an_open_declaration_seeds_the_pot_rows(self):
        def cand(pocket, shot_class, index):
            return Candidate(index, Intent(1, pocket, shot_class), support.STROKE, "ghost-ball")

        cands = [cand(2, "position-pot", 0), cand(2, "pot", 1), cand(3, "pot", 2),
                 cand(2, "pot", 3), cand(None, "safety", 4)]
        self.assertEqual([c.index for c in wrapper.declared_seeds(cands, Intent(1, 2, "pot"))],
                         [1, 3])
        self.assertEqual([c.index for c in wrapper.declared_seeds(cands,
                                                                  Intent(1, None, "safety"))],
                         [4])
        with self.assertRaises(ValueError):
            wrapper.declared_seeds(cands, Intent(5, 0, "pot"))


class ObjectiveTest(unittest.TestCase):
    def setUp(self):
        spec = support.DATA["objective"]
        case = next(c for c in support.DATA["programs"]["cases"] if c["name"] == spec["program"])
        balls = {k: brush.scene_from_kernel(p, T)
                 for k, p in support.positions(support.DATA["programs"]["positions"]).items()
                 if k != 0}
        grid = brush.render(brush.compose(balls, brush.cloth(T), case["intent"], case["target"],
                                          case["surface"], case["brush"]), T)
        self.call = Call(spec["call"]["ball"], spec["call"]["pocket"])
        self.declaration = painters.Declaration(
            call=self.call, surface=tuple(case["surface"]), brush=case["brush"], grid=grid,
            family=Intent(self.call.ball, self.call.pocket, "pot"), candidate=0, table=T)
        self.draws = spec["draws"]
        self.cases = spec["cases"]
        self.outcomes, self.judgments = [], []
        for draw in self.draws:
            rest = () if draw["rest"] is None else ((0, draw["rest"][0], draw["rest"][1]),)
            pocketed = ((self.call.ball, self.call.pocket),) if draw["pot"] else ()
            self.outcomes.append(Outcome(events=(), rest=rest, pocketed=pocketed, off_table=(),
                                         first_contact=None))
            self.judgments.append(types.SimpleNamespace(legal=not draw["foul"],
                                                        scored=draw["pot"]))

    def judge(self, outcome, call):
        self.assertEqual(call, self.call)
        return next(j for o, j in zip(self.outcomes, self.judgments) if o is outcome)

    def test_mean_objective_equals_the_reference(self):
        for case in self.cases:
            with self.subTest(lambda_foul=case["lambda_foul"]):
                got = wrapper.mean_objective(self.declaration, self.outcomes,
                                             case["lambda_foul"], judge=self.judge)
                # W reads a grid whose values pass through libm, which rounds by platform
                platforms.assert_close(self, got, case["expected"])

    def test_per_draw_values_average_to_the_objective(self):
        for case in self.cases:
            lam = case["lambda_foul"]
            value = wrapper.objective(self.declaration, lam, judge=self.judge)
            values = [value(o) for o in self.outcomes]
            for draw, v in zip(self.draws, values):
                if draw["foul"]:
                    self.assertEqual(v, -lam)
                elif not draw["pot"] or draw["rest"] is None:
                    self.assertEqual(v, 0.0)
                else:
                    scene = brush.scene_from_kernel(draw["rest"], T)
                    self.assertEqual(v, brush.weight(self.declaration.grid, *scene))
            self.assertAlmostEqual(sum(values) / len(values), case["expected"]["objective"],
                                   places=12)

    def test_the_rest_is_read_in_the_scene_frame(self):
        value = wrapper.objective(self.declaration, 1.0, judge=self.judge)
        moved = 0
        for draw, outcome in zip(self.draws, self.outcomes):
            if draw["pot"] and draw["rest"] is not None:
                legacy = brush.weight(self.declaration.grid, draw["rest"][0], draw["rest"][1])
                moved += value(outcome) != legacy
        self.assertGreater(moved, 0)

    def test_a_truncated_outcome_is_a_foul_without_a_rest(self):
        refused = Outcome(events=(), rest=(), pocketed=(), off_table=(), first_contact=None,
                          truncated="event budget exhausted")

        def never(outcome, call):
            raise AssertionError("a truncated outcome is not judged")

        self.assertEqual(wrapper.indicators(refused, self.call, never), (False, True, None))
        self.assertEqual(wrapper.objective(self.declaration, 0.5, judge=never)(refused), -0.5)

    def test_the_default_judge_is_the_game_law(self):
        seen = []

        def fake(outcome, call):
            seen.append((outcome, call))
            return types.SimpleNamespace(legal=True, scored=False)

        with mock.patch("straightpool.game.judge", fake):
            self.assertEqual(wrapper.objective(self.declaration, 1.0)(self.outcomes[0]), 0.0)
        self.assertEqual(seen, [(self.outcomes[0], self.call)])

    def test_a_declaration_without_a_call_has_no_objective(self):
        with self.assertRaises(ValueError):
            wrapper.objective(painters.NO_CALL, wrapper.LAMBDA_FOUL)
        with self.assertRaises(ValueError):
            wrapper.mean_objective(self.declaration, [], 1.0, judge=self.judge)


if __name__ == "__main__":
    unittest.main()
