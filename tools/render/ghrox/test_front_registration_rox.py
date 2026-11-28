# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX5 asymmetric MODEL front registration, without a purchased-model fixture."""
import copy
import json
import unittest

import numpy as np

import front_registration_rox as front
import lower_letters_rox as letters


class FrontRegistrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.definition = json.loads(letters.DEFINITION.read_text())
        cls.inline = letters.TABLE.read_text()

    def test_retired_rule_is_retained_only_as_a_historical_control(self):
        result = front.derived(self.definition)
        self.assertEqual(result['cushion_back_mm'], 48.072)
        self.assertEqual(result['wall_thickness_mm'], 1.07)
        self.assertEqual(result['inward_offset_mm'], result['wall_thickness_mm'] / 2)
        self.assertEqual(result['front_back_mm'], result['cushion_back_mm'] - result['inward_offset_mm'])

    def test_current_runtime_has_declared_source(self):
        front.check_runtime(self.definition, self.inline)

    def test_restoring_half_wall_rule_refuses(self):
        with self.assertRaisesRegex(ValueError, 'CP-15d_REFUSED: retired half-wall rule'):
            front.check_runtime(self.definition, self.inline + '\nconst frontBack = E.CW - ROX_CUP_WALL / 2;')

    def test_missing_runtime_citation_refuses(self):
        with self.assertRaisesRegex(ValueError, 'CP-15d_REFUSED: runtime MODEL lines or citation'):
            front.check_runtime(self.definition, self.inline.replace('CP-15d', 'unattributed'))

    def test_changed_runtime_wall_refuses(self):
        with self.assertRaisesRegex(ValueError, 'CP-15d_REFUSED: runtime CP-12 wall'):
            front.check_runtime(self.definition, self.inline.replace('const ROX_CUP_WALL = 1.07;', 'const ROX_CUP_WALL = 1.08;'))

    def test_est_tier_cannot_carry_a_model_tag(self):
        changed = copy.deepcopy(self.definition)
        next(row for row in changed['features'] if row['id'] == 'CP-15d')['source']['tier'] = 'EST'
        with self.assertRaisesRegex(ValueError, 'PROVENANCE_TIER_REFUSED: CP-15d.*MODEL.*EST'):
            front.check_runtime(changed, self.inline)

    def test_changed_model_leaf_refuses(self):
        changed = copy.deepcopy(self.definition)
        next(row for row in changed['features'] if row['id'] == 'CP-15d')['value_mm']['front_lines']['short']['intercept_mm'] += .01
        with self.assertRaisesRegex(ValueError, 'CP-15d_REFUSED: runtime MODEL line differs'):
            front.check_runtime(changed, self.inline)

    def test_both_sides_retain_independent_model_station_lines(self):
        row = next(r for r in self.definition['features'] if r['id'] == 'CP-15d')
        lines = row['value_mm']['front_lines']
        self.assertNotEqual(lines['long'], lines['short'])
        self.assertEqual(row['source']['tier'], 'MODEL')
        for side, column in (('long', 1), ('short', 0)):
            stations = row['model_station_audit']['stations']
            read = front.line_read([s[side + '_xy_mm'] for s in stations], column, front.derived(self.definition)['front_back_mm'])
            self.assertEqual(lines[side], {key: read[key] for key in ('intercept_mm', 'slope')})
            self.assertEqual([s['radius_mm'] for s in stations], list(front.RADII_MM))
            self.assertTrue(all(s['station_ids'][side].startswith('CP-15d-' + side) for s in stations))
        for key in ('obj_sha256', 'fixed_reference_sha256', 'scalar_observations_sha256', 'measurement_log_sha256'):
            self.assertEqual(len(row['provenance_table'][key]), 64)

    def test_symmetric_substitute_line_is_refused(self):
        changed = copy.deepcopy(self.definition)
        lines = next(r for r in changed['features'] if r['id'] == 'CP-15d')['value_mm']['front_lines']
        lines['short'] = copy.deepcopy(lines['long'])
        with self.assertRaisesRegex(ValueError, 'CP-15d_REFUSED: runtime MODEL line differs'):
            front.check_runtime(changed, self.inline)

    def test_line_fit_and_registration_residual_are_distinct(self):
        first = front.line_read([[0., 1.], [1., 2.], [2., 3.]], 1, 1.)
        second = front.line_read([[0., 1.5], [1., 2.5], [2., 3.5]], 1, 1.)
        self.assertLess(first['rms_mm'], 1e-12)
        self.assertLess(second['rms_mm'], 1e-12)
        self.assertEqual(first['derived_minus_model_max_abs_mm'], 2.)
        self.assertEqual(second['derived_minus_model_max_abs_mm'], 2.5)

    def test_projection_clips_in_height_not_angular_domain(self):
        tri = np.asarray([[[0., 0., -1.], [1., 0., 1.], [0., 1., 1.]]])
        clipped = front.clip_above(tri, 0.)
        self.assertEqual(clipped.shape, (2, 3, 3))
        self.assertTrue(np.all(clipped[:, :, 2] >= 0))

    def test_analytic_circle_read_has_exact_radius(self):
        tri = np.asarray([[[0., 0., 2.], [2., 0., 2.], [0., 2., 2.]]])
        hits = front.circle_hits(tri, np.asarray([0., 0.]), 1.)
        self.assertEqual(len(hits), 2)
        np.testing.assert_allclose(np.linalg.norm(hits, axis=1), 1., atol=1e-12)


if __name__ == '__main__':
    unittest.main()
