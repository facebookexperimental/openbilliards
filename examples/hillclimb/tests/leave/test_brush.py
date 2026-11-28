# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The brush fields, the grid and the frames: bit-equal to the reference on fresh scenes where
the exact pins are on, within a tolerance elsewhere (tests/platforms.py)."""

import hashlib
import json
import random
import unittest

from straightpool.leave import brush
from tests import platforms
from tests.leave import support

BED = brush.cloth(support.TABLE)

#: The fingerprints of the rendered grids by program (tests/platforms.py), recorded with their
#: digests on the recording platform.
GRID_FINGERPRINTS = {
    "pot-band-plus": ["c2a02bd65736b455", 8001, 125.34040117526172, 84.3571309083914],
    "pot-band-minus-half-rail": ["c2a02bd65736b455", 8001, 166.91943913279346,
                                 139.25537800282126],
    "pot-plain": ["c2a02bd65736b455", 8001, 1737.4078997421104, 1370.0564666367902],
    "pot-authored-band": ["c2a02bd65736b455", 8001, 792.9482045915499, 149.8016738892909],
    "pot-neutral": ["c2a02bd65736b455", 8001, 3396.554411764704, 1709.3431385415045],
    "safety-reward": ["c2a02bd65736b455", 8001, 1423.488772294837, 726.6881328568611],
    "safety-off": ["c2a02bd65736b455", 8001, 3175.4756324623395, 1103.7878271435582],
    "pot-peaks-zeros": ["c2a02bd65736b455", 8001, 408.5246985172981, 302.28855531389814],
}


def scene_balls(raw):
    return {k: brush.scene_from_kernel(p, support.TABLE)
            for k, p in support.positions(raw).items() if k != 0}


class FrameTest(unittest.TestCase):
    def test_the_bed_of_the_standard_table_is_the_reviewed_one(self):
        self.assertEqual(BED, brush.Cloth(2.54, 1.27, 0.028575,
                                          ((0.0, 0.0), (1.27, 0.0), (2.54, 0.0),
                                           (0.0, 1.27), (1.27, 1.27), (2.54, 1.27))))

    def test_scene_axes(self):
        self.assertEqual(brush.scene_from_kernel((0.0, 0.0), support.TABLE), (1.27, 0.635))
        self.assertEqual(brush.scene_from_kernel((-0.635, -1.27), support.TABLE), (0.0, 0.0))
        self.assertEqual(brush.scene_from_kernel((0.635, 1.27), support.TABLE), (2.54, 1.27))
        self.assertEqual(brush.kernel_from_scene((1.27, 0.635), support.TABLE), (0.0, 0.0))

    def test_each_pocket_maps_near_its_aim_point(self):
        for centre, aim in zip(support.TABLE.pockets, BED.pockets):
            sx, sy = brush.scene_from_kernel(centre, support.TABLE)
            self.assertLess(brush.dist((sx, sy), aim), 0.08)

    def test_round_trip(self):
        rng = random.Random("leave/tests/frames")
        for _ in range(200):
            k = (rng.uniform(-0.6, 0.6), rng.uniform(-1.2, 1.2))
            back = brush.kernel_from_scene(brush.scene_from_kernel(k, support.TABLE),
                                           support.TABLE)
            self.assertAlmostEqual(back[0], k[0], places=12)
            self.assertAlmostEqual(back[1], k[1], places=12)


class FieldTest(unittest.TestCase):
    def setUp(self):
        fields = support.DATA["fields"]
        self.points = fields["points"]
        self.legs = fields["object_leg_blocked"]
        self.balls = scene_balls(fields["positions"])
        self.blockers = sorted(self.balls.items())
        self.band = {"enabled": True, "center_deg": 30.0, "width_deg": 16.0,
                     "wrong_side_factor": 0.18, "prefer_side": 1}

    def values(self, p):
        b, bl = self.balls, self.blockers
        return {
            "make_v01": brush.makeability(p, b[1], BED.pockets[2], bl, 1, BED),
            "make_v02": brush.makeability(p, b[1], BED.pockets[2], bl, 1, BED, both_legs=True),
            "make_band_plus": brush.makeability(p, b[3], BED.pockets[4], bl, 3, BED,
                                                angle_band=self.band),
            "make_band_minus_half": brush.makeability(p, b[3], BED.pockets[4], bl, 3, BED,
                                                      angle_band=dict(self.band, prefer_side=-1),
                                                      rail_severity=0.5),
            "make_rail_off": brush.makeability(p, b[4], BED.pockets[0], bl, 4, BED,
                                               rail_mode="off"),
            "safety_reward": brush.safety(p, b[5], bl, 5, BED),
            "safety_off": brush.safety(p, b[5], bl, 5, BED, rail_mode="off"),
            "safety_reward_full": brush.safety(p, b[5], bl, 5, BED, rail_severity=1.0),
            "rail_penalty": brush.rail_penalty(p, BED),
            "blocked_to_1": brush.blocked(p, b[1], bl, BED, skip=(1,)),
        }

    def test_point_values_equal_the_reference(self):
        for row in self.points:
            p = tuple(row["p"])
            got = self.values(p)
            for key, value in got.items():
                with self.subTest(point=p, field=key):
                    # makeability passes through libm (acos, pow, exp), which rounds by platform
                    platforms.assert_close(self, value, row[key])

    def test_both_legs_zero_a_blocked_object_leg(self):
        self.assertEqual(brush.object_leg_blocked(self.balls[1], BED.pockets[2], self.blockers, 1,
                                                  BED), self.legs["1->2"])
        self.assertTrue(self.legs["1->2"])
        self.assertFalse(self.legs["3->4"])
        live_v01 = [row for row in self.points if row["make_v01"] > 0.0]
        self.assertTrue(live_v01, "the fixture should hold points where v0.1 calls the pot")
        for row in self.points:
            self.assertEqual(row["make_v02"], 0.0)
        for row in self.points:
            p = tuple(row["p"])
            self.assertEqual(
                brush.makeability(p, self.balls[3], BED.pockets[4], self.blockers, 3, BED,
                                  both_legs=True),
                brush.makeability(p, self.balls[3], BED.pockets[4], self.blockers, 3, BED))

    def test_field_and_point_forms_agree(self):
        field = brush.makeability_field(self.balls[3], BED.pockets[4], self.blockers, 3, BED,
                                        angle_band=self.band)
        for row in self.points:
            p = tuple(row["p"])
            platforms.assert_close(self, field(p), row["make_band_plus"])  # libm, as above

    def test_unknown_rail_mode_is_refused(self):
        with self.assertRaises(ValueError):
            brush.makeability((1.0, 0.5), self.balls[3], BED.pockets[4], self.blockers, 3, BED,
                              rail_mode="sideways")
        with self.assertRaises(ValueError):
            brush.compose(self.balls, BED, "pot", 3, (5, 2), {"rail_policy": {"mode": "x"}})
        with self.assertRaises(ValueError):
            brush.compose(self.balls, BED, "break", 3)


class RenderTest(unittest.TestCase):
    def setUp(self):
        self.cases = support.DATA["programs"]["cases"]
        self.balls = scene_balls(support.DATA["programs"]["positions"])

    def grid_of(self, case, **brush_override):
        program = dict(case["brush"], **brush_override)
        score = brush.compose(self.balls, BED, case["intent"], case["target"], case["surface"],
                              program)
        return brush.render(score, support.TABLE)

    def test_programs_render_bit_equal(self):
        for case in self.cases:
            with self.subTest(program=case["name"]):
                grid = self.grid_of(case)
                self.assertEqual((grid.nx, grid.ny), (case["nx"], case["ny"]))
                # the fields pass through libm, which rounds by platform: the digest holds where
                # it was recorded, the fingerprint and the samples within the tolerance elsewhere
                platforms.assert_digest(self, grid.digest(), case["vals"])
                platforms.assert_fingerprint(self, list(grid.vals),
                                             GRID_FINGERPRINTS[case["name"]])
                for index, value in case["samples"]:
                    platforms.assert_close(self, grid.vals[index], value)
                top, centre, cells = brush.plateau(grid)
                platforms.assert_close(self, top, case["max"])
                platforms.assert_close(self, list(centre), case["argmax"])
                self.assertEqual(cells, case["plateau_cells"])

    def test_grid_shape_is_the_accumulated_scan(self):
        grid = brush.render(lambda p: 0.5, support.TABLE)
        self.assertEqual((grid.nx, grid.ny, grid.cell), (127, 63, brush.CELL))
        self.assertEqual(brush.centres(1.27)[-1], 1.2500000000000007)
        self.assertEqual(set(grid.vals), {0.5})

    def test_render_is_deterministic(self):
        case = self.cases[0]
        self.assertEqual(self.grid_of(case), self.grid_of(case))

    def test_peaks_never_revive_a_zero_and_zeros_come_last(self):
        case = next(c for c in self.cases if c["name"] == "pot-peaks-zeros")
        plain = self.grid_of(case, custom_peaks=[], custom_zeros=[])
        shaped = self.grid_of(case)
        xs, ys = brush.centres(BED.length), brush.centres(BED.width)
        zero = case["brush"]["custom_zeros"][0]
        for j, y in enumerate(ys):
            for i, x in enumerate(xs):
                k = j * len(xs) + i
                if brush.dist((x, y), (zero["x"], zero["y"])) < zero["radius"]:
                    self.assertEqual(shaped.vals[k], 0.0)
                elif plain.vals[k] == 0.0:
                    self.assertEqual(shaped.vals[k], 0.0)
                else:
                    self.assertGreaterEqual(shaped.vals[k], plain.vals[k])
                    self.assertLessEqual(shaped.vals[k],
                                         plain.vals[k] + (1 - plain.vals[k]) * brush.PEAK_CAP)


class WeightTest(unittest.TestCase):
    def setUp(self):
        balls = scene_balls(support.DATA["programs"]["positions"])
        case = next(c for c in support.DATA["programs"]["cases"]
                    if c["name"] == support.DATA["weights"]["program"])
        self.grid = brush.render(brush.compose(balls, BED, case["intent"], case["target"],
                                               case["surface"], case["brush"]), support.TABLE)

    def test_weights_equal_the_reference(self):
        for x, y, value in support.DATA["weights"]["points"]:
            with self.subTest(point=(x, y)):
                # the grid passes through libm, which rounds by platform
                platforms.assert_close(self, brush.weight(self.grid, x, y), value)

    def test_bilinear_and_clamped(self):
        nx, ny = 4, 3
        grid = brush.Grid(brush.CELL, nx, ny, tuple((i + 10 * j) / 40.0 for j in range(ny)
                                                    for i in range(nx)))
        c = brush.CELL
        self.assertEqual(brush.weight(grid, c / 2, c / 2), 0.0)
        self.assertAlmostEqual(brush.weight(grid, c, c / 2), 0.5 / 40.0)
        self.assertAlmostEqual(brush.weight(grid, c, c), (0.5 + 5.0) / 40.0)
        self.assertEqual(brush.weight(grid, -1.0, -1.0), 0.0)
        self.assertEqual(brush.weight(grid, 9.0, 9.0), grid.vals[-1])
        self.assertAlmostEqual(brush.weight(grid, 9.0, c / 2), 3 / 40.0)


class GridTest(unittest.TestCase):
    def test_validate(self):
        good = brush.Grid(brush.CELL, 2, 1, (0.0, 1.0))
        self.assertIs(brush.validate(good), good)
        for bad in (brush.Grid(0.05, 2, 1, (0.0, 1.0)), brush.Grid(brush.CELL, 2, 2, (0.0, 1.0)),
                    brush.Grid(brush.CELL, 2, 1, (0.0, 1.5)),
                    brush.Grid(brush.CELL, 2, 1, (-0.1, 0.5))):
            with self.subTest(grid=bad):
                with self.assertRaises(ValueError):
                    brush.validate(bad)

    def test_json_form_and_digest(self):
        grid = brush.Grid(brush.CELL, 2, 1, (0.25, 0.5))
        self.assertEqual(grid.as_json(), {"cell": 0.02, "nx": 2, "ny": 1, "vals": [0.25, 0.5]})
        self.assertEqual(grid.digest(), hashlib.sha256(json.dumps(
            [0.25, 0.5], separators=(",", ":")).encode("utf-8")).hexdigest()[:16])


if __name__ == "__main__":
    unittest.main()
