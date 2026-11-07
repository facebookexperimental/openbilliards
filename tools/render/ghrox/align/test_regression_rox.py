# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Max-only regression semantics; no purchased-model fixture is required."""
import copy
import unittest

import regression_rox as r


class RegressionTests(unittest.TestCase):
    def test_held_value_fires(self):
        row = r.max_row(20.49, regression=True)
        self.assertEqual(row['verdict'], 'RED')
        self.assertTrue(row['fired'])

    def test_limit_is_green_not_a_fired_arm(self):
        self.assertEqual(r.max_row(2.07)['verdict'], 'GREEN')
        self.assertFalse(r.max_row(2.07, regression=True)['fired'])

    def test_different_red_is_not_the_held_control(self):
        self.assertEqual(r.max_row(9.45, regression=True)['verdict'], 'RED')
        self.assertFalse(r.max_row(9.45, regression=True)['fired'])

    def test_missing_and_nonfinite_cannot_fire_or_pass(self):
        for value in (None, float('nan'), float('inf'), -float('inf')):
            with self.subTest(value=value):
                row = r.max_row(value, regression=True)
                self.assertEqual(row['verdict'], 'RED')
                self.assertFalse(row['fired'])

    def fixture(self):
        result = {}
        for label, value in (('before', 2.09), ('held', 20.49), ('fixed', 2.07)):
            result[label] = {'elements': {
                'side_above': {'ours_to_model': {'max': value}},
                'corner_above': {'ours_to_model': {'median': .38, 'p90': 1.16, 'max': 2.48},
                                 'model_to_ours': {'median': .47, 'p90': 1.27, 'max': 2.23}}}}
        return result

    def test_all_required_rows_pass(self):
        self.assertTrue(r.judge(self.fixture())['ok'])

    def test_baseline_red_is_disclosed_not_waived(self):
        result = r.judge(self.fixture())
        self.assertEqual(result['rows']['before']['verdict'], 'RED')
        self.assertTrue(result['before_reproduced'])

    def test_legacy_22p27_is_not_the_fixed_datum_replay(self):
        self.assertFalse(r.max_row(22.27, regression=True)['fired'])
        self.assertTrue(r.max_row(22.27, regression=True, protocol=r.LEGACY_PROTOCOL)['fired'])
        data = self.fixture()
        data['before']['elements']['side_above']['ours_to_model']['max'] = 2.07
        data['held']['elements']['side_above']['ours_to_model']['max'] = 22.27
        self.assertFalse(r.judge(data)['ok'])
        self.assertTrue(r.judge(data, protocol=r.LEGACY_PROTOCOL)['ok'])

    def test_green_median_p90_cannot_hide_fixed_maximum(self):
        data = self.fixture()
        data['fixed']['elements']['side_above']['ours_to_model'].update(median=.39, p90=1.28, max=22.27)
        self.assertFalse(r.judge(data)['ok'])

    def test_pre_a4_and_corner_changes_are_not_silently_accepted(self):
        data = self.fixture()
        data['before']['elements']['side_above']['ours_to_model']['max'] = 2.08
        self.assertFalse(r.judge(data)['ok'])
        data = copy.deepcopy(self.fixture())
        data['fixed']['elements']['corner_above']['ours_to_model']['p90'] = 1.17
        self.assertFalse(r.judge(data)['ok'])


if __name__ == '__main__':
    unittest.main()
