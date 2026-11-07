# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The 14.1 rules without the kernel: the judge on event lists, placement, spotting, the re-rack.

The digests are those of the research implementation the rules were ported from, computed on the
same seeded inputs (support.py); every check here is plane geometry or bookkeeping, exact. The
one exception is the sweep of place_in_zone, whose directions pass through libm (cos, sin): its
digest holds where it was recorded and its fingerprint everywhere (tests/platforms.py).
"""

import unittest

from hillclimb.adapter import Event, Outcome
from straightpool import game as rules
from tests import platforms
from tests.straightpool import support

#: The fingerprint of the placement rows (tests/platforms.py), recorded with their digest on the
#: recording platform.
PLACEMENT_FINGERPRINT = ["c30b37f0ce848747", 1800, -34.83454332004187, -16.41707964442666]


def outcome(*events, truncated=None):
    return Outcome(events=tuple(Event(*e) for e in events), rest=(), pocketed=(), off_table=(),
                   first_contact=None, truncated=truncated)


def strike(t=0.0):
    return ("strike", t, (0,))


def judged(call, *events, truncated=None):
    j = rules.judge(outcome(*events, truncated=truncated), rules.Call(*call))
    return (j.fouls, j.legal, j.scored, j.first_contact, j.rail_after_contact, j.object_pots,
            j.incidental)


class JudgeTest(unittest.TestCase):
    def test_a_clean_called_pot_scores(self):
        got = judged((3, 2), strike(), ("ball_ball", 0.2, (0, 3)), ("ball_pocket", 1.0, (3,), 2))
        self.assertEqual(got, ((), True, True, 3, False, ((3, 2),), ()))

    def test_the_wrong_pocket_does_not_score(self):
        got = judged((3, 2), strike(), ("ball_ball", 0.2, (0, 3)), ("ball_pocket", 1.0, (3,), 5))
        self.assertEqual(got, ((), True, False, 3, False, ((3, 5),), (3,)))

    def test_a_combination_scores_when_the_called_ball_drops(self):
        got = judged((3, 2), strike(), ("ball_ball", 0.2, (0, 5)), ("ball_ball", 0.4, (5, 3)),
                     ("ball_pocket", 1.0, (3,), 2))
        self.assertEqual(got, ((), True, True, 5, False, ((3, 2),), ()))

    def test_balls_pocketed_besides_the_call_are_incidental_sorted_once(self):
        got = judged((3, 2), strike(), ("ball_ball", 0.2, (0, 3)), ("ball_pocket", 0.9, (9,), 0),
                     ("ball_pocket", 1.0, (3,), 2), ("ball_pocket", 1.1, (7,), 4))
        self.assertEqual(got, ((), True, True, 3, False, ((9, 0), (3, 2), (7, 4)), (7, 9)))

    def test_a_scratch_is_a_foul_even_with_the_call_down(self):
        got = judged((3, 2), strike(), ("ball_ball", 0.2, (0, 3)), ("ball_pocket", 1.0, (3,), 2),
                     ("ball_pocket", 1.4, (0,), 4))
        self.assertEqual(got, (("SCRATCH",), False, False, 3, False, ((3, 2),), ()))

    def test_no_contact(self):
        got = judged((3, 2), strike(), ("ball_linear_cushion", 0.5, (0,)))
        self.assertEqual(got, (("NO_CONTACT",), False, False, None, False, (), ()))

    def test_a_rail_before_the_contact_does_not_count(self):
        got = judged((3, 2), strike(), ("ball_linear_cushion", 0.3, (0,)),
                     ("ball_ball", 0.5, (0, 3)))
        self.assertEqual(got, (("NO_RAIL_AFTER_CONTACT",), False, False, 3, False, (), ()))

    def test_a_rail_at_the_contact_time_counts(self):
        got = judged((3, 2), strike(), ("ball_ball", 0.5, (0, 3)),
                     ("ball_circular_cushion", 0.5, (3,)))
        self.assertEqual(got, ((), True, False, 3, True, (), ()))

    def test_an_object_ball_off_the_table(self):
        got = judged((3, 2), strike(), ("ball_ball", 0.2, (0, 3)),
                     ("ball_linear_cushion", 0.4, (3,)), ("ball_off_table", 0.6, (6,)))
        self.assertEqual(got, (("BALL_OFF_TABLE",), False, False, 3, True, (), ()))

    def test_fouls_come_in_precedence_order(self):
        got = judged((3, 2), strike(), ("ball_ball", 0.5, (0, 3)), ("ball_off_table", 0.6, (0,)),
                     ("ball_off_table", 0.7, (4,)))
        self.assertEqual(got[0], ("CUE_OFF_TABLE", "NO_RAIL_AFTER_CONTACT", "BALL_OFF_TABLE"))
        got = judged((3, 2), strike(), ("ball_off_table", 0.6, (0,)), ("ball_pocket", 0.7, (0,), 1))
        self.assertEqual(got[0], ("SCRATCH", "CUE_OFF_TABLE", "NO_CONTACT"))

    def test_a_pocketed_cue_ball_after_the_contact_meets_the_rail_rule(self):
        got = judged((3, 2), strike(), ("ball_ball", 0.5, (0, 3)), ("ball_pocket", 0.9, (0,), 3))
        self.assertEqual(got[0], ("SCRATCH",))

    def test_the_first_contact_is_the_cue_balls(self):
        got = judged((3, 2), strike(), ("ball_ball", 0.1, (4, 5)), ("ball_ball", 0.3, (3, 0)),
                     ("ball_linear_cushion", 0.6, (3,)))
        self.assertEqual(got[3], 3)
        self.assertTrue(got[1])

    def test_a_truncated_stroke_is_a_foul(self):
        got = judged((3, 2), truncated="event budget exhausted")
        self.assertEqual(got, (("TRUNCATED",), False, False, None, False, (), ()))
        self.assertEqual(rules.FOULS[-1], "TRUNCATED")


class RolloutJudgeTest(unittest.TestCase):
    def test_a_first_contact_with_another_ball_is_a_rollout_foul(self):
        events = (strike(), ("ball_ball", 0.2, (0, 5)), ("ball_ball", 0.4, (5, 3)),
                  ("ball_pocket", 1.0, (3,), 2))
        played = rules.judge(outcome(*events), rules.Call(3, 2))
        rollout = rules.judge_rollout(outcome(*events), rules.Call(3, 2))
        self.assertTrue(played.scored)
        self.assertEqual((rollout.fouls, rollout.legal, rollout.scored),
                         ((rules.FIRST_CONTACT,), False, False))
        self.assertNotIn(rules.FIRST_CONTACT, rules.FOULS)

    def test_the_rollout_law_agrees_otherwise(self):
        clean = outcome(strike(), ("ball_ball", 0.2, (0, 3)), ("ball_pocket", 1.0, (3,), 2))
        miss = outcome(strike(), ("ball_linear_cushion", 0.5, (0,)))
        for case in (clean, miss, outcome(truncated="refused")):
            self.assertEqual(rules.judge_rollout(case, rules.Call(3, 2)),
                             rules.judge(case, rules.Call(3, 2)))


class PlacementTest(unittest.TestCase):
    table = support.TABLE

    def test_clip_to_the_bed_and_the_kitchen(self):
        r, c = self.table.ball_radius, rules.PLACE_CLEARANCE
        half_w, half_l = self.table.width / 2 - r - c, self.table.length / 2 - r - c
        self.assertEqual(rules.clip_to_zone("anywhere", 5.0, -5.0, self.table), (half_w, -half_l))
        self.assertEqual(rules.clip_to_zone("kitchen", 0.1, 0.5, self.table),
                         (0.1, -self.table.length / 4))
        self.assertEqual(rules.clip_to_zone("kitchen", 0.1, -0.9, self.table), (0.1, -0.9))
        with self.assertRaises(ValueError):
            rules.clip_to_zone("d_zone", 0.0, 0.0, self.table)

    def test_a_request_on_a_ball_moves_to_the_first_fitting_point(self):
        ball = (0.2, 0.3)
        x, y = rules.place_in_zone("anywhere", 0.2, 0.3, self.table, [ball])
        self.assertTrue(rules.placement_fits(self.table, (x, y), [ball]))
        self.assertNotEqual((x, y), ball)
        self.assertEqual((x, y), rules.place_in_zone("anywhere", 0.2, 0.3, self.table, [ball]))
        free = rules.place_in_zone("anywhere", -0.3, 0.6, self.table, [ball])
        self.assertEqual(free, (-0.3, 0.6))

    def test_the_foot_spot_then_the_long_string(self):
        foot = (0.0, self.table.length / 4)
        self.assertEqual(rules.respot_spot(self.table, []), foot)
        spot = rules.respot_spot(self.table, [foot])
        self.assertEqual(spot[0], 0.0)
        self.assertGreater(spot[1], foot[1])
        self.assertTrue(rules.placement_fits(self.table, spot, [foot]))

    def test_placement_matches_the_reference_on_seeded_cases(self):
        out = []
        for obstacles, (x, y), zone in support.placement_cases(
                "hillclimb/tests/straightpool/placement", 300):
            spot = rules.respot_spot(self.table, obstacles)
            out.append([rules.placement_fits(self.table, (x, y), obstacles),
                        list(rules.clip_to_zone(zone, x, y, self.table)),
                        list(rules.place_in_zone(zone, x, y, self.table, obstacles)),
                        None if spot is None else list(spot),
                        rules.interferes((x, y), support.slots(0), self.table.ball_radius)])
        # the sweep's directions pass through libm, which rounds by platform (module docstring)
        platforms.assert_digest(self, support.sha16(out), support.DATA["expected"]["placement"])
        platforms.assert_fingerprint(self, out, PLACEMENT_FINGERPRINT)


class SpotAndRerackTest(unittest.TestCase):
    table = support.TABLE

    def test_spot_back_uses_a_free_apex_of_an_untouched_rack(self):
        apex = support.slots(0)[0]
        positions, placed = rules.spot_back({1: (0.3, -0.5)}, [7, 4], self.table, apex=apex)
        self.assertEqual(placed[0], (4, apex))
        self.assertEqual(placed[1][0], 7)
        self.assertNotEqual(placed[1][1], apex)
        self.assertEqual(list(positions), [1, 4, 7])

    def test_spot_back_matches_the_reference_on_seeded_cases(self):
        out = []
        for positions, down, apex in support.spot_cases("hillclimb/tests/straightpool/spot", 200):
            after, _placed = rules.spot_back(positions, down, self.table, apex=apex)
            out.append(sorted([b, x, y] for b, (x, y) in after.items()))
        self.assertEqual(support.sha16(out), support.DATA["expected"]["spot_back"])

    def test_rack_slots_put_the_apex_first(self):
        slots = support.slots(0)
        self.assertEqual(len(slots), 15)
        self.assertEqual(slots, sorted(slots, key=lambda p: (p[1], p[0])))

    def test_the_rerack_branches(self):
        slots, apex = support.slots(0), support.slots(0)[0]
        far = (0.4, -1.0)
        rack = rules.rerack({5: far, 0: (-0.4, -0.9)}, [b for b in range(1, 16) if b != 5], False,
                            slots, self.table)
        self.assertEqual((rack.branch, rack.in_hand, rack.apex), ("none", "none", apex))
        self.assertEqual(rack.positions[5], far)
        self.assertEqual(len(rack.positions), 16)
        rack = rules.rerack({0: slots[3]}, list(range(1, 16)), True, slots, self.table)
        self.assertEqual((rack.branch, rack.in_hand, rack.apex), ("a", "kitchen", None))
        self.assertNotIn(0, rack.positions)
        rack = rules.rerack({5: slots[6], 0: (-0.4, -0.9)}, [b for b in range(1, 16) if b != 5],
                            False, slots, self.table)
        self.assertEqual(rack.branch, "c")
        self.assertEqual(rack.positions[5], (0.0, -self.table.length / 4))
        with self.assertRaises(ValueError):
            rules.rerack({5: far, 6: (0.1, 0.1)}, list(range(1, 5)), False, slots, self.table)

    def test_rerack_matches_the_reference_on_seeded_cases(self):
        out, branches = [], {}
        for positions, racked, emptied, which in support.rerack_cases(
                "hillclimb/tests/straightpool/rerack", 300):
            rack = rules.rerack(positions, racked, emptied, support.slots(which), self.table)
            branches[rack.branch] = branches.get(rack.branch, 0) + 1
            out.append([sorted([b, x, y] for b, (x, y) in rack.positions.items()), rack.in_hand,
                        None if rack.apex is None else list(rack.apex), rack.branch])
        self.assertEqual(branches, support.DATA["expected"]["rerack_branches"])
        self.assertEqual(support.sha16(out), support.DATA["expected"]["rerack"])


if __name__ == "__main__":
    unittest.main()
