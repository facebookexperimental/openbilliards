# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Construction-derived seam locations; synthetic geometry, no purchased mesh."""
import unittest

from evidence_deps_rox import require_evidence_deps
require_evidence_deps()

import numpy as np
from shapely.geometry import LineString, Point

import corner_seam_current_rox as seam
import planlaw_rox as law


class LocationTests(unittest.TestCase):
    def setUp(self):
        theta = np.radians(np.linspace(-115, 115, 79))
        self.inner = np.c_[np.cos(theta), np.sin(theta)] * 5
        self.outer = self.inner * 1.2
        self.top = np.array([[-12, -12, 43], [12, -12, 43], [12, 12, 43], [-12, 12, 43]])
        v = np.arange(-20, 20, .5) + .25
        self.x, self.y = np.meshgrid(v, v)

    def domain(self, inner=None, outer=None, top=None):
        return seam.high_domain(self.inner if inner is None else inner,
            self.outer if outer is None else outer, [self.top if top is None else top],
            0, self.x, self.y)[0]

    def test_census_does_not_select_by_tested_heights(self):
        high = self.domain()
        low = self.top.copy()
        low[:, 2] = -150
        self.assertTrue(high.any())
        np.testing.assert_array_equal(high, self.domain(top=low))

    def test_witnesses_follow_construction_translation(self):
        moved = self.domain(self.inner + [.5, 0], self.outer + [.5, 0], self.top + [.5, 0, 0])
        np.testing.assert_array_equal(np.roll(self.domain(), 1, axis=1), moved)

    def test_transporting_the_end_moves_the_witness_set(self):
        inner, outer = self.inner.copy(), self.outer.copy()
        inner[:3] += [0, -1]
        outer[:3] += [0, -1]
        self.assertFalse(np.array_equal(self.domain(), self.domain(inner, outer)))

    def test_missing_required_mesh_refuses_instead_of_reducing_census(self):
        with self.assertRaisesRegex(ValueError, 'SEAM_INVENTORY_REFUSED'):
            seam.construction({}, 'pxpz')


class JunctionTests(unittest.TestCase):
    def test_gap_domain_includes_empty_space_and_names_exact_clearance(self):
        bridge, row = seam.junction_domain(np.array([[0., 0.], [0., 1.]]), LineString([[7, -1], [7, 2]]))
        self.assertEqual(row['gap_mm'], 7)
        self.assertEqual(row['bridge_area_mm2'], 7)
        self.assertTrue(bridge.contains(Point(3.5, .5)))

    def test_closed_contact_is_zero_area_with_zero_clearance(self):
        bridge, row = seam.junction_domain(np.array([[0., 0.], [0., 1.]]), LineString([[0, -1], [0, 2]]))
        self.assertEqual(bridge.area, 0)
        self.assertEqual(row['gap_mm'], 0)

    def test_subpixel_width_does_not_hide_a_long_open_junction(self):
        bridge, row = seam.junction_domain(np.array([[0., .1], [0., .2]]), LineString([[7, 0], [7, 1]]))
        self.assertLess(bridge.bounds[3] - bridge.bounds[1], 1 / law.PPM)
        self.assertGreater(row['gap_mm'], law.LAW['a'])

    def test_original_slit_limit_still_refuses_five_pan_cells(self):
        domain = np.ones((1, 5), bool)
        z = np.full(domain.shape, law.BED - 150)
        arrays = [None, None, z, None, None, None, domain, domain]
        score, passed = seam.exposure(domain, arrays)
        self.assertEqual(score['SLIT_mm2'], 1.25)
        self.assertFalse(passed)
        domain[0, -1] = False
        score, passed = seam.exposure(domain, arrays)
        self.assertEqual(score['SLIT_mm2'], 1)
        self.assertTrue(passed)


if __name__ == '__main__':
    unittest.main()
