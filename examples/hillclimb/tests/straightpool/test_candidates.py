# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The candidate menu, the mirror lines, the aim centres and the Sobol pool on fresh layouts.

Every generator is plane geometry of the position (the pool adds scipy's scrambled Sobol points), so
the checks are exact: the digests are those of the research implementation on the same layouts,
except the menu's. With the cue ball in hand the menu aims from the seated placement, where the
research implementation aimed from the placement before seating; its digest is that of the
research implementation run with every placement seated before its geometry (the rows of the
layouts with the cue ball on the table are unchanged). The geometry passes through libm (atan2,
acos, asin, cos), which rounds the last bits by platform, so the digests hold where they were
recorded and the fingerprints everywhere (tests/platforms.py).
"""

import dataclasses
import importlib.util
import math
import unittest

from hillclimb import crn
from straightpool import candidates as menu
from straightpool import game as rules
from straightpool.leave import laws, painters
from tests import platforms
from tests.straightpool import support

HAS_SCIPY = importlib.util.find_spec("scipy") is not None

#: The fingerprints of the menu, mirror-line, aim-centre and pool rows (tests/platforms.py),
#: recorded with the digests on the recording platform.
FINGERPRINTS = {
    "menu": ["b46516db0b38d449", 71040, 73636.02655251043, 36144.6914037326],
    "mirror": ["5d202f08a0151cf4", 13132, 90526.99418531467, 45173.569578193936],
    "centres": ["4c99fe24e98d003c", 7392, 106825.76800344583, 53438.207266106205],
    "pool": ["254f92dd869abe7a", 11520, 99803.32306362636, 49813.635746570006],
}


def menu_rows(cands):
    return [[c.index, c.intent.ball, c.intent.pocket, c.intent.shot_class, c.origin,
             list(c.stroke.as_tuple()), None if c.place is None else list(c.place),
             None if c.next_intent is None else [c.next_intent.ball, c.next_intent.pocket]]
            for c in cands]


class MenuTest(unittest.TestCase):
    def test_the_menu_matches_the_reference_with_seated_placements(self):
        layouts = support.layouts("hillclimb/tests/straightpool/menu", 40)
        rows = [menu_rows(menu.enumerate_candidates(support.game_of(p))) for p in layouts]
        self.assertEqual(sum(len(r) for r in rows), support.DATA["expected"]["menu_rows"])
        # the strokes pass through libm, which rounds by platform (module docstring)
        platforms.assert_digest(self, support.sha16(rows), support.DATA["expected"]["menu"])
        platforms.assert_fingerprint(self, rows, FINGERPRINTS["menu"])

    def test_order_indices_and_determinism(self):
        game = support.game_of(support.layouts("hillclimb/tests/straightpool/order", 1)[0])
        first, second = menu.enumerate_candidates(game), menu.enumerate_candidates(game)
        self.assertEqual(first, second)
        self.assertEqual([c.index for c in first], list(range(len(first))))
        balls = [c.intent.ball for c in first]
        self.assertEqual(balls, sorted(balls))
        for c in first:
            self.assertIn(c.intent.shot_class, menu.SHOT_CLASSES)
            self.assertIn(c.origin, menu.ORIGINS)

    def test_a_placement_only_while_the_cue_ball_is_in_hand(self):
        positions = support.layouts("hillclimb/tests/straightpool/order", 1)[0]
        with_cue = menu.enumerate_candidates(support.game_of(positions))
        in_hand = menu.enumerate_candidates(support.game_of(
            {b: p for b, p in positions.items() if b != rules.CUE}))
        self.assertTrue(all(c.place is None for c in with_cue))
        self.assertTrue(all(c.place is not None for c in in_hand))

    def test_family_picks_the_seeds_of_a_declared_shot(self):
        game = support.game_of(support.layouts("hillclimb/tests/straightpool/order", 1)[0])
        cands = menu.enumerate_candidates(game)
        pot = next(c for c in cands if c.intent.shot_class == "pot")
        seeds = menu.family(cands, pot.intent.ball, pot.intent.pocket)
        self.assertEqual(seeds[0], pot)
        self.assertTrue(all(s.intent == pot.intent for s in seeds))
        self.assertLessEqual(len(seeds), 3)
        with self.assertRaises(ValueError):
            menu.family(cands, 99, 0)


def seat_of(game, place):
    """Where the game puts the cue ball for a requested placement (straightpool.game.seat)."""
    return rules.seat(game, place).positions()[rules.CUE]


def aim_difference_deg(a, b):
    return abs(math.degrees((a - b + math.pi) % (2 * math.pi) - math.pi))


class SeatedPlacementTest(unittest.TestCase):
    """With the cue ball in hand, every candidate is aimed from the seat the game plays it from
    (straightpool.game.seat: clipped into the zone, then moved off the object balls), and the
    painter prices the call from the same placement. The case is a rule 7.8 (d) re-rack: the cue
    ball was in the way of the rack and the break ball, at (0.3, 0.5), is in front of the head
    string, so the cue ball is in hand in the kitchen, far from the placements behind the ball."""

    BREAK_BALL = 9

    @classmethod
    def setUpClass(cls):
        slots = support.slots(0)
        racked = [b for b in rules.OBJECT_BALLS if b != cls.BREAK_BALL]
        cls.rack = rules.rerack({cls.BREAK_BALL: (0.3, 0.5), rules.CUE: slots[7]}, racked, False,
                                slots, support.TABLE)
        cls.game = rules.Game(key=0, state=support.TEMPLATE.with_positions(cls.rack.positions),
                              templates=support.TEMPLATE, in_hand=cls.rack.in_hand)
        cls.cands = menu.enumerate_candidates(cls.game)

    def assert_aimed_from_their_seats(self, game, cands):
        """Every candidate's placement is the game's seat for it, fits, is the painter's aim point,
        and a ghost-ball pot is aimed from it at a cut under MAX_CUT_DEG."""
        positions = game.state.positions()
        objects = [p for b, p in positions.items() if b != rules.CUE]
        table = game.state.table()
        wrong = []
        for c in cands:
            checks = [seat_of(game, c.place) == c.place,
                      rules.placement_fits(table, c.place, objects),
                      laws.aim_point(positions, c) == c.place]
            if c.origin == "ghost-ball":
                centre = table.pockets[c.intent.pocket]
                _ghost, phi, cut, _d, _dp = menu.ghost_aim(c.place, positions[c.intent.ball],
                                                           centre, table.ball_radius)
                checks += [c.stroke.phi == phi % (2 * math.pi),
                           abs(math.degrees(cut)) < menu.MAX_CUT_DEG]
            if not all(checks):
                wrong.append((c.index, checks))
        self.assertEqual(wrong, [])

    def test_the_case_is_a_rule_7_8_d_rerack_with_the_cue_ball_in_the_kitchen(self):
        self.assertEqual((self.rack.branch, self.rack.in_hand), ("d", "kitchen"))
        self.assertNotIn(rules.CUE, self.game.state.positions())
        self.assertTrue(self.cands)

    def test_every_candidate_is_aimed_from_its_seat_in_the_kitchen(self):
        head = rules.head_string_y(support.TABLE)
        self.assertTrue(all(c.place[1] <= head for c in self.cands))
        self.assert_aimed_from_their_seats(self.game, self.cands)

    def test_a_pot_the_seat_cannot_make_is_not_offered(self):
        # Aimed from the placement behind the break ball, the pot into one corner needs an aim
        # about 166 degrees away from the aim its seat in the kitchen needs; from the seat that pot
        # is a cut far beyond MAX_CUT_DEG, so the menu holds no pot on that pocket.
        table = support.TABLE
        ball = self.game.state.positions()[self.BREAK_BALL]
        objects = [p for b, p in self.game.state.positions().items() if b != rules.CUE]
        worst, worst_pocket = 0.0, None
        for pocket, centre in enumerate(table.pockets):
            suggested = menu._placement(ball, centre, table)
            seat = rules.place_in_zone("kitchen", suggested[0], suggested[1], table, objects)
            _g, phi_suggested, _c, _d, _dp = menu.ghost_aim(suggested, ball, centre,
                                                            table.ball_radius)
            _g, phi_seat, cut_seat, _d, _dp = menu.ghost_aim(seat, ball, centre,
                                                             table.ball_radius)
            offered = [c for c in self.cands if c.intent == menu.Intent(self.BREAK_BALL, pocket,
                                                                         "pot")]
            self.assertEqual(bool(offered), abs(math.degrees(cut_seat)) < menu.MAX_CUT_DEG)
            difference = aim_difference_deg(phi_seat, phi_suggested)
            if difference > worst:
                worst, worst_pocket = difference, pocket
        self.assertGreater(worst, 160.0)
        self.assertFalse([c for c in self.cands
                          if c.intent.ball == self.BREAK_BALL and c.intent.pocket == worst_pocket])

    def test_the_painter_prices_the_call_from_the_seat(self):
        positions = self.game.state.positions()
        declaration, meta = painters.declare(positions, support.TABLE, self.cands)
        self.assertIsNotNone(declaration.call)
        called = self.cands[declaration.candidate]
        seat = seat_of(self.game, called.place)
        self.assertEqual(meta["cut_deg"], laws.cut_deg(seat, positions, called, support.TABLE))
        self.assertEqual(meta["make"], laws.make(seat, called.intent.ball, called.intent.pocket,
                                                 positions, support.TABLE))

    def test_placements_on_a_ball_are_moved_off_it_anywhere_on_the_bed(self):
        moved = 0
        for positions in support.layouts("hillclimb/tests/straightpool/seated", 12, cue_share=0.0):
            game = support.game_of(positions)
            cands = menu.enumerate_candidates(game)
            self.assert_aimed_from_their_seats(game, cands)
            for c in cands:
                if c.intent.pocket is not None and c.origin == "ghost-ball":
                    centre = support.TABLE.pockets[c.intent.pocket]
                    moved += menu._placement(positions[c.intent.ball], centre,
                                             support.TABLE) != c.place
        self.assertGreater(moved, 0)

    def test_a_cue_ball_off_the_table_but_not_in_hand_is_refused(self):
        positions = support.layouts("hillclimb/tests/straightpool/order", 1)[0]
        game = support.game_of({b: p for b, p in positions.items() if b != rules.CUE})
        with self.assertRaises(ValueError):
            menu.enumerate_candidates(dataclasses.replace(game, in_hand="none"))


class PoolTest(unittest.TestCase):
    def test_mirror_lines_and_aim_centres_match_the_reference(self):
        layouts = support.layouts("hillclimb/tests/straightpool/mirror", 40, cue_share=1.0)
        lines = [[[m.kind, m.ball, m.pocket, m.rail, m.cut_deg, m.v0, m.phi, list(m.crossing),
                   m.d, m.dp] for m in menu.mirror_lines(p, support.TABLE)] for p in layouts]
        self.assertEqual(sum(len(x) for x in lines), support.DATA["expected"]["mirror_rows"])
        # cuts and aims pass through libm, which rounds by platform (module docstring)
        platforms.assert_digest(self, support.sha16(lines), support.DATA["expected"]["mirror"])
        platforms.assert_fingerprint(self, lines, FINGERPRINTS["mirror"])
        centres = [[[c.kind, c.ball, c.pocket, c.rail, c.phi, c.cut_deg, c.clear, c.delta]
                    for c in menu.aim_centres(support.game_of(p))] for p in layouts]
        platforms.assert_digest(self, support.sha16(centres),
                                support.DATA["expected"]["centres"])
        platforms.assert_fingerprint(self, centres, FINGERPRINTS["centres"])

    def test_no_centre_and_no_pool_while_the_cue_ball_is_in_hand(self):
        positions = support.layouts("hillclimb/tests/straightpool/order", 1)[0]
        game = support.game_of({b: p for b, p in positions.items() if b != rules.CUE})
        self.assertEqual(menu.aim_centres(game), [])
        self.assertEqual(menu.mirror_lines(game.state.positions(), support.TABLE), [])
        self.assertEqual(menu.sobol_pool(game, n=32, seed=7), [])

    @unittest.skipUnless(HAS_SCIPY, "needs scipy")
    def test_the_pool_matches_the_reference(self):
        layouts = support.layouts("hillclimb/tests/straightpool/pool", 12, cue_share=1.0)
        seeds = crn.game_keys("hillclimb/tests/straightpool/pool-seeds", len(layouts))
        rows = []
        for positions, seed in zip(layouts, seeds):
            for n in (32, 128):
                rows.append([[m.index, m.ball, m.pocket, m.kind, list(m.stroke.as_tuple()),
                              m.cut_deg] for m in menu.sobol_pool(support.game_of(positions), n=n,
                                                                    seed=seed)])
        # the aim centres pass through libm, which rounds by platform (module docstring)
        platforms.assert_digest(self, support.sha16(rows), support.DATA["expected"]["pool"])
        platforms.assert_fingerprint(self, rows, FINGERPRINTS["pool"])

    @unittest.skipUnless(HAS_SCIPY, "needs scipy")
    def test_the_pool_is_determined_by_its_seed(self):
        game = support.game_of(support.layouts("hillclimb/tests/straightpool/pool", 1,
                                               cue_share=1.0)[0])
        a = menu.sobol_pool(game, n=64, seed=11)
        self.assertEqual(a, menu.sobol_pool(game, n=64, seed=11))
        self.assertNotEqual(a, menu.sobol_pool(game, n=64, seed=12))
        self.assertEqual([m.index for m in a], list(range(64)))
        centres = menu.aim_centres(game)
        self.assertEqual([(m.ball, m.pocket, m.kind) for m in a[:len(centres)]],
                         [(c.ball, c.pocket, c.kind) for c in centres][:64])
        self.assertEqual(menu.sobol_pool(game, n=128, seed=11)[:64], a)
        for m in a:
            self.assertIn(m.kind, menu.POOL_KINDS)
            self.assertIsNone(m.place)
        with self.assertRaises(ValueError):
            menu.sobol_pool(game, n=48, seed=11)


if __name__ == "__main__":
    unittest.main()
