# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The game, the baseline agent and the target with the kernel (skipped without pool_py).

The public kernel may be newer than the build our numbers were measured on, so these tests assert
properties, never kernel-dependent values: determinism, worker invariance, the rules' bookkeeping.
Each takes seconds of CPU at most (tiny schedules, tiny m, short caps).
"""

import json
import unittest

from hillclimb import adapter, crn, runner
from hillclimb.protocol import Decision
from straightpool import base_agent, candidates, envelope, game as rules, targets

KEYS = crn.game_keys("hillclimb/tests/straightpool/kernel", 3)

#: A tiny best-of-K schedule: ten simulations or so per decision.
TINY = {"survivors": 1, "iterations": 1, "proposals": 2, "draws": 2}


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


@unittest.skipUnless(adapter.available(), "needs pool_py")
class GameTest(unittest.TestCase):
    def test_the_opening_is_determined_by_the_key(self):
        game = rules.new_game(KEYS[0])
        self.assertEqual(game, rules.new_game(KEYS[0]))
        self.assertNotEqual(game.state, rules.new_game(KEYS[1]).state)
        positions = game.state.positions()
        self.assertEqual(sorted(positions), list(rules.OBJECT_BALLS))
        self.assertEqual((game.in_hand, game.decision, game.run, game.over),
                         ("anywhere", 0, 0, None))
        radius = game.state.table().ball_radius
        points = list(positions.values())
        for i, (x, y) in enumerate(points):
            for u, v in points[i + 1:]:
                self.assertGreaterEqual(((x - u) ** 2 + (y - v) ** 2) ** 0.5, 2 * radius - 1e-6)

    def test_seating_the_cue_ball_in_hand(self):
        game = rules.new_game(KEYS[0])
        table = game.state.table()
        objects = [p for b, p in game.state.positions().items() if b != rules.CUE]
        ball = objects[0]
        seated = rules.seat(game, ball).positions()
        self.assertTrue(rules.placement_fits(table, seated[rules.CUE], objects))
        from dataclasses import replace
        kitchen = rules.seat(replace(game, in_hand="kitchen"), (0.1, 0.9)).positions()
        self.assertLessEqual(kitchen[rules.CUE][1], rules.head_string_y(table))
        self.assertIs(rules.seat(replace(game, in_hand="none"), (0.0, 0.0)), game.state)

    def test_a_step_is_deterministic_and_judged_by_the_rules(self):
        game = rules.new_game(KEYS[1])
        cands = candidates.enumerate_candidates(game)
        pot = next(c for c in cands if c.intent.shot_class == "pot")
        action = rules.Action(pot.stroke, rules.Call(pot.intent.ball, pot.intent.pocket), pot.place)
        first = rules.step(game, action, noise=0.1)
        self.assertEqual(first, rules.step(game, action, noise=0.1))
        nxt, judgment, outcome = first
        self.assertEqual(judgment, rules.judge(outcome, action.call))
        if judgment.scored:
            self.assertEqual((nxt.run, nxt.decision, nxt.over), (1, 1, None))
        else:
            self.assertIn(nxt.over, ("FOUL", "WRONG_BALL", "MISS"))
            self.assertEqual(nxt.state, game.state)

    def test_reracks_draw_their_own_slots(self):
        a, b = rules.rerack_slots(KEYS[0], 0), rules.rerack_slots(KEYS[0], 1)
        self.assertEqual(a, rules.rerack_slots(KEYS[0], 0))
        self.assertEqual(len(a), 15)
        self.assertNotEqual(rules.rerack_seed(KEYS[0], 0), rules.rerack_seed(KEYS[0], 1))
        self.assertEqual(a, sorted(a, key=lambda p: (p[1], p[0])))
        self.assertEqual(len(b), 15)

    def test_candidate_scores_share_the_draws(self):
        game = rules.new_game(KEYS[2])
        cands = candidates.enumerate_candidates(game)[:3]
        draws = crn.block(crn.stream("hillclimb/tests/straightpool/score", game.key), 0, 2)
        objective = candidates.pot_objective(rules.Call(cands[0].intent.ball,
                                                        cands[0].intent.pocket))
        values = candidates.score(game, cands, objective, draws, noise=0.1)
        self.assertEqual(values, candidates.score(game, cands, objective, draws, noise=0.1))
        self.assertEqual(len(values), 3)
        self.assertTrue(all(v in (0.0, 0.5, 1.0) for v in values))


@unittest.skipUnless(adapter.available(), "needs pool_py")
class AgentTest(unittest.TestCase):
    def test_one_decision_twice_is_equal_and_inside_the_envelope(self):
        game = rules.new_game(KEYS[0])
        decision = Decision(game.key, game.decision, 0.1)
        agent = base_agent.build(base_agent.spec(**TINY))
        first = agent.act(game, decision)
        agent.reset(game.key)
        self.assertEqual(first, agent.act(game, decision))
        self.assertEqual(first, base_agent.build(base_agent.spec(**TINY)).act(game, decision))
        if first.call is not None:
            self.assertTrue(envelope.inside(envelope.V1, first.stroke))
            self.assertIsNotNone(first.place)

    def test_unknown_parameters_are_refused(self):
        with self.assertRaises(ValueError):
            base_agent.build(base_agent.spec(depth=2))
        with self.assertRaises(ValueError):
            base_agent.build(base_agent.spec(rollouts="crate"))

    def test_every_lever_decides(self):
        game = rules.new_game(KEYS[1])
        decision = Decision(game.key, game.decision, 0.1)
        for change in ({"leave": False}, {"rollouts": "rules"}, {"envelope": "v2"},
                       {"envelope": None}, {"floor": True}):
            with self.subTest(lever=canonical(change)):
                action = base_agent.build(base_agent.spec(**TINY, **change)).act(game, decision)
                self.assertIsInstance(action, rules.Action)
                if action.call is not None and change.get("envelope", "v1") is not None:
                    self.assertTrue(envelope.inside(envelope.of(change.get("envelope", "v1")),
                                                    action.stroke, envelope.decision_kind(game)))

    def test_two_tiny_games_are_worker_invariant(self):
        target = targets.level(0.1, cap=2, m=2)
        spec = base_agent.spec(**TINY)
        keys = KEYS[:2]
        one = runner.play(target, spec, keys, workers=1)
        two = runner.play(target, spec, keys, workers=2)
        self.assertEqual(canonical(one), canonical(two))
        for record, key in zip(one, keys):
            self.assertEqual(record["key"], key)
            self.assertEqual(len(record["misses"]), record["decisions"])
            self.assertTrue(all(0 <= x <= 2 for x in record["misses"]))
            self.assertIn(record["over"], rules.ENDINGS)
            self.assertLessEqual(record["run"], 2)
        self.assertIsNotNone(target.value(one))


if __name__ == "__main__":
    unittest.main()
