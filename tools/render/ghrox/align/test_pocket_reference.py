# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX2 reference admission and datum separation; no purchased geometry fixture."""
import copy
from dataclasses import FrozenInstanceError
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import ours
import pocket_reference as ref

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import letters_rox


class ReferenceTests(unittest.TestCase):
    def setUp(self):
        self.raw = ref.DEFAULT.read_bytes()
        self.record = ref.decode_record(self.raw)
        # Geometry is not a unit-test fixture; actual source/cache checks are
        # exercised by every real CLI replay. Admission IO is mocked here.
        with patch.object(ref, 'require_file'):
            self.reference = ref.load()

    def assert_refused(self, name, action):
        with self.assertRaises(ref.ReferenceRefused) as caught:
            action()
        self.assertEqual(caught.exception.name, name)

    def test_record_hash_and_immutable_transport(self):
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), ref.REFERENCE_SHA256)
        np.testing.assert_allclose(self.reference.axis('corner'), (1302.328, 666.763), atol=1e-10, rtol=0)
        np.testing.assert_allclose(self.reference.axis('side'), (.38, 684.577), atol=1e-10, rtol=0)
        with self.assertRaises(FrozenInstanceError):
            self.reference.bed = 0

    def test_missing_reference_refuses_before_dump_or_model_read(self):
        with tempfile.TemporaryDirectory(prefix='rox-ref-test-') as tmp:
            absent = Path(tmp) / 'absent.json'
            self.assert_refused('REFERENCE_MISSING', lambda: ours.Dump('also-absent.json', reference_path=absent))

    def test_ours_fitted_is_refused_by_name_not_generic_hash(self):
        self.record['origin'] = 'OURS-fitted'
        self.assert_refused('REFERENCE_OURS_FITTED_REFUSED', lambda: ref.decode_record(json.dumps(self.record).encode()))

    def test_other_origin_and_bad_hash_fail_closed(self):
        self.record['origin'] = 'unknown'
        self.assert_refused('REFERENCE_ORIGIN_REFUSED', lambda: ref.decode_record(json.dumps(self.record).encode()))
        self.assert_refused('REFERENCE_HASH_MISMATCH', lambda: ref.decode_record(self.raw + b' '))

    def test_missing_or_changed_source_has_no_fallback(self):
        with tempfile.TemporaryDirectory(prefix='rox-ref-test-') as tmp:
            path = Path(tmp) / 'source.txt'
            self.assert_refused('REFERENCE_INPUT_MISSING', lambda: ref.require_file(path, 'bad', 'test source'))
            self.assert_refused('REFERENCE_INPUT_HASH_MISMATCH', lambda: ref.require_file(ref.DEFAULT, 'bad', 'test source'))

    def test_letter_binding_is_numeric_not_provenance_revision(self):
        definition = json.loads(ref.DEFINITION.read_bytes())
        definition['doc']['revision'] = 'provenance-only-test'
        for row in definition['features']:
            if row['id'] == 'SP-12':
                row['tier'] = 'MODEL'
        ref.validate_bindings(self.record, definition)
        row = next(r for r in definition['features'] if r['id'] == 'CP-12')
        row['value_mm']['inner_wall_circle']['centre_xy_model_mm'][0] += .1
        self.assert_refused('REFERENCE_LETTER_MISMATCH', lambda: ref.validate_bindings(self.record, definition))

    def test_absent_letter_and_changed_model_station_refused(self):
        definition = json.loads(ref.DEFINITION.read_bytes())
        definition['features'] = [r for r in definition['features'] if r['id'] != 'CP-12']
        self.assert_refused('REFERENCE_LETTER_MISSING', lambda: ref.validate_bindings(self.record, definition))
        definition = json.loads(ref.DEFINITION.read_bytes())
        with patch.object(ref.objsoup, 'NX', 0):
            self.assert_refused('REFERENCE_MODEL_DATUM_MISMATCH', lambda: ref.validate_bindings(self.record, definition))

    def dump(self, kind='corner'):
        d = ours.Dump.__new__(ours.Dump)
        d.reference = self.reference
        d.y_bed_o = 0.0
        d.datums = dict(bed=ref.objsoup.BEDTOP, K=(1270.01, 635.02), x_nose=1270.01, y_nose=635.02,
                        cup_corner=self.reference.axis('corner'), cup_side=self.reference.axis('side'), sentinel='non-pocket unchanged')
        axis = np.array(self.reference.axis(kind))
        angles = np.linspace(-2.0, 2.0, 13)
        radius = 44.167 if kind == 'corner' else 48.93
        wall = []
        for angle in angles:
            ray = np.array([np.cos(angle), np.sin(angle)])
            for r, z in ((radius, -24), (radius, 46), (radius + 1.07, 46), (radius + 1.07, -24)):
                xy = axis + r * ray
                wall.append([*xy, ref.objsoup.BEDTOP + z])
        name = 'dm-pocket-rox-corner-pxpz-cup-c' if kind == 'corner' else 'dm-pocket-rox-side-pz-cup-ring'
        d.meshes = [dict(name=name, V=np.array(wall), F=np.array([[0, 1, 2], [0, 2, 3]]))]
        return d

    def test_floor_pan_absence_and_remesh_cannot_move_reference(self):
        for kind, tag in (('corner', 'pxpz'), ('side', 'pz')):
            d = self.dump(kind)
            before = letters_rox.Meas(d).cup(kind, tag)
            d.meshes += [dict(name=f'dm-pocket-rox-{kind}-{tag}-cup-floor', V=np.ones((307, 3)) * 9876),
                         dict(name=f'dm-pocket-rox-{kind}-{tag}-pan', V=np.ones((11, 3)) * -4321)]
            self.assertEqual(before, letters_rox.Meas(d).cup(kind, tag))
            self.assertEqual(d.comparison_datums('cup_' + kind)['cup_' + kind], self.reference.axis(kind))

    def test_non_pocket_datums_and_triangles_are_unchanged(self):
        d = self.dump()
        self.assertIs(d.comparison_datums('nose_long'), d.datums)
        np.testing.assert_array_equal(d.comparison_tris('nose_long'), d.tris())
        self.assertEqual(d.comparison_datums('cup_corner')['K'], (1270, 635))
        self.assertEqual(d.datums['K'], (1270.01, 635.02))

    def test_bed_observation_does_not_rezero_pocket_world(self):
        d = self.dump()
        original = d.comparison_tris('cup_corner')
        d.y_bed_o = .007
        for mesh in d.meshes:
            mesh['V'][:, 2] -= 7  # same raw world points after legacy bed re-zero
        np.testing.assert_allclose(d.comparison_tris('cup_corner'), original, atol=1e-10)
        self.assertEqual(d.comparison_datums('cup_corner')['bed'], self.reference.bed)

    def test_physical_wall_move_is_observed_not_fitted_away(self):
        d = self.dump()
        before = letters_rox.Meas(d).cup('corner', 'pxpz')
        d.meshes[0]['V'][:, 0] += 2
        after = letters_rox.Meas(d).cup('corner', 'pxpz')
        self.assertEqual(before['axis'], after['axis'])
        self.assertNotEqual(before['r_in'], after['r_in'])
        obs = d.observe_wall_axis(d.meshes[0]['name'], 'corner')
        self.assertAlmostEqual(obs['delta_norm_mm'], 2, places=8)

    def test_injected_fitted_axis_is_refused_at_consumer(self):
        d = self.dump()
        d.datums['cup_corner'] = (1301, 666)
        self.assert_refused('REFERENCE_OURS_FITTED_REFUSED', lambda: letters_rox.Meas(d).cup('corner', 'pxpz'))

    def test_missing_wall_is_absent_not_model_substitution(self):
        d = self.dump()
        d.meshes = []
        self.assertIsNone(letters_rox.Meas(d).cup('corner', 'pxpz'))
        self.assertIsNone(d.observe_wall_axis('absent', 'corner')['axis_xy_mm'])
        self.assertEqual(d.comparison_datums('cup_corner')['cup_corner'], self.reference.axis('corner'))

    def test_deepcopy_for_existing_geometry_arms(self):
        d = self.dump()
        clone = copy.deepcopy(d)
        self.assertEqual(clone.reference, d.reference)
        self.assertEqual(letters_rox.Meas(clone).cup('corner', 'pxpz'), letters_rox.Meas(d).cup('corner', 'pxpz'))


if __name__ == '__main__':
    unittest.main()
