# Copyright (c) Meta Platforms, Inc. and affiliates.

"""hillclimb_examples.training.train_v: a refit on the committed fixture and its export.

The tests need scikit-learn (a training extra) and are skipped without it. The fixture is small, so
the fit here lowers the rows per leaf and the tree count; the evaluator law does not depend on them.
"""

import importlib.util
import pathlib
import unittest

from hillclimb_examples.models import v
from hillclimb_examples.training import datagen, train_v

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "hillclimb_examples/training/fixtures"
HAVE_SKLEARN = importlib.util.find_spec("sklearn") is not None
HAVE_ROWS = (FIXTURES / "break-rows.jsonl").is_file()

#: Settings for the small fixture: trees that split on a few dozen rows.
SMALL = {"max_iter": 40, "min_samples_leaf": 3}


class SettingsTest(unittest.TestCase):
    def test_the_settings_of_the_shipped_fit(self):
        self.assertEqual(train_v.PARAMS, {
            "loss": "squared_error", "learning_rate": 0.05, "max_iter": 300,
            "max_leaf_nodes": 15, "min_samples_leaf": 40, "l2_regularization": 1.0,
            "max_bins": 255, "early_stopping": False})


@unittest.skipUnless(HAVE_SKLEARN and HAVE_ROWS, "needs scikit-learn and the committed fixture")
class FitTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = datagen.read_jsonl(FIXTURES / "break-rows.jsonl")
        cls.entries = datagen.read_jsonl(FIXTURES / "leaves.jsonl")
        cls.model = train_v.fit(cls.rows, params=SMALL)
        cls.trees = v.export(cls.model)

    def test_the_pure_evaluator_equals_scikit_learn(self):
        X, _ = train_v.design(self.rows)
        leaves = train_v.leaf_inputs(self.entries)
        self.assertTrue(leaves)
        self.assertEqual(train_v.check(self.trees, self.model, X), len(X))
        self.assertEqual(train_v.check(self.trees, self.model, leaves), len(leaves))
        self.assertTrue(any(len(t["f"]) > 1 for t in self.trees["trees"]), "no tree split")

    def test_labels_are_the_missed_share(self):
        _, y = train_v.design(self.rows)
        self.assertEqual(y, [1.0 - r["make"] / r["m"] for r in self.rows])
