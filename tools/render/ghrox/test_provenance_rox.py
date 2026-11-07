# Copyright (c) Meta Platforms, Inc. and affiliates.

"""One provenance rule for both positive measurements and negative observations."""
import copy
import json
import unittest

import provenance_rox as provenance


class ProvenanceTests(unittest.TestCase):
    def test_definition_has_consistent_tiers(self):
        provenance.check(json.loads(provenance.DEFINITION.read_text()))

    def test_model_tag_on_est_tier_refuses_by_letter(self):
        row = dict(id='CP-12', source=dict(tier='EST'), provenance_tag='MODEL(purchased OBJ)')
        with self.assertRaisesRegex(ValueError, 'PROVENANCE_TIER_REFUSED: CP-12.*MODEL.*EST'):
            provenance.check(dict(features=[row]))

    def test_model_tier_cannot_launder_an_estimate(self):
        row = dict(id='TEST', source=dict(tier='MODEL'), provenance_tag='EST(unmeasured)')
        with self.assertRaisesRegex(ValueError, 'PROVENANCE_TIER_REFUSED: TEST'):
            provenance.check(dict(features=[row]))

    def test_estimate_is_valid_when_both_tier_and_tag_say_est(self):
        row = dict(id='TEST', source=dict(tier='EST'), provenance_tag='EST(unmeasured)')
        self.assertEqual(provenance.check(dict(features=[row])), dict(EST=1))

    def test_negative_model_observation_is_not_relabelled_as_an_estimate(self):
        definition = json.loads(provenance.DEFINITION.read_text())
        row = copy.deepcopy(next(r for r in definition['features'] if r['id'] == 'EN-05'))
        self.assertEqual(row['source']['tier'], 'MODEL')
        provenance.check(dict(features=[row]))

    def test_photo_measurement_requires_a_matching_photo_tier(self):
        row = dict(id='RC-14', source=dict(tier='PHOTO'), provenance_tag='PHOTO(three named frames)')
        self.assertEqual(provenance.check(dict(features=[row])), dict(PHOTO=1))
        row['source']['tier'] = 'MFR'
        with self.assertRaisesRegex(ValueError, 'PROVENANCE_TIER_REFUSED: RC-14.*PHOTO.*MFR'):
            provenance.check(dict(features=[row]))

    def test_all_definition_sources_resolve_including_nested_sources(self):
        definition = json.loads(provenance.DEFINITION.read_text())
        result = provenance.source_fence(definition)
        self.assertTrue(result['passed'], result['failures'])
        self.assertGreater(result['source_count'], len(definition['features']))

    def test_source_replaced_with_prose_refuses_by_letter(self):
        definition = json.loads(provenance.DEFINITION.read_text())
        row = next(r for r in definition['features'] if r['id'] == 'CU-13')
        row['source'] = dict(tier='MODEL', doc='The old notes say this number is correct.')
        result = provenance.source_fence(definition)
        self.assertFalse(result['passed'])
        self.assertTrue(any(r['id'] == 'CU-13' and 'prose' in r['reason'] for r in result['failures']))

    def test_deleting_a_source_cannot_reduce_the_fence_inventory(self):
        definition = json.loads(provenance.DEFINITION.read_text())
        count = provenance.source_fence(definition)['source_count']
        next(r for r in definition['features'] if r['id'] == 'CU-13').pop('source')
        result = provenance.source_fence(definition)
        self.assertEqual(result['source_count'], count)
        self.assertFalse(result['passed'])
        self.assertTrue(any(r['id'] == 'CU-13' for r in result['failures']))

    def test_repo_pointer_to_notes_is_still_prose(self):
        definition = json.loads(provenance.DEFINITION.read_text())
        index = next(i for i, r in enumerate(definition['features']) if r['id'] == 'CU-12')
        row = next(r for r in definition['features'] if r['id'] == 'CU-13')
        row['source']['refs'] = [dict(path=str(provenance.DEFINITION.relative_to(provenance.REPO)),
                                     pointer=f'/features/{index}/notes')]
        result = provenance.source_fence(definition)
        self.assertFalse(result['passed'])
        self.assertTrue(any('prose is not a source record' in r['reason'] for r in result['failures']))

    def test_bad_sources_cannot_fall_back_to_a_description(self):
        definition = json.loads(provenance.DEFINITION.read_text())
        row = next(r for r in definition['features'] if r['id'] == 'CU-13')
        for ref in [dict(path='tools/render/ghrox/missing-source.json'),
                    dict(path='../outside-repo.json'), dict(document='unnamed photo'),
                    dict(path='docs/geometry/rasson-ox-9ft-a1-station-records.json', pointer='/records/missing'),
                    dict(path=str(provenance.DEFINITION.relative_to(provenance.REPO)), feature='CU-13')]:
            with self.subTest(ref=ref):
                row['source']['refs'] = [ref]
                result = provenance.source_fence(definition)
                self.assertFalse(result['passed'])
                self.assertTrue(any(r['id'] == 'CU-13' for r in result['failures']))

    def test_nested_source_prose_cannot_hide_behind_its_parent_source(self):
        definition = json.loads(provenance.DEFINITION.read_text())
        row = next(r for r in definition['features'] if r['id'] == 'RB-09b')
        row['value']['wpa_comparison']['ball_scaled']['source'] = 'see old notes'
        result = provenance.source_fence(definition)
        self.assertFalse(result['passed'])
        self.assertTrue(any(r['id'] == 'RB-09b' for r in result['failures']))


if __name__ == '__main__':
    unittest.main()
