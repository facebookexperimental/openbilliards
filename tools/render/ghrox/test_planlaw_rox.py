# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX3 semantics on synthetic cells: no purchased fixture or cache required."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
import planlaw_rox as p
import physical_rox as ref


class ExposureTests(unittest.TestCase):
    def measure(self, wedge_enabled=True, reference_change=None, missing=False):
        z = np.full((p.N, p.N), p.BED + 43.0)
        ids = np.full((p.N, p.N), -1, int)
        z[0, :7] = p.BED + np.array([0, -150, 0, -10, -150, 0, -150])
        ids[0, 0] = 0
        mz = np.full(z.shape, p.BED + 43.0)
        components = np.full(z.shape, 46524, int)
        mz[0, :7] = p.BED + np.array([0, 20, 40, 0, -60, -10, -151])
        components[0, :7] = [ref.SLAB, 46524, ref.RUBBER[0], ref.SLAB, ref.CUPS[0], ref.SLAB, ref.RETURN]
        if reference_change:
            reference_change(mz, components)
        wedge = np.zeros(z.shape, bool)
        wedge[0, 2] = wedge_enabled
        build = SimpleNamespace(ids=True, names=['dm-pocket-rox-test-shelf'], height=lambda pk: (z, ids))
        model = None if missing else SimpleNamespace(height=lambda pk: (mz, components))
        with patch.object(p, 'model_wedge', return_value=wedge):
            return p.exposed(build, 'middle', (-p.HALF, p.HALF, -p.HALF, p.HALF), {}, model)

    def test_literal_has_no_exemptions(self):
        e = self.measure()
        self.assertEqual(e['LITERAL_mm2'], 7 * p.CELL)
        self.assertEqual(e['shelf_patch_mm2'], p.CELL)

    def test_law_includes_physical_bed_and_face_not_just_caps(self):
        self.assertEqual(self.measure()['LAW_mm2'], 3 * p.CELL)

    def test_model_open_and_rubber_exclusions_are_named(self):
        e = self.measure()
        self.assertEqual(e['excluded_low_counts'], {'return': 1, 'cup': 1, 'notch': 1, 'rubber': 1, 'bed': 0, 'other': 0})

    def test_slit_is_reference_eligible_pan_only(self):
        self.assertEqual(self.measure()['SLIT_mm2'], p.CELL)

    def test_historical_wedge_cannot_change_new_law(self):
        a, b = self.measure(), self.measure(False)
        for key in ('LITERAL_mm2', 'LAW_mm2', 'SLIT_mm2', 'excluded_low_counts'):
            self.assertEqual(a[key], b[key])
        self.assertNotEqual(a['literal_wedge_low_mm2'], b['literal_wedge_low_mm2'])

    def test_band_boundary_inclusive(self):
        def at_band(z, c):
            z[0, 0] = p.BED - .5
        self.assertEqual(self.measure(reference_change=at_band)['LAW_mm2'], 3 * p.CELL)

    def test_below_band_excluded(self):
        def below(z, c):
            z[0, 0] = p.BED - .500001
        self.assertEqual(self.measure(reference_change=below)['LAW_mm2'], 2 * p.CELL)

    def test_missing_reference_refused_by_name(self):
        with self.assertRaisesRegex(ref.PhysicalReferenceRefused, 'MODEL_MISSING'):
            self.measure(missing=True)

    def test_no_hit_refuses_even_when_ours_is_high(self):
        def no_hit(z, c):
            c[1, 0] = -1
        with self.assertRaisesRegex(ref.PhysicalReferenceRefused, 'MODEL_NO_HIT'):
            self.measure(reference_change=no_hit)

    def test_nonfinite_reference_refuses(self):
        for value in (float('nan'), float('inf'), float('-inf'), -1e9):
            def invalid(z, c):
                z[0, 0] = value
            with self.subTest(value=value), self.assertRaisesRegex(ref.PhysicalReferenceRefused, 'MODEL_NO_HIT'):
                self.measure(reference_change=invalid)

    def test_ratchet_is_original_literal_seal(self):
        self.assertEqual(p.LITERAL_RATCHET, dict(middle=40.0, corner=133.0))


class RedArmTests(unittest.TestCase):
    def arm(self, mlaw=8.25, mslit=6.0, claw=10.25, cslit=6.75):
        exp = {'middle_px': dict(LAW_mm2=mlaw, SLIT_mm2=mslit),
               'corner_long': dict(LAW_mm2=claw, SLIT_mm2=cslit),
               'corner_short': dict(LAW_mm2=10.75, SLIT_mm2=5.0)}
        return p.a4_redarm('synthetic', exp)

    def test_accepted_c4_is_two_pocket_rejections(self):
        result = self.arm()
        self.assertTrue(result['ok'])
        self.assertEqual(result['fired'], 3)
        self.assertEqual(result['measured'], 4)
        self.assertEqual(result['must'], 2)
        self.assertEqual(result['required_pocket_rejections'], dict(middle=True, corner=True))
        self.assertEqual(result['rows'][0]['status'], 'CONTROL')
        self.assertFalse(result['rows'][0]['fired'])
        self.assertEqual(result['corner_worst_LAW_mm2'], 10.75)
        self.assertIn('INFO', result['old_four_row_matrix'])

    def test_all_four_red_still_pass(self):
        self.assertTrue(self.arm(10.25, 1.25, 10.25, 1.25)['ok'])

    def test_one_green_pocket_refuses(self):
        self.assertFalse(self.arm(10, 1, 10.25, 1.25)['ok'])
        self.assertFalse(self.arm(10.25, 1.25, 10, 1)['ok'])

    def test_no_nonfinite_control_can_hide_behind_red_slit(self):
        for value in (float('nan'), float('inf'), float('-inf')):
            with self.subTest(value=value):
                result = self.arm(mlaw=value)
                self.assertFalse(result['ok'])
                self.assertEqual(result['rows'][0]['status'], 'NOT MEASURED')


class SourcePolygonTests(unittest.TestCase):
    def test_concave_source_is_not_an_unsigned_fan(self):
        points = np.array([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]], float)
        triangles = ref.ear_clip(points)
        areas = [ref.cross2(points[b]-points[a], points[c]-points[a])/2 for a, b, c in triangles]
        self.assertEqual(len(triangles), 3)
        self.assertTrue(all(area > 0 for area in areas))
        self.assertAlmostEqual(sum(areas), 10.0)

    def test_clockwise_input_refused_not_fanned(self):
        with self.assertRaises(ref.PhysicalReferenceRefused):
            ref.ear_clip(np.array([[0, 0], [0, 1], [1, 0]], float))


if __name__ == '__main__':
    unittest.main()
