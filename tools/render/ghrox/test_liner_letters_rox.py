# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX11 section/extent independence against the actual shipping constructors."""
import copy
import json
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest

import numpy as np

import liner_letters_rox as letters


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


class LinerLettersTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.definition = json.loads((REPO / 'docs/geometry/rasson-ox-9ft-table-definition.json').read_text())
        cls.rows = {r['id']: r for r in cls.definition['features']}
        ref = json.loads((HERE / 'align/pocket-reference-rox.json').read_text())
        K = np.asarray(ref['letters']['PF-01']['playfield_mm']) / 2
        nose = np.asarray(ref['a1']['nose_xy_mm'])
        corner = K + np.asarray(ref['letters']['CP-12']['model_axis_xy_mm']) - nose
        side = np.asarray(ref['letters']['SP-12']['model_axis_xy_mm']) + [0, K[1] - nose[1]]
        cls.reference = SimpleNamespace(model_nose=nose, axis=lambda kind: corner if kind == 'corner' else side,
                                        bed=ref['a1']['bed_z_mm'])
        script = r"""
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { construct, TABLE_PATH } from './tools/render/ghrox/runtime_geometry_rox.mjs';
const source = fs.readFileSync(TABLE_PATH, 'utf8');
const once = (needle, replacement) => {
  assert.equal(source.split(needle).length, 2); return source.replace(needle, replacement);
};
const sweep = 'function roxLinerSweep(centre, radius, dir, angle, ends) {';
const variants = {
  current: {},
  model_kernel: {kernelOverride: {cornerMouth: .1022, sideMouth: .1215}},
  contact: {kernelOverride: {cornerMouth: .1}},
  model_section: {source: once(sweep, sweep + '\n  return point => point.clone();')},
  thick: {source: once('const ROX_CUP_WALL = 1.07;', 'const ROX_CUP_WALL = 3.07;')},
};
const output = {};
for (const [name, variant] of Object.entries(variants)) {
  const {G, meshes} = construct(variant);
  output[name] = {kernel: G.kernel, meshes: meshes.filter(m => /-cup-(c|ring)$/.test(m.name))
    .map(m => ({name: m.name, positions: m.raw_positions}))};
}
console.log(JSON.stringify(output));
"""
        run = subprocess.run(['node', '--input-type=module', '-'], input=script, text=True,
                             capture_output=True, cwd=REPO, check=True)
        cls.fixtures = json.loads(run.stdout)

    def reads(self, fixture):
        result = []
        for mesh in fixture['meshes']:
            kind, tag = mesh['name'].split('-')[3:5]
            law = letters.expected(kind, fixture['kernel'], self.rows, self.reference)
            v = np.asarray(mesh['positions']).reshape(-1, 3)[:, [0, 2, 1]] * 1000
            v[:, 0] *= -1 if kind == 'corner' and tag.startswith('nx') else 1
            v[:, 1] *= -1 if tag.endswith('nz') else 1
            result.append((tag, law, letters.observe(v, kind, law)))
        return result

    def assert_section_passes(self, law, read):
        model = law['model_section']
        self.assertLess(abs(read['section_width_mm'] - model['wall_thickness_mm']), letters.SECTION_TOL_MM)
        self.assertLess(abs(read['section_radius_mm'] - model['inner_radius_mm']), letters.SECTION_TOL_MM)

    def test_current_six_pockets_match_independently_computed_end_sections(self):
        reads = self.reads(self.fixtures['current'])
        self.assertEqual(len(reads), 6)
        for tag, law, read in reads:
            with self.subTest(pocket=tag):
                self.assert_section_passes(law, read)
                self.assertLess(abs(read['swept']['extent_deg'] - law['expected_extent_deg']), .002)
                self.assertLess(read['swept']['endpoint_max_error_mm'], .002)
                self.assertEqual(law['source_tag'], 'DERIVED')
                self.assertEqual(law['model_section']['source_tag'], 'MODEL')
                if law['letter'] == 'CP-12':
                    self.assertEqual(law['model_section']['reference_arc_deg'], 229.8)
                    self.assertAlmostEqual(law['expected_extent_deg'], 235.156594, places=5)

    def test_reflections_share_one_rule(self):
        reads = [r for r in self.reads(self.fixtures['current']) if r[1]['letter'] == 'CP-12']
        self.assertEqual({r[0] for r in reads}, {'nxnz', 'pxnz', 'nxpz', 'pxpz'})
        self.assertEqual(len({r[2]['swept']['extent_deg'] for r in reads}), 1)

    def test_model_section_mouth_fails_derived_extent_without_failing_section(self):
        for tag, law, read in self.reads(self.fixtures['model_section']):
            with self.subTest(pocket=tag):
                self.assert_section_passes(law, read)
                self.assertGreater(read['swept']['endpoint_max_error_mm'], letters.SECTION_TOL_MM)
                if law['letter'] == 'CP-12':
                    # The untransported section is 229.8 about RC-32's axis.
                    # FIX2's different, immutable MODEL axis reads about 230.4;
                    # do not move that comparison axis to make the arm prettier.
                    ends = np.asarray(read['swept']['end_sections_xy_mm']).reshape(-1, 2)
                    section_arc = np.ptp(letters.bearings(ends, law['section_centre_xy_mm'], 'corner'))
                    self.assertAlmostEqual(section_arc, 229.8, places=3)
                    self.assertGreater(abs(read['swept']['extent_deg'] - law['expected_extent_deg']), letters.ANGLE_TOL_DEG)

    def test_wall_plus_two_refuses_even_if_extent_is_within_angle_band(self):
        for tag, law, read in self.reads(self.fixtures['thick']):
            with self.subTest(pocket=tag):
                self.assertGreater(abs(read['section_width_mm'] - law['model_section']['wall_thickness_mm']), 1.99)
                self.assertLess(abs(read['swept']['extent_deg'] - law['expected_extent_deg']), letters.ANGLE_TOL_DEG)

    def test_future_model_mouth_uses_its_kernel_and_contact_branch(self):
        for tag, law, read in self.reads(self.fixtures['model_kernel']):
            with self.subTest(pocket=tag):
                self.assert_section_passes(law, read)
                self.assertIn('intersects', law['branch'])
                self.assertLess(abs(read['swept']['extent_deg'] - law['expected_extent_deg']), .002)
                self.assertLess(read['swept']['endpoint_max_error_mm'], .002)

    def test_contact_span_can_change_without_changing_the_model_section(self):
        for tag, law, read in self.reads(self.fixtures['contact']):
            with self.subTest(pocket=tag):
                self.assert_section_passes(law, read)
                self.assertLess(abs(read['swept']['extent_deg'] - law['expected_extent_deg']), .002)
                self.assertLess(read['swept']['endpoint_max_error_mm'], .002)
                if law['letter'] == 'CP-12':
                    self.assertEqual(law['model_section']['reference_arc_deg'], 229.8)
                    self.assertGreater(abs(read['swept']['extent_deg'] - 229.8), letters.ANGLE_TOL_DEG)

    def test_endpoint_shift_cannot_redefine_expectation(self):
        fixture = copy.deepcopy(self.fixtures['current'])
        before = self.reads(fixture)
        for mesh in fixture['meshes']:
            v = np.asarray(mesh['positions']).reshape(-1, 4, 3)
            v[-1, :, 0] += .002
            mesh['positions'] = v.reshape(-1).tolist()
        for original, changed in zip(before, self.reads(fixture)):
            self.assertEqual(original[1], changed[1])
            self.assertGreater(changed[2]['swept']['endpoint_max_error_mm'], 1.99)

    def test_absent_kernel_is_named_refusal(self):
        with self.assertRaisesRegex(letters.LinerLetterRefused, 'LINER_EXPECTATION_REFUSED.*kernel'):
            letters.expected('corner', {}, self.rows, self.reference)

    def test_absent_or_nonfinite_section_is_named_refusal(self):
        law = self.reads(self.fixtures['current'])[0][1]
        for v in (np.zeros((0, 3)), np.full((12, 3), np.nan)):
            with self.assertRaisesRegex(letters.LinerLetterRefused, 'LINER_SECTION_REFUSED'):
                letters.observe(v, 'corner', law)

    def test_missing_corner_cannot_disappear_from_the_letters(self):
        fixture = self.fixtures['current']
        meshes = []
        for mesh in fixture['meshes'][1:]:
            v = np.asarray(mesh['positions']).reshape(-1, 3)[:, [0, 2, 1]] * 1000
            v[:, 2] += self.reference.bed
            meshes.append(dict(name=mesh['name'], V=v))
        dump = SimpleNamespace(meta=dict(kernel=fixture['kernel']), reference=self.reference, meshes=meshes,
                               comparison_vertices=lambda mesh, anchor: mesh['V'])
        result = letters.measure(dump, self.definition)
        missing = [r for r in result['records'] if r['observed'] is None]
        self.assertEqual(len(result['records']), 6)
        self.assertEqual(len(missing), 1)
        self.assertIn(fixture['meshes'][0]['name'], missing[0]['refusal'])


if __name__ == '__main__':
    unittest.main()
