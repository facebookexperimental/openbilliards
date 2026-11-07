# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX3 lower-letter and ownership contracts, without a purchased-model fixture."""
import copy
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

from evidence_deps_rox import require_evidence_deps
require_evidence_deps()

import numpy as np
from shapely.geometry import LineString, box

import lower_letters_rox as letters
import lower_ownership_rox as ownership
import lower_profile_rox as profile
import planlaw_rox as law


class MeasuredLetterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rows = {f['id']: f for f in json.loads(letters.DEFINITION.read_text())['features']}
        cls.features = [rows[key] for key in letters.CONSTANTS]
        cls.inline = letters.TABLE.read_text()

    def test_live_constructor_consumes_exact_model_letters(self):
        letters.check_inline(self.features, self.inline)

    def test_changed_scalar_is_refused_by_letter_name(self):
        changed = copy.deepcopy(self.features)
        changed[1]['value']['stations'][0]['floor_inner_coeff'][0] += .01
        with self.assertRaisesRegex(ValueError, 'MODEL_LETTER_REFUSED.*PK-03x'):
            letters.check_inline(changed, self.inline)

    def test_missing_station_is_not_silently_interpolated(self):
        changed = copy.deepcopy(self.features)
        changed[0]['value']['stations'].pop()
        with self.assertRaisesRegex(ValueError, 'MODEL_LETTER_REFUSED.*CP-12x'):
            letters.check_inline(changed, self.inline)

    def test_missing_inline_consumer_refuses(self):
        with self.assertRaisesRegex(ValueError, 'MODEL_LETTER_REFUSED.*CP-12x'):
            letters.check_inline(self.features, '')

    def test_nonmodel_provenance_refuses(self):
        changed = copy.deepcopy(self.features)
        changed[2]['source']['tier'] = 'EST'
        with self.assertRaisesRegex(ValueError, 'MODEL_LETTER_REFUSED.*CP-14m-x'):
            letters.check_inline(changed, self.inline)

    def test_each_letter_has_obj_component_stations_and_tessellation(self):
        for feature, component in zip(self.features, (46557, 46557, 46537)):
            p = feature['provenance_table']
            self.assertEqual(p['connected_component_ids'], [component])
            self.assertEqual(p['component_labelling_rule'], letters.COMPONENT_LABELLING_RULE)
            self.assertEqual(len(p['obj_sha256']), 64)
            self.assertEqual(len(p['scalar_observations_sha256']), 64)
            self.assertEqual(p['stations_deg'], [s['phi_deg'] for s in feature['value']['stations']])
            self.assertFalse(p['original_vertices_faces_uv_or_pixels_exported'])
            self.assertIn('TESSELLATION', feature['tessellation'])

    def test_unreproducible_component_provenance_is_refused(self):
        changed = copy.deepcopy(self.features)
        del changed[0]['provenance_table']['component_labelling_rule']
        with self.assertRaisesRegex(ValueError, 'MODEL_LETTER_REFUSED: component labelling rule.*CP-12x'):
            letters.check_inline(changed, self.inline)

    def test_cup_station_chains_match_without_symmetrization(self):
        front, body = (f['value']['stations'] for f in self.features[:2])
        self.assertEqual([s['phi_deg'] for s in front], [s['phi_deg'] for s in body])
        self.assertEqual(len(front), 438)
        by_phi = {s['phi_deg']: s for s in front}
        self.assertNotEqual(by_phi[130.0]['profile_mm'], by_phi[-130.0]['profile_mm'])
        for s in front:
            if s['C_continues']:
                self.assertIsNone(s['profile_mm'])
                self.assertIsNone(s['rms_mm'])
            else:
                self.assertEqual(len(s['profile_mm']), 13)
                self.assertTrue(np.isfinite(s['rms_mm']))

    def test_notch_domain_keeps_partial_low_source_ends(self):
        stations = self.features[2]['value']['stations']
        present = [s for s in stations if s['physical_slab_section']]
        self.assertEqual(len(present), 126)
        self.assertTrue(any(s['source_top_mm'] < -.5 for s in present))
        self.assertTrue(any(s['upper_face_radius_mm'] is None for s in present))
        self.assertTrue(all(len(s['profile_mm']) == 33 for s in present))
        self.assertTrue(all(np.isfinite(s['rms_mm']) for s in present))


class SectionTests(unittest.TestCase):
    def test_notch_tangent_is_nearest_source_boundary_not_far_high_point(self):
        # phi=-45 points along +x; the far edge is deliberately slightly higher.
        perimeter = np.asarray([[3, -2, law.BED], [9, -2, law.BED + .0003],
                                [9, 2, law.BED + .0003], [3, 2, law.BED]])
        self.assertEqual(profile.radial_perimeter_hit(perimeter, np.asarray([0., 0.]), -45), (3., 0.))

    def test_missing_upper_perimeter_hit_does_not_invent_a_cap(self):
        perimeter = np.asarray([[3, 1, law.BED], [9, 1, law.BED], [9, 2, law.BED], [3, 2, law.BED]])
        self.assertIsNone(profile.radial_perimeter_hit(perimeter, np.asarray([0., 0.]), -45))

    def test_empty_section_intersection_is_a_finite_empty_result(self):
        self.assertEqual(profile.intersections(box(1, -2, 3, 0), 1, 4), [])

    def test_section_endpoints_sorted_and_bound(self):
        self.assertEqual(profile.intersections(box(1, -2, 3, 0), 1, -1), [(1., -1.), (3., -1.)])

    def test_straight_profile_independent_residual_zero(self):
        line = LineString([(1, -2), (1, 0)])
        measured = profile.sample_arc(line, 4)
        self.assertEqual(profile.residual(line, measured)['rms_mm'], 0)
        self.assertEqual(profile.residual(line, measured)['validation_samples'], 129)


class OwnershipTests(unittest.TestCase):
    def setUp(self):
        definition = json.loads(letters.DEFINITION.read_text())
        rows = {f['id']: f for f in definition['features']}
        self.pan_top = rows['PK-03']['value']['below_cup']['pan_top_z']['corner'] - law.BED
        self.ceilings = ownership.height_rules(definition)

    def witness(self, expected='cup_transition_or_floor'):
        return dict(id='ASYM-TEST', window='short', grid_ij=[0, 0], xy_mm=[44.25, -13.25],
                    model_part=expected, model_component=46557, model_top_z_bed_mm=-23.64)

    def read(self, expected='cup_transition_or_floor', name='dm-pocket-rox-corner-pxpz-pan', missing=False, height=None):
        z = self.pan_top if height is None else height
        b = SimpleNamespace(names=[name], height=lambda _: (np.asarray([[law.BED + z]]), np.asarray([[-1 if missing else 0]])))
        return ownership.census(b, [self.witness(expected)], self.ceilings)

    def test_asymmetric_cup_cell_refuses_symmetric_pan_by_name(self):
        with self.assertRaisesRegex(ownership.OwnershipRefused, 'SYMMETRIC_LOWER: OWNERSHIP_REFUSED.*ASYM-TEST'):
            ownership.require_ownership(self.read(), 'SYMMETRIC_LOWER')

    def test_return_cover_refuses_even_without_area_row(self):
        with self.assertRaisesRegex(ownership.OwnershipRefused, 'NO_RETURN_COVER: OWNERSHIP_REFUSED'):
            ownership.require_ownership(self.read('lower_return', 'dm-pocket-rox-corner-pxpz-cover-pan', height=-24.1), 'NO_RETURN_COVER')

    def test_renaming_cover_cannot_bypass_the_return_height(self):
        for name in ('dm-pocket-rox-cover-pan', 'dm-pocket-rox-cup-cover', 'dm-pocket-rox-cap-cover', 'anonymous'):
            with self.subTest(name=name):
                rows = self.read('lower_return', name, height=-24.1)
                self.assertFalse(rows[0]['height_owner_match'])
                self.assertEqual(rows[0]['return_ceiling_PK03_mm'], self.pan_top)
                with self.assertRaisesRegex(ownership.OwnershipRefused, 'above PK-03 lower_return ceiling'):
                    ownership.require_ownership(rows, 'NO_RETURN_COVER')

    def test_actual_return_datum_is_a_positive_control(self):
        rows = self.read('lower_return')
        self.assertTrue(rows[0]['height_owner_match'])
        ownership.require_ownership(rows, 'positive return')

    def test_missing_return_height_is_refused(self):
        self.ceilings['lower_return']['ceiling_z_bed_mm'] = float('nan')
        with self.assertRaisesRegex(ownership.OwnershipRefused, 'missing source height ceiling lower_return'):
            ownership.census(SimpleNamespace(), [], self.ceilings)

    def test_cup_and_notch_names_cannot_excuse_a_sheet_below_upper_band(self):
        for part, name in (('cup_transition_or_floor', 'dm-pocket-rox-cup-cover-sheet'),
                           ('curved_slab_notch', 'dm-pocket-rox-cut-cover-sheet')):
            with self.subTest(part=part):
                rows = self.read(part, name, height=20)
                self.assertTrue(rows[0]['semantic_owner_match'])
                self.assertFalse(rows[0]['height_owner_match'])
                with self.assertRaisesRegex(ownership.OwnershipRefused, 'ASYM-TEST.*mesh ' + name):
                    ownership.require_ownership(rows, 'LOWER_SOURCE_HEIGHT')

    def test_height_detection_uses_model_class_not_mesh_name(self):
        for part in ('cup_transition_or_floor', 'curved_slab_notch'):
            for name in ('anonymous', 'dm-cup-cover', 'dm-cut-cover', 'dm-cover-pan'):
                self.assertFalse(self.read(part, name, height=20)[0]['height_owner_match'])

    def test_measured_lower_class_envelopes_are_positive_controls(self):
        for part, name in (('cup_transition_or_floor', 'dm-cup-source'), ('curved_slab_notch', 'dm-cut-source')):
            rows = self.read(part, name, height=self.ceilings[part]['ceiling_z_bed_mm'])
            ownership.require_ownership(rows, 'MODEL envelope control')

    def test_missing_measured_profile_height_refuses(self):
        definition = json.loads(letters.DEFINITION.read_text())
        row = next(r for r in definition['features'] if r['id'] == 'CP-12x')
        row['value']['stations'] = []
        with self.assertRaisesRegex(ownership.OwnershipRefused, 'missing physical profile heights CP-12x'):
            ownership.height_rules(definition)

    def test_upper_cover_refused_without_flange_in_its_name(self):
        front = [dict(id='FRONT-TEST', grid_ij=[0, 0], xy=[0., 0.])]
        source_z = np.asarray([[law.BED]])
        source_ids = np.asarray([[46537]])
        for name in ('dm-pocket-rox-cap-cover', 'dm-pocket-rox-cover-pan', 'anonymous'):
            with self.subTest(name=name):
                build = SimpleNamespace(names=[name], height=lambda _: (np.asarray([[law.BED + 42.5]]), np.asarray([[0]])))
                bad = ownership.front_wrong(build, front, source_z, source_ids)
                self.assertEqual(len(bad), 1)
                self.assertEqual(bad[0]['ours_mesh'], name)
                self.assertEqual(bad[0]['model_owner'], 'bed')

    def test_low_front_is_not_rejected_for_its_flange_name(self):
        front = [dict(id='FRONT-TEST', grid_ij=[0, 0], xy=[0., 0.])]
        build = SimpleNamespace(names=['dm-flange'], height=lambda _: (np.asarray([[law.BED]]), np.asarray([[0]])))
        self.assertEqual(ownership.front_wrong(build, front, np.asarray([[law.BED]]), np.asarray([[46537]])), [])

    def test_upper_front_model_no_hit_refuses(self):
        front = [dict(id='FRONT-TEST', grid_ij=[0, 0], xy=[0., 0.])]
        build = SimpleNamespace(names=['dm-cap'], height=lambda _: (np.asarray([[law.BED]]), np.asarray([[0]])))
        with self.assertRaisesRegex(ownership.OwnershipRefused, 'MODEL no-hit cell FRONT-TEST'):
            ownership.front_wrong(build, front, np.asarray([[law.BED]]), np.asarray([[-1]]))

    def test_option_a_rubber_is_disclosed_not_assigned_to_cup(self):
        result = self.read('long_rubber')
        self.assertTrue(result[0]['row_a_domain'])
        self.assertFalse(result[0]['exact_owner_match'])
        ownership.require_ownership(result, 'positive')

    def test_no_hit_is_refused_not_an_owner(self):
        with self.assertRaisesRegex(ownership.OwnershipRefused, 'OWNERSHIP_REFUSED: OURS no-hit cell ASYM-TEST'):
            self.read(missing=True)

    def test_geometry_arm_clips_and_mirrors_only_measured_lower_parts(self):
        v = np.asarray([[1, 2, 0], [2, 3, 0], [0, 3, 0], [3, 1, 5], [4, 2, 5], [4, 1, 5]], float)
        f = np.asarray([[0, 1, 2], [0, 1, 2], [3, 4, 5]])
        names = ['dm-pocket-rox-corner-pxpz-cup-bucket-measured',
                 'dm-pocket-rox-corner-pxpz-cut-model-front', 'dm-fixed-upper']
        build = law.Build('synthetic', v, f, names, np.asarray([0, 1, 2]), [0, 0], [0, 0])
        mutant, triangles = ownership.symmetric_substitute(build, np.asarray([0., 0.]), True)
        self.assertEqual(triangles, 4)
        np.testing.assert_array_equal(mutant.V[mutant.F[mutant.ids == 2]], v[f[2:]])
        lower = mutant.V[mutant.F[mutant.ids == 0]]
        self.assertEqual(len(lower), 2)
        np.testing.assert_array_equal(lower[0][:, [1, 0, 2]], lower[1][::-1])


if __name__ == '__main__':
    unittest.main()
